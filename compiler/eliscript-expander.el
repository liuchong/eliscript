;;; eliscript-expander.el --- Compile-time macros for Eliscript -*- lexical-binding: t; -*-

;;; Commentary:

;; The seed expander evaluates trusted macro bodies as Emacs Lisp, then walks
;; the returned Eliscript forms until no user macro remains at the call site.
;; Macro environments are local to one compilation.

;;; Code:

(require 'cl-lib)
(require 'eliscript-diagnostic)

(cl-defstruct (eliscript-expander--macro
               (:constructor eliscript-expander--macro-create))
  name
  function)

(defconst eliscript-expander--maximum-depth 100
  "Maximum number of recursive macro expansions at one call site.")

(defvar eliscript-expander--filename nil)

(defun eliscript-expander--fail (format-string &rest arguments)
  "Signal an expansion error using FORMAT-STRING and ARGUMENTS."
  (signal 'eliscript-expand-error
          (list (apply #'eliscript-diagnostic-format
                       eliscript-expander--filename
                       format-string
                       arguments))))

(defun eliscript-expander--normalize-parameters (parameters)
  "Return Emacs Lisp lambda PARAMETERS, translating `&body' to `&rest'."
  (mapcar (lambda (parameter)
            (if (eq parameter '&body) '&rest parameter))
          parameters))

(defun eliscript-expander--register (form environment)
  "Compile macro definition FORM and add it to ENVIRONMENT."
  (let ((arguments (cdr form)))
    (unless (>= (length arguments) 2)
      (eliscript-expander--fail "defmacro expects a name and parameter list"))
    (let ((name (nth 0 arguments))
          (parameters (nth 1 arguments))
          (body (nthcdr 2 arguments)))
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
      (apply (eliscript-expander--macro-function definition) arguments)
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
  (if (and (consp binding) (proper-list-p binding))
      (cons (car binding)
            (eliscript-expander--expand-sequence
             (cdr binding) environment depth))
    binding))

(defun eliscript-expander--expand-bindings (arguments environment depth)
  "Expand let ARGUMENTS in ENVIRONMENT at DEPTH."
  (if (null arguments)
      arguments
    (let ((bindings (car arguments)))
      (cons
       (if (proper-list-p bindings)
           (mapcar (lambda (binding)
                     (eliscript-expander--expand-binding
                      binding environment depth))
                   bindings)
         bindings)
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
           (if (or (cl-oddp index)
                   (not (or (keywordp argument)
                            (stringp argument)
                            (symbolp argument))))
               (eliscript-expander--expand-expression
                argument environment depth)
             argument)))

(defun eliscript-expander--expand-property-call (arguments environment depth)
  "Expand property call ARGUMENTS in ENVIRONMENT at DEPTH."
  (cl-loop for argument in arguments
           for index from 0
           collect
           (if (and (= index 1)
                    (or (keywordp argument) (stringp argument)))
               argument
             (eliscript-expander--expand-expression
              argument environment depth))))

(defun eliscript-expander--expand-cond (clauses environment depth)
  "Expand COND CLAUSES in ENVIRONMENT at DEPTH."
  (mapcar
   (lambda (clause)
     (if (proper-list-p clause)
         (eliscript-expander--expand-sequence clause environment depth)
       clause))
   clauses))

(defun eliscript-expander--expand-expression (form environment depth)
  "Expand expression FORM in macro ENVIRONMENT at DEPTH."
  (cond
   ((vectorp form)
    (apply #'vector
           (eliscript-expander--expand-sequence
            (append form nil) environment depth)))
   ((not (consp form)) form)
   ((not (proper-list-p form))
    (eliscript-expander--fail "dotted call forms are not supported: %S" form))
   ((eq (car form) 'quote) form)
   ((eq (car form) 'defmacro)
    (eliscript-expander--fail "defmacro is only valid at module top level"))
   ((and (symbolp (car form)) (gethash (car form) environment))
    (eliscript-expander--expand-expression
     (eliscript-expander--invoke
      (gethash (car form) environment) (cdr form) depth)
     environment
     (1+ depth)))
   (t
    (let ((operator (car form))
          (arguments (cdr form)))
      (pcase operator
        ((or 'lambda 'fn)
         (if arguments
             (cons operator
                   (cons (car arguments)
                         (eliscript-expander--expand-sequence
                          (cdr arguments) environment depth)))
           form))
        ((or 'let 'let*)
         (cons operator
               (eliscript-expander--expand-bindings
                arguments environment depth)))
        ('setq
         (cons operator
               (eliscript-expander--expand-assignment
                arguments environment depth)))
        ('set!
         (cons operator
               (if arguments
                   (cons (car arguments)
                         (eliscript-expander--expand-sequence
                          (cdr arguments) environment depth))
                 nil)))
        ('cond
         (cons operator
               (eliscript-expander--expand-cond
                arguments environment depth)))
        ('object
         (cons operator
               (eliscript-expander--expand-object
                arguments environment depth)))
        ((or 'get 'put 'js-call)
         (cons operator
               (eliscript-expander--expand-property-call
                arguments environment depth)))
        (_
         (cons (if (symbolp operator)
                   operator
                 (eliscript-expander--expand-expression
                  operator environment depth))
               (eliscript-expander--expand-sequence
                arguments environment depth))))))))

(defun eliscript-expander--expand-top-level (form environment depth)
  "Expand top-level FORM in ENVIRONMENT at DEPTH and return zero or one forms."
  (cond
   ((not (consp form))
    (list (eliscript-expander--expand-expression form environment depth)))
   ((not (proper-list-p form))
    (eliscript-expander--fail "dotted top-level form is not supported: %S" form))
   ((eq (car form) 'defmacro)
    (eliscript-expander--register form environment)
    nil)
   ((and (symbolp (car form)) (gethash (car form) environment))
    (eliscript-expander--expand-top-level
     (eliscript-expander--invoke
      (gethash (car form) environment) (cdr form) depth)
     environment
     (1+ depth)))
   (t
    (let ((operator (car form))
          (arguments (cdr form)))
      (list
       (pcase operator
         ('module
          (if arguments
              (cons 'module
                    (cons (car arguments)
                          (eliscript-expander--expand-top-level-sequence
                           (cdr arguments) environment depth)))
            form))
         ((or 'defun 'defn)
          (if (>= (length arguments) 2)
              (cons operator
                    (cons (nth 0 arguments)
                          (cons (nth 1 arguments)
                                (eliscript-expander--expand-sequence
                                 (nthcdr 2 arguments) environment depth))))
            form))
         ((or 'defvar 'defconst)
          (cons operator
                (if arguments
                    (cons (car arguments)
                          (eliscript-expander--expand-sequence
                           (cdr arguments) environment depth))
                  nil)))
         ((or 'import 'export) form)
         ('export-default
          (cons operator
                (eliscript-expander--expand-sequence
                 arguments environment depth)))
         (_
          (eliscript-expander--expand-expression
           form environment depth))))))))

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
