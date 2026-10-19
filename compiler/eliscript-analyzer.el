;;; eliscript-analyzer.el --- Lexical analysis for Eliscript -*- lexical-binding: t; -*-

;;; Commentary:

;; The analyzer validates lexical bindings before lowering to explicit IR.

;;; Code:

(require 'cl-lib)
(require 'eliscript-diagnostic)
(require 'eliscript-form)
(require 'eliscript-parameters)
(require 'eliscript-portable)
(require 'eliscript-symbol)
(require 'eliscript-transient-analysis)

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
  outputs
  function-context)

(cl-defstruct (eliscript-analyzer--recur-target
               (:constructor eliscript-analyzer--recur-target-create))
  kind
  arity)

(defconst eliscript-analyzer--builtin-operators
  '(if when unless progn do while loop recur and or not
    + * - / % mod = /= not= < <= > >= 1+ 1-
    int32 uint32 imul32 bit-and bit-or bit-xor bit-not
    bit-shift-left bit-shift-right unsigned-bit-shift-right
    value-type host-identity-token string-code-unit-at string-from-code-unit
    string-to-number string-to-bigint number-float64-words
    eq equal null nil? undefined? nullish?
    list vector hash-map hash-set queue js-array car cdr cons js-cons nth js-nth aref
    length js-length
    object-keys object-has? object-assoc __eliscript_arity_error
    new print str funcall apply))

(defvar eliscript-analyzer--filename nil)
(defvar eliscript-analyzer--current-span nil)
(defvar eliscript-analyzer--tail-position nil)
(defvar eliscript-analyzer--recur-targets nil)
(defvar eliscript-analyzer--recur-barrier nil)

(defun eliscript-analyzer--fail (format-string &rest arguments)
  "Signal an analysis error using FORMAT-STRING and ARGUMENTS."
  (apply #'eliscript-diagnostic-signal
         'eliscript-analyze-error "ELI-A0001" "analysis"
         eliscript-analyzer--filename eliscript-analyzer--current-span
         format-string arguments))

(defun eliscript-analyzer--make-scope (&optional parent function-context)
  "Create a lexical scope under PARENT with FUNCTION-CONTEXT."
  (eliscript-analyzer--scope-create
   :parent parent
   :names (make-hash-table :test #'eq)
   :outputs (make-hash-table :test #'equal)
   :function-context function-context))

(defun eliscript-analyzer--async-function-p (scope)
  "Return non-nil when SCOPE is inside its nearest async function."
  (let (context)
    (while (and scope (not context))
      (setq context (eliscript-analyzer--scope-function-context scope))
      (setq scope (eliscript-analyzer--scope-parent scope)))
    (eq context 'async)))

(defun eliscript-analyzer--map-binding-name (name)
  "Return NAME's output identifier as an analysis diagnostic."
  (condition-case error-data
      (eliscript-symbol-binding-name name)
    (eliscript-compile-error
     (eliscript-analyzer--fail
      "%s" (eliscript-diagnostic-condition-message error-data)))))

(defun eliscript-analyzer--declare (scope name kind mutable)
  "Declare NAME with KIND and MUTABLE status in SCOPE."
  (let* ((eliscript-analyzer--current-span
          (or (eliscript-form-span name) eliscript-analyzer--current-span))
         (name (eliscript-form-value name))
         (names (eliscript-analyzer--scope-names scope))
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

(defun eliscript-analyzer--declare-pattern (scope pattern kind mutable)
  "Declare every name in binding PATTERN in SCOPE."
  (dolist
      (name
       (eliscript-binding-names
        pattern
        (lambda (form message)
          (let ((eliscript-analyzer--current-span
                 (or (eliscript-form-span form)
                     eliscript-analyzer--current-span)))
            (eliscript-analyzer--fail "%s" message)))))
    (eliscript-analyzer--declare scope name kind mutable)))

(defun eliscript-analyzer--analyze-pattern-defaults (pattern scope)
  "Analyze map defaults nested in binding PATTERN using lexical SCOPE."
  (dolist
      (default
       (eliscript-binding-defaults
        pattern
        (lambda (form message)
          (let ((eliscript-analyzer--current-span
                 (or (eliscript-form-span form)
                     eliscript-analyzer--current-span)))
            (eliscript-analyzer--fail "%s" message)))))
    (eliscript-analyzer--analyze-non-tail default scope)))

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
  (let ((tail-position eliscript-analyzer--tail-position))
    (while forms
      (let ((eliscript-analyzer--tail-position
             (and tail-position (null (cdr forms)))))
        (eliscript-analyzer--analyze-expression (car forms) scope))
      (setq forms (cdr forms)))))

(defun eliscript-analyzer--analyze-non-tail (form scope)
  "Analyze FORM in SCOPE outside a recur tail position."
  (let ((eliscript-analyzer--tail-position nil))
    (eliscript-analyzer--analyze-expression form scope)))

(defun eliscript-analyzer--analyze-non-tail-sequence (forms scope)
  "Analyze every FORM in FORMS outside a recur tail position."
  (let ((eliscript-analyzer--tail-position nil))
    (eliscript-analyzer--analyze-sequence forms scope)))

(defun eliscript-analyzer--binding-pair (binding)
  "Return the source name and initializer represented by BINDING."
  (let* ((eliscript-analyzer--current-span
          (or (eliscript-form-span binding) eliscript-analyzer--current-span))
         (value (eliscript-form-value binding)))
    (cond
     ((eliscript-binding-pattern-p binding)
      (eliscript-binding-names
       binding
       (lambda (form message)
         (let ((eliscript-analyzer--current-span
                (or (eliscript-form-span form)
                    eliscript-analyzer--current-span)))
           (eliscript-analyzer--fail "%s" message))))
      (list binding nil))
     ((and (proper-list-p value)
           (<= 1 (length value))
           (<= (length value) 2)
           (eliscript-binding-pattern-p (car value)))
      (eliscript-binding-names
       (car value)
       (lambda (form message)
         (let ((eliscript-analyzer--current-span
                (or (eliscript-form-span form)
                    eliscript-analyzer--current-span)))
           (eliscript-analyzer--fail "%s" message))))
      (list (car value) (cadr value)))
     (t (eliscript-analyzer--fail
         "invalid let binding: %S" (eliscript-form-strip binding))))))

(defun eliscript-analyzer--analyze-let (arguments scope sequential)
  "Analyze let ARGUMENTS in SCOPE, honoring SEQUENTIAL semantics."
  (unless arguments
    (eliscript-analyzer--fail "%s requires a binding list"
                              (if sequential "let*" "let")))
  (let* ((bindings-form (car arguments))
        (bindings (eliscript-form-value bindings-form))
        (body (cdr arguments))
        (child (eliscript-analyzer--make-scope scope)))
    (unless (proper-list-p bindings)
      (let ((eliscript-analyzer--current-span
             (or (eliscript-form-span bindings-form)
                 eliscript-analyzer--current-span)))
        (eliscript-analyzer--fail "let bindings must be a list")))
    (if sequential
        (dolist (binding bindings)
          (pcase-let ((`(,name ,value)
                       (eliscript-analyzer--binding-pair binding)))
            (eliscript-analyzer--analyze-non-tail value child)
            (eliscript-analyzer--analyze-pattern-defaults name child)
            (eliscript-analyzer--declare-pattern child name 'local t)))
      (let ((parsed (mapcar #'eliscript-analyzer--binding-pair bindings)))
        (dolist (binding parsed)
          (eliscript-analyzer--analyze-non-tail (cadr binding) scope)
          (eliscript-analyzer--analyze-pattern-defaults
           (car binding) scope))
        (dolist (binding parsed)
          (eliscript-analyzer--declare-pattern
           child (car binding) 'local t))))
    (eliscript-analyzer--analyze-sequence body child)))

(defun eliscript-analyzer--analyze-function
    (parameters body scope &optional asynchronous)
  "Analyze function PARAMETERS and BODY in SCOPE.

When ASYNCHRONOUS is non-nil, allow `await' in this function body."
  (let ((parsed
         (eliscript-parameters-parse
          parameters
          (lambda (form message)
            (let ((eliscript-analyzer--current-span
                   (or (eliscript-form-span form)
                       eliscript-analyzer--current-span)))
              (eliscript-analyzer--fail "%s" message))))))
    (dolist (parameter parsed)
      (eliscript-analyzer--analyze-pattern-defaults
       (eliscript-parameter-form parameter) scope))
    (let ((child (eliscript-analyzer--make-scope
                  scope (if asynchronous 'async 'sync)))
          (target (eliscript-analyzer--recur-target-create
                   :kind 'function :arity (length parsed))))
      (dolist (parameter parsed)
        (eliscript-analyzer--declare-pattern
         child (eliscript-parameter-form parameter) 'parameter t))
      (let ((eliscript-analyzer--recur-targets (list target))
            (eliscript-analyzer--tail-position t)
            (eliscript-analyzer--recur-barrier nil))
        (eliscript-analyzer--analyze-sequence body child)))))

(defun eliscript-analyzer--analyze-loop (arguments scope)
  "Analyze binding LOOP ARGUMENTS in lexical SCOPE."
  (unless arguments
    (eliscript-analyzer--fail "loop requires a binding list"))
  (let* ((bindings-form (car arguments))
         (bindings (eliscript-form-value bindings-form))
         (body (cdr arguments))
         (child (eliscript-analyzer--make-scope scope)))
    (unless (proper-list-p bindings)
      (let ((eliscript-analyzer--current-span
             (or (eliscript-form-span bindings-form)
                 eliscript-analyzer--current-span)))
        (eliscript-analyzer--fail "loop bindings must be a list")))
    (let ((parsed
           (mapcar
            (lambda (binding)
              (let ((value (eliscript-form-value binding)))
                (unless (and (proper-list-p value) (= (length value) 2))
                  (let ((eliscript-analyzer--current-span
                         (or (eliscript-form-span binding)
                             eliscript-analyzer--current-span)))
                    (eliscript-analyzer--fail
                     "loop bindings require exactly one initializer: %S"
                     (eliscript-form-strip binding))))
                (eliscript-analyzer--binding-pair binding)))
            bindings)))
      (dolist (binding parsed)
        (eliscript-analyzer--analyze-non-tail (cadr binding) scope)
        (eliscript-analyzer--analyze-pattern-defaults
         (car binding) scope))
      (dolist (binding parsed)
        (eliscript-analyzer--declare-pattern
         child (car binding) 'loop t))
      (let ((eliscript-analyzer--recur-targets
             (cons
              (eliscript-analyzer--recur-target-create
               :kind 'loop :arity (length parsed))
              eliscript-analyzer--recur-targets))
            (eliscript-analyzer--tail-position t)
            (eliscript-analyzer--recur-barrier nil))
        (eliscript-analyzer--analyze-sequence body child)))))

(defun eliscript-analyzer--analyze-recur (arguments scope)
  "Analyze RECUR ARGUMENTS in lexical SCOPE."
  (let ((target (car eliscript-analyzer--recur-targets)))
    (unless target
      (eliscript-analyzer--fail
       "recur is only valid inside a function or loop"))
    (when eliscript-analyzer--recur-barrier
      (eliscript-analyzer--fail "recur cannot cross a try boundary"))
    (unless eliscript-analyzer--tail-position
      (eliscript-analyzer--fail "recur is only valid in tail position"))
    (unless (= (length arguments)
               (eliscript-analyzer--recur-target-arity target))
      (eliscript-analyzer--fail
       "recur expects %d arguments for the current %s, got %d"
       (eliscript-analyzer--recur-target-arity target)
       (eliscript-analyzer--recur-target-kind target)
       (length arguments)))
    (eliscript-analyzer--analyze-non-tail-sequence arguments scope)))

(defun eliscript-analyzer--analyze-assignment (arguments scope form-name)
  "Analyze assignment ARGUMENTS in SCOPE for FORM-NAME."
  (when (or (null arguments) (= (% (length arguments) 2) 1))
    (eliscript-analyzer--fail
     "%s expects one or more name/value pairs" form-name))
  (while arguments
    (let* ((name (pop arguments))
           (name-value (eliscript-form-value name))
           (value (pop arguments))
           (binding (and (symbolp name-value)
                         (eliscript-analyzer--require-binding
                          scope name-value))))
      (unless binding
        (eliscript-analyzer--fail
         "assignment target must be a symbol: %S"
         (eliscript-form-strip name)))
      (unless (eliscript-analyzer--binding-mutable binding)
        (let ((eliscript-analyzer--current-span
               (or (eliscript-form-span name)
                   eliscript-analyzer--current-span)))
          (eliscript-analyzer--fail
           "cannot assign to immutable binding: %s" name-value)))
      (eliscript-analyzer--analyze-non-tail value scope))))

(defun eliscript-analyzer--analyze-object (arguments scope form-name)
  "Analyze host object ARGUMENTS in SCOPE for FORM-NAME."
  (when (= (% (length arguments) 2) 1)
    (eliscript-analyzer--fail "%s expects key/value pairs" form-name))
  (while arguments
    (let ((key (pop arguments))
          (value (pop arguments)))
      (unless (let ((key-value (eliscript-form-value key)))
                (or (keywordp key-value)
                    (stringp key-value)
                    (symbolp key-value)))
        (eliscript-analyzer--analyze-non-tail key scope))
      (eliscript-analyzer--analyze-non-tail value scope))))

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
  (eliscript-analyzer--analyze-non-tail (car arguments) scope)
  (let ((key (cadr arguments)))
    (unless (let ((key-value (eliscript-form-value key)))
              (or (keywordp key-value) (stringp key-value)))
      (eliscript-analyzer--analyze-non-tail key scope)))
  (eliscript-analyzer--analyze-non-tail-sequence
   (nthcdr 2 arguments) scope))

(defun eliscript-analyzer--analyze-cond (clauses scope)
  "Analyze cond CLAUSES in SCOPE."
  (dolist (clause clauses)
    (let ((value (eliscript-form-value clause)))
      (unless (and (proper-list-p value) value)
        (let ((eliscript-analyzer--current-span
               (or (eliscript-form-span clause)
                   eliscript-analyzer--current-span)))
          (eliscript-analyzer--fail
           "invalid cond clause: %S" (eliscript-form-strip clause))))
      (eliscript-analyzer--analyze-non-tail (car value) scope)
      (eliscript-analyzer--analyze-sequence (cdr value) scope))))

(defun eliscript-analyzer--clause-operator (form)
  "Return FORM's clause operator, or nil when it is not a clause."
  (let ((value (eliscript-form-value form)))
    (and (proper-list-p value)
         value
         (symbolp (eliscript-form-value (car value)))
         (eliscript-form-value (car value)))))

(defun eliscript-analyzer--analyze-try (arguments scope)
  "Analyze try ARGUMENTS in lexical SCOPE."
  (let ((eliscript-analyzer--recur-barrier t)
        clauses-started catch-seen finally-seen)
    (dolist (argument arguments)
      (let ((operator (eliscript-analyzer--clause-operator argument)))
        (cond
         ((eq operator 'catch)
          (when catch-seen
            (eliscript-analyzer--fail "try accepts at most one catch clause"))
          (when finally-seen
            (eliscript-analyzer--fail "catch must precede finally"))
          (setq clauses-started t
                catch-seen t)
          (let* ((clause (eliscript-form-value argument))
                 (binding (cadr clause)))
            (unless (and binding
                         (eliscript-binding-pattern-p binding))
              (let ((eliscript-analyzer--current-span
                     (or (eliscript-form-span argument)
                         eliscript-analyzer--current-span)))
                (eliscript-analyzer--fail
                 "catch requires a binding symbol, vector, or map")))
            (eliscript-analyzer--analyze-pattern-defaults binding scope)
            (let ((child (eliscript-analyzer--make-scope scope)))
              (eliscript-analyzer--declare-pattern child binding 'catch t)
              (eliscript-analyzer--analyze-sequence
               (cddr clause) child))))
         ((eq operator 'finally)
          (when finally-seen
            (eliscript-analyzer--fail
             "try accepts at most one finally clause"))
          (setq clauses-started t
                finally-seen t)
          (eliscript-analyzer--analyze-sequence
           (cdr (eliscript-form-value argument)) scope))
         (clauses-started
          (let ((eliscript-analyzer--current-span
                 (or (eliscript-form-span argument)
                     eliscript-analyzer--current-span)))
            (eliscript-analyzer--fail
             "try body forms must precede catch and finally clauses")))
         (t
          (eliscript-analyzer--analyze-expression argument scope)))))
    (unless (or catch-seen finally-seen)
      (eliscript-analyzer--fail
       "try requires a catch or finally clause"))))

(defun eliscript-analyzer--analyze-call (form scope)
  "Analyze call FORM in SCOPE."
  (let* ((items (eliscript-form-value form))
         (operator-form (car items))
         (operator (eliscript-form-value operator-form))
         (arguments (cdr items)))
    (pcase operator
      ((or 'lambda 'fn)
       (unless arguments
         (eliscript-analyzer--fail "%s requires an argument list" operator))
       (eliscript-analyzer--analyze-function
        (car arguments) (cdr arguments) scope))
      ('async
       (unless arguments
         (eliscript-analyzer--fail "async requires an argument list"))
       (eliscript-analyzer--analyze-function
        (car arguments) (cdr arguments) scope t))
      ('await
       (unless (= (length arguments) 1)
         (eliscript-analyzer--fail "await expects 1 argument"))
       (unless (eliscript-analyzer--async-function-p scope)
         (eliscript-analyzer--fail
          "await is only valid inside an async function"))
       (eliscript-analyzer--analyze-non-tail (car arguments) scope))
      ('throw
       (unless (= (length arguments) 1)
         (eliscript-analyzer--fail "throw expects 1 argument"))
       (eliscript-analyzer--analyze-non-tail (car arguments) scope))
      ('try (eliscript-analyzer--analyze-try arguments scope))
      ((or 'catch 'finally)
       (eliscript-analyzer--fail
        "%s is only valid as a try clause" operator))
      ('let (eliscript-analyzer--analyze-let arguments scope nil))
      ('let* (eliscript-analyzer--analyze-let arguments scope t))
      ('loop (eliscript-analyzer--analyze-loop arguments scope))
      ('recur (eliscript-analyzer--analyze-recur arguments scope))
      ('setq (eliscript-analyzer--analyze-assignment arguments scope "setq"))
      ('set!
       (unless (= (length arguments) 2)
         (eliscript-analyzer--fail "set! expects 2 arguments"))
       (eliscript-analyzer--analyze-assignment arguments scope "set!"))
      ('cond (eliscript-analyzer--analyze-cond arguments scope))
      ('if
       (unless (<= 2 (length arguments) 3)
         (eliscript-analyzer--fail "if expects 2..3 arguments"))
       (eliscript-analyzer--analyze-non-tail (car arguments) scope)
       (dolist (branch (cdr arguments))
         (eliscript-analyzer--analyze-expression branch scope)))
      ((or 'when 'unless)
       (unless arguments
         (eliscript-analyzer--fail "%s expects 1+ arguments" operator))
       (eliscript-analyzer--analyze-non-tail (car arguments) scope)
       (eliscript-analyzer--analyze-sequence (cdr arguments) scope))
      ((or 'progn 'do 'and 'or)
       (eliscript-analyzer--analyze-sequence arguments scope))
      ('while
       (unless arguments
         (eliscript-analyzer--fail "while expects 1+ arguments"))
       (eliscript-analyzer--analyze-non-tail-sequence arguments scope))
      ('quote nil)
      ('js-object
       (eliscript-analyzer--analyze-object
        arguments scope (symbol-name operator)))
      ('hash-map
       (when (= (% (length arguments) 2) 1)
         (eliscript-analyzer--fail
          "hash-map expects complete key/value pairs"))
       (eliscript-analyzer--analyze-non-tail-sequence arguments scope))
      ((or 'get 'put 'js-call)
       (eliscript-analyzer--analyze-property-call operator arguments scope))
      ('js* nil)
      ((pred (lambda (name)
               (memq name eliscript-analyzer--builtin-operators)))
       (eliscript-analyzer--analyze-non-tail-sequence arguments scope))
      ((or 'defun 'defn 'defportable 'defasync 'defvar 'defconst
           'export 'export-default 'import 'module)
       (eliscript-analyzer--fail "%s is only valid at module top level" operator))
      (_
       (eliscript-analyzer--analyze-non-tail operator-form scope)
       (eliscript-analyzer--analyze-non-tail-sequence arguments scope)))))

(defvar eliscript-analyzer--expression-tasks nil)
(defvar eliscript-analyzer--pending-tasks nil)
(defvar eliscript-analyzer--task-active nil)

(defun eliscript-analyzer--enqueue (action)
  "Enqueue ACTION after earlier siblings with its exact analysis context."
  (let ((span eliscript-analyzer--current-span)
        (tail eliscript-analyzer--tail-position)
        (targets eliscript-analyzer--recur-targets)
        (barrier eliscript-analyzer--recur-barrier))
    (push (lambda ()
            (let ((eliscript-analyzer--current-span span)
                  (eliscript-analyzer--tail-position tail)
                  (eliscript-analyzer--recur-targets targets)
                  (eliscript-analyzer--recur-barrier barrier))
              (funcall action)))
          eliscript-analyzer--pending-tasks)))

(defun eliscript-analyzer--enqueue-expression (form scope tail)
  "Enqueue FORM in SCOPE with explicit TAIL status."
  (let ((eliscript-analyzer--tail-position tail))
    (eliscript-analyzer--enqueue
     (lambda () (eliscript-analyzer--analyze-expression-step form scope)))))

(defun eliscript-analyzer--enqueue-sequence (forms scope tail)
  "Enqueue FORMS in original order, assigning TAIL only to the last form."
  (while forms
    (eliscript-analyzer--enqueue-expression
     (car forms) scope (and tail (null (cdr forms))))
    (setq forms (cdr forms))))

(defun eliscript-analyzer--enqueue-defaults (pattern scope)
  "Enqueue pattern-default validation followed by its expressions in SCOPE."
  (eliscript-analyzer--enqueue
   (lambda ()
     (let ((defaults
            (eliscript-binding-defaults
             pattern
             (lambda (form message)
               (let ((eliscript-analyzer--current-span
                      (or (eliscript-form-span form)
                          eliscript-analyzer--current-span)))
                 (eliscript-analyzer--fail "%s" message))))))
       (eliscript-analyzer--enqueue-sequence defaults scope nil)))))

(defun eliscript-analyzer--enqueue-let (arguments scope sequential)
  "Schedule let ARGUMENTS with the original SEQUENTIAL binding visibility."
  (unless arguments
    (eliscript-analyzer--fail "%s requires a binding list"
                              (if sequential "let*" "let")))
  (let* ((bindings-form (car arguments))
         (bindings (eliscript-form-value bindings-form))
         (child (eliscript-analyzer--make-scope scope))
         (tail eliscript-analyzer--tail-position))
    (unless (proper-list-p bindings)
      (let ((eliscript-analyzer--current-span
             (or (eliscript-form-span bindings-form)
                 eliscript-analyzer--current-span)))
        (eliscript-analyzer--fail "let bindings must be a list")))
    (if sequential
        (dolist (binding bindings)
          ;; Parse each sequential binding only after the preceding initializer,
          ;; defaults and declaration, preserving both visibility and first error.
          (let ((binding binding))
            (eliscript-analyzer--enqueue
             (lambda ()
               (pcase-let ((`(,name ,value)
                            (eliscript-analyzer--binding-pair binding)))
                 (eliscript-analyzer--enqueue-expression value child nil)
                 (eliscript-analyzer--enqueue-defaults name child)
                 (eliscript-analyzer--enqueue
                  (lambda ()
                    (eliscript-analyzer--declare-pattern
                     child name 'local t))))))))
      ;; Parallel let validates every binding shape before any initializer, then
      ;; evaluates all initializers/defaults in the parent scope before declaring.
      (let ((parsed (mapcar #'eliscript-analyzer--binding-pair bindings)))
        (dolist (binding parsed)
          (eliscript-analyzer--enqueue-expression (cadr binding) scope nil)
          (eliscript-analyzer--enqueue-defaults (car binding) scope))
        (eliscript-analyzer--enqueue
         (lambda ()
           (dolist (binding parsed)
             (eliscript-analyzer--declare-pattern
              child (car binding) 'local t))))))
    (eliscript-analyzer--enqueue-sequence (cdr arguments) child tail)))

(defun eliscript-analyzer--enqueue-function
    (parameters body scope asynchronous)
  "Schedule PARAMETERS and BODY in a new ASYNCHRONOUS function context."
  (let ((parsed
         (eliscript-parameters-parse
          parameters
          (lambda (form message)
            (let ((eliscript-analyzer--current-span
                   (or (eliscript-form-span form)
                       eliscript-analyzer--current-span)))
              (eliscript-analyzer--fail "%s" message))))))
    (dolist (parameter parsed)
      (eliscript-analyzer--enqueue-defaults
       (eliscript-parameter-form parameter) scope))
    (eliscript-analyzer--enqueue
     (lambda ()
       (let ((child (eliscript-analyzer--make-scope
                     scope (if asynchronous 'async 'sync)))
             (target (eliscript-analyzer--recur-target-create
                      :kind 'function :arity (length parsed))))
         (dolist (parameter parsed)
           (eliscript-analyzer--declare-pattern
            child (eliscript-parameter-form parameter) 'parameter t))
         (let ((eliscript-analyzer--recur-targets (list target))
               (eliscript-analyzer--recur-barrier nil))
           (eliscript-analyzer--enqueue-sequence body child t)))))))

(defun eliscript-analyzer--enqueue-loop (arguments scope)
  "Schedule LOOP ARGUMENTS without capturing the parent's recur target."
  (unless arguments (eliscript-analyzer--fail "loop requires a binding list"))
  (let* ((bindings-form (car arguments))
         (bindings (eliscript-form-value bindings-form))
         (child (eliscript-analyzer--make-scope scope)))
    (unless (proper-list-p bindings)
      (let ((eliscript-analyzer--current-span
             (or (eliscript-form-span bindings-form)
                 eliscript-analyzer--current-span)))
        (eliscript-analyzer--fail "loop bindings must be a list")))
    (let ((parsed
           (mapcar
            (lambda (binding)
              (let ((value (eliscript-form-value binding)))
                (unless (and (proper-list-p value) (= (length value) 2))
                  (let ((eliscript-analyzer--current-span
                         (or (eliscript-form-span binding)
                             eliscript-analyzer--current-span)))
                    (eliscript-analyzer--fail
                     "loop bindings require exactly one initializer: %S"
                     (eliscript-form-strip binding))))
                (eliscript-analyzer--binding-pair binding))) bindings)))
      (dolist (binding parsed)
        (eliscript-analyzer--enqueue-expression (cadr binding) scope nil)
        (eliscript-analyzer--enqueue-defaults (car binding) scope))
      (eliscript-analyzer--enqueue
       (lambda ()
         (dolist (binding parsed)
           (eliscript-analyzer--declare-pattern child (car binding) 'loop t))
         (let ((eliscript-analyzer--recur-targets
                (cons (eliscript-analyzer--recur-target-create
                       :kind 'loop :arity (length parsed))
                      eliscript-analyzer--recur-targets))
               (eliscript-analyzer--recur-barrier nil))
           (eliscript-analyzer--enqueue-sequence (cdr arguments) child t)))))))

(defun eliscript-analyzer--enqueue-assignment (arguments scope form-name)
  "Schedule assignment checks and values in the original pair order."
  (when (or (null arguments) (= (% (length arguments) 2) 1))
    (eliscript-analyzer--fail "%s expects one or more name/value pairs" form-name))
  (while arguments
    (let ((name (pop arguments)) (value (pop arguments)))
      (eliscript-analyzer--enqueue
       (lambda ()
         (let* ((name-value (eliscript-form-value name))
                (binding (and (symbolp name-value)
                              (eliscript-analyzer--require-binding
                               scope name-value))))
           (unless binding
             (eliscript-analyzer--fail "assignment target must be a symbol: %S"
                                       (eliscript-form-strip name)))
           (unless (eliscript-analyzer--binding-mutable binding)
             (let ((eliscript-analyzer--current-span
                    (or (eliscript-form-span name)
                        eliscript-analyzer--current-span)))
               (eliscript-analyzer--fail
                "cannot assign to immutable binding: %s" name-value)))
           (eliscript-analyzer--enqueue-expression value scope nil)))))))

(defun eliscript-analyzer--enqueue-cond (clauses scope)
  "Schedule COND CLAUSES with original interleaved validation order."
  (dolist (clause clauses)
    (let ((clause clause))
      (eliscript-analyzer--enqueue
     (lambda ()
       (let ((value (eliscript-form-value clause)))
         (unless (and (proper-list-p value) value)
           (let ((eliscript-analyzer--current-span
                  (or (eliscript-form-span clause)
                      eliscript-analyzer--current-span)))
             (eliscript-analyzer--fail
              "invalid cond clause: %S" (eliscript-form-strip clause))))
         (eliscript-analyzer--enqueue-expression (car value) scope nil)
         (eliscript-analyzer--enqueue-sequence
          (cdr value) scope eliscript-analyzer--tail-position)))))))

(defun eliscript-analyzer--enqueue-try (arguments scope)
  "Schedule TRY ARGUMENTS, retaining clause order and the recur barrier."
  (let ((eliscript-analyzer--recur-barrier t)
        (state (vector nil nil nil)))
    (dolist (argument arguments)
      (let ((argument argument))
        (eliscript-analyzer--enqueue
       (lambda ()
         (let ((operator (eliscript-analyzer--clause-operator argument)))
           (cond
            ((eq operator 'catch)
             (when (aref state 1)
               (eliscript-analyzer--fail "try accepts at most one catch clause"))
             (when (aref state 2)
               (eliscript-analyzer--fail "catch must precede finally"))
             (aset state 0 t) (aset state 1 t)
             (let* ((clause (eliscript-form-value argument))
                    (binding (cadr clause)))
               (unless (and binding (eliscript-binding-pattern-p binding))
                 (let ((eliscript-analyzer--current-span
                        (or (eliscript-form-span argument)
                            eliscript-analyzer--current-span)))
                   (eliscript-analyzer--fail
                    "catch requires a binding symbol, vector, or map")))
               (eliscript-analyzer--enqueue-defaults binding scope)
               (eliscript-analyzer--enqueue
                (lambda ()
                  (let ((child (eliscript-analyzer--make-scope scope)))
                    (eliscript-analyzer--declare-pattern child binding 'catch t)
                    (eliscript-analyzer--enqueue-sequence
                     (cddr clause) child eliscript-analyzer--tail-position))))))
            ((eq operator 'finally)
             (when (aref state 2)
               (eliscript-analyzer--fail
                "try accepts at most one finally clause"))
             (aset state 0 t) (aset state 2 t)
             (eliscript-analyzer--enqueue-sequence
              (cdr (eliscript-form-value argument))
              scope eliscript-analyzer--tail-position))
            ((aref state 0)
             (let ((eliscript-analyzer--current-span
                    (or (eliscript-form-span argument)
                        eliscript-analyzer--current-span)))
               (eliscript-analyzer--fail
                "try body forms must precede catch and finally clauses")))
            (t (eliscript-analyzer--enqueue-expression
                argument scope eliscript-analyzer--tail-position))))))))
    (eliscript-analyzer--enqueue
     (lambda ()
       (unless (or (aref state 1) (aref state 2))
         (eliscript-analyzer--fail "try requires a catch or finally clause"))))))

(defun eliscript-analyzer--analyze-call-tasks (form scope)
  "Validate call FORM and schedule its descendants using explicit tasks."
  (let* ((items (eliscript-form-value form))
         (operator-form (car items))
         (operator (eliscript-form-value operator-form))
         (arguments (cdr items))
         (tail eliscript-analyzer--tail-position))
    (pcase operator
      ((or 'lambda 'fn 'async)
       (unless arguments
         (eliscript-analyzer--fail "%s requires an argument list" operator))
       (eliscript-analyzer--enqueue-function
        (car arguments) (cdr arguments) scope (eq operator 'async)))
      ('await
       (unless (= (length arguments) 1)
         (eliscript-analyzer--fail "await expects 1 argument"))
       (unless (eliscript-analyzer--async-function-p scope)
         (eliscript-analyzer--fail "await is only valid inside an async function"))
       (eliscript-analyzer--enqueue-expression (car arguments) scope nil))
      ('throw
       (unless (= (length arguments) 1)
         (eliscript-analyzer--fail "throw expects 1 argument"))
       (eliscript-analyzer--enqueue-expression (car arguments) scope nil))
      ('try (eliscript-analyzer--enqueue-try arguments scope))
      ((or 'catch 'finally)
       (eliscript-analyzer--fail "%s is only valid as a try clause" operator))
      ((or 'let 'let*)
       (eliscript-analyzer--enqueue-let arguments scope (eq operator 'let*)))
      ('loop (eliscript-analyzer--enqueue-loop arguments scope))
      ('recur
       (let ((target (car eliscript-analyzer--recur-targets)))
         (unless target
           (eliscript-analyzer--fail "recur is only valid inside a function or loop"))
         (when eliscript-analyzer--recur-barrier
           (eliscript-analyzer--fail "recur cannot cross a try boundary"))
         (unless tail
           (eliscript-analyzer--fail "recur is only valid in tail position"))
         (unless (= (length arguments) (eliscript-analyzer--recur-target-arity target))
           (eliscript-analyzer--fail
            "recur expects %d arguments for the current %s, got %d"
            (eliscript-analyzer--recur-target-arity target)
            (eliscript-analyzer--recur-target-kind target) (length arguments)))
         (eliscript-analyzer--enqueue-sequence arguments scope nil)))
      ('setq (eliscript-analyzer--enqueue-assignment arguments scope "setq"))
      ('set!
       (unless (= (length arguments) 2)
         (eliscript-analyzer--fail "set! expects 2 arguments"))
       (eliscript-analyzer--enqueue-assignment arguments scope "set!"))
      ('cond (eliscript-analyzer--enqueue-cond arguments scope))
      ('if
       (unless (<= 2 (length arguments) 3)
         (eliscript-analyzer--fail "if expects 2..3 arguments"))
       (eliscript-analyzer--enqueue-expression (car arguments) scope nil)
       (dolist (branch (cdr arguments))
         (eliscript-analyzer--enqueue-expression branch scope tail)))
      ((or 'when 'unless)
       (unless arguments
         (eliscript-analyzer--fail "%s expects 1+ arguments" operator))
       (eliscript-analyzer--enqueue-expression (car arguments) scope nil)
       (eliscript-analyzer--enqueue-sequence (cdr arguments) scope tail))
      ((or 'progn 'do 'and 'or)
       (eliscript-analyzer--enqueue-sequence arguments scope tail))
      ('while
       (unless arguments
         (eliscript-analyzer--fail "while expects 1+ arguments"))
       (eliscript-analyzer--enqueue-sequence arguments scope nil))
      ('quote nil)
      ('js-object
       (when (= (% (length arguments) 2) 1)
         (eliscript-analyzer--fail "js-object expects key/value pairs"))
       (while arguments
         (let ((key (pop arguments)) (value (pop arguments)))
           (unless (let ((key-value (eliscript-form-value key)))
                     (or (keywordp key-value) (stringp key-value)
                         (symbolp key-value)))
             (eliscript-analyzer--enqueue-expression key scope nil))
           (eliscript-analyzer--enqueue-expression value scope nil))))
      ('hash-map
       (when (= (% (length arguments) 2) 1)
         (eliscript-analyzer--fail "hash-map expects complete key/value pairs"))
       (eliscript-analyzer--enqueue-sequence arguments scope nil))
      ((or 'get 'put 'js-call)
       (pcase operator
         ('get (unless (<= 2 (length arguments) 3)
                 (eliscript-analyzer--fail "get expects 2..3 arguments")))
         ('put (unless (= (length arguments) 3)
                 (eliscript-analyzer--fail "put expects 3 arguments")))
         ('js-call (when (< (length arguments) 2)
                     (eliscript-analyzer--fail "js-call expects 2+ arguments"))))
       (eliscript-analyzer--enqueue-expression (car arguments) scope nil)
       (let ((key (cadr arguments)))
         (unless (let ((value (eliscript-form-value key)))
                   (or (keywordp value) (stringp value)))
           (eliscript-analyzer--enqueue-expression key scope nil)))
       (eliscript-analyzer--enqueue-sequence (nthcdr 2 arguments) scope nil))
      ('js* nil)
      ((pred (lambda (name) (memq name eliscript-analyzer--builtin-operators)))
       (eliscript-analyzer--enqueue-sequence arguments scope nil))
      ((or 'defun 'defn 'defportable 'defasync 'defvar 'defconst
           'export 'export-default 'import 'module)
       (eliscript-analyzer--fail "%s is only valid at module top level" operator))
      (_
       (eliscript-analyzer--enqueue-expression operator-form scope nil)
       (eliscript-analyzer--enqueue-sequence arguments scope nil)))))

(defun eliscript-analyzer--analyze-expression (form scope)
  "Analyze FORM in SCOPE without consuming stack depth for descendants."
  (if eliscript-analyzer--task-active
      (eliscript-analyzer--enqueue-expression
       form scope eliscript-analyzer--tail-position)
    (let ((eliscript-analyzer--task-active t)
          (eliscript-analyzer--expression-tasks nil)
          (eliscript-analyzer--pending-tasks nil))
      (eliscript-analyzer--enqueue-expression
       form scope eliscript-analyzer--tail-position)
      (setq eliscript-analyzer--expression-tasks
            (nreverse eliscript-analyzer--pending-tasks))
      (while eliscript-analyzer--expression-tasks
        (let ((action (pop eliscript-analyzer--expression-tasks))
              (eliscript-analyzer--pending-tasks nil))
          (funcall action)
          (setq eliscript-analyzer--expression-tasks
                (nconc (nreverse eliscript-analyzer--pending-tasks)
                       eliscript-analyzer--expression-tasks)))))))

(defun eliscript-analyzer--analyze-expression-step (form scope)
  "Analyze one expression FORM in SCOPE and enqueue its descendants."
  (let* ((eliscript-analyzer--current-span
          (or (eliscript-form-span form) eliscript-analyzer--current-span))
         (value (eliscript-form-value form)))
    (cond
     ((or (null value) (eq value t) (numberp value) (stringp value)
          (keywordp value) (eq value 'false) (eq value 'undefined)) nil)
     ((symbolp value)
      (if (eliscript-analyzer--qualified-symbol-p value)
          (condition-case error-data
              (eliscript-symbol-reference-name value)
            (eliscript-compile-error
             (eliscript-analyzer--fail
              "%s" (eliscript-diagnostic-condition-message error-data))))
        (eliscript-analyzer--require-binding scope value)))
     ((vectorp value)
      (eliscript-analyzer--enqueue-sequence (append value nil) scope nil))
     ((consp value)
      (unless (proper-list-p value)
        (eliscript-analyzer--fail
         "dotted call forms are not supported: %S"
         (eliscript-form-strip form)))
      (eliscript-analyzer--analyze-call-tasks form scope))
     (t (eliscript-analyzer--fail
         "unsupported form: %S" (eliscript-form-strip form))))))

(defun eliscript-analyzer--import-bindings (arguments &optional portable)
  "Return local binding names declared by import ARGUMENTS.

When PORTABLE is non-nil, accept named imports only."
  (unless (stringp (eliscript-form-value (car arguments)))
    (eliscript-analyzer--fail "import module must be a string"))
  (let ((specifiers (cdr arguments))
        bindings
        default-seen
        namespace-seen
        named-seen)
    (while specifiers
      (let* ((specifier-form (pop specifiers))
             (specifier (eliscript-form-value specifier-form)))
        (pcase specifier
          (:default
           (when portable
             (eliscript-analyzer--fail
              "import-portable only supports named imports"))
           (when default-seen
             (eliscript-analyzer--fail "duplicate :default import"))
           (unless specifiers
             (eliscript-analyzer--fail ":default requires a binding"))
           (setq default-seen t)
           (push (pop specifiers) bindings))
          (:as
           (when portable
             (eliscript-analyzer--fail
              "import-portable only supports named imports"))
           (when namespace-seen
             (eliscript-analyzer--fail "duplicate :as import"))
           (unless specifiers
             (eliscript-analyzer--fail ":as requires a namespace binding"))
           (setq namespace-seen t)
           (push (pop specifiers) bindings))
          ((pred symbolp)
           (setq named-seen t)
           (push specifier-form bindings))
          (_ (eliscript-analyzer--fail
              "invalid import specifier: %S" specifier)))))
    (when (and namespace-seen named-seen)
      (eliscript-analyzer--fail
       "namespace and named imports cannot be combined"))
    (when (and portable (null bindings))
      (eliscript-analyzer--fail
       "import-portable expects one or more bindings"))
    (nreverse bindings)))

(defun eliscript-analyzer--flatten-modules (forms)
  "Return top-level FORMS with module wrappers removed."
  (apply
   #'append
   (mapcar
    (lambda (form)
      (let ((value (eliscript-form-value form)))
        (if (and (consp value)
                 (eq (eliscript-form-value (car value)) 'module))
            (let ((eliscript-analyzer--current-span
                   (or (eliscript-form-span form)
                       eliscript-analyzer--current-span)))
              (unless (and (cdr value)
                           (symbolp (eliscript-form-value (cadr value))))
                (eliscript-analyzer--fail "module name must be a symbol"))
              (eliscript-analyzer--flatten-modules (cddr value)))
          (list form))))
    forms)))

(defun eliscript-analyzer--predeclare-top-level (forms scope)
  "Declare all top-level bindings from FORMS in SCOPE."
  (dolist (form forms)
    (let* ((value (eliscript-form-value form))
           (eliscript-analyzer--current-span
            (or (eliscript-form-span form) eliscript-analyzer--current-span)))
      (when (consp value)
        (pcase (eliscript-form-value (car value))
        ((or 'import 'import-portable)
         (unless (cdr value)
           (eliscript-analyzer--fail "%s expects a module name"
                                     (eliscript-form-value (car value))))
         (dolist (name
                  (eliscript-analyzer--import-bindings
                   (cdr value)
                   (eq (eliscript-form-value (car value)) 'import-portable)))
           (eliscript-analyzer--declare scope name 'import nil)))
        ('defvar
         (unless (<= 1 (length (cdr value)) 2)
           (eliscript-analyzer--fail "defvar expects 1..2 arguments"))
         (eliscript-analyzer--declare scope (cadr value) 'variable t))
        ('defconst
         (unless (<= 1 (length (cdr value)) 2)
           (eliscript-analyzer--fail "defconst expects 1..2 arguments"))
         (eliscript-analyzer--declare scope (cadr value) 'constant nil))
        ((or 'defun 'defn 'defportable 'defasync)
         (unless (>= (length (cdr value)) 2)
           (eliscript-analyzer--fail
            "%s expects 2+ arguments"
            (eliscript-form-value (car value))))
         (eliscript-analyzer--declare
          scope (cadr value) 'function nil)))))))

(defun eliscript-analyzer--analyze-top-level (form scope)
  "Analyze top-level FORM in module SCOPE."
  (let* ((value (eliscript-form-value form))
         (eliscript-analyzer--current-span
          (or (eliscript-form-span form) eliscript-analyzer--current-span)))
    (if (not (consp value))
        (eliscript-analyzer--analyze-expression form scope)
      (let* ((operator-form (car value))
             (operator (eliscript-form-value operator-form))
             (arguments (cdr value)))
      (pcase operator
        ((or 'import 'import-portable) nil)
        ((or 'defvar 'defconst)
         (when (> (length arguments) 2)
           (eliscript-analyzer--fail "%s expects 1..2 arguments" operator))
         (eliscript-analyzer--analyze-expression (cadr arguments) scope))
        ((or 'defun 'defn 'defportable 'defasync)
         (unless (>= (length arguments) 2)
           (eliscript-analyzer--fail "%s expects 2+ arguments" operator))
         (eliscript-analyzer--analyze-function
          (cadr arguments) (cddr arguments) scope (eq operator 'defasync)))
        ('export
         (unless arguments
           (eliscript-analyzer--fail "export expects one or more bindings"))
         (dolist (name arguments)
           (let ((name-value (eliscript-form-value name))
                 (eliscript-analyzer--current-span
                  (or (eliscript-form-span name)
                      eliscript-analyzer--current-span)))
             (unless (symbolp name-value)
               (eliscript-analyzer--fail
                "export name must be a symbol: %S"
                (eliscript-form-strip name)))
             (eliscript-analyzer--require-binding scope name-value))))
        ('export-default
         (unless (= (length arguments) 1)
           (eliscript-analyzer--fail "export-default expects 1 argument"))
         (eliscript-analyzer--analyze-expression (car arguments) scope))
        (_ (eliscript-analyzer--analyze-expression form scope)))))))

(defun eliscript-analyze-module (forms &optional filename)
  "Validate lexical bindings in module FORMS read from FILENAME.

Return FORMS unchanged for the emitter."
  (let* ((eliscript-analyzer--filename filename)
         (eliscript-analyzer--current-span nil)
         (flattened (eliscript-analyzer--flatten-modules forms))
         (scope (eliscript-analyzer--make-scope)))
    (eliscript-analyzer--predeclare-top-level flattened scope)
    (dolist (form flattened)
      (eliscript-analyzer--analyze-top-level form scope))
    (eliscript-transient--analyze-module forms filename)
    (eliscript-portable-validate-module forms filename)
    forms))

(provide 'eliscript-analyzer)

;;; eliscript-analyzer.el ends here
