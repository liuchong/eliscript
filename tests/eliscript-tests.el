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
  (should-error (eliscript-compile-string "(defvar false 1)")
                :type 'eliscript-compile-error)
  (should-error (eliscript-compile-string "(defun f (&optional x) x)")
                :type 'eliscript-compile-error))

(provide 'eliscript-tests)

;;; eliscript-tests.el ends here
