;;; eliscript-worker.el --- Long-lived Eliscript worker client -*- lexical-binding: t; -*-

;;; Commentary:

;; Communicate with runtime/worker.mjs over versioned newline-delimited JSON.

;;; Code:

(require 'cl-lib)
(require 'json)
(require 'subr-x)
(require 'url-parse)
(require 'url-util)
(require 'eliscript-value-codec)
(require 'eliscript-value-stream)

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
  value-encoding
  value-framing
  upload-encoder
  upload-sequence
  upload-awaiting
  upload-final
  response-decoder
  response-sequence
  progress-decoders
  progress-sequences
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

(defun eliscript-worker--message-value (worker message)
  "Decode protocol MESSAGE value according to its request on WORKER."
  (let* ((id (alist-get 'id message))
         (request (gethash id (eliscript-worker-pending worker)))
         (expected (and request
                        (eliscript-worker-request-value-encoding request)))
         (actual (alist-get 'valueEncoding message)))
    (cond
     (expected
      (unless (equal actual expected)
        (signal 'eliscript-worker-protocol-error
                (list
                 (format "worker response value encoding mismatch: %S"
                         actual))))
      (eliscript-worker-value-decode (alist-get 'value message)))
     (actual
      (signal 'eliscript-worker-protocol-error
              (list
               (format "unexpected worker response value encoding: %S"
                       actual))))
     (t (alist-get 'value message)))))

(defun eliscript-worker--chunk-request (worker message)
  "Return chunked request corresponding to MESSAGE on WORKER."
  (let* ((id (alist-get 'id message))
         (request (and (stringp id)
                       (gethash id (eliscript-worker-pending worker)))))
    (unless request
      (signal 'eliscript-worker-protocol-error
              (list (format "chunk message has no pending request: %S" id))))
    (unless (and
             (equal (eliscript-worker-request-value-encoding request)
                    eliscript-worker-value-encoding)
             (equal (eliscript-worker-request-value-framing request)
                    eliscript-worker-value-framing)
             (equal (alist-get 'valueEncoding message)
                    eliscript-worker-value-encoding)
             (equal (alist-get 'valueFraming message)
                    eliscript-worker-value-framing))
      (signal 'eliscript-worker-protocol-error
              (list "chunk message encoding or framing mismatch")))
    request))

(defun eliscript-worker--fail-upload (worker id error-data)
  "Fail chunk upload ID on WORKER from ERROR-DATA."
  (let* ((code-value (nth 2 error-data))
         (path (nth 3 error-data))
         (code (if (symbolp code-value)
                   (symbol-name code-value)
                 "client-value-encoding"))
         (message (error-message-string error-data)))
    (ignore-errors
      (eliscript-worker--send
       worker
       `((version . ,eliscript-worker-protocol-version)
         (type . "cancel")
         (id . ,id))))
    (eliscript-worker--finish-request
     worker id nil
     (append `((code . ,code) (message . ,message))
             (and path `((path . ,path))))
     nil)))

(defun eliscript-worker--send-next-value-chunk (worker id request)
  "Send the next argument chunk for REQUEST ID on WORKER."
  (let* ((encoder (eliscript-worker-request-upload-encoder request))
         (events (and encoder
                      (eliscript-worker-value-stream-next-chunk encoder))))
    (unless events
      (signal 'eliscript-value-stream-error
              (list "argument value stream produced no final chunk"
                    'value-stream-encoding-truncated "$")))
    (let* ((sequence (eliscript-worker-request-upload-sequence request))
           (final
            (eliscript-worker-value-stream-encoder-complete-p encoder)))
      (setf (eliscript-worker-request-upload-awaiting request) sequence
            (eliscript-worker-request-upload-final request) final
            (eliscript-worker-request-upload-sequence request) (1+ sequence))
      (eliscript-worker--send
       worker
       `((version . ,eliscript-worker-protocol-version)
         (type . "value-chunk")
         (id . ,id)
         (channel . "arguments")
         (sequence . ,sequence)
         (final . ,(if final t :false))
         (valueEncoding . ,eliscript-worker-value-encoding)
         (valueFraming . ,eliscript-worker-value-framing)
         (events . ,events))))))

(defun eliscript-worker--handle-value-ack (worker message)
  "Apply argument value acknowledgement MESSAGE to WORKER."
  (let* ((id (alist-get 'id message))
         (request (eliscript-worker--chunk-request worker message))
         (sequence (alist-get 'sequence message))
         (final (eliscript-worker--chunk-final-p message))
         (awaiting (eliscript-worker-request-upload-awaiting request)))
    (unless (equal (alist-get 'channel message) "arguments")
      (signal 'eliscript-worker-protocol-error
              (list "value acknowledgement channel must be arguments")))
    (unless (integerp sequence)
      (signal 'eliscript-worker-protocol-error
              (list "value acknowledgement sequence must be an integer")))
    (when (eliscript-worker-request-upload-encoder request)
      (condition-case error-data
          (cond
           ((and (= sequence -1) (null awaiting)
                 (= (eliscript-worker-request-upload-sequence request) 0)
                 (not final))
            (eliscript-worker--send-next-value-chunk worker id request))
           ((and (integerp sequence) (integerp awaiting)
                 (= sequence awaiting)
                 (eq final (eliscript-worker-request-upload-final request)))
            (setf (eliscript-worker-request-upload-awaiting request) nil)
            (if final
                (setf (eliscript-worker-request-upload-encoder request) nil)
              (eliscript-worker--send-next-value-chunk worker id request)))
           (t
            (signal 'eliscript-worker-protocol-error
                    (list
                     (format "unexpected value acknowledgement sequence: %S"
                             sequence)))))
        (eliscript-value-stream-error
         (eliscript-worker--fail-upload worker id error-data))))))

(defun eliscript-worker--chunk-final-p (message)
  "Return final flag from chunk MESSAGE or signal a protocol error."
  (let ((value (alist-get 'final message)))
    (unless (memq value '(t :false))
      (signal 'eliscript-worker-protocol-error
              (list (format "value chunk final is not Boolean: %S" value))))
    (eq value t)))

(defun eliscript-worker--handle-response-chunk
    (worker message request events sequence final)
  "Apply response chunk MESSAGE and EVENTS for REQUEST on WORKER."
  (let ((expected (or (eliscript-worker-request-response-sequence request) 0))
        (decoder (or (eliscript-worker-request-response-decoder request)
                     (setf (eliscript-worker-request-response-decoder request)
                           (eliscript-worker-value-stream-decoder)))))
    (unless (= sequence expected)
      (signal 'eliscript-worker-protocol-error
              (list (format "response chunk sequence %S does not match %S"
                            sequence expected))))
    (eliscript-worker-value-stream-write decoder events)
    (setf (eliscript-worker-request-response-sequence request) (1+ expected))
    (when final
      (eliscript-worker--finish-request
       worker (alist-get 'id message)
       (eliscript-worker-value-stream-finish decoder)
       nil (alist-get 'timing message)))))

(defun eliscript-worker--handle-progress-chunk
    (_worker message request events sequence final)
  "Apply progress chunk MESSAGE and EVENTS for REQUEST."
  (let* ((stream (alist-get 'stream message))
         (decoders (eliscript-worker-request-progress-decoders request))
         (sequences (eliscript-worker-request-progress-sequences request)))
    (unless (and (stringp stream) (> (length stream) 0))
      (signal 'eliscript-worker-protocol-error
              (list "progress value chunk requires a non-empty stream id")))
    (let ((decoder (gethash stream decoders))
          (expected (gethash stream sequences 0)))
      (when (and (null decoder) (>= (hash-table-count decoders) 64))
        (signal 'eliscript-worker-protocol-error
                (list "too many incomplete progress value streams")))
      (unless (= sequence expected)
        (signal 'eliscript-worker-protocol-error
                (list (format "progress chunk sequence %S does not match %S"
                              sequence expected))))
      (unless decoder
        (setq decoder (eliscript-worker-value-stream-decoder))
        (puthash stream decoder decoders))
      (eliscript-worker-value-stream-write decoder events)
      (puthash stream (1+ expected) sequences)
      (when final
        (let ((value (eliscript-worker-value-stream-finish decoder))
              (callback (eliscript-worker-request-progress request)))
          (remhash stream decoders)
          (remhash stream sequences)
          (when callback
            (condition-case callback-error
                (funcall callback value)
              (error
               (message "Eliscript worker progress callback failed: %s"
                        (error-message-string callback-error))))))))))

(defun eliscript-worker--handle-value-chunk (worker message)
  "Apply worker value chunk MESSAGE to WORKER."
  (let* ((request (eliscript-worker--chunk-request worker message))
         (events (alist-get 'events message))
         (sequence (alist-get 'sequence message))
         (final (eliscript-worker--chunk-final-p message))
         (channel (alist-get 'channel message)))
    (unless (and (vectorp events) (integerp sequence) (>= sequence 0))
      (signal 'eliscript-worker-protocol-error
              (list "value chunk events or sequence are invalid")))
    (cond
     ((equal channel "response")
      (eliscript-worker--handle-response-chunk
       worker message request events sequence final))
     ((equal channel "progress")
      (eliscript-worker--handle-progress-chunk
       worker message request events sequence final))
     (t
      (signal 'eliscript-worker-protocol-error
              (list (format "unknown worker value chunk channel: %S"
                            channel)))))))

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
     ((equal type "value-ack")
      (eliscript-worker--handle-value-ack worker message))
     ((equal type "value-chunk")
      (eliscript-worker--handle-value-chunk worker message))
     ((equal type "response")
      (let ((request (gethash (alist-get 'id message)
                              (eliscript-worker-pending worker))))
        (when (and request
                   (eliscript-worker-request-value-framing request)
                   (eq (alist-get 'ok message) t))
          (signal 'eliscript-worker-protocol-error
                  (list "chunked request received an unframed success response"))))
      (if (eq (alist-get 'ok message) t)
          (eliscript-worker--finish-request
           worker (alist-get 'id message)
           (eliscript-worker--message-value worker message) nil
           (alist-get 'timing message))
        (eliscript-worker--finish-request
         worker (alist-get 'id message) nil (alist-get 'error message)
         (alist-get 'timing message))))
     ((equal type "progress")
      (let* ((id (alist-get 'id message))
             (request (gethash id (eliscript-worker-pending worker)))
             (progress (and request
                            (eliscript-worker-request-progress request))))
        (when (and request
                   (eliscript-worker-request-value-framing request))
          (signal 'eliscript-worker-protocol-error
                  (list "chunked request received unframed progress")))
        (when progress
          (condition-case callback-error
              (funcall progress
                       (eliscript-worker--message-value worker message))
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

(defun eliscript-worker--project-manifest-version (manifest)
  "Return the graph digest declared by local project MANIFEST."
  (let ((file (eliscript-worker--module-file manifest)))
    (unless (and file (file-regular-p file))
      (signal 'eliscript-worker-error
              (list (format "project manifest does not exist: %s" manifest))))
    (condition-case error-data
        (let* ((object
                (with-temp-buffer
                  (insert-file-contents file)
                  (json-parse-buffer
                   :object-type 'alist
                   :array-type 'array
                   :null-object nil
                   :false-object :false)))
               (digest (alist-get 'digest object)))
          (unless (and (equal (alist-get 'format object)
                              "eliscript-project")
                       (equal (alist-get 'version object) 1)
                       (stringp digest)
                       (string-match-p
                        "\\`[[:xdigit:]]\\{64\\}\\'" digest))
            (error "unsupported manifest shape"))
          digest)
      (error
       (signal 'eliscript-worker-error
               (list (format "invalid project manifest %s: %s"
                             manifest (error-message-string error-data))))))))

(defun eliscript-worker--prepare-module
    (worker module requested-version project-manifest)
  "Resolve MODULE version and restart WORKER when it changed.

PROJECT-MANIFEST, when non-nil, supplies the whole generated graph version."
  (let* ((version
          (or requested-version
              (and project-manifest
                   (eliscript-worker--project-manifest-version
                    project-manifest))
              (eliscript-worker--module-fingerprint module)))
         (versions (eliscript-worker-module-versions worker))
         (key (if project-manifest
                  (cons module project-manifest)
                module))
         (previous (gethash key versions)))
    (when (and version previous (not (equal version previous))
               (eliscript-worker-live-p worker))
      (eliscript-worker-restart worker))
    (when version (puthash key version versions))
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
            &key operation module-version project-manifest
            progress metrics timeout-ms value-codec value-chunks)
  "Call EXPORT from MODULE on WORKER with ARGUMENTS.

When OPERATION is non-nil, resolve its source name through the generated
portable manifest instead of calling EXPORT. CALLBACK receives (VALUE ERROR).
PROJECT-MANIFEST names an `eliscript-project.json' file whose digest identifies
the complete generated module graph and whose source maps cover dependencies.
PROGRESS receives each progress value.
When VALUE-CODEC is non-nil, persistent Eliscript values use the negotiated
versioned worker codec instead of the legacy JSON representation.
When VALUE-CHUNKS is non-nil, the codec uses bounded incremental chunks with
one-chunk request backpressure; this option implies VALUE-CODEC.
TIMEOUT-MS is enforced remotely, with local worker termination after a grace
period when synchronous code prevents cooperative cancellation. Return request
id."
  (eliscript-worker--ensure-ready worker)
  (when value-chunks (setq value-codec t))
  (when (and timeout-ms
             (or (not (integerp timeout-ms)) (<= timeout-ms 0)))
    (signal 'wrong-type-argument (list 'positive-integer-p timeout-ms)))
  (when (and value-codec
             (not (member "value-codec-v1"
                          (eliscript-worker-capabilities worker))))
    (signal 'eliscript-worker-protocol-error
            (list "worker does not support value-codec-v1")))
  (when (and value-chunks
             (not (member "value-chunks-v1"
                          (eliscript-worker-capabilities worker))))
    (signal 'eliscript-worker-protocol-error
            (list "worker does not support value-chunks-v1")))
  (let* ((id (number-to-string (cl-incf (eliscript-worker-next-id worker))))
         (request
          (eliscript-worker-request--create
           :callback callback
           :progress progress
           :metrics metrics
           :value-encoding (and value-codec
                                eliscript-worker-value-encoding)
           :value-framing (and value-chunks
                               eliscript-worker-value-framing)
           :upload-encoder
           (and value-chunks
                (eliscript-worker-value-stream-encoder
                 (vconcat arguments)))
           :upload-sequence 0
           :progress-decoders (make-hash-table :test #'equal)
           :progress-sequences (make-hash-table :test #'equal)))
         (module-name
          (if (string-prefix-p "file:" module)
              module
            (expand-file-name module)))
         (project-manifest-name
          (and project-manifest
               (if (string-prefix-p "file:" project-manifest)
                   project-manifest
                 (expand-file-name project-manifest))))
         (resolved-module-version
          (eliscript-worker--prepare-module
           worker module-name module-version project-manifest-name)))
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
            (module . ,module-name))
          (and (not value-chunks)
               `((arguments . ,(if value-codec
                                   (eliscript-worker-values-encode arguments)
                                 (vconcat arguments)))))
          (if operation
              `((operation . ,operation))
            `((export . ,export)))
          (and resolved-module-version
               `((moduleVersion . ,resolved-module-version)))
          (and project-manifest-name
               `((projectManifest . ,project-manifest-name)))
          (and value-codec
               `((valueEncoding . ,eliscript-worker-value-encoding)))
          (and value-chunks
               `((valueFraming . ,eliscript-worker-value-framing)))
          (and timeout-ms `((timeoutMs . ,timeout-ms)))))
      (error
       (remhash id (eliscript-worker-pending worker))
       (when (timerp (eliscript-worker-request-timer request))
         (cancel-timer (eliscript-worker-request-timer request)))
       (signal (car error-data) (cdr error-data))))
    id))

(cl-defun eliscript-worker-call-portable
    (worker module operation arguments callback
            &key module-version project-manifest progress metrics timeout-ms
            value-codec value-chunks)
  "Call portable OPERATION from MODULE on WORKER with ARGUMENTS."
  (eliscript-worker-call
   worker module nil arguments callback
   :operation operation
   :module-version module-version
   :project-manifest project-manifest
   :progress progress
   :metrics metrics
   :timeout-ms timeout-ms
   :value-codec value-codec
   :value-chunks value-chunks))

(defun eliscript-worker-cancel (worker id)
  "Request cancellation of pending request ID on WORKER."
  (let ((request (gethash id (eliscript-worker-pending worker))))
    (when request
      (setf (eliscript-worker-request-upload-encoder request) nil
            (eliscript-worker-request-upload-awaiting request) nil)
      (eliscript-worker--send
       worker
       `((version . ,eliscript-worker-protocol-version)
         (type . "cancel")
         (id . ,id)))
      t)))

(cl-defun eliscript-worker-call-sync
    (worker module export arguments
            &key operation module-version project-manifest
            progress metrics timeout-ms value-codec value-chunks)
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
     :project-manifest project-manifest
     :timeout-ms timeout-ms
     :value-codec value-codec
     :value-chunks value-chunks)
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
            &key module-version project-manifest progress metrics timeout-ms
            value-codec value-chunks)
  "Synchronously call portable OPERATION from MODULE on WORKER."
  (eliscript-worker-call-sync
   worker module nil arguments
   :operation operation
   :module-version module-version
   :project-manifest project-manifest
   :progress progress
   :metrics metrics
   :timeout-ms timeout-ms
   :value-codec value-codec
   :value-chunks value-chunks))

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
