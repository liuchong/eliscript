;;; eliscript-ir-emitter.el --- Direct ECMAScript emission from IR -*- lexical-binding: t; -*-

;;; Commentary:

;; This backend consumes analyzed IR without reconstructing reader-shaped
;; forms.  It intentionally shares only formatting and symbol helpers with the
;; compatibility form emitter so both backends keep byte-identical output.

;;; Code:

(require 'cl-lib)
(require 'seq)
(require 'subr-x)
(require 'eliscript-emitter)
(require 'eliscript-ir)
(require 'eliscript-source-map)

(defvar eliscript-ir-emitter--record-source-spans nil)

(defconst eliscript-ir-emitter--react-runtime-binding
  "__eliscript_react_jsx_runtime"
  "Internal namespace binding for the automatic React JSX runtime.")

(defun eliscript-ir-emitter--locate (node output)
  "Mark OUTPUT with NODE's source span when source-map recording is active."
  (if eliscript-ir-emitter--record-source-spans
      (eliscript-source-map-mark output (eliscript-ir-node-span node))
    output))

(defun eliscript-ir-emitter--emit-binding-name (node)
  "Emit the binding name represented by NODE with its source location."
  (eliscript-ir-emitter--locate
   node
   (eliscript-emitter--binding-name (eliscript-ir-node-value node))))

(defun eliscript-ir-emitter--emit-parameter (node)
  "Emit function parameter binding NODE."
  (let ((name (eliscript-ir-emitter--emit-binding-name node)))
    (pcase (eliscript-ir-property node :parameter-kind)
      ('optional (concat name " = null"))
      ('rest (concat "..." name))
      (_ name))))

(defun eliscript-ir-emitter--children (node)
  "Return NODE's child list."
  (or (eliscript-ir-node-children node) nil))

(defun eliscript-ir-emitter--require-arity (node minimum &optional maximum)
  "Require NODE to have between MINIMUM and MAXIMUM children."
  (eliscript-emitter--require-arity
   (symbol-name (or (eliscript-ir-node-value node)
                    (eliscript-ir-node-kind node)))
   (eliscript-ir-emitter--children node)
   minimum maximum))

(defun eliscript-ir-emitter--emit-arguments (nodes)
  "Emit comma-separated argument NODES."
  (mapconcat #'eliscript-ir-emitter-emit-expression nodes ", "))

(defun eliscript-ir-emitter--emit-callee (node)
  "Emit NODE in a position where ECMAScript expects a callable value."
  (let ((output (eliscript-ir-emitter-emit-expression node)))
    (if (eq (eliscript-ir-node-kind node) 'reference)
        output
      (format "(%s)" output))))

(defun eliscript-ir-emitter--emit-returning-body (nodes)
  "Emit NODES as a block body that returns its final value."
  (if (null nodes)
      "return null;"
    (let ((initial (butlast nodes))
          (final (car (last nodes))))
      (mapconcat
       #'identity
       (append
        (mapcar (lambda (node)
                  (concat (eliscript-ir-emitter-emit-expression node) ";"))
                initial)
        (list (concat "return "
                      (eliscript-ir-emitter-emit-expression final)
                      ";")))
       "\n"))))

(defun eliscript-ir-emitter--emit-do (nodes)
  "Emit NODES as one value-producing expression."
  (pcase (length nodes)
    (0 "null")
    (1 (eliscript-ir-emitter-emit-expression (car nodes)))
    (_ (format "(() => {\n%s\n})()"
               (eliscript-emitter--indent
                (eliscript-ir-emitter--emit-returning-body nodes))))))

(defun eliscript-ir-emitter--split-counted-children (node property)
  "Split NODE children using count PROPERTY."
  (let* ((children (eliscript-ir-emitter--children node))
         (count (eliscript-ir-property node property)))
    (list (cl-subseq children 0 count)
          (nthcdr count children))))

(defun eliscript-ir-emitter--emit-function (node)
  "Emit function expression NODE."
  (pcase-let ((`(,parameters ,body)
               (eliscript-ir-emitter--split-counted-children
                node :parameter-count)))
    (format "(%s) => {\n%s\n}"
            (mapconcat
             (lambda (parameter)
               (eliscript-ir-emitter--emit-parameter parameter))
             parameters ", ")
            (eliscript-emitter--indent
             (eliscript-ir-emitter--emit-returning-body body)))))

(defun eliscript-ir-emitter--emit-if (nodes)
  "Emit conditional child NODES."
  (format "(__eliscript_truthy(%s) ? %s : %s)"
          (eliscript-ir-emitter-emit-expression (nth 0 nodes))
          (eliscript-ir-emitter-emit-expression (nth 1 nodes))
          (if (nth 2 nodes)
              (eliscript-ir-emitter-emit-expression (nth 2 nodes))
            "null")))

(defun eliscript-ir-emitter--emit-conditional-sugar (node)
  "Emit when or unless NODE."
  (let* ((children (eliscript-ir-emitter--children node))
         (test (eliscript-ir-emitter-emit-expression (car children)))
         (body (eliscript-ir-emitter--emit-do (cdr children))))
    (if (eq (eliscript-ir-node-value node) 'when)
        (format "(__eliscript_truthy(%s) ? %s : null)" test body)
      (format "(__eliscript_truthy((!__eliscript_truthy(%s))) ? %s : null)"
              test body))))

(defun eliscript-ir-emitter--emit-cond (clauses)
  "Emit nested conditional expressions for IR CLAUSES."
  (if (null clauses)
      "null"
    (let* ((clause (car clauses))
           (children (eliscript-ir-emitter--children clause))
           (test (car children))
           (body (cdr children)))
      (eliscript-ir-emitter--locate
       clause
       (if (and (eq (eliscript-ir-node-kind test) 'literal)
                (eq (eliscript-ir-node-value test) t))
           (eliscript-ir-emitter--emit-do body)
         (format "(__eliscript_truthy(%s) ? %s : %s)"
                 (eliscript-ir-emitter-emit-expression test)
                 (eliscript-ir-emitter--emit-do body)
                 (eliscript-ir-emitter--emit-cond (cdr clauses))))))))

(defun eliscript-ir-emitter--emit-let (node)
  "Emit lexical binding NODE."
  (pcase-let* ((`(,bindings ,body)
                (eliscript-ir-emitter--split-counted-children
                 node :binding-count))
               (sequential (eliscript-ir-property node :sequential)))
    (cond
     ((not sequential)
      (eliscript-ir-emitter--emit-let-parts bindings body nil))
     ((null bindings) (eliscript-ir-emitter--emit-do body))
     (t
      (eliscript-ir-emitter--emit-let-parts
       (list (car bindings))
       (list (cons (cdr bindings) body))
       t)))))

(defun eliscript-ir-emitter--emit-let-parts (bindings body sequential-tail)
  "Emit BINDINGS and BODY, nesting SEQUENTIAL-TAIL when requested."
  (let ((names
         (mapcar (lambda (binding)
                   (eliscript-ir-emitter--emit-binding-name binding))
                 bindings))
        (values
         (mapcar (lambda (binding)
                   (let ((initializer
                          (car (eliscript-ir-emitter--children binding))))
                     (if initializer
                         (eliscript-ir-emitter-emit-expression initializer)
                       "null")))
                 bindings)))
    (format "((%s) => {\n%s\n})(%s)"
            (string-join names ", ")
            (eliscript-emitter--indent
             (if sequential-tail
                 (let* ((tail (car body))
                        (remaining-bindings (car tail))
                        (remaining-body (cdr tail)))
                   (concat
                    "return "
                    (if remaining-bindings
                        (eliscript-ir-emitter--emit-let-parts
                         (list (car remaining-bindings))
                         (list (cons (cdr remaining-bindings) remaining-body))
                         t)
                      (eliscript-ir-emitter--emit-do remaining-body))
                    ";"))
               (eliscript-ir-emitter--emit-returning-body body)))
            (string-join values ", "))))

(defun eliscript-ir-emitter--emit-assignment (node)
  "Emit assignment NODE."
  (let* ((operator (eliscript-ir-node-value node))
         (pairs (eliscript-ir-emitter--children node))
         (assignments
          (mapcar
           (lambda (pair)
             (eliscript-ir-emitter--locate
              pair
              (format "(%s = %s)"
                      (eliscript-ir-emitter--emit-binding-name pair)
                      (eliscript-ir-emitter-emit-expression
                       (car (eliscript-ir-emitter--children pair))))))
           pairs)))
    (if (eq operator 'set!)
        (car assignments)
      (format "(%s)" (string-join assignments ", ")))))

(defun eliscript-ir-emitter--emit-loop (node)
  "Emit value-producing loop NODE."
  (let* ((children (eliscript-ir-emitter--children node))
         (test (car children))
         (body (cdr children)))
    (format "(() => {\n%s\n})()"
            (eliscript-emitter--indent
             (concat
              (format "while (__eliscript_truthy(%s)) {\n"
                      (eliscript-ir-emitter-emit-expression test))
              (eliscript-emitter--indent
               (mapconcat
                (lambda (child)
                  (concat (eliscript-ir-emitter-emit-expression child) ";"))
                body "\n"))
              "\n}\nreturn null;")))))

(defun eliscript-ir-emitter--emit-short-circuit (nodes kind)
  "Emit Lisp-style short-circuit NODES for KIND."
  (cond
   ((null nodes) (if (eq kind 'and) "true" "null"))
   ((null (cdr nodes))
    (eliscript-ir-emitter-emit-expression (car nodes)))
   (t
    (let ((temporary (eliscript-emitter--fresh-name))
          (first (eliscript-ir-emitter-emit-expression (car nodes)))
          (rest (eliscript-ir-emitter--emit-short-circuit (cdr nodes) kind)))
      (format "((%s) => (__eliscript_truthy(%s) ? %s : %s))(%s)"
              temporary temporary
              (if (eq kind 'and) rest temporary)
              (if (eq kind 'and) temporary rest)
              first)))))

(defun eliscript-ir-emitter--emit-infix (name nodes operator &optional minimum)
  "Emit NODES joined by OPERATOR for intrinsic NAME."
  (eliscript-emitter--require-arity name nodes (or minimum 2))
  (format "(%s)"
          (mapconcat #'eliscript-ir-emitter-emit-expression
                     nodes (format " %s " operator))))

(defun eliscript-ir-emitter--emit-comparison (name nodes operator)
  "Emit one-evaluation n-ary comparison NAME over NODES using OPERATOR."
  (eliscript-emitter--require-arity name nodes 2)
  (let ((parameters
         (mapcar (lambda (_node) (eliscript-emitter--fresh-name)) nodes))
        comparisons)
    (cl-loop for left on parameters
             while (cdr left)
             do (push (format "%s %s %s" (car left) operator (cadr left))
                      comparisons))
    (format "((%s) => (%s))(%s)"
            (string-join parameters ", ")
            (string-join (nreverse comparisons) " && ")
            (eliscript-ir-emitter--emit-arguments nodes))))

(defun eliscript-ir-emitter--emit-distinct (name nodes)
  "Emit a one-evaluation pairwise distinct comparison for NAME and NODES."
  (eliscript-emitter--require-arity name nodes 2)
  (let ((parameters
         (mapcar (lambda (_node) (eliscript-emitter--fresh-name)) nodes))
        comparisons)
    (cl-loop for left-index from 0 below (length parameters)
             do (cl-loop for right-index from (1+ left-index)
                         below (length parameters)
                         do (push
                             (format "%s !== %s"
                                     (nth left-index parameters)
                                     (nth right-index parameters))
                             comparisons)))
    (format "((%s) => (%s))(%s)"
            (string-join parameters ", ")
            (string-join (nreverse comparisons) " && ")
            (eliscript-ir-emitter--emit-arguments nodes))))

(defun eliscript-ir-emitter--emit-intrinsic (node)
  "Emit intrinsic operation NODE."
  (let ((name (eliscript-ir-node-value node))
        (nodes (eliscript-ir-emitter--children node)))
    (pcase name
      ('not
       (eliscript-ir-emitter--require-arity node 1 1)
       (format "(!__eliscript_truthy(%s))"
               (eliscript-ir-emitter-emit-expression (car nodes))))
      ('+ (if nodes
              (format "(%s)"
                      (mapconcat #'eliscript-ir-emitter-emit-expression
                                 nodes " + "))
            "0"))
      ('* (if nodes
              (format "(%s)"
                      (mapconcat #'eliscript-ir-emitter-emit-expression
                                 nodes " * "))
            "1"))
      ('-
       (eliscript-ir-emitter--require-arity node 1)
       (if (null (cdr nodes))
           (format "(-%s)"
                   (eliscript-ir-emitter-emit-expression (car nodes)))
         (eliscript-ir-emitter--emit-infix "-" nodes "-")))
      ('/
       (eliscript-ir-emitter--require-arity node 1)
       (if (null (cdr nodes))
           (format "(1 / %s)"
                   (eliscript-ir-emitter-emit-expression (car nodes)))
         (eliscript-ir-emitter--emit-infix "/" nodes "/")))
      ((or '% 'mod)
       (eliscript-ir-emitter--emit-infix (symbol-name name) nodes "%"))
      ('= (eliscript-ir-emitter--emit-comparison "=" nodes "==="))
      ((or '/= 'not=)
       (eliscript-ir-emitter--emit-distinct (symbol-name name) nodes))
      ('< (eliscript-ir-emitter--emit-comparison "<" nodes "<"))
      ('<= (eliscript-ir-emitter--emit-comparison "<=" nodes "<="))
      ('> (eliscript-ir-emitter--emit-comparison ">" nodes ">"))
      ('>= (eliscript-ir-emitter--emit-comparison ">=" nodes ">="))
      ('1+
       (eliscript-ir-emitter--require-arity node 1 1)
       (format "(%s + 1)"
               (eliscript-ir-emitter-emit-expression (car nodes))))
      ('1-
       (eliscript-ir-emitter--require-arity node 1 1)
       (format "(%s - 1)"
               (eliscript-ir-emitter-emit-expression (car nodes))))
      ((or 'eq 'equal)
       (eliscript-ir-emitter--require-arity node 2 2)
       (format "(%s === %s)"
               (eliscript-ir-emitter-emit-expression (nth 0 nodes))
               (eliscript-ir-emitter-emit-expression (nth 1 nodes))))
      ('nil?
       (eliscript-ir-emitter--require-arity node 1 1)
       (format "(%s === null)"
               (eliscript-ir-emitter-emit-expression (car nodes))))
      ('undefined?
       (eliscript-ir-emitter--require-arity node 1 1)
       (format "(%s === undefined)"
               (eliscript-ir-emitter-emit-expression (car nodes))))
      ((or 'null 'nullish?)
       (eliscript-ir-emitter--require-arity node 1 1)
       (format "(%s == null)"
               (eliscript-ir-emitter-emit-expression (car nodes))))
      ((or 'list 'vector 'array)
       (format "[%s]" (eliscript-ir-emitter--emit-arguments nodes)))
      ('car
       (eliscript-ir-emitter--require-arity node 1 1)
       (format "(((%s) ?? [])[0] ?? null)"
               (eliscript-ir-emitter-emit-expression (car nodes))))
      ('cdr
       (eliscript-ir-emitter--require-arity node 1 1)
       (format "((%s) ?? []).slice(1)"
               (eliscript-ir-emitter-emit-expression (car nodes))))
      ('cons
       (eliscript-ir-emitter--require-arity node 2 2)
       (format "[%s, ...((%s) ?? [])]"
               (eliscript-ir-emitter-emit-expression (nth 0 nodes))
               (eliscript-ir-emitter-emit-expression (nth 1 nodes))))
      ('nth
       (eliscript-ir-emitter--require-arity node 2 2)
       (format "((((%s) ?? [])[%s]) ?? null)"
               (eliscript-ir-emitter-emit-expression (nth 1 nodes))
               (eliscript-ir-emitter-emit-expression (nth 0 nodes))))
      ('aref
       (eliscript-ir-emitter--require-arity node 2 2)
       (format "(%s)[%s]"
               (eliscript-ir-emitter-emit-expression (nth 0 nodes))
               (eliscript-ir-emitter-emit-expression (nth 1 nodes))))
      ('length
       (eliscript-ir-emitter--require-arity node 1 1)
       (format "((%s) ?? []).length"
               (eliscript-ir-emitter-emit-expression (car nodes))))
      ('object-keys
       (eliscript-ir-emitter--require-arity node 1 1)
       (format "Object.keys((%s) ?? {})"
               (eliscript-ir-emitter-emit-expression (car nodes))))
      ('object-has?
       (eliscript-ir-emitter--require-arity node 2 2)
       (format "Object.prototype.hasOwnProperty.call((%s) ?? {}, %s)"
               (eliscript-ir-emitter-emit-expression (nth 0 nodes))
               (eliscript-ir-emitter-emit-expression (nth 1 nodes))))
      ('object-assoc
       (eliscript-ir-emitter--require-arity node 3 3)
       (format "({...((%s) ?? {}), [%s]: %s})"
               (eliscript-ir-emitter-emit-expression (nth 0 nodes))
               (eliscript-ir-emitter-emit-expression (nth 1 nodes))
               (eliscript-ir-emitter-emit-expression (nth 2 nodes))))
      (_ (eliscript-emitter--fail "unknown IR intrinsic: %S" name)))))

(defun eliscript-ir-emitter--emit-object-key (key)
  "Emit literal object property KEY."
  (cond
   ((keywordp key)
    (eliscript-emitter--json-string (substring (symbol-name key) 1)))
   ((stringp key) (eliscript-emitter--json-string key))
   ((symbolp key) (eliscript-emitter--json-string (symbol-name key)))
   (t (eliscript-emitter--fail "invalid literal object key: %S" key))))

(defun eliscript-ir-emitter--emit-object-properties (properties)
  "Emit object literal PROPERTIES without surrounding braces."
  (mapconcat
    (lambda (property)
      (let ((children (eliscript-ir-emitter--children property)))
        (eliscript-ir-emitter--locate
         property
         (if (eliscript-ir-property property :computed)
             (format "[%s]: %s"
                     (eliscript-ir-emitter-emit-expression (nth 0 children))
                     (eliscript-ir-emitter-emit-expression (nth 1 children)))
           (format "%s: %s"
                   (eliscript-ir-emitter--emit-object-key
                    (eliscript-ir-node-value property))
                   (eliscript-ir-emitter-emit-expression (car children)))))))
    properties
    ", "))

(defun eliscript-ir-emitter--emit-object (node)
  "Emit object literal NODE."
  (format
   "({%s})"
   (eliscript-ir-emitter--emit-object-properties
    (eliscript-ir-emitter--children node))))

(defun eliscript-ir-emitter--emit-property-key (node)
  "Emit property-key NODE for bracket-style access."
  (eliscript-ir-emitter--locate
   node
   (if (eq (eliscript-ir-node-kind node) 'literal)
       (let ((value (eliscript-ir-node-value node)))
         (cond
          ((keywordp value)
           (eliscript-emitter--json-string (substring (symbol-name value) 1)))
          ((stringp value) (eliscript-emitter--json-string value))
          (t (eliscript-ir-emitter-emit-expression node))))
     (eliscript-ir-emitter-emit-expression node))))

(defun eliscript-ir-emitter--emit-literal (value)
  "Emit scalar literal VALUE."
  (cond
   ((null value) "null")
   ((eq value t) "true")
   ((numberp value)
    (let ((text (number-to-string value)))
      (when (string-match-p "INF\\|NaN" text)
        (eliscript-emitter--fail
         "non-finite numbers are not supported: %S" value))
      text))
   ((stringp value) (eliscript-emitter--json-string value))
   ((keywordp value)
    (eliscript-emitter--json-string (substring (symbol-name value) 1)))
   ((eq value 'false) "false")
   ((eq value 'undefined) "undefined")
   (t (eliscript-emitter--fail "unsupported IR literal: %S" value))))

(defun eliscript-ir-emitter--emit-react-type (node)
  "Emit React element type NODE."
  (let ((value (eliscript-ir-node-value node)))
    (if (and (eq (eliscript-ir-node-kind node) 'literal)
             (or (keywordp value) (stringp value)))
        (eliscript-emitter--json-string
         (if (keywordp value) (substring (symbol-name value) 1) value))
      (eliscript-ir-emitter-emit-expression node))))

(defun eliscript-ir-emitter--react-key-property-p (property)
  "Return non-nil when PROPERTY is a static React key property."
  (and (eq (eliscript-ir-node-kind property) 'object-property)
       (not (eliscript-ir-property property :computed))
       (let ((key (eliscript-ir-node-value property)))
         (string-equal
          (cond
           ((keywordp key) (substring (symbol-name key) 1))
           ((symbolp key) (symbol-name key))
           ((stringp key) key)
           (t ""))
          "key"))))

(defun eliscript-ir-emitter--emit-react-props
    (props children &optional omitted-properties)
  "Emit React PROPS with explicit CHILDREN merged in.

Exclude OMITTED-PROPERTIES from an object-literal props node."
  (let* ((empty-props
          (or (null props)
              (and (eq (eliscript-ir-node-kind props) 'literal)
                   (null (eliscript-ir-node-value props)))))
         (props-output
          (unless empty-props
            (if (and omitted-properties
                     (eq (eliscript-ir-node-kind props) 'object-literal))
                (format
                 "({%s})"
                 (eliscript-ir-emitter--emit-object-properties
                  (seq-remove
                   (lambda (property)
                     (memq property omitted-properties))
                   (eliscript-ir-emitter--children props))))
              (eliscript-ir-emitter-emit-expression props))))
         (children-output
          (pcase (length children)
            (0 nil)
            (1 (eliscript-ir-emitter-emit-expression (car children)))
            (_ (format "[%s]"
                       (eliscript-ir-emitter--emit-arguments children))))))
    (cond
     ((and empty-props (null children-output)) "{}")
     (empty-props (format "{children: %s}" children-output))
     ((null children-output) (format "{...((%s) ?? {})}" props-output))
     (t (format "{...((%s) ?? {}), children: %s}"
                props-output children-output)))))

(defun eliscript-ir-emitter--emit-react-element (node)
  "Emit React element or fragment NODE through the automatic JSX runtime."
  (let* ((fragment (eq (eliscript-ir-node-kind node) 'react-fragment))
         (children (eliscript-ir-emitter--children node))
         (type
          (if fragment
              (concat eliscript-ir-emitter--react-runtime-binding ".Fragment")
            (eliscript-ir-emitter--emit-react-type (pop children))))
         (props (unless fragment (pop children)))
         (key-properties
          (and props
               (eq (eliscript-ir-node-kind props) 'object-literal)
               (seq-filter
                #'eliscript-ir-emitter--react-key-property-p
                (eliscript-ir-emitter--children props))))
         (key-property (car (last key-properties)))
         (key-output
          (and key-property
               (eliscript-ir-emitter-emit-expression
                (car (eliscript-ir-emitter--children key-property)))))
         (runtime-function (if (> (length children) 1) "jsxs" "jsx")))
    (format "%s.%s(%s, %s%s)"
            eliscript-ir-emitter--react-runtime-binding
            runtime-function
            type
            (if fragment
                (eliscript-ir-emitter--emit-react-props nil children)
              (eliscript-ir-emitter--emit-react-props
               props children key-properties))
            (if key-output (format ", %s" key-output) ""))))

(defun eliscript-ir-emitter-emit-expression (node)
  "Emit expression IR NODE as ECMAScript."
  (unless (eliscript-ir-node-p node)
    (eliscript-emitter--fail "expected an IR expression node: %S" node))
  (let ((kind (eliscript-ir-node-kind node))
        (children (eliscript-ir-emitter--children node)))
    (eliscript-ir-emitter--locate
     node
     (pcase kind
      ('literal (eliscript-ir-emitter--emit-literal
                 (eliscript-ir-node-value node)))
      ('reference
       (eliscript-emitter--reference-name (eliscript-ir-node-value node)))
      ('array-literal
       (format "[%s]" (eliscript-ir-emitter--emit-arguments children)))
      ('quoted-literal
       (eliscript-emitter--emit-quoted (eliscript-ir-node-value node)))
      ('function-expression (eliscript-ir-emitter--emit-function node))
      ('conditional (eliscript-ir-emitter--emit-if children))
      ('conditional-sugar
       (eliscript-ir-emitter--emit-conditional-sugar node))
      ('conditional-chain (eliscript-ir-emitter--emit-cond children))
      ('sequence (eliscript-ir-emitter--emit-do children))
      ('lexical-bindings (eliscript-ir-emitter--emit-let node))
      ('assignment (eliscript-ir-emitter--emit-assignment node))
      ('loop (eliscript-ir-emitter--emit-loop node))
      ('short-circuit
       (eliscript-ir-emitter--emit-short-circuit
        children (eliscript-ir-node-value node)))
      ('intrinsic (eliscript-ir-emitter--emit-intrinsic node))
      ('object-literal (eliscript-ir-emitter--emit-object node))
      ((or 'react-element 'react-fragment)
       (eliscript-ir-emitter--emit-react-element node))
      ('property-read
       (let ((access
              (format "(%s)[%s]"
                      (eliscript-ir-emitter-emit-expression (nth 0 children))
                      (eliscript-ir-emitter--emit-property-key
                       (nth 1 children)))))
         (if (= (length children) 3)
             (format "(%s ?? %s)" access
                     (eliscript-ir-emitter-emit-expression (nth 2 children)))
           access)))
      ('property-write
       (format "((%s)[%s] = %s)"
               (eliscript-ir-emitter-emit-expression (nth 0 children))
               (eliscript-ir-emitter--emit-property-key (nth 1 children))
               (eliscript-ir-emitter-emit-expression (nth 2 children))))
      ('method-call
       (format "(%s)[%s](%s)"
               (eliscript-ir-emitter-emit-expression (nth 0 children))
               (eliscript-ir-emitter--emit-property-key (nth 1 children))
               (eliscript-ir-emitter--emit-arguments (nthcdr 2 children))))
      ('constructor-call
       (format "new %s(%s)"
               (eliscript-ir-emitter-emit-expression (car children))
               (eliscript-ir-emitter--emit-arguments (cdr children))))
      ('raw-javascript (eliscript-ir-node-value (car children)))
      ('print
       (format "console.log(%s)"
               (eliscript-ir-emitter--emit-arguments children)))
      ('string-concat
       (if (null children)
           "\"\""
         (format "(%s)"
                 (mapconcat
                  (lambda (child)
                    (format "String(%s)"
                            (eliscript-ir-emitter-emit-expression child)))
                  children " + "))))
      ('invoke
       (format "%s(%s)"
               (eliscript-ir-emitter--emit-callee (car children))
               (eliscript-ir-emitter--emit-arguments (cdr children))))
      ('apply-call
       (format "%s(...%s)"
               (eliscript-ir-emitter--emit-callee (car children))
               (eliscript-ir-emitter-emit-expression (nth 1 children))))
      ('call
       (format "%s(%s)"
               (eliscript-ir-emitter--emit-callee (car children))
               (eliscript-ir-emitter--emit-arguments (cdr children))))
       (_ (eliscript-emitter--fail
           "IR node %S is not valid in expression position" kind))))))

(defun eliscript-ir-emitter--emit-import (node)
  "Emit import declaration NODE."
  (let ((module-name (eliscript-ir-node-value node))
        default-binding
        namespace-binding
        named-bindings)
    (dolist (specifier (eliscript-ir-emitter--children node))
      (let ((name (eliscript-ir-emitter--emit-binding-name specifier)))
        (pcase (eliscript-ir-node-kind specifier)
          ('import-default (setq default-binding name))
          ('import-namespace (setq namespace-binding name))
          ('import-named (push name named-bindings))
          (_ (eliscript-emitter--fail
              "invalid IR import specifier: %S"
              (eliscript-ir-node-kind specifier))))))
    (let ((clause
           (string-join
            (delq nil
                  (list default-binding
                        (and namespace-binding (concat "* as " namespace-binding))
                        (and named-bindings
                             (format "{%s}"
                                     (string-join
                                      (nreverse named-bindings) ", ")))))
            ", ")))
      (if (string-empty-p clause)
          (format "import %s;"
                  (eliscript-emitter--json-string module-name))
        (format "import %s from %s;"
                clause (eliscript-emitter--json-string module-name))))))

(defun eliscript-ir-emitter-emit-top-level (node)
  "Emit top-level IR NODE as an ECMAScript declaration or statement."
  (unless (eliscript-ir-node-p node)
    (eliscript-emitter--fail "expected a top-level IR node: %S" node))
  (let ((kind (eliscript-ir-node-kind node))
        (children (eliscript-ir-emitter--children node)))
    (eliscript-ir-emitter--locate
     node
     (pcase kind
      ('module-declaration
       (mapconcat #'eliscript-ir-emitter-emit-top-level children "\n"))
      ('import-declaration (eliscript-ir-emitter--emit-import node))
      ('variable-declaration
       (format "%s %s = %s;"
               (if (eliscript-ir-property node :mutable) "let" "const")
               (eliscript-emitter--binding-name
                (eliscript-ir-node-value node))
               (if children
                   (eliscript-ir-emitter-emit-expression (car children))
                 "null")))
      ('function-declaration
       (pcase-let ((`(,parameters ,body)
                    (eliscript-ir-emitter--split-counted-children
                     node :parameter-count)))
         (format "function %s(%s) {\n%s\n}"
                 (eliscript-emitter--binding-name
                  (eliscript-ir-node-value node))
                 (mapconcat
                  (lambda (parameter)
                    (eliscript-ir-emitter--emit-parameter parameter))
                  parameters ", ")
                 (eliscript-emitter--indent
                  (eliscript-ir-emitter--emit-returning-body body)))))
      ('export-declaration
       (format "export {%s};"
               (mapconcat
                (lambda (reference)
                  (eliscript-ir-emitter--emit-binding-name reference))
                children ", ")))
      ('export-default
       (format "export default %s;"
               (eliscript-ir-emitter-emit-expression (car children))))
      ('expression-statement
       (concat (eliscript-ir-emitter-emit-expression (car children)) ";"))
       (_ (eliscript-emitter--fail
           "IR node %S is not valid at module top level" kind))))))

(defun eliscript-ir-emitter--emit-module (program)
  "Emit IR PROGRAM, retaining source marks when recording is active."
  (unless (eliscript-ir-program-p program)
    (eliscript-emitter--fail "expected an IR program: %S" program))
  (let ((eliscript-emitter--temporary-counter 0)
        uses-react-runtime
        portable-functions
        exported-bindings)
    (eliscript-ir-walk
     program
     (lambda (node)
       (when (memq (eliscript-ir-node-kind node)
                   '(react-element react-fragment))
         (setq uses-react-runtime t))
       (when (and (eq (eliscript-ir-node-kind node) 'function-declaration)
                  (eliscript-ir-property node :portable))
         (push node portable-functions))
       (when (eq (eliscript-ir-node-kind node) 'export-declaration)
         (dolist (reference (eliscript-ir-node-children node))
           (push (eliscript-ir-node-value reference) exported-bindings)))))
    (setq portable-functions (nreverse portable-functions))
    (concat
     "// Generated by Eliscript. Do not edit.\n"
     (if uses-react-runtime
         (format "import * as %s from \"react/jsx-runtime\";\n"
                 eliscript-ir-emitter--react-runtime-binding)
       "")
     "const __eliscript_truthy = (value) => value !== false && value != null;\n\n"
     (mapconcat #'eliscript-ir-emitter-emit-top-level
                (eliscript-ir-program-body program)
                "\n\n")
     (when portable-functions
       (let ((implicit
              (cl-remove-if
               (lambda (node)
                 (memq (eliscript-ir-node-value node) exported-bindings))
               portable-functions)))
         (concat
          (when implicit
            (format "\n\nexport {%s};"
                    (mapconcat
                     (lambda (node)
                       (eliscript-emitter--binding-name
                        (eliscript-ir-node-value node)))
                     implicit ", ")))
          "\nexport const __eliscript_portable__ = Object.freeze(Object.fromEntries(["
          (mapconcat
           (lambda (node)
             (format "[%s, %s]"
                     (eliscript-emitter--json-string
                      (symbol-name (eliscript-ir-node-value node)))
                     (eliscript-emitter--binding-name
                      (eliscript-ir-node-value node))))
           portable-functions ", ")
          "]));")))
     "\n")))

(defun eliscript-emit-ir-module (program)
  "Emit analyzed IR PROGRAM directly as one ECMAScript module."
  (substring-no-properties
   (eliscript-ir-emitter--emit-module program)))

(defun eliscript-emit-ir-module-with-source-map
    (program source &optional generated-name source-name)
  "Emit IR PROGRAM and a Source Map v3 document for SOURCE.

GENERATED-NAME and SOURCE-NAME identify files in the source map.  Return an
`eliscript-emission' containing plain JavaScript and source-map JSON."
  (let* ((eliscript-ir-emitter--record-source-spans t)
         (generated (eliscript-ir-emitter--emit-module program))
         (resolved-source-name
          (or source-name (eliscript-ir-program-filename program) "<string>")))
    (eliscript-emission-create
     :javascript (substring-no-properties generated)
     :source-map
     (eliscript-source-map-create
      generated source resolved-source-name generated-name))))

(provide 'eliscript-ir-emitter)

;;; eliscript-ir-emitter.el ends here
