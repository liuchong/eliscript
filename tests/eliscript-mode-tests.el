;;; eliscript-mode-tests.el --- Tests for Eliscript mode -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'imenu)
(require 'eliscript-mode)

(defconst eliscript-mode-tests--root
  (expand-file-name ".." (file-name-directory
                           (or load-file-name buffer-file-name))))

(defun eliscript-mode-tests--face-at (text)
  "Return the face on the last character of the next TEXT."
  (search-forward text)
  (get-text-property (1- (point)) 'face))

(defun eliscript-mode-tests--imenu-names (index)
  "Return every named entry contained in Imenu INDEX."
  (let (names)
    (dolist (entry index)
      (when (consp entry)
        (if (imenu--subalist-p entry)
            (setq names
                  (append names
                          (eliscript-mode-tests--imenu-names (cdr entry))))
          (push (car entry) names))))
    names))

(ert-deftest eliscript-mode-activates-complete-source-syntax ()
  (with-temp-buffer
    (setq buffer-file-name "/tmp/example.eli")
    (set-auto-mode)
    (should (eq major-mode 'eliscript-mode))
    (should (equal comment-start "; "))
    (should (equal comment-end ""))
    (insert "[{:key \"text\"} #{:a :b}] ; comment\n")
    (goto-char (point-min))
    (let ((end (scan-sexps (point) 1)))
      (should (eq (char-before end) ?\])))
    (search-forward "text")
    (should (nth 3 (syntax-ppss (1- (point)))))
    (search-forward "comment")
    (should (nth 4 (syntax-ppss (1- (point)))))
    (goto-char (point-min))
    (insert "'` , ,@ #'")
    (dolist (character '(?' ?` ?, ?#))
      (should (= (char-syntax character) ?')))))

(ert-deftest eliscript-mode-indentation-matches-formatter-structure ()
  (with-temp-buffer
    (eliscript-mode)
    (insert "(module demo\n(defun answer (x)\n(if x\n(print :yes)\n(print :no))))\n")
    (indent-region (point-min) (point-max))
    (let ((canonical
           "(module demo\n  (defun answer (x)\n    (if x\n      (print :yes)\n      (print :no))))\n"))
      (should (equal (buffer-string) canonical))
      (indent-region (point-min) (point-max))
      (should (equal (buffer-string) canonical)))))

(ert-deftest eliscript-mode-font-locks-semantic-categories ()
  (with-temp-buffer
    (eliscript-mode)
    (insert "(module demo.core)\n"
            "(defn answer (&optional x)\n"
            "  (if x :yes false))\n"
            "(defmulti render (lambda (value) value))\n"
            "(defmethod render :text (value) value)\n"
            "(defprotocol IDescribe describe)\n"
            "(extend-category \"number\" IDescribe\n"
            "  (describe (value) value))\n"
            "(defun pipeline (value) (-> value (1+) (* 2)))\n"
            "(defun present (value) (if-some (item value) item :missing))\n"
            "(defconst label \"ready\")\n"
            "; note\n")
    (font-lock-ensure)
    (goto-char (point-min))
    (should (eq (eliscript-mode-tests--face-at "module")
                'font-lock-keyword-face))
    (should (eq (eliscript-mode-tests--face-at "demo.core")
                'font-lock-type-face))
    (should (eq (eliscript-mode-tests--face-at "defn")
                'font-lock-keyword-face))
    (should (eq (eliscript-mode-tests--face-at "answer")
                'font-lock-function-name-face))
    (should (eq (eliscript-mode-tests--face-at "&optional")
                'font-lock-builtin-face))
    (should (eq (eliscript-mode-tests--face-at ":yes")
                'font-lock-constant-face))
    (should (eq (eliscript-mode-tests--face-at "false")
                'font-lock-constant-face))
    (should (eq (eliscript-mode-tests--face-at "defmulti")
                'font-lock-keyword-face))
    (should (eq (eliscript-mode-tests--face-at "render")
                'font-lock-function-name-face))
    (should (eq (eliscript-mode-tests--face-at "defmethod")
                'font-lock-keyword-face))
    (should (eq (eliscript-mode-tests--face-at "defprotocol")
                'font-lock-keyword-face))
    (should (eq (eliscript-mode-tests--face-at "IDescribe")
                'font-lock-function-name-face))
    (should (eq (eliscript-mode-tests--face-at "extend-category")
                'font-lock-keyword-face))
    (should (eq (eliscript-mode-tests--face-at "->")
                'font-lock-keyword-face))
    (should (eq (eliscript-mode-tests--face-at "if-some")
                'font-lock-keyword-face))
    (should (eq (eliscript-mode-tests--face-at "label")
                'font-lock-variable-name-face))
    (should (eq (eliscript-mode-tests--face-at "ready")
                'font-lock-string-face))
    (should (eq (eliscript-mode-tests--face-at "note")
                'font-lock-comment-face))))

(ert-deftest eliscript-mode-indexes-and-navigates-definitions ()
  (with-temp-buffer
    (eliscript-mode)
    (insert "(module demo.core)\n\n"
            "(defun first (x)\n  (print x))\n\n"
            "(defmacro with-value (&body body)\n  body)\n\n"
            "(defmulti render (lambda (value) value))\n\n"
            "(defprotocol IDescribe describe)\n\n"
            "(defconst answer 42)\n")
    (font-lock-ensure)
    (let ((names (eliscript-mode-tests--imenu-names
                  (imenu--make-index-alist t))))
      (dolist (name '("demo.core" "first" "with-value" "render"
                      "IDescribe" "answer"))
        (should (member name names))))
    (goto-char (point-min))
    (search-forward "print")
    (beginning-of-defun)
    (should (looking-at-p "(defun first"))
    (end-of-defun)
    (should (save-excursion
              (skip-chars-backward " \t\r\n")
              (eq (char-before) ?\))))
    (search-forward "body")
    (beginning-of-defun)
    (should (looking-at-p "(defmacro with-value"))
    (end-of-defun)
    (should (save-excursion
              (skip-chars-backward " \t\r\n")
              (looking-back "body)" (line-beginning-position))))))

(ert-deftest eliscript-mode-discovers-configured-and-vcs-projects ()
  (let* ((directory (make-temp-file "eliscript-mode-project-" t))
         (configured (expand-file-name "configured" directory))
         (vcs (expand-file-name "vcs" directory))
         (configured-source (expand-file-name "src/nested" configured))
         (vcs-source (expand-file-name "src/nested" vcs)))
    (unwind-protect
        (progn
          (make-directory configured-source t)
          (make-directory vcs-source t)
          (make-directory (expand-file-name ".git" configured) t)
          (make-directory (expand-file-name ".git" vcs) t)
          (write-region "{}" nil (expand-file-name "eliscript.json" configured)
                        nil 'silent)
          (with-temp-buffer
            (setq default-directory configured-source)
            (should (equal (eliscript-mode-project-root)
                           (file-name-as-directory configured))))
          (with-temp-buffer
            (setq default-directory vcs-source)
            (should (equal (eliscript-mode-project-root)
                           (file-name-as-directory vcs)))))
      (delete-directory directory t))))

(ert-deftest eliscript-mode-builds-project-aware-check-command ()
  (let* ((directory (make-temp-file "eliscript-mode-check-" t))
         (source (expand-file-name "src/main.eli" directory))
         (configuration (expand-file-name "eliscript.json" directory))
         (eliscript-mode-check-command '("eliscript-check" "--fixed")))
    (unwind-protect
        (progn
          (make-directory (file-name-directory source) t)
          (write-region "{}" nil configuration nil 'silent)
          (write-region "(print 42)\n" nil source nil 'silent)
          (with-temp-buffer
            (setq buffer-file-name source)
            (eliscript-mode)
            (should (equal
                     (eliscript-mode--check-arguments)
                     (list "--fixed" "--config" configuration
                           "--stdin-file" source "--json"
                           "--diagnostic-format" "json")))))
      (delete-directory directory t))))

(ert-deftest eliscript-mode-decodes-versioned-check-diagnostics ()
  (let* ((source (make-temp-file "eliscript-mode-diagnostic-" nil ".eli"))
         (json (json-serialize
                `((format . "eliscript-diagnostic")
                  (version . 1)
                  (code . "ELI-A0001")
                  (severity . "error")
                  (phase . "analysis")
                  (message . "unbound symbol: missing")
                  (location
                   (file . ,source)
                   (start (offset . 7) (line . 1) (column . 8))
                   (end (offset . 14) (line . 1) (column . 15)))))))
    (unwind-protect
        (with-temp-buffer
          (setq buffer-file-name source)
          (insert "(print missing)\n")
          (let ((diagnostic (eliscript-mode--diagnostic-from-json json)))
            (should diagnostic)
            (should (= (flymake-diagnostic-beg diagnostic) 8))
            (should (= (flymake-diagnostic-end diagnostic) 15))
            (should (eq (flymake-diagnostic-type diagnostic) :error))
            (should (equal (flymake-diagnostic-text diagnostic)
                           "ELI-A0001: unbound symbol: missing"))))
      (delete-file source))))

(ert-deftest eliscript-mode-flymake-backend-reports-json-failures ()
  (let* ((source (make-temp-file "eliscript-mode-flymake-" nil ".eli"))
         (eliscript-mode-check-command
          '("/bin/sh" "-c"
            "cat >/dev/null; printf '%s\\n' '{\"format\":\"eliscript-diagnostic\",\"version\":1,\"code\":\"ELI-A0001\",\"severity\":\"error\",\"phase\":\"analysis\",\"message\":\"unbound symbol: missing\"}' >&2; exit 1"
            "eliscript-check-test"))
         completed
         diagnostics)
    (unwind-protect
        (with-temp-buffer
          (setq buffer-file-name source)
          (insert "(print missing)\n")
          (eliscript-mode)
          (eliscript-mode-flymake-backend
           (lambda (reported)
             (setq diagnostics reported)
             (setq completed t)))
          (let ((deadline (+ (float-time) 5)))
            (while (and (not completed) (< (float-time) deadline))
              (accept-process-output nil 0.05)))
          (should completed)
          (should (= (length diagnostics) 1))
          (should (equal (flymake-diagnostic-text (car diagnostics))
                         "ELI-A0001: unbound symbol: missing")))
      (delete-file source))))

(ert-deftest eliscript-mode-builds-buffer-file-and-project-commands ()
  (let* ((directory (make-temp-file "eliscript-mode-build-" t))
         (source (expand-file-name "src/main.eli" directory))
         (configuration (expand-file-name "eliscript.json" directory))
         (eliscript-mode-build-command '("eliscript-build" "--fixed")))
    (unwind-protect
        (progn
          (make-directory (file-name-directory source) t)
          (write-region "{}" nil configuration nil 'silent)
          (write-region "(print 42)\n" nil source nil 'silent)
          (with-temp-buffer
            (setq buffer-file-name source)
            (eliscript-mode)
            (should (equal
                     (eliscript-mode--build-arguments 'buffer)
                     (list "--fixed" "--config" configuration
                           "--stdin-file" source "--no-cache"
                           "--diagnostic-format" "human")))
            (should (equal
                     (eliscript-mode--build-arguments 'file)
                     (list "--fixed" "--config" configuration source
                           "--diagnostic-format" "human")))
            (should (equal
                     (eliscript-mode--build-arguments 'project)
                     (list "--fixed" "--config" configuration
                           "--diagnostic-format" "human")))))
      (delete-directory directory t))))

(ert-deftest eliscript-mode-builds-project-watch-command ()
  (let* ((directory (make-temp-file "eliscript-mode-watch-" t))
         (source (expand-file-name "src/main.eli" directory))
         (configuration (expand-file-name "eliscript.json" directory))
         (eliscript-mode-watch-command '("eliscript-watch" "--json" "--fixed")))
    (unwind-protect
        (progn
          (make-directory (file-name-directory source) t)
          (write-region "{}" nil configuration nil 'silent)
          (write-region "(print 42)\n" nil source nil 'silent)
          (with-temp-buffer
            (setq buffer-file-name source)
            (setq default-directory (file-name-directory source))
            (eliscript-mode)
            (let ((context (eliscript-mode--watch-context)))
              (should (equal (plist-get context :configuration)
                             (file-truename configuration)))
              (should (equal
                       (eliscript-mode--watch-arguments context)
                       (list "--json" "--fixed" "--config"
                             (file-truename configuration)))))))
      (delete-directory directory t))))

(ert-deftest eliscript-mode-frames-validates-and-applies-watch-events ()
  (let* ((directory (make-temp-file "eliscript-mode-watch-event-" t))
         (source (expand-file-name "main.eli" directory))
         (root (file-name-as-directory (file-truename directory)))
         (process-buffer (generate-new-buffer " *eliscript-watch-test*"))
         (source-buffer (generate-new-buffer " *eliscript-watch-source*"))
         (process (make-process
                   :name "eliscript-watch-filter-test"
                   :buffer process-buffer
                   :command '("sh" "-c" "sleep 30")
                   :noquery t))
         (eliscript-mode-watch-event-hook nil)
         events
         refreshes)
    (unwind-protect
        (progn
          (write-region "(print 1)\n" nil source nil 'silent)
          (process-put process 'eliscript-watch-root root)
          (process-put process 'eliscript-watch-partial "")
          (puthash root process eliscript-mode--watch-processes)
          (with-current-buffer source-buffer
            (setq buffer-file-name source)
            (setq default-directory directory)
            (eliscript-mode)
            (setq-local flymake-mode t))
          (add-hook 'eliscript-mode-watch-event-hook
                    (lambda (event) (push event events)))
          (cl-letf (((symbol-function 'flymake-start)
                     (lambda (&rest _) (push (current-buffer) refreshes))))
            (let* ((ready
                    (json-serialize
                     `((format . "eliscript-watch-event")
                       (version . 1)
                       (sequence . 0)
                       (event . "ready")
                       (root . ,root)
                       (changes . [])
                       (digest . ,(make-string 64 ?0)))))
                   (change
                    (json-serialize
                     `((format . "eliscript-watch-event")
                       (version . 1)
                       (sequence . 1)
                       (event . "change")
                       (root . ,root)
                       (changes . [((file . ,source)
                                    (path . "main.eli")
                                    (kind . "modify"))])
                       (digest . ,(make-string 64 ?1)))))
                   (split (/ (length ready) 2)))
              (eliscript-mode--watch-filter process (substring ready 0 split))
              (should-not events)
              (eliscript-mode--watch-filter
               process (concat (substring ready split) "\n" change "\n"))
              (should (= (length events) 2))
              (should (eq (car refreshes) source-buffer))
              (should (= (process-get process 'eliscript-watch-sequence) 1))
              (should-error
               (eliscript-mode--handle-watch-event
                process (eliscript-mode--watch-event-from-json change))
               :type 'eliscript-mode-error))))
      (remhash root eliscript-mode--watch-processes)
      (when (process-live-p process) (delete-process process))
      (when (buffer-live-p process-buffer) (kill-buffer process-buffer))
      (when (buffer-live-p source-buffer)
        (with-current-buffer source-buffer
          (set-buffer-modified-p nil))
        (kill-buffer source-buffer))
      (delete-directory directory t))))

(ert-deftest eliscript-mode-shares-and-stops-project-watch-process ()
  (let* ((directory (make-temp-file "eliscript-mode-watch-session-" t))
         (configuration (expand-file-name "eliscript.json" directory))
         (eliscript-mode-watch-command
          '("sh" "-c" "sleep 30" "eliscript-watch-test"))
         first)
    (unwind-protect
        (progn
          (write-region "{}" nil configuration nil 'silent)
          (with-temp-buffer
            (setq default-directory directory)
            (setq first (eliscript-mode-watch-project directory))
            (should (process-live-p first))
            (should (eq first (eliscript-mode-watch-project directory)))
            (should (eliscript-mode-watch-project-p directory))
            (should (eliscript-mode-stop-watch directory))
            (should-not (eliscript-mode-watch-project-p directory))))
      (when (process-live-p first) (delete-process first))
      (clrhash eliscript-mode--watch-processes)
      (delete-directory directory t))))

(ert-deftest eliscript-mode-consumes-public-project-watch-events ()
  (let* ((directory (make-temp-file "eliscript-mode-watch-public-" t))
         (source (expand-file-name "src/main.eli" directory))
         (configuration (expand-file-name "eliscript.json" directory))
         (watcher (expand-file-name "bin/eliscript-watch"
                                    eliscript-mode-tests--root))
         (eliscript-mode-watch-command
          (list watcher "--json" "--interval" "25"))
         (eliscript-mode-watch-event-hook nil)
         events
         process)
    (unwind-protect
        (progn
          (make-directory (file-name-directory source) t)
          (write-region "(print 1)\n" nil source nil 'silent)
          (write-region
           "{\"schemaVersion\":1,\"sourceRoot\":\"src\",\"entry\":\"main.eli\",\"outDir\":\"build\",\"portableEntries\":[],\"cache\":true}\n"
           nil configuration nil 'silent)
          (add-hook 'eliscript-mode-watch-event-hook
                    (lambda (event) (push event events)))
          (with-temp-buffer
            (setq default-directory directory)
            (setq process (eliscript-mode-watch-project directory))
            (let ((deadline (+ (float-time) 15)))
              (while (and (not (seq-find
                                (lambda (event)
                                  (equal (alist-get 'event event) "ready"))
                                events))
                          (< (float-time) deadline))
                (accept-process-output process 0.05)))
            (should (process-live-p process))
            (should (seq-find
                     (lambda (event)
                       (equal (alist-get 'event event) "ready"))
                     events))
            (write-region "(print 2)\n" nil source nil 'silent)
            (let ((deadline (+ (float-time) 15)))
              (while (and (not (seq-find
                                (lambda (event)
                                  (equal (alist-get 'event event) "change"))
                                events))
                          (< (float-time) deadline))
                (accept-process-output process 0.05)))
            (let ((change
                   (seq-find
                    (lambda (event)
                      (equal (alist-get 'event event) "change"))
                    events)))
              (should change)
              (should (equal (alist-get 'path
                                        (car (alist-get 'changes change)))
                             "main.eli")))
            (should (eliscript-mode-stop-watch directory))))
      (when (process-live-p process) (delete-process process))
      (clrhash eliscript-mode--watch-processes)
      (delete-directory directory t))))

(ert-deftest eliscript-mode-compiles-unsaved-buffer-through-public-build ()
  (let* ((directory (make-temp-file "eliscript-mode-virtual-build-" t))
         (source (expand-file-name "src/main.eli" directory))
         (configuration (expand-file-name "eliscript.json" directory))
         (output (expand-file-name "build/main.mjs" directory))
         (builder (expand-file-name "bin/eliscript-build"
                                    eliscript-mode-tests--root))
         (eliscript-mode-build-command (list builder))
         source-buffer
         compilation-buffer)
    (unwind-protect
        (progn
          (make-directory (file-name-directory source) t)
          (write-region "(print 41)\n" nil source nil 'silent)
          (write-region
           "{\"schemaVersion\":1,\"sourceRoot\":\"src\",\"entry\":\"main.eli\",\"outDir\":\"build\",\"portableEntries\":[],\"cache\":true}\n"
           nil configuration nil 'silent)
          (setq source-buffer (find-file-noselect source))
          (with-current-buffer source-buffer
            (erase-buffer)
            (insert "(print 82)\n")
            (eliscript-mode)
            (setq compilation-buffer (eliscript-mode-compile-buffer)))
          (let* ((process (get-buffer-process compilation-buffer))
                 (deadline (+ (float-time) 15)))
            (while (and (process-live-p process)
                        (< (float-time) deadline))
              (accept-process-output process 0.05))
            (should-not (process-live-p process))
            (should (= (process-exit-status process) 0)))
          (should (equal (with-temp-buffer
                           (insert-file-contents source)
                           (buffer-string))
                         "(print 41)\n"))
          (with-temp-buffer
            (should (= (process-file "bun" nil t nil output) 0))
            (should (equal (string-trim (buffer-string)) "82")))
          (with-current-buffer compilation-buffer
            (should (eq major-mode 'eliscript-compilation-mode))
            (should (equal compilation-error-regexp-alist '(eliscript)))))
      (when (buffer-live-p compilation-buffer)
        (let ((process (get-buffer-process compilation-buffer)))
          (when (process-live-p process) (kill-process process)))
        (kill-buffer compilation-buffer))
      (when (buffer-live-p source-buffer)
        (with-current-buffer source-buffer
          (set-buffer-modified-p nil))
        (kill-buffer source-buffer))
      (delete-directory directory t))))

(ert-deftest eliscript-mode-formats-buffer-through-public-command ()
  (let ((eliscript-mode-format-command
         (list (expand-file-name "bin/eliscript-format"
                                eliscript-mode-tests--root))))
    (with-temp-buffer
      (eliscript-mode)
      (insert "; heading   \n(module   demo.mode\n(defun answer () 42))\n")
      (goto-char (point-min))
      (search-forward "answer")
      (let ((position (point)))
        (should (eliscript-mode-format-buffer))
        (should (equal
                 (buffer-string)
                 "; heading\n(module demo.mode (defun answer () 42))\n"))
        (should (<= (abs (- (point) position)) 5))
        (should (equal (buffer-substring-no-properties
                        (- (point) 6) (point))
                       "answer")))
      (set-buffer-modified-p nil)
      (should-not (eliscript-mode-format-buffer))
      (should-not (buffer-modified-p)))))

(ert-deftest eliscript-mode-formatter-failure-is-transactional ()
  (let ((eliscript-mode-format-command
         '("sh" "-c" "printf formatter-failed >&2; exit 7" "eliscript-test")))
    (with-temp-buffer
      (eliscript-mode)
      (insert "(module unchanged)\n")
      (goto-char 9)
      (set-buffer-modified-p nil)
      (let ((source (buffer-string))
            (position (point))
            failure)
        (condition-case error
            (eliscript-mode-format-buffer)
          (eliscript-mode-error (setq failure error)))
        (should failure)
        (should (string-match-p "formatter-failed"
                                (error-message-string failure)))
        (should (equal (buffer-string) source))
        (should (= (point) position))
        (should-not (buffer-modified-p))))))

(ert-deftest eliscript-mode-rejects-invalid-formatter-command ()
  (let ((eliscript-mode-format-command nil))
    (with-temp-buffer
      (eliscript-mode)
      (insert "(module unchanged)\n")
      (should-error (eliscript-mode-format-buffer)
                    :type 'eliscript-mode-error))))

(provide 'eliscript-mode-tests)

;;; eliscript-mode-tests.el ends here
