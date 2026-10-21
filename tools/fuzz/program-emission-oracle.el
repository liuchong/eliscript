;;; program-emission-oracle.el --- Independent full fuzz emission -*- lexical-binding: t; -*-

(let* ((directory (file-name-directory (or load-file-name buffer-file-name)))
       (root (expand-file-name "../.." directory)))
  (add-to-list 'load-path (expand-file-name "compiler" root)))
(require 'json)
(require 'eliscript)
(set-language-environment "UTF-8")
(prefer-coding-system 'utf-8-unix)
(setq coding-system-for-read 'utf-8-unix
      coding-system-for-write 'utf-8-unix)

(defun eliscript-fuzz-emission-oracle--ascii-json (text)
  "Retain complete JSON TEXT through the same portable wire as the reader oracle."
  (with-temp-buffer
    (dolist (character (string-to-list text))
      (cond
       ((<= character #x7f) (insert character))
       ((<= character #xffff) (insert (format "\\u%04X" character)))
       (t
        (let* ((value (- character #x10000))
               (high (+ #xd800 (ash value -10)))
               (low (+ #xdc00 (logand value #x3ff))))
          (insert (format "\\u%04X\\u%04X" high low))))))
    (buffer-string)))

(defun eliscript-fuzz-emission-oracle--result (item)
  "Compile the original program ITEM using the maintained Emacs implementation."
  (let ((source (alist-get 'source item))
        (filename (alist-get 'filename item))
        (index (alist-get 'index item)))
    (unless (and (stringp source) (stringp filename) (integerp index)
                 (equal (alist-get 'kind item) "program"))
      (error "full emitter oracle requires the actual original program case"))
    (condition-case error-data
        `((index . ,index) (status . "ok")
          (javascript . ,(decode-coding-string
                           (substring-no-properties
                            (eliscript-compile-string source filename))
                           'utf-8-unix)))
      ((eliscript-read-error eliscript-expand-error eliscript-analyze-error eliscript-compile-error)
       `((index . ,index) (status . "error")
         (message . ,(cadr error-data))
         (diagnostic . ,(eliscript-diagnostic-to-alist
                         (eliscript-diagnostic-from-condition error-data))))))))

(let ((input (getenv "ELISCRIPT_FUZZ_EMISSION_INPUT"))
      (output (getenv "ELISCRIPT_FUZZ_EMISSION_OUTPUT"))
      (count 0))
  (unless (and input output) (error "full emitter oracle requires input and output"))
  (when (file-exists-p output) (error "full emitter oracle refuses an existing output"))
  (with-temp-buffer
    (insert-file-contents input)
    (goto-char (point-min))
    (while (not (eobp))
      (let ((line (buffer-substring-no-properties (line-beginning-position) (line-end-position))))
        (forward-line 1)
        (unless (string-empty-p line)
          (let* ((item (json-parse-string line :object-type 'alist :array-type 'list
                                         :null-object nil :false-object :false))
                 (result (eliscript-fuzz-emission-oracle--result item))
                 (json (decode-coding-string
                         (json-serialize result :null-object nil :false-object :false)
                         'utf-8-unix)))
            (write-region (concat (eliscript-fuzz-emission-oracle--ascii-json json) "\n") nil output t 'silent)
            (setq count (1+ count)))))))
  (princ (format "%d\n" count)))

;;; program-emission-oracle.el ends here
