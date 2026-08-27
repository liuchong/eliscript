;;; eliscript-lower.el --- Lower analyzed forms to Eliscript IR -*- lexical-binding: t; -*-

;;; Commentary:

;; Lowering is intentionally syntax-aware.  Reader aliases are normalized into
;; stable IR kinds while source spans remain attached to every resulting node.

;;; Code:

(require 'cl-lib)
(require 'eliscript-form)
(require 'eliscript-ir)

(defconst eliscript-lower--intrinsics
  '(not + * - / % mod = /= not= < <= > >= 1+ 1- eq equal null
    list vector array car cdr cons nth aref length)
  "Operators represented by the generic intrinsic IR node.")

(defun eliscript-lower--node (kind form &optional value children properties)
  "Create a KIND node for located FORM with VALUE, CHILDREN, and PROPERTIES."
  (eliscript-ir-make-node
   kind (eliscript-form-span form) value children properties))

(defun eliscript-lower--binding-node (binding)
  "Lower one lexical BINDING to IR."
  (let ((value (eliscript-form-value binding)))
    (if (symbolp value)
        (eliscript-lower--node
         'lexical-binding binding value nil (list :style 'symbol))
      (eliscript-lower--node
       'lexical-binding
       binding
       (eliscript-form-value (car value))
       (and (cdr value)
            (list (eliscript-lower-expression (cadr value))))
       (list :style 'list)))))

(defun eliscript-lower--parameter-nodes (parameters)
  "Lower located function PARAMETERS to binding nodes."
  (mapcar (lambda (parameter)
            (eliscript-lower--node
             'parameter-binding parameter (eliscript-form-value parameter)))
          (eliscript-form-value parameters)))

(defun eliscript-lower--call-node (kind form operator arguments)
  "Lower operator FORM and ARGUMENTS into an IR node of KIND."
  (eliscript-lower--node
   kind form operator (mapcar #'eliscript-lower-expression arguments)))

(defun eliscript-lower--assignments (form operator arguments)
  "Lower assignment ARGUMENTS from FORM using OPERATOR."
  (let (pairs)
    (while arguments
      (let ((name (pop arguments))
            (value (pop arguments)))
        (push
         (eliscript-lower--node
          'assignment-pair
          name
          (eliscript-form-value name)
          (list (eliscript-lower-expression value)))
         pairs)))
    (eliscript-lower--node
     'assignment form operator (nreverse pairs))))

(defun eliscript-lower--object (form arguments)
  "Lower object literal ARGUMENTS from FORM."
  (let (properties)
    (while arguments
      (let* ((key (pop arguments))
             (value (pop arguments))
             (key-value (eliscript-form-value key))
             (computed (not (or (keywordp key-value)
                                (stringp key-value)
                                (symbolp key-value)))))
        (push
         (if computed
             (eliscript-lower--node
              'object-property key nil
              (list (eliscript-lower-expression key)
                    (eliscript-lower-expression value))
              (list :computed t))
           (eliscript-lower--node
            'object-property key key-value
            (list (eliscript-lower-expression value))
            (list :computed nil)))
         properties)))
    (eliscript-lower--node
     'object-literal form nil (nreverse properties))))

(defun eliscript-lower-expression (form)
  "Lower analyzed expression FORM to an IR node."
  (let ((value (eliscript-form-value form)))
    (cond
     ((or (null value) (eq value t) (numberp value) (stringp value)
          (keywordp value) (eq value 'false) (eq value 'undefined))
      (eliscript-lower--node 'literal form value))
     ((symbolp value)
      (eliscript-lower--node 'reference form value))
     ((vectorp value)
      (eliscript-lower--node
       'array-literal form nil
       (mapcar #'eliscript-lower-expression (append value nil))))
     ((consp value)
      (let* ((operator (eliscript-form-value (car value)))
             (arguments (cdr value)))
        (pcase operator
          ('quote
           (eliscript-lower--node
            'quoted-literal form
            (eliscript-form-strip (car arguments))))
          ((or 'lambda 'fn)
           (let ((parameters
                  (eliscript-lower--parameter-nodes (car arguments))))
             (eliscript-lower--node
              'function-expression form nil
              (append parameters
                      (mapcar #'eliscript-lower-expression (cdr arguments)))
              (list :parameter-count (length parameters)))))
          ('if (eliscript-lower--call-node
                'conditional form 'if arguments))
          ((or 'when 'unless)
           (eliscript-lower--call-node
            'conditional-sugar form operator arguments))
          ('cond
           (eliscript-lower--node
            'conditional-chain form nil
            (mapcar
             (lambda (clause)
               (eliscript-lower--node
                'conditional-clause clause nil
                (mapcar #'eliscript-lower-expression
                        (eliscript-form-value clause))))
             arguments)))
          ((or 'progn 'do)
           (eliscript-lower--call-node 'sequence form operator arguments))
          ((or 'let 'let*)
           (let ((bindings
                  (mapcar #'eliscript-lower--binding-node
                          (eliscript-form-value (car arguments)))))
             (eliscript-lower--node
              'lexical-bindings form nil
              (append bindings
                      (mapcar #'eliscript-lower-expression (cdr arguments)))
              (list :sequential (eq operator 'let*)
                    :binding-count (length bindings)))))
          ((or 'setq 'set!)
           (eliscript-lower--assignments form operator arguments))
          ('while
           (eliscript-lower--call-node 'loop form 'while arguments))
          ((or 'and 'or)
           (eliscript-lower--call-node
            'short-circuit form operator arguments))
          ('jsx
           (eliscript-lower--node
            'react-element form nil
            (mapcar #'eliscript-lower-expression arguments)
            (list :child-count (- (length arguments) 2))))
          ('fragment
           (eliscript-lower--node
            'react-fragment form nil
            (mapcar #'eliscript-lower-expression arguments)
            (list :child-count (length arguments))))
          ((pred (lambda (name) (memq name eliscript-lower--intrinsics)))
           (eliscript-lower--call-node 'intrinsic form operator arguments))
          ('object (eliscript-lower--object form arguments))
          ('get
           (eliscript-lower--call-node 'property-read form 'get arguments))
          ('put
           (eliscript-lower--call-node 'property-write form 'put arguments))
          ('js-call
           (eliscript-lower--call-node 'method-call form 'js-call arguments))
          ('new
           (eliscript-lower--call-node 'constructor-call form 'new arguments))
          ('js*
           (eliscript-lower--call-node 'raw-javascript form 'js* arguments))
          ('print
           (eliscript-lower--call-node 'print form 'print arguments))
          ('str
           (eliscript-lower--call-node 'string-concat form 'str arguments))
          ('funcall
           (eliscript-lower--call-node 'invoke form 'funcall arguments))
          ('apply
           (eliscript-lower--call-node 'apply-call form 'apply arguments))
          (_
           (eliscript-lower--node
            'call form nil
            (mapcar #'eliscript-lower-expression value))))))
     (t (error "Cannot lower unsupported Eliscript form: %S"
               (eliscript-form-strip form))))))

(defun eliscript-lower--import (form arguments)
  "Lower import ARGUMENTS from top-level FORM."
  (let ((source (eliscript-form-value (car arguments)))
        (specifiers (cdr arguments))
        children)
    (while specifiers
      (let* ((specifier-form (pop specifiers))
             (specifier (eliscript-form-value specifier-form)))
        (pcase specifier
          (:default
           (let ((name (pop specifiers)))
             (push (eliscript-lower--node
                    'import-default name (eliscript-form-value name))
                   children)))
          (:as
           (let ((name (pop specifiers)))
             (push (eliscript-lower--node
                    'import-namespace name (eliscript-form-value name))
                   children)))
          (_
           (push (eliscript-lower--node
                  'import-named specifier-form specifier)
                 children)))))
    (eliscript-lower--node
     'import-declaration form source (nreverse children))))

(defun eliscript-lower-top-level (form)
  "Lower analyzed top-level FORM to an IR node."
  (let ((value (eliscript-form-value form)))
    (if (not (consp value))
        (eliscript-lower--node
         'expression-statement form nil
         (list (eliscript-lower-expression form)))
      (let ((operator (eliscript-form-value (car value)))
            (arguments (cdr value)))
        (pcase operator
          ('module
           (eliscript-lower--node
            'module-declaration form
            (eliscript-form-value (car arguments))
            (mapcar #'eliscript-lower-top-level (cdr arguments))))
          ('import (eliscript-lower--import form arguments))
          ((or 'defvar 'defconst)
           (eliscript-lower--node
            'variable-declaration form
            (eliscript-form-value (car arguments))
            (and (cdr arguments)
                 (list (eliscript-lower-expression (cadr arguments))))
            (list :source-operator operator
                  :mutable (eq operator 'defvar))))
          ((or 'defun 'defn 'defportable)
           (let ((parameters
                  (eliscript-lower--parameter-nodes (nth 1 arguments))))
             (eliscript-lower--node
              'function-declaration form
              (eliscript-form-value (nth 0 arguments))
              (append parameters
                      (mapcar #'eliscript-lower-expression
                              (nthcdr 2 arguments)))
              (list :parameter-count (length parameters)
                    :source-operator operator
                    :portable (eq operator 'defportable)))))
          ('export
           (eliscript-lower--node
            'export-declaration form nil
            (mapcar (lambda (name)
                      (eliscript-lower--node
                       'reference name (eliscript-form-value name)))
                    arguments)))
          ('export-default
           (eliscript-lower--node
            'export-default form nil
            (list (eliscript-lower-expression (car arguments)))))
          (_
           (eliscript-lower--node
            'expression-statement form nil
            (list (eliscript-lower-expression form)))))))))

(defun eliscript-lower-module (forms &optional filename)
  "Lower analyzed module FORMS from FILENAME to an IR program."
  (eliscript-ir-make-program
   filename (mapcar #'eliscript-lower-top-level forms)))

(provide 'eliscript-lower)

;;; eliscript-lower.el ends here
