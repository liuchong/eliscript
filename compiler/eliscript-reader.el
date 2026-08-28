;;; eliscript-reader.el --- Reader for Eliscript -*- lexical-binding: t; -*-

;;; Commentary:

;; Eliscript intentionally starts with the Emacs Lisp reader.  The compiler
;; owns the language semantics after reading, so accepting an Emacs Lisp form
;; does not imply that the form has Emacs Lisp runtime behavior.

;;; Code:

(require 'cl-lib)
(require 'lisp-mode)
(require 'eliscript-diagnostic)
(require 'eliscript-form)

(define-error 'eliscript-read-error
  "Eliscript reader error"
  'eliscript-compile-error)

(cl-defstruct (eliscript-reader--node
               (:constructor eliscript-reader--node-create))
  span
  children)

(defun eliscript-reader--span (start end filename)
  "Return a source span from buffer positions START to END in FILENAME."
  (let (line column end-line end-column)
    (save-excursion
      (goto-char start)
      (setq line (line-number-at-pos)
            column (1+ (current-column)))
      (goto-char end)
      (setq end-line (line-number-at-pos)
            end-column (1+ (current-column))))
    (eliscript-source-span-create
     :filename filename
     :start (1- start)
     :end (1- end)
     :line line
     :column column
     :end-line end-line
     :end-column end-column)))

(defun eliscript-reader--prefix-length ()
  "Return the reader-prefix length at point, or nil when none is present."
  (cond
   ((looking-at "#'") 2)
   ((memq (char-after) '(?' ?`)) 1)
   ((eq (char-after) ?,)
    (if (eq (char-after (1+ (point))) ?@) 2 1))))

(defun eliscript-reader--scan-node (filename)
  "Scan one source node at point for FILENAME and return its location tree."
  (forward-comment (point-max))
  (let* ((start (point))
         (prefix-length (eliscript-reader--prefix-length))
         children)
    (cond
     (prefix-length
      (forward-char prefix-length)
      (let* ((prefix-end (point))
             (child (eliscript-reader--scan-node filename))
             (end (point)))
        (setq children
              (list
               (eliscript-reader--node-create
                :span (eliscript-reader--span start prefix-end filename))
               child))
        (eliscript-reader--node-create
         :span (eliscript-reader--span start end filename)
         :children children)))
     ((memq (char-after) '(?\( ?\[))
      (let ((closing (if (eq (char-after) ?\() ?\) ?\])))
        (forward-char 1)
        (forward-comment (point-max))
        (while (and (char-after) (not (eq (char-after) closing)))
          (push (eliscript-reader--scan-node filename) children)
          (forward-comment (point-max)))
        (when (eq (char-after) closing)
          (forward-char 1))
        (eliscript-reader--node-create
         :span (eliscript-reader--span start (point) filename)
         :children (nreverse children))))
     (t
      (let ((end (scan-sexps start 1)))
        (unless end
          (setq end (point-max)))
        (goto-char end)
        (eliscript-reader--node-create
         :span (eliscript-reader--span start end filename)))))))

(defun eliscript-reader--locate-value (value node)
  "Attach locations from NODE to recursively read VALUE."
  (let ((span (eliscript-reader--node-span node))
        (children (eliscript-reader--node-children node)))
    (cond
     ((and (vectorp value) (= (length value) (length children)))
      (eliscript-form-wrap
       (apply #'vector
              (cl-mapcar #'eliscript-reader--locate-value
                         (append value nil) children))
       span))
     ((and (proper-list-p value) (= (length value) (length children)))
      (eliscript-form-wrap
       (cl-mapcar #'eliscript-reader--locate-value value children)
       span))
     (t (eliscript-form-locate-generated value span)))))

(defun eliscript-reader--diagnostic-span (filename)
  "Return a one-character diagnostic span at point in FILENAME."
  (let ((start (point)))
    (eliscript-reader--span
     start (min (point-max) (1+ start)) filename)))

(defun eliscript-reader--invalid-syntax-message (source start error-data)
  "Return a stable invalid-reader message for SOURCE at START.

Emacs releases disagree on whether an unknown dispatch reports `#' or its
two-character dispatch prefix.  Eliscript owns that diagnostic contract."
  (if (and (< start (length source))
           (= (aref source start) ?#))
      (format "Invalid read syntax: %S"
              (substring source start (min (length source) (+ start 2))))
    (error-message-string error-data)))

(defun eliscript-read-located-string (source &optional filename)
  "Read every Eliscript form from SOURCE with recursive source locations."
  (with-temp-buffer
    (insert source)
    (set-syntax-table emacs-lisp-mode-syntax-table)
    (goto-char (point-min))
    (let (forms done)
      (while (not done)
        (forward-comment (point-max))
        (if (eobp)
            (setq done t)
          (let ((start (point)))
            (condition-case error-data
                (let* ((result (read-from-string source (1- start)))
                       (value (car result))
                       (end (cdr result))
                       (node (eliscript-reader--scan-node filename)))
                  (push (eliscript-reader--locate-value value node) forms)
                  (goto-char (1+ end)))
              (end-of-file
               (eliscript-diagnostic-signal
                'eliscript-read-error "ELI-R0001" "reader"
                filename (eliscript-reader--diagnostic-span filename)
                "unexpected end of input"))
              (invalid-read-syntax
               (eliscript-diagnostic-signal
                'eliscript-read-error "ELI-R0001" "reader"
                filename (eliscript-reader--diagnostic-span filename)
                "%s" (eliscript-reader--invalid-syntax-message
                       source (1- start) error-data)))))))
      (nreverse forms))))

(defun eliscript-read-string (source &optional filename)
  "Read every Eliscript form from SOURCE.

FILENAME is used only to improve diagnostics."
  (mapcar #'eliscript-form-strip
          (eliscript-read-located-string source filename)))

(defun eliscript-read-file (filename)
  "Read all Eliscript forms from FILENAME."
  (with-temp-buffer
    (insert-file-contents filename)
    (eliscript-read-string (buffer-string) filename)))

(defun eliscript-read-located-file (filename)
  "Read located Eliscript forms from FILENAME."
  (with-temp-buffer
    (insert-file-contents filename)
    (eliscript-read-located-string (buffer-string) filename)))

(provide 'eliscript-reader)

;;; eliscript-reader.el ends here
