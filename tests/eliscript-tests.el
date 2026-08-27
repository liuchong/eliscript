;;; eliscript-tests.el --- Tests for Eliscript -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'cl-lib)
(require 'eliscript)

(defun eliscript-tests--legacy-compile-string (source &optional filename)
  "Compile SOURCE from FILENAME through the compatibility form emitter."
  (eliscript-emit-module
   (mapcar
    #'eliscript-form-strip
    (eliscript-analyze-module
     (eliscript-expand-module
      (eliscript-read-located-string source filename)
      filename)
     filename))))

(ert-deftest eliscript-reader-reads-multiple-forms ()
  (should
   (equal (eliscript-read-string "; comment\n(defconst answer 42)\n(+ answer 1)")
          '((defconst answer 42) (+ answer 1)))))

(ert-deftest eliscript-reader-rejects-incomplete-input ()
  (let ((error-data
         (should-error
          (eliscript-read-string "; comment\n(defun broken (" "reader.eli")
          :type 'eliscript-read-error)))
    (should (string-match-p
             (regexp-quote
              "reader.eli:2:1: unexpected end of input")
             (error-message-string error-data)))))

(ert-deftest eliscript-reader-locates-nested-forms ()
  (let* ((forms
          (eliscript-read-located-string
           "(defconst answer 42)\n\n(defun broken ()\n  missing)"
           "located.eli"))
         (function-form (nth 1 forms))
         (function-items (eliscript-form-value function-form))
         (missing-form (nth 3 function-items))
         (function-span (eliscript-form-span function-form))
         (missing-span (eliscript-form-span missing-form)))
    (should (= (eliscript-source-span-line function-span) 3))
    (should (= (eliscript-source-span-column function-span) 1))
    (should (= (eliscript-source-span-line missing-span) 4))
    (should (= (eliscript-source-span-column missing-span) 3))
    (should (equal (mapcar #'eliscript-form-strip forms)
                   '((defconst answer 42)
                     (defun broken () missing))))))

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
          (eliscript-compile-string
           "(defun broken ()\n  missing)"
           "broken.eli")
          :type 'eliscript-analyze-error)))
    (should (string-match-p
             (regexp-quote "broken.eli:2:3: unbound symbol: missing")
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
           "(defmacro boom () (error \"bad expansion\"))\n\n(boom)"
           "macro.eli")
          :type 'eliscript-expand-error)))
    (should (string-match-p
             (regexp-quote
              "macro.eli:3:1: macro boom failed: bad expansion")
             (error-message-string error-data)))))

(ert-deftest eliscript-expander-validates-expanded-code ()
  (let ((error-data
         (should-error
          (eliscript-compile-string
           "(defmacro missing-reference () 'missing)\n\n(missing-reference)"
           "expanded.eli")
          :type 'eliscript-analyze-error)))
    (should (string-match-p
             (regexp-quote
              "expanded.eli:3:1: unbound symbol: missing")
             (error-message-string error-data)))))

(ert-deftest eliscript-expander-rejects-nested-definitions ()
  (should-error
   (eliscript-compile-string "(defun broken () (defmacro nested () 1))")
   :type 'eliscript-expand-error))

(ert-deftest eliscript-lowerer-builds-explicit-ir ()
  (let* ((program
          (eliscript-compile-ir-string
           "(module ir.example
  (defconst answer 42)
  (defun choose (value)
    (let ((fallback answer))
      (if value value fallback)))
  (export choose))"
           "ir.eli"))
         (module (car (eliscript-ir-program-body program)))
         (declarations (eliscript-ir-node-children module))
         (constant (nth 0 declarations))
         (function (nth 1 declarations))
         (lexical-bindings
          (nth (eliscript-ir-property function :parameter-count)
               (eliscript-ir-node-children function)))
         (binding (car (eliscript-ir-node-children lexical-bindings)))
         (conditional
          (nth (eliscript-ir-property lexical-bindings :binding-count)
               (eliscript-ir-node-children lexical-bindings)))
         nodes-without-spans)
    (eliscript-ir-walk
     program
     (lambda (node)
       (unless (eliscript-ir-node-span node)
         (push node nodes-without-spans))))
    (should (eliscript-ir-program-p program))
    (should-not nodes-without-spans)
    (should (eq (eliscript-ir-node-kind module) 'module-declaration))
    (should (eq (eliscript-ir-node-kind constant) 'variable-declaration))
    (should-not (eliscript-ir-property constant :mutable))
    (should (eq (eliscript-ir-node-kind function) 'function-declaration))
    (should (eq (eliscript-ir-node-kind lexical-bindings) 'lexical-bindings))
    (should (eq (eliscript-ir-node-kind binding) 'lexical-binding))
    (should (eq (eliscript-ir-node-kind conditional) 'conditional))
    (should (= (eliscript-source-span-line
                (eliscript-ir-node-span lexical-bindings))
               4))))

(ert-deftest eliscript-lowerer-preserves-macro-call-origin ()
  (let* ((program
          (eliscript-compile-ir-string
           "(defmacro twice (value) `(+ ,value ,value))

(defun double (value)
  (twice value))"
         "macro-ir.eli"))
         (function (car (eliscript-ir-program-body program)))
         (intrinsic
          (nth (eliscript-ir-property function :parameter-count)
               (eliscript-ir-node-children function)))
         (span (eliscript-ir-node-span intrinsic)))
    (should (eq (eliscript-ir-node-kind intrinsic) 'intrinsic))
    (should (eq (eliscript-ir-node-value intrinsic) '+))
    (should (= (eliscript-source-span-line span) 4))
    (should (= (eliscript-source-span-column span) 3))))

(ert-deftest eliscript-ir-round-trip-preserves-computed-calls ()
  (let* ((source "(defun invoke (value) ((lambda (item) item) value))")
         (program (eliscript-compile-ir-string source "call.eli"))
         (function (car (eliscript-ir-program-body program)))
         (call
          (nth (eliscript-ir-property function :parameter-count)
               (eliscript-ir-node-children function)))
         (callee (car (eliscript-ir-node-children call))))
    (should (eq (eliscript-ir-node-kind call) 'call))
    (should (eq (eliscript-ir-node-kind callee) 'function-expression))
    (should
     (equal (eliscript-ir-program-to-forms program)
            '((defun invoke (value) ((lambda (item) item) value)))))))

(ert-deftest eliscript-ir-emitter-matches-compatibility-backend ()
  (let ((source
         "(import \"react\" :default React useState)
(import \"react-dom\" :as ReactDOM)
(defvar state 0)
(defun optional-branch (value) (let* () (if value value)))
(defun exercise (value values)
  (let* ((next (1+ value))
         (record (object :next next (+ value 1) value)))
    (progn
      (setq state next)
      (set! state (if (and value next) next state))
      (when value (print (get record :next)))
      (unless false (put record :done t))
      (while (> state 10) (set! state (1- state)))
      (or (null values)
          (apply (lambda (item) item) values)
          (js-call values :map (lambda (item) (* item 2))))
      (cond ((= state 0) '(zero)) (t (str state))))))
(export exercise optional-branch state)
(export-default exercise)")
        (filename "emitter-parity.eli"))
    (should
     (equal (eliscript-compile-string source filename)
            (eliscript-tests--legacy-compile-string source filename)))))

(ert-deftest eliscript-ir-emitter-does-not-call-form-backend ()
  (let ((program
         (eliscript-compile-ir-string
          "(defun identity (value) value) (export identity)"
          "direct-ir.eli")))
    (cl-letf (((symbol-function 'eliscript-ir-program-to-forms)
               (lambda (&rest _arguments)
                 (error "IR form bridge must not run")))
              ((symbol-function 'eliscript-ir-node-to-form)
               (lambda (&rest _arguments)
                 (error "IR node bridge must not run")))
              ((symbol-function 'eliscript-emit-module)
               (lambda (&rest _arguments)
                 (error "form module emitter must not run")))
              ((symbol-function 'eliscript-emitter-emit-top-level)
               (lambda (&rest _arguments)
                 (error "form top-level emitter must not run")))
              ((symbol-function 'eliscript-emitter-emit-expression)
               (lambda (&rest _arguments)
                 (error "form expression emitter must not run"))))
      (should
       (string-match-p
        (regexp-quote "function identity(value)")
        (eliscript-emit-ir-module program))))))

(provide 'eliscript-tests)

;;; eliscript-tests.el ends here
