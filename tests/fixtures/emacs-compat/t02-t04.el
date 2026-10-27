;;; t02-t04.el --- T02 activation, T03 destructuring, T04 arity/recur/threading -*- lexical-binding: t; no-byte-compile: t; -*-

;;;; case T02-01a
;;;; expect 123
(progn
  (defun await (x) (+ x 100))
  (await 23))

;;;; case T02-01b
;;;; expect [true, true, true, null, 77]
(require 'eliscript)
(list (atom 'sym)
      (atom 42)
      (atom nil)
      (atom '(1 . 2))
      (cell-value (state-cell 77)))

;;;; case T02-02
;;;; error conflict|ELI-M0001|eliscript-compile-error
(progn
  (defun persistent-vector (x) x)
  (require 'eliscript-data))

;;;; case T03-01
;;;; expect [10, 20, true, 2, 1, 2, true, 1, "x", "y", true, 1, null, "used-default", "Ada", 500, 99, "hi"]
(require 'eliscript)
(cl-defstruct-persistent account
  (owner :type string)
  (balance :type integer :default 0))
(let-bind (([a b &rest vtail] (persistent-vector 10 20 30 40))
           ([na nb &rest nvtail] [1 2 3])
           ((:list l1 l2 &rest ltail) (persistent-list 'x 'y 'z))
           ((:map (:present-nil (default pn 'fallback))
                  (:missing-key (default mk 'used-default)))
            (persistent-map :present-nil nil))
           ((:record account (:owner acc-owner) (:balance acc-bal))
            (make-account :owner "Ada" :balance 500))
           ((:ok ok-val) (result-ok 99))
           ((:some some-val) (option-some "hi")))
  (list a b (persistent-vector-p vtail) (value-count vtail)
        na nb (vectorp nvtail) (length nvtail)
        l1 l2 (persistent-list-p ltail) (value-count ltail)
        pn mk
        acc-owner acc-bal
        ok-val some-val))

;;;; case T03-02
;;;; expect ["a:b", "a-b", "matched-vec", ["got", true]]
(require 'eliscript)
(defun-bind format-pair ([x y] &optional ((:map (:sep sep)) (persistent-map :sep ":")))
  (format "%s%s%s" x sep y))
(let ((target (persistent-vector 1 2)))
  (list
   (format-pair (persistent-vector "a" "b"))
   (format-pair ["a" "b"] (persistent-map :sep "-"))
   (pcase-value target
     ((persistent-vector 1 2) 'matched-vec)
     (_ 'no-match))
   (cond-predicate #'equal "beta"
     "alpha" 'first
     "beta" :>> (lambda (matched) (list 'got matched))
     'fallback)))

;;;; case T03-03a
;;;; error missing|destructure|match
(require 'eliscript)
(let-bind (((:map (:required-key k)) (persistent-map :other 1)))
  k)

;;;; case T03-03b
;;;; error destructure|vector|match
(require 'eliscript)
(defun-bind take-opt (&optional ([a b] [1 2])) (+ a b))
(take-opt nil)

;;;; case T03-03c
;;;; error duplicate|eliscript-compile-error
(require 'eliscript)
(let-bind (([dup dup] [1 2])) dup)

;;;; case T03-03d
;;;; error length|destructure|match
(require 'eliscript)
(let-bind (([a b c] [1 2])) a)

;;;; case T04-01a
;;;; expect [0, 50, 7, 15, ["one", "p"], ["two", "p", "q"]]
(require 'eliscript)
(defun-case calc
  (() 0)
  ((x) (* x 10))
  ((x y) (+ x y))
  ((x y z &rest more) (+ x y z (apply #'+ more))))
(let ((anon (lambda-case
              ((a) (list 'one a))
              ((a b) (list 'two a b)))))
  (list (calc) (calc 5) (calc 3 4) (calc 1 2 3 4 5)
        (funcall anon 'p) (funcall anon 'p 'q)))

;;;; case T04-01b
;;;; error duplicate|arity|eliscript-compile-error
(require 'eliscript)
(defun-case bad-dup ((x) x) ((y) y))

;;;; case T04-01c
;;;; error optional|arity|eliscript-compile-error
(require 'eliscript)
(defun-case bad-opt ((x &optional y) x))

;;;; case T04-01d
;;;; error overlap|arity|eliscript-compile-error
(require 'eliscript)
(defun-case bad-overlap ((x &rest r) x) ((a b) a))

;;;; case T04-02a
;;;; expect [true, 1250025000, [2, 1]]
(require 'eliscript)
(defun-tail sum-to (n acc)
  (if (<= n 0)
      acc
    (recur (1- n) (+ acc n))))
(let-const ((box (make-hash-table :test 'equal))
            (limit 50000))
  (puthash "ok" t box)
  (list (gethash "ok" box)
        (sum-to limit 0)
        (let-loop ((i 0) (a 1) (b 2))
          (if (>= i 1)
              (list a b)
            (recur (1+ i) b a)))))

;;;; case T04-02b
;;;; error const|setq|eliscript-compile-error
(require 'eliscript)
(let-const ((x 10))
  (setq x 20))

;;;; case T04-02c
;;;; error tail|recur|eliscript-compile-error
(require 'eliscript)
(defun-tail bad-recur (n)
  (if (<= n 0) 0 (+ 1 (recur (1- n)))))

;;;; case T04-03
;;;; expect [null, 0, 30, 10, 12, 13, [9, 11], true, null]
(require 'eliscript)
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
          (funcall odd-fn 8))))
