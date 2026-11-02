;;; eliscript-runtime.el --- Unified 0.1.0 entry point, definition-identity activation, and evaluator -*- lexical-binding: t; -*-

;;; Commentary:

;; Provides the umbrella `(require 'eliscript)` integration, definition-identity
;; extension tracking, conflict detection, static contract validation for
;; standard `defun`, and `eliscript-runtime-eval-string` for Eliscript 0.1.0.

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

(defconst eliscript-runtime--extension-exports
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

(defvar eliscript-runtime--canonical-fn-cells (make-hash-table :test 'eq)
  "Canonical function cells for all extension symbols.")

(dolist (group eliscript-runtime--extension-exports)
  (dolist (sym (cdr group))
    (when (fboundp sym)
      (puthash sym (symbol-function sym) eliscript-runtime--canonical-fn-cells))))

(defvar eliscript-runtime--session-user-defs (make-hash-table :test 'eq)
  "Symbols defined by user code in the current evaluation session.")

(defvar eliscript-runtime--session-active-libs nil
  "List of extension libraries activated in the current session.")

(defvar eliscript-runtime--session-touched-symbols nil
  "Symbols created or modified during the current evaluation session.")

(defvar eliscript-runtime--accelerated-functions nil
  "Alist of (FN-SYM . ORIG-FN) modified by `eliscript-runtime-accelerate-function'.")

(defconst eliscript-runtime--project-directory
  (expand-file-name
   ".."
   (file-name-directory (or load-file-name buffer-file-name default-directory)))
  "Root directory of the Eliscript project.")

(declare-function eliscript-worker-live-p "eliscript-worker" (worker))
(declare-function eliscript-worker-call-sync "eliscript-worker"
                  (worker module export arguments &rest keys))
(declare-function eliscript-compile-file "eliscript" (input-file &optional output-file))

(progn
  (defun eliscript-runtime-reset-state! ()
    "Restore clean 0.1.0 evaluation state and canonical extension bindings."
    (eliscript-contract-reset-state!)
    (eliscript-data-reset-state!)
    (eliscript-module-reset-state!)
    (eliscript-async-reset-state!)
    (dolist (pair eliscript-runtime--accelerated-functions)
      (when (symbolp (car pair))
        (fset (car pair) (cdr pair))
        (put (car pair) 'eliscript-runtime-native-function nil)))
    (setq eliscript-runtime--accelerated-functions nil)
    (dolist (sym eliscript-runtime--session-touched-symbols)
      (unless (gethash sym eliscript-runtime--canonical-fn-cells)
        (fmakunbound sym)
        (makunbound sym)
        (setplist sym nil)))
    (maphash (lambda (sym fn) (fset sym fn))
             eliscript-runtime--canonical-fn-cells)
    (clrhash eliscript-runtime--session-user-defs)
    (setq eliscript-runtime--session-active-libs nil)
    (setq eliscript-runtime--session-touched-symbols nil)))

(defun eliscript-runtime--activate-lib (lib-sym)
  "Activate extension library LIB-SYM, checking for user symbol conflicts."
  (if (eq lib-sym 'eliscript)
      (dolist (sub '(eliscript-data eliscript-bind eliscript-async eliscript-module eliscript-contract))
        (eliscript-runtime--activate-lib sub))
    (let ((exports (cdr (assq lib-sym eliscript-runtime--extension-exports))))
      (when exports
        (dolist (sym exports)
          (when (gethash sym eliscript-runtime--session-user-defs)
            (signal 'eliscript-compile-error
                    (list (format "ELI-M0001: extension `%S' symbol `%S' conflicts with existing user definition"
                                  lib-sym sym))))
          (let ((canon (gethash sym eliscript-runtime--canonical-fn-cells)))
            (when canon
              (fset sym canon))))
        (cl-pushnew lib-sym eliscript-runtime--session-active-libs)))))

(defun eliscript-runtime--preprocess-form (form)
  "Pre-scan and transform FORM for definition-identity and static contracts."
  (if (not (consp form))
      form
    (let ((head (car form)))
      (cond
       ((eq head 'quote) form)
       ((eq head 'progn)
        `(progn ,@(mapcar #'eliscript-runtime--preprocess-form (cdr form))))
       ((and (eq head 'require)
             (consp (cadr form))
             (eq (caadr form) 'quote))
        (let ((lib (cadadr form)))
          (if (or (eq lib 'eliscript)
                  (assq lib eliscript-runtime--extension-exports))
              (progn
                (eliscript-runtime--activate-lib lib)
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
          (puthash name t eliscript-runtime--session-user-defs)
          (push name eliscript-runtime--session-touched-symbols)
          (when plist
            (eliscript-contract-validate-context 'defun name plist args clean-body))
          (when (memq 'eliscript-async eliscript-runtime--session-active-libs)
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
            (push name eliscript-runtime--session-touched-symbols)))
        form)
       (t form)))))

(defun eliscript-runtime--collect-defined-functions (source)
  "Return a list of function symbol names defined at top level in SOURCE."
  (let ((names nil))
    (cl-labels
        ((walk (form)
           (when (consp form)
             (let ((head (car form))
                   (second (nth 1 form)))
               (cond
                ((and (memq head '(defun cl-defun defsubst defun-case defun-bind defun-tail defun-async))
                      (symbolp second))
                 (cl-pushnew (symbol-name second) names :test #'equal))
                ((memq head '(progn eval-and-compile eval-when-compile))
                 (dolist (sub (cdr form))
                   (walk sub))))))))
      (with-temp-buffer
        (insert source)
        (goto-char (point-min))
        (condition-case nil
            (while t
              (walk (read (current-buffer))))
          (end-of-file nil))))
    (nreverse names)))

(defun eliscript-runtime--lisp-mjs-path ()
  "Return the path to `dist/runtime/lisp.mjs', building it if missing."
  (let* ((proj-dir (file-name-as-directory
                    (file-truename eliscript-runtime--project-directory)))
         (dist-mjs (expand-file-name "dist/runtime/lisp.mjs" proj-dir))
         (build-bin (expand-file-name "bin/eliscript-build" proj-dir))
         (runtime-dir (expand-file-name "runtime" proj-dir))
         (lisp-eli (expand-file-name "runtime/lisp.eli" proj-dir))
         (out-dir (expand-file-name "dist/runtime" proj-dir)))
    (unless (file-exists-p dist-mjs)
      (unless (= 0 (call-process build-bin nil nil nil
                                 "--root" runtime-dir "--out-dir" out-dir lisp-eli))
        (error "Failed to build %s" dist-mjs)))
    dist-mjs))

(progn
  (defun eliscript-runtime-eval-string (source)
    "Read, statically check, and evaluate all forms in SOURCE string."
    (with-temp-buffer
      (insert source)
      (goto-char (point-min))
      (let ((last-val nil))
        (condition-case nil
            (while t
              (let* ((raw-form (read (current-buffer)))
                     (checked-form (eliscript-runtime--preprocess-form raw-form)))
                (setq last-val (eval checked-form t))))
          (end-of-file last-val)))))

  (defun eliscript-runtime-eval-file (file)
    "Read and evaluate unmodified Emacs Lisp or Eliscript FILE in 0.1.0 runtime."
    (with-temp-buffer
      (insert-file-contents file)
      (eliscript-runtime-eval-string (buffer-string))))

  (defun eliscript-runtime--elisp-module-source (source _function-names module-name)
    "Compile SOURCE into an AOT Eliscript `(module ...)' string named MODULE-NAME."
    (let* ((lisp-mjs (eliscript-runtime--lisp-mjs-path))
           (runner (or (executable-find "bun")
                       (executable-find "node")
                       (error "Neither bun nor node found in PATH")))
           (script (concat
                    "import fs from 'node:fs';\n"
                    "import { pathToFileURL } from 'node:url';\n"
                    "const mod = await import(pathToFileURL(process.argv[1]).href);\n"
                    "const src = fs.readFileSync(0, 'utf8');\n"
                    "process.stdout.write(mod.compileModule(src, { moduleName: process.argv[2], runtime: 'eliscript/runtime/lisp' }));\n"))
           (coding-system-for-read 'utf-8)
           (coding-system-for-write 'utf-8-unix))
      (with-temp-buffer
        (insert source)
        (let ((status (call-process-region
                       (point-min) (point-max)
                       runner t t nil
                       "-e" script "--" lisp-mjs module-name)))
          (unless (and (integerp status) (= status 0))
            (error "Failed to compile module %s: %s" module-name (buffer-string)))
          (buffer-string)))))

  (defun eliscript-runtime--rewrite-external-runtime-imports (out-mjs)
    "Rewrite bare runtime imports in OUT-MJS to relative paths."
    (let ((out-dir (file-name-as-directory
                    (file-truename (file-name-directory (expand-file-name out-mjs)))))
          (proj-dir (file-name-as-directory
                     (file-truename eliscript-runtime--project-directory))))
      (unless (locate-dominating-file out-dir "node_modules/eliscript")
        (let ((coding-system-for-read 'utf-8)
              (coding-system-for-write 'utf-8-unix))
          (with-temp-buffer
            (insert-file-contents out-mjs)
            (goto-char (point-min))
            (while (re-search-forward "\"eliscript/runtime/\\([^\"]+\\)\"" nil t)
              (let* ((sub (match-string 1))
                     (sub-mjs (if (string-suffix-p ".mjs" sub) sub (concat sub ".mjs")))
                     (dist-target (expand-file-name (concat "dist/runtime/" sub-mjs) proj-dir))
                     (root-target (expand-file-name (concat "runtime/" sub-mjs) proj-dir))
                     (target (if (file-exists-p dist-target) dist-target root-target))
                     (rel (file-relative-name target out-dir))
                     (spec (if (string-prefix-p "." rel) rel (concat "./" rel))))
                (replace-match (concat "\"" spec "\"") t t)))
            (write-region (point-min) (point-max) out-mjs nil 'silent))))))

  (defun eliscript-runtime-compile-elisp-module (el-files out-mjs-file)
    "Compile one or more unmodified EL-FILES into a Worker-ready OUT-MJS-FILE.
The intermediate Eliscript module is written next to OUT-MJS-FILE with the
extension .eli (or .bundle.eli when an input file shares the same base name)
and compiled by the maintained Emacs Lisp Eliscript compiler.
When OUT-MJS-FILE is in an external project without `node_modules/eliscript',
runtime imports are automatically rewritten to relative paths.
Return the absolute path of OUT-MJS-FILE."
    (let* ((files (mapcar #'expand-file-name
                          (if (listp el-files) el-files (list el-files))))
           (combined
            (mapconcat
             (lambda (f)
               (with-temp-buffer
                 (insert-file-contents f)
                 (buffer-string)))
             files
             "\n"))
           (out-mjs (expand-file-name out-mjs-file))
           (default-eli (concat (file-name-sans-extension out-mjs) ".eli"))
           (collision-p (member default-eli files))
           (out-eli (if collision-p
                        (concat (file-name-sans-extension out-mjs) ".bundle.eli")
                      default-eli))
           (module-name (concat "eliscript.generated."
                                (replace-regexp-in-string
                                 "[^A-Za-z0-9-]" "-" (file-name-base out-mjs)))))
      (unless (featurep 'eliscript)
        (add-to-list 'load-path (expand-file-name "compiler" eliscript-runtime--project-directory))
        (require 'eliscript))
      (make-directory (file-name-directory out-mjs) t)
      (unwind-protect
          (progn
            (let ((coding-system-for-write 'utf-8-unix))
              (with-temp-file out-eli
                (insert (eliscript-runtime--elisp-module-source
                         combined
                         (eliscript-runtime--collect-defined-functions combined)
                         module-name))))
            (eliscript-compile-file out-eli out-mjs)
            (eliscript-runtime--rewrite-external-runtime-imports out-mjs))
        (when (and collision-p (file-exists-p out-eli))
          (delete-file out-eli)))
      out-mjs))

  (defun eliscript-runtime--native-function (fn-sym)
    "Return the native Emacs Lisp definition of FN-SYM."
    (or (get fn-sym 'eliscript-runtime-native-function)
        (symbol-function fn-sym)))

  (defun eliscript-runtime-offload-call (worker mjs-file fn-sym &rest args)
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
          (error (apply (eliscript-runtime--native-function fn-sym) args)))
      (apply (eliscript-runtime--native-function fn-sym) args)))

  (defun eliscript-runtime-offload-eval (worker mjs-file form)
    "Evaluate Elisp FORM in MJS-FILE on WORKER, falling back to native `eval'."
    (let ((program (if (stringp form)
                       form
                     (let ((print-length nil) (print-level nil)
                           (print-circle nil) (print-escape-newlines nil))
                       (prin1-to-string form)))))
      (if (and worker
               (fboundp 'eliscript-worker-live-p)
               (eliscript-worker-live-p worker)
               (fboundp 'eliscript-worker-call-sync))
          (condition-case nil
              (let ((reply (eliscript-worker-call-sync
                            worker (expand-file-name mjs-file) "evalElisp"
                            (list program))))
                (unless (stringp reply)
                  (error "Invalid Eliscript Worker eval reply"))
                (car (read-from-string reply)))
            (error (if (stringp form)
                       (eliscript-runtime-eval-string form)
                     (eval form t))))
        (if (stringp form)
            (eliscript-runtime-eval-string form)
          (eval form t)))))

  (defun eliscript-runtime-accelerate-function (fn-sym mjs-file &optional worker-getter predicate)
    "Install transparent Eliscript Worker acceleration on FN-SYM using MJS-FILE."
    (let ((orig (or (get fn-sym 'eliscript-runtime-native-function)
                    (symbol-function fn-sym))))
      (unless (get fn-sym 'eliscript-runtime-native-function)
        (put fn-sym 'eliscript-runtime-native-function orig)
        (push (cons fn-sym orig) eliscript-runtime--accelerated-functions))
      (fset fn-sym
            (lambda (&rest args)
              (let ((worker (and worker-getter (funcall worker-getter))))
                (if (and worker
                         (fboundp 'eliscript-worker-live-p)
                         (eliscript-worker-live-p worker)
                         (or (null predicate) (apply predicate args)))
                    (apply #'eliscript-runtime-offload-call worker mjs-file fn-sym args)
                  (apply orig args)))))
      fn-sym)))

(provide 'eliscript-runtime)

;;; eliscript-runtime.el ends here
