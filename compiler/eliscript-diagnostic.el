;;; eliscript-diagnostic.el --- Compiler diagnostics -*- lexical-binding: t; -*-

;;; Commentary:

;; Shared condition types and formatting for compiler phases.

;;; Code:

(require 'eliscript-form)

(define-error 'eliscript-compile-error "Eliscript compile error")
(define-error 'eliscript-expand-error
  "Eliscript macro expansion error"
  'eliscript-compile-error)
(define-error 'eliscript-analyze-error
  "Eliscript analysis error"
  'eliscript-compile-error)

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

(provide 'eliscript-diagnostic)

;;; eliscript-diagnostic.el ends here
