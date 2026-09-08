;;; eliscript-lower.el --- Lower analyzed forms to Eliscript IR -*- lexical-binding: t; -*-

;;; Commentary:

;; Lowering is intentionally syntax-aware.  Reader aliases are normalized into
;; stable IR kinds while source spans remain attached to every resulting node.

;;; Code:

(require 'cl-lib)
(require 'eliscript-form)
(require 'eliscript-ir)
(require 'eliscript-parameters)

(defconst eliscript-lower--intrinsics
  '(not + * - / % mod = /= not= < <= > >= 1+ 1-
    int32 uint32 imul32 bit-and bit-or bit-xor bit-not
    bit-shift-left bit-shift-right unsigned-bit-shift-right
    value-type host-identity-token string-code-unit-at string-from-code-unit
    string-to-number string-to-bigint number-float64-words
    eq equal null nil? undefined? nullish?
    car cdr cons js-cons nth js-nth aref length js-length
    object-keys object-has? object-assoc)
  "Operators represented by the generic intrinsic IR node.")

(defvar eliscript-lower--recur-targets nil)

(defun eliscript-lower--node (kind form &optional value children properties)
  "Create a KIND node for located FORM with VALUE, CHILDREN, and PROPERTIES."
  (eliscript-ir-make-node
   kind (eliscript-form-span form) value children properties))

(defun eliscript-lower--binding-target (pattern)
  "Lower binding PATTERN to structural IR."
  (let ((value (eliscript-form-value pattern)))
    (cond
     ((symbolp value)
      (eliscript-lower--node 'binding-name pattern value))
     ((vectorp value)
      (let (children rest)
        (dolist (element (append value nil))
          (let ((element-value (eliscript-form-value element)))
            (cond
             ((eq element-value '&rest) (setq rest t))
             ((null element-value)
              (push (eliscript-lower--node 'binding-hole element) children))
             (t
              (push (eliscript-lower--binding-target element) children)))))
        (eliscript-lower--node
         'array-binding-pattern pattern nil (nreverse children)
         (and rest (list :rest t)))))
     ((eliscript-binding-map-pattern-p pattern)
      (let* ((spec
              (eliscript-binding-map-spec
               pattern (lambda (_form message) (error "%s" message))))
             (entries (plist-get spec :entries))
             (as (plist-get spec :as))
             children)
        (dolist (entry entries)
          (let ((default-present (plist-member entry :default)))
            (push
             (eliscript-lower--node
              'map-binding-entry (plist-get entry :target) nil
              (append
               (list
                (eliscript-lower--binding-target (plist-get entry :target))
                (eliscript-lower-expression (plist-get entry :key)))
               (and default-present
                    (list
                     (eliscript-lower-expression
                      (plist-get entry :default)))))
              (and default-present (list :default t)))
             children)))
        (eliscript-lower--node
         'map-binding-pattern pattern nil
         (append (nreverse children)
                 (and as (list (eliscript-lower--binding-target as))))
         (list :entry-count (length entries) :as (and as t)))))
     (t (error "Cannot lower invalid binding pattern: %S"
               (eliscript-form-strip pattern))))))

(defun eliscript-lower--binding-node (binding)
  "Lower one lexical BINDING to IR."
  (let ((value (eliscript-form-value binding)))
    (if (symbolp value)
        (eliscript-lower--node
         'lexical-binding binding value nil (list :style 'symbol))
      (if (eliscript-binding-pattern-p binding)
          (eliscript-lower--node
           'lexical-binding binding nil
           (list (eliscript-lower--binding-target binding))
           (list :style 'symbol :pattern t))
        (let ((target (car value)))
          (if (or (vectorp (eliscript-form-value target))
                  (eliscript-binding-map-pattern-p target))
              (eliscript-lower--node
               'lexical-binding binding nil
               (cons
                (eliscript-lower--binding-target target)
                (and (cdr value)
                     (list (eliscript-lower-expression (cadr value)))))
               (list :style 'list :pattern t))
            (eliscript-lower--node
             'lexical-binding binding (eliscript-form-value target)
             (and (cdr value)
                  (list (eliscript-lower-expression (cadr value))))
             (list :style 'list))))))))

(defun eliscript-lower--parameter-nodes (parameters)
  "Lower located function PARAMETERS to binding nodes."
  (mapcar
   (lambda (parameter)
     (let ((form (eliscript-parameter-form parameter)))
       (if (not (symbolp (eliscript-form-value form)))
           (eliscript-lower--node
            'parameter-binding form nil
            (list (eliscript-lower--binding-target form))
            (list :parameter-kind (eliscript-parameter-kind parameter)
                  :pattern t))
         (eliscript-lower--node
          'parameter-binding form (eliscript-form-value form) nil
          (list :parameter-kind (eliscript-parameter-kind parameter))))))
   (eliscript-parameters-parse
    parameters
    (lambda (_form message) (error "%s" message)))))

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

(defun eliscript-lower--clause-operator (form)
  "Return the clause operator represented by FORM, or nil."
  (let ((value (eliscript-form-value form)))
    (and (proper-list-p value)
         value
         (symbolp (eliscript-form-value (car value)))
         (eliscript-form-value (car value)))))

(defun eliscript-lower--try (form arguments)
  "Lower try FORM with ARGUMENTS to explicit clause IR."
  (let (body clauses)
    (dolist (argument arguments)
      (let* ((value (eliscript-form-value argument))
             (operator (eliscript-lower--clause-operator argument)))
        (pcase operator
          ('catch
           (let ((binding (cadr value)))
             (push
              (eliscript-lower--node
               'catch-clause argument nil
               (cons
                (if (not (symbolp (eliscript-form-value binding)))
                    (eliscript-lower--node
                     'catch-binding binding nil
                     (list (eliscript-lower--binding-target binding))
                     (list :pattern t))
                  (eliscript-lower--node
                   'catch-binding binding (eliscript-form-value binding)))
                (mapcar #'eliscript-lower-expression (cddr value))))
              clauses)))
          ('finally
           (push
            (eliscript-lower--node
             'finally-clause argument nil
             (mapcar #'eliscript-lower-expression (cdr value)))
            clauses))
          (_ (push (eliscript-lower-expression argument) body)))))
    (setq body (nreverse body)
          clauses (nreverse clauses))
    (eliscript-lower--node
     'try-expression form nil (append body clauses)
     (list :body-count (length body)))))

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
       'persistent-vector-literal form nil
       (mapcar #'eliscript-lower-expression (append value nil))))
     ((consp value)
      (let* ((operator (eliscript-form-value (car value)))
             (arguments (cdr value)))
        (pcase operator
          ('quote
           (eliscript-lower--node
            'quoted-literal form
            (eliscript-form-strip (car arguments))))
          ((or 'lambda 'fn 'async)
           (let ((parameters
                  (eliscript-lower--parameter-nodes (car arguments))))
             (let ((eliscript-lower--recur-targets '(function)))
               (eliscript-lower--node
                'function-expression form nil
                (append parameters
                        (mapcar #'eliscript-lower-expression (cdr arguments)))
                (list :parameter-count (length parameters)
                      :async (eq operator 'async))))))
          ('await
           (eliscript-lower--node
            'await-expression form nil
            (list (eliscript-lower-expression (car arguments)))))
          ('throw
           (eliscript-lower--node
            'throw-expression form nil
            (list (eliscript-lower-expression (car arguments)))))
          ('try (eliscript-lower--try form arguments))
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
          ('loop
           (let ((bindings
                  (mapcar #'eliscript-lower--binding-node
                          (eliscript-form-value (car arguments)))))
             (let ((eliscript-lower--recur-targets
                    (cons 'loop eliscript-lower--recur-targets)))
               (eliscript-lower--node
                'binding-loop form nil
                (append bindings
                        (mapcar #'eliscript-lower-expression
                                (cdr arguments)))
                (list :binding-count (length bindings))))))
          ('recur
           (eliscript-lower--node
            'recur form nil
            (mapcar #'eliscript-lower-expression arguments)
            (list :target-kind (car eliscript-lower--recur-targets))))
          ((or 'setq 'set!)
           (eliscript-lower--assignments form operator arguments))
          ('while
           (eliscript-lower--call-node 'loop form 'while arguments))
          ((or 'and 'or)
           (eliscript-lower--call-node
            'short-circuit form operator arguments))
          ('vector
           (eliscript-lower--node
            'persistent-vector-literal form nil
            (mapcar #'eliscript-lower-expression arguments)))
          ('hash-map
           (eliscript-lower--node
            'persistent-map-literal form nil
            (mapcar #'eliscript-lower-expression arguments)))
          ('hash-set
           (eliscript-lower--node
            'persistent-set-literal form nil
            (mapcar #'eliscript-lower-expression arguments)))
          ('list
           (eliscript-lower--node
            'persistent-list-literal form nil
            (mapcar #'eliscript-lower-expression arguments)))
          ('js-array
           (eliscript-lower--node
            'array-literal form nil
            (mapcar #'eliscript-lower-expression arguments)))
          ((pred (lambda (name) (memq name eliscript-lower--intrinsics)))
           (eliscript-lower--call-node 'intrinsic form operator arguments))
          ('js-object
           (eliscript-lower--object form arguments))
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

(defun eliscript-lower--import (form arguments &optional portable)
  "Lower import ARGUMENTS from top-level FORM.

Mark the resulting declaration PORTABLE when it came from `import-portable'."
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
     'import-declaration form source (nreverse children)
     (and portable (list :portable t)))))

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
          ('import-portable (eliscript-lower--import form arguments t))
          ((or 'defvar 'defconst)
           (eliscript-lower--node
            'variable-declaration form
            (eliscript-form-value (car arguments))
            (and (cdr arguments)
                 (list (eliscript-lower-expression (cadr arguments))))
            (list :source-operator operator
                  :mutable (eq operator 'defvar))))
          ((or 'defun 'defn 'defportable 'defasync)
           (let ((parameters
                  (eliscript-lower--parameter-nodes (nth 1 arguments))))
             (let ((eliscript-lower--recur-targets '(function)))
               (eliscript-lower--node
                'function-declaration form
                (eliscript-form-value (nth 0 arguments))
                (append parameters
                        (mapcar #'eliscript-lower-expression
                                (nthcdr 2 arguments)))
                (list :parameter-count (length parameters)
                      :source-operator operator
                      :portable (eq operator 'defportable)
                      :async (eq operator 'defasync))))))
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
  (let ((eliscript-lower--recur-targets nil))
    (eliscript-ir-make-program
     filename (mapcar #'eliscript-lower-top-level forms))))

(provide 'eliscript-lower)

;;; eliscript-lower.el ends here
