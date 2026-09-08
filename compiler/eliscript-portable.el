;;; eliscript-portable.el --- Portable function validation -*- lexical-binding: t; -*-

;;; Commentary:

;; Portable declarations form a closed, statically checked subset suitable for
;; execution in a JavaScript worker over explicit versioned transport values.

;;; Code:

(require 'cl-lib)
(require 'eliscript-diagnostic)
(require 'eliscript-form)
(require 'eliscript-parameters)

(cl-defstruct (eliscript-portable--declaration
               (:constructor eliscript-portable--declaration-create))
  name
  kind
  form
  initializer
  parameters
  body)

(defconst eliscript-portable--operators
  '(if when unless progn do while and or not
    + * - / % mod = /= not= < <= > >= 1+ 1-
    int32 uint32 imul32 bit-and bit-or bit-xor bit-not
    bit-shift-left bit-shift-right unsigned-bit-shift-right
    value-type host-identity-token string-code-unit-at string-from-code-unit
    string-to-number string-to-bigint number-float64-words
    eq equal null nil? undefined? nullish?
    list vector hash-map hash-set js-array car cdr cons js-cons nth js-nth aref
    length js-length
    object-keys object-has? object-assoc
    str funcall apply js-object get cond lambda fn let let* setq set!
    quote))

(defconst eliscript-portable--forbidden-operators
  '((js* . "raw JavaScript")
    (print . "console output")
    (put . "object mutation")
    (js-call . "host method calls")
    (new . "host constructors")
    (async . "asynchronous functions")
    (await . "asynchronous suspension")
    (throw . "exception control flow")
    (try . "exception control flow")))

(defvar eliscript-portable--filename nil)
(defvar eliscript-portable--entry nil)
(defvar eliscript-portable--current-span nil)

(defun eliscript-portable--fail (format-string &rest arguments)
  "Signal a portable analysis error using FORMAT-STRING and ARGUMENTS."
  (apply #'eliscript-diagnostic-signal
         'eliscript-analyze-error "ELI-P0001" "portable-analysis"
         eliscript-portable--filename eliscript-portable--current-span
         format-string arguments))

(defun eliscript-portable--value (form)
  "Return the reader value represented by FORM."
  (eliscript-form-value form))

(defun eliscript-portable--flatten (forms)
  "Return top-level FORMS with module wrappers removed."
  (apply
   #'append
   (mapcar
    (lambda (form)
      (let ((value (eliscript-portable--value form)))
        (if (and (consp value)
                 (eq (eliscript-portable--value (car value)) 'module))
            (eliscript-portable--flatten (cddr value))
          (list form))))
    forms)))

(defun eliscript-portable--declarations (forms)
  "Collect portable-relevant declarations from FORMS."
  (let ((table (make-hash-table :test #'eq)))
    (dolist (form (eliscript-portable--flatten forms))
      (let ((value (eliscript-portable--value form)))
        (when (consp value)
          (let ((operator (eliscript-portable--value (car value)))
                (arguments (cdr value)))
            (pcase operator
              ('defconst
               (puthash
                (eliscript-portable--value (car arguments))
                (eliscript-portable--declaration-create
                 :name (eliscript-portable--value (car arguments))
                 :kind 'constant :form form :initializer (cadr arguments))
                table))
              ('defvar
               (puthash
                (eliscript-portable--value (car arguments))
                (eliscript-portable--declaration-create
                 :name (eliscript-portable--value (car arguments))
                 :kind 'variable :form form :initializer (cadr arguments))
                table))
              ((or 'defun 'defn 'defportable 'defasync)
               (puthash
                (eliscript-portable--value (car arguments))
                (eliscript-portable--declaration-create
                 :name (eliscript-portable--value (car arguments))
                 :kind (if (eq operator 'defportable) 'portable 'function)
                 :form form
                 :parameters (cadr arguments)
                 :body (cddr arguments))
                table))
              ('import
               (dolist (name (eliscript-portable--import-names arguments))
                 (puthash
                  name
                  (eliscript-portable--declaration-create
                   :name name :kind 'import :form form)
                  table)))
              ('import-portable
               (dolist (name (eliscript-portable--import-names arguments))
                 (puthash
                  name
                  (eliscript-portable--declaration-create
                   :name name :kind 'portable-import :form form)
                  table))))))))
    table))

(defun eliscript-portable--import-names (arguments)
  "Return local import names from import ARGUMENTS."
  (let ((specifiers (cdr arguments))
        names)
    (while specifiers
      (let ((specifier (eliscript-portable--value (pop specifiers))))
        (if (memq specifier '(:default :as))
            (push (eliscript-portable--value (pop specifiers)) names)
          (push specifier names))))
    names))

(defun eliscript-portable--local-scope (&optional names)
  "Create a local-name table initialized with NAMES."
  (let ((scope (make-hash-table :test #'eq)))
    (dolist (name names)
      (puthash (eliscript-portable--value name) t scope))
    scope))

(defun eliscript-portable--copy-scope (scope)
  "Return a shallow copy of local SCOPE."
  (copy-hash-table scope))

(defun eliscript-portable--parameter-forms (parameters)
  "Return binding forms from function PARAMETERS."
  (apply
   #'append
   (mapcar
    (lambda (parameter)
      (eliscript-binding-names
       (eliscript-parameter-form parameter)
       (lambda (_form message) (eliscript-portable--fail "%s" message))))
    (eliscript-parameters-parse
     parameters
     (lambda (_form message) (eliscript-portable--fail "%s" message))))))

(defun eliscript-portable--binding-name (binding)
  "Return the target form from lexical BINDING."
  (if (eliscript-binding-pattern-p binding)
      binding
    (car (eliscript-portable--value binding))))

(defun eliscript-portable--add-pattern (pattern scope)
  "Add every name in binding PATTERN to portable SCOPE."
  (dolist
      (name
       (eliscript-binding-names
        pattern
        (lambda (_form message) (eliscript-portable--fail "%s" message))))
    (puthash (eliscript-portable--value name) t scope)))

(defun eliscript-portable--binding-value (binding)
  "Return the initializer from lexical BINDING, or nil."
  (let ((value (eliscript-portable--value binding)))
    (and (consp value) (cadr value))))

(defun eliscript-portable--pattern-defaults
    (pattern scope declarations dependencies)
  "Validate defaults nested in PATTERN using portable lexical SCOPE."
  (dolist
      (default
       (eliscript-binding-defaults
        pattern
        (lambda (_form message) (eliscript-portable--fail "%s" message))))
    (eliscript-portable--expression default scope declarations dependencies)))

(defun eliscript-portable--reference
    (form scope declarations dependencies)
  "Validate symbol FORM and record it in DEPENDENCIES when top-level."
  (let ((name (eliscript-portable--value form)))
    (unless (gethash name scope)
      (when (string-match-p "[./]" (symbol-name name))
        (eliscript-portable--fail
         "portable function %s uses qualified host reference: %s"
         eliscript-portable--entry name))
      (let ((declaration (gethash name declarations)))
        (when declaration
          (pcase (eliscript-portable--declaration-kind declaration)
            ((or 'portable 'constant 'portable-import)
             (puthash name t dependencies))
            (kind
             (eliscript-portable--fail
              "portable function %s depends on non-portable %s: %s"
              eliscript-portable--entry kind name))))))))

(defun eliscript-portable--expression
    (form scope declarations dependencies)
  "Validate portable expression FORM in lexical SCOPE."
  (when form
    (let* ((eliscript-portable--current-span
            (or (eliscript-form-span form) eliscript-portable--current-span))
           (value (eliscript-portable--value form)))
      (cond
       ((or (null value) (eq value t) (numberp value) (stringp value)
            (memq value '(false undefined))) nil)
       ((keywordp value) nil)
       ((symbolp value)
        (eliscript-portable--reference form scope declarations dependencies))
       ((vectorp value)
        (eliscript-portable--sequence
         (append value nil) scope declarations dependencies))
       ((consp value)
        (eliscript-portable--call form scope declarations dependencies))))))

(defun eliscript-portable--sequence
    (forms scope declarations dependencies)
  "Validate portable FORMS in lexical SCOPE."
  (dolist (form forms)
    (eliscript-portable--expression form scope declarations dependencies)))

(defun eliscript-portable--function
    (arguments scope declarations dependencies)
  "Validate a lambda-like ARGUMENT list."
  (let* ((parameters (eliscript-portable--parameter-forms (car arguments)))
         (child (eliscript-portable--copy-scope scope)))
    (dolist (parameter
             (eliscript-parameters-parse
              (car arguments)
              (lambda (_form message) (eliscript-portable--fail "%s" message))))
      (eliscript-portable--pattern-defaults
       (eliscript-parameter-form parameter) scope declarations dependencies))
    (dolist (parameter parameters)
      (puthash (eliscript-portable--value parameter) t child))
    (eliscript-portable--sequence
     (cdr arguments) child declarations dependencies)))

(defun eliscript-portable--let
    (arguments scope sequential declarations dependencies)
  "Validate let ARGUMENTS, honoring SEQUENTIAL binding visibility."
  (let* ((bindings (eliscript-portable--value (car arguments)))
         (child (eliscript-portable--copy-scope scope)))
    (if sequential
        (dolist (binding bindings)
          (eliscript-portable--expression
           (eliscript-portable--binding-value binding)
           child declarations dependencies)
          (eliscript-portable--pattern-defaults
           (eliscript-portable--binding-name binding)
           child declarations dependencies)
          (eliscript-portable--add-pattern
           (eliscript-portable--binding-name binding) child))
      (progn
        (dolist (binding bindings)
          (eliscript-portable--expression
           (eliscript-portable--binding-value binding)
           scope declarations dependencies))
        (dolist (binding bindings)
          (eliscript-portable--pattern-defaults
           (eliscript-portable--binding-name binding)
           scope declarations dependencies))
        (dolist (binding bindings)
          (eliscript-portable--add-pattern
           (eliscript-portable--binding-name binding) child))))
    (eliscript-portable--sequence
     (cdr arguments) child declarations dependencies)))

(defun eliscript-portable--assignment
    (arguments scope declarations dependencies)
  "Validate assignment ARGUMENTS as local-only mutation."
  (while arguments
    (let* ((name-form (pop arguments))
           (name (eliscript-portable--value name-form))
           (value (pop arguments)))
      (unless (gethash name scope)
        (let ((eliscript-portable--current-span
               (or (eliscript-form-span name-form)
                   eliscript-portable--current-span)))
          (eliscript-portable--fail
           "portable function %s may only assign local bindings: %s"
           eliscript-portable--entry name)))
      (eliscript-portable--expression
       value scope declarations dependencies))))

(defun eliscript-portable--object
    (arguments scope declarations dependencies)
  "Validate object ARGUMENTS without treating literal keys as references."
  (while arguments
    (let* ((key (pop arguments))
           (key-value (eliscript-portable--value key))
           (value (pop arguments)))
      (unless (or (keywordp key-value) (stringp key-value)
                  (symbolp key-value))
        (eliscript-portable--expression
         key scope declarations dependencies))
      (eliscript-portable--expression
       value scope declarations dependencies))))

(defun eliscript-portable--host-key-call
    (arguments scope declarations dependencies)
  "Validate host-key ARGUMENTS while keeping Keyword keys syntactic."
  (cl-loop
   for argument in arguments
   for index from 0
   unless (and (= index 1)
               (keywordp (eliscript-portable--value argument)))
   do (eliscript-portable--expression
       argument scope declarations dependencies)))

(defun eliscript-portable--call (form scope declarations dependencies)
  "Validate portable call FORM."
  (let* ((items (eliscript-portable--value form))
         (operator-form (car items))
         (operator (eliscript-portable--value operator-form))
         (arguments (cdr items))
         (forbidden (and (symbolp operator)
                         (assq operator
                               eliscript-portable--forbidden-operators))))
    (when forbidden
      (eliscript-portable--fail
       "portable function %s cannot use %s (%s)"
       eliscript-portable--entry operator (cdr forbidden)))
    (pcase operator
      ('quote nil)
      ((or 'lambda 'fn)
       (eliscript-portable--function
        arguments scope declarations dependencies))
      ('let
       (eliscript-portable--let
        arguments scope nil declarations dependencies))
      ('let*
       (eliscript-portable--let
        arguments scope t declarations dependencies))
      ((or 'setq 'set!)
       (eliscript-portable--assignment
        arguments scope declarations dependencies))
      ('js-object
       (eliscript-portable--object
        arguments scope declarations dependencies))
      ((or 'get 'aref 'object-has? 'object-assoc)
       (eliscript-portable--host-key-call
        arguments scope declarations dependencies))
      ((pred (lambda (name) (memq name eliscript-portable--operators)))
       (eliscript-portable--sequence
        arguments scope declarations dependencies))
      (_
       (eliscript-portable--expression
        operator-form scope declarations dependencies)
       (eliscript-portable--sequence
        arguments scope declarations dependencies)))))

(defun eliscript-portable--dependencies (declaration declarations)
  "Return validated direct dependencies for DECLARATION."
  (let* ((eliscript-portable--entry
          (eliscript-portable--declaration-name declaration))
         (eliscript-portable--current-span
          (eliscript-form-span (eliscript-portable--declaration-form declaration)))
         (dependencies (make-hash-table :test #'eq))
         (scope
          (eliscript-portable--local-scope
           (eliscript-portable--parameter-forms
            (eliscript-portable--declaration-parameters declaration)))))
    (pcase (eliscript-portable--declaration-kind declaration)
      ('portable
       (eliscript-portable--sequence
        (eliscript-portable--declaration-body declaration)
        scope declarations dependencies))
      ('constant
       (eliscript-portable--expression
        (eliscript-portable--declaration-initializer declaration)
        scope declarations dependencies)))
    (let (names)
      (maphash (lambda (name _present) (push name names)) dependencies)
      (nreverse names))))

(defun eliscript-portable--closure
    (forms entries filename &optional allow-portable-imports)
  "Validate ENTRIES in FORMS and return their transitive declaration names.

ALLOW-PORTABLE-IMPORTS defers cross-module proof to the project builder."
  (let* ((eliscript-portable--filename filename)
         (declarations (eliscript-portable--declarations forms))
         (visited (make-hash-table :test #'eq))
         closure)
    (cl-labels
        ((visit
          (name root)
          (unless (gethash name visited)
            (puthash name t visited)
            (let ((declaration (gethash name declarations)))
              (unless declaration
                (setq eliscript-portable--entry root)
                (eliscript-portable--fail
                 "unknown portable entry: %s" name))
              (unless (memq (eliscript-portable--declaration-kind declaration)
                            '(portable constant portable-import))
                (setq eliscript-portable--entry root
                      eliscript-portable--current-span
                      (eliscript-form-span
                       (eliscript-portable--declaration-form declaration)))
                (eliscript-portable--fail
                 "portable entry %s is not declared with defportable" name))
              (when (and (eq (eliscript-portable--declaration-kind declaration)
                             'portable-import)
                         (not allow-portable-imports))
                (setq eliscript-portable--entry root
                      eliscript-portable--current-span
                      (eliscript-form-span
                       (eliscript-portable--declaration-form declaration)))
                (eliscript-portable--fail
                 "portable import %s requires a project build" name))
              (push name closure)
              (dolist (dependency
                       (eliscript-portable--dependencies
                        declaration declarations))
                (visit dependency root))))))
      (dolist (entry entries)
        (let ((declaration (gethash entry declarations)))
          (unless (and declaration
                       (eq (eliscript-portable--declaration-kind declaration)
                           'portable))
            (setq eliscript-portable--entry entry)
            (eliscript-portable--fail
             "portable entry %s is not declared with defportable" entry)))
        (visit entry entry)))
    (nreverse closure)))

(defun eliscript-portable-validate-module (forms &optional filename)
  "Validate every portable declaration in FORMS from FILENAME."
  (let (entries)
    (dolist (form (eliscript-portable--flatten forms))
      (let ((value (eliscript-portable--value form)))
        (when (and (consp value)
                   (eq (eliscript-portable--value (car value)) 'defportable))
          (push (eliscript-portable--value (cadr value)) entries))))
    (eliscript-portable--closure forms (nreverse entries) filename t)
    forms))

(defun eliscript-portable-select-module
    (forms entries &optional filename allow-portable-imports)
  "Return the declaration closure for portable ENTRIES in FORMS.

ALLOW-PORTABLE-IMPORTS is reserved for graph-aware project builds."
  (let* ((entry-symbols
          (mapcar (lambda (entry)
                    (if (symbolp entry) entry (intern entry)))
                  entries))
         (closure
          (eliscript-portable--closure
           forms entry-symbols filename allow-portable-imports))
         (selected (make-hash-table :test #'eq)))
    (dolist (name closure) (puthash name t selected))
    (delq
     nil
     (mapcar
      (lambda (form)
        (let ((value (eliscript-portable--value form)))
          (when (consp value)
            (let ((operator (eliscript-portable--value (car value))))
              (if (eq operator 'import-portable)
                  (let ((names
                         (cl-remove-if-not
                          (lambda (name-form)
                            (gethash
                             (eliscript-portable--value name-form) selected))
                          (cddr value))))
                    (when names
                      (eliscript-form-inherit
                       (append (list (car value) (cadr value)) names)
                       form)))
                (and (memq operator '(defconst defportable))
                     (gethash
                      (eliscript-portable--value (cadr value)) selected)
                     form))))))
      (eliscript-portable--flatten forms)))))

(provide 'eliscript-portable)

;;; eliscript-portable.el ends here
