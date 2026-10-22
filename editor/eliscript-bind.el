;;; eliscript-bind.el --- Unified pcase destructuring, multi-arity, let-const, recur, and pipelines -*- lexical-binding: t; -*-

;;; Commentary:

;; Implements `eliscript-bind` for Eliscript 0.1.0:
;; - Unified destructuring (`let-bind`, `let*-bind`, `defun-bind`, `lambda-bind`, `pcase-value`, `cond-predicate`)
;; - Multi-arity functions (`defun-case`, `lambda-case`)
;; - Immutable local bindings (`let-const`, `let*-const`)
;; - Stack-safe explicit tail recursion (`let-loop`, `defun-tail`, `lambda-tail`, `recur`, `trampoline`)
;; - Pipeline macros (`thread-first`, `thread-last`, `thread-as`, `thread-cond-first`, `thread-cond-last`, `thread-some-first`, `thread-some-last`)
;; - Function combinators (`fn-compose`, `fn-partial`, `fn-juxt`, `fn-complement`)

;;; Code:

(require 'cl-lib)
(require 'subr-x)
(require 'pcase)
(require 'seq)
(require 'eliscript-contract)
(require 'eliscript-data)

;; ============================================================================
;; 1. Unified Destructuring Pattern Compiler & Runtime Matcher
;; ============================================================================

(defun eliscript-bind--collect-pattern-vars (pattern)
  "Return all bound variable symbols in PATTERN, checking for duplicates."
  (let ((vars nil))
    (cl-labels
        ((walk (pat)
           (cond
            ((null pat) nil)
            ((eq pat '_) nil)
            ((eq pat :none) nil)
            ((keywordp pat) nil)
            ((symbolp pat)
             (when (memq pat vars)
               (signal 'eliscript-compile-error
                       (list (format "ELI-B0010: duplicate variable `%S' in destructuring pattern" pat))))
             (push pat vars))
            ((vectorp pat)
             (let ((elems (append pat nil))
                   (i 0)
                   (len (length pat)))
               (while (< i len)
                 (let ((el (nth i elems)))
                   (if (eq el '&rest)
                       (progn
                         (walk (nth (1+ i) elems))
                         (setq i len))
                     (walk el)
                     (setq i (1+ i)))))))
            ((consp pat)
             (let ((head (car pat)))
               (cond
                ((eq head :list)
                 (let ((cursor (cdr pat)))
                   (while cursor
                     (if (eq (car cursor) '&rest)
                         (progn
                           (walk (cadr cursor))
                           (setq cursor nil))
                       (walk (car cursor))
                       (setq cursor (cdr cursor))))))
                ((eq head :map)
                 (dolist (entry (cdr pat))
                   (let ((subpat (cadr entry)))
                     (if (and (consp subpat) (eq (car subpat) 'default))
                         (walk (cadr subpat))
                       (walk subpat)))))
                ((eq head :record)
                 (dolist (entry (cddr pat))
                   (walk (cadr entry))))
                ((memq head '(:ok :error :some))
                 (walk (cadr pat)))
                (t nil)))))))
      (walk pattern))
    (nreverse vars)))

(defun eliscript-bind--match-runtime (pattern value env-ht eval-default-fn)
  "Match PATTERN against VALUE, storing variable bindings in ENV-HT.
Signal an error if VALUE does not match PATTERN."
  (cond
   ((eq pattern '_) t)
   ((eq pattern :none)
    (unless (option-none-p value)
      (error "Destructuring expected option-none, got %S" value))
    t)
   ((and (symbolp pattern) (not (keywordp pattern)) (not (null pattern)))
    (puthash pattern value env-ht)
    t)
   ((vectorp pattern)
    (unless (or (vectorp value) (persistent-vector-p value))
      (error "Destructuring vector pattern %S requires vector or persistent-vector, got %S"
             pattern value))
    (let* ((pat-list (append pattern nil))
           (rest-pos (cl-position '&rest pat-list))
           (val-len (value-count value)))
      (if rest-pos
          (let ((fixed-count rest-pos)
                (rest-pat (nth (1+ rest-pos) pat-list)))
            (when (< val-len fixed-count)
              (error "Destructuring vector pattern %S expected at least %d elements, got %d"
                     pattern fixed-count val-len))
            (dotimes (i fixed-count)
              (eliscript-bind--match-runtime
               (nth i pat-list) (value-nth value i) env-ht eval-default-fn))
            (let ((tail-val (if (persistent-vector-p value)
                                (seq-subseq value fixed-count)
                              (cl-subseq value fixed-count))))
              (eliscript-bind--match-runtime rest-pat tail-val env-ht eval-default-fn)))
        (unless (= val-len (length pat-list))
          (error "Destructuring vector pattern %S expected %d elements, got %d"
                 pattern (length pat-list) val-len))
        (dotimes (i val-len)
          (eliscript-bind--match-runtime
           (nth i pat-list) (value-nth value i) env-ht eval-default-fn))))
    t)
   ((and (consp pattern) (eq (car pattern) :list))
    (unless (or (listp value) (persistent-list-p value))
      (error "Destructuring :list pattern %S requires list or persistent-list, got %S"
             pattern value))
    (let* ((pat-list (cdr pattern))
           (rest-pos (cl-position '&rest pat-list))
           (elems (if (persistent-list-p value)
                      (eliscript-data--seq-elements value)
                    value))
           (val-len (length elems)))
      (if rest-pos
          (let ((fixed-count rest-pos)
                (rest-pat (nth (1+ rest-pos) pat-list)))
            (when (< val-len fixed-count)
              (error "Destructuring :list pattern expected at least %d elements, got %d"
                     fixed-count val-len))
            (dotimes (i fixed-count)
              (eliscript-bind--match-runtime
               (nth i pat-list) (nth i elems) env-ht eval-default-fn))
            (let* ((tail-elems (nthcdr fixed-count elems))
                   (tail-val (if (persistent-list-p value)
                                 (apply #'persistent-list tail-elems)
                               tail-elems)))
              (eliscript-bind--match-runtime rest-pat tail-val env-ht eval-default-fn)))
        (unless (= val-len (length pat-list))
          (error "Destructuring :list pattern expected %d elements, got %d"
                 (length pat-list) val-len))
        (dotimes (i val-len)
          (eliscript-bind--match-runtime
           (nth i pat-list) (nth i elems) env-ht eval-default-fn))))
    t)
   ((and (consp pattern) (eq (car pattern) :map))
    (unless (or (hash-table-p value)
                (persistent-map-p value)
                (persistent-sorted-map-p value)
                (eliscript-persistent-record-p value))
      (error "Destructuring :map pattern requires map or persistent struct, got %S" value))
    (dolist (entry (cdr pattern))
      (let ((key (car entry))
            (subpat (cadr entry)))
        (if (and (consp subpat) (eq (car subpat) 'default))
            (let ((target-pat (cadr subpat))
                  (def-expr (nth 2 subpat)))
              (if (value-contains-p value key)
                  (eliscript-bind--match-runtime
                   target-pat (value-get value key) env-ht eval-default-fn)
                (eliscript-bind--match-runtime
                 target-pat (funcall eval-default-fn def-expr) env-ht eval-default-fn)))
          (unless (value-contains-p value key)
            (error "Destructuring :map missing required key %S in %S" key value))
          (eliscript-bind--match-runtime
           subpat (value-get value key) env-ht eval-default-fn))))
    t)
   ((and (consp pattern) (eq (car pattern) :record))
    (let ((rec-name (cadr pattern))
          (entries (cddr pattern)))
      (unless (and (eliscript-persistent-record-p value)
                   (eq (eliscript-persistent-record-type-name value) rec-name))
        (error "Destructuring :record expected %S instance, got %S" rec-name value))
      (dolist (entry entries)
        (let ((key (car entry))
              (subpat (cadr entry)))
          (unless (value-contains-p value key)
            (error "Destructuring :record %S missing field %S" rec-name key))
          (eliscript-bind--match-runtime
           subpat (value-get value key) env-ht eval-default-fn))))
    t)
   ((and (consp pattern) (eq (car pattern) :ok))
    (unless (result-ok-p value)
      (error "Destructuring :ok expected result-ok, got %S" value))
    (eliscript-bind--match-runtime
     (cadr pattern) (result-value value) env-ht eval-default-fn))
   ((and (consp pattern) (eq (car pattern) :error))
    (unless (result-error-p value)
      (error "Destructuring :error expected result-error, got %S" value))
    (eliscript-bind--match-runtime
     (cadr pattern) (result-error-value value) env-ht eval-default-fn))
   ((and (consp pattern) (eq (car pattern) :some))
    (unless (option-some-p value)
      (error "Destructuring :some expected option-some, got %S" value))
    (eliscript-bind--match-runtime
     (cadr pattern) (option-value value) env-ht eval-default-fn))
   (t
    (unless (value-equal-p pattern value)
      (error "Destructuring literal mismatch: expected %S, got %S" pattern value))
    t)))

(defun eliscript-bind--expand-single-binding (pattern expr body)
  "Expand binding of PATTERN to EXPR around BODY."
  (let ((vars (eliscript-bind--collect-pattern-vars pattern)))
    (if (and (symbolp pattern) (not (keywordp pattern)) (not (eq pattern :none)))
        (if (eq pattern '_)
            `(progn ,expr ,@body)
          `(let ((,pattern ,expr)) ,@body))
      (let ((ht-sym (make-symbol "bind-env"))
            (val-sym (make-symbol "bind-val")))
        `(let ((,ht-sym (make-hash-table :test 'eq))
               (,val-sym ,expr))
           (eliscript-bind--match-runtime
            ',pattern ,val-sym ,ht-sym #'eval)
           (let ,(mapcar (lambda (v) `(,v (gethash ',v ,ht-sym))) vars)
             ,@body))))))

(defmacro let*-bind (bindings &rest body)
  "Bind destructuring BINDINGS sequentially and evaluate BODY."
  (if (null bindings)
      `(progn ,@body)
    (let* ((first-b (car bindings))
           (pat (car first-b))
           (expr (cadr first-b)))
      (eliscript-bind--expand-single-binding
       pat expr `((let*-bind ,(cdr bindings) ,@body))))))

(defmacro let-bind (bindings &rest body)
  "Bind destructuring BINDINGS in parallel and evaluate BODY."
  (let ((temp-lets nil)
        (seq-binds nil)
        (all-vars nil))
    (dolist (b bindings)
      (let ((pat (car b))
            (expr (cadr b))
            (tmp (make-symbol "let-bind-tmp")))
        (dolist (v (eliscript-bind--collect-pattern-vars pat))
          (when (memq v all-vars)
            (signal 'eliscript-compile-error
                    (list (format "ELI-B0010: duplicate variable `%S' in let-bind" v))))
          (push v all-vars))
        (push `(,tmp ,expr) temp-lets)
        (push `(,pat ,tmp) seq-binds)))
    `(let ,(nreverse temp-lets)
       (let*-bind ,(nreverse seq-binds)
         ,@body))))

(defun eliscript-bind--build-destructuring-lambda (name arg-specs raw-body)
  "Build a lambda form for NAME with destructuring ARG-SPECS and RAW-BODY."
  (let* ((extracted (eliscript-contract-extract-declarations raw-body name))
         (plist (plist-get extracted :eliscript))
         (clean-body (plist-get extracted :body))
         (req-pats nil)
         (opt-specs nil)
         (rest-pat nil)
         (mode 'req)
         (all-vars nil))
    (dolist (item arg-specs)
      (cond
       ((eq item '&optional) (setq mode 'opt))
       ((eq item '&rest) (setq mode 'rest))
       ((eq mode 'req)
        (dolist (v (eliscript-bind--collect-pattern-vars item))
          (when (memq v all-vars)
            (signal 'eliscript-compile-error
                    (list (format "ELI-B0010: duplicate variable `%S' in %s" v name))))
          (push v all-vars))
        (push item req-pats))
       ((eq mode 'opt)
        (let ((pat (if (consp item) (car item) item))
              (def (if (consp item) (cadr item) nil)))
          (dolist (v (eliscript-bind--collect-pattern-vars pat))
            (when (memq v all-vars)
              (signal 'eliscript-compile-error
                      (list (format "ELI-B0010: duplicate variable `%S' in %s" v name))))
            (push v all-vars))
          (push (list pat def) opt-specs)))
       ((eq mode 'rest)
        (dolist (v (eliscript-bind--collect-pattern-vars item))
          (when (memq v all-vars)
            (signal 'eliscript-compile-error
                    (list (format "ELI-B0010: duplicate variable `%S' in %s" v name))))
          (push v all-vars))
        (setq rest-pat item))))
    (setq req-pats (nreverse req-pats))
    (setq opt-specs (nreverse opt-specs))
    (eliscript-contract-validate-context 'defun-bind name plist (nreverse all-vars) clean-body)
    (let* ((wrapped-body (eliscript-contract-wrap-body name plist all-vars clean-body))
           (args-sym (make-symbol "bind-args"))
           (argc-sym (make-symbol "bind-argc"))
           (min-arity (length req-pats))
           (max-arity (if rest-pat nil (+ min-arity (length opt-specs))))
           (inner-forms wrapped-body))
      (when rest-pat
        (setq inner-forms
              (list (eliscript-bind--expand-single-binding
                     rest-pat `(nthcdr ,(+ min-arity (length opt-specs)) ,args-sym) inner-forms))))
      (let ((opt-idx (1- (length opt-specs))))
        (while (>= opt-idx 0)
          (let* ((ospec (nth opt-idx opt-specs))
                 (opat (car ospec))
                 (odef (cadr ospec))
                 (pos (+ min-arity opt-idx)))
            (setq inner-forms
                  (list (eliscript-bind--expand-single-binding
                         opat
                         `(if (> ,argc-sym ,pos)
                              (nth ,pos ,args-sym)
                            ,odef)
                         inner-forms))))
          (setq opt-idx (1- opt-idx))))
      (let ((req-idx (1- min-arity)))
        (while (>= req-idx 0)
          (let ((rpat (nth req-idx req-pats)))
            (setq inner-forms
                  (list (eliscript-bind--expand-single-binding
                         rpat `(nth ,req-idx ,args-sym) inner-forms))))
          (setq req-idx (1- req-idx))))
      `(lambda (&rest ,args-sym)
         (let ((,argc-sym (length ,args-sym)))
           (when (< ,argc-sym ,min-arity)
             (signal 'wrong-number-of-arguments (list ',name ,argc-sym)))
           ,@(when max-arity
               `((when (> ,argc-sym ,max-arity)
                   (signal 'wrong-number-of-arguments (list ',name ,argc-sym)))))
           ,@inner-forms)))))

(defmacro defun-bind (name arg-specs &rest body)
  "Define function NAME with unified destructuring ARG-SPECS and BODY."
  (let ((fn-form (eliscript-bind--build-destructuring-lambda name arg-specs body)))
    `(progn
       (fset ',name ,fn-form)
       ',name)))

(defmacro lambda-bind (arg-specs &rest body)
  "Create an anonymous function with unified destructuring ARG-SPECS and BODY."
  (eliscript-bind--build-destructuring-lambda 'lambda-bind arg-specs body))

(defun eliscript-bind--pattern-form-p (pat)
  "Return non-nil if PAT is a destructuring pattern rather than a value expression."
  (or (eq pat '_)
      (eq pat :none)
      (vectorp pat)
      (and (consp pat)
           (memq (car pat) '(:list :map :record :ok :error :some)))))

(defmacro pcase-value (expr &rest clauses)
  "Match EXPR against CLAUSES using `value-equal-p' and unified patterns."
  (let ((val-sym (make-symbol "pcase-val"))
        (done-tag (make-symbol "pcase-done"))
        (branch-forms nil))
    (dolist (clause clauses)
      (let ((pat (car clause))
            (cbody (cdr clause)))
        (cond
         ((eq pat '_)
          (push `(throw ',done-tag (progn ,@cbody)) branch-forms))
         ((eliscript-bind--pattern-form-p pat)
          (let ((ht-sym (make-symbol "pcase-ht"))
                (vars (eliscript-bind--collect-pattern-vars pat)))
            (push `(condition-case nil
                       (let ((,ht-sym (make-hash-table :test 'eq)))
                         (eliscript-bind--match-runtime ',pat ,val-sym ,ht-sym #'eval)
                         (throw ',done-tag
                                (let ,(mapcar (lambda (v) `(,v (gethash ',v ,ht-sym))) vars)
                                  ,@cbody)))
                     (error nil))
                  branch-forms)))
         (t
          (push `(when (value-equal-p ,val-sym ,pat)
                   (throw ',done-tag (progn ,@cbody)))
                branch-forms)))))
    `(let ((,val-sym ,expr))
       (catch ',done-tag
         ,@(nreverse branch-forms)
         nil))))

(defmacro cond-predicate (pred expr &rest clauses)
  "Evaluate PRED and EXPR once, then test CLAUSES sequentially (supporting `:>>')."
  (let ((pred-sym (make-symbol "cond-pred"))
        (val-sym (make-symbol "cond-val"))
        (res-sym (make-symbol "cond-res"))
        (done-tag (make-symbol "cond-done"))
        (cursor clauses)
        (steps nil))
    (while cursor
      (cond
       ((null (cdr cursor))
        (push `(throw ',done-tag ,(car cursor)) steps)
        (setq cursor nil))
       ((eq (cadr cursor) :>>)
        (let ((test-val (car cursor))
              (recv-fn (nth 2 cursor)))
          (push `(let ((,res-sym (funcall ,pred-sym ,test-val ,val-sym)))
                   (when ,res-sym
                     (throw ',done-tag (funcall ,recv-fn ,res-sym))))
                steps)
          (setq cursor (nthcdr 3 cursor))))
       (t
        (let ((test-val (car cursor))
              (then-expr (cadr cursor)))
          (push `(when (funcall ,pred-sym ,test-val ,val-sym)
                   (throw ',done-tag ,then-expr))
                steps)
          (setq cursor (cddr cursor))))))
    `(let ((,pred-sym ,pred)
           (,val-sym ,expr))
       (catch ',done-tag
         ,@(nreverse steps)
         nil))))

;; ============================================================================
;; 2. Multi-Arity Dispatch (`defun-case`, `lambda-case`)
;; ============================================================================

(defun eliscript-bind--compile-case-clauses (name clauses plist)
  "Validate and compile multi-arity CLAUSES for NAME with declaration PLIST."
  (let ((fixed-arities nil)
        (rest-min-arity nil)
        (compiled-branches nil)
        (destructure-p (plist-get plist :destructure)))
    (dolist (clause clauses)
      (unless (and (consp clause) (listp (car clause)))
        (signal 'eliscript-compile-error
                (list (format "ELI-A0010: invalid clause %S in %s" clause name))))
      (let* ((params (car clause))
             (cbody (cdr clause)))
        (when (memq '&optional params)
          (signal 'eliscript-compile-error
                  (list (format "ELI-A0010: &optional is forbidden in defun-case/lambda-case (%s)" name))))
        (let ((rest-pos (cl-position '&rest params)))
          (if rest-pos
              (progn
                (when rest-min-arity
                  (signal 'eliscript-compile-error
                          (list (format "ELI-A0012: multiple &rest clauses in %s" name))))
                (unless (= rest-pos (- (length params) 2))
                  (signal 'eliscript-compile-error
                          (list (format "ELI-A0012: &rest must be followed by a single parameter in %s" name))))
                (setq rest-min-arity rest-pos)
                (let ((fn-form (if destructure-p
                                   (eliscript-bind--build-destructuring-lambda name params cbody)
                                 `(lambda ,params ,@cbody))))
                  (push (list :kind 'rest :min rest-pos :fn fn-form) compiled-branches)))
            (let ((arity (length params)))
              (when (memq arity fixed-arities)
                (signal 'eliscript-compile-error
                        (list (format "ELI-A0011: duplicate fixed arity %d in %s" arity name))))
              (push arity fixed-arities)
              (let ((fn-form (if destructure-p
                                 (eliscript-bind--build-destructuring-lambda name params cbody)
                               `(lambda ,params ,@cbody))))
                (push (list :kind 'fixed :arity arity :fn fn-form) compiled-branches)))))))
    (when rest-min-arity
      (dolist (fa fixed-arities)
        (when (>= fa rest-min-arity)
          (signal 'eliscript-compile-error
                  (list (format "ELI-A0012: fixed arity %d overlaps &rest minimum arity %d in %s"
                                fa rest-min-arity name))))))
    (let ((args-sym (make-symbol "case-args"))
          (argc-sym (make-symbol "case-argc"))
          (cond-clauses nil))
      (dolist (br (nreverse compiled-branches))
        (if (eq (plist-get br :kind) 'fixed)
            (push `((= ,argc-sym ,(plist-get br :arity))
                    (apply ,(plist-get br :fn) ,args-sym))
                  cond-clauses)
          (push `((>= ,argc-sym ,(plist-get br :min))
                  (apply ,(plist-get br :fn) ,args-sym))
                cond-clauses)))
      `(lambda (&rest ,args-sym)
         (let ((,argc-sym (length ,args-sym)))
           (cond
            ,@(nreverse cond-clauses)
            (t (signal 'wrong-number-of-arguments (list ',name ,argc-sym)))))))))

(defmacro defun-case (name &rest body)
  "Define multi-arity function NAME from clauses in BODY."
  (let* ((extracted (eliscript-contract-extract-declarations body name))
         (plist (plist-get extracted :eliscript))
         (clauses (plist-get extracted :body))
         (fn-form (eliscript-bind--compile-case-clauses name clauses plist)))
    `(progn
       (fset ',name ,fn-form)
       ',name)))

(defmacro lambda-case (&rest body)
  "Create an anonymous multi-arity function from clauses in BODY."
  (let* ((extracted (eliscript-contract-extract-declarations body 'lambda-case))
         (plist (plist-get extracted :eliscript))
         (clauses (plist-get extracted :body)))
    (eliscript-bind--compile-case-clauses 'lambda-case clauses plist)))

;; ============================================================================
;; 3. Immutable Local Bindings (`let-const`, `let*-const`)
;; ============================================================================

(defun eliscript-bind--check-const-mutations (form const-vars)
  "Scan FORM and signal an error if any symbol in CONST-VARS is mutated."
  (when (and const-vars (consp form))
    (let ((head (car form)))
      (cond
       ((eq head 'quote) nil)
       ((eq head 'setq)
        (let ((cursor (cdr form)))
          (while cursor
            (let ((target (car cursor))
                  (val-expr (cadr cursor)))
              (when (memq target const-vars)
                (signal 'eliscript-compile-error
                        (list (format "ELI-C0010: cannot reassign immutable binding `%S' via setq"
                                      target))))
              (eliscript-bind--check-const-mutations val-expr const-vars))
            (setq cursor (cddr cursor)))))
       ((eq head 'setf)
        (let ((cursor (cdr form)))
          (while cursor
            (let ((place (car cursor))
                  (val-expr (cadr cursor)))
              (when (and (symbolp place) (memq place const-vars))
                (signal 'eliscript-compile-error
                        (list (format "ELI-C0010: cannot mutate immutable binding `%S' via setf"
                                      place))))
              (eliscript-bind--check-const-mutations place const-vars)
              (eliscript-bind--check-const-mutations val-expr const-vars))
            (setq cursor (cddr cursor)))))
       ((memq head '(let let*))
        (let ((bindings (cadr form))
              (b-body (cddr form))
              (shadowed nil))
          (dolist (b bindings)
            (if (consp b)
                (progn
                  (eliscript-bind--check-const-mutations (cadr b) const-vars)
                  (push (car b) shadowed))
              (push b shadowed)))
          (let ((remaining (cl-set-difference const-vars shadowed)))
            (dolist (sub b-body)
              (eliscript-bind--check-const-mutations sub remaining)))))
       (t
        (dolist (sub (cdr form))
          (eliscript-bind--check-const-mutations sub const-vars)))))))

(defun eliscript-bind--validate-const-bindings (bindings body macro-name)
  "Validate BINDINGS and BODY for `let-const' or `let*-const'."
  (let ((vars nil))
    (dolist (b bindings)
      (let ((sym (if (consp b) (car b) b)))
        (unless (and (symbolp sym) (not (keywordp sym)))
          (signal 'eliscript-compile-error
                  (list (format "ELI-C0010: invalid binding variable `%S' in %s" sym macro-name))))
        (when (special-variable-p sym)
          (signal 'eliscript-compile-error
                  (list (format "ELI-C0011: %s cannot bind dynamic special variable `%S'"
                                macro-name sym))))
        (push sym vars)))
    (dolist (form body)
      (eliscript-bind--check-const-mutations form vars))))

(defmacro let-const (bindings &rest body)
  "Bind immutable local BINDINGS in parallel and evaluate BODY."
  (eliscript-bind--validate-const-bindings bindings body 'let-const)
  `(let ,bindings ,@body))

(defmacro let*-const (bindings &rest body)
  "Bind immutable local BINDINGS sequentially and evaluate BODY."
  (eliscript-bind--validate-const-bindings bindings body 'let*-const)
  `(let* ,bindings ,@body))

;; ============================================================================
;; 4. Stack-Safe Explicit Tail Recursion (`let-loop`, `defun-tail`, `lambda-tail`, `recur`, `trampoline`)
;; ============================================================================

(defun eliscript-bind--verify-recur-form (form tail-p arity context-name)
  "Verify `recur' in FORM only appears when TAIL-P is non-nil and matches ARITY."
  (when (consp form)
    (let ((head (car form)))
      (cond
       ((eq head 'quote) nil)
       ((eq head 'recur)
        (unless tail-p
          (signal 'eliscript-compile-error
                  (list (format "ELI-R0001: `recur' must be in tail position in %s" context-name))))
        (unless (= (length (cdr form)) arity)
          (signal 'eliscript-compile-error
                  (list (format "ELI-R0002: `recur' in %s expected %d arguments, got %d"
                                context-name arity (length (cdr form))))))
        (dolist (arg (cdr form))
          (eliscript-bind--verify-recur-form arg nil arity context-name)))
       ((memq head '(lambda lambda-async lambda-bind lambda-case defun defun-async defun-bind defun-case))
        ;; Nested functions establish a new boundary; any unshadowed recur inside is forbidden
        (dolist (sub (cddr form))
          (eliscript-bind--verify-recur-form sub nil arity context-name)))
       ((memq head '(let-loop defun-tail lambda-tail))
        ;; Inner tail-recursion construct shadows recur for its own body
        nil)
       ((eq head 'progn)
        (eliscript-bind--verify-recur-seq (cdr form) tail-p arity context-name))
       ((eq head 'if)
        (eliscript-bind--verify-recur-form (nth 1 form) nil arity context-name)
        (eliscript-bind--verify-recur-form (nth 2 form) tail-p arity context-name)
        (eliscript-bind--verify-recur-seq (nthcdr 3 form) tail-p arity context-name))
       ((memq head '(when unless))
        (eliscript-bind--verify-recur-form (nth 1 form) nil arity context-name)
        (eliscript-bind--verify-recur-seq (cddr form) tail-p arity context-name))
       ((eq head 'cond)
        (dolist (clause (cdr form))
          (when (consp clause)
            (if (null (cdr clause))
                (eliscript-bind--verify-recur-form (car clause) tail-p arity context-name)
              (eliscript-bind--verify-recur-form (car clause) nil arity context-name)
              (eliscript-bind--verify-recur-seq (cdr clause) tail-p arity context-name)))))
       ((memq head '(let let* let-const let*-const let-bind let*-bind))
        (dolist (b (cadr form))
          (when (consp b)
            (eliscript-bind--verify-recur-form (cadr b) nil arity context-name)))
        (eliscript-bind--verify-recur-seq (cddr form) tail-p arity context-name))
       ((eq head 'unwind-protect)
        (eliscript-bind--verify-recur-form (nth 1 form) tail-p arity context-name)
        (dolist (cleanup (nthcdr 2 form))
          (eliscript-bind--verify-recur-form cleanup nil arity context-name)))
       (t
        (dolist (sub (cdr form))
          (eliscript-bind--verify-recur-form sub nil arity context-name)))))))

(defun eliscript-bind--verify-recur-seq (forms tail-p arity context-name)
  "Verify `recur' in sequence FORMS where only the last form has TAIL-P."
  (let ((cursor forms))
    (while cursor
      (eliscript-bind--verify-recur-form
       (car cursor) (and tail-p (null (cdr cursor))) arity context-name)
      (setq cursor (cdr cursor)))))

(defvar eliscript-bind--active-recur-tag nil
  "Dynamic tag used by active `let-loop' / `defun-tail' / `lambda-tail' frame.")

(defun recur (&rest new-args)
  "Jump to enclosing tail-recursive target with NEW-ARGS."
  (unless eliscript-bind--active-recur-tag
    (signal 'eliscript-compile-error
            (list "ELI-R0001: `recur' called outside `let-loop', `defun-tail', or `lambda-tail'")))
  (throw eliscript-bind--active-recur-tag (cons :eliscript-recur new-args)))

(defun eliscript-bind--expand-tail-loop (context-name vars init-exprs body)
  "Expand tail-recursive loop for CONTEXT-NAME with VARS, INIT-EXPRS, BODY."
  (eliscript-bind--verify-recur-seq body t (length vars) context-name)
  (let ((tag-sym (make-symbol "recur-tag"))
        (running-sym (make-symbol "recur-running"))
        (result-sym (make-symbol "recur-result"))
        (step-sym (make-symbol "recur-step"))
        (next-vals-sym (make-symbol "recur-vals")))
    `(let ,(mapcar (lambda (pair) (list (car pair) (cdr pair)))
                   (cl-mapcar #'cons vars init-exprs))
       (let ((,running-sym t)
             (,result-sym nil))
         (while ,running-sym
           (let ((,step-sym
                  (catch ',tag-sym
                    (let ((eliscript-bind--active-recur-tag ',tag-sym))
                      (cons :eliscript-return (progn ,@body))))))
             (if (and (consp ,step-sym) (eq (car ,step-sym) :eliscript-recur))
                 (let ((,next-vals-sym (cdr ,step-sym)))
                   (ignore ,next-vals-sym)
                   ,@(let ((idx 0)
                           (assigns nil))
                       (dolist (v vars (nreverse assigns))
                         (push `(setq ,v (nth ,idx ,next-vals-sym)) assigns)
                         (setq idx (1+ idx)))))
               (setq ,running-sym nil)
               (setq ,result-sym (cdr ,step-sym)))))
         ,result-sym))))

(defmacro let-loop (&rest args)
  "Stack-safe loop construct `(let-loop ((var init) ...) body...)' with `recur'."
  (let* ((has-name (symbolp (car args)))
         (bindings (if has-name (cadr args) (car args)))
         (body (if has-name (cddr args) (cdr args)))
         (vars (mapcar (lambda (b) (if (consp b) (car b) b)) bindings))
         (inits (mapcar (lambda (b) (if (consp b) (cadr b) nil)) bindings)))
    (eliscript-bind--expand-tail-loop (if has-name (car args) 'let-loop) vars inits body)))

(defmacro defun-tail (name args &rest body)
  "Define a stack-safe tail-recursive function NAME with ARGS and BODY."
  (let* ((extracted (eliscript-contract-extract-declarations body name))
         (plist (plist-get extracted :eliscript))
         (clean-body (plist-get extracted :body)))
    (eliscript-contract-validate-context 'defun-tail name plist args clean-body)
    (let ((loop-form (eliscript-bind--expand-tail-loop name args args clean-body)))
      `(defun ,name ,args
         ,@(eliscript-contract-wrap-body name plist args (list loop-form))))))

(defmacro lambda-tail (args &rest body)
  "Create an anonymous stack-safe tail-recursive function with ARGS and BODY."
  (let* ((extracted (eliscript-contract-extract-declarations body 'lambda-tail))
         (plist (plist-get extracted :eliscript))
         (clean-body (plist-get extracted :body)))
    (eliscript-contract-validate-context 'lambda-tail 'lambda-tail plist args clean-body)
    (let ((loop-form (eliscript-bind--expand-tail-loop 'lambda-tail args args clean-body)))
      `(lambda ,args
         ,@(eliscript-contract-wrap-body 'lambda-tail plist args (list loop-form))))))

(defun trampoline (fn &rest args)
  "Repeatedly call zero-arg thunks from `(apply FN ARGS)' until non-function."
  (let ((res (apply fn args)))
    (while (functionp res)
      (setq res (funcall res)))
    res))

;; ============================================================================
;; 5. Pipeline Threading Macros (`thread-as`, `thread-cond-*`, `thread-some-*`)
;; ============================================================================

(defmacro thread-as (initial-form var &rest forms)
  "Bind VAR to INITIAL-FORM, then thread VAR sequentially through FORMS."
  (let ((acc initial-form))
    (dolist (step forms acc)
      (setq acc `(let ((,var ,acc)) ,step)))))

(defun eliscript-bind--insert-first (val step)
  "Insert VAL as the first argument of STEP."
  (if (consp step)
      `(,(car step) ,val ,@(cdr step))
    `(,step ,val)))

(defun eliscript-bind--insert-last (val step)
  "Insert VAL as the last argument of STEP."
  (if (consp step)
      `(,(car step) ,@(cdr step) ,val)
    `(,step ,val)))

(defmacro thread-cond-first (initial-form &rest clauses)
  "Thread INITIAL-FORM as first arg through `(TEST STEP)' pairs in CLAUSES."
  (let ((val-sym (make-symbol "cond-thread-val"))
        (cursor clauses)
        (steps nil))
    (while cursor
      (let ((test (car cursor))
            (step (cadr cursor)))
        (push `(when ,test
                 (setq ,val-sym ,(eliscript-bind--insert-first val-sym step)))
              steps))
      (setq cursor (cddr cursor)))
    `(let ((,val-sym ,initial-form))
       ,@(nreverse steps)
       ,val-sym)))

(defmacro thread-cond-last (initial-form &rest clauses)
  "Thread INITIAL-FORM as last arg through `(TEST STEP)' pairs in CLAUSES."
  (let ((val-sym (make-symbol "cond-thread-val"))
        (cursor clauses)
        (steps nil))
    (while cursor
      (let ((test (car cursor))
            (step (cadr cursor)))
        (push `(when ,test
                 (setq ,val-sym ,(eliscript-bind--insert-last val-sym step)))
              steps))
      (setq cursor (cddr cursor)))
    `(let ((,val-sym ,initial-form))
       ,@(nreverse steps)
       ,val-sym)))

(defmacro thread-some-first (initial-form &rest forms)
  "Thread INITIAL-FORM as first arg through FORMS, short-circuiting on nil."
  (let ((val-sym (make-symbol "some-thread-val"))
        (steps nil))
    (dolist (step forms)
      (push `(when (not (null ,val-sym))
               (setq ,val-sym ,(eliscript-bind--insert-first val-sym step)))
            steps))
    `(let ((,val-sym ,initial-form))
       ,@(nreverse steps)
       ,val-sym)))

(defmacro thread-some-last (initial-form &rest forms)
  "Thread INITIAL-FORM as last arg through FORMS, short-circuiting on nil."
  (let ((val-sym (make-symbol "some-thread-val"))
        (steps nil))
    (dolist (step forms)
      (push `(when (not (null ,val-sym))
               (setq ,val-sym ,(eliscript-bind--insert-last val-sym step)))
            steps))
    `(let ((,val-sym ,initial-form))
       ,@(nreverse steps)
       ,val-sym)))

;; ============================================================================
;; 6. Higher-Order Function Combinators (`fn-compose`, `fn-partial`, `fn-juxt`, `fn-complement`)
;; ============================================================================

(defun fn-compose (&rest fns)
  "Return the right-to-left composition of FNS."
  (if (null fns)
      #'identity
    (let ((rev (reverse fns)))
      (lambda (&rest args)
        (let ((res (apply (car rev) args)))
          (dolist (f (cdr rev) res)
            (setq res (funcall f res))))))))

(defun fn-partial (fn &rest bound-args)
  "Return a function that calls FN with BOUND-ARGS prepended to new arguments."
  (lambda (&rest more-args)
    (apply fn (append bound-args more-args))))

(defun fn-juxt (&rest fns)
  "Return a function applying each fn in FNS to args and returning a list."
  (lambda (&rest args)
    (mapcar (lambda (f) (apply f args)) fns)))

(defun fn-complement (pred)
  "Return a predicate that returns the boolean negation of PRED."
  (lambda (&rest args)
    (not (apply pred args))))

(provide 'eliscript-bind)

;;; eliscript-bind.el ends here
