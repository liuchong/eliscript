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
(require 'eliscript-async-lowering)
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

(defun future-state (fut)
  "Return the current state symbol of Future FUT."
  (unless (eliscript-future-p fut)
    (signal 'wrong-type-argument (list 'future-p fut)))
  (eliscript-future-state fut))

(defun eliscript-async--settle-future (fut new-state new-val)
  "Transition pending Future FUT to NEW-STATE with NEW-VAL and run callbacks."
  (when (eq (eliscript-future-state fut) 'pending)
    (setf (eliscript-future-state fut) new-state)
    (setf (eliscript-future-value fut) new-val)
    (let ((cbs (eliscript-future-callbacks fut)))
      (setf (eliscript-future-callbacks fut) nil)
      (dolist (cb cbs)
        (funcall cb)))))

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
    (let ((cancel (eliscript-future-cancel-fn fut))
          (callbacks (eliscript-future-callbacks fut)))
      (setf (eliscript-future-callbacks fut) nil)
      (eliscript-async--settle-future fut 'cancelled '(eliscript-cancelled "Task cancelled"))
      (when cancel (funcall cancel))
      (dolist (callback callbacks) (funcall callback))))
  fut)

(defun eliscript-async--adopt (child value)
  "Resolve CHILD from VALUE, subscribing if VALUE is an unsettled Future."
  (cond
   ((eq child value) (eliscript-async--settle-future child 'rejected '(error "Future resolution cycle")))
   ((eliscript-future-p value)
    (let ((forward (lambda ()
                     (eliscript-async--settle-future child (eliscript-future-state value)
                                                   (eliscript-future-value value)))))
      (if (eq (eliscript-future-state value) 'pending)
          (setf (eliscript-future-callbacks value)
                (append (eliscript-future-callbacks value) (list forward)))
        (funcall forward))
      (when (eq (future-state child) 'pending)
        (setf (eliscript-future-cancel-fn child)
              (lambda ()
                (setf (eliscript-future-callbacks value) (delq forward (eliscript-future-callbacks value)))
                (future-cancel value))))))
   (t (eliscript-async--settle-future child 'fulfilled value)))
  child)

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
           (t
            (let ((child (eliscript-future--create :state 'pending :value nil :callbacks nil :cancel-fn nil)))
              (setf (eliscript-future-callbacks fut)
                    (append (eliscript-future-callbacks fut)
                            (list (lambda ()
                                    (condition-case cb-err
                                        (cond
                                         ((eq (eliscript-future-state fut) 'fulfilled)
                                          (let ((res (if on-fulfilled
                                                         (run-with-bindings on-fulfilled (eliscript-future-value fut))
                                                       (eliscript-future-value fut))))
                                            (eliscript-async--adopt child res)))
                                         (t
                                          (if on-rejected
                                              (let ((res (run-with-bindings on-rejected (eliscript-future-value fut))))
                                                (eliscript-async--adopt child res))
                                            (eliscript-async--settle-future child (eliscript-future-state fut) (eliscript-future-value fut)))))
                                      (( error quit )
                                       (eliscript-async--settle-future child 'rejected cb-err)))))))
              child)))
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

(defvar eliscript-async--task-bindings nil
  "Outer-to-inner mutable binding cells owned by the active async task.")

(defun eliscript-async--sync-bindings (bindings)
  "Save each visible binding's current value without overwriting hidden cells."
  (let ((seen (make-hash-table :test #'eq)))
    (dolist (cell (reverse bindings))
      (unless (gethash (car cell) seen)
        (puthash (car cell) t seen)
        (setcdr cell (symbol-value (car cell)))))))

(defun eliscript-async--restore-binding-values (bindings)
  "Reinstall visible BINDINGS after a nested scope restored stale host values."
  (let ((seen (make-hash-table :test #'eq)))
    (dolist (cell (reverse bindings))
      (unless (gethash (car cell) seen)
        (puthash (car cell) t seen)
        (set (car cell) (cdr cell))))))

(defun eliscript-async--capture ()
  "Capture binding identities shared by all continuations of the task."
  (eliscript-async--sync-bindings eliscript-async--task-bindings)
  (copy-sequence eliscript-async--task-bindings))

(defun eliscript-async--run-bindings (bindings thunk)
  "Run THUNK under shared BINDINGS and save mutations before restoring callers."
  (let ((outer eliscript-async--task-bindings))
    (eliscript-async--sync-bindings outer)
    (unwind-protect
        (cl-progv (mapcar #'car bindings) (mapcar #'cdr bindings)
          (let ((eliscript-async--task-bindings bindings)
                (eliscript-async--in-async-context t))
            (unwind-protect (funcall thunk)
              (eliscript-async--sync-bindings eliscript-async--task-bindings))))
      ;; cl-progv restores its saved host values; a reentrant continuation may
      ;; have updated the same binding cells while the caller was suspended.
      (dolist (cell outer)
        (when (memq cell bindings) (set (car cell) (cdr cell)))))))

(defun eliscript-async--binding-scope (thunk)
  "Synchronize the caller around a source binding scope executed by THUNK."
  (let ((outer eliscript-async--task-bindings))
    (eliscript-async--sync-bindings outer)
    (unwind-protect (funcall thunk)
      (eliscript-async--restore-binding-values outer))))

(defun eliscript-async--with-bindings (names dynamic-mode thunk)
  "Register actual bindings NAMES for THUNK, respecting DYNAMIC-MODE and defvar."
  (let ((cells (mapcar (lambda (name) (cons name (symbol-value name)))
                      (cl-remove-if-not (lambda (name) (or dynamic-mode (special-variable-p name))) names))))
    (let ((eliscript-async--task-bindings (append eliscript-async--task-bindings cells)))
      (unwind-protect (funcall thunk)
        (eliscript-async--sync-bindings eliscript-async--task-bindings)))))

(defun eliscript-async--source-symbols (forms)
  "Collect source symbols for a dynamically scoped coroutine environment."
  (let ((pending (copy-sequence forms)) result)
    (while pending
      (let ((form (pop pending)))
        (cond
         ((and (symbolp form) form (not (eq form t)) (not (keywordp form))
               (not (string-prefix-p "&" (symbol-name form))))
          (cl-pushnew form result))
         ((consp form)
          (unless (memq (car form) '(quote function lambda defun))
            (push (car form) pending)
            (push (cdr form) pending))))))
    result))

(defun eliscript-async--build-async-lambda (name args raw-body)
  "Build an async function form for NAME with ARGS and RAW-BODY."
  (let* ((extracted (eliscript-contract-extract-declarations raw-body name))
         (plist (plist-get extracted :eliscript))
         (clean-body (plist-get extracted :body))
         (source-lexical lexical-binding)
         (symbols (unless source-lexical (eliscript-async--source-symbols (cons args clean-body))))
         (parameters (cl-remove-if (lambda (x) (or (not (symbolp x))
                                    (string-prefix-p "&" (symbol-name x)))) args)))
    (eliscript-contract-validate-context 'defun-async name plist args clean-body)
    (dolist (form clean-body) (eliscript-async--scan-forbidden-await form t name))
    (let* ((wrapped (eliscript-contract-wrap-body name plist args clean-body))
           (lowered (eliscript-async--lower-body wrapped (unless source-lexical parameters) (not source-lexical)))
           (renamed (mapcar (lambda (p) (cons p (make-symbol (symbol-name p)))) parameters))
           (private-args (if source-lexical args
                           (mapcar (lambda (arg) (or (cdr (assq arg renamed)) arg)) args)))
           (registered `(eliscript-async--with-bindings ',parameters ,(not source-lexical) (lambda () ,lowered)))
           (entry `(eliscript-async--binding-scope
                     (lambda () ,(if source-lexical registered
                       `(let ,(mapcar (lambda (pair) (list (car pair) (cdr pair))) renamed) ,registered)))))
           (error-symbol (make-symbol "async-error"))
           (fn `(lambda ,private-args
                  (condition-case ,error-symbol
                      (let ((eliscript-async--in-async-context t))
                        (eliscript-async--make-fulfilled ,entry))
                    ((error quit) (eliscript-async--make-rejected ,error-symbol))))))
      (if source-lexical fn `(eval ',fn ',symbols)))))

(defun eliscript-async--await (source continuation bindings)
  "Resume CONTINUATION with SOURCE's value under task-local BINDINGS."
  (unless (future-p source) (signal 'wrong-type-argument (list 'future-p source)))
  (let ((child (future-then source
                 (lambda (value)
                   (eliscript-async--run-bindings bindings (lambda () (funcall continuation value)))))))
    (when (eq (future-state child) 'pending)
      (let ((cancel (eliscript-future-cancel-fn child)))
        (setf (eliscript-future-cancel-fn child)
              (lambda () (when cancel (funcall cancel)) (future-cancel source)))))
    child))

(defun eliscript-async--protect (body failure cleanup)
  "Apply asynchronous error handling and finalization to BODY."
  (let* ((bindings (eliscript-async--capture))
         (source (condition-case err
                     (eliscript-async--make-fulfilled (eliscript-async--run-bindings bindings body))
                   ((error quit) (eliscript-async--make-rejected err)))))
    (when failure
      (setq source (future-then source nil (lambda (error)
        (eliscript-async--run-bindings bindings (lambda () (funcall failure error)))))))
    (if (not cleanup) source
      (let* ((cleaned nil)
             (finish (lambda () (unless cleaned (setq cleaned t) (eliscript-async--run-bindings bindings cleanup))))
             (result (future-then source
                       (lambda (value) (future-then (eliscript-async--protect finish nil nil) (lambda (_) value)))
                       (lambda (error) (future-then (eliscript-async--protect finish nil nil)
                                        (lambda (_) (signal (car error) (cdr error))))))))
        (when (eq (future-state result) 'pending)
          (setf (eliscript-future-cancel-fn result)
                (lambda () (future-cancel source) (eliscript-async--protect finish nil nil))))
        result))))


(defconst eliscript-async--next (make-symbol "async-loop-next"))

(defun eliscript-async--loop (step &optional context)
  "Trampoline STEP while retaining CONTEXT's mutable binding cells."
  (let* ((bindings (or context (eliscript-async--capture)))
         (value (eliscript-async--run-bindings bindings step)))
    (while (or (eq value eliscript-async--next)
               (and (future-p value) (eq (future-state value) 'fulfilled)
                    (eq (eliscript-future-value value) eliscript-async--next)))
      (setq value (eliscript-async--run-bindings bindings step)))
    (if (future-p value)
        (let ((child (future-then value (lambda (result)
                       (if (eq result eliscript-async--next) (eliscript-async--loop step bindings) result)))))
          (when (eq (future-state child) 'pending)
            (let ((cancel (eliscript-future-cancel-fn child)))
              (setf (eliscript-future-cancel-fn child)
                    (lambda () (when cancel (funcall cancel)) (future-cancel value)))))
          child)
      value)))

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
    capacity buffer putters takers closed-p))

(defun make-async-channel (&optional capacity)
  "Create a backpressured async channel with optional buffer CAPACITY (default 1)."
  (eliscript-async-channel--create
   :capacity (max 1 (or capacity 1))
   :buffer nil
   :putters nil
   :takers nil
   :closed-p nil))

(defun async-channel-p (obj)
  "Return t if OBJ is an async-channel."
  (and (eliscript-async-channel-p obj) t))

(defun channel-put! (ch value)
  "Put VALUE into async channel CH, returning a Future."
  (unless (eliscript-async-channel-p ch)
    (signal 'wrong-type-argument (list 'async-channel-p ch)))
  (cond
   ((eliscript-async-channel-closed-p ch)
    (eliscript-async--make-rejected '(eliscript-channel-closed "Cannot put into closed channel")))
   ((eliscript-async-channel-takers ch)
    (let ((taker (car (eliscript-async-channel-takers ch))))
      (setf (eliscript-async-channel-takers ch) (cdr (eliscript-async-channel-takers ch)))
      (eliscript-async--settle-future taker 'fulfilled (option-some value))
      (eliscript-async--make-fulfilled t)))
   ((< (length (eliscript-async-channel-buffer ch)) (eliscript-async-channel-capacity ch))
    (setf (eliscript-async-channel-buffer ch)
          (append (eliscript-async-channel-buffer ch) (list value)))
    (eliscript-async--make-fulfilled t))
   (t
    (let ((pending (eliscript-future--create :state 'pending :value nil :callbacks nil :cancel-fn nil)))
      (setf (eliscript-async-channel-putters ch)
            (append (eliscript-async-channel-putters ch) (list (cons value pending))))
      (setf (eliscript-future-cancel-fn pending)
            (lambda ()
              (setf (eliscript-async-channel-putters ch)
                    (cl-remove pending (eliscript-async-channel-putters ch) :key #'cdr :test #'eq))))
      pending))))

(defun channel-take! (ch)
  "Take next item from channel CH as a Future of `option-some'/`option-none'."
  (unless (eliscript-async-channel-p ch)
    (signal 'wrong-type-argument (list 'async-channel-p ch)))
  (let ((buf (eliscript-async-channel-buffer ch))
        (putters (eliscript-async-channel-putters ch)))
    (cond
     (buf
      (let ((head (car buf)))
        (setf (eliscript-async-channel-buffer ch) (cdr buf))
        (when putters
          (let ((putter (car putters)))
            (setf (eliscript-async-channel-putters ch) (cdr putters))
            (setf (eliscript-async-channel-buffer ch)
                  (append (eliscript-async-channel-buffer ch) (list (car putter))))
            (eliscript-async--settle-future (cdr putter) 'fulfilled t)))
        (eliscript-async--make-fulfilled (option-some head))))
     (putters
      (let ((putter (car putters)))
        (setf (eliscript-async-channel-putters ch) (cdr putters))
        (eliscript-async--settle-future (cdr putter) 'fulfilled t)
        (eliscript-async--make-fulfilled (option-some (car putter)))))
     ((eliscript-async-channel-closed-p ch)
      (eliscript-async--make-fulfilled option-none))
     (t
      (let ((pending (eliscript-future--create :state 'pending :value nil :callbacks nil :cancel-fn nil)))
        (setf (eliscript-async-channel-takers ch)
              (append (eliscript-async-channel-takers ch) (list pending)))
        (setf (eliscript-future-cancel-fn pending)
              (lambda ()
                (setf (eliscript-async-channel-takers ch)
                      (delq pending (eliscript-async-channel-takers ch)))))
        pending)))))

(defun channel-close! (ch)
  "Idempotently close async channel CH."
  (unless (eliscript-async-channel-p ch)
    (signal 'wrong-type-argument (list 'async-channel-p ch)))
  (setf (eliscript-async-channel-closed-p ch) t)
  (let ((takers (eliscript-async-channel-takers ch))
        (putters (eliscript-async-channel-putters ch)))
    (setf (eliscript-async-channel-takers ch) nil)
    (setf (eliscript-async-channel-putters ch) nil)
    (dolist (taker takers)
      (eliscript-async--settle-future taker 'fulfilled option-none))
    (dolist (putter putters)
      (eliscript-async--settle-future (cdr putter) 'rejected '(eliscript-channel-closed "Cannot put into closed channel"))))
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
  (let ((eng (or engine 'local)))
    (cond
     ((not (memq eng '(local self emacs)))
      (eliscript-async--make-rejected
       (list 'eliscript-engine-handle-error
             (format "Engine unavailable or not connected: %S" eng))))
     ((eliscript-engine-handle-p target)
      (let* ((slot (eliscript-engine-handle-slot target))
             (entry (gethash slot eliscript-async--engine-slots)))
        (if (or (null entry)
                (not (plist-get entry :active))
                (not (eq (plist-get entry :owner) (eliscript-engine-handle-owner target)))
                (not (eq (eliscript-engine-handle-owner target) eng))
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
       (list 'eliscript-engine-handle-error (format "Uncallable engine target %S" target)))))))

(progn
  (defun eliscript-async-reset-state! ()
    "Reset engine handle slots and async bindings for isolated test runs."
    (clrhash eliscript-async--engine-slots)
    (setq eliscript-async--next-slot-id 0)
    (setq eliscript-async--in-async-context nil)
    (setq eliscript-async--captured-bindings nil)))

(provide 'eliscript-async)

;;; eliscript-async.el ends here
