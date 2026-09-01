;;; eliscript-mode.el --- Major mode for Eliscript source -*- lexical-binding: t; -*-

;;; Commentary:

;; Syntax-aware editing, navigation, project discovery, and formatter
;; integration for Eliscript source files.

;;; Code:

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

(define-error 'eliscript-mode-error "Eliscript editor integration error")

(defconst eliscript-mode--function-heads
  '("defasync" "defcomponent" "defn" "defportable" "defun"))

(defconst eliscript-mode--macro-heads '("defmacro"))

(defconst eliscript-mode--variable-heads '("defconst" "defvar"))

(defconst eliscript-mode--top-level-heads
  '("defasync" "defcomponent" "defconst" "defmacro" "defn"
    "defportable" "defun" "defvar" "export" "export-default"
    "import" "import-portable" "module"))

(defconst eliscript-mode--special-heads
  '("and" "apply" "async" "await" "catch" "cond" "do" "finally"
    "fn" "fragment" "funcall" "if" "js*" "js-array" "js-call"
    "js-cons" "js-length" "js-nth" "js-object" "jsx" "lambda" "let"
    "let*" "loop" "new" "or" "progn" "quote" "recur" "set!" "setq"
    "throw" "try" "unless" "when" "while"))

(defconst eliscript-mode--definition-heads
  (append eliscript-mode--function-heads
          eliscript-mode--macro-heads
          eliscript-mode--variable-heads))

(defconst eliscript-mode--name-regexp "\\([^][(){}\"; \t\r\n]+\\)")

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
    map)
  "Keymap used by `eliscript-mode'.")

(defvar-local eliscript-mode--flymake-process nil)

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
         process)
    (condition-case error-data
        (progn
          (setq process
                (make-process
                 :name "eliscript-check"
                 :buffer output-buffer
                 :stderr error-buffer
                 :command command
                 :connection-type 'pipe
                 :coding 'utf-8-unix
                 :noquery t
                 :sentinel
                 (lambda (finished _event)
                   (when (memq (process-status finished) '(exit signal))
                     (unwind-protect
                         (when (buffer-live-p source-buffer)
                           (with-current-buffer source-buffer
                             (when (and
                                    (eq finished
                                        eliscript-mode--flymake-process)
                                    (= generation
                                       (buffer-chars-modified-tick)))
                               (setq eliscript-mode--flymake-process nil)
                               (if (and
                                    (eq (process-status finished) 'exit)
                                    (zerop (process-exit-status finished)))
                                   (funcall report-fn nil)
                                 (let* ((json-source
                                         (with-current-buffer error-buffer
                                           (string-trim (buffer-string))))
                                        (diagnostic
                                         (eliscript-mode--diagnostic-from-json
                                          json-source)))
                                   (funcall report-fn
                                            (if diagnostic
                                                (list diagnostic)
                                              nil)))))))
                       (when (buffer-live-p output-buffer)
                         (kill-buffer output-buffer))
                       (when (buffer-live-p error-buffer)
                         (kill-buffer error-buffer)))))))
          (setq eliscript-mode--flymake-process process)
          (save-restriction
            (widen)
            (process-send-region process (point-min) (point-max)))
          (process-send-eof process))
      (error
       (setq eliscript-mode--flymake-process nil)
       (when (process-live-p process) (kill-process process))
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

(provide 'eliscript-mode)

;;; eliscript-mode.el ends here
