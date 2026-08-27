;;; eliscript-expander.el --- Compile-time macros for Eliscript -*- lexical-binding: t; -*-

;;; Commentary:

;; The seed expander evaluates trusted macro bodies as Emacs Lisp, then walks
;; the returned Eliscript forms until no user macro remains at the call site.
;; Macro environments are local to one compilation.

;;; Code:

(require 'cl-lib)
(require 'eliscript-diagnostic)
(require 'eliscript-form)

(cl-defstruct (eliscript-expander--macro
               (:constructor eliscript-expander--macro-create))
  name
  function)

(defconst eliscript-expander--maximum-depth 100
  "Maximum number of recursive macro expansions at one call site.")

(defvar eliscript-expander--filename nil)
(defvar eliscript-expander--current-span nil)

(defun eliscript-expander--fail (format-string &rest arguments)
  "Signal an expansion error using FORMAT-STRING and ARGUMENTS."
  (signal 'eliscript-expand-error
          (list (apply #'eliscript-diagnostic-format-at
                       eliscript-expander--filename
                       eliscript-expander--current-span
                       format-string
                       arguments))))

(defun eliscript-expander--normalize-parameters (parameters)
  "Return Emacs Lisp lambda PARAMETERS, translating `&body' to `&rest'."
  (mapcar (lambda (parameter)
            (if (eq parameter '&body) '&rest parameter))
          parameters))

(defun eliscript-expander--register (form environment)
  "Compile macro definition FORM and add it to ENVIRONMENT."
  (let* ((items (eliscript-form-value form))
         (arguments (cdr items))
         (eliscript-expander--current-span (eliscript-form-span form)))
    (unless (>= (length arguments) 2)
      (eliscript-expander--fail "defmacro expects a name and parameter list"))
    (let ((name (eliscript-form-value (nth 0 arguments)))
          (parameters (eliscript-form-strip (nth 1 arguments)))
          (body (mapcar #'eliscript-form-strip (nthcdr 2 arguments))))
      (unless (symbolp name)
        (eliscript-expander--fail "macro name must be a symbol: %S" name))
      (unless (proper-list-p parameters)
        (eliscript-expander--fail "macro parameters must be a list: %S"
                                  parameters))
      (when (cl-find-if-not #'symbolp parameters)
        (eliscript-expander--fail "macro parameters must be symbols: %S"
                                  parameters))
      (when (gethash name environment)
        (eliscript-expander--fail "duplicate macro definition: %s" name))
      (condition-case error-data
          (puthash
           name
           (eliscript-expander--macro-create
            :name name
            :function
            (eval `(lambda ,(eliscript-expander--normalize-parameters parameters)
                     ,@body)
                  t))
           environment)
        (error
         (eliscript-expander--fail
          "invalid macro %s: %s" name (error-message-string error-data)))))))

(defun eliscript-expander--invoke (definition arguments depth)
  "Invoke macro DEFINITION with raw ARGUMENTS at expansion DEPTH."
  (when (>= depth eliscript-expander--maximum-depth)
    (eliscript-expander--fail
     "macro expansion exceeded %d steps near %s"
     eliscript-expander--maximum-depth
     (eliscript-expander--macro-name definition)))
  (condition-case error-data
      (apply (eliscript-expander--macro-function definition)
             (mapcar #'eliscript-form-strip arguments))
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
             ((or 'lambda 'fn)
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
             ('object
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
              ((or 'defun 'defn)
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
              ((or 'import 'export) value)
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

(defun eliscript-expand-module (forms &optional filename)
  "Expand compile-time macros in module FORMS read from FILENAME."
  (let ((eliscript-expander--filename filename)
        (environment (make-hash-table :test #'eq)))
    (eliscript-expander--expand-top-level-sequence forms environment 0)))

(provide 'eliscript-expander)

;;; eliscript-expander.el ends here
