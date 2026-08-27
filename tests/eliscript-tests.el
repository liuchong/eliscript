;;; eliscript-tests.el --- Tests for Eliscript -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'eliscript)

(ert-deftest eliscript-reader-reads-multiple-forms ()
  (should
   (equal (eliscript-read-string "; comment\n(defconst answer 42)\n(+ answer 1)")
          '((defconst answer 42) (+ answer 1)))))

(ert-deftest eliscript-reader-rejects-incomplete-input ()
  (should-error (eliscript-read-string "(defun broken (")
                :type 'eliscript-read-error))

(ert-deftest eliscript-emits-literals-and-data ()
  (should (equal (eliscript-emitter-emit-expression nil) "null"))
  (should (equal (eliscript-emitter-emit-expression t) "true"))
  (should (equal (eliscript-emitter-emit-expression 'false) "false"))
  (should (equal (eliscript-emitter-emit-expression [1 "two" :three])
                 "[1, \"two\", \"three\"]"))
  (should (equal (eliscript-emitter-emit-expression
                  '(object :name "Ada" :active t))
                 "({\"name\": \"Ada\", \"active\": true})")))

(ert-deftest eliscript-emits-functions-and-lexical-bindings ()
  (let ((output
         (eliscript-compile-string
          "(defun add-one (value) (let ((step 1)) (+ value step)))")))
    (should (string-match-p "function add_one(value)" output))
    (should (string-match-p
             (regexp-quote "((step) => {\n    return (value + step);\n  })(1)")
             output))))

(ert-deftest eliscript-preserves-lisp-truthiness ()
  (let ((output (eliscript-compile-string
                 "(print (if 0 \"truthy\" \"falsey\"))")))
    (should (string-match-p
             (regexp-quote
              "console.log((__eliscript_truthy(0) ? \"truthy\" : \"falsey\"));")
             output))))

(ert-deftest eliscript-emits-short-circuit-forms ()
  (let ((and-output (eliscript-emitter-emit-expression '(and a b c)))
        (or-output (eliscript-emitter-emit-expression '(or a b c))))
    (should (string-match-p "__eliscript_truthy" and-output))
    (should (string-match-p "__eliscript_truthy" or-output))
    (should-not (equal and-output or-output))))

(ert-deftest eliscript-emits-esm-imports-and-exports ()
  (let ((output
         (eliscript-compile-string
          "(import \"react\" :default React useState)\n(export React useState)")))
    (should (string-match-p
             (regexp-quote "import React, {useState} from \"react\";")
             output))
    (should (string-match-p
             (regexp-quote "export {React, useState};")
             output))))

(ert-deftest eliscript-emits-javascript-interop ()
  (should
   (equal
    (eliscript-emitter-emit-expression
     '(js-call [1 2 3] :map (lambda (value) (* value 2))))
    "([1, 2, 3])[\"map\"]((value) => {\n  return (value * 2);\n})"))
  (should
   (equal (eliscript-emitter-emit-expression '(get user :name "unknown"))
          "((user)[\"name\"] ?? \"unknown\")")))

(ert-deftest eliscript-rejects-invalid-arity ()
  (should-error (eliscript-emitter-emit-expression '(if t))
                :type 'eliscript-compile-error)
  (should-error (eliscript-emitter-emit-expression '(object :name))
                :type 'eliscript-compile-error))

(ert-deftest eliscript-handles-empty-list-operations ()
  (should (equal (eliscript-emitter-emit-expression '(car nil))
                 "(((null) ?? [])[0] ?? null)"))
  (should (equal (eliscript-emitter-emit-expression '(cdr nil))
                 "((null) ?? []).slice(1)"))
  (should (equal (eliscript-emitter-emit-expression '(cons 1 nil))
                 "[1, ...((null) ?? [])]")))

(ert-deftest eliscript-rejects-special-binding-names ()
  (should-error (eliscript-compile-string "(defvar nil 1)")
                :type 'eliscript-compile-error)
  (should-error (eliscript-compile-string "(defvar false 1)")
                :type 'eliscript-compile-error)
  (should-error (eliscript-compile-string "(defun f (&optional x) x)")
                :type 'eliscript-compile-error))

(ert-deftest eliscript-analyzer-resolves-module-and-lexical-bindings ()
  (let ((output
         (eliscript-compile-string
          "(defun first () (second))
(defun second () (let* ((value 1) (next (+ value 1))) next))
(export first second)")))
    (should (string-match-p "function first()" output))
    (should (string-match-p "function second()" output))))

(ert-deftest eliscript-analyzer-rejects-unbound-symbols ()
  (let ((error-data
         (should-error
          (eliscript-compile-string "(defun broken () missing)" "broken.eli")
          :type 'eliscript-analyze-error)))
    (should (string-match-p
             (regexp-quote "broken.eli: unbound symbol: missing")
             (error-message-string error-data)))))

(ert-deftest eliscript-analyzer-distinguishes-let-and-let-star ()
  (should-error
   (eliscript-compile-string
    "(defun broken () (let ((value 1) (next value)) next))")
   :type 'eliscript-analyze-error)
  (should
   (string-match-p
    "function valid()"
    (eliscript-compile-string
     "(defun valid () (let* ((value 1) (next value)) next))"))))

(ert-deftest eliscript-analyzer-rejects-duplicate-bindings ()
  (should-error
   (eliscript-compile-string "(defun duplicate (value value) value)")
   :type 'eliscript-analyze-error)
  (should-error
   (eliscript-compile-string "(let ((value 1) (value 2)) value)")
   :type 'eliscript-analyze-error))

(ert-deftest eliscript-analyzer-rejects-output-name-collisions ()
  (let ((error-data
         (should-error
          (eliscript-compile-string
           "(defconst foo-bar 1) (defconst foo_bar 2)")
          :type 'eliscript-analyze-error)))
    (should (string-match-p "collides with foo-bar"
                            (error-message-string error-data)))))

(ert-deftest eliscript-symbol-mapping-preserves-leading-digit-handling ()
  (should (equal (eliscript-symbol-binding-name '1value) "_1value")))

(ert-deftest eliscript-analyzer-validates-assignment-mutability ()
  (should-error
   (eliscript-compile-string "(defconst answer 42) (setq answer 43)")
   :type 'eliscript-analyze-error)
  (should
   (string-match-p
    "(answer = 43)"
    (eliscript-compile-string "(defvar answer 42) (setq answer 43)"))))

(ert-deftest eliscript-analyzer-validates-exports ()
  (should-error (eliscript-compile-string "(export missing)")
                :type 'eliscript-analyze-error))

(ert-deftest eliscript-analyzer-allows-qualified-javascript-references ()
  (should
   (string-match-p
    (regexp-quote "console.log(JSON.stringify(null));")
    (eliscript-compile-string "(print (JSON/stringify nil))"))))

(ert-deftest eliscript-expander-expands-user-macros ()
  (let ((output
         (eliscript-compile-string
          "(module macro.example
  (defmacro twice (value) `(+ ,value ,value))
  (defun double (value) (twice value)))")))
    (should (string-match-p
             (regexp-quote "return (value + value);")
             output))
    (should-not (string-match-p "defmacro\\|twice" output))))

(ert-deftest eliscript-expander-supports-body-parameters ()
  (let ((output
         (eliscript-compile-string
          "(defmacro begin (&body forms) `(progn ,@forms))
(defun two () (begin 1 2))")))
    (should (string-match-p "function two()" output))
    (should (string-match-p
             (regexp-quote "    1;\n    return 2;")
             output))))

(ert-deftest eliscript-expander-can-generate-top-level-declarations ()
  (let ((output
         (eliscript-compile-string
          "(defmacro define-answer () '(defconst answer 42))
(define-answer)
(export answer)")))
    (should (string-match-p "const answer = 42;" output))
    (should (string-match-p "export {answer};" output))))

(ert-deftest eliscript-expander-preserves-quoted-data ()
  (let ((output
         (eliscript-compile-string
          "(defmacro twice (value) `(+ ,value ,value))
(defconst syntax '(twice 1))")))
    (should (string-match-p
             (regexp-quote "const syntax = [\"twice\", 1];")
             output))))

(ert-deftest eliscript-expander-isolates-compilations ()
  (eliscript-compile-string "(defmacro twice (value) `(+ ,value ,value))")
  (should-error (eliscript-compile-string "(twice 1)")
                :type 'eliscript-analyze-error))

(ert-deftest eliscript-expander-rejects-runaway-expansion ()
  (should-error
   (eliscript-compile-string
    "(defmacro forever (value) `(forever ,value)) (forever 1)")
   :type 'eliscript-expand-error))

(ert-deftest eliscript-expander-reports-macro-failures-with-filename ()
  (let ((error-data
         (should-error
          (eliscript-compile-string
           "(defmacro boom () (error \"bad expansion\")) (boom)"
           "macro.eli")
          :type 'eliscript-expand-error)))
    (should (string-match-p
             (regexp-quote "macro.eli: macro boom failed: bad expansion")
             (error-message-string error-data)))))

(ert-deftest eliscript-expander-validates-expanded-code ()
  (should-error
   (eliscript-compile-string
    "(defmacro missing-reference () 'missing) (missing-reference)")
   :type 'eliscript-analyze-error))

(ert-deftest eliscript-expander-rejects-nested-definitions ()
  (should-error
   (eliscript-compile-string "(defun broken () (defmacro nested () 1))")
   :type 'eliscript-expand-error))

(provide 'eliscript-tests)

;;; eliscript-tests.el ends here
