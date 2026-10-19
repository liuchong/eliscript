;;; bootstrap-runtime.el --- Runtime for an independent JS seed -*- lexical-binding: t; -*-

(require 'json)
(require 'eliscript)

(declare-function eliscript-generate-unicode-case-runtime-data "runtime/unicode-case-runtime" (root))

(defun eliscript-bootstrap-prepare-runtime (root output)
  "Compile ROOT's real default runtime into the independent seed OUTPUT."
  (unless (file-exists-p (expand-file-name "runtime/unicode-case-data.eli" root))
    ;; A clean source checkout has no ignored generated table module. Published
    ;; source packages can carry that actual derived Eli source directly.
    (let ((generator (expand-file-name "tools/runtime/unicode-case-runtime.el" root)))
      (unless (file-regular-p generator)
        (error "Unicode bootstrap requires its maintained generator or derived Eli data"))
      (load generator nil t)
      (eliscript-generate-unicode-case-runtime-data root)))
  (dolist (name '("unicode-case-data" "unicode-case" "math"))
    (let ((runtime (expand-file-name (concat "runtime/" name ".mjs") output)))
      (make-directory (file-name-directory runtime) t)
      (eliscript-compile-file-with-source-map
       (expand-file-name (concat "runtime/" name ".eli") root) runtime)))
  ;; The emitted frontend keeps its imports unchanged. A private scope resolves
  ;; this complete real runtime even when OUTPUT is outside the checkout.
  (let ((coding-system-for-write 'utf-8-unix))
    (with-temp-file (expand-file-name "package.json" output)
      (insert (json-serialize
               '((name . "eliscript") (type . "module") (private . t)
                 (exports . ((./runtime/math.mjs . "./runtime/math.mjs")
                             (./runtime/unicode-case.mjs . "./runtime/unicode-case.mjs")
                             (./runtime/unicode-case-data.mjs . "./runtime/unicode-case-data.mjs")))))
              "\n"))))

(defun eliscript-bootstrap-prepare-project-host (root)
  "Prepare ROOT's maintained project host before loading the JS build driver."
  (let ((source (expand-file-name "tools/project/project.eli" root))
        (output (expand-file-name "bootstrap/host/project.mjs" root)))
    (when (file-exists-p source)
      (make-directory (file-name-directory output) t)
      (eliscript-compile-file-with-source-map source output))))

(defun eliscript-bootstrap--call-emacs (emacs arguments)
  "Call EMACS with ARGUMENTS, preserving its output and error streams."
  (let ((stderr-file (make-temp-file "eliscript-bootstrap-stderr-"))
        (stdout standard-output))
    (unwind-protect
        (with-temp-buffer
          (let ((status (apply #'call-process emacs nil
                               (list (current-buffer) stderr-file) nil arguments)))
            (princ (buffer-string) stdout)
            (with-temp-buffer
              (insert-file-contents stderr-file)
              (princ (buffer-string) #'external-debugging-output))
            status))
      (delete-file stderr-file))))

(defun eliscript-bootstrap-launch-command (root)
  "Run the maintained seed build for ROOT, honoring its executable override."
  (let* ((configured-output (getenv "ELISCRIPT_BOOTSTRAP_OUT_DIR"))
         (output (if (and configured-output (> (length configured-output) 0))
                     configured-output (expand-file-name "dist/bootstrap" root)))
         (modules '("symbol" "syntax" "reader" "formatter" "expander"
                    "transient-analysis" "analyzer" "ir" "lower" "source-map"
                    "emitter" "project" "compiler"))
         (arguments (append (list root output) modules))
         (configured-emacs (getenv "EMACS"))
         (emacs (and configured-emacs (> (length configured-emacs) 0) configured-emacs)))
    (setq command-line-args-left nil)
    (if emacs
        ;; Honor the existing executable override without shell interpolation.
        (condition-case error-data
            (let ((status (eliscript-bootstrap--call-emacs
                           emacs
                           (append (list "--batch" "-Q" "--script"
                                         (expand-file-name
                                          "tools/bootstrap-seed.el" root)
                                         "--") arguments))))
              (kill-emacs (if (integerp status) status 1)))
          (error (message "eliscript: %s" (error-message-string error-data))
                 (kill-emacs 1)))
      (setq command-line-args-left (cons "--" arguments))
      (load (expand-file-name "tools/bootstrap-seed.el" root) nil t)))
  )

(provide 'eliscript-bootstrap-runtime)
;;; bootstrap-runtime.el ends here
