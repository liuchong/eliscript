;;; eliscript-contract.el --- Static declarations and runtime contracts for Eliscript 0.1.0 -*- lexical-binding: t; -*-

;;; Commentary:

;; Implements `(declare (eliscript ...))` parsing, static contract validation
;; (`:pure`, `:portable`, `:checked`, `:async`, `:destructure`, `:abi`,
;; `:export`, `:inputs`), runtime pre/post-condition assertions (`:params`,
;; `:returns`, `:requires`, `:ensures`), and Emacs `defun-declarations-alist`
;; integration.

;;; Code:

(require 'cl-lib)

(define-error 'eliscript-compile-error "Eliscript compile error")
(define-error 'eliscript-declaration-error "Eliscript declaration error" 'eliscript-compile-error)
(define-error 'eliscript-contract-error "Eliscript static contract error" 'eliscript-compile-error)
(define-error 'eliscript-runtime-contract-error "Eliscript runtime contract violation")

(defconst eliscript-contract--valid-keys
  '(:pure :portable :checked :async :destructure
    :params :returns :requires :ensures
    :abi :export :inputs)
  "Valid keys allowed inside `(declare (eliscript ...))`.")

(defconst eliscript-contract--impure-Heads
  '(puthash remhash clrhash setcar setcdr aset fset set put
    insert delete-region write-region message princ prin1 print
    random current-time float-time
    cell-update! cell-reset!
    channel-put! channel-take! channel-close!
    engine-call engine-revoke!
    mem-store-u8 mem-store-u16 mem-store-u32 mem-store-f64 mem-grow)
  "Operators forbidden inside `:pure t` functions.")

(defconst eliscript-contract--non-portable-heads
  '(current-buffer set-buffer with-current-buffer get-buffer get-buffer-create
    kill-buffer buffer-string buffer-substring point goto-char
    insert delete-region selected-window selected-frame window-buffer
    start-process make-process call-process process-send-string)
  "Host-specific Emacs operators forbidden inside `:portable t` functions.")

(defconst eliscript-contract--abi-forbidden-alloc-heads
  '(list cons vector make-vector make-hash-table
    persistent-list persistent-vector persistent-map persistent-set
    persistent-queue persistent-sorted-map persistent-sorted-set
    concat format make-string eval funcall apply)
  "Heap-allocating or dynamic operators forbidden inside `:abi` kernels.")

