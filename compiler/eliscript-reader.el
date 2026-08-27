;;; eliscript-reader.el --- Reader for Eliscript -*- lexical-binding: t; -*-

;;; Commentary:

;; Eliscript intentionally starts with the Emacs Lisp reader.  The compiler
;; owns the language semantics after reading, so accepting an Emacs Lisp form
;; does not imply that the form has Emacs Lisp runtime behavior.

;;; Code:

(define-error 'eliscript-read-error "Eliscript reader error")

(defun eliscript-reader--trivia-p (text)
  "Return non-nil when TEXT contains only whitespace or line comments."
  (string-match-p
   "\\`\\(?:[[:space:]]\\|;[^\n]*\\(?:\n\\|\\'\\)\\)*\\'"
   text))

(defun eliscript-read-string (source &optional filename)
  "Read every Eliscript form from SOURCE.

FILENAME is used only to improve diagnostics."
  (let ((position 0)
        (length (length source))
        forms)
    (while (< position length)
      (condition-case error-data
          (let ((result (read-from-string source position)))
            (push (car result) forms)
            (setq position (cdr result)))
        (end-of-file
         (if (eliscript-reader--trivia-p (substring source position))
             (setq position length)
           (signal 'eliscript-read-error
                   (list (format "%s: unexpected end of input"
                                 (or filename "<string>"))))))
        (invalid-read-syntax
         (signal 'eliscript-read-error
                 (list (format "%s: %s"
                               (or filename "<string>")
                               (error-message-string error-data)))))))
    (nreverse forms)))

(defun eliscript-read-file (filename)
  "Read all Eliscript forms from FILENAME."
  (with-temp-buffer
    (insert-file-contents filename)
    (eliscript-read-string (buffer-string) filename)))

(provide 'eliscript-reader)

;;; eliscript-reader.el ends here

