;;; eliscript-compat-syntax-tests.el --- Comprehensive 0.1.0 syntax & semantics unit tests -*- lexical-binding: t; -*-

;;; Commentary:

;; Targeted unit, integration, and boundary tests for the Eliscript 0.1.0
;; Emacs-compatible syntax specification (docs/emacs-compatible-syntax.md).
;; Covers T01 through T11 with per-test high-resolution timing and strict
;; state isolation.

;;; Code:

(require 'ert)
(require 'cl-lib)
(require 'seq)
(require 'map)
(require 'pcase)
(require 'subr-x)
(require 'eliscript-contract)
(require 'eliscript-data)
(require 'eliscript-bind)
(require 'eliscript-module)
(require 'eliscript-async)
(require 'eliscript-js)
(require 'eliscript-abi)
(require 'eliscript-compat)
(require 'eliscript-worker)

(defvar eliscript-compat-tests--timings nil
  "Recorded per-test execution timings in milliseconds.")

(defvar eliscript-compat-tests--dynamic-var 100
  "Special variable used to test dynamic binding semantics.")

(defvar eliscript-compat-tests--async-var "initial-req"
  "Special variable used to test explicit async binding propagation.")

(defun eliscript-compat-tests--run-isolated (test-id domain thunk)
  "Execute THUNK with isolated 0.1.0 state and record timing for TEST-ID in DOMAIN."
  (eliscript-compat-reset-state!)
  (let ((start (float-time))
        (status 'passed))
    (unwind-protect
        (funcall thunk)
      (let ((elapsed-ms (* 1000.0 (- (float-time) start))))
        (push (list :id test-id
                    :domain domain
                    :elapsed-ms elapsed-ms
                    :status status)
              eliscript-compat-tests--timings)
        (eliscript-compat-reset-state!)))))

;; ============================================================================
;; T01: 100% Emacs Lisp Default Kernel Semantics (Unextended Forms)
;; ============================================================================

(ert-deftest eliscript-0-1-0-t01-lisp2-dual-namespace-and-plist ()
  "Verify Lisp-2 separate function/value slots and symbol property lists."
  (eliscript-compat-tests--run-isolated
   "T01-01" "T01"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(progn
           (defvar dual-sym 21)
           (defun dual-sym (x) (* x 2))
           (put 'dual-sym :meta-tag 'kernel-ok)
           (list (dual-sym dual-sym)
                 (funcall #'dual-sym 9)
                 (apply #'dual-sym '(15))
                 (symbol-value 'dual-sym)
                 (get 'dual-sym :meta-tag)))")
       '(42 18 30 21 kernel-ok)))
     ;; Calling a lexical variable without funcall must signal void-function.
     (should-error
      (eliscript-compat-eval-string
       "(let ((local-fn (lambda (x) (+ x 1))))
          (local-fn 10))")
      :type 'void-function))))

(ert-deftest eliscript-0-1-0-t01-unique-nil-falsy-and-empty-list-identity ()
  "Verify only nil is falsy and all non-nil values (including 0, \"\", [], sentinels) are truthy."
  (eliscript-compat-tests--run-isolated
   "T01-02" "T01"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(require 'eliscript)
         (require 'eliscript-js)
         (list
           ;; nil identities
           (eq nil '())
           (eq 'nil '())
           (eq nil (list))
           (if nil 'yes 'no)
           (if '() 'yes 'no)
           ;; All non-nil values must be truthy in if
           (if 0 't-zero 'f-zero)
           (if 0.0 't-float 'f-float)
           (if -0.0 't-negzero 'f-negzero)
           (if \"\" 't-empty-str 'f-empty-str)
           (if [] 't-empty-vec 'f-empty-vec)
           (if (persistent-list) 't-plist 'f-plist)
           (if (persistent-vector) 't-pvec 'f-pvec)
           (if (result-error \"boom\") 't-err 'f-err)
           (if option-none 't-none 'f-none)
           (if js-false 't-js-false 'f-js-false)
           (if js-null 't-js-null 'f-js-null)
           (if js-undefined 't-js-undef 'f-js-undef))")
       '(t t t no no
         t-zero t-float t-negzero t-empty-str t-empty-vec
         t-plist t-pvec t-err t-none
         t-js-false t-js-null t-js-undef))))))

(ert-deftest eliscript-0-1-0-t01-lexical-and-special-variables ()
  "Verify lexical closures coexist with dynamic defvar special bindings."
  (eliscript-compat-tests--run-isolated
   "T01-03" "T01"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(progn
           (defvar *dyn-rate* 10)
           ;; Re-evaluating defvar must NOT overwrite existing value
           (defvar *dyn-rate* 999)
           (defconst *const-advisory* 5)
           (defun read-dyn () *dyn-rate*)
           (let ((adder (let ((lex-offset 3))
                          (lambda (v) (+ v lex-offset (read-dyn))))))
             (list
               (funcall adder 2)
               (let ((*dyn-rate* 20))
                 (funcall adder 2))
               *dyn-rate*
               (progn (setq *const-advisory* 6) *const-advisory*))))")
       '(15 25 10 6))))))

(ert-deftest eliscript-0-1-0-t01-mutable-native-collections-and-arithmetic ()
  "Verify native cons/list/vector/hash-table mutability and Emacs arithmetic."
  (eliscript-compat-tests--run-isolated
   "T01-04" "T01"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(let ((pair (cons 1 2))
               (vec [10 20 30])
               (ht (make-hash-table :test 'equal)))
           (setcar pair 11)
           (setcdr pair 22)
           (aset vec 1 99)
           (puthash \"k\" 42 ht)
           (list (car pair) (cdr pair)
                 (vectorp vec) (aref vec 1)
                 (gethash \"k\" ht) (hash-table-count ht)
                 (/ 7 2) (/ -7 2) (/ 7.0 2) (/ 24 2 3)
                 (mod -7 3) (% -7 3)
                 (length \"a😀b\")
                 (substring \"a😀b\" 1 2)))")
       '(11 22 t 99 42 1 3 -3 3.5 4 2 -1 3 "😀")))
     (should-error
      (eliscript-compat-eval-string "(/ 10 0)")
      :type 'arith-error))))

(ert-deftest eliscript-0-1-0-t01-control-flow-conditions-and-defmacro ()
  "Verify catch/throw, condition-case, unwind-protect, and full defmacro."
  (eliscript-compat-tests--run-isolated
   "T01-05" "T01"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(progn
           (defmacro with-double-add (a b)
             `(+ (* 2 ,a) (* 2 ,b)))
           (let ((log nil))
             (let ((caught
                    (catch 'done
                      (unwind-protect
                          (progn
                            (push 'entered log)
                            (throw 'done (with-double-add 10 11)))
                        (push 'cleaned log)))))
               (let ((handled
                      (condition-case err
                          (/ 1 0)
                        (arith-error (list 'caught-arith (car err))))))
                 (list caught (nreverse log) handled)))))")
       '(42 (entered cleaned) (caught-arith arith-error)))))))

;; ============================================================================
;; T02: Extension Activation by Definition Identity & Conflict Protection
;; ============================================================================

(ert-deftest eliscript-0-1-0-t02-unextended-symbol-freedom-and-atom-predicate ()
  "Verify unimported extension names remain user-definable and atom stays native."
  (eliscript-compat-tests--run-isolated
   "T02-01" "T02"
   (lambda ()
     ;; Without (require 'eliscript-async), user can define and call `await` as a normal function!
     (should
      (equal
       (eliscript-compat-eval-string
        "(progn
           (defun await (x) (+ x 100))
           (await 23))")
       123))
     ;; Even with (require 'eliscript), `(atom ...)` is still the standard Emacs predicate!
     (eliscript-compat-reset-state!)
     (should
      (equal
       (eliscript-compat-eval-string
        "(require 'eliscript)
         (list (atom 'sym)
               (atom 42)
               (atom nil)
               (atom '(1 . 2))
               (cell-value (state-cell 77)))")
       '(t t t nil 77))))))

(ert-deftest eliscript-0-1-0-t02-extension-conflict-detection ()
  "Verify loading an extension over a conflicting user definition signals an error."
  (eliscript-compat-tests--run-isolated
   "T02-02" "T02"
   (lambda ()
     (should-error
      (eliscript-compat-eval-string
       "(progn
          (defun persistent-vector (x) x)
          (require 'eliscript-data))")
      :type 'eliscript-compile-error))))

;; ============================================================================
;; T03: Unified pcase Superset & Destructuring (eliscript-bind)
;; ============================================================================

(ert-deftest eliscript-0-1-0-t03-unified-destructuring-positive-and-boundary ()
  "Verify vector, list, map, record, result, and option patterns across let-bind/defun-bind/pcase."
  (eliscript-compat-tests--run-isolated
   "T03-01" "T03"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(require 'eliscript)
         (cl-defstruct-persistent account
           (owner :type string)
           (balance :type integer :default 0))
         (let-bind (([a b &rest vtail] (persistent-vector 10 20 30 40))
                    ([na nb &rest nvtail] [1 2 3])
                    ((:list l1 l2 &rest ltail) (persistent-list 'x 'y 'z))
                    ;; Present nil key must NOT trigger default!
                    ((:map (:present-nil (default pn 'fallback))
                           (:missing-key (default mk 'used-default)))
                     (persistent-map :present-nil nil))
                    ((:record account (:owner acc-owner) (:balance acc-bal))
                     (make-account :owner \"Ada\" :balance 500))
                    ((:ok ok-val) (result-ok 99))
                    ((:some some-val) (option-some \"hi\")))
           (list a b (persistent-vector-p vtail) (value-count vtail)
                 na nb (vectorp nvtail) (length nvtail)
                 l1 l2 (persistent-list-p ltail) (value-count ltail)
                 pn mk
                 acc-owner acc-bal
                 ok-val some-val))")
       '(10 20 t 2
         1 2 t 1
         x y t 1
         nil used-default
         "Ada" 500
         99 "hi"))))))

(ert-deftest eliscript-0-1-0-t03-defun-bind-optional-and-pcase-value ()
  "Verify defun-bind optional defaults, pcase-value structural matching, and cond-predicate."
  (eliscript-compat-tests--run-isolated
   "T03-02" "T03"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(require 'eliscript)
         (defun-bind format-pair ([x y] &optional ((:map (:sep sep)) (persistent-map :sep \":\")))
           (format \"%s%s%s\" x sep y))
         (let ((target (persistent-vector 1 2)))
           (list
             (format-pair (persistent-vector \"a\" \"b\"))
             (format-pair [\"a\" \"b\"] (persistent-map :sep \"-\"))
             (pcase-value target
               ((persistent-vector 1 2) 'matched-vec)
               (_ 'no-match))
             (cond-predicate #'equal \"beta\"
               \"alpha\" 'first
               \"beta\" :>> (lambda (matched) (list 'got matched))
               'fallback)))")
       '("a:b" "a-b" matched-vec (got t)))))))

(ert-deftest eliscript-0-1-0-t03-destructuring-negative-diagnostics ()
  "Verify missing map keys, nil passed to optional pattern, duplicate vars, and length mismatch."
  (eliscript-compat-tests--run-isolated
   "T03-03" "T03"
   (lambda ()
     ;; Missing required map key must signal error
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (let-bind (((:map (:required-key k)) (persistent-map :other 1)))
          k)"))
     ;; Passing explicit nil to optional destructuring parameter must NOT coerce nil to empty vector
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (defun-bind take-opt (&optional ([a b] [1 2])) (+ a b))
        (take-opt nil)"))
     ;; Duplicate variable names in pattern must fail
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (let-bind (([dup dup] [1 2])) dup)")
      :type 'eliscript-compile-error)
     ;; Vector length mismatch must fail
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (let-bind (([a b c] [1 2])) a)")))))

;; ============================================================================
;; T04: Multi-Arity, let-const, Tail Recursion (recur), Threading & fn-*
;; ============================================================================

(ert-deftest eliscript-0-1-0-t04-defun-case-and-lambda-case ()
  "Verify multi-arity dispatch, Lisp-2 compliance, and invalid clause rejection."
  (eliscript-compat-tests--run-isolated
   "T04-01" "T04"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(require 'eliscript)
         (defun-case calc
           (() 0)
           ((x) (* x 10))
           ((x y) (+ x y))
           ((x y z &rest more) (+ x y z (apply #'+ more))))
         (let ((anon (lambda-case
                       ((a) (list 'one a))
                       ((a b) (list 'two a b)))))
           (list (calc) (calc 5) (calc 3 4) (calc 1 2 3 4 5)
                 (funcall anon 'p) (funcall anon 'p 'q)))")
       '(0 50 7 15 (one p) (two p q))))
     ;; Duplicate arity must fail
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (defun-case bad-dup ((x) x) ((y) y))")
      :type 'eliscript-compile-error)
     ;; &optional inside defun-case must fail
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (defun-case bad-opt ((x &optional y) x))")
      :type 'eliscript-compile-error)
     ;; Fixed arity overlapping &rest minimum arity must fail
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (defun-case bad-overlap ((x &rest r) x) ((a b) a))")
      :type 'eliscript-compile-error))))

(ert-deftest eliscript-0-1-0-t04-let-const-and-50k-tail-recursion ()
  "Verify let-const binding protection and 50,000-depth stack-safe recur with dynamic vars."
  (eliscript-compat-tests--run-isolated
   "T04-02" "T04"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(require 'eliscript)
         (defun-tail sum-to (n acc)
           (if (<= n 0)
               acc
             (recur (1- n) (+ acc n))))
         (let-const ((box (make-hash-table :test 'equal))
                     (limit 50000))
           (puthash \"ok\" t box)
           (list (gethash \"ok\" box)
                 (sum-to limit 0)
                 (let-loop ((i 0) (a 1) (b 2))
                   (if (>= i 1)
                       (list a b)
                     ;; Parallel left-to-right evaluation swaps a and b
                     (recur (1+ i) b a)))))")
       '(t 1250025000 (2 1))))
     ;; Reassigning let-const binding must fail at compile time
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (let-const ((x 10))
          (setq x 20))")
      :type 'eliscript-compile-error)
     ;; recur in non-tail position must fail at compile time
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (defun-tail bad-recur (n)
          (if (<= n 0) 0 (+ 1 (recur (1- n)))))")
      :type 'eliscript-compile-error))))

(ert-deftest eliscript-0-1-0-t04-threading-and-fn-combinators ()
  "Verify thread-as, thread-cond-*, thread-some-*, and fn-* combinators."
  (eliscript-compat-tests--run-isolated
   "T04-03" "T04"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(require 'eliscript)
         (let ((side-effects 0))
           (let ((res-some-nil
                  (thread-some-first (persistent-map :a nil)
                    (value-get :a)
                    (prog1 (setq side-effects (1+ side-effects)))))
                 (res-some-ok
                  (thread-some-last 5
                    (+ 10)
                    (* 2)))
                 (res-as
                  (thread-as 3 v
                    (* v v)
                    (+ v 1)))
                 (res-cond
                  (thread-cond-first 10
                    t (+ 5)
                    nil (* 100)
                    t (- 3)))
                 (comb (fn-compose #'1+ (fn-partial #'* 3)))
                 (juxt-fn (fn-juxt #'1- #'1+))
                 (odd-fn (fn-complement #'cl-evenp)))
             (list res-some-nil side-effects res-some-ok res-as res-cond
                   (funcall comb 4)
                   (funcall juxt-fn 10)
                   (funcall odd-fn 7)
                   (funcall odd-fn 8))))")
       '(nil 0 30 10 12 13 (9 11) t nil))))))

;; ============================================================================
;; T05: Persistent Data, seq/map Generics, Struct Schema, Protocols, Cells, Lazy
;; ============================================================================

(ert-deftest eliscript-0-1-0-t05-persistent-collections-and-seq-map-generics ()
  "Verify all 7 persistent collections, value-* APIs, and Emacs seq.el/map.el generics."
  (eliscript-compat-tests--run-isolated
   "T05-01" "T05"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(require 'eliscript)
         (let* ((pl (persistent-list 1 2 3))
                (pv (persistent-vector 10 20 30))
                (pm (persistent-map :a 1 :b 2))
                (pm2 (value-put pm :b 22))
                (pm3 (value-remove pm2 :a))
                (ps (persistent-set 'x 'y 'x))
                (pq (value-conj (persistent-queue 1) 2))
                (psm (persistent-sorted-map #'value-compare :z 9 :a 1 :m 5))
                (pss (persistent-sorted-set #'value-compare 30 10 20))
                (empty-with-meta (value-with-meta (persistent-list) (persistent-map :tag 'meta-ok))))
           (list
             ;; Predicates & value-*
             (persistent-list-p pl) (persistent-vector-p pv) (persistent-map-p pm)
             (persistent-set-p ps) (persistent-queue-p pq)
             (persistent-sorted-map-p psm) (persistent-sorted-set-p pss)
             (value-get pm :b) (value-get pm2 :b) (value-get pm3 :a 'gone)
             (value-count ps)
             ;; Emacs seq.el & map.el interoperability
             (seq-length pv) (seq-elt pv 1)
             (seq-map #'1+ pl)
             (seq-filter #'cl-evenp pv)
             (map-elt pm2 :b)
             (map-contains-key pm2 :a)
             (seq-into '(7 8) 'persistent-vector-p)
             ;; Sorted order & metadata on empty persistent list
             (map-keys psm)
             (seq-into pss 'list)
             (value-empty-p empty-with-meta)
             (if empty-with-meta 'truthy 'falsy)
             (value-get (value-meta empty-with-meta) :tag)))")
       '(t t t t t t t
         2 22 gone 2
         3 20
         (2 3 4)
         (10 20 30)
         22 t
         t
         (:a :m :z)
         (10 20 30)
         t truthy meta-ok))))))

(ert-deftest eliscript-0-1-0-t05-struct-schema-and-json-schema-roundtrip ()
  "Verify cl-defstruct-persistent field contracts, immutability, and JSON Schema export."
  (eliscript-compat-tests--run-isolated
   "T05-02" "T05"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(require 'eliscript)
         (cl-defstruct-persistent tool-spec
           \"Tool invocation record.\"
           (name :type string :doc \"Tool name\")
           (retries :type integer :min 0 :max 5 :default 1 :doc \"Retry count\")
           payload)
         (let* ((t1 (make-tool-spec :name \"search\" :payload (persistent-map :q \"lisp\")))
                (t2 (tool-spec-with t1 :retries 3))
                (schema (struct-json-schema 'tool-spec))
                (json-str (struct-to-json 'tool-spec t2))
                (t3 (struct-from-json 'tool-spec json-str)))
           (list (tool-spec-p t1)
                 (tool-spec-name t1)
                 (tool-spec-retries t1)
                 (tool-spec-retries t2)
                 (struct-validate 'tool-spec t2)
                 (value-get schema :type)
                 (value-equal-p t2 t3)))")
       '(t "search" 1 3 t "object" t)))
     ;; Violating :type or :min/:max must fail validation on construction or -with update
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (cl-defstruct-persistent item (score :type integer :min 0 :max 10))
        (make-item :score -1)"))
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (cl-defstruct-persistent item (score :type integer :min 0 :max 10))
        (let ((it (make-item :score 5)))
          (item-with it :score \"not-an-int\"))")))))

(ert-deftest eliscript-0-1-0-t05-protocols-cells-lazy-transducers-and-transients ()
  "Verify protocols, value generics, state-cell, delay/lazy-seq, transducers, and with-transient."
  (eliscript-compat-tests--run-isolated
   "T05-03" "T05"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(require 'eliscript)
         (defprotocol IDescribe
           (describe-val (self)))
         (cl-defstruct-persistent point (x :type integer) (y :type integer))
         (extend-protocol IDescribe point
           (describe-val (self)
             (format \"pt(%d,%d)\" (point-x self) (point-y self))))
         (cl-defgeneric-value dispatch-tag (kind val) kind)
         (cl-defmethod-value dispatch-tag :double (_kind val) (* val 2))
         (let* ((cell (state-cell 10 :validator (lambda (v) (>= v 0))))
                (watched nil)
                (_ (cell-watch cell :logger (lambda (_k _r old new) (push (list old new) watched))))
                (_ (cell-update! cell (lambda (v) (+ v 5))))
                (d (let ((x 20)) (delay (+ x 22))))
                (lseq (lazy-take 4 (lazy-filter #'cl-evenp (lazy-map #'1+ (lazy-range 1)))))
                (xform (fn-compose (map-transducer (lambda (x) (* x 2)))
                                   (filter-transducer (lambda (x) (> x 4)))))
                (transduced (seq-transduce xform #'+ 0 '(1 2 3 4)))
                (built (with-transient (b (persistent-vector))
                         (dolist (n '(1 2 3))
                           (conj! b (* n 10))))))
           (list (describe-val (make-point :x 3 :y 4))
                 (dispatch-tag :double 21)
                 (cell-value cell)
                 watched
                 (realized-p d) (force d) (realized-p d)
                 (seq-into lseq 'list)
                 transduced
                 (persistent-vector-p built)
                 (seq-into built 'list)))")
       '("pt(3,4)" 42 15 ((10 15)) nil 42 t (2 4 6 8) 14 t (10 20 30))))
     ;; state-cell validator failure must preserve old state
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (let ((c (state-cell 10 :validator (lambda (v) (>= v 0)))))
          (cell-reset! c -5))"))
     ;; Using transient builder after with-transient scope exits must fail
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (let ((escaped nil))
          (with-transient (b (persistent-vector))
            (setq escaped b)
            (conj! b 1))
          (conj! escaped 2))")))))

;; ============================================================================
;; T06: Module System (defmodule), Lexical Privacy, Reload & Checked Macros
;; ============================================================================

(ert-deftest eliscript-0-1-0-t06-module-lexical-privacy-and-live-exports ()
  "Verify defmodule lexical isolation from global fset/set, live value exports, and reload."
  (eliscript-compat-tests--run-isolated
   "T06-01" "T06"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(require 'eliscript)
         (defmodule sample.counter
           (defconst-lexical step 5)
           (defvar-lexical count 0)
           (defun-lexical add-step (v) (+ v step))
           (defun bump! ()
             (setq count (add-step count))
             count)
           (export-functions bump!)
           (export-values count))
         ;; Tamper with global symbols of the same names
         (fset 'add-step (lambda (_v) 9999))
         (set 'step 9999)
         (import-functions sample.counter :only (bump!))
         (import-values sample.counter :only (count))
         (let ((c0 count)
               (c1 (bump!))
               (c2 count))
           (list c0 c1 c2))")
       '(0 5 5)))
     ;; Reassigning defconst-lexical must fail at compile time
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (defmodule bad.const
          (defconst-lexical fixed 1)
          (defun mutate () (setq fixed 2)))")
      :type 'eliscript-compile-error))))

(ert-deftest eliscript-0-1-0-t06-defmacro-checked-hygiene-and-inputs ()
  "Verify defmacro-checked deterministic gensym and declared file input checks."
  (eliscript-compat-tests--run-isolated
   "T06-02" "T06"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(require 'eliscript)
         (defmacro-checked eval-once-double (form)
           (declare (eliscript :pure t :portable t))
           (let ((tmp (macro-gensym \"val\")))
             `(let ((,tmp ,form))
                (+ ,tmp ,tmp))))
         (let ((counter 0))
           (list (eval-once-double (setq counter (1+ counter)))
                 counter))")
       '(2 1)))
     ;; Undeclared file read in defmacro-checked must fail
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (defmacro-checked bad-reader ()
          (macro-read-file \"package.json\"))
        (bad-reader)")
      :type 'eliscript-compile-error))))

;; ============================================================================
;; T07: Static Contracts & AI Pre/Post-Conditions (eliscript-contract)
;; ============================================================================

(ert-deftest eliscript-0-1-0-t07-declare-contracts-and-restrictions ()
  "Verify :pure, :portable, :checked, :params, :returns, :requires, :ensures, and ordinary defun restrictions."
  (eliscript-compat-tests--run-isolated
   "T07-01" "T07"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(require 'eliscript)
         (defun clamp-pct (x)
           (declare (eliscript :pure t :portable t
                               :params ((x numberp))
                               :returns numberp
                               :requires ((>= x -1000))
                               :ensures ((and (>= result 0) (<= result 100)))))
           (min 100 (max 0 x)))
         (list (clamp-pct -20) (clamp-pct 45) (clamp-pct 250))")
       '(0 45 100)))
     ;; Ordinary defun with :async t must fail!
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (defun sneaky-async (x)
          (declare (eliscript :async t))
          x)")
      :type 'eliscript-compile-error)
     ;; Ordinary defun with :destructure t must fail!
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (defun sneaky-bind ([x y])
          (declare (eliscript :destructure t))
          (+ x y))")
      :type 'eliscript-compile-error)
     ;; :portable t calling host buffer API must fail static check!
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (defun non-portable-fn ()
          (declare (eliscript :portable t))
          (current-buffer))")
      :type 'eliscript-compile-error)
     ;; Runtime violation of :requires or :ensures must signal contract error
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (defun positive-only (x)
          (declare (eliscript :requires ((> x 0)) :ensures ((> result 0))))
          x)
        (positive-only -5)")))))

;; ============================================================================
;; T08: Async Functions, Structured Concurrency, Timeouts, Channels & Engine RPC
;; ============================================================================

(ert-deftest eliscript-0-1-0-t08-async-scope-timeout-channel-and-engine-handles ()
  "Verify defun-async/await, with-async-scope/timeout, async-channel, and engine-bind revocation."
  (eliscript-compat-tests--run-isolated
   "T08-01" "T08"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(require 'eliscript)
         (defun-async compute-step (x)
           (+ x 10))
         (defun-async pipeline-demo ()
           (let ((ch (make-async-channel 2))
                 (cleaned nil))
             (await (channel-put! ch (await (compute-step 5))))
             (await (channel-put! ch 27))
             (channel-close! ch)
             (let ((v1 (option-value (await (channel-take! ch))))
                   (v2 (option-value (await (channel-take! ch))))
                   (v3 (await (channel-take! ch))))
               ;; Test scope auto-revocation of engine-bind handles
               (let (( stale-handle nil ))
                 (with-async-scope (scope)
                   (setq stale-handle (engine-bind (lambda (n) (* n 2)) scope))
                   (unwind-protect
                       (+ v1 v2)
                     (setq cleaned t)))
                 (list (+ v1 v2) (option-none-p v3) cleaned (engine-handle-p stale-handle))))))
         (eliscript-async-wait (pipeline-demo))")
       '(42 t t t)))
     ;; await outside async function or inside nested sync lambda must fail at compile time
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (defun sync-caller (f)
          (await f))")
      :type 'eliscript-compile-error)
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (defun-async outer-async (f)
          (mapcar (lambda (x) (await x)) (list f)))")
      :type 'eliscript-compile-error)
     ;; Calling revoked engine handle must fail with eliscript-engine-handle-error
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (let ((h (engine-bind (lambda (x) x))))
          (engine-revoke! h)
          (eliscript-async-wait (engine-call 'local h 10)))")
      :type 'eliscript-engine-handle-error))))

;; ============================================================================
;; T09: Explicit JS Interop, Raw Sentinels & js-regexp (eliscript-js)
;; ============================================================================

(ert-deftest eliscript-0-1-0-t09-js-interop-sentinels-and-regexp ()
  "Verify js-false/js-null/js-undefined sentinels, UTF-16 helpers, and match-data preservation."
  (eliscript-compat-tests--run-isolated
   "T09-01" "T09"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(require 'eliscript)
         (require 'eliscript-js)
         (let ((obj (js-object :flag js-false :empty js-undefined :num 42)))
           ;; Establish Emacs match-data before calling js-regexp-find
           (string-match \"\\\\([a-z]+\\\\)\" \"hello123\")
           (let ((before-match (match-string 1 \"hello123\"))
                 (rx-res (js-regexp-find (js-regexp \"([0-9]+)\") \"hello123\"))
                 (after-match (match-string 1 \"hello123\")))
             (list
               ;; Default js-get converts false/undefined -> nil
               (js-get obj :flag)
               (js-get obj :empty)
               (js-get obj :num)
               ;; Raw js-get-raw preserves sentinels
               (js-false-p (js-get-raw obj :flag))
               (js-undefined-p (js-get-raw obj :empty))
               (js-nullish-p js-null)
               (js-nullish-p js-undefined)
               (js-nullish-p js-false)
               ;; Arithmetic and UTF-16 length vs Emacs char length
               (/ 5 2)
               (js-divide 5 2)
               (length \"😀\")
               (js-length \"😀\")
               ;; Regexp result & match-data preservation
               (value-get rx-res :match)
               (equal before-match after-match))))")
       '(nil nil 42 t t t t nil 2 2.5 1 2 "123" t))))))

;; ============================================================================
;; T10: Multi-Target WASM & Native Zero-Allocation Kernel ABI (eliscript-abi)
;; ============================================================================

(ert-deftest eliscript-0-1-0-t10-numeric-f64-and-memory-u32-abi ()
  "Verify :abi :numeric-f64 and :abi :memory-u32 execution and static validation."
  (eliscript-compat-tests--run-isolated
   "T10-01" "T10"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(require 'eliscript)
         (require 'eliscript-abi)
         (defun hyp-sq (a b)
           (declare (eliscript :abi :numeric-f64
                               :export \"hyp_sq\"
                               :params ((a :f64) (b :f64))
                               :returns :f64))
           (+ (* a a) (* b b)))
         (defun mem-checksum (offset)
           (declare (eliscript :abi :memory-u32
                               :params ((offset :u32))
                               :returns :u32))
           (mem-store-u32 offset 305419896)
           (word-add (mem-load-u32 offset) 1))
         (with-abi-memory (:initial-pages 1 :max-pages 4)
           (list (hyp-sq 3.0 4.0)
                 (mem-checksum 64)
                 (word-add #xffffffff 1)))")
       '(25.0 305419897 0)))
     ;; Unsupported string/list allocation in :numeric-f64 must fail static check
     (should-error
      (eliscript-compat-eval-string
       "(require 'eliscript)
        (require 'eliscript-abi)
        (defun bad-abi (x)
          (declare (eliscript :abi :numeric-f64))
          (list x))")
      :type 'eliscript-compile-error))))

;; ============================================================================
;; T13: Industrial-Grade Emacs Lisp Syntax & Standard Library Parity
;; ============================================================================

(ert-deftest eliscript-0-1-0-t13-industrial-elisp-syntax-and-stdlib ()
  "Verify ?char literals, &optional/&rest/&key, cl-defstruct, setf places, pcase, cl-labels, cl-loop, rx, UTF-8/SHA-256, and with-temp-buffer."
  (eliscript-compat-tests--run-isolated
   "T13-01" "T13"
   (lambda ()
     (should
      (equal
       (eliscript-compat-eval-string
        "(progn
           (cl-defstruct (sample-node (:constructor sample-node-create)
                                      (:copier nil))
             (kind 'leaf)
             (count 0)
             (table (make-hash-table :test 'equal)))
           (cl-defun compute-opt (a &optional (b 10) &key (scale 2) (bonus 0))
             (+ (* (+ a b) scale) bonus))
           (let* ((n1 (sample-node-create :kind 'branch))
                  (n2 (sample-node-create))
                  (lst (list 10 20 30))
                  (vec (vector 'a 'b 'c))
                  (bytes (make-string 4 0))
                  (al (list (cons 'k1 1) (cons 'k2 2)))
                  (pl (list :p1 100 :p2 200))
                  (ht (sample-node-table n1))
                  (dotted `((alpha . ,(+ 1 2)) (beta . ,(* 2 3)))))
             (puthash \"init\" 1 ht)
             (setf (sample-node-count n1) 7
                   (nth 1 lst) 99
                   (aref vec 2) 'z
                   (aref bytes 1) 65
                   (gethash \"k\" ht) 42
                   (alist-get 'k1 al) 11
                   (plist-get pl :p2) 222)
             (cl-incf (sample-node-count n1) 3)
             (cl-decf (nth 0 lst) 4)
             (push 'head lst)
             (let ((popped (pop lst))
                   (matched
                    (pcase (cons \"key\" 15)
                      (`(,(and (pred stringp) k) . ,(and (pred integerp) (app 1+ v)))
                       (list k v))
                      (_ 'miss)))
                   (looped
                    (cl-loop for (k v) on '(:a 1 :b 2 :c 3) by #'cddr
                             collect (cons (symbol-name k) (* v 10))))
                   (mut-rec
                    (cl-labels ((even-lp (n) (if (= n 0) t (odd-lp (1- n))))
                                (odd-lp (n) (if (= n 0) nil (even-lp (1- n)))))
                      (list (even-lp 6) (odd-lp 6))))
                   (buf-out
                    (with-temp-buffer
                      (insert \"alpha=10\\nbeta=25\\n\")
                      (goto-char (point-min))
                      (let ((found nil))
                        (while (re-search-forward \"\\\\([a-z]+\\\\)=\\\\([0-9]+\\\\)\" nil t)
                          (push (cons (match-string 1) (string-to-number (match-string 2))) found))
                        (nreverse found))))
                   (w-cjk (string-width \"中文abc\"))
                   (utf8-rt (decode-coding-string (encode-coding-string \"λ-test\" 'utf-8-unix) 'utf-8-unix))
                   (sha (secure-hash 'sha256 \"eliscript-dual-host\")))
               (list (list ?a ?\\s ?\\n ?\\t ?\\\" ?\\\\)
                     (compute-opt 5)
                     (compute-opt 5 3 :scale 4)
                     (sample-node-p n1)
                     (sample-node-kind n1)
                     (sample-node-kind n2)
                     (sample-node-count n1)
                     (hash-table-count (sample-node-table n2))
                     popped
                     lst
                     (aref vec 2)
                     (aref bytes 1)
                     (gethash \"k\" ht)
                     (alist-get 'k1 al)
                     (plist-get pl :p2)
                     (alist-get 'alpha dotted)
                     (alist-get 'beta dotted)
                     matched
                     looped
                     mut-rec
                     buf-out
                     w-cjk
                     utf8-rt
                     (length sha)))))")
       (list (list ?a ?\s ?\n ?\t ?\" ?\\)
             30
             32
             t
             'branch
             'leaf
             10
             0
             'head
             '(6 99 30)
             'z
             65
             42
             11
             222
             3
             6
             '("key" 16)
             '((":a" . 10) (":b" . 20) (":c" . 30))
             '(t nil)
             '(("alpha" . 10) ("beta" . 25))
             7
             "λ-test"
             64))))))

;; ============================================================================
;; T14 & T15: Unmodified .el Dual-Host Execution & Differential Verification
;; ============================================================================

(ert-deftest eliscript-0-1-0-t14-t15-unmodified-elisp-dual-host-execution ()
  "Verify eliscript-compat-eval-file loads unmodified .el modules and matches native Emacs."
  (eliscript-compat-tests--run-isolated
   "T14-01" "T14"
   (lambda ()
     (let ((temp-el (make-temp-file "eliscript-dual-host-" nil ".el")))
       (unwind-protect
           (progn
             (with-temp-file temp-el
               (insert ";;; dual-host-sample.el --- Sample unmodified Elisp module -*- lexical-binding: t; -*-\n"
                       "(require 'cl-lib)\n"
                       "(require 'seq)\n"
                       "(require 'subr-x)\n"
                       "(defun dual-host-table-layout (rows)\n"
                       "  (let ((widths nil))\n"
                       "    (dolist (row rows)\n"
                       "      (let ((idx 0))\n"
                       "        (dolist (cell row)\n"
                       "          (let ((w (string-width (or cell \"\"))))\n"
                       "            (if (< idx (length widths))\n"
                       "                (setf (nth idx widths) (max (nth idx widths) w))\n"
                       "              (setq widths (append widths (list w)))))\n"
                       "          (setq idx (1+ idx)))))\n"
                       "    (mapcar (lambda (row)\n"
                       "              (let ((i -1))\n"
                       "                (mapconcat (lambda (c)\n"
                       "                             (setq i (1+ i))\n"
                       "                             (let ((pad (- (nth i widths) (string-width c))))\n"
                       "                               (concat c (make-string (max 0 pad) ?\\s))))\n"
                       "                           row \" | \")))\n"
                       "            rows)))\n"
                       "(provide 'dual-host-sample)\n"))
             (eliscript-compat-eval-file temp-el)
             (should
              (equal
               (eliscript-compat-eval-string
                "(dual-host-table-layout '((\"字段\" \"值\") (\"status\" \"正常\")))")
               '("字段   | 值  " "status | 正常"))))
         (when (file-exists-p temp-el)
           (delete-file temp-el)))))))

;; ============================================================================
;; T16: Dual-Host .el -> .mjs Module Compiler & Long-Lived Worker Acceleration
;; ============================================================================

(ert-deftest eliscript-0-1-0-t16-compile-elisp-module-and-worker-acceleration ()
  "Verify compiling unmodified .el into .mjs and offloading calls to eliscript-worker with fallback."
  (eliscript-compat-tests--run-isolated
   "T16-01" "T16"
   (lambda ()
     (let* ((out-dir (expand-file-name "dist/emacs-compat-tests/"
                                       eliscript-compat--project-directory))
            (temp-el (progn (make-directory out-dir t)
                            (make-temp-file (expand-file-name "accel-src-" out-dir) nil ".el")))
            ;; Generated modules import the `eliscript' package, so they must
            ;; live inside the project rather than in the system temp directory.
            (temp-mjs (concat (file-name-sans-extension temp-el) ".mjs"))
            (temp-eli (concat (file-name-sans-extension temp-el) ".eli"))
            (worker nil))
       (unwind-protect
           (progn
             (with-temp-file temp-el
               (insert ";;; accel-sample.el --- Dual-host accelerated module -*- lexical-binding: t; -*-\n"
                       "(require 'cl-lib)\n"
                       "(defun eliscript-test-heavy-align (rows)\n"
                       "  (let ((widths nil))\n"
                       "    (dolist (row rows)\n"
                       "      (let ((index 0))\n"
                       "        (dolist (cell row)\n"
                       "          (let ((w (string-width (or cell \"\"))))\n"
                       "            (if (< index (length widths))\n"
                       "                (setf (nth index widths) (max (nth index widths) w))\n"
                       "              (setq widths (append widths (list w)))))\n"
                       "          (setq index (1+ index)))))\n"
                       "    (list :widths widths :rows (length rows))))\n"
                       "(provide 'accel-sample)\n"))
             (load temp-el nil t)
             (eliscript-compat-compile-elisp-module (list temp-el) temp-mjs)
             (should (file-exists-p temp-mjs))
             (should (file-exists-p temp-eli))
             ;; The intermediate module is real Eliscript, never JavaScript.
             (should (with-temp-buffer
                       (insert-file-contents temp-eli)
                       (goto-char (point-min))
                       (and (looking-at-p "(module ")
                            (not (search-forward "(js*" nil t)))))
             (setq worker (eliscript-worker-start))
             (let* ((sample-rows '(("名称" "耗时") ("parser" "12ms") ("渲染器" "4ms")))
                    (native-res (funcall (intern "eliscript-test-heavy-align") sample-rows))
                    (direct-reply (eliscript-worker-call-sync
                                   worker temp-mjs "callElisp"
                                   (list "eliscript-test-heavy-align"
                                         (prin1-to-string (list sample-rows)))))
                    (worker-res (eliscript-compat-offload-call
                                 worker temp-mjs 'eliscript-test-heavy-align sample-rows))
                    (fallback-res (eliscript-compat-offload-call
                                   nil temp-mjs 'eliscript-test-heavy-align sample-rows)))
               ;; The worker itself executed the module function.
               (should (equal (car (read-from-string direct-reply)) native-res))
               (should (equal worker-res native-res))
               (should (equal fallback-res native-res))
               (eliscript-compat-accelerate-function
                'eliscript-test-heavy-align temp-mjs (lambda () worker))
               (should (equal (funcall (intern "eliscript-test-heavy-align") sample-rows)
                              native-res))
               (eliscript-worker-stop worker)
               (setq worker nil)
               ;; After stopping worker, accelerated function must seamlessly fall back to native Elisp
               (should (equal (funcall (intern "eliscript-test-heavy-align") sample-rows)
                              native-res))))
         (when worker
           (ignore-errors (eliscript-worker-stop worker)))
         (dolist (file (list temp-el temp-eli temp-mjs (concat temp-mjs ".map")))
           (when (file-exists-p file) (delete-file file))))))))

(provide 'eliscript-compat-syntax-tests)

;;; eliscript-compat-syntax-tests.el ends here
