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

(defun eliscript-expander--generated-form-at (value form)
  "Wrap generated VALUE at FORM's source location."
  (eliscript-form-wrap
   value
   (or (eliscript-form-span form) eliscript-expander--current-span)))

(defun eliscript-expander--thread-step (value-form step-form position)
  "Insert VALUE-FORM into STEP-FORM at thread POSITION."
  (let ((step (eliscript-form-value step-form)))
    (cond
     ((eliscript-macro-eval-symbol-p step)
      (eliscript-expander--generated-form-at
       (list step-form value-form) step-form))
     ((and (proper-list-p step) step)
      (eliscript-expander--generated-form-at
       (if (eq position 'first)
           (cons (car step) (cons value-form (cdr step)))
         (append step (list value-form)))
       step-form))
     (t
      (eliscript-expander--fail
       "thread step must be a symbol or non-empty list: %S"
       (eliscript-form-strip step-form))))))

(defun eliscript-expander--desugar-thread (form-name arguments position)
  "Return FORM-NAME ARGUMENTS threaded at POSITION."
  (unless arguments
    (eliscript-expander--fail "%s expects an initial expression" form-name))
  (let ((result (car arguments)))
    (dolist (step-form (cdr arguments) result)
      (setq result
            (eliscript-expander--thread-step
             result step-form position)))))

(defun eliscript-expander--fresh-name-form (prefix)
  "Return a capture-safe generated symbol using PREFIX."
  (eliscript-expander--generated-form
   (eliscript-macro-eval--allocate-name
    (eliscript-macro-eval--make-scope
     nil eliscript-expander--macro-context)
    prefix)))

(defun eliscript-expander--let-form (name-form value-form body-form)
  "Return a generated let binding NAME-FORM to VALUE-FORM around BODY-FORM."
  (let* ((binding
          (eliscript-expander--generated-form-at
           (list name-form value-form) value-form))
         (bindings
          (eliscript-expander--generated-form-at
           (list binding) value-form)))
    (eliscript-expander--generated-form-at
     (list
      (eliscript-expander--generated-form-at 'let value-form)
      bindings
      body-form)
     value-form)))

(defun eliscript-expander--desugar-as-thread (arguments)
  "Return the sequential binding represented by as-> ARGUMENTS."
  (when (< (length arguments) 3)
    (eliscript-expander--fail
     "as-> expects an initial expression, binding name, and at least one form"))
  (let ((initial-form (nth 0 arguments))
        (name-form (nth 1 arguments))
        (step-forms (nthcdr 2 arguments)))
    (unless (eliscript-macro-eval-symbol-p
             (eliscript-form-value name-form))
      (eliscript-expander--fail
       "as-> binding name must be a symbol: %S"
       (eliscript-form-strip name-form)))
    (let ((body (car (last step-forms))))
      (dolist (step-form (reverse (butlast step-forms)))
        (setq body
              (eliscript-expander--let-form
               name-form step-form body)))
      (eliscript-expander--let-form name-form initial-form body))))

(defun eliscript-expander--desugar-cond-thread
    (form-name arguments position)
  "Return conditional FORM-NAME ARGUMENTS threaded at POSITION."
  (unless arguments
    (eliscript-expander--fail "%s expects an initial expression" form-name))
  (let ((clauses (cdr arguments)))
    (when (= (% (length clauses) 2) 1)
      (eliscript-expander--fail
       "%s expects test and step pairs" form-name))
    (if (null clauses)
        (car arguments)
      (let ((name-form (eliscript-expander--fresh-name-form "thread"))
            (body nil)
            (index (- (length arguments) 2)))
        (setq body name-form)
        (while (>= index 1)
          (let ((test-form (nth index arguments))
                (step-form (nth (1+ index) arguments)))
            (setq body
                  (eliscript-expander--let-form
                   name-form
                   (eliscript-expander--generated-form
                    (list
                     (eliscript-expander--generated-form 'if)
                     test-form
                     (eliscript-expander--thread-step
                      name-form step-form position)
                     name-form))
                   body))
            (setq index (- index 2))))
        (eliscript-expander--let-form
         name-form (car arguments) body)))))

(defun eliscript-expander--desugar-some-thread
    (form-name arguments position)
  "Return nil-short-circuiting FORM-NAME ARGUMENTS threaded at POSITION."
  (unless arguments
    (eliscript-expander--fail "%s expects an initial expression" form-name))
  (if (null (cdr arguments))
      (car arguments)
    (let ((name-form (eliscript-expander--fresh-name-form "thread"))
          (body nil))
      (setq body name-form)
      (dolist (step-form (reverse (cdr arguments)))
        (setq body
              (eliscript-expander--generated-form
               (list
                (eliscript-expander--generated-form 'if)
                (eliscript-expander--conditional-test name-form t)
                (eliscript-expander--let-form
                 name-form
                 (eliscript-expander--thread-step
                  name-form step-form position)
                 body)
                (eliscript-expander--generated-form nil)))))
      (eliscript-expander--let-form
       name-form (car arguments) body))))

(defun eliscript-expander--conditional-binding (form-name binding-form)
  "Validate FORM-NAME BINDING-FORM and return its name and initializer."
  (let ((binding (eliscript-form-value binding-form)))
    (unless (and (proper-list-p binding) (= (length binding) 2))
      (eliscript-expander--fail
       "%s binding must contain a name and initializer: %S"
       form-name (eliscript-form-strip binding-form)))
    (unless (eliscript-macro-eval-symbol-p
             (eliscript-form-value (car binding)))
      (eliscript-expander--fail
       "%s binding name must be a symbol: %S"
       form-name (eliscript-form-strip (car binding))))
    binding))

(defun eliscript-expander--conditional-test (name-form some-p)
  "Return the generated truth test for NAME-FORM and SOME-P."
  (if some-p
      (eliscript-expander--generated-form
       (list
        (eliscript-expander--generated-form 'not)
        (eliscript-expander--generated-form
         (list
          (eliscript-expander--generated-form 'nil?)
          name-form))))
    name-form))

(defun eliscript-expander--desugar-if-binding
    (form-name arguments some-p)
  "Return the if binding FORM-NAME represented by ARGUMENTS and SOME-P."
  (unless (<= 2 (length arguments) 3)
    (eliscript-expander--fail
     "%s expects a binding, then form, and optional else form" form-name))
  (let* ((binding
          (eliscript-expander--conditional-binding
           form-name (nth 0 arguments)))
         (name-form (nth 0 binding))
         (initializer-form (nth 1 binding))
         (then-form (nth 1 arguments))
         (else-form
          (or (nth 2 arguments)
              (eliscript-expander--generated-form nil)))
         (if-form
          (eliscript-expander--generated-form
           (list
            (eliscript-expander--generated-form 'if)
            (eliscript-expander--conditional-test name-form some-p)
            then-form
            else-form))))
    (eliscript-expander--let-form name-form initializer-form if-form)))

(defun eliscript-expander--desugar-when-binding
    (form-name arguments some-p)
  "Return the conditional body FORM-NAME represented by ARGUMENTS and SOME-P."
  (when (< (length arguments) 2)
    (eliscript-expander--fail
     "%s expects a binding and at least one body form" form-name))
  (let* ((binding
          (eliscript-expander--conditional-binding
           form-name (car arguments)))
         (name-form (nth 0 binding))
         (initializer-form (nth 1 binding))
         (body-form
          (eliscript-expander--generated-form
           (cons
            (eliscript-expander--generated-form 'progn)
            (cdr arguments))))
         (if-form
          (eliscript-expander--generated-form
           (list
            (eliscript-expander--generated-form 'if)
            (eliscript-expander--conditional-test name-form some-p)
            body-form
            (eliscript-expander--generated-form nil)))))
    (eliscript-expander--let-form name-form initializer-form if-form)))

(defun eliscript-expander--desugar-defprotocol (arguments)
  "Return core declarations represented by defprotocol ARGUMENTS."
  (when (< (length arguments) 2)
    (eliscript-expander--fail
     "defprotocol expects a name and at least one operation"))
  (let* ((name-form (car arguments))
         (name (eliscript-form-value name-form))
         (operation-forms (cdr arguments))
         (seen (make-hash-table :test #'equal))
         operation-names)
    (unless (eliscript-macro-eval-symbol-p name)
      (eliscript-expander--fail
       "defprotocol name must be a symbol: %S"
       (eliscript-form-strip name-form)))
    (dolist (operation-form operation-forms)
      (let ((operation (eliscript-form-value operation-form)))
        (unless (eliscript-macro-eval-symbol-p operation)
          (eliscript-expander--fail
           "defprotocol operation must be a symbol: %S"
           (eliscript-form-strip operation-form)))
        (let ((operation-name (symbol-name operation)))
          (when (gethash operation-name seen)
            (eliscript-expander--fail
             "defprotocol declares duplicate operation: %s" operation-name))
          (puthash operation-name t seen)
          (push (eliscript-expander--generated-form-at
                 operation-name operation-form)
                operation-names))))
    (setq operation-names (nreverse operation-names))
    (cons
     (eliscript-expander--generated-form
      (list
       (eliscript-expander--generated-form 'defconst)
       name-form
       (eliscript-expander--generated-form
        (list
         (eliscript-expander--generated-form 'define-protocol)
         (eliscript-expander--generated-form-at
          (symbol-name name) name-form)
         (eliscript-expander--generated-form
          (cons (eliscript-expander--generated-form 'js-array)
                operation-names))))))
     (mapcar
      (lambda (operation-form)
        (eliscript-expander--generated-form
         (list
          (eliscript-expander--generated-form 'defconst)
          operation-form
          (eliscript-expander--generated-form
           (list
            (eliscript-expander--generated-form 'protocol-method)
            name-form
            (eliscript-expander--generated-form-at
             (symbol-name (eliscript-form-value operation-form))
             operation-form))))))
      operation-forms))))

(defun eliscript-expander--desugar-defrecord (arguments)
  "Return core declarations represented by defrecord ARGUMENTS."
  (unless (= (length arguments) 2)
    (eliscript-expander--fail
     "defrecord expects a name and field vector"))
  (let* ((name-form (nth 0 arguments))
         (name (eliscript-form-value name-form))
         (fields-form (nth 1 arguments))
         (fields (eliscript-form-value fields-form))
         (seen (make-hash-table :test #'equal))
         field-names)
    (unless (and (eliscript-macro-eval-symbol-p name)
                 (not (string-match-p "/" (symbol-name name))))
      (eliscript-expander--fail
       "defrecord name must be an unqualified symbol: %S"
       (eliscript-form-strip name-form)))
    (unless (vectorp fields)
      (eliscript-expander--fail
       "defrecord fields must be a vector: %S"
       (eliscript-form-strip fields-form)))
    (dolist (field-form (append fields nil))
      (let ((field (eliscript-form-value field-form)))
        (unless (and (eliscript-macro-eval-symbol-p field)
                     (not (string-match-p "/" (symbol-name field))))
          (eliscript-expander--fail
           "defrecord fields must be unqualified symbols: %S"
           (eliscript-form-strip field-form)))
        (let ((field-name (symbol-name field)))
          (when (gethash field-name seen)
            (eliscript-expander--fail
             "defrecord declares duplicate field: %s" field-name))
          (puthash field-name t seen)
          (push (eliscript-expander--generated-form-at
                 field-name field-form)
                field-names))))
    (setq field-names (nreverse field-names))
    (let* ((name-string (symbol-name name))
           (field-forms (append fields nil))
           (parameter-form
            (eliscript-expander--generated-form-at field-forms fields-form))
           (constructor-form
            (eliscript-expander--generated-form-at
             (intern (concat "->" name-string)) name-form))
           (map-constructor-form
            (eliscript-expander--generated-form-at
             (intern (concat "map->" name-string)) name-form))
           (predicate-form
            (eliscript-expander--generated-form-at
             (intern (concat name-string "?")) name-form))
           (source-form
            (eliscript-expander--generated-form-at 'source fields-form))
           (value-form
            (eliscript-expander--generated-form-at 'value name-form)))
      (list
       (eliscript-expander--generated-form
        (list
         (eliscript-expander--generated-form 'defconst)
         name-form
         (eliscript-expander--generated-form
          (list
           (eliscript-expander--generated-form 'define-record-type)
           (eliscript-expander--generated-form-at name-string name-form)
           (eliscript-expander--generated-form
            (cons (eliscript-expander--generated-form 'js-array)
                  field-names))))))
       (eliscript-expander--generated-form
        (list
         (eliscript-expander--generated-form 'defconst)
         constructor-form
         (eliscript-expander--generated-form
          (list
           (eliscript-expander--generated-form 'lambda)
           parameter-form
           (eliscript-expander--generated-form
            (append
             (list
              (eliscript-expander--generated-form 'js-call)
              name-form
              (eliscript-expander--generated-form ':create))
             field-forms))))))
       (eliscript-expander--generated-form
        (list
         (eliscript-expander--generated-form 'defconst)
         map-constructor-form
         (eliscript-expander--generated-form
          (list
           (eliscript-expander--generated-form 'lambda)
           (eliscript-expander--generated-form (list source-form))
           (eliscript-expander--generated-form
            (list
             (eliscript-expander--generated-form 'js-call)
             name-form
             (eliscript-expander--generated-form ':fromMap)
             source-form))))))
       (eliscript-expander--generated-form
        (list
         (eliscript-expander--generated-form 'defconst)
         predicate-form
         (eliscript-expander--generated-form
          (list
           (eliscript-expander--generated-form 'lambda)
           (eliscript-expander--generated-form (list value-form))
           (eliscript-expander--generated-form
            (list
             (eliscript-expander--generated-form 'js-call)
             name-form
             (eliscript-expander--generated-form ':isInstance)
             value-form))))))))))

(defun eliscript-expander--protocol-method-object (form-name method-forms)
  "Build an implementation object for FORM-NAME from METHOD-FORMS."
  (unless method-forms
    (eliscript-expander--fail
     "%s expects at least one method" form-name))
  (let ((seen (make-hash-table :test #'equal))
        object-items)
    (dolist (method-form method-forms)
      (let ((method (eliscript-form-value method-form)))
        (unless (and (proper-list-p method) (>= (length method) 2))
          (eliscript-expander--fail
           "%s method must contain an operation and parameter list: %S"
           form-name (eliscript-form-strip method-form)))
        (let* ((operation-form (car method))
               (operation (eliscript-form-value operation-form)))
          (unless (eliscript-macro-eval-symbol-p operation)
            (eliscript-expander--fail
             "%s method operation must be a symbol: %S"
             form-name (eliscript-form-strip operation-form)))
          (let ((operation-name (symbol-name operation)))
            (when (gethash operation-name seen)
              (eliscript-expander--fail
               "%s declares duplicate method: %s" form-name operation-name))
            (puthash operation-name t seen)
            (setq object-items
                  (append
                   object-items
                   (list
                    (eliscript-expander--generated-form-at
                     operation-name operation-form)
                    (eliscript-expander--generated-form-at
                     (cons
                      (eliscript-expander--generated-form-at
                       'lambda method-form)
                      (cdr method))
                     method-form))))))))
    (eliscript-expander--generated-form
     (cons (eliscript-expander--generated-form 'js-object) object-items))))

(defun eliscript-expander--desugar-extend-type (arguments)
  "Return the core exact-type extension represented by ARGUMENTS."
  (when (< (length arguments) 3)
    (eliscript-expander--fail
     "extend-type expects a target, protocol, and at least one method"))
  (let ((target-form (nth 0 arguments))
        (protocol-form (nth 1 arguments)))
    (unless (eliscript-macro-eval-symbol-p
             (eliscript-form-value target-form))
      (eliscript-expander--fail
       "extend-type target must be a symbol: %S"
       (eliscript-form-strip target-form)))
    (unless (eliscript-macro-eval-symbol-p
             (eliscript-form-value protocol-form))
      (eliscript-expander--fail
       "extend-type protocol must be a symbol: %S"
       (eliscript-form-strip protocol-form)))
    (eliscript-expander--generated-form
     (list
      (eliscript-expander--generated-form 'extend-protocol-type)
      protocol-form
      target-form
      (eliscript-expander--protocol-method-object
       "extend-type" (nthcdr 2 arguments))))))

(defun eliscript-expander--desugar-extend-category (arguments)
  "Return the core host-category extension represented by ARGUMENTS."
  (when (< (length arguments) 3)
    (eliscript-expander--fail
     "extend-category expects a category, protocol, and at least one method"))
  (let ((category-form (nth 0 arguments))
        (protocol-form (nth 1 arguments)))
    (unless (and (stringp (eliscript-form-value category-form))
                 (> (length (eliscript-form-value category-form)) 0))
      (eliscript-expander--fail
       "extend-category category must be a non-empty string: %S"
       (eliscript-form-strip category-form)))
    (unless (eliscript-macro-eval-symbol-p
             (eliscript-form-value protocol-form))
      (eliscript-expander--fail
       "extend-category protocol must be a symbol: %S"
       (eliscript-form-strip protocol-form)))
    (eliscript-expander--generated-form
     (list
      (eliscript-expander--generated-form 'extend-protocol-category)
      protocol-form
      category-form
      (eliscript-expander--protocol-method-object
       "extend-category" (nthcdr 2 arguments))))))

(defun eliscript-expander--desugar-extend-default (arguments)
  "Return the core default extension represented by ARGUMENTS."
  (when (< (length arguments) 2)
    (eliscript-expander--fail
     "extend-default expects a protocol and at least one method"))
  (let ((protocol-form (car arguments)))
    (unless (eliscript-macro-eval-symbol-p
             (eliscript-form-value protocol-form))
      (eliscript-expander--fail
       "extend-default protocol must be a symbol: %S"
       (eliscript-form-strip protocol-form)))
    (eliscript-expander--generated-form
     (list
      (eliscript-expander--generated-form 'extend-protocol-default)
      protocol-form
      (eliscript-expander--protocol-method-object
       "extend-default" (cdr arguments))))))

(defun eliscript-expander--desugar-defmulti (arguments)
  "Return the core declaration represented by defmulti ARGUMENTS."
  (unless (<= 2 (length arguments) 3)
    (eliscript-expander--fail
     "defmulti expects a name, dispatch function, and optional default value"))
  (let* ((name-form (nth 0 arguments))
         (name (eliscript-form-value name-form)))
    (unless (eliscript-macro-eval-symbol-p name)
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
    (unless (eliscript-macro-eval-symbol-p target)
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
         ((memq operator
                '(defrecord defprotocol extend-type extend-category
                  extend-default))
          (eliscript-expander--fail
           "%s is only valid at module top level" operator))
         ((and (symbolp operator) (gethash operator environment))
          (eliscript-expander--expand-expression
           (eliscript-form-locate-generated
            (eliscript-expander--invoke
             (gethash operator environment) arguments depth)
            eliscript-expander--current-span)
           environment
           (1+ depth)))
         ((eq operator '->)
          (eliscript-expander--expand-expression
           (eliscript-expander--desugar-thread "->" arguments 'first)
           environment depth))
         ((eq operator '->>)
          (eliscript-expander--expand-expression
           (eliscript-expander--desugar-thread "->>" arguments 'last)
           environment depth))
         ((eq operator 'as->)
          (eliscript-expander--expand-expression
           (eliscript-expander--desugar-as-thread arguments)
           environment depth))
         ((eq operator 'cond->)
          (eliscript-expander--expand-expression
           (eliscript-expander--desugar-cond-thread
            "cond->" arguments 'first)
           environment depth))
         ((eq operator 'cond->>)
          (eliscript-expander--expand-expression
           (eliscript-expander--desugar-cond-thread
            "cond->>" arguments 'last)
           environment depth))
         ((eq operator 'some->)
          (eliscript-expander--expand-expression
           (eliscript-expander--desugar-some-thread
            "some->" arguments 'first)
           environment depth))
         ((eq operator 'some->>)
          (eliscript-expander--expand-expression
           (eliscript-expander--desugar-some-thread
            "some->>" arguments 'last)
           environment depth))
         ((eq operator 'if-let)
          (eliscript-expander--expand-expression
           (eliscript-expander--desugar-if-binding
            "if-let" arguments nil)
           environment depth))
         ((eq operator 'when-let)
          (eliscript-expander--expand-expression
           (eliscript-expander--desugar-when-binding
            "when-let" arguments nil)
           environment depth))
         ((eq operator 'if-some)
          (eliscript-expander--expand-expression
           (eliscript-expander--desugar-if-binding
            "if-some" arguments t)
           environment depth))
         ((eq operator 'when-some)
          (eliscript-expander--expand-expression
           (eliscript-expander--desugar-when-binding
            "when-some" arguments t)
           environment depth))
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
         ((eq operator 'defprotocol)
          (eliscript-expander--expand-top-level-sequence
           (eliscript-expander--desugar-defprotocol arguments)
           environment depth))
         ((eq operator 'defrecord)
          (eliscript-expander--expand-top-level-sequence
           (eliscript-expander--desugar-defrecord arguments)
           environment depth))
         ((eq operator 'extend-type)
          (eliscript-expander--expand-top-level
           (eliscript-expander--desugar-extend-type arguments)
           environment depth))
         ((eq operator 'extend-category)
          (eliscript-expander--expand-top-level
           (eliscript-expander--desugar-extend-category arguments)
           environment depth))
         ((eq operator 'extend-default)
          (eliscript-expander--expand-top-level
           (eliscript-expander--desugar-extend-default arguments)
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
