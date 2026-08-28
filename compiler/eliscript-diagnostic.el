;;; eliscript-diagnostic.el --- Compiler diagnostics -*- lexical-binding: t; -*-

;;; Commentary:

;; Shared condition types and formatting for compiler phases.

;;; Code:

(require 'cl-lib)
(require 'json)
(require 'eliscript-form)

(define-error 'eliscript-compile-error "Eliscript compile error")
(define-error 'eliscript-expand-error
  "Eliscript macro expansion error"
  'eliscript-compile-error)
(define-error 'eliscript-analyze-error
  "Eliscript analysis error"
  'eliscript-compile-error)

(defconst eliscript-diagnostic-format-name "eliscript-diagnostic"
  "Public format identifier for structured compiler diagnostics.")

(defconst eliscript-diagnostic-version 1
  "Current public structured diagnostic schema version.")

(cl-defstruct (eliscript-diagnostic
               (:constructor eliscript-diagnostic-create))
  code
  severity
  phase
  message
  file
  span)

(defvar eliscript-diagnostic--conditions
  (make-hash-table :test #'eq :weakness 'key)
  "Weak association from condition message strings to diagnostics.")

(defun eliscript-diagnostic-format (filename format-string &rest arguments)
  "Format a diagnostic for FILENAME using FORMAT-STRING and ARGUMENTS."
  (format "%s: %s"
          (or filename "<string>")
          (apply #'format format-string arguments)))

(defun eliscript-diagnostic-format-at
    (filename span format-string &rest arguments)
  "Format a diagnostic at SPAN in FILENAME using FORMAT-STRING and ARGUMENTS."
  (let ((source-name (or filename
                         (and span (eliscript-source-span-filename span))
                         "<string>"))
        (message (apply #'format format-string arguments)))
    (if span
        (format "%s:%d:%d: %s"
                source-name
                (eliscript-source-span-line span)
                (eliscript-source-span-column span)
                message)
      (format "%s: %s" source-name message))))

(defun eliscript-diagnostic-render (diagnostic)
  "Render DIAGNOSTIC as the stable human-readable compiler message."
  (if (or (eliscript-diagnostic-file diagnostic)
          (eliscript-diagnostic-span diagnostic))
      (eliscript-diagnostic-format-at
       (eliscript-diagnostic-file diagnostic)
       (eliscript-diagnostic-span diagnostic)
       "%s"
       (eliscript-diagnostic-message diagnostic))
    (eliscript-diagnostic-message diagnostic)))

(defun eliscript-diagnostic--position (offset line column)
  "Return a JSON-compatible source position from OFFSET, LINE, and COLUMN."
  `((offset . ,offset) (line . ,line) (column . ,column)))

(defun eliscript-diagnostic--location (diagnostic)
  "Return DIAGNOSTIC's JSON-compatible location, or nil."
  (let* ((span (eliscript-diagnostic-span diagnostic))
         (file (or (eliscript-diagnostic-file diagnostic)
                   (and span (eliscript-source-span-filename span)))))
    (when (or file span)
      (append
       (when file `((file . ,file)))
       (when span
         `((start . ,(eliscript-diagnostic--position
                      (eliscript-source-span-start span)
                      (eliscript-source-span-line span)
                      (eliscript-source-span-column span)))
           (end . ,(eliscript-diagnostic--position
                    (eliscript-source-span-end span)
                    (eliscript-source-span-end-line span)
                    (eliscript-source-span-end-column span)))))))))

(defun eliscript-diagnostic-to-alist (diagnostic)
  "Return public JSON-compatible data for DIAGNOSTIC."
  (append
   `((format . ,eliscript-diagnostic-format-name)
     (version . ,eliscript-diagnostic-version)
     (code . ,(eliscript-diagnostic-code diagnostic))
     (severity . ,(eliscript-diagnostic-severity diagnostic))
     (phase . ,(eliscript-diagnostic-phase diagnostic))
     (message . ,(eliscript-diagnostic-message diagnostic)))
   (let ((location (eliscript-diagnostic--location diagnostic)))
     (when location `((location . ,location))))))

(defun eliscript-diagnostic-to-json (diagnostic)
  "Serialize DIAGNOSTIC using the public diagnostic schema."
  (json-serialize (eliscript-diagnostic-to-alist diagnostic)))

(defun eliscript-diagnostic-from-condition (condition-data)
  "Return the structured diagnostic attached to CONDITION-DATA, or nil."
  (let ((message (cadr condition-data)))
    (or (and (stringp message)
             (gethash message eliscript-diagnostic--conditions))
        (cl-find-if #'eliscript-diagnostic-p (cdr condition-data)))))

(defun eliscript-diagnostic-condition-message (condition-data)
  "Return CONDITION-DATA's human message without serializing attached data."
  (let ((diagnostic (eliscript-diagnostic-from-condition condition-data)))
    (if diagnostic
        (eliscript-diagnostic-render diagnostic)
      (error-message-string condition-data))))

(defun eliscript-diagnostic-from-error
    (condition-data &optional code phase)
  "Return a diagnostic for CONDITION-DATA, adding a generic fallback.

CODE and PHASE identify an error that did not originate in a compiler phase."
  (or (eliscript-diagnostic-from-condition condition-data)
      (eliscript-diagnostic-create
       :code (or code "ELI-C0001")
       :severity "error"
       :phase (or phase "cli")
       :message (error-message-string condition-data))))

(defun eliscript-diagnostic-signal
    (condition code phase filename span format-string &rest arguments)
  "Signal CONDITION with a structured compiler diagnostic.

CODE and PHASE identify the failure.  FILENAME and SPAN locate it.
FORMAT-STRING and ARGUMENTS produce its unformatted message."
  (let* ((message (apply #'format format-string arguments))
         (diagnostic
          (eliscript-diagnostic-create
           :code code
           :severity "error"
           :phase phase
           :message message
           :file (or filename
                     (and span (eliscript-source-span-filename span)))
           :span span)))
    (let ((rendered (eliscript-diagnostic-render diagnostic)))
      (puthash rendered diagnostic eliscript-diagnostic--conditions)
      (signal condition (list rendered)))))

(provide 'eliscript-diagnostic)

;;; eliscript-diagnostic.el ends here
