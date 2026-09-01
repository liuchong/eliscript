;;; eliscript-ir.el --- Intermediate representation for Eliscript -*- lexical-binding: t; -*-

;;; Commentary:

;; The IR separates analyzed language semantics from reader-shaped forms.  It
;; deliberately keeps source spans on every node so later emitters can produce
;; source maps without consulting the reader representation.

;;; Code:

(require 'cl-lib)

(cl-defstruct (eliscript-ir-program
               (:constructor eliscript-ir-program-create))
  filename
  body)

(cl-defstruct (eliscript-ir-node
               (:constructor eliscript-ir-node-create))
  kind
  span
  value
  children
  properties)

(defconst eliscript-ir-node-kinds
  '(module-declaration import-declaration import-default import-namespace
    import-named variable-declaration function-declaration export-declaration
    export-default expression-statement parameter-binding
    array-binding-pattern binding-name binding-hole reference literal
    array-literal persistent-list-literal persistent-vector-literal
    persistent-map-literal persistent-set-literal
    quoted-literal function-expression await-expression
    throw-expression try-expression catch-clause catch-binding finally-clause
    conditional conditional-sugar
    conditional-chain conditional-clause sequence lexical-bindings
    lexical-binding assignment assignment-pair loop binding-loop recur
    short-circuit intrinsic
    object-literal object-property property-read property-write method-call
    constructor-call raw-javascript print string-concat invoke apply-call call)
  "Public node kinds emitted by the lowering pass.")

