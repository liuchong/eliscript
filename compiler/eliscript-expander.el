;;; eliscript-expander.el --- Compile-time macros for Eliscript -*- lexical-binding: t; -*-

;;; Commentary:

;; The seed expander evaluates macro bodies through a deterministic language
;; subset, then walks returned forms until no user macro remains at the call
;; site.  Macro environments are local to one compilation.

;;; Code:

(require 'cl-lib)
(require 'eliscript-diagnostic)
(require 'eliscript-form)
(require 'eliscript-macro-eval)

(cl-defstruct (eliscript-expander--macro
               (:constructor eliscript-expander--macro-create))
  name
  parameters
  body)

(defconst eliscript-expander--maximum-depth 100
  "Maximum number of recursive macro expansions at one call site.")

(defvar eliscript-expander--filename nil)
(defvar eliscript-expander--current-span nil)
(defvar eliscript-expander--macro-context nil)

(defun eliscript-expander--fail (format-string &rest arguments)
  "Signal an expansion error using FORMAT-STRING and ARGUMENTS."
  (apply #'eliscript-diagnostic-signal
         'eliscript-expand-error "ELI-X0001" "expansion"
         eliscript-expander--filename eliscript-expander--current-span
         format-string arguments))

(defun eliscript-expander--collect-symbol-names (form names)
  "Add every source symbol reachable from FORM to NAMES."
  (let ((value (eliscript-form-value form)))
    (cond
     ((symbolp value) (puthash (symbol-name value) t names))
     ((consp value)
      (eliscript-expander--collect-symbol-names (car value) names)
      (eliscript-expander--collect-symbol-names (cdr value) names))
     ((vectorp value)
      (mapc (lambda (item)
              (eliscript-expander--collect-symbol-names item names))
            (append value nil)))))
  names)

(defun eliscript-expander--register (form environment)
  "Validate macro definition FORM and add it to ENVIRONMENT."
  (let* ((items (eliscript-form-value form))
         (arguments (cdr items))
         (eliscript-expander--current-span (eliscript-form-span form)))
    (unless (>= (length arguments) 2)
      (eliscript-expander--fail "defmacro expects a name and parameter list"))
    (let ((name (eliscript-form-value (nth 0 arguments)))
          (parameters (eliscript-form-strip (nth 1 arguments)))
          (body (mapcar #'eliscript-form-strip (nthcdr 2 arguments))))
      (unless (eliscript-macro-eval-symbol-p name)
        (eliscript-expander--fail "macro name must be a symbol: %S" name))
      (when (gethash name environment)
        (eliscript-expander--fail "duplicate macro definition: %s" name))
      (condition-case error-data
          (puthash
           name
           (eliscript-expander--macro-create
            :name name
            :parameters (eliscript-macro-eval-parse-parameters parameters)
            :body body)
           environment)
        (eliscript-macro-eval-error
         (eliscript-expander--fail "%s" (cadr error-data)))))))

(defun eliscript-expander--invoke (definition arguments depth)
  "Invoke macro DEFINITION with raw ARGUMENTS at expansion DEPTH."
  (when (>= depth eliscript-expander--maximum-depth)
    (eliscript-expander--fail
     "macro expansion exceeded %d steps near %s"
     eliscript-expander--maximum-depth
     (eliscript-expander--macro-name definition)))
  (condition-case error-data
      (eliscript-macro-eval-run
       (eliscript-expander--macro-name definition)
       (eliscript-expander--macro-parameters definition)
       (eliscript-expander--macro-body definition)
       (mapcar #'eliscript-form-strip arguments)
       eliscript-expander--macro-context)
    (eliscript-macro-eval-error
     (eliscript-expander--fail
      "macro %s failed: %s"
      (eliscript-expander--macro-name definition)
      (cadr error-data)))
    (error
     (eliscript-expander--fail
      "macro %s failed: %s"
      (eliscript-expander--macro-name definition)
      (error-message-string error-data)))))

(defun eliscript-expander--expand-sequence (forms environment depth)
  "Expand expression FORMS in ENVIRONMENT at DEPTH."
  (mapcar (lambda (form)
            (eliscript-expander--expand-expression form environment depth))
          forms))

(defun eliscript-expander--expand-binding (binding environment depth)
  "Expand initializer in one let BINDING using ENVIRONMENT at DEPTH."
  (let ((value (eliscript-form-value binding)))
    (if (and (consp value) (proper-list-p value))
        (eliscript-form-inherit
         (cons (car value)
               (eliscript-expander--expand-sequence
                (cdr value) environment depth))
         binding)
      binding)))

(defun eliscript-expander--expand-bindings (arguments environment depth)
  "Expand let ARGUMENTS in ENVIRONMENT at DEPTH."
  (if (null arguments)
      arguments
    (let* ((bindings-form (car arguments))
           (bindings (eliscript-form-value bindings-form)))
      (cons
       (eliscript-form-inherit
        (if (proper-list-p bindings)
            (mapcar (lambda (binding)
                      (eliscript-expander--expand-binding
                       binding environment depth))
                    bindings)
          bindings)
        bindings-form)
       (eliscript-expander--expand-sequence
        (cdr arguments) environment depth)))))

(defun eliscript-expander--expand-assignment (arguments environment depth)
  "Expand assignment values in ARGUMENTS using ENVIRONMENT at DEPTH."
  (cl-loop for argument in arguments
           for index from 0
           collect (if (cl-oddp index)
                       (eliscript-expander--expand-expression
                        argument environment depth)
                     argument)))

(defun eliscript-expander--expand-object (arguments environment depth)
  "Expand object ARGUMENTS in ENVIRONMENT at DEPTH, preserving literal keys."
  (cl-loop for argument in arguments
           for index from 0
           collect
           (if (let ((value (eliscript-form-value argument)))
                 (or (cl-oddp index)
                     (not (or (keywordp value)
                              (stringp value)
                              (symbolp value)))))
               (eliscript-expander--expand-expression
                argument environment depth)
             argument)))

(defun eliscript-expander--expand-property-call (arguments environment depth)
  "Expand property call ARGUMENTS in ENVIRONMENT at DEPTH."
  (cl-loop for argument in arguments
           for index from 0
           collect
           (if (and (= index 1)
                    (let ((value (eliscript-form-value argument)))
                      (or (keywordp value) (stringp value))))
               argument
             (eliscript-expander--expand-expression
              argument environment depth))))

(defun eliscript-expander--expand-cond (clauses environment depth)
  "Expand COND CLAUSES in ENVIRONMENT at DEPTH."
  (mapcar
   (lambda (clause)
     (let ((value (eliscript-form-value clause)))
       (if (proper-list-p value)
           (eliscript-form-inherit
            (eliscript-expander--expand-sequence value environment depth)
            clause)
         clause)))
   clauses))

(defun eliscript-expander--expand-try-clause (clause environment depth)
  "Expand one try CLAUSE in ENVIRONMENT at DEPTH."
  (let* ((value (eliscript-form-value clause))
         (operator (and (proper-list-p value)
                        value
                        (eliscript-form-value (car value))))
         (arguments (and (proper-list-p value) (cdr value))))
    (pcase operator
      ('catch
       (if arguments
           (eliscript-form-inherit
            (cons (car value)
                  (cons (car arguments)
                        (eliscript-expander--expand-sequence
                         (cdr arguments) environment depth)))
            clause)
         clause))
      ('finally
       (eliscript-form-inherit
        (cons (car value)
              (eliscript-expander--expand-sequence
               arguments environment depth))
        clause))
      (_ (eliscript-expander--expand-expression
          clause environment depth)))))

(defun eliscript-expander--generated-form (value)
  "Wrap generated VALUE at the current declaration location."
  (eliscript-form-wrap value eliscript-expander--current-span))

(defun eliscript-expander--desugar-defmulti (arguments)
  "Return the core declaration represented by defmulti ARGUMENTS."
  (unless (<= 2 (length arguments) 3)
    (eliscript-expander--fail
     "defmulti expects a name, dispatch function, and optional default value"))
  (let* ((name-form (nth 0 arguments))
         (name (eliscript-form-value name-form)))
    (unless (symbolp name)
      (eliscript-expander--fail
       "defmulti name must be a symbol: %S"
       (eliscript-form-strip name-form)))
    (eliscript-expander--generated-form
     (list
      (eliscript-expander--generated-form 'defconst)
      name-form
      (eliscript-expander--generated-form
       (append
        (list
         (eliscript-expander--generated-form 'multi-fn)
         (eliscript-expander--generated-form (symbol-name name))
         (nth 1 arguments))
        (when (= (length arguments) 3)
          (list (nth 2 arguments)))))))))

(defun eliscript-expander--desugar-defmethod (arguments)
  "Return the method registration represented by defmethod ARGUMENTS."
  (unless (>= (length arguments) 3)
    (eliscript-expander--fail
     "defmethod expects a multimethod, dispatch value, and parameter list"))
  (let* ((target-form (nth 0 arguments))
         (target (eliscript-form-value target-form)))
    (unless (symbolp target)
      (eliscript-expander--fail
       "defmethod target must be a symbol: %S"
       (eliscript-form-strip target-form)))
    (eliscript-expander--generated-form
     (list
      (eliscript-expander--generated-form 'add-method!)
      target-form
      (nth 1 arguments)
      (eliscript-expander--generated-form
       (append
        (list
         (eliscript-expander--generated-form 'lambda)
         (nth 2 arguments))
        (nthcdr 3 arguments)))))))

(defun eliscript-expander--expand-expression (form environment depth)
  "Expand expression FORM in macro ENVIRONMENT at DEPTH."
  (let* ((value (eliscript-form-value form))
         (eliscript-expander--current-span
          (or (eliscript-form-span form) eliscript-expander--current-span)))
    (cond
     ((vectorp value)
      (eliscript-form-inherit
       (apply #'vector
              (eliscript-expander--expand-sequence
               (append value nil) environment depth))
       form))
     ((not (consp value)) form)
     ((not (proper-list-p value))
      (eliscript-expander--fail
       "dotted call forms are not supported: %S"
       (eliscript-form-strip form)))
     (t
      (let* ((operator-form (car value))
             (operator (eliscript-form-value operator-form))
             (arguments (cdr value)))
        (cond
         ((eq operator 'quote) form)
         ((eq operator 'defmacro)
          (eliscript-expander--fail
           "defmacro is only valid at module top level"))
         ((eq operator 'defportable)
          (eliscript-expander--fail
           "defportable is only valid at module top level"))
         ((eq operator 'defasync)
          (eliscript-expander--fail
           "defasync is only valid at module top level"))
         ((eq operator 'defmulti)
          (eliscript-expander--fail
           "defmulti is only valid at module top level"))
         ((eq operator 'defmethod)
          (eliscript-expander--fail
           "defmethod is only valid at module top level"))
         ((and (symbolp operator) (gethash operator environment))
          (eliscript-expander--expand-expression
           (eliscript-form-locate-generated
            (eliscript-expander--invoke
             (gethash operator environment) arguments depth)
            eliscript-expander--current-span)
           environment
           (1+ depth)))
         (t
          (eliscript-form-inherit
           (pcase operator
             ((or 'lambda 'fn 'async)
              (if arguments
                  (cons operator-form
                        (cons (car arguments)
                              (eliscript-expander--expand-sequence
                               (cdr arguments) environment depth)))
                value))
             ((or 'let 'let*)
              (cons operator-form
                    (eliscript-expander--expand-bindings
                     arguments environment depth)))
             ('setq
              (cons operator-form
                    (eliscript-expander--expand-assignment
                     arguments environment depth)))
             ('set!
              (cons operator-form
                    (if arguments
                        (cons (car arguments)
                              (eliscript-expander--expand-sequence
                               (cdr arguments) environment depth))
                      nil)))
             ('cond
              (cons operator-form
                    (eliscript-expander--expand-cond
                     arguments environment depth)))
             ('try
              (cons operator-form
                    (mapcar
                     (lambda (clause)
                       (eliscript-expander--expand-try-clause
                        clause environment depth))
                     arguments)))
             ('js-object
              (cons operator-form
                    (eliscript-expander--expand-object
                     arguments environment depth)))
             ((or 'get 'put 'js-call)
              (cons operator-form
                    (eliscript-expander--expand-property-call
                     arguments environment depth)))
             (_
              (cons (if (symbolp operator)
                        operator-form
                      (eliscript-expander--expand-expression
                       operator-form environment depth))
                    (eliscript-expander--expand-sequence
                     arguments environment depth))))
           form))))))))

(defun eliscript-expander--expand-top-level (form environment depth)
  "Expand top-level FORM in ENVIRONMENT at DEPTH and return zero or one forms."
  (let* ((value (eliscript-form-value form))
         (eliscript-expander--current-span
          (or (eliscript-form-span form) eliscript-expander--current-span)))
    (cond
     ((not (consp value))
      (list (eliscript-expander--expand-expression form environment depth)))
     ((not (proper-list-p value))
      (eliscript-expander--fail
       "dotted top-level form is not supported: %S"
       (eliscript-form-strip form)))
     (t
      (let* ((operator-form (car value))
             (operator (eliscript-form-value operator-form))
             (arguments (cdr value)))
        (cond
         ((eq operator 'defmacro)
          (eliscript-expander--register form environment)
          nil)
         ((eq operator 'defmulti)
          (eliscript-expander--expand-top-level
           (eliscript-expander--desugar-defmulti arguments)
           environment depth))
         ((eq operator 'defmethod)
          (eliscript-expander--expand-top-level
           (eliscript-expander--desugar-defmethod arguments)
           environment depth))
         ((and (symbolp operator) (gethash operator environment))
          (eliscript-expander--expand-top-level
           (eliscript-form-locate-generated
            (eliscript-expander--invoke
             (gethash operator environment) arguments depth)
            eliscript-expander--current-span)
           environment
           (1+ depth)))
         (t
          (list
           (eliscript-form-inherit
            (pcase operator
              ('module
               (if arguments
                   (cons operator-form
                         (cons (car arguments)
                               (eliscript-expander--expand-top-level-sequence
                                (cdr arguments) environment depth)))
                 value))
              ((or 'defun 'defn 'defportable 'defasync)
               (if (>= (length arguments) 2)
                   (cons operator-form
                         (cons (nth 0 arguments)
                               (cons (nth 1 arguments)
                                     (eliscript-expander--expand-sequence
                                      (nthcdr 2 arguments)
                                      environment depth))))
                 value))
              ((or 'defvar 'defconst)
               (cons operator-form
                     (if arguments
                         (cons (car arguments)
                               (eliscript-expander--expand-sequence
                                (cdr arguments) environment depth))
                       nil)))
              ((or 'import 'import-portable 'export) value)
              ('export-default
               (cons operator-form
                     (eliscript-expander--expand-sequence
                      arguments environment depth)))
              (_
               (eliscript-form-value
                (eliscript-expander--expand-expression
                 form environment depth))))
            form)))))))))

(defun eliscript-expander--expand-top-level-sequence
    (forms environment depth)
  "Expand top-level FORMS sequentially in ENVIRONMENT at DEPTH."
  (apply #'append
         (mapcar (lambda (form)
                   (eliscript-expander--expand-top-level
                    form environment depth))
                 forms)))

(defun eliscript-expand-module (forms &optional filename macro-context)
  "Expand compile-time macros in module FORMS read from FILENAME.

MACRO-CONTEXT is a plist containing string-keyed `:capabilities' and `:files'
hash tables.  An omitted context exposes no host capabilities."
  (let ((reserved-names (make-hash-table :test #'equal)))
    (dolist (form forms)
      (eliscript-expander--collect-symbol-names form reserved-names))
    (let ((eliscript-expander--filename filename)
          (eliscript-expander--macro-context
           (eliscript-macro-eval--make-context
            reserved-names
            (plist-get macro-context :capabilities)
            (plist-get macro-context :files)))
          (environment (make-hash-table :test #'eq)))
      (eliscript-expander--expand-top-level-sequence forms environment 0))))

(provide 'eliscript-expander)

;;; eliscript-expander.el ends here
