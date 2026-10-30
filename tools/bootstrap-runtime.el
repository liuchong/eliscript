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
  (dolist (name '("prelude" "unicode-case-data" "unicode-case" "math"))
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
                             (./runtime/prelude.mjs . "./runtime/prelude.mjs")
                             (./runtime/unicode-case.mjs . "./runtime/unicode-case.mjs")
                             (./runtime/unicode-case-data.mjs . "./runtime/unicode-case-data.mjs")))))
              "\n"))))

(defun eliscript-bootstrap--materialize-capsule (source output)
  "Materialize capsule `.eli' file SOURCE into `.mjs' file OUTPUT."
  (when (file-exists-p source)
    (with-temp-buffer
      (insert-file-contents source)
      (goto-char (point-min))
      (let* ((form (read (current-buffer)))
             (body (and (consp form) (eq (car form) 'module) (nth 2 form)))
             (code (and (consp body) (eq (car body) 'js*) (stringp (nth 1 body)) (nth 1 body)))
             (coding-system-for-write 'utf-8-unix))
        (when code
          (make-directory (file-name-directory output) t)
          (write-region code nil output nil 'silent))))))

(defun eliscript-bootstrap-prepare-dist-host (root)
  "Prepare `dist/runtime', `dist/package.json', and `dist/host-cli' inside ROOT."
  (let ((dist-dir (expand-file-name "dist" root))
        (dist-runtime (expand-file-name "dist/runtime" root))
        (dist-host (expand-file-name "dist/host-cli" root))
        (boot-runtime (expand-file-name "dist/bootstrap/runtime" root)))
    (make-directory dist-runtime t)
    (make-directory dist-host t)
    (dolist (name '("prelude" "unicode-case-data" "unicode-case" "math"))
      (let ((dst-mjs (expand-file-name (concat name ".mjs") dist-runtime)))
        (unless (and (file-exists-p dst-mjs) (file-exists-p (concat dst-mjs ".map")))
          (eliscript-compile-file-with-source-map
           (expand-file-name (concat "runtime/" name ".eli") root) dst-mjs))))
    (dolist (sub '("runtime" "runtime/core" "runtime/wire" "runtime/testing" "platform"))
      (let ((src-sub (expand-file-name sub root))
            (dst-sub (expand-file-name (concat "dist/" sub) root)))
        (when (file-directory-p src-sub)
          (dolist (file (directory-files src-sub nil "\\.eli\\'"))
            (eliscript-bootstrap--materialize-capsule
             (expand-file-name file src-sub)
             (expand-file-name (concat (file-name-sans-extension file) ".mjs") dst-sub))))))
    (dolist (entry '(("stdlib/core/protocol.eli" . "dist/runtime/core/protocol-impl.mjs")
                     ("stdlib/core/text.eli" . "dist/runtime/core/text-impl.mjs")
                     ("stdlib/core/object.eli" . "dist/runtime/core/object-impl.mjs")))
      (let ((source (expand-file-name (car entry) root))
            (output (expand-file-name (cdr entry) root)))
        (when (and (file-exists-p source) (not (file-exists-p output)))
          (make-directory (file-name-directory output) t)
          (eliscript-compile-file-with-source-map source output))))
    (let ((coding-system-for-write 'utf-8-unix))
      (with-temp-file (expand-file-name "package.json" dist-dir)
        (insert (json-serialize
                 '((name . "eliscript") (type . "module") (private . t)
                   (exports . ((./runtime/math.mjs . "./runtime/math.mjs")
                               (./runtime/prelude.mjs . "./runtime/prelude.mjs")
                               (./runtime/unicode-case.mjs . "./runtime/unicode-case.mjs")
                               (./runtime/unicode-case-data.mjs . "./runtime/unicode-case-data.mjs")))))
                "\n")))
    (dolist (name '("bun" "build" "project-legacy" "project-cli-legacy" "check-cli-legacy"
                    "evaluation" "evaluation-cli" "format-cli" "watch" "watch-cli"))
      (eliscript-bootstrap--materialize-capsule
       (expand-file-name (concat "bootstrap/host/" name ".eli") root)
       (expand-file-name (concat name ".mjs") dist-host)))
    (let ((proj-legacy (expand-file-name "project-legacy.mjs" dist-host))
          (proj-target (expand-file-name "project.mjs" dist-host)))
      (when (file-exists-p proj-legacy)
        (copy-file proj-legacy proj-target t)))
    (dolist (entry '(("tools/project/project-cli.eli" . "dist/host-cli/project-cli.mjs")
                     ("tools/project/check-cli.eli" . "dist/host-cli/check-cli.mjs")))
      (let ((source (expand-file-name (car entry) root))
            (output (expand-file-name (cdr entry) root)))
        (when (file-exists-p source)
          (eliscript-compile-file-with-source-map source output))))))

(defun eliscript-bootstrap-prepare-project-host (root &optional preserve-existing)
  "Prepare ROOT's maintained project host before loading the JS build driver."
  (if (equal (getenv "ELISCRIPT_DIST_ONLY") "1")
      (unless preserve-existing
        (eliscript-bootstrap-prepare-dist-host root))
    (let ((entries '(("tools/project/project.eli" . "bootstrap/host/project.mjs")
                     ("tools/project/project-cli.eli" . "bootstrap/host/project-cli.mjs")
                     ("tools/project/check-cli.eli" . "bootstrap/host/check-cli.mjs"))))
      (when (file-exists-p (expand-file-name (caar entries) root))
        ;; The generated host lives in ROOT, outside the private compiler output
        ;; scope. Its bare runtime imports must resolve in this same source tree.
        (dolist (name '("prelude" "unicode-case-data" "unicode-case" "math"))
          (let ((module (expand-file-name (concat "runtime/" name ".mjs") root)))
            (unless (and preserve-existing (file-exists-p module)
                         (file-exists-p (concat module ".map")))
              (eliscript-compile-file-with-source-map
               (expand-file-name (concat "runtime/" name ".eli") root) module))))
        (dolist (entry entries)
          (let ((source (expand-file-name (car entry) root))
                (output (expand-file-name (cdr entry) root)))
            (when (file-exists-p source)
              (make-directory (file-name-directory output) t)
              (unless (and preserve-existing (file-exists-p output)
                           (file-exists-p (concat output ".map")))
                (eliscript-compile-file-with-source-map source output))))))
      (unless preserve-existing
        (eliscript-bootstrap-prepare-dist-host root)))))

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