(defun eliscript-ir-make-program (filename body)
  "Create an IR program for FILENAME from top-level node BODY."
  (unless (proper-list-p body)
    (error "IR program body must be a proper list: %S" body))
  (when (cl-find-if-not #'eliscript-ir-node-p body)
    (error "IR program body must contain only IR nodes: %S" body))
  (eliscript-ir-program-create :filename filename :body body))

(defun eliscript-ir-make-node (kind span &optional value children properties)
  "Create an IR node of KIND at SPAN with VALUE, CHILDREN, and PROPERTIES."
  (unless (memq kind eliscript-ir-node-kinds)
    (error "Unknown Eliscript IR node kind: %S" kind))
  (unless (or (null children) (proper-list-p children))
    (error "IR node children must be a proper list: %S" children))
  (when (cl-find-if-not #'eliscript-ir-node-p children)
    (error "IR node children must all be IR nodes: %S" children))
  (eliscript-ir-node-create
   :kind kind
   :span span
   :value value
   :children children
   :properties properties))

(defun eliscript-ir-property (node property)
  "Return PROPERTY from IR NODE's property list."
  (plist-get (eliscript-ir-node-properties node) property))

(defun eliscript-ir-walk (program function)
  "Call FUNCTION in preorder for every node reachable from IR PROGRAM."
  (unless (eliscript-ir-program-p program)
    (error "Expected an Eliscript IR program: %S" program))
  (cl-labels ((walk-node
               (node)
               (funcall function node)
               (mapc #'walk-node (eliscript-ir-node-children node))))
    (mapc #'walk-node (eliscript-ir-program-body program))))

(defun eliscript-ir--binding-to-form (node)
  "Convert lexical binding NODE to a reader-shaped form."
  (let* ((pattern (eliscript-ir-property node :pattern))
         (children (eliscript-ir-node-children node))
         (name (if pattern
                   (eliscript-ir-node-to-form (car children))
                 (eliscript-ir-node-value node)))
         (values (if pattern (cdr children) children)))
    (pcase (eliscript-ir-property node :style)
      ('symbol name)
      (_ (if values
             (list name (eliscript-ir-node-to-form (car values)))
           (list name))))))

(defun eliscript-ir--binding-target-to-form (node)
  "Convert binding wrapper NODE to its reader-shaped target."
  (if (eliscript-ir-property node :pattern)
      (eliscript-ir-node-to-form (car (eliscript-ir-node-children node)))
    (eliscript-ir-node-value node)))

(defun eliscript-ir--operator-form (node)
  "Convert operator-style IR NODE to a reader-shaped form."
  (cons (eliscript-ir-node-value node)
        (mapcar #'eliscript-ir-node-to-form
                (eliscript-ir-node-children node))))

(defun eliscript-ir--parameters-to-form (nodes)
  "Convert parameter binding NODES to a canonical parameter list."
  (let (forms optional-marker)
    (dolist (node nodes)
      (pcase (eliscript-ir-property node :parameter-kind)
        ('optional
         (unless optional-marker
           (push '&optional forms)
           (setq optional-marker t)))
        ('rest (push '&rest forms)))
      (push (eliscript-ir--binding-target-to-form node) forms))
    (nreverse forms)))

(defun eliscript-ir-node-to-form (node)
  "Convert IR NODE to a canonical reader-shaped form for compatibility."
  (unless (eliscript-ir-node-p node)
    (error "Expected an Eliscript IR node: %S" node))
  (pcase (eliscript-ir-node-kind node)
    ((or 'literal 'reference 'binding-name)
     (eliscript-ir-node-value node))
    ((or 'parameter-binding 'catch-binding)
     (eliscript-ir--binding-target-to-form node))
    ('binding-hole nil)
    ('array-binding-pattern
     (let* ((children (eliscript-ir-node-children node))
            (forms (mapcar #'eliscript-ir-node-to-form children)))
       (when (eliscript-ir-property node :rest)
         (setq forms
               (append (butlast forms)
                       (list '&rest (car (last forms))))))
       (apply #'vector forms)))
    ('quoted-literal
     (list 'quote (eliscript-ir-node-value node)))
    ('array-literal
     (cons 'js-array
           (mapcar #'eliscript-ir-node-to-form
                   (eliscript-ir-node-children node))))
    ('persistent-list-literal
     (cons 'list
           (mapcar #'eliscript-ir-node-to-form
                   (eliscript-ir-node-children node))))
    ('persistent-vector-literal
     (cons 'vector
           (mapcar #'eliscript-ir-node-to-form
                   (eliscript-ir-node-children node))))
    ('persistent-map-literal
     (cons 'hash-map
           (mapcar #'eliscript-ir-node-to-form
                   (eliscript-ir-node-children node))))
    ('persistent-set-literal
     (cons 'hash-set
           (mapcar #'eliscript-ir-node-to-form
                   (eliscript-ir-node-children node))))
    ('module-declaration
     (cons 'module
           (cons (eliscript-ir-node-value node)
                 (mapcar #'eliscript-ir-node-to-form
                         (eliscript-ir-node-children node)))))
    ('import-declaration
     (cons (if (eliscript-ir-property node :portable)
               'import-portable
             'import)
           (cons
            (eliscript-ir-node-value node)
            (apply
             #'append
             (mapcar
              (lambda (specifier)
                (pcase (eliscript-ir-node-kind specifier)
                  ('import-default
                   (list :default (eliscript-ir-node-value specifier)))
                  ('import-namespace
                   (list :as (eliscript-ir-node-value specifier)))
                  ('import-named (list (eliscript-ir-node-value specifier)))))
              (eliscript-ir-node-children node))))))
    ('variable-declaration
     (cons (eliscript-ir-property node :source-operator)
           (cons (eliscript-ir-node-value node)
                 (mapcar #'eliscript-ir-node-to-form
                         (eliscript-ir-node-children node)))))
    ((or 'function-declaration 'function-expression)
     (let* ((operator
            (if (eq (eliscript-ir-node-kind node) 'function-declaration)
                (or (eliscript-ir-property node :source-operator) 'defun)
              (if (eliscript-ir-property node :async) 'async 'lambda)))
            (children (eliscript-ir-node-children node))
            (parameter-count (eliscript-ir-property node :parameter-count))
           (parameters
            (eliscript-ir--parameters-to-form
             (cl-subseq children 0 parameter-count)))
           (body (mapcar #'eliscript-ir-node-to-form
                         (nthcdr parameter-count children))))
       (if (memq operator '(defun defn defportable defasync))
           (cons operator
                 (cons (eliscript-ir-node-value node)
                       (cons parameters body)))
         (cons operator (cons parameters body)))))
    ('await-expression
     (list 'await
           (eliscript-ir-node-to-form
            (car (eliscript-ir-node-children node)))))
    ('throw-expression
     (list 'throw
           (eliscript-ir-node-to-form
            (car (eliscript-ir-node-children node)))))
    ('try-expression
     (let* ((children (eliscript-ir-node-children node))
            (body-count (eliscript-ir-property node :body-count)))
       (cons
        'try
        (append
         (mapcar #'eliscript-ir-node-to-form
                 (cl-subseq children 0 body-count))
         (mapcar #'eliscript-ir-node-to-form
                 (nthcdr body-count children))))))
    ('catch-clause
     (let ((children (eliscript-ir-node-children node)))
       (cons
        'catch
        (cons
         (eliscript-ir--binding-target-to-form (car children))
         (mapcar #'eliscript-ir-node-to-form (cdr children))))))
    ('finally-clause
     (cons 'finally
           (mapcar #'eliscript-ir-node-to-form
                   (eliscript-ir-node-children node))))
    ('export-declaration
     (cons 'export
           (mapcar #'eliscript-ir-node-value
                   (eliscript-ir-node-children node))))
    ('export-default
     (list 'export-default
           (eliscript-ir-node-to-form
            (car (eliscript-ir-node-children node)))))
    ('expression-statement
     (eliscript-ir-node-to-form (car (eliscript-ir-node-children node))))
    ('conditional-chain
     (cons 'cond
           (mapcar #'eliscript-ir-node-to-form
                   (eliscript-ir-node-children node))))
    ('conditional-clause
     (mapcar #'eliscript-ir-node-to-form
             (eliscript-ir-node-children node)))
    ('lexical-bindings
     (let* ((children (eliscript-ir-node-children node))
            (binding-count (eliscript-ir-property node :binding-count)))
       (cons (if (eliscript-ir-property node :sequential) 'let* 'let)
             (cons
              (mapcar #'eliscript-ir--binding-to-form
                      (cl-subseq children 0 binding-count))
              (mapcar #'eliscript-ir-node-to-form
                      (nthcdr binding-count children))))))
    ('binding-loop
     (let* ((children (eliscript-ir-node-children node))
            (binding-count (eliscript-ir-property node :binding-count)))
       (cons
        'loop
        (cons
         (mapcar #'eliscript-ir--binding-to-form
                 (cl-subseq children 0 binding-count))
         (mapcar #'eliscript-ir-node-to-form
                 (nthcdr binding-count children))))))
    ('recur
     (cons 'recur
           (mapcar #'eliscript-ir-node-to-form
                   (eliscript-ir-node-children node))))
    ('lexical-binding (eliscript-ir--binding-to-form node))
    ('assignment
     (cons (eliscript-ir-node-value node)
           (apply
            #'append
            (mapcar
             (lambda (pair)
               (list (eliscript-ir-node-value pair)
                     (eliscript-ir-node-to-form
                      (car (eliscript-ir-node-children pair)))))
             (eliscript-ir-node-children node)))))
    ('assignment-pair
     (error "Assignment pairs are emitted through their parent node"))
    ('object-literal
     (cons
      'js-object
      (apply
       #'append
       (mapcar
        (lambda (property)
          (if (eliscript-ir-property property :computed)
              (list
               (eliscript-ir-node-to-form
                (nth 0 (eliscript-ir-node-children property)))
               (eliscript-ir-node-to-form
                (nth 1 (eliscript-ir-node-children property))))
            (list
             (eliscript-ir-node-value property)
             (eliscript-ir-node-to-form
              (car (eliscript-ir-node-children property))))))
        (eliscript-ir-node-children node)))))
    ('object-property
     (error "Object properties are emitted through their parent node"))
    ((or 'import-default 'import-namespace 'import-named)
     (error "Import specifiers are emitted through their parent node"))
    ('call
     (mapcar #'eliscript-ir-node-to-form
             (eliscript-ir-node-children node)))
    ((or 'conditional 'conditional-sugar 'sequence 'loop 'short-circuit
         'intrinsic 'property-read 'property-write 'method-call
         'constructor-call 'raw-javascript 'print 'string-concat 'invoke
         'apply-call)
     (eliscript-ir--operator-form node))
    (_ (error "Cannot convert IR node kind to a form: %S"
              (eliscript-ir-node-kind node)))))

(defun eliscript-ir-program-to-forms (program)
  "Convert IR PROGRAM to canonical reader-shaped module forms."
  (unless (eliscript-ir-program-p program)
    (error "Expected an Eliscript IR program: %S" program))
  (mapcar #'eliscript-ir-node-to-form
          (eliscript-ir-program-body program)))

(provide 'eliscript-ir)

;;; eliscript-ir.el ends here
