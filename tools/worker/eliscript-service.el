;;; eliscript-service.el --- High-level accelerated Emacs operations -*- lexical-binding: t; -*-

;;; Commentary:

;; Declare dual-path operations and invoke them without exposing worker
;; protocol, module reload, value transport, or stale-buffer details.

;;; Code:

(require 'cl-lib)
(require 'subr-x)
(require 'eliscript-worker)

(define-error 'eliscript-service-error "Eliscript service error")
(define-error 'eliscript-service-verification-error
  "Eliscript accelerated result disagrees with its reference"
  'eliscript-service-error)
(define-error 'eliscript-service-stale-result
  "Eliscript service result targets a stale buffer"
  'eliscript-service-error)
(define-error 'eliscript-service-cancelled
  "Eliscript service request was cancelled"
  'eliscript-service-error)

(cl-defstruct (eliscript-service-module
               (:constructor eliscript-service-module--create))
  path
  project-manifest
  version)

(cl-defstruct (eliscript-service-operation
               (:constructor eliscript-service-operation--create))
  name
  reference
  portable-name
  export-name
  workload-size
  threshold
  equal)

(cl-defstruct (eliscript-service
               (:constructor eliscript-service--create))
  worker
  module
  operations
  verify
  value-codec
  value-chunks
  closed)

(cl-defstruct (eliscript-service-request
               (:constructor eliscript-service-request--create))
  service
  operation
  path
  worker-id
  callback
  buffer
  buffer-tick
  apply
  expected
  done
  cancelled
  result
  error)

(cl-defun eliscript-service-module-declare
    (path &key project-manifest version)
  "Declare generated module PATH and its lifecycle metadata."
  (unless (and (stringp path) (not (string-empty-p path)))
    (signal 'wrong-type-argument (list 'non-empty-string-p path)))
  (when (and project-manifest
             (not (and (stringp project-manifest)
                       (not (string-empty-p project-manifest)))))
    (signal 'wrong-type-argument
            (list 'non-empty-string-p project-manifest)))
  (eliscript-service-module--create
   :path path :project-manifest project-manifest :version version))

(cl-defun eliscript-service-operation
    (name reference &key portable-name export-name workload-size
          (threshold 0) (equal #'equal))
  "Declare dual-path operation NAME with REFERENCE and worker entry.

Exactly one of PORTABLE-NAME and EXPORT-NAME identifies the accelerated entry.
WORKLOAD-SIZE receives the complete argument list.  Workloads smaller than
THRESHOLD use REFERENCE; larger workloads use the worker."
  (unless (symbolp name)
    (signal 'wrong-type-argument (list 'symbolp name)))
  (unless (functionp reference)
    (signal 'wrong-type-argument (list 'functionp reference)))
  (unless (= (+ (if portable-name 1 0) (if export-name 1 0)) 1)
    (signal 'eliscript-service-error
            (list "operation requires exactly one worker entry" name)))
  (dolist (entry (list portable-name export-name))
    (when (and entry (not (and (stringp entry) (not (string-empty-p entry)))))
      (signal 'wrong-type-argument (list 'non-empty-string-p entry))))
  (unless (or (null workload-size) (functionp workload-size))
    (signal 'wrong-type-argument (list 'functionp workload-size)))
  (unless (and (integerp threshold) (>= threshold 0))
    (signal 'wrong-type-argument (list 'natnump threshold)))
  (unless (functionp equal)
    (signal 'wrong-type-argument (list 'functionp equal)))
  (eliscript-service-operation--create
   :name name
   :reference reference
   :portable-name portable-name
   :export-name export-name
   :workload-size (or workload-size (lambda (arguments) (length arguments)))
   :threshold threshold
   :equal equal))

(defun eliscript-service--operation-table (operations)
  "Validate OPERATIONS and return an identity-keyed table."
  (let ((table (make-hash-table :test #'eq)))
    (dolist (operation operations)
      (unless (eliscript-service-operation-p operation)
        (signal 'wrong-type-argument
                (list 'eliscript-service-operation-p operation)))
      (let ((name (eliscript-service-operation-name operation)))
        (when (gethash name table)
          (signal 'eliscript-service-error
                  (list "duplicate service operation" name)))
        (puthash name operation table)))
    table))

(cl-defun eliscript-service-start
    (module operations &key command verify (value-codec t) (value-chunks t))
  "Start a service for MODULE and declared OPERATIONS.

VERIFY may be nil or `always'.  VALUE-CODEC and VALUE-CHUNKS are worker
transport defaults hidden from operation callers."
  (unless (eliscript-service-module-p module)
    (signal 'wrong-type-argument (list 'eliscript-service-module-p module)))
  (unless (memq verify '(nil always))
    (signal 'wrong-type-argument (list '(member nil always) verify)))
  (let* ((operation-table (eliscript-service--operation-table operations))
         (worker (eliscript-worker-start command)))
    (eliscript-service--create
     :worker worker
     :module module
     :operations operation-table
     :verify verify
     :value-codec value-codec
     :value-chunks value-chunks)))

(defun eliscript-service-live-p (service)
  "Return non-nil when SERVICE currently owns a live worker process."
  (and (eliscript-service-p service)
       (not (eliscript-service-closed service))
       (eliscript-worker-live-p (eliscript-service-worker service))))

(defun eliscript-service-update-module (service module)
  "Use MODULE for subsequent SERVICE requests.

Replacing the declaration immediately advances the worker generation so no
request from the previous module generation can complete successfully."
  (unless (eliscript-service-p service)
    (signal 'wrong-type-argument (list 'eliscript-service-p service)))
  (when (eliscript-service-closed service)
    (signal 'eliscript-service-error (list "service is closed")))
  (unless (eliscript-service-module-p module)
    (signal 'wrong-type-argument (list 'eliscript-service-module-p module)))
  (unless (equal module (eliscript-service-module service))
    (setf (eliscript-service-module service) module)
    (eliscript-worker-restart (eliscript-service-worker service)))
  module)

(defun eliscript-service-restart (service)
  "Restart SERVICE's worker generation."
  (unless (eliscript-service-p service)
    (signal 'wrong-type-argument (list 'eliscript-service-p service)))
  (when (eliscript-service-closed service)
    (signal 'eliscript-service-error (list "service is closed")))
  (eliscript-worker-restart (eliscript-service-worker service)))

(defun eliscript-service-stop (service &optional force)
  "Stop SERVICE and fail its pending operations, using FORCE when non-nil."
  (unless (eliscript-service-p service)
    (signal 'wrong-type-argument (list 'eliscript-service-p service)))
  (unless (eliscript-service-closed service)
    (setf (eliscript-service-closed service) t)
    (eliscript-worker-stop (eliscript-service-worker service) force)))

(defun eliscript-service--error (code message operation)
  "Return a service error object for CODE, MESSAGE, and OPERATION."
  `((code . ,code) (message . ,message) (operation . ,operation)))

(defun eliscript-service--condition-error (code error-data operation)
  "Convert ERROR-DATA into a service error object."
  (eliscript-service--error
   code (error-message-string error-data) operation))

(defun eliscript-service--buffer-current-p (request)
  "Return non-nil when REQUEST still targets its original buffer version."
  (let ((buffer (eliscript-service-request-buffer request)))
    (or (null buffer)
        (and (buffer-live-p buffer)
             (= (eliscript-service-request-buffer-tick request)
                (with-current-buffer buffer
                  (buffer-chars-modified-tick)))))))

(defun eliscript-service--deliver (request value error-object)
  "Complete REQUEST with VALUE or ERROR-OBJECT exactly once."
  (unless (eliscript-service-request-done request)
    (let* ((operation (eliscript-service-request-operation request))
           (name (eliscript-service-operation-name operation))
           (error-value
            (cond
             ((eliscript-service-request-cancelled request)
              (eliscript-service--error
               "cancelled" "service request was cancelled" name))
             (error-object error-object)
             ((and (eq (eliscript-service-verify
                        (eliscript-service-request-service request))
                       'always)
                   (eq (eliscript-service-request-path request) 'accelerated)
                   (not (funcall
                         (eliscript-service-operation-equal operation)
                         (eliscript-service-request-expected request)
                         value)))
              (eliscript-service--error
               "verification-mismatch"
               "accelerated result disagrees with its reference" name))
             ((not (eliscript-service--buffer-current-p request))
              (eliscript-service--error
               "stale-buffer" "target buffer changed before completion" name)))))
      (unless error-value
        (let ((apply-function (eliscript-service-request-apply request))
              (buffer (eliscript-service-request-buffer request)))
          (when apply-function
            (condition-case error-data
                (with-current-buffer buffer
                  (atomic-change-group (funcall apply-function value)))
              (error
               (setq error-value
                     (eliscript-service--condition-error
                      "apply-error" error-data name)))))))
      (setf (eliscript-service-request-done request) t
            (eliscript-service-request-result request)
            (and (null error-value) value)
            (eliscript-service-request-error request) error-value)
      (funcall (eliscript-service-request-callback request)
               (and (null error-value) value) error-value))))

(defun eliscript-service--path (operation arguments requested)
  "Choose reference or accelerated path for OPERATION and ARGUMENTS."
  (when (and requested (not (memq requested '(reference accelerated))))
    (signal 'wrong-type-argument
            (list '(member reference accelerated) requested)))
  (or requested
      (let ((size
             (funcall (eliscript-service-operation-workload-size operation)
                      arguments)))
        (unless (and (integerp size) (>= size 0))
          (signal 'eliscript-service-error
                  (list "workload size must be a nonnegative integer"
                        (eliscript-service-operation-name operation)
                        size)))
        (if (< size (eliscript-service-operation-threshold operation))
            'reference
          'accelerated))))

(cl-defun eliscript-service-call
    (service name arguments callback
             &key path buffer apply progress metrics timeout-ms)
  "Invoke operation NAME on SERVICE and return a service request.

PATH may force `reference' or `accelerated'.  BUFFER captures a modification
version; APPLY runs inside an atomic change group only if that version remains
current after successful verification."
  (when (or (not (eliscript-service-p service))
            (eliscript-service-closed service))
    (signal 'eliscript-service-error (list "service is closed")))
  (unless (listp arguments)
    (signal 'wrong-type-argument (list 'listp arguments)))
  (unless (functionp callback)
    (signal 'wrong-type-argument (list 'functionp callback)))
  (when (and apply (not (bufferp buffer)))
    (signal 'eliscript-service-error
            (list "result application requires a target buffer")))
  (let* ((operation
          (or (gethash name (eliscript-service-operations service))
              (signal 'eliscript-service-error
                      (list "unknown service operation" name))))
         (selected (eliscript-service--path operation arguments path))
         (request
          (eliscript-service-request--create
           :service service
           :operation operation
           :path selected
           :callback callback
           :buffer buffer
           :buffer-tick (and buffer
                             (with-current-buffer buffer
                               (buffer-chars-modified-tick)))
           :apply apply)))
    (condition-case error-data
        (if (eq selected 'reference)
            (eliscript-service--deliver
             request
             (apply (eliscript-service-operation-reference operation)
                    arguments)
             nil)
          (progn
            (when (eq (eliscript-service-verify service) 'always)
              (setf (eliscript-service-request-expected request)
                    (apply (eliscript-service-operation-reference operation)
                           arguments)))
            (let* ((module (eliscript-service-module service))
                   (worker (eliscript-service-worker service))
                   (worker-callback
                    (lambda (value request-error)
                      (eliscript-service--deliver
                       request value request-error)))
                   (worker-id
                    (if (eliscript-service-operation-portable-name operation)
                        (eliscript-worker-call-portable
                         worker
                         (eliscript-service-module-path module)
                         (eliscript-service-operation-portable-name operation)
                         arguments worker-callback
                         :module-version (eliscript-service-module-version module)
                         :project-manifest
                         (eliscript-service-module-project-manifest module)
                         :progress progress :metrics metrics
                         :timeout-ms timeout-ms
                         :value-codec (eliscript-service-value-codec service)
                         :value-chunks (eliscript-service-value-chunks service))
                      (eliscript-worker-call
                       worker
                       (eliscript-service-module-path module)
                       (eliscript-service-operation-export-name operation)
                       arguments worker-callback
                       :module-version (eliscript-service-module-version module)
                       :project-manifest
                       (eliscript-service-module-project-manifest module)
                       :progress progress :metrics metrics
                       :timeout-ms timeout-ms
                       :value-codec (eliscript-service-value-codec service)
                       :value-chunks (eliscript-service-value-chunks service)))))
              (setf (eliscript-service-request-worker-id request) worker-id))))
      (error
       (eliscript-service--deliver
        request nil
        (eliscript-service--condition-error
         "dispatch-error" error-data name))))
    request))

(defun eliscript-service-cancel (request)
  "Cancel pending service REQUEST and suppress any later worker result."
  (when (and (eliscript-service-request-p request)
             (not (eliscript-service-request-done request)))
    (setf (eliscript-service-request-cancelled request) t)
    (let ((worker-id (eliscript-service-request-worker-id request)))
      (when worker-id
        (eliscript-worker-cancel
         (eliscript-service-worker
          (eliscript-service-request-service request))
         worker-id)))
    (eliscript-service--deliver request nil nil)
    t))

(defun eliscript-service--signal (error-object)
  "Signal the public condition represented by ERROR-OBJECT."
  (let* ((code (alist-get 'code error-object))
         (message (or (alist-get 'message error-object)
                      "service operation failed"))
         (condition
          (cond
           ((equal code "verification-mismatch")
            'eliscript-service-verification-error)
           ((equal code "stale-buffer") 'eliscript-service-stale-result)
           ((equal code "cancelled") 'eliscript-service-cancelled)
           (t 'eliscript-service-error))))
    (signal condition (list message error-object))))

(cl-defun eliscript-service-call-sync
    (service name arguments
             &key path buffer apply progress metrics timeout-ms)
  "Synchronously invoke operation NAME on SERVICE."
  (let (done result error-object)
    (eliscript-service-call
     service name arguments
     (lambda (value request-error)
       (setq result value error-object request-error done t))
     :path path :buffer buffer :apply apply :progress progress
     :metrics metrics :timeout-ms timeout-ms)
    (let ((worker (eliscript-service-worker service)))
      (while (and (not done) (eliscript-worker-live-p worker))
        (accept-process-output (eliscript-worker-process worker) 0.05)))
    (unless done
      (signal 'eliscript-service-error
              (list "service worker exited without a response")))
    (when error-object (eliscript-service--signal error-object))
    result))

(provide 'eliscript-service)

;;; eliscript-service.el ends here
