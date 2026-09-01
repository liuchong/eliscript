;;; eliscript-repl.el --- Persistent evaluation for eliscript-mode -*- lexical-binding: t; -*-

;;; Commentary:

;; Project-scoped NDJSON evaluation sessions for the maintained major mode.

;;; Code:

(require 'cl-lib)
(require 'compile)
(require 'json)
(require 'seq)
(require 'subr-x)

(declare-function eliscript-mode-project-root "eliscript-mode")
(declare-function eliscript-mode--current-definition-start "eliscript-mode")
(defvar eliscript-mode-eval-command)

(defconst eliscript-repl--result-format "eliscript-evaluation-result")
(defconst eliscript-repl--result-version 1)

(defconst eliscript-repl--compilation-regexp
  '(eliscript-evaluation
    "^eliscript-eval: \\(.+\\):\\([0-9]+\\):\\([0-9]+\\): " 1 2 3)
  "Compilation regexp for located evaluation diagnostics.")

(add-to-list 'compilation-error-regexp-alist-alist
             eliscript-repl--compilation-regexp)

(define-compilation-mode eliscript-repl-mode "Eliscript-REPL"
  "Compilation-derived mode for Eliscript evaluation values and failures."
  (setq-local compilation-error-regexp-alist '(eliscript-evaluation)))

(cl-defstruct (eliscript-repl--pending
               (:constructor eliscript-repl--pending-create))
  id
  payload
  callback
  source-buffer
  internal)

(cl-defstruct (eliscript-repl--session
               (:constructor eliscript-repl--session-create))
  root
  process
  process-buffer
  error-buffer
  fragment
  pending
  next-id
  generation
  state
  stopped
  restart-failures
  queue
  recovery
  result-buffer)

(defvar eliscript-repl--sessions (make-hash-table :test #'equal))

(defun eliscript-repl--canonical-root (&optional directory)
  "Return the canonical session root for DIRECTORY or the current buffer."
  (file-name-as-directory
   (expand-file-name
    (or (eliscript-mode-project-root directory)
        (and buffer-file-name (file-name-directory buffer-file-name))
        default-directory))))

(defun eliscript-repl--program ()
  "Resolve and validate `eliscript-mode-eval-command'."
  (unless (and (consp eliscript-mode-eval-command)
               (seq-every-p #'stringp eliscript-mode-eval-command)
               (not (string-empty-p (car eliscript-mode-eval-command))))
    (signal 'eliscript-mode-error
            '("eliscript-mode-eval-command must be non-empty strings")))
  (let* ((configured (car eliscript-mode-eval-command))
         (program (if (file-name-absolute-p configured)
                      (and (file-executable-p configured) configured)
                    (executable-find configured))))
    (or program
        (signal 'eliscript-mode-error
                (list (format "evaluator executable not found: %s"
                              configured))))))

(defun eliscript-repl--new-session (root)
  "Create and register an inactive evaluation session for ROOT."
  (let ((session
         (eliscript-repl--session-create
          :root root
          :fragment ""
          :pending (make-hash-table :test #'eql)
          :next-id 0
          :generation 0
          :state 'inactive
          :stopped nil
          :restart-failures 0
          :queue nil
          :recovery nil)))
    (puthash root session eliscript-repl--sessions)
    session))

(defun eliscript-repl--session (&optional root)
  "Return the project session for ROOT, creating it when necessary."
  (let ((key (or root (eliscript-repl--canonical-root))))
    (or (gethash key eliscript-repl--sessions)
        (eliscript-repl--new-session key))))

(defun eliscript-repl--result-buffer (session)
  "Return the evaluation result buffer owned by SESSION."
  (or (and (buffer-live-p (eliscript-repl--session-result-buffer session))
           (eliscript-repl--session-result-buffer session))
      (let* ((root (directory-file-name (eliscript-repl--session-root session)))
             (name (format "*Eliscript REPL: %s*" (file-name-nondirectory root)))
             (buffer (get-buffer-create name)))
        (with-current-buffer buffer
          (unless (derived-mode-p 'eliscript-repl-mode)
            (eliscript-repl-mode))
          (setq-local default-directory (eliscript-repl--session-root session)))
        (setf (eliscript-repl--session-result-buffer session) buffer)
        buffer)))

(defun eliscript-repl--diagnostic-position (diagnostic)
  "Return FILE, LINE, and COLUMN from structured DIAGNOSTIC."
  (let* ((location (alist-get 'location diagnostic))
         (start (and (listp location) (alist-get 'start location)))
         (file (and (listp location) (alist-get 'file location)))
         (line (or (and (listp start) (alist-get 'line start))
                   (and (listp location) (alist-get 'line location))
                   1))
         (column (or (and (listp start) (alist-get 'column start))
                     (and (listp location) (alist-get 'column location))
                     1)))
    (and (stringp file) (list file line column))))

(defun eliscript-repl--insert-result (session result)
  "Append structured RESULT to SESSION's result buffer."
  (let ((buffer (eliscript-repl--result-buffer session))
        (inhibit-read-only t)
        (status (alist-get 'status result))
        (operation (alist-get 'operation result)))
    (with-current-buffer buffer
      (goto-char (point-max))
      (insert (format "\n[%s #%s revision %s]\n"
                      operation
                      (or (alist-get 'id result) "-")
                      (or (alist-get 'revision result) 0)))
      (when-let* ((stdout (alist-get 'stdout result))
                  ((not (string-empty-p stdout))))
        (insert stdout)
        (unless (string-suffix-p "\n" stdout) (insert "\n")))
      (if (string-equal status "ok")
          (let ((kind (alist-get 'kind result)))
            (cond
             ((and (alist-get 'hasValue result)
                   (stringp (alist-get 'value result)))
              (insert (alist-get 'value result) "\n"))
             ((string-equal kind "module")
              (insert (format "loaded %d bindings\n"
                              (length (alist-get 'bindings result)))))
             ((string-equal kind "reset") (insert "session reset\n"))
             ((string-equal kind "capabilities") (insert "session ready\n"))))
        (let* ((diagnostic (alist-get 'diagnostic result))
               (position (eliscript-repl--diagnostic-position diagnostic))
               (message (or (alist-get 'message diagnostic)
                            "evaluation failed")))
          (if position
              (insert (format "eliscript-eval: %s:%d:%d: %s\n"
                              (nth 0 position) (nth 1 position)
                              (nth 2 position) message))
            (insert (format "eliscript-eval: %s\n" message)))))
      (goto-char (point-max)))
    (if (string-equal status "ok")
        (when-let* ((value (alist-get 'value result)))
          (message "Eliscript => %s" value))
      (setq next-error-last-buffer buffer)
      (display-buffer buffer))))

(defun eliscript-repl--synthetic-restart-result (pending revision)
  "Return a restart failure result for PENDING at REVISION."
  `((format . ,eliscript-repl--result-format)
    (version . ,eliscript-repl--result-version)
    (id . ,(eliscript-repl--pending-id pending))
    (operation . ,(alist-get 'operation
                             (eliscript-repl--pending-payload pending)))
    (revision . ,revision)
    (status . "error")
    (diagnostic
     (format . "eliscript-diagnostic")
     (version . 1)
     (code . "ELI-E0003")
     (severity . "error")
     (phase . "evaluation-session")
     (message . "evaluation process restarted before acknowledging the request"))))

(defun eliscript-repl--remember-result (session pending result)
  "Update SESSION recovery state from acknowledged PENDING and RESULT."
  (unless (or (eliscript-repl--pending-internal pending)
              (not (string-equal (alist-get 'status result) "ok")))
    (let ((operation (alist-get 'operation result))
          (kind (alist-get 'kind result))
          (payload (copy-tree (eliscript-repl--pending-payload pending))))
      (setf (alist-get 'id payload) nil)
      (cond
       ((string-equal operation "load")
        (setf (eliscript-repl--session-recovery session)
              (list (cons nil payload))))
       ((and (string-equal operation "evaluate")
             (string-equal kind "definition"))
        (let ((binding (alist-get 'binding result)))
          (setf (eliscript-repl--session-recovery session)
                (append
                 (cl-remove binding
                            (eliscript-repl--session-recovery session)
                            :key #'car :test #'equal)
                 (list (cons binding payload))))))
       ((string-equal operation "reset")
        (setf (eliscript-repl--session-recovery session) nil))))))

(defun eliscript-repl--valid-result-p (result)
  "Return non-nil when RESULT has the supported protocol identity."
  (and (listp result)
       (string-equal (alist-get 'format result) eliscript-repl--result-format)
       (= (or (alist-get 'version result) -1) eliscript-repl--result-version)
       (integerp (alist-get 'id result))))

(defun eliscript-repl--handle-result (session result)
  "Deliver one parsed protocol RESULT for SESSION."
  (if (not (eliscript-repl--valid-result-p result))
      (eliscript-repl--insert-result
       session
       `((format . ,eliscript-repl--result-format)
         (version . ,eliscript-repl--result-version)
         (id . 0) (operation . "unknown") (revision . 0)
         (status . "error")
         (diagnostic
          (message . "invalid evaluation protocol result"))))
    (setf (eliscript-repl--session-restart-failures session) 0)
    (let* ((id (alist-get 'id result))
           (pending (gethash id (eliscript-repl--session-pending session))))
      (when pending
        (remhash id (eliscript-repl--session-pending session))
        (eliscript-repl--remember-result session pending result)
        (unless (and (eliscript-repl--pending-internal pending)
                     (string-equal (alist-get 'status result) "ok"))
          (eliscript-repl--insert-result session result))
        (when-let* ((callback (eliscript-repl--pending-callback pending)))
          (if-let* ((buffer (eliscript-repl--pending-source-buffer pending)))
              (when (buffer-live-p buffer)
                (with-current-buffer buffer (funcall callback result)))
            (funcall callback result)))))))

(defun eliscript-repl--process-filter (process output)
  "Consume NDJSON OUTPUT from evaluation PROCESS."
  (when-let* ((session (process-get process 'eliscript-repl-session)))
    (when (eq process (eliscript-repl--session-process session))
      (let* ((text (concat (eliscript-repl--session-fragment session) output))
             (lines (split-string text "\n"))
             (complete (butlast lines))
             (fragment (car (last lines))))
        (setf (eliscript-repl--session-fragment session) fragment)
        (dolist (line complete)
          (unless (string-empty-p line)
            (condition-case error-data
                (eliscript-repl--handle-result
                 session
                 (json-parse-string
                  line :object-type 'alist :array-type 'list
                  :null-object nil :false-object :false))
              (error
               (eliscript-repl--insert-result
                session
                `((format . ,eliscript-repl--result-format)
                  (version . ,eliscript-repl--result-version)
                  (id . 0) (operation . "unknown") (revision . 0)
                  (status . "error")
                  (diagnostic
                   (message . ,(format "invalid evaluation protocol JSON: %s"
                                       (error-message-string error-data))))))))))))))

(defun eliscript-repl--cleanup-process-buffers (session)
  "Kill transient process buffers owned by SESSION."
  (dolist (buffer (list (eliscript-repl--session-process-buffer session)
                        (eliscript-repl--session-error-buffer session)))
    (when (buffer-live-p buffer) (kill-buffer buffer)))
  (setf (eliscript-repl--session-process-buffer session) nil
        (eliscript-repl--session-error-buffer session) nil))

(defun eliscript-repl--process-sentinel (process _event)
  "Recover SESSION when evaluation PROCESS exits unexpectedly."
  (when-let* ((session (process-get process 'eliscript-repl-session)))
    (when (and (eq process (eliscript-repl--session-process session))
               (memq (process-status process) '(exit signal)))
      (setf (eliscript-repl--session-process session) nil
            (eliscript-repl--session-state session) 'inactive)
      (maphash
       (lambda (_id pending)
         (let ((result
                (eliscript-repl--synthetic-restart-result pending 0)))
           (unless (eliscript-repl--pending-internal pending)
             (eliscript-repl--insert-result session result)
             (when-let* ((callback
                          (eliscript-repl--pending-callback pending)))
               (funcall callback result)))))
       (eliscript-repl--session-pending session))
      (clrhash (eliscript-repl--session-pending session))
      (eliscript-repl--cleanup-process-buffers session)
      (unless (eliscript-repl--session-stopped session)
        (cl-incf (eliscript-repl--session-restart-failures session))
        (if (<= (eliscript-repl--session-restart-failures session) 1)
            (run-at-time 0.05 nil #'eliscript-repl--start session)
          (eliscript-repl--insert-result
           session
           `((format . ,eliscript-repl--result-format)
             (version . ,eliscript-repl--result-version)
             (id . 0) (operation . "restart") (revision . 0)
             (status . "error")
             (diagnostic
              (message . "evaluation process failed to restart")))))))))

(defun eliscript-repl--write (session pending)
  "Write PENDING request to ready SESSION."
  (let* ((process (eliscript-repl--session-process session))
         (id (cl-incf (eliscript-repl--session-next-id session)))
         (payload (copy-tree (eliscript-repl--pending-payload pending))))
    (setf (eliscript-repl--pending-id pending) id
          (alist-get 'id payload) id)
    (puthash id pending (eliscript-repl--session-pending session))
    (process-send-string
     process
     (concat (json-serialize payload :null-object nil :false-object :false)
             "\n"))))

(defun eliscript-repl--drain (session)
  "Send queued user requests after SESSION becomes ready."
  (let ((queued (nreverse (eliscript-repl--session-queue session))))
    (setf (eliscript-repl--session-queue session) nil)
    (dolist (pending queued) (eliscript-repl--write session pending))))

(defun eliscript-repl--restore (session requests)
  "Replay acknowledged REQUESTS before making SESSION ready."
  (if (null requests)
      (progn
        (setf (eliscript-repl--session-state session) 'ready)
        (eliscript-repl--drain session))
    (let ((pending
           (eliscript-repl--pending-create
            :payload (copy-tree (cdar requests))
            :internal t
            :callback
            (lambda (result)
              (if (string-equal (alist-get 'status result) "ok")
                  (eliscript-repl--restore session (cdr requests))
                (setf (eliscript-repl--session-state session) 'ready)
                (eliscript-repl--drain session))))))
      (eliscript-repl--write session pending))))

(defun eliscript-repl--start (session)
  "Start SESSION and restore its last acknowledged namespace."
  (unless (process-live-p (eliscript-repl--session-process session))
    (let* ((default-directory (eliscript-repl--session-root session))
           (program (eliscript-repl--program))
           (command (cons program (cdr eliscript-mode-eval-command)))
           (process-buffer (generate-new-buffer " *eliscript-eval-output*"))
           (error-buffer (generate-new-buffer " *eliscript-eval-error*")))
      (condition-case error-data
          (let ((process
                 (make-process
                  :name "eliscript-eval"
                  :buffer process-buffer
                  :stderr error-buffer
                  :command command
                  :connection-type 'pipe
                  :coding 'utf-8-unix
                  :noquery t
                  :filter #'eliscript-repl--process-filter
                  :sentinel #'eliscript-repl--process-sentinel)))
            (process-put process 'eliscript-repl-session session)
            (setf (eliscript-repl--session-process session) process
                  (eliscript-repl--session-process-buffer session) process-buffer
                  (eliscript-repl--session-error-buffer session) error-buffer
                  (eliscript-repl--session-fragment session) ""
                  (eliscript-repl--session-stopped session) nil
                  (eliscript-repl--session-state session) 'restoring)
            (cl-incf (eliscript-repl--session-generation session))
            (eliscript-repl--restore
             session (copy-tree (eliscript-repl--session-recovery session))))
        (error
         (when (buffer-live-p process-buffer) (kill-buffer process-buffer))
         (when (buffer-live-p error-buffer) (kill-buffer error-buffer))
         (signal (car error-data) (cdr error-data))))))
  session)

(defun eliscript-repl--submit (payload &optional callback)
  "Submit evaluation PAYLOAD and invoke CALLBACK with its result."
  (let* ((session (eliscript-repl--session))
         (pending
          (eliscript-repl--pending-create
           :payload payload
           :callback callback
           :source-buffer (current-buffer))))
    (unless (process-live-p (eliscript-repl--session-process session))
      (eliscript-repl--start session))
    (if (eq (eliscript-repl--session-state session) 'ready)
        (eliscript-repl--write session pending)
      (push pending (eliscript-repl--session-queue session)))
    session))

(defun eliscript-repl--source-request (operation source filename line column)
  "Build an OPERATION request for SOURCE at FILENAME, LINE, and COLUMN."
  `((operation . ,operation)
    (source . ,source)
    (filename . ,filename)
    (root . ,(eliscript-repl--canonical-root))
    (line . ,line)
    (column . ,column)))

(defun eliscript-mode-eval-region (start end)
  "Evaluate the Eliscript form in region START through END."
  (interactive "r")
  (let ((filename (or buffer-file-name
                      (expand-file-name
                       (concat (buffer-name) ".eli") default-directory)))
        line column source)
    (save-restriction
      (widen)
      (setq source (buffer-substring-no-properties start end))
      (save-excursion
        (goto-char start)
        (setq line (line-number-at-pos)
              column (1+ (current-column)))))
    (eliscript-repl--submit
     (eliscript-repl--source-request
      "evaluate" source filename line column))))

(defun eliscript-mode-eval-last-form ()
  "Evaluate the complete Eliscript form preceding point."
  (interactive)
  (let (start end)
    (save-excursion
      (skip-chars-backward " \t\r\n")
      (setq end (point)
            start (condition-case nil (scan-sexps end -1)
                    (scan-error nil))))
    (unless start
      (signal 'eliscript-mode-error
              '("no complete Eliscript form precedes point")))
    (eliscript-mode-eval-region start end)))

(defun eliscript-mode-eval-buffer ()
  "Load the current unsaved buffer into its project evaluation session."
  (interactive)
  (unless buffer-file-name
    (signal 'eliscript-mode-error
            '("buffer evaluation requires a file-backed buffer")))
  (let (source)
    (save-restriction
      (widen)
      (setq source (buffer-substring-no-properties (point-min) (point-max))))
    (eliscript-repl--submit
     (eliscript-repl--source-request
      "load" source (expand-file-name buffer-file-name) 1 1))))

(defun eliscript-mode-eval-defun ()
  "Reload the current unsaved buffer as the definition namespace."
  (interactive)
  (unless (eliscript-mode--current-definition-start)
    (signal 'eliscript-mode-error
            '("point is not inside an Eliscript definition")))
  (eliscript-mode-eval-buffer))

(defun eliscript-mode-show-repl ()
  "Display the current project's evaluation result buffer."
  (interactive)
  (display-buffer
   (eliscript-repl--result-buffer (eliscript-repl--session))))

(defun eliscript-mode-stop-repl ()
  "Stop and forget the current project's evaluation session."
  (interactive)
  (let* ((root (eliscript-repl--canonical-root))
         (session (gethash root eliscript-repl--sessions)))
    (when session
      (setf (eliscript-repl--session-stopped session) t
            (eliscript-repl--session-recovery session) nil
            (eliscript-repl--session-queue session) nil)
      (when (process-live-p (eliscript-repl--session-process session))
        (delete-process (eliscript-repl--session-process session)))
      (eliscript-repl--cleanup-process-buffers session)
      (remhash root eliscript-repl--sessions)
      (message "Eliscript evaluation session stopped"))))

(provide 'eliscript-repl)

;;; eliscript-repl.el ends here
