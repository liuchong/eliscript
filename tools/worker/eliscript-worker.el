;;; eliscript-worker.el --- Long-lived Eliscript worker client -*- lexical-binding: t; -*-

;;; Commentary:

;; Communicate with runtime/worker.mjs over versioned newline-delimited JSON.

;;; Code:

(require 'cl-lib)
(require 'json)
(require 'subr-x)

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
  stderr-buffer
  stderr-output
  receive-buffer
  pending
  next-id
  state
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
    (if (buffer-live-p buffer)
        (with-current-buffer buffer (buffer-string))
      (or (eliscript-worker-stderr-output worker) ""))))

(defun eliscript-worker--error-message (error-object)
  "Return a readable message from protocol ERROR-OBJECT."
  (or (alist-get 'message error-object)
      "unknown worker error"))

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
    (when worker
      (unless (eq (eliscript-worker-state worker) 'stopping)
        (eliscript-worker--fail-pending
         worker "worker-exit"
         (format "worker exited: %s%s"
                 (string-trim event)
                 (let ((stderr (string-trim (eliscript-worker-stderr worker))))
                   (if (string-empty-p stderr) "" (concat ": " stderr))))))
      (setf (eliscript-worker-state worker) 'stopped))))

(defun eliscript-worker-start (&optional command)
  "Start a worker and wait for readiness.

COMMAND defaults to `eliscript-worker-program' plus the bundled worker script."
  (let* ((stderr-buffer (generate-new-buffer " *eliscript-worker-stderr*"))
         (worker
          (eliscript-worker--create
           :stderr-buffer stderr-buffer
           :receive-buffer ""
           :pending (make-hash-table :test #'equal)
           :next-id 0
           :state 'starting))
         (default-directory eliscript-worker--project-directory)
         (process
          (make-process
           :name "eliscript-worker"
           :command (or command
                        (list eliscript-worker-program
                              (eliscript-worker--script)))
           :coding 'utf-8-unix
           :connection-type 'pipe
           :noquery t
           :stderr stderr-buffer
           :filter #'eliscript-worker--filter
           :sentinel #'eliscript-worker--sentinel)))
    (setf (eliscript-worker-process worker) process)
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
        (eliscript-worker-stop worker t)
        (signal 'eliscript-worker-error (list message))))
    worker))

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
            &key progress metrics timeout-ms)
  "Call EXPORT from MODULE on WORKER with ARGUMENTS.

CALLBACK receives (VALUE ERROR). PROGRESS receives each progress value.
TIMEOUT-MS is enforced remotely, with local worker termination after a grace
period when synchronous code prevents cooperative cancellation. Return request
id."
  (unless (eq (eliscript-worker-state worker) 'ready)
    (signal 'eliscript-worker-error (list "worker is not ready")))
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
            (expand-file-name module))))
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
            (export . ,export)
            (arguments . ,(vconcat arguments)))
          (and timeout-ms `((timeoutMs . ,timeout-ms)))))
      (error
       (remhash id (eliscript-worker-pending worker))
       (when (timerp (eliscript-worker-request-timer request))
         (cancel-timer (eliscript-worker-request-timer request)))
       (signal (car error-data) (cdr error-data))))
    id))

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
    (worker module export arguments &key progress metrics timeout-ms)
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
     :timeout-ms timeout-ms)
    (while (and (not done) (eliscript-worker-live-p worker))
      (accept-process-output (eliscript-worker-process worker) 0.05))
    (unless done
      (signal 'eliscript-worker-error (list "worker exited without a response")))
    (when error-object
      (let ((code (alist-get 'code error-object))
            (message (eliscript-worker--error-message error-object)))
        (signal (if (equal code "timeout")
                    'eliscript-worker-timeout
                  'eliscript-worker-request-error)
                (list message error-object))))
    value))

(defun eliscript-worker-stop (worker &optional force)
  "Stop WORKER, using immediate termination when FORCE is non-nil."
  (let ((process (eliscript-worker-process worker)))
    (when (process-live-p process)
      (setf (eliscript-worker-state worker) 'stopping)
      (unless force
        (ignore-errors
          (eliscript-worker--send
           worker
           `((version . ,eliscript-worker-protocol-version)
             (type . "shutdown"))))
        (let ((deadline (+ (float-time) 1.0)))
          (while (and (process-live-p process) (< (float-time) deadline))
            (accept-process-output process 0.05))))
      (when (process-live-p process) (delete-process process)))
    (eliscript-worker--fail-pending worker "worker-stop" "worker stopped")
    (setf (eliscript-worker-state worker) 'stopped)
    (when (buffer-live-p (eliscript-worker-stderr-buffer worker))
      (setf (eliscript-worker-stderr-output worker)
            (with-current-buffer (eliscript-worker-stderr-buffer worker)
              (buffer-string)))
      (kill-buffer (eliscript-worker-stderr-buffer worker)))))

(provide 'eliscript-worker)

;;; eliscript-worker.el ends here
