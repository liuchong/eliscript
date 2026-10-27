;;; eliscript-compat.el --- Unified 0.1.0 entry point, definition-identity activation, and evaluator -*- lexical-binding: t; -*-

;;; Commentary:

;; Provides the umbrella `(require 'eliscript)` integration, definition-identity
;; extension tracking, conflict detection, static contract validation for
;; standard `defun`, and `eliscript-compat-eval-string` for Eliscript 0.1.0.

;;; Code:

(require 'cl-lib)
(require 'json)
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

(defvar eliscript-compat--accelerated-functions nil
  "Alist of (FN-SYM . ORIG-FN) modified by `eliscript-compat-accelerate-function'.")

(defconst eliscript-compat--project-directory
  (expand-file-name
   ".."
   (file-name-directory (or load-file-name buffer-file-name default-directory)))
  "Root directory of the Eliscript project.")

(declare-function eliscript-worker-live-p "eliscript-worker" (worker))
(declare-function eliscript-worker-call-sync "eliscript-worker"
                  (worker module export arguments &rest keys))
(declare-function eliscript-compile-file "eliscript" (input-file &optional output-file))

(progn
  (defun eliscript-compat-reset-state! ()
    "Restore clean 0.1.0 evaluation state and canonical extension bindings."
    (eliscript-contract-reset-state!)
    (eliscript-data-reset-state!)
    (eliscript-module-reset-state!)
    (eliscript-async-reset-state!)
    (dolist (pair eliscript-compat--accelerated-functions)
      (when (symbolp (car pair))
        (fset (car pair) (cdr pair))
        (put (car pair) 'eliscript-compat-native-function nil)))
    (setq eliscript-compat--accelerated-functions nil)
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
       ((memq head '(defvar defconst defmacro cl-defun))
        (let ((name (nth 1 form)))
          (when (symbolp name)
            (push name eliscript-compat--session-touched-symbols)))
        form)
       (t form)))))

(defun eliscript-compat--collect-defined-functions (source)
  "Return a list of function symbol names defined at top level in SOURCE."
  (let ((names nil))
    (with-temp-buffer
      (insert source)
      (goto-char (point-min))
      (condition-case nil
          (while t
            (let ((form (read (current-buffer))))
              (when (consp form)
                (let ((head (car form))
                      (second (nth 1 form)))
                  (cond
                   ((and (memq head '(defun cl-defun defun-case defun-bind defun-tail defun-async))
                         (symbolp second))
                    (cl-pushnew (symbol-name second) names :test #'equal))
                   ((eq head 'progn)
                    (dolist (sub (cdr form))
                      (when (and (consp sub)
                                 (memq (car sub) '(defun cl-defun defun-case defun-bind defun-tail defun-async))
                                 (symbolp (nth 1 sub)))
                        (cl-pushnew (symbol-name (nth 1 sub)) names :test #'equal)))))))))
        (end-of-file nil)))
    (nreverse names)))

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
          (end-of-file last-val)))))

  (defun eliscript-compat-eval-file (file)
    "Read and evaluate unmodified Emacs Lisp or Eliscript FILE in 0.1.0 session."
    (with-temp-buffer
      (insert-file-contents file)
      (eliscript-compat-eval-string (buffer-string))))

  (defun eliscript-compat--eliscript-string (text)
    "Return TEXT as a string literal readable by both Eliscript readers."
    (concat "\""
            (replace-regexp-in-string
             "[\"\\[:cntrl:]\177]"
             (lambda (match)
               (pcase (aref match 0)
                 (?\" "\\\"") (?\\ "\\\\") (?\n "\\n") (?\t "\\t") (?\r "\\r")
                 (c (format "\\u%04x" c))))
             text t t)
            "\""))

  (defun eliscript-compat--elisp-module-source (source function-names module-name)
    "Return Eliscript module text that evaluates Elisp SOURCE in a session.
FUNCTION-NAMES are the top-level functions SOURCE defines; MODULE-NAME names
the generated module.  The result is Eliscript, compiled like any other module."
    (let ((print-length nil) (print-level nil) (print-circle nil)
          (print-escape-newlines nil) (print-escape-nonascii nil))
      (concat
       "(module " (symbol-name (intern module-name)) "\n"
       "  (import \"eliscript/runtime/emacs-compat\""
       " createCompatSession evalCompatProgram callCompatElisp invokeCompatFunction)\n"
       "  (defconst elisp-source " (eliscript-compat--eliscript-string source) ")\n"
       "  (defconst elisp-function-names (js-array"
       (mapconcat (lambda (name) (concat " " (eliscript-compat--eliscript-string name))) function-names "")
       "))\n"
       "  (defconst session (createCompatSession))\n"
       "  (defconst loaded (evalCompatProgram elisp-source (js-object :session session)))\n"
       "  (defun callElisp (name arguments) (callCompatElisp session name arguments))\n"
       "  (defun invokeElisp (name &rest arguments) (invokeCompatFunction session name arguments))\n"
       "  (defun elispFunctions () (js-call elisp-function-names :slice))\n"
       "  (export callElisp invokeElisp elispFunctions))\n")))

  (defun eliscript-compat-compile-elisp-module (el-files out-mjs-file)
    "Compile one or more unmodified EL-FILES into a Worker-ready OUT-MJS-FILE.
The intermediate Eliscript module is written next to OUT-MJS-FILE with the
extension .eli and compiled by the maintained Emacs Lisp Eliscript compiler.
OUT-MJS-FILE must be inside a project that resolves the `eliscript' package.
Return the absolute path of OUT-MJS-FILE."
    (let* ((files (if (listp el-files) el-files (list el-files)))
           (combined
            (mapconcat
             (lambda (f)
               (with-temp-buffer
                 (insert-file-contents (expand-file-name f))
                 (buffer-string)))
             files
             "\n"))
           (out-mjs (expand-file-name out-mjs-file))
           (out-eli (concat (file-name-sans-extension out-mjs) ".eli"))
           (module-name (concat "eliscript.generated."
                                (replace-regexp-in-string
                                 "[^A-Za-z0-9-]" "-" (file-name-base out-mjs)))))
      (unless (featurep 'eliscript)
        (add-to-list 'load-path (expand-file-name "compiler" eliscript-compat--project-directory))
        (require 'eliscript))
      (make-directory (file-name-directory out-mjs) t)
      (let ((coding-system-for-write 'utf-8-unix))
        (with-temp-file out-eli
          (insert (eliscript-compat--elisp-module-source
                   combined
                   (eliscript-compat--collect-defined-functions combined)
                   module-name))))
      (eliscript-compile-file out-eli out-mjs)
      out-mjs))

  (defun eliscript-compat--native-function (fn-sym)
    "Return the native Emacs Lisp definition of FN-SYM."
    (or (get fn-sym 'eliscript-compat-native-function)
        (symbol-function fn-sym)))

  (defun eliscript-compat-offload-call (worker mjs-file fn-sym &rest args)
    "Invoke FN-SYM with ARGS in MJS-FILE on WORKER, falling back to native Elisp.
Arguments and the result cross the Worker boundary as printed Emacs Lisp text
through the module export `callElisp'.  Without a live WORKER, or when the
Worker call fails, the native definition of FN-SYM runs instead."
    (if (and worker
             (fboundp 'eliscript-worker-live-p)
             (eliscript-worker-live-p worker)
             (fboundp 'eliscript-worker-call-sync))
        (condition-case nil
            (let* ((sexp (let ((print-length nil) (print-level nil)
                               (print-circle nil) (print-escape-newlines nil))
                           (prin1-to-string args)))
                   (reply (eliscript-worker-call-sync
                           worker (expand-file-name mjs-file) "callElisp"
                           (list (symbol-name fn-sym) sexp))))
              (unless (stringp reply)
                (error "Invalid Eliscript Worker reply"))
              (car (read-from-string reply)))
          (error (apply (eliscript-compat--native-function fn-sym) args)))
      (apply (eliscript-compat--native-function fn-sym) args)))

  (defun eliscript-compat-accelerate-function (fn-sym mjs-file &optional worker-getter predicate)
    "Install transparent Eliscript Worker acceleration on FN-SYM using MJS-FILE."
    (let ((orig (or (get fn-sym 'eliscript-compat-native-function)
                    (symbol-function fn-sym))))
      (unless (get fn-sym 'eliscript-compat-native-function)
        (put fn-sym 'eliscript-compat-native-function orig)
        (push (cons fn-sym orig) eliscript-compat--accelerated-functions))
      (fset fn-sym
            (lambda (&rest args)
              (let ((worker (and worker-getter (funcall worker-getter))))
                (if (and worker
                         (fboundp 'eliscript-worker-live-p)
                         (eliscript-worker-live-p worker)
                         (or (null predicate) (apply predicate args)))
                    (apply #'eliscript-compat-offload-call worker mjs-file fn-sym args)
                  (apply orig args)))))
      fn-sym)))

(provide 'eliscript-compat)

;;; eliscript-compat.el ends here
