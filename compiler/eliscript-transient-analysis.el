;;; eliscript-transient-analysis.el --- Transient ownership analysis -*- lexical-binding: t; -*-

;;; Commentary:

;; This pass recognizes only the canonical transient modules.  It proves that
;; editable builders remain local to one synchronous ownership region and that
;; completion is a one-way state transition before ordinary lowering begins.

;;; Code:

(require 'cl-lib)
(require 'eliscript-diagnostic)
(require 'eliscript-form)
(require 'eliscript-parameters)

(cl-defstruct (eliscript-transient--binding
               (:constructor eliscript-transient--binding-create))
  name
  operation
  namespace
  resource)

(cl-defstruct (eliscript-transient--resource
               (:constructor eliscript-transient--resource-create))
  name
  function-id
  span)

(cl-defstruct (eliscript-transient--scope
               (:constructor eliscript-transient--scope-create))
  parent
  names)

(defvar eliscript-transient--filename nil)
(defvar eliscript-transient--current-span nil)
(defvar eliscript-transient--state nil)
(defvar eliscript-transient--function-id 0)
(defvar eliscript-transient--next-function-id 0)
(defvar eliscript-transient--loop-protected nil)
(defvar eliscript-transient--try-prefix-states nil)

(defconst eliscript-transient--trusted-core-sources
  '("stdlib/core/data.eli"
    "stdlib/core/seq.eli"
    "stdlib/core/set.eli"
    "stdlib/core/transient.eli")
  "Core implementation sources that currently require unchecked sync borrows.")

(defun eliscript-transient--fail (format-string &rest arguments)
  "Signal a transient ownership error using FORMAT-STRING and ARGUMENTS."
  (apply #'eliscript-diagnostic-signal
         'eliscript-analyze-error "ELI-A0001" "analysis"
         eliscript-transient--filename eliscript-transient--current-span
         format-string arguments))

(defun eliscript-transient--make-scope (&optional parent)
  "Create a transient-analysis scope below PARENT."
  (eliscript-transient--scope-create
   :parent parent :names (make-hash-table :test #'eq)))

(defun eliscript-transient--trusted-core-source-p (filename)
  "Return non-nil when FILENAME names an exact trusted core source."
  (and
   (stringp filename)
   (cl-some
    (lambda (suffix)
      (or (string= filename suffix)
          (string-suffix-p (concat "/" suffix) filename)))
    eliscript-transient--trusted-core-sources)))

(defun eliscript-transient--declare (scope name &optional operation namespace)
  "Declare NAME in SCOPE with optional OPERATION or NAMESPACE provenance."
  (let* ((value (eliscript-form-value name))
         (binding (eliscript-transient--binding-create
                   :name value :operation operation :namespace namespace)))
    (puthash value binding (eliscript-transient--scope-names scope))
    binding))

(defun eliscript-transient--lookup (scope name)
  "Resolve NAME from SCOPE and its parents."
  (let (binding)
    (while (and scope (not binding))
      (setq binding (gethash name (eliscript-transient--scope-names scope))
            scope (eliscript-transient--scope-parent scope)))
    binding))

(defun eliscript-transient--canonical-module-family (source)
  "Return the canonical transient module family for SOURCE, or nil."
  (when (and (stringp source)
             (string-match-p
              "\\(?:\\`\\|/\\)\\(?:stdlib\\|runtime\\)/core/transient\\.\\(?:mjs\\|eli\\)\\'"
              source))
    (if (string-match-p "\\(?:\\`\\|/\\)runtime/core/" source)
        'runtime
      'stdlib)))

(defun eliscript-transient--operation (family name)
  "Return the transient operation represented by FAMILY and NAME."
  (pcase family
    ('stdlib
     (pcase name
       ('transient 'construct)
       ((or 'conj! 'assoc! 'dissoc!) 'update)
       ('persistent! 'complete)))
    ('runtime
     (pcase name
       ('transient 'construct)
       ((or 'conjBang 'assocBang 'dissocBang) 'update)
       ('persistentBang 'complete)))))

(defun eliscript-transient--operator-binding (operator scope)
  "Resolve transient OPERATOR provenance in SCOPE."
  (let ((value (eliscript-form-value operator)))
    (when (symbolp value)
      (or
       (let ((binding (eliscript-transient--lookup scope value)))
         (and binding
              (eliscript-transient--binding-operation binding)
              binding))
       (let ((name (symbol-name value)))
         (when (string-match "\\`\\([^/]+\\)/\\([^/]+\\)\\'" name)
           (let* ((namespace
                   (eliscript-transient--lookup
                    scope (intern (match-string 1 name))))
                  (family
                   (and namespace
                        (eliscript-transient--binding-namespace namespace)))
                  (operation
                   (and family
                        (eliscript-transient--operation
                         family (intern (match-string 2 name))))))
             (and operation
                  (eliscript-transient--binding-create
                   :name value :operation operation)))))))))

(defun eliscript-transient--copy-state ()
  "Return a shallow copy of the current ownership state."
  (copy-hash-table eliscript-transient--state))

(defun eliscript-transient--merge-state (baseline branches)
  "Merge visible resource states from BRANCHES using BASELINE as the key set."
  (let ((result (copy-hash-table baseline)))
    (maphash
     (lambda (resource original)
       (let ((states
              (mapcar (lambda (branch)
                        (gethash resource branch original))
                      branches)))
         (puthash
          resource
          (if (cl-every (lambda (state) (eq state (car states)))
                        (cdr states))
              (car states)
            'maybe)
          result)))
     baseline)
    result))

(defun eliscript-transient--run-with-state (state function)
  "Run FUNCTION with a copy of STATE and return the resulting state."
  (let ((eliscript-transient--state (copy-hash-table state)))
    (funcall function)
    eliscript-transient--state))

(defun eliscript-transient--retain-state-keys (baseline)
  "Discard local resources absent from BASELINE while preserving updates."
  (let ((result (make-hash-table :test #'eq)))
    (maphash
     (lambda (resource original)
       (puthash resource
                (gethash resource eliscript-transient--state original)
                result))
     baseline)
    (setq eliscript-transient--state result)))

(defun eliscript-transient--record-try-prefix ()
  "Record the current state as one possible exceptional TRY exit."
  (when eliscript-transient--try-prefix-states
    (push (eliscript-transient--copy-state)
          eliscript-transient--try-prefix-states)))

(defun eliscript-transient--resource-state (resource)
  "Return RESOURCE's current ownership state."
  (gethash resource eliscript-transient--state 'active))

(defun eliscript-transient--check-owner (binding)
  "Return BINDING's resource after validating function ownership and state."
  (let* ((resource (eliscript-transient--binding-resource binding))
         (name (eliscript-transient--binding-name binding))
         (state (and resource
                     (eliscript-transient--resource-state resource))))
    (unless resource
      (eliscript-transient--fail
       "transient operation requires a directly bound transient value"))
    (unless (= (eliscript-transient--resource-function-id resource)
               eliscript-transient--function-id)
      (eliscript-transient--fail
       "transient binding %s cannot cross a function boundary" name))
    (pcase state
      ('active resource)
      ('consumed
       (eliscript-transient--fail
        "transient binding %s is no longer editable after persistent!" name))
      (_
       (eliscript-transient--fail
        "transient binding %s may already be persistent after conditional control flow"
        name)))))

(defun eliscript-transient--direct-resource (form scope)
  "Return the active transient resource named directly by FORM in SCOPE."
  (let* ((value (eliscript-form-value form))
         (binding (and (symbolp value)
                       (eliscript-transient--lookup scope value))))
    (unless (and binding (eliscript-transient--binding-resource binding))
      (eliscript-transient--fail
       "transient operation requires a directly bound transient value"))
    (eliscript-transient--check-owner binding)))

(defun eliscript-transient--analyze-reference (form scope)
  "Validate a reference FORM in SCOPE against transient ownership."
  (let* ((name (eliscript-form-value form))
         (operation-binding
          (eliscript-transient--operator-binding form scope))
         (binding (eliscript-transient--lookup scope name)))
    (when operation-binding
      (eliscript-transient--fail
       "transient operation %s must be called directly" name))
    (when binding
      (cond
       ((eliscript-transient--binding-operation binding)
        (eliscript-transient--fail
         "transient operation %s must be called directly" name))
       ((eliscript-transient--binding-resource binding)
        (let ((resource (eliscript-transient--binding-resource binding)))
          (unless (= (eliscript-transient--resource-function-id resource)
                     eliscript-transient--function-id)
            (eliscript-transient--fail
             "transient binding %s cannot cross a function boundary" name))
          (pcase (eliscript-transient--resource-state resource)
            ('active
             (eliscript-transient--fail
              "transient binding %s may only be used by a direct transient operation"
              name))
            ('consumed
             (eliscript-transient--fail
              "transient binding %s is no longer editable after persistent!"
              name))
            (_
             (eliscript-transient--fail
              "transient binding %s may already be persistent after conditional control flow"
              name)))))))))

(defun eliscript-transient--binding-pair (binding)
  "Return the target and initializer represented by BINDING."
  (let ((value (eliscript-form-value binding)))
    (if (and (proper-list-p value) value)
        (list (car value) (cadr value))
      (list binding nil))))

(defun eliscript-transient--declare-pattern (scope pattern)
  "Declare every name in PATTERN and return the new bindings."
  (mapcar (lambda (name) (eliscript-transient--declare scope name))
          (eliscript-binding-names pattern (lambda (_form message)
                                             (error "%s" message)))))

(defun eliscript-transient--make-pattern-bindings (pattern)
  "Create uninstalled bindings for every name in PATTERN."
  (mapcar
   (lambda (name)
     (eliscript-transient--binding-create
      :name (eliscript-form-value name)))
   (eliscript-binding-names pattern (lambda (_form message)
                                     (error "%s" message)))))

(defun eliscript-transient--install-bindings (scope bindings)
  "Install BINDINGS into SCOPE after their initializer has been analyzed."
  (dolist (binding bindings)
    (puthash (eliscript-transient--binding-name binding)
             binding
             (eliscript-transient--scope-names scope)))
  bindings)

(defun eliscript-transient--new-resource (binding span)
  "Attach a fresh transient resource at SPAN to BINDING."
  (let ((resource
         (eliscript-transient--resource-create
          :name (eliscript-transient--binding-name binding)
          :function-id eliscript-transient--function-id
          :span span)))
    (setf (eliscript-transient--binding-resource binding) resource)
    (puthash resource 'active eliscript-transient--state)
    resource))

(defun eliscript-transient--constructor-call-p (form scope)
  "Return non-nil when FORM is a canonical transient constructor call."
  (let ((value (eliscript-form-value form)))
    (and (proper-list-p value)
         value
         (let ((binding
                (eliscript-transient--operator-binding (car value) scope)))
           (and binding
                (eq (eliscript-transient--binding-operation binding)
                    'construct))))))

(defun eliscript-transient--analyze-initializer
    (initializer scope bindings &optional predeclared)
  "Analyze INITIALIZER for BINDINGS in SCOPE.

When PREDECLARED is non-nil, reuse an already attached top-level resource."
  (if (and initializer
           (eliscript-transient--constructor-call-p initializer scope))
      (let* ((value (eliscript-form-value initializer))
             (arguments (cdr value)))
        (unless (and (= (length bindings) 1)
                     (symbolp (eliscript-transient--binding-name
                               (car bindings))))
          (let ((eliscript-transient--current-span
                 (or (eliscript-form-span initializer)
                     eliscript-transient--current-span)))
            (eliscript-transient--fail
             "transient result must be bound directly to one symbol")))
        (unless (= (length arguments) 1)
          (let ((eliscript-transient--current-span
                 (or (eliscript-form-span initializer)
                     eliscript-transient--current-span)))
            (eliscript-transient--fail "transient expects 1 argument")))
        (eliscript-transient--analyze-expression
         (car arguments) scope t)
        (unless (and predeclared
                     (eliscript-transient--binding-resource (car bindings)))
          (eliscript-transient--new-resource
           (car bindings) (eliscript-form-span initializer))))
    (when initializer
      (eliscript-transient--analyze-expression initializer scope t))))

(defun eliscript-transient--analyze-sequence (forms scope value-context)
  "Analyze FORMS in SCOPE, using VALUE-CONTEXT for the final form."
  (while forms
    (eliscript-transient--analyze-expression
     (car forms) scope (and value-context (null (cdr forms))))
    (setq forms (cdr forms))))

(defun eliscript-transient--analyze-let
    (arguments scope sequential value-context)
  "Analyze LET ARGUMENTS with SEQUENTIAL binding semantics."
  (let* ((baseline (eliscript-transient--copy-state))
         (bindings (eliscript-form-value (car arguments)))
         (body (cdr arguments))
         (child (eliscript-transient--make-scope scope)))
    (if sequential
        (dolist (entry bindings)
          (pcase-let* ((`(,target ,initializer)
                        (eliscript-transient--binding-pair entry))
                       (declared
                        (eliscript-transient--make-pattern-bindings target)))
            (eliscript-transient--analyze-initializer
             initializer child declared)
            (eliscript-transient--install-bindings child declared)))
      (let ((parsed (mapcar #'eliscript-transient--binding-pair bindings))
            declared)
        (dolist (entry parsed)
          (push (eliscript-transient--make-pattern-bindings (car entry))
                declared))
        (setq declared (nreverse declared))
        (cl-mapc
         (lambda (entry targets)
           (eliscript-transient--analyze-initializer
            (cadr entry) scope targets))
         parsed declared)
        (dolist (targets declared)
          (eliscript-transient--install-bindings child targets))))
    (eliscript-transient--analyze-sequence body child value-context)
    (eliscript-transient--retain-state-keys baseline)))

(defun eliscript-transient--analyze-function (parameters body scope)
  "Analyze a function with PARAMETERS and BODY below SCOPE."
  (let* ((eliscript-transient--next-function-id
          (1+ eliscript-transient--next-function-id))
         (eliscript-transient--function-id eliscript-transient--next-function-id)
         (eliscript-transient--state (copy-hash-table eliscript-transient--state))
         (eliscript-transient--loop-protected nil)
         (child (eliscript-transient--make-scope scope)))
    (dolist (parameter
             (eliscript-parameters-parse parameters
               (lambda (_form message) (error "%s" message))))
      (eliscript-transient--declare-pattern
       child (eliscript-parameter-form parameter)))
    (eliscript-transient--analyze-sequence body child t)))

(defun eliscript-transient--analyze-if
    (arguments scope value-context)
  "Analyze conditional ARGUMENTS with ownership-state merging."
  (eliscript-transient--analyze-expression (car arguments) scope t)
  (let* ((baseline (eliscript-transient--copy-state))
         (then-state
          (eliscript-transient--run-with-state
           baseline
           (lambda ()
             (eliscript-transient--analyze-expression
              (cadr arguments) scope value-context))))
         (else-state
          (if (cddr arguments)
              (eliscript-transient--run-with-state
               baseline
               (lambda ()
                 (eliscript-transient--analyze-expression
                  (caddr arguments) scope value-context)))
            baseline)))
    (setq eliscript-transient--state
          (eliscript-transient--merge-state
           baseline (list then-state else-state)))))

(defun eliscript-transient--analyze-when
    (arguments scope value-context)
  "Analyze WHEN or UNLESS ARGUMENTS with an implicit unchanged branch."
  (eliscript-transient--analyze-expression (car arguments) scope t)
  (let* ((baseline (eliscript-transient--copy-state))
         (body-state
          (eliscript-transient--run-with-state
           baseline
           (lambda ()
             (eliscript-transient--analyze-sequence
              (cdr arguments) scope value-context)))))
    (setq eliscript-transient--state
          (eliscript-transient--merge-state
           baseline (list baseline body-state)))))

(defun eliscript-transient--analyze-short-circuit
    (arguments scope value-context)
  "Analyze short-circuit ARGUMENTS and merge every possible stop point."
  (let (exits)
    (dolist (argument arguments)
      (eliscript-transient--analyze-expression argument scope value-context)
      (push (eliscript-transient--copy-state) exits))
    (when exits
      (let ((baseline (car (last exits))))
        (setq eliscript-transient--state
              (eliscript-transient--merge-state baseline exits))))))

(defun eliscript-transient--analyze-cond
    (clauses scope value-context)
  "Analyze COND CLAUSES with sequential test effects and merged exits."
  (let ((baseline (eliscript-transient--copy-state))
        exits default-seen)
    (while (and clauses (not default-seen))
      (let ((clause (pop clauses)))
      (let* ((items (eliscript-form-value clause))
             (test (car items)))
        (eliscript-transient--analyze-expression test scope t)
        (let* ((after-test (eliscript-transient--copy-state))
               (body-state
                (eliscript-transient--run-with-state
                 after-test
                 (lambda ()
                   (eliscript-transient--analyze-sequence
                    (cdr items) scope value-context)))))
          (push body-state exits)
          (when (eq (eliscript-form-value test) t)
              (setq default-seen t))))))
    (unless default-seen
      (push (eliscript-transient--copy-state) exits))
    (when exits
      (setq eliscript-transient--state
            (eliscript-transient--merge-state baseline exits)))))

(defun eliscript-transient--try-clause-p (form operator)
  "Return non-nil when FORM is a TRY clause headed by OPERATOR."
  (let ((value (eliscript-form-value form)))
    (and (consp value)
         (eq (eliscript-form-value (car value)) operator))))

(defun eliscript-transient--analyze-try (arguments scope value-context)
  "Analyze TRY ARGUMENTS with conservative exceptional state merging."
  (let ((baseline (eliscript-transient--copy-state))
        body catch-clause finally-clause)
    (dolist (argument arguments)
      (cond
       ((eliscript-transient--try-clause-p argument 'catch)
        (setq catch-clause argument))
       ((eliscript-transient--try-clause-p argument 'finally)
        (setq finally-clause argument))
       (t (push argument body))))
    (setq body (nreverse body))
    (let* ((eliscript-transient--try-prefix-states
            (list (copy-hash-table baseline)))
           (normal-state
            (eliscript-transient--run-with-state
             baseline
             (lambda ()
               (eliscript-transient--analyze-sequence
                body scope value-context)))))
      (let* ((exception-state
              (eliscript-transient--merge-state
               baseline eliscript-transient--try-prefix-states))
             (catch-state
              (if catch-clause
                  (let* ((items (eliscript-form-value catch-clause))
                         (child (eliscript-transient--make-scope scope)))
                    (eliscript-transient--declare-pattern child (cadr items))
                    (eliscript-transient--run-with-state
                     exception-state
                     (lambda ()
                       (eliscript-transient--analyze-sequence
                        (cddr items) child value-context))))
                exception-state)))
        (setq eliscript-transient--state
              (eliscript-transient--merge-state
               baseline (list normal-state catch-state)))))
    (when finally-clause
      (eliscript-transient--analyze-sequence
       (cdr (eliscript-form-value finally-clause)) scope nil))))

(defun eliscript-transient--visible-active-resources ()
  "Return active or maybe-active resources owned by the current function."
  (let (resources)
    (maphash
     (lambda (resource state)
       (when (and (= (eliscript-transient--resource-function-id resource)
                     eliscript-transient--function-id)
                  (memq state '(active maybe)))
         (push resource resources)))
     eliscript-transient--state)
    (sort resources
          (lambda (left right)
            (string-lessp
             (symbol-name (eliscript-transient--resource-name left))
             (symbol-name (eliscript-transient--resource-name right)))))))

(defun eliscript-transient--analyze-await (arguments scope)
  "Analyze AWAIT ARGUMENTS and reject live ownership at suspension."
  (eliscript-transient--analyze-expression (car arguments) scope t)
  (let ((active (eliscript-transient--visible-active-resources)))
    (when active
      (eliscript-transient--fail
       "transient binding %s cannot remain active across await"
       (eliscript-transient--resource-name (car active))))))

(defun eliscript-transient--analyze-operation
    (operation form arguments scope value-context)
  "Analyze transient OPERATION call FORM with ARGUMENTS in SCOPE."
  (pcase operation
    ('construct
     (eliscript-transient--fail
      "transient result must be bound directly to one symbol"))
    ('update
     (unless arguments
       (eliscript-transient--fail
        "transient update requires a directly bound transient value"))
     (let ((eliscript-transient--current-span
            (or (eliscript-form-span (car arguments))
                (eliscript-form-span form))))
       (eliscript-transient--direct-resource (car arguments) scope))
     (when value-context
       (eliscript-transient--fail
        "transient update result cannot be used as an ordinary value"))
     (dolist (argument (cdr arguments))
       (eliscript-transient--analyze-expression argument scope t)))
    ('complete
     (unless (= (length arguments) 1)
       (eliscript-transient--fail "persistent! expects 1 argument"))
     (let* ((argument (car arguments))
            (eliscript-transient--current-span
             (or (eliscript-form-span argument) (eliscript-form-span form)))
            (resource (eliscript-transient--direct-resource argument scope)))
       (when (memq resource eliscript-transient--loop-protected)
         (eliscript-transient--fail
          "transient binding %s cannot be completed inside a repeated loop"
          (eliscript-transient--resource-name resource)))
       (puthash resource 'consumed eliscript-transient--state)))))

(defun eliscript-transient--analyze-loop
    (arguments scope value-context)
  "Analyze LOOP ARGUMENTS and protect resources visible before repetition."
  (let* ((baseline (eliscript-transient--copy-state))
         (bindings (eliscript-form-value (car arguments)))
         (child (eliscript-transient--make-scope scope)))
    (dolist (entry bindings)
      (pcase-let* ((`(,target ,initializer)
                    (eliscript-transient--binding-pair entry))
                   (declared
                    (eliscript-transient--declare-pattern child target)))
        (eliscript-transient--analyze-initializer initializer scope declared)))
    (let ((eliscript-transient--loop-protected
           (append (eliscript-transient--visible-active-resources)
                   eliscript-transient--loop-protected)))
      (eliscript-transient--analyze-sequence
       (cdr arguments) child value-context))
    (eliscript-transient--retain-state-keys baseline)))

(defun eliscript-transient--analyze-while
    (arguments scope value-context)
  "Analyze WHILE ARGUMENTS with a conservative repeated-loop boundary."
  (eliscript-transient--analyze-expression (car arguments) scope t)
  (let* ((baseline (eliscript-transient--copy-state))
         (eliscript-transient--loop-protected
          (append (eliscript-transient--visible-active-resources)
                  eliscript-transient--loop-protected))
         (body-state
          (eliscript-transient--run-with-state
           baseline
           (lambda ()
             (eliscript-transient--analyze-sequence
              (cdr arguments) scope nil)))))
    (setq eliscript-transient--state
          (eliscript-transient--merge-state
           baseline (list baseline body-state)))
    (ignore value-context)))

(defun eliscript-transient--analyze-assignment (arguments scope)
  "Analyze assignment ARGUMENTS and reject transient rebinding."
  (while arguments
    (let* ((name (pop arguments))
           (value (pop arguments))
           (binding
            (eliscript-transient--lookup scope (eliscript-form-value name))))
      (when (and binding (eliscript-transient--binding-resource binding))
        (let ((eliscript-transient--current-span
               (or (eliscript-form-span name)
                   eliscript-transient--current-span)))
          (eliscript-transient--fail
           "transient binding %s cannot be reassigned"
           (eliscript-form-value name))))
      (eliscript-transient--analyze-expression value scope t))))

(defun eliscript-transient--analyze-call (form scope value-context)
  "Analyze call FORM in SCOPE under VALUE-CONTEXT."
  (let* ((items (eliscript-form-value form))
         (operator-form (car items))
         (operator (eliscript-form-value operator-form))
         (arguments (cdr items))
         (operation-binding
          (eliscript-transient--operator-binding operator-form scope)))
    (if operation-binding
        (eliscript-transient--analyze-operation
         (eliscript-transient--binding-operation operation-binding)
         form arguments scope value-context)
      (pcase operator
        ((or 'lambda 'fn 'async)
         (eliscript-transient--analyze-function
          (car arguments) (cdr arguments) scope))
        ('await (eliscript-transient--analyze-await arguments scope))
        ((or 'quote 'js*) nil)
        ('let (eliscript-transient--analyze-let
               arguments scope nil value-context))
        ('let* (eliscript-transient--analyze-let
                arguments scope t value-context))
        ('loop (eliscript-transient--analyze-loop
                arguments scope value-context))
        ('while (eliscript-transient--analyze-while
                 arguments scope value-context))
        ((or 'setq 'set!)
         (eliscript-transient--analyze-assignment arguments scope))
        ('if (eliscript-transient--analyze-if
              arguments scope value-context))
        ((or 'when 'unless)
         (eliscript-transient--analyze-when
          arguments scope value-context))
        ((or 'and 'or)
         (eliscript-transient--analyze-short-circuit
          arguments scope value-context))
        ('cond (eliscript-transient--analyze-cond
                arguments scope value-context))
        ('try (eliscript-transient--analyze-try
               arguments scope value-context))
        ((or 'progn 'do)
         (eliscript-transient--analyze-sequence
          arguments scope value-context))
        (_
         (let ((operator-binding
                (and (symbolp operator)
                     (eliscript-transient--lookup scope operator))))
           (when (and operator-binding
                      (or (eliscript-transient--binding-operation
                           operator-binding)
                          (eliscript-transient--binding-resource
                           operator-binding)))
             (eliscript-transient--analyze-reference operator-form scope)))
         (dolist (argument arguments)
           (eliscript-transient--analyze-expression argument scope t)))))))

(defun eliscript-transient--analyze-expression (form scope value-context)
  "Analyze expression FORM in SCOPE under VALUE-CONTEXT."
  (when form
    (let* ((eliscript-transient--current-span
            (or (eliscript-form-span form)
                eliscript-transient--current-span))
           (value (eliscript-form-value form)))
      (eliscript-transient--record-try-prefix)
      (cond
       ((symbolp value)
        (eliscript-transient--analyze-reference form scope))
       ((vectorp value)
        (dolist (item (append value nil))
          (eliscript-transient--analyze-expression item scope t)))
       ((consp value)
        (eliscript-transient--analyze-call form scope value-context)))
      (eliscript-transient--record-try-prefix))))

(defun eliscript-transient--import-declarations (arguments scope)
  "Declare import ARGUMENTS in SCOPE with canonical transient provenance."
  (let* ((source (eliscript-form-value (car arguments)))
         (family (eliscript-transient--canonical-module-family source))
         (specifiers (cdr arguments)))
    (while specifiers
      (let* ((specifier-form (pop specifiers))
             (specifier (eliscript-form-value specifier-form)))
        (pcase specifier
          ((or :default :as)
           (let ((name (pop specifiers)))
             (eliscript-transient--declare
              scope name nil (and (eq specifier :as) family))))
          ((pred symbolp)
           (eliscript-transient--declare
            scope specifier-form
            (and family
                 (eliscript-transient--operation family specifier)))))))))

(defun eliscript-transient--flatten-modules (forms)
  "Return FORMS with module wrappers removed."
  (apply
   #'append
   (mapcar
    (lambda (form)
      (let ((value (eliscript-form-value form)))
        (if (and (consp value)
                 (eq (eliscript-form-value (car value)) 'module))
            (eliscript-transient--flatten-modules (cddr value))
          (list form))))
    forms)))

(defun eliscript-transient--predeclare-top-level (forms scope)
  "Predeclare top-level names and canonical transient resources."
  (dolist (form forms)
    (let ((value (eliscript-form-value form)))
      (when (consp value)
        (pcase (eliscript-form-value (car value))
          ((or 'import 'import-portable)
           (eliscript-transient--import-declarations (cdr value) scope))
          ((or 'defvar 'defconst 'defun 'defn 'defportable 'defasync)
           (eliscript-transient--declare scope (cadr value)))))))
  (dolist (form forms)
    (let* ((value (eliscript-form-value form))
           (operator (and (consp value)
                          (eliscript-form-value (car value)))))
      (when (and (memq operator '(defvar defconst))
                 (caddr value)
                 (eliscript-transient--constructor-call-p
                  (caddr value) scope))
        (let ((binding
               (eliscript-transient--lookup
                scope (eliscript-form-value (cadr value)))))
          (eliscript-transient--new-resource
           binding (eliscript-form-span (caddr value))))))))

(defun eliscript-transient--check-export (name scope)
  "Reject exporting transient binding NAME from SCOPE."
  (let* ((value (eliscript-form-value name))
         (binding (and (symbolp value)
                       (eliscript-transient--lookup scope value))))
    (when (and binding (eliscript-transient--binding-resource binding))
      (let ((eliscript-transient--current-span
             (or (eliscript-form-span name)
                 eliscript-transient--current-span)))
        (eliscript-transient--fail
         "transient binding %s cannot be exported" value)))))

(defun eliscript-transient--analyze-top-level (form scope)
  "Analyze top-level FORM in transient ownership SCOPE."
  (let* ((eliscript-transient--current-span
          (or (eliscript-form-span form)
              eliscript-transient--current-span))
         (value (eliscript-form-value form))
         (operator (and (consp value)
                        (eliscript-form-value (car value))))
         (arguments (and (consp value) (cdr value))))
    (pcase operator
      ((or 'import 'import-portable) nil)
      ((or 'defvar 'defconst)
       (let* ((binding
               (eliscript-transient--lookup
                scope (eliscript-form-value (car arguments))))
              (initializer (cadr arguments)))
         (eliscript-transient--analyze-initializer
          initializer scope (list binding) t)))
      ((or 'defun 'defn 'defportable 'defasync)
       (eliscript-transient--analyze-function
        (cadr arguments) (cddr arguments) scope))
      ('export
       (dolist (name arguments)
         (eliscript-transient--check-export name scope)))
      ('export-default
       (let ((argument (car arguments)))
         (eliscript-transient--check-export argument scope)
         (eliscript-transient--analyze-expression argument scope t)))
      (_ (eliscript-transient--analyze-expression form scope nil)))))

(defun eliscript-transient--analyze-module (forms &optional filename)
  "Validate transient ownership and escape rules in expanded FORMS."
  (if (eliscript-transient--trusted-core-source-p filename)
      forms
    (let* ((eliscript-transient--filename filename)
         (eliscript-transient--current-span nil)
         (eliscript-transient--state (make-hash-table :test #'eq))
         (eliscript-transient--function-id 0)
         (eliscript-transient--next-function-id 0)
         (eliscript-transient--loop-protected nil)
         (eliscript-transient--try-prefix-states nil)
         (flattened (eliscript-transient--flatten-modules forms))
         (scope (eliscript-transient--make-scope)))
    (eliscript-transient--predeclare-top-level flattened scope)
    (dolist (form flattened)
      (eliscript-transient--analyze-top-level form scope))
      forms)))

(provide 'eliscript-transient-analysis)

;;; eliscript-transient-analysis.el ends here
