;;; t11.el --- T11 differential oracle corpus (native Emacs vs JS runtime) -*- lexical-binding: t; no-byte-compile: t; -*-

;; Every case is evaluated by the JS runtime and by native Emacs through
;; `eliscript-compat-eval-string'; normalized results must be identical.

;;;; case D01
;;;; oracle
(+ 1 2 3 4)

;;;; case D02
;;;; oracle
(list (/ 7 2) (/ -7 2) (mod -7 3) (% -7 3))

;;;; case D03
;;;; oracle
(list (eq nil '()) (if 0 'yes 'no) (if "" 'yes 'no) (if [] 'yes 'no))

;;;; case D04
;;;; oracle
(progn (defvar v-d04 7) (defun v-d04 (x) (+ x 10)) (v-d04 v-d04))

;;;; case D05
;;;; oracle
(let ((p (cons 'a 'b))) (setcar p 'x) (setcdr p 'y) (list (car p) (cdr p)))

;;;; case D06
;;;; oracle
(let ((v [1 2 3])) (aset v 1 99) (list (aref v 0) (aref v 1) (aref v 2)))

;;;; case D07
;;;; oracle
(let ((h (make-hash-table :test 'equal))) (puthash "a" 11 h) (list (gethash "a" h) (hash-table-count h)))

;;;; case D08
;;;; oracle
(progn (defvar *d08* 5) (defun r-d08 () *d08*) (list (r-d08) (let ((*d08* 9)) (r-d08)) (r-d08)))

;;;; case D09
;;;; oracle
(catch 'tag (progn (throw 'tag 'escaped) 'unreachable))

;;;; case D10
;;;; oracle
(condition-case e (/ 1 0) (arith-error (car e)))

;;;; case D11
;;;; oracle
(let ((x 0)) (unwind-protect (setq x 1) (setq x (+ x 10))) x)

;;;; case D12
;;;; oracle
(progn (defmacro m-d12 (x) `(* ,x 3)) (m-d12 7))

;;;; case D13
;;;; oracle
(progn (defun await (x) (+ x 5)) (await 10))

;;;; case D14
;;;; oracle
(require 'eliscript) (list (atom 'a) (atom '(1 2)) (cell-value (state-cell 19)))

;;;; case D15
;;;; oracle
(require 'eliscript) (let ((pl (persistent-list 1 2))) (list (persistent-list-p pl) (value-count pl) (seq-into pl 'list)))

;;;; case D16
;;;; oracle
(require 'eliscript) (let ((pv (persistent-vector 4 5 6))) (list (persistent-vector-p pv) (value-nth pv 1) (seq-elt pv 2)))

;;;; case D17
;;;; oracle
(require 'eliscript) (let* ((m1 (persistent-map :a 1)) (m2 (value-put m1 :b 2))) (list (value-get m1 :b 'none) (value-get m2 :b)))

;;;; case D18
;;;; oracle
(require 'eliscript) (let ((s (persistent-set 1 2 1))) (value-count s))

;;;; case D19
;;;; oracle
(require 'eliscript) (let ((q (value-conj (persistent-queue 10) 20))) (seq-into q 'list))

;;;; case D20
;;;; oracle
(require 'eliscript) (map-keys (persistent-sorted-map #'value-compare :c 3 :a 1 :b 2))

;;;; case D21
;;;; oracle
(require 'eliscript) (seq-into (persistent-sorted-set #'value-compare 9 3 6) 'list)

