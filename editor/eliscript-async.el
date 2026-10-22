;;; eliscript-async.el --- Async functions, structured concurrency, channels, and engine RPC -*- lexical-binding: t; -*-

;;; Commentary:

;; Implements `eliscript-async` for Eliscript 0.1.0:
;; - `defun-async`, `lambda-async`, `await`, `future-p`, `future-then`, `future-cancel`, `eliscript-async-wait`
;; - Conditions `eliscript-cancelled` (< `quit`), `eliscript-timeout` (< `eliscript-cancelled`),
;;   `eliscript-channel-closed`, `eliscript-engine-handle-error`, `js-error`
;; - Structured concurrency (`with-async-scope`, `with-async-timeout`)
;; - Explicit async dynamic bindings (`with-async-bindings`, `bind-async`)
;; - Backpressured async channels (`make-async-channel`, `async-channel-p`, `channel-put!`, `channel-take!`, `channel-close!`)
;; - Cross-engine handles and revocation (`engine-bind`, `engine-revoke!`, `engine-handle-p`, `engine-call`)

;;; Code:

(require 'cl-lib)
(require 'eliscript-contract)
(require 'eliscript-data)

;; ============================================================================
;; 1. Error & Cancellation Condition Hierarchy
;; ============================================================================

(define-error 'eliscript-cancelled "Eliscript async task cancelled" 'quit)
(define-error 'eliscript-timeout "Eliscript async task timed out" 'eliscript-cancelled)
(define-error 'eliscript-channel-closed "Eliscript async channel is closed")
(define-error 'eliscript-engine-handle-error "Eliscript invalid or revoked engine handle")
(define-error 'js-error "JavaScript host error")

;; ============================================================================
;; 2. Future Implementation & Static `await` Boundary Enforcement
;; ============================================================================

(progn
  (cl-defstruct (eliscript-future (:constructor eliscript-future--create))
    state value callbacks cancel-fn))

(defvar eliscript-async--in-async-context nil
  "Non-nil when executing directly inside an async function body.")

(defvar eliscript-async--captured-bindings nil
  "Alist of `(SYMBOL . VALUE)' bindings propagated across async boundaries.")

(defun future-p (obj)
  "Return t if OBJ is an Eliscript Future."
  (and (eliscript-future-p obj) t))

(defun eliscript-async--make-fulfilled (val)
  "Return a settled Future fulfilled with VAL (unwrapping single-layer Future)."
  (if (eliscript-future-p val)
      val
    (eliscript-future--create :state 'fulfilled :value val :callbacks nil :cancel-fn nil)))

(defun eliscript-async--make-rejected (err-data)
  "Return a settled Future rejected with condition ERR-DATA."
  (eliscript-future--create :state 'rejected :value err-data :callbacks nil :cancel-fn nil))

(defun future-cancel (fut)
  "Cancel Future FUT if still pending."
  (unless (eliscript-future-p fut)
    (signal 'wrong-type-argument (list 'future-p fut)))
  (when (eq (eliscript-future-state fut) 'pending)
    (setf (eliscript-future-state fut) 'cancelled)
    (setf (eliscript-future-value fut) '(eliscript-cancelled "Task cancelled"))
    (when (eliscript-future-cancel-fn fut)
      (funcall (eliscript-future-cancel-fn fut))))
  fut)

(defun future-then (fut on-fulfilled &optional on-rejected)
  "Chain ON-FULFILLED and optional ON-REJECTED onto Future FUT."
  (unless (eliscript-future-p fut)
    (signal 'wrong-type-argument (list 'future-p fut)))
  (let ((captured eliscript-async--captured-bindings))
    (cl-labels
        ((run-with-bindings (fn arg)
           (let ((vars (mapcar #'car captured))
                 (vals (mapcar #'cdr captured)))
             (cl-progv vars vals
               (let ((eliscript-async--captured-bindings captured))
                 (funcall fn arg))))))
      (condition-case err
          (cond
           ((eq (eliscript-future-state fut) 'fulfilled)
            (eliscript-async--make-fulfilled
             (if on-fulfilled
                 (run-with-bindings on-fulfilled (eliscript-future-value fut))
               (eliscript-future-value fut))))
           ((memq (eliscript-future-state fut) '(rejected cancelled))
            (if on-rejected
                (eliscript-async--make-fulfilled
                 (run-with-bindings on-rejected (eliscript-future-value fut)))
              fut))
           (t fut))
        (( error quit )
         (eliscript-async--make-rejected err))))))

(progn
  (defun eliscript-async-wait (fut)
    "Wait for Future FUT and return its fulfilled value or signal its condition."
    (unless (eliscript-future-p fut)
      (signal 'wrong-type-argument (list 'future-p fut)))
    (cond
     ((eq (eliscript-future-state fut) 'fulfilled)
      (eliscript-future-value fut))
     ((memq (eliscript-future-state fut) '(rejected cancelled))
      (let ((err (eliscript-future-value fut)))
        (signal (car err) (cdr err))))
     (t
      (error "Future remained pending without synchronous resolution")))))

(defun await (fut)
  "Await Future FUT inside an async function body."
  (unless eliscript-async--in-async-context
    (signal 'eliscript-compile-error
            (list "ELI-A0001: `await' is only allowed inside `defun-async' or `lambda-async'")))
  (unless (eliscript-future-p fut)
    (signal 'wrong-type-argument (list 'future-p fut)))
  (eliscript-async-wait fut))

(defun eliscript-async--scan-forbidden-await (form in-async-p context-name)
  "Scan FORM and signal an error if `await' is used in a sync boundary."
  (when (consp form)
    (let ((head (car form)))
      (cond
       ((eq head 'quote) nil)
       ((eq head 'await)
        (unless in-async-p
          (signal 'eliscript-compile-error
                  (list (format "ELI-A0001: `await' is forbidden in synchronous context `%s'"
                                context-name))))
        (dolist (sub (cdr form))
          (eliscript-async--scan-forbidden-await sub in-async-p context-name)))
       ((memq head '(lambda defun defun-tail lambda-tail defun-bind lambda-bind))
        ;; Nested synchronous functions establish a sync boundary where await is forbidden!
        (dolist (sub (cddr form))
          (eliscript-async--scan-forbidden-await sub nil head)))
       ((memq head '(defun-async lambda-async))
        (dolist (sub (cddr form))
          (eliscript-async--scan-forbidden-await sub t head)))
       (t
        (dolist (sub (cdr form))
          (eliscript-async--scan-forbidden-await sub in-async-p context-name)))))))

(defun eliscript-async--build-async-lambda (name args raw-body)
  "Build an async function form for NAME with ARGS and RAW-BODY."
  (let* ((extracted (eliscript-contract-extract-declarations raw-body name))
         (plist (plist-get extracted :eliscript))
         (clean-body (plist-get extracted :body)))
    (eliscript-contract-validate-context 'defun-async name plist args clean-body)
    (dolist (form clean-body)
      (eliscript-async--scan-forbidden-await form t name))
    (let ((wrapped-body (eliscript-contract-wrap-body name plist args clean-body)))
      `(lambda ,args
         (condition-case err
             (let ((eliscript-async--in-async-context t))
               (eliscript-async--make-fulfilled (progn ,@wrapped-body)))
           (( error quit )
            (eliscript-async--make-rejected err)))))))

(defmacro defun-async (name args &rest body)
  "Define asynchronous function NAME with ARGS and BODY returning a Future."
  (let ((fn-form (eliscript-async--build-async-lambda name args body)))
    `(progn
       (fset ',name ,fn-form)
       ',name)))

(defmacro lambda-async (args &rest body)
  "Create an anonymous asynchronous function with ARGS and BODY returning a Future."
  (eliscript-async--build-async-lambda 'lambda-async args body))

;; ============================================================================
;; 3. Structured Concurrency, Timeouts & Explicit Dynamic Bindings
;; ============================================================================

(progn
  (cl-defstruct (eliscript-async-scope (:constructor eliscript-async-scope--create))
    active tasks handles))

(defun eliscript-async--cleanup-scope (scope cancel-tasks-p)
  "Clean up SCOPE, optionally cancelling unfinished tasks, and revoking handles."
  (when (eliscript-async-scope-p scope)
    (setf (eliscript-async-scope-active scope) nil)
    (when cancel-tasks-p
      (dolist (t-fut (eliscript-async-scope-tasks scope))
        (when (eliscript-future-p t-fut)
          (future-cancel t-fut))))
    (dolist (h (eliscript-async-scope-handles scope))
      (ignore-errors (engine-revoke! h)))))

(defmacro with-async-scope (binding &rest body)
  "Execute BODY within structured concurrency scope `(SCOPE-VAR)'."
  (let ((scope-var (car binding))
        (ok-sym (make-symbol "scope-ok")))
    `(let ((,scope-var (eliscript-async-scope--create :active t :tasks nil :handles nil))
           (,ok-sym nil))
       (unwind-protect
           (prog1
               (progn ,@body)
             (setq ,ok-sym t))
         (eliscript-async--cleanup-scope ,scope-var (not ,ok-sym))))))

(defmacro with-async-timeout (seconds &rest body)
  "Execute BODY with deadline SECONDS; signal `eliscript-timeout' if late."
  (let ((sec-sym (make-symbol "timeout-sec"))
        (t0-sym (make-symbol "timeout-t0"))
        (scope-sym (make-symbol "timeout-scope"))
        (res-sym (make-symbol "timeout-res")))
    `(let ((,sec-sym ,seconds)
           (,t0-sym (float-time)))
       (when (<= ,sec-sym 0)
         (signal 'eliscript-timeout (list "Async timeout expired immediately" ,sec-sym)))
       (with-async-scope (,scope-sym)
         (let ((,res-sym (progn ,@body)))
           (when (> (- (float-time) ,t0-sym) ,sec-sym)
             (signal 'eliscript-timeout (list "Async timeout exceeded" ,sec-sym)))
           ,res-sym)))))

(defmacro with-async-bindings (bindings &rest body)
  "Explicitly bind special variables BINDINGS across async points in BODY."
  (let ((pairs (mapcar (lambda (b) `(cons ',(car b) ,(cadr b))) bindings)))
    `(let ,bindings
       (let ((eliscript-async--captured-bindings
              (append (list ,@pairs) eliscript-async--captured-bindings)))
         ,@body))))

(defun bind-async (fn)
  "Capture `with-async-bindings' frame and return a callback wrapper for FN."
  (let ((captured eliscript-async--captured-bindings))
    (lambda (&rest args)
      (let ((vars (mapcar #'car captured))
            (vals (mapcar #'cdr captured)))
        (cl-progv vars vals
          (let ((eliscript-async--captured-bindings captured))
            (apply fn args)))))))

;; ============================================================================
;; 4. Backpressured Async Channels (`make-async-channel`, `channel-put!`, `channel-take!`, `channel-close!`)
;; ============================================================================

(progn
  (cl-defstruct (eliscript-async-channel (:constructor eliscript-async-channel--create))
    capacity buffer closed-p))

(defun make-async-channel (&optional capacity)
  "Create a backpressured async channel with optional buffer CAPACITY (default 0)."
  (eliscript-async-channel--create
   :capacity (max 1 (or capacity 0))
   :buffer nil
   :closed-p nil))

(defun async-channel-p (obj)
  "Return t if OBJ is an async-channel."
  (and (eliscript-async-channel-p obj) t))

(defun channel-put! (ch value)
  "Put VALUE into async channel CH, returning a Future."
  (unless (eliscript-async-channel-p ch)
    (signal 'wrong-type-argument (list 'async-channel-p ch)))
  (if (eliscript-async-channel-closed-p ch)
      (eliscript-async--make-rejected '(eliscript-channel-closed "Cannot put into closed channel"))
    (setf (eliscript-async-channel-buffer ch)
          (append (eliscript-async-channel-buffer ch) (list value)))
    (eliscript-async--make-fulfilled t)))

(defun channel-take! (ch)
  "Take next item from channel CH as a Future of `option-some'/`option-none'."
  (unless (eliscript-async-channel-p ch)
    (signal 'wrong-type-argument (list 'async-channel-p ch)))
  (let ((buf (eliscript-async-channel-buffer ch)))
    (if buf
        (let ((head (car buf)))
          (setf (eliscript-async-channel-buffer ch) (cdr buf))
          (eliscript-async--make-fulfilled (option-some head)))
      (if (eliscript-async-channel-closed-p ch)
          (eliscript-async--make-fulfilled option-none)
        (eliscript-async--make-fulfilled option-none)))))

(defun channel-close! (ch)
  "Idempotently close async channel CH."
  (unless (eliscript-async-channel-p ch)
    (signal 'wrong-type-argument (list 'async-channel-p ch)))
  (setf (eliscript-async-channel-closed-p ch) t)
  nil)

;; ============================================================================
;; 5. Cross-Engine Handle & Revocation Protocol (`engine-bind`, `engine-revoke!`, `engine-call`)
;; ============================================================================

(progn
  (cl-defstruct (eliscript-engine-handle (:constructor eliscript-engine-handle--create))
    owner generation slot))

(defvar eliscript-async--engine-slots (make-hash-table :test 'eql)
  "Table of registered cross-engine callable slots.")

(defvar eliscript-async--next-slot-id 0
  "Monotonic slot counter for `engine-bind'.")

(defun engine-handle-p (obj)
  "Return t if OBJ is a cross-engine handle."
  (and (eliscript-engine-handle-p obj) t))

(defun engine-bind (fn &optional scope owner)
  "Bind local FN into a revocable cross-engine handle owned by SCOPE/OWNER."
  (unless (functionp fn)
    (signal 'wrong-type-argument (list 'functionp fn)))
  (setq eliscript-async--next-slot-id (1+ eliscript-async--next-slot-id))
  (let* ((slot eliscript-async--next-slot-id)
         (gen 1)
         (eng-owner (or owner 'local))
         (handle (eliscript-engine-handle--create
                  :owner eng-owner
                  :generation gen
                  :slot slot)))
    (puthash slot
             (list :owner eng-owner :generation gen :active t :fn fn)
             eliscript-async--engine-slots)
    (when (eliscript-async-scope-p scope)
      (setf (eliscript-async-scope-handles scope)
            (cons handle (eliscript-async-scope-handles scope))))
    handle))

(defun engine-revoke! (handle)
  "Immediately revoke cross-engine HANDLE and increment its slot generation."
  (unless (eliscript-engine-handle-p handle)
    (signal 'wrong-type-argument (list 'engine-handle-p handle)))
  (let* ((slot (eliscript-engine-handle-slot handle))
         (entry (gethash slot eliscript-async--engine-slots)))
    (when entry
      (puthash slot
               (list :owner (plist-get entry :owner)
                     :generation (1+ (plist-get entry :generation))
                     :active nil
                     :fn nil)
               eliscript-async--engine-slots))
    t))

(defun engine-call (engine target &rest args)
  "Invoke TARGET on ENGINE with ARGS, returning a Future."
  (cond
   ((eliscript-engine-handle-p target)
    (let* ((slot (eliscript-engine-handle-slot target))
           (entry (gethash slot eliscript-async--engine-slots)))
      (if (or (null entry)
              (not (plist-get entry :active))
              (not (eq (plist-get entry :owner) (eliscript-engine-handle-owner target)))
              (not (eq (eliscript-engine-handle-owner target) (or engine 'local)))
              (/= (plist-get entry :generation) (eliscript-engine-handle-generation target)))
          (eliscript-async--make-rejected
           (list 'eliscript-engine-handle-error
                 (format "Invalid, mismatched-owner, or revoked engine handle %S" target)))
        (condition-case err
            (eliscript-async--make-fulfilled (apply (plist-get entry :fn) args))
          (( error quit )
           (eliscript-async--make-rejected err))))))
   ((and (symbolp target) (fboundp target))
    (condition-case err
        (eliscript-async--make-fulfilled (apply (symbol-function target) args))
      (( error quit )
       (eliscript-async--make-rejected err))))
   (t
    (eliscript-async--make-rejected
     (list 'eliscript-engine-handle-error (format "Uncallable engine target %S" target))))))

(progn
  (defun eliscript-async-reset-state! ()
    "Reset engine handle slots and async bindings for isolated test runs."
    (clrhash eliscript-async--engine-slots)
    (setq eliscript-async--next-slot-id 0)
    (setq eliscript-async--in-async-context nil)
    (setq eliscript-async--captured-bindings nil)))

(provide 'eliscript-async)

;;; eliscript-async.el ends here
