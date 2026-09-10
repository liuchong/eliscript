;;; eliscript-evaluation.el --- Seed evaluation contracts -*- lexical-binding: t; -*-

;;; Commentary:

;; Reference implementation of compiler-owned evaluation request and source
;; descriptors.  The generated compiler provides the production implementation.

;;; Code:

(require 'cl-lib)
(require 'eliscript-diagnostic)
(require 'eliscript-form)
(require 'eliscript-ir)
(require 'eliscript-reader)

(declare-function eliscript-compile-ir-string "eliscript")

(define-error 'eliscript-evaluation-error "Eliscript evaluation error")

(defconst eliscript-evaluation-operation-format
  "eliscript-evaluation-operation")
(defconst eliscript-evaluation-operation-version 1)
(defconst eliscript-evaluation-input-format "eliscript-evaluation-input")
(defconst eliscript-evaluation-input-version 1)
(defconst eliscript-evaluation-form-format "eliscript-evaluation-form")
(defconst eliscript-evaluation-form-version 1)
(defconst eliscript-evaluation-module-format "eliscript-evaluation-module")
(defconst eliscript-evaluation-module-version 1)

(defconst eliscript-evaluation--operation-keys
  '(id operation source filename root line column))
(defconst eliscript-evaluation--definition-heads
  '(defasync defconst defmacro defmulti defn defportable defprotocol defun defvar))
(defconst eliscript-evaluation--module-heads
  '(export export-default import import-portable module))

(defun eliscript-evaluation--fail (message &optional filename)
  "Signal a structured evaluation request error with MESSAGE and FILENAME."
  (eliscript-diagnostic-signal
   'eliscript-evaluation-error "ELI-E0001" "evaluation-request"
   filename nil "%s" message))

(defun eliscript-evaluation--object-p (value)
  "Return non-nil when VALUE is an alist-shaped request object."
  (and (proper-list-p value)
       (cl-every (lambda (entry)
                   (and (consp entry) (symbolp (car entry))))
                 value)))

(defun eliscript-evaluation--field (object key fallback)
  "Read KEY from OBJECT, returning FALLBACK when it is absent."
  (let ((entry (assq key object)))
    (if entry (cdr entry) fallback)))

(defun eliscript-evaluation--require-filename (filename)
  "Return valid evaluation FILENAME or signal a diagnostic."
  (unless (and (stringp filename) (> (length filename) 0))
    (eliscript-evaluation--fail
     "evaluation filename must be a non-empty string"))
  filename)

(defun eliscript-evaluation--require-source (source filename)
  "Return valid evaluation SOURCE or signal a diagnostic at FILENAME."
  (unless (and (stringp source) (> (length source) 0))
    (eliscript-evaluation--fail
     "evaluation source must be a non-empty string" filename))
  source)

(defun eliscript-evaluation--input-result (status filename)
  "Return an immutable-style input descriptor for STATUS and FILENAME."
  `((format . ,eliscript-evaluation-input-format)
    (version . ,eliscript-evaluation-input-version)
    (status . ,status)
    (filename . ,filename)))

(defun eliscript-evaluation-input-description (source filename)
  "Classify interactive SOURCE from FILENAME without evaluating it."
  (eliscript-evaluation--require-filename filename)
  (unless (stringp source)
    (eliscript-evaluation--fail
     "evaluation input source must be a string" filename))
  (condition-case error-data
      (let ((forms (eliscript-read-located-string source filename)))
        (cond
         ((null forms)
          (eliscript-evaluation--input-result "empty" filename))
         ((null (cdr forms))
          (eliscript-evaluation--input-result "complete" filename))
         (t
          (eliscript-evaluation--fail
           "interactive input must contain exactly one top-level form"
           filename))))
    (eliscript-read-error
     (let ((diagnostic (eliscript-diagnostic-from-error error-data)))
       (if (and (string-equal (eliscript-diagnostic-code diagnostic)
                              "ELI-R0001")
                (string-equal (eliscript-diagnostic-message diagnostic)
                              "unexpected end of input"))
           (eliscript-evaluation--input-result "incomplete" filename)
         (signal (car error-data) (cdr error-data)))))))

(defun eliscript-evaluation-operation-request (input)
  "Normalize version 1 evaluation operation INPUT."
  (unless (eliscript-evaluation--object-p input)
    (eliscript-evaluation--fail
     "evaluation operation request must be an object"))
  (dolist (entry input)
    (unless (memq (car entry) eliscript-evaluation--operation-keys)
      (eliscript-evaluation--fail
       (format "unknown evaluation operation key: %s" (car entry)))))
  (let* ((id (eliscript-evaluation--field input 'id nil))
         (operation (alist-get 'operation input)))
    (unless (or (null id)
                (and (stringp id) (> (length id) 0))
                (and (integerp id) (<= 0 id 9007199254740991)))
      (eliscript-evaluation--fail
       (concat "evaluation operation id must be null, a non-empty string, "
               "or a non-negative safe integer")))
    (unless (member operation '("describe" "evaluate" "load" "reset"))
      (eliscript-evaluation--fail
       "evaluation operation must be describe, evaluate, load, or reset"))
    (if (member operation '("evaluate" "load"))
        (let* ((filename
                (eliscript-evaluation--require-filename
                 (alist-get 'filename input)))
               (source
                (eliscript-evaluation--require-source
                 (alist-get 'source input) filename))
               (root (eliscript-evaluation--field input 'root nil))
               (line (eliscript-evaluation--field input 'line 1))
               (column (eliscript-evaluation--field input 'column 1)))
          (unless (or (null root)
                      (and (stringp root) (> (length root) 0)))
            (eliscript-evaluation--fail
             "evaluation root must be null or a non-empty string" filename))
          (unless (and (integerp line) (<= 1 line 9007199254740991))
            (eliscript-evaluation--fail
             "evaluation line must be a positive safe integer" filename))
          (unless (and (integerp column) (<= 1 column 9007199254740991))
            (eliscript-evaluation--fail
             "evaluation column must be a positive safe integer" filename))
          `((format . ,eliscript-evaluation-operation-format)
            (version . ,eliscript-evaluation-operation-version)
            (id . ,id)
            (operation . ,operation)
            (source . ,source)
            (filename . ,filename)
            (root . ,root)
            (line . ,line)
            (column . ,column)))
      (when (cl-some (lambda (key) (assq key input))
                     '(source filename root line column))
        (eliscript-evaluation--fail
         (format "%s evaluation operation does not accept source fields"
                 operation)))
      `((format . ,eliscript-evaluation-operation-format)
        (version . ,eliscript-evaluation-operation-version)
        (id . ,id)
        (operation . ,operation)))))

(defun eliscript-evaluation--form-head (form)
  "Return the symbol head of located list FORM, or nil."
  (let ((value (eliscript-form-value form)))
    (when (consp value)
      (let ((head (eliscript-form-value (car value))))
        (and (symbolp head) head)))))

(defun eliscript-evaluation-form-description (source filename)
  "Classify exactly one form in SOURCE from FILENAME."
  (eliscript-evaluation--require-filename filename)
  (eliscript-evaluation--require-source source filename)
  (let ((forms (eliscript-read-located-string source filename)))
    (unless (= (length forms) 1)
      (eliscript-evaluation--fail
       "evaluate requires exactly one top-level form" filename))
    (let* ((form (car forms))
           (value (eliscript-form-value form))
           (head (eliscript-evaluation--form-head form))
           (definition (memq head eliscript-evaluation--definition-heads))
           (module-form (memq head eliscript-evaluation--module-heads))
           (name
            (when definition
              (let ((candidate
                     (and (> (length value) 1)
                          (eliscript-form-value (nth 1 value)))))
                (and (symbolp candidate) (symbol-name candidate))))))
      (when (and definition (null name))
        (eliscript-evaluation--fail
         (format "%s evaluation form requires a symbol name" head)
         filename))
      `((format . ,eliscript-evaluation-form-format)
        (version . ,eliscript-evaluation-form-version)
        (kind . ,(cond (definition "definition")
                       (module-form "module")
                       (t "expression")))
        (head . ,(and head (symbol-name head)))
        (name . ,name)
        (runtimeBinding . ,(if (and definition (not (eq head 'defmacro)))
                               t
                             :false))
        (filename . ,filename)))))

(defun eliscript-evaluation--collect-macro-sources (forms source)
  "Return macro source slices from located FORMS in SOURCE order."
  (let (result)
    (cl-labels
        ((walk
          (form)
          (let* ((value (eliscript-form-value form))
                 (head (eliscript-evaluation--form-head form)))
            (cond
             ((eq head 'defmacro)
              (let ((span (eliscript-form-span form)))
                (push (substring source
                                 (eliscript-source-span-start span)
                                 (eliscript-source-span-end span))
                      result)))
             ((eq head 'module)
              (mapc #'walk (nthcdr 2 value)))))))
      (mapc #'walk forms))
    (nreverse result)))

(defun eliscript-evaluation-module-description (source filename)
  "Describe runtime bindings, exports, and macros in SOURCE from FILENAME."
  (eliscript-evaluation--require-filename filename)
  (eliscript-evaluation--require-source source filename)
  (let ((program (eliscript-compile-ir-string source filename))
        (bindings (make-hash-table :test #'equal))
        (exports (make-hash-table :test #'equal)))
    (eliscript-ir-walk
     program
     (lambda (node)
       (pcase (eliscript-ir-node-kind node)
         ((or 'function-declaration 'variable-declaration)
          (puthash (symbol-name (eliscript-ir-node-value node)) t bindings))
         ('import-declaration
          (dolist (child (eliscript-ir-node-children node))
            (when (eq (eliscript-ir-node-kind child) 'import-named)
              (puthash (symbol-name (eliscript-ir-node-value child))
                       t bindings))))
         ('export-declaration
          (dolist (child (eliscript-ir-node-children node))
            (puthash (symbol-name (eliscript-ir-node-value child))
                     t exports))))))
    (let ((binding-names (sort (hash-table-keys bindings) #'string<))
          (export-names (sort (hash-table-keys exports) #'string<))
          (macro-sources
           (eliscript-evaluation--collect-macro-sources
            (eliscript-read-located-string source filename) source)))
      `((format . ,eliscript-evaluation-module-format)
        (version . ,eliscript-evaluation-module-version)
        (filename . ,filename)
        (bindings . ,(vconcat binding-names))
        (exports . ,(vconcat export-names))
        (macroSources . ,(vconcat macro-sources))))))

(provide 'eliscript-evaluation)

;;; eliscript-evaluation.el ends here