(defvar eliscript-contract--checked-functions (make-hash-table :test 'eq)
  "Registry of functions validated with static contracts.")

(progn
  (defun eliscript-contract-reset-state! ()
    "Reset cached contract state for isolated test runs."
    (clrhash eliscript-contract--checked-functions)))

(defun eliscript-contract--merge-plist (target source context-name)
  "Merge SOURCE eliscript declaration plist into TARGET for CONTEXT-NAME."
  (let ((cursor source)
        (out (copy-sequence target)))
    (while cursor
      (unless (cdr cursor)
        (signal 'eliscript-declaration-error
                (list (format "ELI-D0003: odd number of elements in (declare (eliscript ...)) for %s"
                              context-name))))
      (let ((k (car cursor))
            (v (cadr cursor)))
        (unless (memq k eliscript-contract--valid-keys)
          (signal 'eliscript-declaration-error
                  (list (format "ELI-D0004: unknown eliscript declaration key %S in %s"
                                k context-name))))
        (if (plist-member out k)
            (let ((existing (plist-get out k)))
              (unless (equal existing v)
                (signal 'eliscript-declaration-error
                        (list (format "ELI-D0005: contradictory declaration for %S in %s (%S vs %S)"
                                      k context-name existing v)))))
          (setq out (plist-put out k v))))
      (setq cursor (cddr cursor)))
    out))

(progn
  (defun eliscript-contract-extract-declarations (body &optional context-name)
    "Extract docstring and `(declare ...)` forms from BODY for CONTEXT-NAME.
Return a plist `(:doc DOC :eliscript PLIST :declarations DECLS :body BODY)'."
    (let ((doc nil)
          (eli-plist nil)
          (other-decls nil)
          (rest body)
          (scanning t))
      (while (and scanning rest)
        (let ((form (car rest)))
          (cond
           ((and (stringp form) (null doc) (cdr rest))
            (setq doc form)
            (setq rest (cdr rest)))
           ((and (consp form) (eq (car form) 'declare))
            (dolist (spec (cdr form))
              (if (and (consp spec) (eq (car spec) 'eliscript))
                  (setq eli-plist
                        (eliscript-contract--merge-plist
                         eli-plist (cdr spec) (or context-name 'anonymous)))
                (push spec other-decls)))
            (setq rest (cdr rest)))
           (t
            (setq scanning nil)))))
      (list :doc doc
            :eliscript eli-plist
            :declarations (nreverse other-decls)
            :body rest))))

(defun eliscript-contract--extract-arg-symbols (arglist)
  "Extract bound variable symbols from ARGLIST."
  (let ((syms nil))
    (dolist (item arglist)
      (cond
       ((and (symbolp item)
             (not (memq item '(&optional &rest &aux)))
             (not (keywordp item)))
        (push item syms))
       ((consp item)
        (when (symbolp (car item))
          (push (car item) syms)))))
    syms))

(defun eliscript-contract--scan-pure (form local-vars context-name)
  "Verify FORM contains no impure operations given LOCAL-VARS in CONTEXT-NAME."
  (when (consp form)
    (let ((head (car form)))
      (when (memq head eliscript-contract--impure-Heads)
        (signal 'eliscript-contract-error
                (list (format "ELI-C0001: impure operation `%S' is forbidden in :pure function %s"
                              head context-name))))
      (cond
       ((eq head 'quote) nil)
       ((eq head 'setq)
        (let ((pairs (cdr form)))
          (while pairs
            (let ((sym (car pairs))
                  (val (cadr pairs)))
              (unless (memq sym local-vars)
                (signal 'eliscript-contract-error
                        (list (format "ELI-C0001: mutating non-local variable `%S' via setq is forbidden in :pure function %s"
                                      sym context-name))))
              (eliscript-contract--scan-pure val local-vars context-name))
            (setq pairs (cddr pairs)))))
       ((memq head '(let let* let-const let*-const let-loop))
        (let* ((has-name (and (eq head 'let-loop) (symbolp (cadr form))))
               (bindings (if has-name (nth 2 form) (cadr form)))
               (body (if has-name (nthcdr 3 form) (cddr form)))
               (extended local-vars))
          (dolist (b bindings)
            (if (consp b)
                (progn
                  (eliscript-contract--scan-pure (cadr b) extended context-name)
                  (when (symbolp (car b))
                    (push (car b) extended)))
              (when (symbolp b)
                (push b extended))))
          (dolist (sub body)
            (eliscript-contract--scan-pure sub extended context-name))))
       ((memq head '(lambda lambda-async lambda-tail lambda-bind))
        (let ((ext (append (eliscript-contract--extract-arg-symbols (cadr form))
                           local-vars)))
          (dolist (sub (cddr form))
            (eliscript-contract--scan-pure sub ext context-name))))
       ((memq head '(dolist dotimes))
        (let* ((spec (cadr form))
               (var (car spec))
               (ext (cons var local-vars)))
          (eliscript-contract--scan-pure (cadr spec) local-vars context-name)
          (dolist (sub (cddr form))
            (eliscript-contract--scan-pure sub ext context-name))))
       (t
        (dolist (sub (cdr form))
          (eliscript-contract--scan-pure sub local-vars context-name)))))))

(defun eliscript-contract--scan-portable (form context-name)
  "Verify FORM contains no non-portable host calls in CONTEXT-NAME."
  (when (consp form)
    (let ((head (car form)))
      (unless (eq head 'quote)
        (when (memq head eliscript-contract--non-portable-heads)
          (signal 'eliscript-contract-error
                  (list (format "ELI-C0002: host-specific operator `%S' is forbidden in :portable function %s"
                                head context-name))))
        (dolist (sub (cdr form))
          (eliscript-contract--scan-portable sub context-name))))))

(defun eliscript-contract--scan-abi (form abi-kind context-name)
  "Verify FORM conforms to ABI-KIND in CONTEXT-NAME."
  (cond
   ((and (eq abi-kind :numeric-f64) (or (stringp form) (vectorp form)))
    (signal 'eliscript-contract-error
            (list (format "ELI-B0001: heap literal `%S' is forbidden in :abi :numeric-f64 kernel %s"
                          form context-name))))
   ((consp form)
    (let ((head (car form)))
      (cond
       ((eq head 'quote)
        (signal 'eliscript-contract-error
                (list (format "ELI-B0001: quoted literal is forbidden in :abi %S kernel %s"
                              abi-kind context-name))))
       ((memq head eliscript-contract--abi-forbidden-alloc-heads)
        (signal 'eliscript-contract-error
                (list (format "ELI-B0001: dynamic or allocating operator `%S' is forbidden in :abi %S kernel %s"
                              head abi-kind context-name))))
       (t
        (dolist (sub (cdr form))
          (eliscript-contract--scan-abi sub abi-kind context-name))))))))

(progn
  (defun eliscript-contract-validate-context (context-kind name plist arglist body)
    "Validate declaration PLIST for CONTEXT-KIND NAME with ARGLIST and BODY."
    (when (memq context-kind '(defun lambda))
      (when (plist-get plist :async)
        (signal 'eliscript-declaration-error
                (list (format "ELI-D0001: ordinary %s `%s' cannot declare :async t; use defun-async or lambda-async"
                              context-kind name))))
      (when (plist-get plist :destructure)
        (signal 'eliscript-declaration-error
                (list (format "ELI-D0002: ordinary %s `%s' cannot declare :destructure t; use defun-bind or lambda-bind"
                              context-kind name)))))
    (when (and (plist-get plist :inputs)
               (not (eq context-kind 'defmacro-checked)))
      (signal 'eliscript-declaration-error
              (list (format "ELI-D0006: :inputs is only valid on defmacro-checked (in %s)" name))))
    (let ((abi (plist-get plist :abi)))
      (when abi
        (unless (memq abi '(:numeric-f64 :memory-u32))
          (signal 'eliscript-declaration-error
                  (list (format "ELI-B0001: unsupported :abi %S in %s (expected :numeric-f64 or :memory-u32)"
                                abi name))))
        (dolist (form body)
          (eliscript-contract--scan-abi form abi name))))
    (when (plist-get plist :export)
      (let ((exp (plist-get plist :export)))
        (unless (and (stringp exp) (> (length exp) 0))
          (signal 'eliscript-declaration-error
                  (list (format "ELI-D0007: :export must be a non-empty string in %s" name))))))
    (let ((locals (eliscript-contract--extract-arg-symbols arglist)))
      (when (plist-get plist :pure)
        (dolist (form body)
          (eliscript-contract--scan-pure form locals name)))
      (when (plist-get plist :portable)
        (dolist (form body)
          (eliscript-contract--scan-portable form name))))
    (when (and name (symbolp name))
      (puthash name plist eliscript-contract--checked-functions))
    t)

  (defun eliscript-contract-check-value (value spec context-label)
    "Check whether VALUE satisfies type or predicate SPEC in CONTEXT-LABEL."
    (let ((ok
           (cond
            ((eq spec :f64) (numberp value))
            ((eq spec :i32) (integerp value))
            ((eq spec :u32) (and (integerp value) (>= value 0)))
            ((eq spec :bool) (booleanp value))
            ((eq spec :string) (stringp value))
            ((eq spec :any) t)
            ((symbolp spec)
             (if (fboundp spec)
                 (funcall spec value)
               t))
            ((functionp spec)
             (funcall spec value))
            (t t))))
      (unless ok
        (signal 'eliscript-runtime-contract-error
                (list (format "Contract violation in %s: expected %S, got %S"
                              context-label spec value))))
      t))

  (defun eliscript-contract-wrap-body (name plist _arglist body)
    "Wrap BODY with runtime checks for `:params', `:requires', `:ensures'."
    (let ((params-spec (plist-get plist :params))
          (requires-spec (plist-get plist :requires))
          (returns-spec (plist-get plist :returns))
          (ensures-spec (plist-get plist :ensures)))
      (if (and (null params-spec)
               (null requires-spec)
               (null returns-spec)
               (null ensures-spec))
          body
        (let ((param-checks nil)
              (req-checks nil)
              (ens-checks nil)
              (res-sym (make-symbol "contract-result")))
          (dolist (item params-spec)
            (when (and (consp item)
                       (symbolp (car item))
                       (not (memq (car item) '(&optional &rest))))
              (let ((p-var (car item))
                    (p-type (cadr item)))
                (push `(eliscript-contract-check-value
                        ,p-var ',p-type ,(format "%s parameter %s" name p-var))
                      param-checks))))
          (dolist (req requires-spec)
            (push `(unless ,req
                     (signal 'eliscript-runtime-contract-error
                             (list ,(format "Precondition (:requires %S) failed in %s" req name))))
                  req-checks))
          (dolist (ens ensures-spec)
            (push `(unless ,ens
                     (signal 'eliscript-runtime-contract-error
                             (list ,(format "Postcondition (:ensures %S) failed in %s" ens name))))
                  ens-checks))
          `(,@(nreverse param-checks)
            ,@(nreverse req-checks)
            (let ((,res-sym (progn ,@body)))
              ,@(when returns-spec
                  `((eliscript-contract-check-value
                     ,res-sym ',returns-spec ,(format "%s return value" name))))
              ,@(when ens-checks
                  `((let ((result ,res-sym))
                      (ignore result)
                      ,@(nreverse ens-checks))))
              ,res-sym)))))))

(defun eliscript-contract--defun-declaration-handler (fn-name args &rest specs)
  "Handle `(declare (eliscript ...))` inside standard Emacs `defun'."
  (let ((plist (eliscript-contract--merge-plist nil specs fn-name)))
    (eliscript-contract-validate-context 'defun fn-name plist args nil)
    `(put ',fn-name 'eliscript-contract ',plist)))

(unless (assq 'eliscript defun-declarations-alist)
  (push (list 'eliscript #'eliscript-contract--defun-declaration-handler)
        defun-declarations-alist))

(provide 'eliscript-contract)

;;; eliscript-contract.el ends here