;;;; case D22
;;;; oracle
(require 'eliscript) (let ((e (value-with-meta (persistent-list) (persistent-map :k 7)))) (list (if e 't 'f) (value-empty-p e) (value-get (value-meta e) :k)))

;;;; case D23
;;;; oracle
(require 'eliscript) (let-bind (([x y &rest r] (persistent-vector 1 2 3 4))) (list x y (value-count r)))

;;;; case D24
;;;; oracle
(require 'eliscript) (let-bind (((:list a &rest b) (persistent-list 7 8 9))) (list a (value-count b)))

;;;; case D25
;;;; oracle
(require 'eliscript) (let-bind (((:map (:k1 (default v1 99)) (:k2 (default v2 88))) (persistent-map :k1 nil))) (list v1 v2))

;;;; case D26
;;;; oracle
(require 'eliscript) (let-bind (((:ok x) (result-ok 42)) ((:some y) (option-some 8))) (+ x y))

;;;; case D27
;;;; oracle
(require 'eliscript) (defun-bind db-d27 ([a b] &optional ([c d] [3 4])) (+ a b c d)) (list (db-d27 [1 2]) (db-d27 [1 2] [10 20]))

;;;; case D28
;;;; oracle
(require 'eliscript) (pcase-value (persistent-vector 'a 'b) ((persistent-vector 'a 'b) 'hit) (_ 'miss))

;;;; case D29
;;;; oracle
(require 'eliscript) (cond-predicate #'< 5 10 'lt 3 'gt 'other)

;;;; case D30
;;;; oracle
(require 'eliscript) (defun-case dc-d30 (() 'zero) ((x) (list 'one x)) ((x y &rest r) (list 'many x y (length r)))) (list (dc-d30) (dc-d30 9) (dc-d30 1 2 3 4))

;;;; case D31
;;;; oracle
(require 'eliscript) (let-const ((x 10) (y 20)) (+ x y))

;;;; case D32
;;;; oracle
(require 'eliscript) (let-loop ((n 100) (acc 0)) (if (<= n 0) acc (recur (1- n) (+ acc n))))

;;;; case D33
;;;; oracle
(require 'eliscript) (defun-tail dt-d33 (n acc) (if (<= n 0) acc (recur (1- n) (+ acc 2)))) (dt-d33 200 0)

;;;; case D34
;;;; oracle
(require 'eliscript) (thread-as 4 x (* x x) (+ x 1))

;;;; case D35
;;;; oracle
(require 'eliscript) (thread-cond-first 10 t (+ 5) nil (* 99) t (- 2))

;;;; case D36
;;;; oracle
(require 'eliscript) (list (thread-some-first (persistent-map :a nil) (value-get :a) (1+)) (thread-some-first (persistent-map :a 4) (value-get :a) (1+)))

;;;; case D37
;;;; oracle
(require 'eliscript) (let ((f (fn-compose #'1+ (fn-partial #'+ 10))) (j (fn-juxt #'1- #'1+))) (list (funcall f 5) (funcall j 5)))

;;;; case D38
;;;; oracle
(require 'eliscript) (cl-defstruct-persistent u-d38 (name :type string) (age :type integer :min 0 :default 18)) (let* ((u1 (make-u-d38 :name "Bob")) (u2 (u-d38-with u1 :age 30))) (list (u-d38-p u2) (u-d38-name u2) (u-d38-age u1) (u-d38-age u2)))

;;;; case D39
;;;; oracle
(require 'eliscript) (defprotocol P-D39 (p-act (x))) (cl-defstruct-persistent box-d39 (v :type integer)) (extend-protocol P-D39 box-d39 (p-act (x) (* (box-d39-v x) 3))) (p-act (make-box-d39 :v 14))

;;;; case D40
;;;; oracle
(require 'eliscript) (cl-defgeneric-value gv-d40 (k v) k) (cl-defmethod-value gv-d40 :inc (_k v) (1+ v)) (gv-d40 :inc 41)

;;;; case D41
;;;; oracle
(require 'eliscript) (let ((c (state-cell 5))) (cell-update! c #'1+) (cell-value c))

;;;; case D42
;;;; oracle
(require 'eliscript) (let ((d (delay (* 6 7)))) (list (realized-p d) (force d) (realized-p d)))

;;;; case D43
;;;; oracle
(require 'eliscript) (seq-into (lazy-take 3 (lazy-map (lambda (x) (* x 10)) (lazy-range 1))) 'list)

;;;; case D44
;;;; oracle
(require 'eliscript) (seq-transduce (map-transducer #'1+) #'+ 0 '(1 2 3 4))

;;;; case D45
;;;; oracle
(require 'eliscript) (seq-into (with-transient (t-vec (persistent-vector)) (conj! t-vec 'a) (conj! t-vec 'b)) 'list)

;;;; case D46
;;;; oracle
(require 'eliscript) (defmodule m.d46 (defconst-lexical k 10) (defun-lexical helper (x) (+ x k)) (defun pub-d46 (x) (helper x)) (export-functions pub-d46)) (fset 'helper (lambda (_x) 0)) (import-functions m.d46 :only (pub-d46)) (pub-d46 5)

;;;; case D47
;;;; oracle
(require 'eliscript) (defmacro-checked mc-d47 (v) (declare (eliscript :pure t)) (let ((g (macro-gensym "x"))) `(let ((,g ,v)) (* ,g 2)))) (mc-d47 21)

;;;; case D48
;;;; oracle
(require 'eliscript) (defun c-d48 (x) (declare (eliscript :pure t :portable t :requires ((> x 0)) :ensures ((> result x)))) (+ x 1)) (c-d48 10)

;;;; case D49
;;;; oracle
(require 'eliscript) (require 'eliscript-js) (list (if js-false 't 'f) (if js-null 't 'f) (if js-undefined 't 'f) (js-false-p js-false) (js-divide 7 2) (js-length "😀"))

;;;; case D50
;;;; oracle
(require 'eliscript) (require 'eliscript-abi) (with-abi-memory (:initial-pages 1) (mem-store-u32 0 12345) (word-add (mem-load-u32 0) 5))

;;;; case D51
;;;; oracle
;;;; error .
(require 'eliscript) (defun bad-d51 (x) (declare (eliscript :async t)) x)

;;;; case D52
;;;; oracle
;;;; error .
(require 'eliscript) (let-const ((x 1)) (setq x 2))
