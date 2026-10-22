;;; eliscript-compat.el --- Unified 0.1.0 entry point, definition-identity activation, and evaluator -*- lexical-binding: t; -*-

;;; Commentary:

;; Provides the umbrella `(require 'eliscript)` integration, definition-identity
;; extension tracking, conflict detection, static contract validation for
;; standard `defun`, and `eliscript-compat-eval-string` for Eliscript 0.1.0.

;;; Code:

(require 'cl-lib)
(require 'eliscript-contract)
(require 'eliscript-data)
(require 'eliscript-bind)
(require 'eliscript-module)
(require 'eliscript-async)
(require 'eliscript-js)
(require 'eliscript-abi)

(defconst eliscript-compat--extension-exports
  '((eliscript-data
     persistent-list persistent-list-p persistent-vector persistent-vector-p
     persistent-map persistent-map-p persistent-set persistent-set-p
     persistent-queue persistent-queue-p persistent-sorted-map persistent-sorted-map-p
     persistent-sorted-set persistent-sorted-set-p
     value-get value-nth value-put value-assoc value-remove value-dissoc
     value-conj value-count value-empty-p value-into value-equal-p value-hash
     value-compare value-meta value-with-meta
     cl-defstruct-persistent struct-validate struct-json-schema struct-to-json struct-from-json
     defprotocol extend-protocol defclass-protocol reify-protocol
     cl-defgeneric-value cl-defmethod-value
     state-cell state-cell-p cell-value cell-update! cell-reset! cell-watch
     delay force realized-p memoize lazy-seq lazy-map lazy-filter lazy-take lazy-range
     map-transducer filter-transducer take-transducer seq-transduce
     with-transient conj! assoc! dissoc!
     result-ok result-error result-ok-p result-error-p result-value result-error-value result-bind
     option-some option-none option-some-p option-none-p option-value
     data-symbol data-symbol-p data-symbol-name data-symbol-namespace)
    (eliscript-bind
     let-bind let*-bind defun-bind lambda-bind pcase-value cond-predicate
     defun-case lambda-case let-const let*-const
     let-loop defun-tail lambda-tail recur trampoline
     thread-first thread-last thread-as thread-cond-first thread-cond-last
     thread-some-first thread-some-last
     fn-compose fn-partial fn-juxt fn-complement)
    (eliscript-async
     defun-async lambda-async await future-p future-then future-cancel
     with-async-scope with-async-timeout with-async-bindings bind-async
     make-async-channel async-channel-p channel-put! channel-take! channel-close!
     engine-bind engine-revoke! engine-handle-p engine-call eliscript-async-wait)
    (eliscript-module
     defmodule defun-lexical defvar-lexical defconst-lexical
     export-functions export-values import-functions import-values
     defmacro-checked macro-gensym macro-read-file)
    (eliscript-contract
     eliscript-contract-check-value)
    (eliscript-js
     js-false js-null js-undefined js-false-p js-null-p js-undefined-p js-nullish-p
     js-import js-array js-object js-get js-get-raw js-put js-call js-call-raw
     js-new js-expr js-divide js-remainder js-length js-substring
     js-regexp js-regexp-p js-regexp-find js-regexp-matches js-regexp-seq js-regexp-replace)
    (eliscript-abi
     with-abi-memory mem-size mem-grow
     mem-load-u8 mem-load-u16 mem-load-u32 mem-load-f64
     mem-store-u8 mem-store-u16 mem-store-u32 mem-store-f64
     word-add word-sub word-mul word-div word-and word-or word-xor word-shl word-shr))
  "Exported symbols per `1 + 5 + 2' extension library.")

(defvar eliscript-compat--canonical-fn-cells (make-hash-table :test 'eq)
  "Canonical function cells for all extension symbols.")

(dolist (group eliscript-compat--extension-exports)
  (dolist (sym (cdr group))
    (when (fboundp sym)
      (puthash sym (symbol-function sym) eliscript-compat--canonical-fn-cells))))

(defvar eliscript-compat--session-user-defs (make-hash-table :test 'eq)
  "Symbols defined by user code in the current evaluation session.")

(defvar eliscript-compat--session-active-libs nil
  "List of extension libraries activated in the current session.")

(defvar eliscript-compat--session-touched-symbols nil
  "Symbols created or modified during the current evaluation session.")

(progn
  (defun eliscript-compat-reset-state! ()
    "Restore clean 0.1.0 evaluation state and canonical extension bindings."
    (eliscript-contract-reset-state!)
    (eliscript-data-reset-state!)
    (eliscript-module-reset-state!)
    (eliscript-async-reset-state!)
    (dolist (sym eliscript-compat--session-touched-symbols)
      (unless (gethash sym eliscript-compat--canonical-fn-cells)
        (fmakunbound sym)
        (makunbound sym)
        (setplist sym nil)))
    (maphash (lambda (sym fn) (fset sym fn))
             eliscript-compat--canonical-fn-cells)
    (clrhash eliscript-compat--session-user-defs)
    (setq eliscript-compat--session-active-libs nil)
    (setq eliscript-compat--session-touched-symbols nil)))

(defun eliscript-compat--activate-lib (lib-sym)
  "Activate extension library LIB-SYM, checking for user symbol conflicts."
  (if (eq lib-sym 'eliscript)
      (dolist (sub '(eliscript-data eliscript-bind eliscript-async eliscript-module eliscript-contract))
        (eliscript-compat--activate-lib sub))
    (let ((exports (cdr (assq lib-sym eliscript-compat--extension-exports))))
      (when exports
        (dolist (sym exports)
          (when (gethash sym eliscript-compat--session-user-defs)
            (signal 'eliscript-compile-error
                    (list (format "ELI-M0001: extension `%S' symbol `%S' conflicts with existing user definition"
                                  lib-sym sym))))
          (let ((canon (gethash sym eliscript-compat--canonical-fn-cells)))
            (when canon
              (fset sym canon))))
        (cl-pushnew lib-sym eliscript-compat--session-active-libs)))))

(defun eliscript-compat--preprocess-form (form)
  "Pre-scan and transform FORM for definition-identity and static contracts."
  (if (not (consp form))
      form
    (let ((head (car form)))
      (cond
       ((eq head 'quote) form)
       ((eq head 'progn)
        `(progn ,@(mapcar #'eliscript-compat--preprocess-form (cdr form))))
       ((and (eq head 'require)
             (consp (cadr form))
             (eq (caadr form) 'quote))
        (let ((lib (cadadr form)))
          (if (or (eq lib 'eliscript)
                  (assq lib eliscript-compat--extension-exports))
              (progn
                (eliscript-compat--activate-lib lib)
                `',lib)
            form)))
       ((eq head 'defun)
        (let* ((name (nth 1 form))
               (args (nth 2 form))
               (raw-body (nthcdr 3 form))
               (extracted (eliscript-contract-extract-declarations raw-body name))
               (plist (plist-get extracted :eliscript))
               (doc (plist-get extracted :doc))
               (clean-body (plist-get extracted :body)))
          (puthash name t eliscript-compat--session-user-defs)
          (push name eliscript-compat--session-touched-symbols)
          (when plist
            (eliscript-contract-validate-context 'defun name plist args clean-body))
          (when (memq 'eliscript-async eliscript-compat--session-active-libs)
            (dolist (bform clean-body)
              (eliscript-async--scan-forbidden-await bform nil name)))
          (let ((wrapped (if plist
                             (eliscript-contract-wrap-body name plist args clean-body)
                           clean-body)))
            `(defun ,name ,args
               ,@(when doc (list doc))
               ,@wrapped))))
       ((memq head '(defvar defconst defmacro))
        (let ((name (nth 1 form)))
          (when (symbolp name)
            (push name eliscript-compat--session-touched-symbols)))
        form)
       (t form)))))

(progn
  (defun eliscript-compat-eval-string (source)
    "Read, statically check, and evaluate all forms in SOURCE string."
    (with-temp-buffer
      (insert source)
      (goto-char (point-min))
      (let ((last-val nil))
        (condition-case nil
            (while t
              (let* ((raw-form (read (current-buffer)))
                     (checked-form (eliscript-compat--preprocess-form raw-form)))
                (setq last-val (eval checked-form t))))
          (end-of-file last-val))))))

(provide 'eliscript-compat)

;;; eliscript-compat.el ends here
