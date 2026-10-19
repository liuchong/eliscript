;;; unicode-case-runtime.el --- Derive JS-profile tables from owned runtime data -*- lexical-binding: t; -*-

(require 'cl-lib)

(defun eliscript-unicode-case-runtime-rename (form)
  "Translate only the pure numeric table vocabulary in FORM."
  (cond ((consp form) (mapcar #'eliscript-unicode-case-runtime-rename form))
        ((eq form 'word-and) 'bit-and)
        ((and (symbolp form) (string-prefix-p "heap-unicode-" (symbol-name form)))
         (intern (concat "unicode-case-data-" (substring (symbol-name form) 13))))
        (t form)))

(defun eliscript-generate-unicode-case-runtime-data (root)
  "Generate ignored Eli data from ROOT's sole maintained Unicode case region."
  (let* ((source (expand-file-name "bootstrap/runtime/memory.eli" root))
         (destination (expand-file-name "runtime/unicode-case-data.eli" root))
         (begin "  ;; BEGIN GENERATED UNICODE CASE DATA")
         (end "  ;; END GENERATED UNICODE CASE DATA")
         region declarations names)
    (with-temp-buffer
      (let ((coding-system-for-read 'utf-8-unix)) (insert-file-contents source))
      (goto-char (point-min))
      (unless (search-forward begin nil t) (error "Unicode case source region is missing"))
      (let ((start (- (point) (length begin))))
        (unless (search-forward end nil t) (error "Unicode case source region is incomplete"))
        (setq region (buffer-substring-no-properties start (point)))))
    (with-temp-buffer
      (insert region) (goto-char (point-min))
      (condition-case nil
          (while t
            (let ((form (read (current-buffer))))
              (unless (and (consp form) (eq (car form) 'defun))
                (error "Unicode case region contains a nonfunction form"))
              (when (string-match-p
                     "\\`heap-unicode-\\(?:\\(?:upper\\|lower\\)-[012]\\|cased\\|case-ignorable\\)-\\(?:17\\|160\\|151\\)\\'"
                     (symbol-name (cadr form)))
                (let ((translated (eliscript-unicode-case-runtime-rename form)))
                  (push translated declarations) (push (cadr translated) names)))))
        (end-of-file nil)))
    (unless (= (length declarations) 24)
      (error "Unicode case source must provide all 24 pure per-version functions"))
    (let* ((print-length nil) (print-level nil) (print-circle nil)
           (digest (secure-hash 'sha256 (encode-coding-string region 'utf-8-unix)))
           (text (concat
                  ";; Generated from bootstrap/runtime/memory.eli; do not edit.\n"
                  ";; Unicode 15.1 / 16 / 17, Unicode-3.0: https://www.unicode.org/license.txt\n"
                  "(module eliscript.runtime.unicode-case-data\n"
                  "  (defconst unicodeCaseDataSourceSha256 " (prin1-to-string digest) ")\n"
                  (mapconcat (lambda (form) (concat "  " (prin1-to-string form))) (nreverse declarations) "\n")
                  "\n  (export unicodeCaseDataSourceSha256 "
                  (mapconcat #'symbol-name (nreverse names) " ") "))\n")))
      (make-directory (file-name-directory destination) t)
      (let ((coding-system-for-write 'utf-8-unix))
        (with-temp-file destination (insert text)))
      destination)))

(provide 'unicode-case-runtime)
