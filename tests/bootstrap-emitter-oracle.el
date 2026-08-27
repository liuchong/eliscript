;;; bootstrap-emitter-oracle.el --- Normalize seed emission output -*- lexical-binding: t; -*-

;;; Code:

(let* ((tests-directory
        (file-name-directory (or load-file-name buffer-file-name)))
       (project-directory
        (file-name-directory (directory-file-name tests-directory))))
  (add-to-list 'load-path tests-directory)
  (add-to-list 'load-path (expand-file-name "compiler" project-directory)))

(set-language-environment "UTF-8")
(prefer-coding-system 'utf-8-unix)
(setq coding-system-for-write 'utf-8-unix)
(set-terminal-coding-system 'utf-8-unix)

(require 'json)
(require 'bootstrap-tests)

(defun eliscript-bootstrap-emitter-oracle--ascii-json (json)
  "Return JSON with non-ASCII code points escaped portably."
  (with-temp-buffer
    (dolist (character (string-to-list json))
      (cond
       ((<= character #x7f) (insert character))
       ((<= character #xffff) (insert (format "\\u%04X" character)))
       (t
        (let* ((value (- character #x10000))
               (high (+ #xd800 (ash value -10)))
               (low (+ #xdc00 (logand value #x3ff))))
          (insert (format "\\u%04X\\u%04X" high low))))))
    (buffer-string)))

(let ((fixture (getenv "ELISCRIPT_EMITTER_FIXTURE")))
  (unless fixture
    (error "ELISCRIPT_EMITTER_FIXTURE is required"))
  (princ
   (eliscript-bootstrap-emitter-oracle--ascii-json
    (decode-coding-string
     (json-serialize
      (eliscript-bootstrap-tests-emitter-results fixture)
      :null-object nil
      :false-object :false)
     'utf-8-unix))))

;;; bootstrap-emitter-oracle.el ends here
