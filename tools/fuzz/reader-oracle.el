;;; reader-oracle.el --- Streaming seed reader oracle for fuzzing -*- lexical-binding: t; -*-

;;; Commentary:

;; Read one JSON case per line from ELISCRIPT_FUZZ_CORPUS and write one
;; normalized seed-reader result per line.  The corpus is bounded by the
;; caller; results are emitted immediately instead of accumulated.

;;; Code:

(let* ((script-directory
        (file-name-directory (or load-file-name buffer-file-name)))
       (project-directory
        (expand-file-name "../.." script-directory)))
  (add-to-list 'load-path (expand-file-name "compiler" project-directory))
  (add-to-list 'load-path (expand-file-name "tests" project-directory)))

(set-language-environment "UTF-8")
(prefer-coding-system 'utf-8-unix)
(setq coding-system-for-read 'utf-8-unix)
(setq coding-system-for-write 'utf-8-unix)
(set-terminal-coding-system 'utf-8-unix)

(require 'json)
(require 'bootstrap-tests)

(defun eliscript-reader-fuzz-oracle--ascii-json (value)
  "Serialize VALUE as portable ASCII-only JSON."
  (let ((json (decode-coding-string
               (json-serialize value :null-object nil :false-object :false)
               'utf-8-unix)))
    (with-temp-buffer
      (dolist (character (string-to-list json))
        (cond
         ((<= character #x7f) (insert character))
         ((<= character #xffff) (insert (format "\\u%04X" character)))
         (t
          (let* ((codepoint (- character #x10000))
                 (high (+ #xd800 (ash codepoint -10)))
                 (low (+ #xdc00 (logand codepoint #x3ff))))
            (insert (format "\\u%04X\\u%04X" high low))))))
      (buffer-string))))

(defun eliscript-reader-fuzz-oracle--result (case)
  "Return the normalized seed reader result for fuzz CASE."
  (let ((source (alist-get 'source case))
        (filename (alist-get 'filename case)))
    (unless (and (stringp source) (stringp filename))
      (error "fuzz case requires string source and filename"))
    (condition-case error-data
        `((status . "ok")
          (forms . ,(vconcat
                     (mapcar
                      (lambda (form)
                        (eliscript-bootstrap-tests--normalize-form form source))
                      (eliscript-read-located-string source filename)))))
      (eliscript-read-error
       `((status . "error") (message . ,(cadr error-data)))))))

(let ((corpus (getenv "ELISCRIPT_FUZZ_CORPUS")))
  (unless corpus
    (error "ELISCRIPT_FUZZ_CORPUS is required"))
  (with-temp-buffer
    (insert-file-contents corpus)
    (goto-char (point-min))
    (while (not (eobp))
      (let ((line (buffer-substring-no-properties
                   (line-beginning-position) (line-end-position))))
        (forward-line 1)
        (unless (string-empty-p line)
          (let* ((case (json-parse-string
                        line
                        :object-type 'alist
                        :array-type 'list
                        :null-object nil
                        :false-object :false))
                 (result (eliscript-reader-fuzz-oracle--result case)))
            (princ (eliscript-reader-fuzz-oracle--ascii-json result))
            (princ "\n")
            (clrhash eliscript-bootstrap-tests--position-index-cache)))))))

;;; reader-oracle.el ends here
