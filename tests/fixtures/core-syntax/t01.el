;;; t01.el --- T01 default Emacs Lisp kernel semantics -*- lexical-binding: t; no-byte-compile: t; -*-

;; Case format: each case starts with ";;;; case ID".  ";;;; expect JSON"
;; gives the serialized value, ";;;; error REGEXP" an expected failure, and
;; ";;;; oracle" also compares the result with native Emacs.

;;;; case T01-01a
;;;; expect [42, 18, 30, 21, "kernel-ok"]
(progn
  (defvar dual-sym 21)
  (defun dual-sym (x) (* x 2))
  (put 'dual-sym :meta-tag 'kernel-ok)
  (list (dual-sym dual-sym)
        (funcall #'dual-sym 9)
        (apply #'dual-sym '(15))
        (symbol-value 'dual-sym)
        (get 'dual-sym :meta-tag)))

;;;; case T01-01b
;;;; error void-function
(let ((local-fn (lambda (x) (+ x 1))))
  (local-fn 10))

;;;; case T01-02
;;;; expect [true, true, true, "no", "no", "t-zero", "t-float", "t-negzero", "t-empty-str", "t-empty-vec", "t-plist", "t-pvec", "t-err", "t-none", "t-js-false", "t-js-null", "t-js-undef"]
(require 'eliscript)
(require 'eliscript-js)
(list
 (eq nil '())
 (eq 'nil '())
 (eq nil (list))
 (if nil 'yes 'no)
 (if '() 'yes 'no)
 (if 0 't-zero 'f-zero)
 (if 0.0 't-float 'f-float)
 (if -0.0 't-negzero 'f-negzero)
 (if "" 't-empty-str 'f-empty-str)
 (if [] 't-empty-vec 'f-empty-vec)
 (if (persistent-list) 't-plist 'f-plist)
 (if (persistent-vector) 't-pvec 'f-pvec)
 (if (result-error "boom") 't-err 'f-err)
 (if option-none 't-none 'f-none)
 (if js-false 't-js-false 'f-js-false)
 (if js-null 't-js-null 'f-js-null)
 (if js-undefined 't-js-undef 'f-js-undef))

;;;; case T01-03
;;;; expect [15, 25, 10, 6]
(progn
  (defvar *dyn-rate* 10)
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
     (progn (setq *const-advisory* 6) *const-advisory*))))

;;;; case T01-04a
;;;; expect [11, 22, true, 99, 42, 1, 3, -3, 3.5, 4, 2, -1, 3, "😀"]
(let ((pair (cons 1 2))
      (vec [10 20 30])
      (ht (make-hash-table :test 'equal)))
  (setcar pair 11)
  (setcdr pair 22)
  (aset vec 1 99)
  (puthash "k" 42 ht)
  (list (car pair) (cdr pair)
        (vectorp vec) (aref vec 1)
        (gethash "k" ht) (hash-table-count ht)
        (/ 7 2) (/ -7 2) (/ 7.0 2) (/ 24 2 3)
        (mod -7 3) (% -7 3)
        (length "a😀b")
        (substring "a😀b" 1 2)))

;;;; case T01-04b
;;;; error arith-error
(/ 10 0)

;;;; case T01-05
;;;; expect [42, ["entered", "cleaned"], ["caught-arith", "arith-error"]]
(progn
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
        (list caught (nreverse log) handled)))))
