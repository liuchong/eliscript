;;; eliscript-module.el --- Module system, lexical private bindings, and checked macros -*- lexical-binding: t; -*-

;;; Commentary:

;; Implements `eliscript-module` for Eliscript 0.1.0:
;; - `defmodule` with `defun-lexical`, `defvar-lexical`, `defconst-lexical`
;; - Dual-namespace `export-functions`, `export-values`, `import-functions`, `import-values`
;; - Live value binding propagation and module reload semantics
;; - Deterministic checked macros (`defmacro-checked`, `macro-gensym`, `macro-read-file`)

;;; Code:

(require 'cl-lib)
(require 'eliscript-contract)

(defvar eliscript-module--registry (make-hash-table :test 'eq)
  "Registry of defined modules keyed by module symbol.")

(defvar eliscript-module--active-macro-inputs nil
  "List of declared `:inputs' paths for the currently expanding `defmacro-checked'.")

(defvar eliscript-module--gensym-counter 0
  "Deterministic counter for `macro-gensym' within an expansion session.")

(progn
  (defun eliscript-module-reset-state! ()
    "Reset module registry and macro counters for isolated test runs."
    (clrhash eliscript-module--registry)
    (setq eliscript-module--active-macro-inputs nil)
    (setq eliscript-module--gensym-counter 0)))

;; ============================================================================
;; 1. Module Definition (`defmodule`) and Lexical Privacy
;; ============================================================================

(defun eliscript-module--check-const-assignments (form const-names mod-name)
  "Signal `eliscript-compile-error' if FORM assigns to any symbol in CONST-NAMES."
  (when (and const-names (consp form))
    (let ((head (car form)))
      (cond
       ((eq head 'quote) nil)
       ((memq head '(setq setf))
        (let ((cursor (cdr form)))
          (while cursor
            (let ((target (car cursor))
                  (val (cadr cursor)))
              (when (and (symbolp target) (memq target const-names))
                (signal 'eliscript-compile-error
                        (list (format "ELI-M0002: cannot reassign defconst-lexical `%S' in module %s"
                                      target mod-name))))
              (eliscript-module--check-const-assignments val const-names mod-name))
            (setq cursor (cddr cursor)))))
       (t
        (dolist (sub (cdr form))
          (eliscript-module--check-const-assignments sub const-names mod-name)))))))

(defun eliscript-module--register (mod-name fn-alist val-getter-alist)
  "Register or reload module MOD-NAME with FN-ALIST and VAL-GETTER-ALIST."
  (let* ((existing (gethash mod-name eliscript-module--registry))
         (subscribers (if existing (plist-get existing :subscribers) (make-hash-table :test 'eq)))
         (fn-table (make-hash-table :test 'eq))
         (val-table (make-hash-table :test 'eq)))
    (dolist (pair fn-alist)
      (puthash (car pair) (cdr pair) fn-table))
    (dolist (pair val-getter-alist)
      (puthash (car pair) (cdr pair) val-table))
    (puthash mod-name
             (list :name mod-name
                   :functions fn-table
                   :values val-table
                   :subscribers subscribers)
             eliscript-module--registry)
    (eliscript-module--sync-subscribers mod-name)
    mod-name))

(defun eliscript-module--sync-subscribers (mod-name)
  "Update all live-bound value subscribers for module MOD-NAME."
  (let ((entry (gethash mod-name eliscript-module--registry)))
    (when entry
      (let ((val-table (plist-get entry :values))
            (subscribers (plist-get entry :subscribers)))
        (maphash
         (lambda (exported-sym target-syms)
           (let ((getter (gethash exported-sym val-table)))
             (when getter
               (let ((current-val (funcall getter)))
                 (dolist (tsym target-syms)
                   (set tsym current-val))))))
         subscribers)))))

(defmacro defmodule (name &rest body)
  "Define module NAME with private `*-lexical' bindings and explicit exports."
  (let* ((extracted (eliscript-contract-extract-declarations body name))
         ( clean-body (plist-get extracted :body) )
         (lex-vars nil)
         (const-names nil)
         (lex-fns nil)
         (pub-defuns nil)
         (other-forms nil)
         (exported-fns nil)
         (exported-vals nil))
    (dolist (form clean-body)
      (if (not (consp form))
          (push form other-forms)
        (let ((head (car form)))
          (cond
           ((eq head 'defconst-lexical)
            (let ((sym (nth 1 form))
                  (init (nth 2 form)))
              (push sym const-names)
              (push (list sym init) lex-vars)))
           ((eq head 'defvar-lexical)
            (let ((sym (nth 1 form))
                  (init (nth 2 form)))
              (push (list sym init) lex-vars)))
           ((eq head 'defun-lexical)
            (let ((fn-sym (nth 1 form))
                  (fn-args (nth 2 form))
                  (fn-body (nthcdr 3 form)))
              (push (list fn-sym fn-args fn-body) lex-fns)))
           ((eq head 'defun)
            (let ((fn-sym (nth 1 form))
                  (fn-args (nth 2 form))
                  (fn-body (nthcdr 3 form)))
              (push (list fn-sym fn-args fn-body) pub-defuns)))
           ((eq head 'export-functions)
            (dolist (s (cdr form))
              (push s exported-fns)))
           ((eq head 'export-values)
            (dolist (s (cdr form))
              (push s exported-vals)))
           (t
            (push form other-forms))))))
    (setq lex-vars (nreverse lex-vars))
    (setq const-names (nreverse const-names))
    (setq lex-fns (nreverse lex-fns))
    (setq pub-defuns (nreverse pub-defuns))
    (setq other-forms (nreverse other-forms))
    (setq exported-fns (nreverse exported-fns))
    (setq exported-vals (nreverse exported-vals))
    ;; Static check for assignments to defconst-lexical
    (dolist (form clean-body)
      (unless (and (consp form) (eq (car form) 'defconst-lexical))
        (eliscript-module--check-const-assignments form const-names name)))
    (let ((label-defs
           (mapcar (lambda (lf)
                     `(,(nth 0 lf) ,(nth 1 lf) ,@(nth 2 lf)))
                   lex-fns))
          (pub-defs
           (mapcar (lambda (pf)
                     (let ((psym (nth 0 pf))
                           (pargs (nth 1 pf))
                           (pbody (nth 2 pf))
                           (res-sym (make-symbol "mod-fn-res")))
                       `(fset ',psym
                              (lambda ,pargs
                                (let ((,res-sym (progn ,@pbody)))
                                  (eliscript-module--sync-subscribers ',name)
                                  ,res-sym)))))
                   pub-defuns))
          (fn-export-pairs
           (mapcar (lambda (fsym)
                     `(cons ',fsym (symbol-function ',fsym)))
                   exported-fns))
          (val-export-pairs
           (mapcar (lambda (vsym)
                     `(cons ',vsym (lambda () ,vsym)))
                   exported-vals)))
      `(let* ,lex-vars
         (cl-labels ,label-defs
           ,@other-forms
           ,@pub-defs
           (eliscript-module--register
            ',name
            (list ,@fn-export-pairs)
            (list ,@val-export-pairs)))))))

;; Top-level fallback macros if used outside `defmodule'
(defmacro defun-lexical (name args &rest body)
  "Define lexical function NAME with ARGS and BODY."
  `(defun ,name ,args ,@body))

(defmacro defvar-lexical (name &optional initvalue docstring)
  "Define lexical variable NAME with INITVALUE and DOCSTRING."
  `(defvar ,name ,initvalue ,@(when docstring (list docstring))))

(defmacro defconst-lexical (name initvalue &optional docstring)
  "Define lexical constant NAME with INITVALUE and DOCSTRING."
  `(defconst ,name ,initvalue ,@(when docstring (list docstring))))

(defmacro export-functions (&rest symbols)
  "Declare exported function SYMBOLS."
  `',symbols)

(defmacro export-values (&rest symbols)
  "Declare exported value SYMBOLS."
  `',symbols)

;; ============================================================================
;; 2. Dual-Namespace Imports (`import-functions`, `import-values`)
;; ============================================================================

(defun eliscript-module--parse-import-spec (spec)
  "Parse `:only', `:rename', and `:as' options from import SPEC."
  (let ((only (plist-get spec :only))
        (rename (plist-get spec :rename))
        (as-prefix (plist-get spec :as)))
    (list :only only :rename rename :as as-prefix)))

(defun eliscript-module--target-symbol (sym rename-alist as-prefix)
  "Compute local imported symbol name for SYM given RENAME-ALIST and AS-PREFIX."
  (let* ((renamed (cadr (assq sym rename-alist)))
         (base (or renamed sym)))
    (if as-prefix
        (intern (format "%s%s" as-prefix base))
      base)))

(defun eliscript-module--import-functions-runtime (mod-name specs)
  "Import functions from MOD-NAME according to SPECS."
  (let ((entry (gethash mod-name eliscript-module--registry)))
    (unless entry
      (signal 'eliscript-compile-error
              (list (format "ELI-M0003: unknown module `%S' in import-functions" mod-name))))
    (let* ((fn-table (plist-get entry :functions))
           (parsed (eliscript-module--parse-import-spec specs))
           (only (plist-get parsed :only))
           (rename (plist-get parsed :rename))
           (as-prefix (plist-get parsed :as))
           (symbols-to-import
            (or only
                (let (ks)
                  (maphash (lambda (k _v) (push k ks)) fn-table)
                  ks))))
      (dolist (sym symbols-to-import)
        (let ((fn (gethash sym fn-table)))
          (unless fn
            (signal 'eliscript-compile-error
                    (list (format "ELI-M0004: function `%S' is not exported by module %s"
                                  sym mod-name))))
          (let ((target (eliscript-module--target-symbol sym rename as-prefix)))
            (fset target
                  (lambda (&rest args)
                    (let* ((cur-entry (gethash mod-name eliscript-module--registry))
                           (cur-fn (gethash sym (plist-get cur-entry :functions))))
                      (apply cur-fn args))))))))))

(defun eliscript-module--import-values-runtime (mod-name specs)
  "Import live value bindings from MOD-NAME according to SPECS."
  (let ((entry (gethash mod-name eliscript-module--registry)))
    (unless entry
      (signal 'eliscript-compile-error
              (list (format "ELI-M0003: unknown module `%S' in import-values" mod-name))))
    (let* ((val-table (plist-get entry :values))
           (subscribers (plist-get entry :subscribers))
           (parsed (eliscript-module--parse-import-spec specs))
           (only (plist-get parsed :only))
           (rename (plist-get parsed :rename))
           (as-prefix (plist-get parsed :as))
           (symbols-to-import
            (or only
                (let (ks)
                  (maphash (lambda (k _v) (push k ks)) val-table)
                  ks))))
      (dolist (sym symbols-to-import)
        (let ((getter (gethash sym val-table)))
          (unless getter
            (signal 'eliscript-compile-error
                    (list (format "ELI-M0005: value `%S' is not exported by module %s"
                                  sym mod-name))))
          (let ((target (eliscript-module--target-symbol sym rename as-prefix)))
            (set target (funcall getter))
            (let ((existing-subs (gethash sym subscribers)))
              (unless (memq target existing-subs)
                (puthash sym (cons target existing-subs) subscribers)))))))))

(defmacro import-functions (mod-name &rest specs)
  "Import exported functions from MOD-NAME with optional `:only', `:rename', `:as'."
  `(eliscript-module--import-functions-runtime ',mod-name ',specs))

(defmacro import-values (mod-name &rest specs)
  "Import exported live values from MOD-NAME using SPECS."
  `(eliscript-module--import-values-runtime ',mod-name ',specs))

;; ============================================================================
;; 3. Checked Deterministic Macros (`defmacro-checked`, `macro-gensym`, `macro-read-file`)
;; ============================================================================

(defun macro-gensym (&optional prefix)
  "Generate a deterministic hygienic symbol with optional PREFIX."
  (setq eliscript-module--gensym-counter (1+ eliscript-module--gensym-counter))
  (make-symbol (format "eli-gensym-%s-%d" (or prefix "g") eliscript-module--gensym-counter)))

(defun macro-read-file (rel-path)
  "Read declared input file REL-PATH inside `defmacro-checked'."
  (unless (and (stringp rel-path)
               (not (file-name-absolute-p rel-path))
               (not (string-match-p "\\.\\." rel-path)))
    (signal 'eliscript-compile-error
            (list (format "ELI-M0010: invalid or non-relative path `%S' in macro-read-file" rel-path))))
  (unless (member rel-path eliscript-module--active-macro-inputs)
    (signal 'eliscript-compile-error
            (list (format "ELI-M0011: undeclared file `%s' in macro-read-file; declare it in (declare (eliscript :inputs (...)))"
                          rel-path))))
  (with-temp-buffer
    (insert-file-contents rel-path)
    (buffer-string)))

(defun eliscript-module--scan-macro-read-file (form inputs macro-name)
  "Statistically verify any `macro-read-file' in FORM is declared in INPUTS."
  (when (consp form)
    (let ((head (car form)))
      (unless (eq head 'quote)
        (when (eq head 'macro-read-file)
          (let ((arg (cadr form)))
            (when (or (null inputs)
                      (and (stringp arg) (not (member arg inputs)))
                      (and (stringp arg) (or (file-name-absolute-p arg)
                                             (string-match-p "\\.\\." arg))))
              (signal 'eliscript-compile-error
                      (list (format "ELI-M0011: undeclared or invalid file `%S' in defmacro-checked %s"
                                    arg macro-name))))))
        (dolist (sub (cdr form))
          (eliscript-module--scan-macro-read-file sub inputs macro-name))))))

(defmacro defmacro-checked (name args &rest body)
  "Define a deterministic, reproducible macro NAME with ARGS and BODY."
  (let* ((extracted (eliscript-contract-extract-declarations body name))
         (plist (plist-get extracted :eliscript))
         (clean-body (plist-get extracted :body))
         (inputs (plist-get plist :inputs)))
    (eliscript-contract-validate-context 'defmacro-checked name plist args clean-body)
    (dolist (form clean-body)
      (eliscript-module--scan-macro-read-file form inputs name))
    `(defmacro ,name ,args
       (let ((eliscript-module--active-macro-inputs ',inputs))
         ,@clean-body))))

(provide 'eliscript-module)

;;; eliscript-module.el ends here
