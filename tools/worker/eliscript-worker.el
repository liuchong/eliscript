;;; eliscript-worker.el --- Long-lived Eliscript worker client -*- lexical-binding: t; -*-

;;; Commentary:

;; Communicate with runtime/worker.mjs over versioned newline-delimited JSON.

;;; Code:

(require 'cl-lib)
(require 'json)
(require 'subr-x)
(require 'url-parse)
(require 'url-util)

(define-error 'eliscript-worker-error "Eliscript worker error")
(define-error 'eliscript-worker-protocol-error "Eliscript worker protocol error"
  'eliscript-worker-error)
(define-error 'eliscript-worker-request-error "Eliscript worker request error"
  'eliscript-worker-error)
(define-error 'eliscript-worker-timeout "Eliscript worker request timed out"
  'eliscript-worker-error)

(defgroup eliscript-worker nil
  "Long-lived JavaScript workers for portable Eliscript code."
  :group 'applications)

(defconst eliscript-worker-protocol-version 1
  "Protocol version implemented by this client.")

(defconst eliscript-worker--project-directory
  (expand-file-name
   "../.."
   (file-name-directory (or load-file-name buffer-file-name)))
  "Eliscript project directory inferred from this library.")

(defcustom eliscript-worker-program "bun"
  "JavaScript executable used to start the Eliscript worker."
  :type 'string
  :group 'eliscript-worker)

(defcustom eliscript-worker-startup-timeout 5.0
  "Seconds to wait for the worker ready message."
  :type 'number
  :group 'eliscript-worker)

(defcustom eliscript-worker-auto-restart t
  "Whether a stopped worker should restart before its next request."
  :type 'boolean
  :group 'eliscript-worker)

(cl-defstruct (eliscript-worker-request
               (:constructor eliscript-worker-request--create))
  callback
  progress
  metrics
  timer
  done
  value
  error)

(cl-defstruct (eliscript-worker
               (:constructor eliscript-worker--create))
  process
  command
  auto-restart
  stderr-buffer
  stderr-output
  receive-buffer
  pending
  module-versions
  next-id
  state
  generation
  restart-count
  last-exit
  capabilities
  protocol-error)

(defun eliscript-worker--script ()
  "Return the absolute worker runtime path."
  (expand-file-name "runtime/worker.mjs" eliscript-worker--project-directory))

(defun eliscript-worker-live-p (worker)
  "Return non-nil when WORKER has a live process."
  (process-live-p (eliscript-worker-process worker)))

(defun eliscript-worker-stderr (worker)
  "Return captured stderr output for WORKER."
  (let ((buffer (eliscript-worker-stderr-buffer worker)))
    (concat
     (or (eliscript-worker-stderr-output worker) "")
     (if (buffer-live-p buffer)
         (with-current-buffer buffer (buffer-string))
       ""))))

(defun eliscript-worker--capture-stderr (worker)
  "Retain and release WORKER's current stderr buffer."
  (let ((buffer (eliscript-worker-stderr-buffer worker)))
    (when (buffer-live-p buffer)
      (setf (eliscript-worker-stderr-output worker)
            (concat (or (eliscript-worker-stderr-output worker) "")
                    (with-current-buffer buffer (buffer-string))))
      (kill-buffer buffer))
    (setf (eliscript-worker-stderr-buffer worker) nil)))

(defun eliscript-worker--error-message (error-object)
  "Return a readable message from protocol ERROR-OBJECT."
  (or (alist-get 'message error-object)
      "unknown worker error"))

(defun eliscript-worker-error-location (error-object)
  "Return structured source location from protocol ERROR-OBJECT."
  (alist-get 'location error-object))

(defun eliscript-worker-format-error (error-object)
  "Format protocol ERROR-OBJECT with its best source location."
  (let* ((message (eliscript-worker--error-message error-object))
         (location (eliscript-worker-error-location error-object))
         (file (and location (alist-get 'file location)))
         (line (and location (alist-get 'line location)))
         (column (and location (alist-get 'column location))))
    (if (and file line column)
        (format "%s:%s:%s: %s" file line column message)
      message)))

(defun eliscript-worker--finish-request (worker id value error-object timing)
  "Complete request ID on WORKER with VALUE, ERROR-OBJECT, and TIMING."
  (let ((request (gethash id (eliscript-worker-pending worker))))
    (when request
      (remhash id (eliscript-worker-pending worker))
      (when (timerp (eliscript-worker-request-timer request))
        (cancel-timer (eliscript-worker-request-timer request)))
      (setf (eliscript-worker-request-done request) t
            (eliscript-worker-request-value request) value
            (eliscript-worker-request-error request) error-object)
      (when (eliscript-worker-request-metrics request)
        (condition-case callback-error
            (funcall (eliscript-worker-request-metrics request) timing)
          (error
           (message "Eliscript worker metrics callback failed: %s"
                    (error-message-string callback-error)))))
      (when (eliscript-worker-request-callback request)
        (condition-case callback-error
            (funcall
             (eliscript-worker-request-callback request)
             value error-object)
          (error
           (message "Eliscript worker callback failed: %s"
                    (error-message-string callback-error))))))))

(defun eliscript-worker--fail-pending (worker code message)
  "Fail every pending request on WORKER with CODE and MESSAGE."
  (let (ids)
    (maphash (lambda (id _request) (push id ids))
             (eliscript-worker-pending worker))
    (dolist (id ids)
      (eliscript-worker--finish-request
       worker id nil `((code . ,code) (message . ,message)) nil))))

(defun eliscript-worker--handle-message (worker message)
  "Apply one parsed protocol MESSAGE to WORKER."
  (let ((version (alist-get 'version message))
        (type (alist-get 'type message)))
    (unless (= version eliscript-worker-protocol-version)
      (signal 'eliscript-worker-protocol-error
              (list (format "worker protocol version mismatch: %S" version))))
    (cond
     ((equal type "ready")
      (setf (eliscript-worker-state worker) 'ready
            (eliscript-worker-capabilities worker)
            (append (alist-get 'capabilities message) nil)))
     ((equal type "response")
      (if (eq (alist-get 'ok message) t)
          (eliscript-worker--finish-request
           worker (alist-get 'id message) (alist-get 'value message) nil
           (alist-get 'timing message))
        (eliscript-worker--finish-request
         worker (alist-get 'id message) nil (alist-get 'error message)
         (alist-get 'timing message))))
     ((equal type "progress")
      (let* ((id (alist-get 'id message))
             (request (gethash id (eliscript-worker-pending worker)))
             (progress (and request
                            (eliscript-worker-request-progress request))))
        (when progress
          (condition-case callback-error
              (funcall progress (alist-get 'value message))
            (error
             (message "Eliscript worker progress callback failed: %s"
                      (error-message-string callback-error)))))))
     ((equal type "protocol-error")
      (let ((id (alist-get 'id message))
            (error-object (alist-get 'error message)))
        (if (and id (gethash id (eliscript-worker-pending worker)))
            (eliscript-worker--finish-request worker id nil error-object nil)
          (setf (eliscript-worker-protocol-error worker) error-object)
          (message "Eliscript worker protocol error: %s"
                   (eliscript-worker--error-message error-object)))))
     ((member type '("cancel" "shutdown")) nil)
     (t
      (signal 'eliscript-worker-protocol-error
              (list (format "unknown worker message type: %S" type)))))))

(defun eliscript-worker--filter (process output)
  "Process NDJSON OUTPUT from worker PROCESS."
  (let ((worker (process-get process 'eliscript-worker)))
    (when worker
      (condition-case error-data
          (let ((buffer (concat (eliscript-worker-receive-buffer worker)
                                output))
                newline)
            (while (setq newline (string-match "\n" buffer))
              (let ((line (substring buffer 0 newline)))
                (setq buffer (substring buffer (1+ newline)))
                (unless (string-empty-p line)
                  (eliscript-worker--handle-message
                   worker
                   (json-parse-string
                    line
                    :object-type 'alist
                    :array-type 'array
                    :null-object nil
                    :false-object :false)))))
            (setf (eliscript-worker-receive-buffer worker) buffer))
        (error
         (setf (eliscript-worker-protocol-error worker)
               `((code . "client-protocol-error")
                 (message . ,(error-message-string error-data))))
         (eliscript-worker--fail-pending
          worker "client-protocol-error" (error-message-string error-data))
         (when (process-live-p process) (delete-process process)))))))

(defun eliscript-worker--sentinel (process event)
  "Handle PROCESS lifecycle EVENT."
  (let ((worker (process-get process 'eliscript-worker)))
    (when (and worker (eq process (eliscript-worker-process worker)))
      (setf (eliscript-worker-last-exit worker) (string-trim event))
      (unless (memq (eliscript-worker-state worker) '(stopping closed))
        (eliscript-worker--fail-pending
         worker "worker-exit"
         (format "worker exited: %s%s"
                 (string-trim event)
                 (let ((stderr (string-trim (eliscript-worker-stderr worker))))
                   (if (string-empty-p stderr) "" (concat ": " stderr))))))
      (unless (eq (eliscript-worker-state worker) 'closed)
        (setf (eliscript-worker-state worker) 'stopped))
      (eliscript-worker--capture-stderr worker))))

(defun eliscript-worker--launch (worker)
  "Launch or relaunch WORKER and wait for readiness."
  (when (eliscript-worker-live-p worker)
    (signal 'eliscript-worker-error (list "worker is already running")))
  (eliscript-worker--capture-stderr worker)
  (let* ((stderr-buffer (generate-new-buffer " *eliscript-worker-stderr*"))
         (default-directory eliscript-worker--project-directory)
         (process
          (make-process
           :name "eliscript-worker"
           :command (eliscript-worker-command worker)
           :coding 'utf-8-unix
           :connection-type 'pipe
           :noquery t
           :stderr stderr-buffer
           :filter #'eliscript-worker--filter
           :sentinel #'eliscript-worker--sentinel)))
    (setf (eliscript-worker-process worker) process
          (eliscript-worker-stderr-buffer worker) stderr-buffer
          (eliscript-worker-receive-buffer worker) ""
          (eliscript-worker-capabilities worker) nil
          (eliscript-worker-protocol-error worker) nil
          (eliscript-worker-state worker) 'starting)
    (clrhash (eliscript-worker-module-versions worker))
    (process-put process 'eliscript-worker worker)
    (let ((deadline (+ (float-time) eliscript-worker-startup-timeout)))
      (while (and (eq (eliscript-worker-state worker) 'starting)
                  (process-live-p process)
                  (< (float-time) deadline))
        (accept-process-output process 0.05)))
    (unless (eq (eliscript-worker-state worker) 'ready)
      (let* ((stderr (string-trim (eliscript-worker-stderr worker)))
             (message
              (or (and (eliscript-worker-protocol-error worker)
                       (eliscript-worker--error-message
                        (eliscript-worker-protocol-error worker)))
                  (and (not (string-empty-p stderr)) stderr)
                  "worker did not become ready")))
        (when (process-live-p process)
          (setf (eliscript-worker-state worker) 'stopping)
          (delete-process process))
        (setf (eliscript-worker-state worker) 'stopped)
        (eliscript-worker--capture-stderr worker)
        (signal 'eliscript-worker-error (list message))))
    (cl-incf (eliscript-worker-generation worker))
    worker))

(defun eliscript-worker-start (&optional command)
  "Start a worker and wait for readiness.

COMMAND defaults to `eliscript-worker-program' plus the bundled worker script."
  (eliscript-worker--launch
   (eliscript-worker--create
    :command (or command
                 (list eliscript-worker-program (eliscript-worker--script)))
    :auto-restart eliscript-worker-auto-restart
    :pending (make-hash-table :test #'equal)
    :module-versions (make-hash-table :test #'equal)
    :next-id 0
    :generation 0
    :restart-count 0
    :state 'stopped)))

(defun eliscript-worker-restart (worker)
  "Restart WORKER explicitly and return it after readiness."
  (when (eliscript-worker-live-p worker)
    (setf (eliscript-worker-state worker) 'stopping)
    (delete-process (eliscript-worker-process worker)))
  (eliscript-worker--fail-pending
   worker "worker-restart" "worker restarted before the request completed")
  (setf (eliscript-worker-state worker) 'stopped)
  (cl-incf (eliscript-worker-restart-count worker))
  (eliscript-worker--launch worker))

(defun eliscript-worker--ensure-ready (worker)
  "Ensure WORKER is ready, automatically restarting it when configured."
  (cond
   ((and (eq (eliscript-worker-state worker) 'ready)
         (eliscript-worker-live-p worker)) worker)
   ((eq (eliscript-worker-state worker) 'closed)
    (signal 'eliscript-worker-error (list "worker has been closed")))
   ((and (not (eliscript-worker-live-p worker))
         (eliscript-worker-auto-restart worker))
    (setf (eliscript-worker-state worker) 'stopped)
    (cl-incf (eliscript-worker-restart-count worker))
    (eliscript-worker--launch worker))
   (t
    (signal 'eliscript-worker-error (list "worker is not ready")))))

(defun eliscript-worker--module-file (module)
  "Return the local filename represented by MODULE, or nil."
  (cond
   ((string-prefix-p "file:" module)
    (url-unhex-string (url-filename (url-generic-parse-url module))))
   ((file-name-absolute-p module) module)
   (t (expand-file-name module))))

(defun eliscript-worker--module-fingerprint (module)
  "Return a stable current-file fingerprint for MODULE."
  (let* ((file (eliscript-worker--module-file module))
         (attributes (and file (file-attributes file 'string))))
    (when attributes
      (format "%S:%s:%S:%S"
              (file-attribute-modification-time attributes)
              (file-attribute-size attributes)
              (file-attribute-inode-number attributes)
              (file-attribute-device-number attributes)))))

(defun eliscript-worker--prepare-module (worker module requested-version)
  "Resolve MODULE version and restart WORKER when it changed."
  (let* ((version
          (or requested-version
              (eliscript-worker--module-fingerprint module)))
         (versions (eliscript-worker-module-versions worker))
         (previous (gethash module versions)))
    (when (and version previous (not (equal version previous))
               (eliscript-worker-live-p worker))
      (eliscript-worker-restart worker))
    (when version (puthash module version versions))
    version))

(defun eliscript-worker--send (worker message)
  "Send protocol MESSAGE to WORKER."
  (unless (eliscript-worker-live-p worker)
    (signal 'eliscript-worker-error (list "worker is not running")))
  (process-send-string
   (eliscript-worker-process worker)
   (concat
    (json-serialize message :null-object nil :false-object :false)
    "\n")))

(defun eliscript-worker--local-timeout (worker id)
  "Terminate WORKER when request ID ignores its remote timeout."
  (when (gethash id (eliscript-worker-pending worker))
    (eliscript-worker--finish-request
     worker id nil
     '((code . "timeout")
       (message . "worker did not stop after the request timeout")) nil)
    (eliscript-worker--fail-pending
     worker "worker-restart" "worker terminated after an unresponsive timeout")
    (when (eliscript-worker-live-p worker)
      (setf (eliscript-worker-state worker) 'stopping)
      (delete-process (eliscript-worker-process worker))
      (setf (eliscript-worker-state worker) 'stopped))))

(cl-defun eliscript-worker-call
    (worker module export arguments callback
            &key operation module-version progress metrics timeout-ms)
  "Call EXPORT from MODULE on WORKER with ARGUMENTS.

When OPERATION is non-nil, resolve its source name through the generated
portable manifest instead of calling EXPORT. CALLBACK receives (VALUE ERROR).
PROGRESS receives each progress value.
TIMEOUT-MS is enforced remotely, with local worker termination after a grace
period when synchronous code prevents cooperative cancellation. Return request
id."
  (eliscript-worker--ensure-ready worker)
  (when (and timeout-ms
             (or (not (integerp timeout-ms)) (<= timeout-ms 0)))
    (signal 'wrong-type-argument (list 'positive-integer-p timeout-ms)))
  (let* ((id (number-to-string (cl-incf (eliscript-worker-next-id worker))))
         (request
          (eliscript-worker-request--create
           :callback callback
           :progress progress
           :metrics metrics))
         (module-name
          (if (string-prefix-p "file:" module)
              module
            (expand-file-name module)))
         (resolved-module-version
          (eliscript-worker--prepare-module
           worker module-name module-version)))
    (puthash id request (eliscript-worker-pending worker))
    (when timeout-ms
      (setf (eliscript-worker-request-timer request)
            (run-at-time
             (+ (/ timeout-ms 1000.0) 0.25)
             nil #'eliscript-worker--local-timeout worker id)))
    (condition-case error-data
        (eliscript-worker--send
         worker
         (append
          `((version . ,eliscript-worker-protocol-version)
            (type . "request")
            (id . ,id)
            (module . ,module-name)
            (arguments . ,(vconcat arguments)))
          (if operation
              `((operation . ,operation))
            `((export . ,export)))
          (and resolved-module-version
               `((moduleVersion . ,resolved-module-version)))
          (and timeout-ms `((timeoutMs . ,timeout-ms)))))
      (error
       (remhash id (eliscript-worker-pending worker))
       (when (timerp (eliscript-worker-request-timer request))
         (cancel-timer (eliscript-worker-request-timer request)))
       (signal (car error-data) (cdr error-data))))
    id))

(cl-defun eliscript-worker-call-portable
    (worker module operation arguments callback
            &key module-version progress metrics timeout-ms)
  "Call portable OPERATION from MODULE on WORKER with ARGUMENTS."
  (eliscript-worker-call
   worker module nil arguments callback
   :operation operation
   :module-version module-version
   :progress progress
   :metrics metrics
   :timeout-ms timeout-ms))

(defun eliscript-worker-cancel (worker id)
  "Request cancellation of pending request ID on WORKER."
  (when (gethash id (eliscript-worker-pending worker))
    (eliscript-worker--send
     worker
     `((version . ,eliscript-worker-protocol-version)
       (type . "cancel")
       (id . ,id)))
    t))

(cl-defun eliscript-worker-call-sync
    (worker module export arguments
            &key operation module-version progress metrics timeout-ms)
  "Synchronously call EXPORT from MODULE on WORKER with ARGUMENTS."
  (let (done value error-object)
    (eliscript-worker-call
     worker module export arguments
     (lambda (result request-error)
       (setq value result
             error-object request-error
             done t))
     :progress progress
     :metrics metrics
     :operation operation
     :module-version module-version
     :timeout-ms timeout-ms)
    (while (and (not done) (eliscript-worker-live-p worker))
      (accept-process-output (eliscript-worker-process worker) 0.05))
    (unless done
      (signal 'eliscript-worker-error (list "worker exited without a response")))
    (when error-object
      (let ((code (alist-get 'code error-object))
            (message (eliscript-worker-format-error error-object)))
        (signal (if (equal code "timeout")
                    'eliscript-worker-timeout
                  'eliscript-worker-request-error)
                (list message error-object))))
    value))

(cl-defun eliscript-worker-call-portable-sync
    (worker module operation arguments
            &key module-version progress metrics timeout-ms)
  "Synchronously call portable OPERATION from MODULE on WORKER."
  (eliscript-worker-call-sync
   worker module nil arguments
   :operation operation
   :module-version module-version
   :progress progress
   :metrics metrics
   :timeout-ms timeout-ms))

(defun eliscript-worker-stop (worker &optional force)
  "Stop WORKER, using immediate termination when FORCE is non-nil."
  (let ((process (eliscript-worker-process worker)))
    (when (process-live-p process)
      (unless force
        (ignore-errors
          (eliscript-worker--send
           worker
           `((version . ,eliscript-worker-protocol-version)
             (type . "shutdown")))))
      (setf (eliscript-worker-state worker) 'closed)
      (unless force
        (let ((deadline (+ (float-time) 1.0)))
          (while (and (process-live-p process) (< (float-time) deadline))
            (accept-process-output process 0.05))))
      (when (process-live-p process) (delete-process process)))
    (eliscript-worker--fail-pending worker "worker-stop" "worker stopped")
    (setf (eliscript-worker-state worker) 'closed)
    (eliscript-worker--capture-stderr worker)))

(provide 'eliscript-worker)

;;; eliscript-worker.el ends here
