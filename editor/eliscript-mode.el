;;; eliscript-mode.el --- Major mode for Eliscript source -*- lexical-binding: t; -*-

;;; Commentary:

;; Syntax-aware editing, navigation, project discovery, and formatter
;; integration for Eliscript source files.

;;; Code:

(require 'compile)
(require 'imenu)
(require 'json)
(require 'flymake)
(require 'project)
(require 'seq)
(require 'subr-x)

(defgroup eliscript nil
  "Editing and tool integration for Eliscript."
  :group 'languages
  :prefix "eliscript-")

(defcustom eliscript-mode-format-command '("eliscript-format")
  "Command and fixed arguments used to format the current buffer."
  :type '(repeat string)
  :group 'eliscript)

(defcustom eliscript-mode-check-command '("eliscript-check")
  "Command and fixed arguments used to check the current project."
  :type '(repeat string)
  :group 'eliscript)

(defcustom eliscript-mode-build-command '("eliscript-build")
  "Command and fixed arguments used to build Eliscript projects."
  :type '(repeat string)
  :group 'eliscript)

(defcustom eliscript-mode-eval-command '("eliscript-eval" "--stdio")
  "Command and fixed arguments used for persistent evaluation sessions."
  :type '(repeat string)
  :group 'eliscript)

(defcustom eliscript-mode-watch-command '("eliscript-watch" "--json")
  "Command and fixed arguments used for project watch sessions."
  :type '(repeat string)
  :group 'eliscript)

(defcustom eliscript-mode-build-directory "dist"
  "Output directory used for builds without `eliscript.json'.

Relative paths are resolved from the discovered project root."
  :type 'string
  :group 'eliscript)

(define-error 'eliscript-mode-error "Eliscript editor integration error")

(defvar eliscript-mode-watch-event-hook nil
  "Hook run with one validated project watch event argument.")

(defvar eliscript-mode--watch-processes (make-hash-table :test #'equal)
  "Canonical project roots mapped to their live watch processes.")

(defconst eliscript-mode--function-heads
  '("defasync" "defmulti" "defn" "defportable" "defun"))

(defconst eliscript-mode--macro-heads '("defmacro"))

(defconst eliscript-mode--variable-heads '("defconst" "defvar"))

(defconst eliscript-mode--top-level-heads
  '("defasync" "defconst" "defmacro" "defmethod" "defmulti" "defn"
    "defportable" "defun" "defvar" "export" "export-default"
    "import" "import-portable" "module"))

(defconst eliscript-mode--special-heads
  '("and" "apply" "async" "await" "catch" "cond" "do" "finally"
    "fn" "funcall" "if" "js*" "js-array" "js-call"
    "js-cons" "js-length" "js-nth" "js-object" "lambda" "let"
    "let*" "loop" "new" "or" "progn" "quote" "recur" "set!" "setq"
    "throw" "try" "unless" "when" "while"))

(defconst eliscript-mode--definition-heads
  (append eliscript-mode--function-heads
          eliscript-mode--macro-heads
          eliscript-mode--variable-heads))

(defconst eliscript-mode--name-regexp "\\([^][(){}\"; \t\r\n]+\\)")

(defconst eliscript-mode--compilation-regexp
  '(eliscript
    "^eliscript-build: \\(.+\\):\\([0-9]+\\):\\([0-9]+\\): " 1 2 3)
  "Compilation regexp for located Eliscript build diagnostics.")

(add-to-list 'compilation-error-regexp-alist-alist
             eliscript-mode--compilation-regexp)

(defconst eliscript-mode--definition-regexp
  (concat "^[ \t]*(\\(?:"
          (regexp-opt eliscript-mode--definition-heads)
          "\\)\\_>"))

(defconst eliscript-mode--function-definition-regexp
  (concat "^[ \t]*(\\(?:"
          (regexp-opt eliscript-mode--function-heads)
          "\\)\\_>[ \t]+"
          eliscript-mode--name-regexp))

(defconst eliscript-mode--macro-definition-regexp
  (concat "^[ \t]*(\\(?:"
          (regexp-opt eliscript-mode--macro-heads)
          "\\)\\_>[ \t]+"
          eliscript-mode--name-regexp))

(defconst eliscript-mode--variable-definition-regexp
  (concat "^[ \t]*(\\(?:"
          (regexp-opt eliscript-mode--variable-heads)
          "\\)\\_>[ \t]+"
          eliscript-mode--name-regexp))

(defconst eliscript-mode--module-regexp
  (concat "^[ \t]*(module\\_>[ \t]+" eliscript-mode--name-regexp))

(defconst eliscript-mode-font-lock-keywords
  `((,(concat "(\\("
              (regexp-opt eliscript-mode--function-heads)
              "\\)\\_>[ \t\n]+"
              eliscript-mode--name-regexp)
     (1 font-lock-keyword-face)
     (2 font-lock-function-name-face))
    (,(concat "(\\("
              (regexp-opt eliscript-mode--macro-heads)
              "\\)\\_>[ \t\n]+"
              eliscript-mode--name-regexp)
     (1 font-lock-keyword-face)
     (2 font-lock-function-name-face))
    (,(concat "(\\("
              (regexp-opt eliscript-mode--variable-heads)
              "\\)\\_>[ \t\n]+"
              eliscript-mode--name-regexp)
     (1 font-lock-keyword-face)
     (2 font-lock-variable-name-face))
    (,(concat "(\\(module\\)\\_>[ \t\n]+" eliscript-mode--name-regexp)
     (1 font-lock-keyword-face)
     (2 font-lock-type-face))
    (,(concat "(\\("
              (regexp-opt (append eliscript-mode--top-level-heads
                                  eliscript-mode--special-heads))
              "\\)\\_>")
     (1 font-lock-keyword-face))
    ("\\_<\\(?:false\\|nil\\|t\\|undefined\\)\\_>"
     . font-lock-constant-face)
    ("\\_<:[^][(){}\"; \t\r\n]+\\_>" . font-lock-constant-face)
    ("\\_<&\\(?:body\\|optional\\|rest\\)\\_>" . font-lock-builtin-face)))

(defvar eliscript-mode-syntax-table
  (let ((table (make-syntax-table)))
    (modify-syntax-entry ?\; "<" table)
    (modify-syntax-entry ?\n ">" table)
    (modify-syntax-entry ?\" "\"" table)
    (modify-syntax-entry ?\( "()" table)
    (modify-syntax-entry ?\) ")(" table)
    (modify-syntax-entry ?\[ "(]" table)
    (modify-syntax-entry ?\] ")[" table)
    (modify-syntax-entry ?\{ "(}" table)
    (modify-syntax-entry ?\} "){" table)
    (dolist (character '(?' ?` ?, ?#))
      (modify-syntax-entry character "'" table))
    (dolist (character '(?- ?+ ?* ?/ ?< ?> ?= ?! ?? ?_ ?. ?$ ?% ?& ?:))
      (modify-syntax-entry character "_" table))
    table)
  "Syntax table used by `eliscript-mode'.")

(defconst eliscript-mode-imenu-generic-expression
  `(("Modules" ,eliscript-mode--module-regexp 1)
    ("Functions" ,eliscript-mode--function-definition-regexp 1)
    ("Macros" ,eliscript-mode--macro-definition-regexp 1)
    ("Variables" ,eliscript-mode--variable-definition-regexp 1)))

(defvar eliscript-mode-map
  (let ((map (make-sparse-keymap)))
    (define-key map (kbd "C-c C-f") #'eliscript-mode-format-buffer)
    (define-key map (kbd "C-c C-k") #'eliscript-mode-check-buffer)
    (define-key map (kbd "C-c C-b") #'eliscript-mode-compile-buffer)
    (define-key map (kbd "C-c C-c") #'eliscript-mode-compile-file)
    (define-key map (kbd "C-c C-p") #'eliscript-mode-compile-project)
    (define-key map (kbd "C-c C-n") #'eliscript-mode-next-error)
    (define-key map (kbd "C-c C-r") #'eliscript-mode-previous-error)
    (define-key map (kbd "C-c C-e") #'eliscript-mode-eval-last-form)
    (define-key map (kbd "C-M-x") #'eliscript-mode-eval-defun)
    (define-key map (kbd "C-c C-l") #'eliscript-mode-eval-buffer)
    (define-key map (kbd "C-c C-z") #'eliscript-mode-show-repl)
    (define-key map (kbd "C-c C-q") #'eliscript-mode-stop-repl)
    map)
  "Keymap used by `eliscript-mode'.")

(defvar-local eliscript-mode--flymake-process nil)

(define-compilation-mode eliscript-compilation-mode "Eliscript-Compilation"
  "Compilation mode for Eliscript project builds."
  (setq-local compilation-error-regexp-alist '(eliscript)))

(defun eliscript-mode--line-indentation ()
  "Return canonical structural indentation for the current line."
  (let* ((line-start (line-beginning-position))
         (state (syntax-ppss line-start)))
    (if (nth 3 state)
        (current-indentation)
      (save-excursion
        (back-to-indentation)
        (* 2 (max 0 (- (car state)
                        (if (looking-at-p "[])}]") 1 0))))))))

(defun eliscript-mode--indent-line ()
  "Indent the current line according to Eliscript structural depth."
  (let ((offset (- (current-column) (current-indentation)))
        (indentation (eliscript-mode--line-indentation)))
    (indent-line-to indentation)
    (when (> offset 0)
      (move-to-column (+ indentation offset)))))

(defun eliscript-mode--definition-open-position (start)
  "Return the opening delimiter position for definition at START."
  (save-excursion
    (goto-char start)
    (search-forward "(" (line-end-position) t)
    (1- (point))))

(defun eliscript-mode--current-definition-start ()
  "Return the top-level definition containing point, or nil."
  (let ((position (point))
        start)
    (save-excursion
      (beginning-of-line)
      (unless (looking-at eliscript-mode--definition-regexp)
        (goto-char position)
        (when (re-search-backward eliscript-mode--definition-regexp nil t)
          (setq start (match-beginning 0))))
      (unless start
        (when (looking-at eliscript-mode--definition-regexp)
          (setq start (match-beginning 0))))
      (when start
        (let* ((open (eliscript-mode--definition-open-position start))
               (end (condition-case nil (scan-sexps open 1)
                      (scan-error nil))))
          (and end (<= start position) (<= position end) start))))))

(defun eliscript-mode--beginning-of-defun (&optional arg)
  "Move backward ARG top-level Eliscript definitions."
  (let ((count (or arg 1)))
    (if (< count 0)
        (eliscript-mode--end-of-defun (- count))
      (catch 'missing
        (dotimes (index count)
          (let ((start (and (= index 0)
                            (eliscript-mode--current-definition-start))))
            (unless start
              (beginning-of-line)
              (unless (re-search-backward
                       eliscript-mode--definition-regexp nil t)
                (goto-char (point-min))
                (throw 'missing nil))
              (setq start (match-beginning 0)))
            (goto-char start)))
        t))))

(defun eliscript-mode--end-of-defun (&optional arg)
  "Move forward ARG top-level Eliscript definitions."
  (let ((count (or arg 1)))
    (if (< count 0)
        (eliscript-mode--beginning-of-defun (- count))
      (catch 'missing
        (dotimes (index count)
          (let ((start (and (= index 0)
                            (eliscript-mode--current-definition-start))))
            (unless start
              (unless (re-search-forward
                       eliscript-mode--definition-regexp nil t)
                (goto-char (point-max))
                (throw 'missing nil))
              (setq start (match-beginning 0)))
            (let* ((open (eliscript-mode--definition-open-position start))
                   (end (condition-case nil (scan-sexps open 1)
                          (scan-error nil))))
              (unless end
                (goto-char (point-max))
                (throw 'missing nil))
              (goto-char end))))
        t))))

(defun eliscript-mode-project-root (&optional directory)
  "Return the Eliscript project root containing DIRECTORY.

Prefer the nearest `eliscript.json', then fall back to `project.el'."
  (let* ((candidate (or directory buffer-file-name default-directory))
         (start (file-name-as-directory
                 (expand-file-name
                  (if (file-directory-p candidate)
                      candidate
                    (or (file-name-directory candidate)
                        default-directory)))))
         (configuration-root
          (locate-dominating-file start "eliscript.json")))
    (or (and configuration-root
             (file-name-as-directory
              (expand-file-name configuration-root)))
        (when-let* ((current-project (project-current nil start)))
          (file-name-as-directory
           (expand-file-name (project-root current-project)))))))

(defun eliscript-mode--formatter-program ()
  "Resolve and validate `eliscript-mode-format-command'."
  (unless (and (consp eliscript-mode-format-command)
               (seq-every-p #'stringp eliscript-mode-format-command)
               (not (string-empty-p (car eliscript-mode-format-command))))
    (signal 'eliscript-mode-error
            '("eliscript-mode-format-command must be non-empty strings")))
  (let* ((configured (car eliscript-mode-format-command))
         (program (if (file-name-absolute-p configured)
                      (and (file-executable-p configured) configured)
                    (executable-find configured))))
    (or program
        (signal 'eliscript-mode-error
                (list (format "formatter executable not found: %s"
                              configured))))))

(defun eliscript-mode--check-program ()
  "Resolve and validate `eliscript-mode-check-command'."
  (unless (and (consp eliscript-mode-check-command)
               (seq-every-p #'stringp eliscript-mode-check-command)
               (not (string-empty-p (car eliscript-mode-check-command))))
    (signal 'eliscript-mode-error
            '("eliscript-mode-check-command must be non-empty strings")))
  (let* ((configured (car eliscript-mode-check-command))
         (program (if (file-name-absolute-p configured)
                      (and (file-executable-p configured) configured)
                    (executable-find configured))))
    (or program
        (signal 'eliscript-mode-error
                (list (format "checker executable not found: %s"
                              configured))))))

(defun eliscript-mode--build-program ()
  "Resolve and validate `eliscript-mode-build-command'."
  (unless (and (consp eliscript-mode-build-command)
               (seq-every-p #'stringp eliscript-mode-build-command)
               (not (string-empty-p (car eliscript-mode-build-command))))
    (signal 'eliscript-mode-error
            '("eliscript-mode-build-command must be non-empty strings")))
  (let* ((configured (car eliscript-mode-build-command))
         (program (if (file-name-absolute-p configured)
                      (and (file-executable-p configured) configured)
                    (executable-find configured))))
    (or program
        (signal 'eliscript-mode-error
                (list (format "builder executable not found: %s"
                              configured))))))

(defun eliscript-mode--watch-program ()
  "Resolve and validate `eliscript-mode-watch-command'."
  (unless (and (consp eliscript-mode-watch-command)
               (seq-every-p #'stringp eliscript-mode-watch-command)
               (not (string-empty-p (car eliscript-mode-watch-command))))
    (signal 'eliscript-mode-error
            '("eliscript-mode-watch-command must be non-empty strings")))
  (let* ((configured (car eliscript-mode-watch-command))
         (program (if (file-name-absolute-p configured)
                      (and (file-executable-p configured) configured)
                    (executable-find configured))))
    (or program
        (signal 'eliscript-mode-error
                (list (format "watch executable not found: %s"
                              configured))))))

(defun eliscript-mode--watch-context (&optional directory)
  "Return canonical watch context containing DIRECTORY."
  (let* ((root (or (eliscript-mode-project-root directory)
                   (file-name-as-directory
                    (expand-file-name (or directory default-directory)))))
         (canonical-root (file-name-as-directory (file-truename root)))
         (configuration (expand-file-name "eliscript.json" root)))
    (list :root canonical-root
          :configuration (and (file-regular-p configuration)
                              (file-truename configuration)))))

(defun eliscript-mode--watch-arguments (context)
  "Return public watch-command arguments for CONTEXT."
  (append (cdr eliscript-mode-watch-command)
          (if-let* ((configuration (plist-get context :configuration)))
              (list "--config" configuration)
            (list "--root" (plist-get context :root)))))

(defun eliscript-mode--watch-event-from-json (source)
  "Decode and validate one watch event from JSON SOURCE."
  (condition-case error-data
      (let* ((event (json-parse-string source
                                       :object-type 'alist
                                       :array-type 'list
                                       :null-object nil
                                       :false-object nil))
             (kind (alist-get 'event event))
             (sequence (alist-get 'sequence event))
             (root (alist-get 'root event)))
        (unless (and (equal (alist-get 'format event)
                            "eliscript-watch-event")
                     (= (or (alist-get 'version event) 0) 1)
                     (integerp sequence)
                     (>= sequence 0)
                     (member kind '("ready" "change" "error"))
                     (stringp root)
                     (not (string-empty-p root)))
          (signal 'eliscript-mode-error '("invalid project watch event")))
        event)
    (json-parse-error
     (signal 'eliscript-mode-error
             (list (format "invalid project watch JSON: %s"
                           (error-message-string error-data)))))))

(defun eliscript-mode--refresh-watch-buffers (root)
  "Request diagnostics for live Eliscript buffers below ROOT."
  (dolist (buffer (buffer-list))
    (when (buffer-live-p buffer)
      (with-current-buffer buffer
        (when (and (derived-mode-p 'eliscript-mode)
                   flymake-mode
                   buffer-file-name
                   (file-in-directory-p
                    (file-truename buffer-file-name) root))
          (flymake-start))))))

(defun eliscript-mode--handle-watch-event (process event)
  "Apply validated EVENT received from watch PROCESS."
  (let* ((event-root (file-name-as-directory
                      (file-truename (alist-get 'root event))))
         (expected-root (process-get process 'eliscript-watch-event-root))
         (sequence (alist-get 'sequence event))
         (last-sequence (process-get process 'eliscript-watch-sequence)))
    (when (and expected-root (not (equal expected-root event-root)))
      (signal 'eliscript-mode-error '("project watch root changed")))
    (unless (or (and (null last-sequence) (= sequence 0))
                (and (integerp last-sequence) (> sequence last-sequence)))
      (signal 'eliscript-mode-error '("project watch sequence is not increasing")))
    (process-put process 'eliscript-watch-event-root event-root)
    (process-put process 'eliscript-watch-sequence sequence)
    (run-hook-with-args 'eliscript-mode-watch-event-hook event)
    (when (equal (alist-get 'event event) "change")
      (eliscript-mode--refresh-watch-buffers event-root))))

(defun eliscript-mode--watch-filter (process output)
  "Decode complete watch events from PROCESS OUTPUT."
  (let ((source (concat (or (process-get process 'eliscript-watch-partial) "")
                        output))
        line-end)
    (while (setq line-end (string-match "\n" source))
      (let ((line (substring source 0 line-end)))
        (setq source (substring source (1+ line-end)))
        (unless (string-empty-p line)
          (condition-case error-data
              (eliscript-mode--handle-watch-event
               process (eliscript-mode--watch-event-from-json line))
            (error
             (process-put process 'eliscript-watch-error
                          (error-message-string error-data))
             (delete-process process))))))
    (process-put process 'eliscript-watch-partial source)))

(defun eliscript-mode--watch-sentinel (process _event)
  "Release project ownership after watch PROCESS exits."
  (when (memq (process-status process) '(exit signal failed))
    (let ((root (process-get process 'eliscript-watch-root)))
      (when (eq process (gethash root eliscript-mode--watch-processes))
        (remhash root eliscript-mode--watch-processes)))))

(defun eliscript-mode-watch-project (&optional directory)
  "Start or reuse the watch session containing DIRECTORY."
  (interactive)
  (let* ((context (eliscript-mode--watch-context directory))
         (root (plist-get context :root))
         (existing (gethash root eliscript-mode--watch-processes)))
    (if (process-live-p existing)
        existing
      (let* ((default-directory root)
             (program (eliscript-mode--watch-program))
             (buffer (get-buffer-create
                      (format "*Eliscript watch %s*" root)))
             (process
              (make-process
               :name (format "eliscript-watch:%s" root)
               :buffer buffer
               :stderr buffer
               :command (cons program
                              (eliscript-mode--watch-arguments context))
               :connection-type 'pipe
               :coding 'utf-8-unix
               :noquery t
               :filter #'eliscript-mode--watch-filter
               :sentinel #'eliscript-mode--watch-sentinel)))
        (process-put process 'eliscript-watch-root root)
        (process-put process 'eliscript-watch-partial "")
        (puthash root process eliscript-mode--watch-processes)
        process))))

(defun eliscript-mode-watch-project-p (&optional directory)
  "Return non-nil when DIRECTORY has a live project watch session."
  (let* ((context (eliscript-mode--watch-context directory))
         (process (gethash (plist-get context :root)
                           eliscript-mode--watch-processes)))
    (and (process-live-p process) process)))

(defun eliscript-mode-stop-watch (&optional directory)
  "Stop the project watch session containing DIRECTORY."
  (interactive)
  (let* ((context (eliscript-mode--watch-context directory))
         (root (plist-get context :root))
         (process (gethash root eliscript-mode--watch-processes)))
    (remhash root eliscript-mode--watch-processes)
    (when (process-live-p process)
      (delete-process process))
    (and process t)))

(defun eliscript-mode--build-context ()
  "Return the current file, project root, configuration, and output path."
  (unless buffer-file-name
    (signal 'eliscript-mode-error
            '("project building requires a file-backed buffer")))
  (unless (and (stringp eliscript-mode-build-directory)
               (not (string-empty-p eliscript-mode-build-directory)))
    (signal 'eliscript-mode-error
            '("eliscript-mode-build-directory must be a non-empty path")))
  (let* ((file (expand-file-name buffer-file-name))
         (root (or (eliscript-mode-project-root)
                   (file-name-directory file)))
         (configuration (expand-file-name "eliscript.json" root))
         (configured (file-regular-p configuration))
         (output (if (file-name-absolute-p eliscript-mode-build-directory)
                     eliscript-mode-build-directory
                   (expand-file-name eliscript-mode-build-directory root))))
    (list :file file
          :root root
          :configuration (and configured configuration)
          :output output)))

(defun eliscript-mode--build-arguments (scope)
  "Return public build-command arguments for SCOPE."
  (let* ((context (eliscript-mode--build-context))
         (file (plist-get context :file))
         (root (plist-get context :root))
         (configuration (plist-get context :configuration))
         (output (plist-get context :output))
         (base
          (pcase scope
            ('project
             (unless configuration
               (signal 'eliscript-mode-error
                       '("project compilation requires eliscript.json")))
             (list "--config" configuration))
            ('file
             (if configuration
                 (list "--config" configuration file)
               (list "--root" root "--out-dir" output file)))
            ('buffer
             (append
              (if configuration
                  (list "--config" configuration)
                (list "--root" root "--out-dir" output file))
              (list "--stdin-file" file "--no-cache")))
            (_
             (signal 'eliscript-mode-error
                     (list (format "unsupported build scope: %s" scope)))))))
    (append (cdr eliscript-mode-build-command)
            base
            (list "--diagnostic-format" "human"))))

(defun eliscript-mode--start-build (scope &optional send-buffer)
  "Start an Eliscript build for SCOPE and optionally SEND-BUFFER on stdin."
  (let* ((source-buffer (current-buffer))
         (context (eliscript-mode--build-context))
         (default-directory (plist-get context :root))
         (program (eliscript-mode--build-program))
         (arguments (eliscript-mode--build-arguments scope))
         (command
          (mapconcat #'shell-quote-argument
                     (cons program arguments) " "))
         (buffer-name (format "*Eliscript %s build*" scope))
         (compilation-buffer
          (compilation-start
           command 'eliscript-compilation-mode
           (lambda (_mode) buffer-name))))
    (when send-buffer
      (let ((process (get-buffer-process compilation-buffer)))
        (unless (process-live-p process)
          (signal 'eliscript-mode-error
                  '("builder process did not start")))
        (with-current-buffer source-buffer
          (save-restriction
            (widen)
            (process-send-region process (point-min) (point-max))))
        (process-send-eof process)))
    compilation-buffer))

(defun eliscript-mode-compile-buffer ()
  "Build the project using the current unsaved buffer contents."
  (interactive)
  (eliscript-mode--start-build 'buffer t))

(defun eliscript-mode-compile-file ()
  "Build the visited Eliscript file from its saved contents."
  (interactive)
  (when (buffer-modified-p)
    (signal 'eliscript-mode-error
            '("buffer is modified; save it or use compile-buffer")))
  (eliscript-mode--start-build 'file))

(defun eliscript-mode-compile-project ()
  "Build the configured Eliscript project."
  (interactive)
  (eliscript-mode--start-build 'project))

(defun eliscript-mode-next-error (&optional count reset)
  "Visit the next Eliscript build diagnostic.

With COUNT, move that many diagnostics.  RESET starts from the beginning."
  (interactive "p")
  (next-error count reset))

(defun eliscript-mode-previous-error (&optional count)
  "Visit the previous Eliscript build diagnostic by COUNT entries."
  (interactive "p")
  (previous-error count))

(defun eliscript-mode--check-arguments ()
  "Return project-aware checker arguments for the current buffer."
  (unless buffer-file-name
    (signal 'eliscript-mode-error
            '("project checking requires a file-backed buffer")))
  (let* ((root (or (eliscript-mode-project-root)
                   (file-name-directory (expand-file-name buffer-file-name))))
         (configuration (expand-file-name "eliscript.json" root))
         (project-arguments
          (if (file-regular-p configuration)
              (list "--config" configuration)
            (list "--root" root buffer-file-name))))
    (append (cdr eliscript-mode-check-command)
            project-arguments
            (list "--stdin-file" buffer-file-name
                  "--json" "--diagnostic-format" "json"))))

(defun eliscript-mode--diagnostic-position (position fallback)
  "Convert diagnostic POSITION to a buffer position, or use FALLBACK."
  (let ((offset (and (listp position) (alist-get 'offset position))))
    (if (and (integerp offset) (>= offset 0))
        (min (point-max) (+ (point-min) offset))
      fallback)))

(defun eliscript-mode--diagnostic-from-json (source)
  "Return a Flymake diagnostic decoded from JSON SOURCE, or nil."
  (condition-case nil
      (let* ((value (json-parse-string source
                                       :object-type 'alist
                                       :array-type 'list
                                       :null-object nil
                                       :false-object nil))
             (location (alist-get 'location value))
             (filename (alist-get 'file location))
             (same-file
              (or (null filename)
                  (and buffer-file-name
                       (equal (ignore-errors (file-truename filename))
                              (ignore-errors
                                (file-truename buffer-file-name)))))))
        (when (and (equal (alist-get 'format value) "eliscript-diagnostic")
                   (= (or (alist-get 'version value) 0) 1)
                   same-file)
          (let* ((start (eliscript-mode--diagnostic-position
                         (alist-get 'start location) (point-min)))
                 (raw-end (eliscript-mode--diagnostic-position
                           (alist-get 'end location) start))
                 (end (max start (min (point-max) raw-end)))
                 (severity (alist-get 'severity value))
                 (type (cond
                         ((equal severity "warning") :warning)
                         ((equal severity "info") :note)
                         (t :error))))
            (flymake-make-diagnostic
             (current-buffer) start end type
             (format "%s: %s"
                     (or (alist-get 'code value) "ELI-C0001")
                     (or (alist-get 'message value)
                         "Eliscript check failed"))))))
    (error nil)))

(defun eliscript-mode--stop-flymake-process ()
  "Stop the checker process owned by the current buffer."
  (when (process-live-p eliscript-mode--flymake-process)
    (kill-process eliscript-mode--flymake-process))
  (setq eliscript-mode--flymake-process nil))

(defun eliscript-mode-flymake-backend (report-fn &rest _arguments)
  "Check the current project asynchronously and call REPORT-FN."
  (eliscript-mode--stop-flymake-process)
  (let* ((source-buffer (current-buffer))
         (generation (buffer-chars-modified-tick))
         (output-buffer (generate-new-buffer " *eliscript-check-output*"))
         (error-buffer (generate-new-buffer " *eliscript-check-error*"))
         (program (eliscript-mode--check-program))
         (command (cons program (eliscript-mode--check-arguments)))
         process
         stderr-process
         finished-process
         stderr-complete
         reported
         finish-fn)
    (setq
     finish-fn
     (lambda ()
       (when (and finished-process stderr-complete (not reported))
         (setq reported t)
         (unwind-protect
             (when (buffer-live-p source-buffer)
               (with-current-buffer source-buffer
                 (when (and
                        (eq finished-process
                            eliscript-mode--flymake-process)
                        (= generation (buffer-chars-modified-tick)))
                   (setq eliscript-mode--flymake-process nil)
                   (if (and
                        (eq (process-status finished-process) 'exit)
                        (zerop (process-exit-status finished-process)))
                       (funcall report-fn nil)
                     (let* ((json-source
                             (with-current-buffer error-buffer
                               (string-trim (buffer-string))))
                            (diagnostic
                             (eliscript-mode--diagnostic-from-json
                              json-source)))
                       (funcall report-fn
                                (if diagnostic (list diagnostic) nil)))))))
           (when (buffer-live-p output-buffer)
             (kill-buffer output-buffer))
           (when (buffer-live-p error-buffer)
             (kill-buffer error-buffer))))))
    (condition-case error-data
        (progn
          (setq stderr-process
                (make-pipe-process
                 :name "eliscript-check-stderr"
                 :buffer error-buffer
                 :coding 'utf-8-unix
                 :noquery t
                 :sentinel
                 (lambda (finished _event)
                   (when (memq (process-status finished)
                               '(exit signal closed failed))
                     (setq stderr-complete t)
                     (funcall finish-fn)))))
          (setq process
                (make-process
                 :name "eliscript-check"
                 :buffer output-buffer
                 :stderr stderr-process
                 :command command
                 :connection-type 'pipe
                 :coding 'utf-8-unix
                 :noquery t
                 :sentinel
                 (lambda (finished _event)
                   (when (memq (process-status finished) '(exit signal))
                     (setq finished-process finished)
                     (funcall finish-fn)))))
          (setq eliscript-mode--flymake-process process)
          (save-restriction
            (widen)
            (process-send-region process (point-min) (point-max)))
          (process-send-eof process))
      (error
       (setq eliscript-mode--flymake-process nil)
       (when (process-live-p process) (kill-process process))
       (when (and (processp stderr-process)
                  (process-live-p stderr-process))
         (delete-process stderr-process))
       (when (buffer-live-p output-buffer) (kill-buffer output-buffer))
       (when (buffer-live-p error-buffer) (kill-buffer error-buffer))
       (signal (car error-data) (cdr error-data))))))

(defun eliscript-mode-check-buffer ()
  "Check the current project and expose diagnostics through Flymake."
  (interactive)
  (unless flymake-mode (flymake-mode 1))
  (flymake-start))

(defun eliscript-mode--read-file (filename)
  "Return the complete contents of FILENAME as a string."
  (with-temp-buffer
    (insert-file-contents filename)
    (buffer-string)))

(defun eliscript-mode-format-buffer ()
  "Format the current buffer with the public self-hosted formatter.

The visited file is not saved.  On failure the buffer remains unchanged."
  (interactive)
  (barf-if-buffer-read-only)
  (let ((program (eliscript-mode--formatter-program))
        (arguments (cdr eliscript-mode-format-command))
        (source-file (make-temp-file "eliscript-mode-" nil ".eli"))
        (error-file (make-temp-file "eliscript-mode-error-"))
        (output-buffer (generate-new-buffer " *eliscript-format*"))
        status)
    (unwind-protect
        (progn
          (save-restriction
            (widen)
            (let ((coding-system-for-write 'utf-8-unix))
              (write-region (point-min) (point-max) source-file nil 'silent)))
          (let ((default-directory
                 (or (eliscript-mode-project-root) default-directory)))
            (setq status
                  (apply #'process-file program nil
                         (list output-buffer error-file) nil
                         (append arguments (list source-file)))))
          (unless (and (integerp status) (zerop status))
            (let ((detail (string-trim
                           (eliscript-mode--read-file error-file))))
              (signal 'eliscript-mode-error
                      (list (if (string-empty-p detail)
                                (format "formatter exited with status %s" status)
                              detail)))))
          (save-restriction
            (widen)
            (unless (string= (buffer-string)
                             (with-current-buffer output-buffer
                               (buffer-string)))
              (replace-region-contents
               (point-min) (point-max)
               (if (< emacs-major-version 31)
                   (lambda () output-buffer)
                 output-buffer))
              t)))
      (when (buffer-live-p output-buffer)
        (kill-buffer output-buffer))
      (delete-file source-file)
      (delete-file error-file))))

;;;###autoload
(define-derived-mode eliscript-mode prog-mode "Eliscript"
  "Major mode for editing Eliscript source."
  :syntax-table eliscript-mode-syntax-table
  (setq-local comment-start "; ")
  (setq-local comment-end "")
  (setq-local comment-start-skip ";+\s-*")
  (setq-local indent-tabs-mode nil)
  (setq-local indent-line-function #'eliscript-mode--indent-line)
  (setq-local font-lock-defaults '(eliscript-mode-font-lock-keywords))
  (setq-local imenu-generic-expression
              eliscript-mode-imenu-generic-expression)
  (setq-local beginning-of-defun-function
              #'eliscript-mode--beginning-of-defun)
  (setq-local end-of-defun-function #'eliscript-mode--end-of-defun)
  (setq-local parse-sexp-ignore-comments t)
  (add-hook 'flymake-diagnostic-functions
            #'eliscript-mode-flymake-backend nil t)
  (add-hook 'kill-buffer-hook #'eliscript-mode--stop-flymake-process nil t))

;;;###autoload
(add-to-list 'auto-mode-alist '("\\.eli\\'" . eliscript-mode))

(require 'eliscript-repl)

(provide 'eliscript-mode)

;;; eliscript-mode.el ends here
