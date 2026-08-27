;;; eliscript-analyzer.el --- Lexical analysis for Eliscript -*- lexical-binding: t; -*-

;;; Commentary:

;; The analyzer validates lexical bindings before emission.  It intentionally
;; returns the original forms for now; a documented IR will replace that pass-
;; through boundary in a later M1 slice.

;;; Code:

(require 'cl-lib)
(require 'eliscript-diagnostic)
(require 'eliscript-symbol)

(cl-defstruct (eliscript-analyzer--binding
               (:constructor eliscript-analyzer--binding-create))
  name
  output-name
  kind
  mutable)

(cl-defstruct (eliscript-analyzer--scope
               (:constructor eliscript-analyzer--scope-create))
  parent
  names
  outputs)

(defconst eliscript-analyzer--builtin-operators
  '(if when unless progn do while and or not
    + * - / % mod = /= not= < <= > >= 1+ 1-
    eq equal null list vector array car cdr cons nth aref length
    new print str funcall apply))

(defvar eliscript-analyzer--filename nil)

(defun eliscript-analyzer--fail (format-string &rest arguments)
  "Signal an analysis error using FORMAT-STRING and ARGUMENTS."
  (signal 'eliscript-analyze-error
          (list (apply #'eliscript-diagnostic-format
                       eliscript-analyzer--filename
                       format-string
                       arguments))))

(defun eliscript-analyzer--make-scope (&optional parent)
  "Create an empty lexical scope whose parent is PARENT."
  (eliscript-analyzer--scope-create
   :parent parent
   :names (make-hash-table :test #'eq)
   :outputs (make-hash-table :test #'equal)))

(defun eliscript-analyzer--map-binding-name (name)
  "Return NAME's output identifier as an analysis diagnostic."
  (condition-case error-data
      (eliscript-symbol-binding-name name)
    (eliscript-compile-error
     (eliscript-analyzer--fail "%s" (error-message-string error-data)))))

(defun eliscript-analyzer--declare (scope name kind mutable)
  "Declare NAME with KIND and MUTABLE status in SCOPE."
  (let* ((names (eliscript-analyzer--scope-names scope))
         (outputs (eliscript-analyzer--scope-outputs scope))
         (output-name (eliscript-analyzer--map-binding-name name))
         (existing-name (gethash name names))
         (existing-output (gethash output-name outputs)))
    (when existing-name
      (eliscript-analyzer--fail "duplicate %s binding: %s" kind name))
    (when existing-output
      (eliscript-analyzer--fail
       "binding %s emits %s, which collides with %s"
       name output-name (eliscript-analyzer--binding-name existing-output)))
    (let ((binding (eliscript-analyzer--binding-create
                    :name name
                    :output-name output-name
                    :kind kind
                    :mutable mutable)))
      (puthash name binding names)
      (puthash output-name binding outputs)
      binding)))

(defun eliscript-analyzer--lookup (scope name)
  "Resolve NAME from SCOPE or its parents."
  (let (binding)
    (while (and scope (not binding))
      (setq binding (gethash name (eliscript-analyzer--scope-names scope)))
      (setq scope (eliscript-analyzer--scope-parent scope)))
    binding))

(defun eliscript-analyzer--qualified-symbol-p (symbol)
  "Return non-nil when SYMBOL is an explicit JavaScript path."
  (string-match-p "[./]" (symbol-name symbol)))

(defun eliscript-analyzer--require-binding (scope name)
  "Resolve NAME in SCOPE and signal when it is unbound."
  (or (eliscript-analyzer--lookup scope name)
      (eliscript-analyzer--fail "unbound symbol: %s" name)))

(defun eliscript-analyzer--analyze-sequence (forms scope)
  "Analyze every form in FORMS using SCOPE."
  (dolist (form forms)
    (eliscript-analyzer--analyze-expression form scope)))

(defun eliscript-analyzer--binding-pair (binding)
  "Return the source name and initializer represented by BINDING."
  (cond
   ((symbolp binding) (list binding nil))
   ((and (proper-list-p binding)
         (<= 1 (length binding))
         (<= (length binding) 2)
         (symbolp (car binding)))
    (list (car binding) (cadr binding)))
   (t (eliscript-analyzer--fail "invalid let binding: %S" binding))))

(defun eliscript-analyzer--analyze-let (arguments scope sequential)
  "Analyze let ARGUMENTS in SCOPE, honoring SEQUENTIAL semantics."
  (unless arguments
    (eliscript-analyzer--fail "%s requires a binding list"
                              (if sequential "let*" "let")))
  (let ((bindings (car arguments))
        (body (cdr arguments))
        (child (eliscript-analyzer--make-scope scope)))
    (unless (proper-list-p bindings)
      (eliscript-analyzer--fail "let bindings must be a list"))
    (if sequential
        (dolist (binding bindings)
          (pcase-let ((`(,name ,value)
                       (eliscript-analyzer--binding-pair binding)))
            (eliscript-analyzer--analyze-expression value child)
            (eliscript-analyzer--declare child name 'local t)))
      (let ((parsed (mapcar #'eliscript-analyzer--binding-pair bindings)))
        (dolist (binding parsed)
          (eliscript-analyzer--analyze-expression (cadr binding) scope))
        (dolist (binding parsed)
          (eliscript-analyzer--declare child (car binding) 'local t))))
    (eliscript-analyzer--analyze-sequence body child)))

(defun eliscript-analyzer--analyze-function (parameters body scope)
  "Analyze function PARAMETERS and BODY within SCOPE."
  (unless (proper-list-p parameters)
    (eliscript-analyzer--fail "function arguments must be a list"))
  (let ((child (eliscript-analyzer--make-scope scope)))
    (dolist (parameter parameters)
      (eliscript-analyzer--declare child parameter 'parameter t))
    (eliscript-analyzer--analyze-sequence body child)))

(defun eliscript-analyzer--analyze-assignment (arguments scope form-name)
  "Analyze assignment ARGUMENTS in SCOPE for FORM-NAME."
  (when (or (null arguments) (= (% (length arguments) 2) 1))
    (eliscript-analyzer--fail
     "%s expects one or more name/value pairs" form-name))
  (while arguments
    (let* ((name (pop arguments))
           (value (pop arguments))
           (binding (and (symbolp name)
                         (eliscript-analyzer--require-binding scope name))))
      (unless binding
        (eliscript-analyzer--fail "assignment target must be a symbol: %S" name))
      (unless (eliscript-analyzer--binding-mutable binding)
        (eliscript-analyzer--fail "cannot assign to immutable binding: %s" name))
      (eliscript-analyzer--analyze-expression value scope))))

(defun eliscript-analyzer--analyze-object (arguments scope)
  "Analyze object literal ARGUMENTS in SCOPE."
  (when (= (% (length arguments) 2) 1)
    (eliscript-analyzer--fail "object expects key/value pairs"))
  (while arguments
    (let ((key (pop arguments))
          (value (pop arguments)))
      (unless (or (keywordp key) (stringp key) (symbolp key))
        (eliscript-analyzer--analyze-expression key scope))
      (eliscript-analyzer--analyze-expression value scope))))

(defun eliscript-analyzer--analyze-property-call (operator arguments scope)
  "Analyze property OPERATOR with ARGUMENTS in SCOPE."
  (pcase operator
    ('get
     (when (or (< (length arguments) 2) (> (length arguments) 3))
       (eliscript-analyzer--fail "get expects 2..3 arguments")))
    ('put
     (unless (= (length arguments) 3)
       (eliscript-analyzer--fail "put expects 3 arguments")))
    ('js-call
     (when (< (length arguments) 2)
       (eliscript-analyzer--fail "js-call expects 2+ arguments"))))
  (eliscript-analyzer--analyze-expression (car arguments) scope)
  (let ((key (cadr arguments)))
    (unless (or (keywordp key) (stringp key))
      (eliscript-analyzer--analyze-expression key scope)))
  (eliscript-analyzer--analyze-sequence (nthcdr 2 arguments) scope))

(defun eliscript-analyzer--analyze-cond (clauses scope)
  "Analyze cond CLAUSES in SCOPE."
  (dolist (clause clauses)
    (unless (and (proper-list-p clause) clause)
      (eliscript-analyzer--fail "invalid cond clause: %S" clause))
    (eliscript-analyzer--analyze-expression (car clause) scope)
    (eliscript-analyzer--analyze-sequence (cdr clause) scope)))

(defun eliscript-analyzer--analyze-call (form scope)
  "Analyze call FORM in SCOPE."
  (let ((operator (car form))
        (arguments (cdr form)))
    (pcase operator
      ((or 'lambda 'fn)
       (unless arguments
         (eliscript-analyzer--fail "%s requires an argument list" operator))
       (eliscript-analyzer--analyze-function
        (car arguments) (cdr arguments) scope))
      ('let (eliscript-analyzer--analyze-let arguments scope nil))
      ('let* (eliscript-analyzer--analyze-let arguments scope t))
      ('setq (eliscript-analyzer--analyze-assignment arguments scope "setq"))
      ('set!
       (unless (= (length arguments) 2)
         (eliscript-analyzer--fail "set! expects 2 arguments"))
       (eliscript-analyzer--analyze-assignment arguments scope "set!"))
      ('cond (eliscript-analyzer--analyze-cond arguments scope))
      ('quote nil)
      ('object (eliscript-analyzer--analyze-object arguments scope))
      ((or 'get 'put 'js-call)
       (eliscript-analyzer--analyze-property-call operator arguments scope))
      ('js* nil)
      ((pred (lambda (name)
               (memq name eliscript-analyzer--builtin-operators)))
       (eliscript-analyzer--analyze-sequence arguments scope))
      ((or 'defun 'defn 'defvar 'defconst 'export 'export-default
           'import 'module)
       (eliscript-analyzer--fail "%s is only valid at module top level" operator))
      (_
       (eliscript-analyzer--analyze-expression operator scope)
       (eliscript-analyzer--analyze-sequence arguments scope)))))

(defun eliscript-analyzer--analyze-expression (form scope)
  "Analyze expression FORM in lexical SCOPE."
  (cond
   ((or (null form) (eq form t) (numberp form) (stringp form)
        (keywordp form) (eq form 'false) (eq form 'undefined)) nil)
   ((symbolp form)
    (unless (eliscript-analyzer--qualified-symbol-p form)
      (eliscript-analyzer--require-binding scope form)))
   ((vectorp form)
    (mapc (lambda (item)
            (eliscript-analyzer--analyze-expression item scope))
          (append form nil)))
   ((consp form)
    (unless (proper-list-p form)
      (eliscript-analyzer--fail "dotted call forms are not supported: %S" form))
    (eliscript-analyzer--analyze-call form scope))
   (t (eliscript-analyzer--fail "unsupported form: %S" form))))

(defun eliscript-analyzer--import-bindings (arguments)
  "Return local binding names declared by import ARGUMENTS."
  (unless (stringp (car arguments))
    (eliscript-analyzer--fail "import module must be a string"))
  (let ((specifiers (cdr arguments))
        bindings
        default-seen
        namespace-seen)
    (while specifiers
      (let ((specifier (pop specifiers)))
        (pcase specifier
          (:default
           (when default-seen
             (eliscript-analyzer--fail "duplicate :default import"))
           (unless specifiers
             (eliscript-analyzer--fail ":default requires a binding"))
           (setq default-seen t)
           (push (pop specifiers) bindings))
          (:as
           (when namespace-seen
             (eliscript-analyzer--fail "duplicate :as import"))
           (unless specifiers
             (eliscript-analyzer--fail ":as requires a namespace binding"))
           (setq namespace-seen t)
           (push (pop specifiers) bindings))
          ((pred symbolp) (push specifier bindings))
          (_ (eliscript-analyzer--fail
              "invalid import specifier: %S" specifier)))))
    (nreverse bindings)))

(defun eliscript-analyzer--flatten-modules (forms)
  "Return top-level FORMS with module wrappers removed."
  (apply
   #'append
   (mapcar
    (lambda (form)
      (if (and (consp form) (eq (car form) 'module))
          (progn
            (unless (and (cdr form) (symbolp (cadr form)))
              (eliscript-analyzer--fail "module name must be a symbol"))
            (eliscript-analyzer--flatten-modules (cddr form)))
        (list form)))
    forms)))

(defun eliscript-analyzer--predeclare-top-level (forms scope)
  "Declare all top-level bindings from FORMS in SCOPE."
  (dolist (form forms)
    (when (consp form)
      (pcase (car form)
        ('import
         (unless (cdr form)
           (eliscript-analyzer--fail "import expects a module name"))
         (dolist (name (eliscript-analyzer--import-bindings (cdr form)))
           (eliscript-analyzer--declare scope name 'import nil)))
        ('defvar
         (unless (<= 1 (length (cdr form)) 2)
           (eliscript-analyzer--fail "defvar expects 1..2 arguments"))
         (eliscript-analyzer--declare scope (cadr form) 'variable t))
        ('defconst
         (unless (<= 1 (length (cdr form)) 2)
           (eliscript-analyzer--fail "defconst expects 1..2 arguments"))
         (eliscript-analyzer--declare scope (cadr form) 'constant nil))
        ((or 'defun 'defn)
         (unless (>= (length (cdr form)) 2)
           (eliscript-analyzer--fail "%s expects 2+ arguments" (car form)))
         (eliscript-analyzer--declare scope (cadr form) 'function nil))))))

(defun eliscript-analyzer--analyze-top-level (form scope)
  "Analyze top-level FORM in module SCOPE."
  (if (not (consp form))
      (eliscript-analyzer--analyze-expression form scope)
    (let ((operator (car form))
          (arguments (cdr form)))
      (pcase operator
        ('import nil)
        ((or 'defvar 'defconst)
         (when (> (length arguments) 2)
           (eliscript-analyzer--fail "%s expects 1..2 arguments" operator))
         (eliscript-analyzer--analyze-expression (cadr arguments) scope))
        ((or 'defun 'defn)
         (unless (>= (length arguments) 2)
           (eliscript-analyzer--fail "%s expects 2+ arguments" operator))
         (eliscript-analyzer--analyze-function
          (cadr arguments) (cddr arguments) scope))
        ('export
         (unless arguments
           (eliscript-analyzer--fail "export expects one or more bindings"))
         (dolist (name arguments)
           (unless (symbolp name)
             (eliscript-analyzer--fail "export name must be a symbol: %S" name))
           (eliscript-analyzer--require-binding scope name)))
        ('export-default
         (unless (= (length arguments) 1)
           (eliscript-analyzer--fail "export-default expects 1 argument"))
         (eliscript-analyzer--analyze-expression (car arguments) scope))
        (_ (eliscript-analyzer--analyze-expression form scope))))))

(defun eliscript-analyze-module (forms &optional filename)
  "Validate lexical bindings in module FORMS read from FILENAME.

Return FORMS unchanged for the emitter."
  (let* ((eliscript-analyzer--filename filename)
         (flattened (eliscript-analyzer--flatten-modules forms))
         (scope (eliscript-analyzer--make-scope)))
    (eliscript-analyzer--predeclare-top-level flattened scope)
    (dolist (form flattened)
      (eliscript-analyzer--analyze-top-level form scope))
    forms))

(provide 'eliscript-analyzer)

;;; eliscript-analyzer.el ends here
