;;; eliscript-diagnostic.el --- Compiler diagnostics -*- lexical-binding: t; -*-

;;; Commentary:

;; Shared condition types and formatting for compiler phases.

;;; Code:

(define-error 'eliscript-compile-error "Eliscript compile error")
(define-error 'eliscript-analyze-error
  "Eliscript analysis error"
  'eliscript-compile-error)

(defun eliscript-diagnostic-format (filename format-string &rest arguments)
  "Format a diagnostic for FILENAME using FORMAT-STRING and ARGUMENTS."
  (format "%s: %s"
          (or filename "<string>")
          (apply #'format format-string arguments)))

(provide 'eliscript-diagnostic)

;;; eliscript-diagnostic.el ends here
