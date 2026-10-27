;;; t05-t07.el --- T05 data, T06 modules/macros, T07 contracts -*- lexical-binding: t; no-byte-compile: t; -*-

;;;; case T05-01
;;;; expect [true, true, true, true, true, true, true, 2, 22, "gone", 2, 3, 20, [2, 3, 4], [10, 20, 30], 22, true, true, [":a", ":m", ":z"], [10, 20, 30], true, "truthy", "meta-ok"]
(require 'eliscript)
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
   (persistent-list-p pl) (persistent-vector-p pv) (persistent-map-p pm)
   (persistent-set-p ps) (persistent-queue-p pq)
   (persistent-sorted-map-p psm) (persistent-sorted-set-p pss)
   (value-get pm :b) (value-get pm2 :b) (value-get pm3 :a 'gone)
   (value-count ps)
   (seq-length pv) (seq-elt pv 1)
   (seq-map #'1+ pl)
   (seq-filter #'cl-evenp pv)
   (map-elt pm2 :b)
   (map-contains-key pm2 :a)
   (persistent-vector-p (seq-into '(7 8) 'persistent-vector))
   (map-keys psm)
   (seq-into pss 'list)
   (value-empty-p empty-with-meta)
   (if empty-with-meta 'truthy 'falsy)
   (value-get (value-meta empty-with-meta) :tag)))

;;;; case T05-02a
;;;; expect [true, "search", 1, 3, true, "object", true]
(require 'eliscript)
(cl-defstruct-persistent tool-spec
  "Tool invocation record."
  (name :type string :doc "Tool name")
  (retries :type integer :min 0 :max 5 :default 1 :doc "Retry count")
  payload)
(let* ((t1 (make-tool-spec :name "search" :payload (persistent-map :q "lisp")))
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
        (value-equal-p t2 t3)))

;;;; case T05-02b
;;;; error min|schema|validate|type
(require 'eliscript)
(cl-defstruct-persistent item (score :type integer :min 0 :max 10))
(make-item :score -1)

;;;; case T05-03a
;;;; expect ["pt(3,4)", 42, 15, [[10, 15]], null, 42, true, [2, 4, 6, 8], 14, true, [10, 20, 30]]
(require 'eliscript)
(defprotocol IDescribe
  (describe-val (self)))
(cl-defstruct-persistent point (x :type integer) (y :type integer))
(extend-protocol IDescribe point
  (describe-val (self)
    (format "pt(%d,%d)" (point-x self) (point-y self))))
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
        (seq-into built 'list)))

;;;; case T05-03b
;;;; error transient|sealed|expired
(require 'eliscript)
(let ((escaped nil))
  (with-transient (b (persistent-vector))
    (setq escaped b)
    (conj! b 1))
  (conj! escaped 2))

;;;; case T06-01a
;;;; expect [0, 5, 5]
(require 'eliscript)
(defmodule sample.counter
  (defconst-lexical step 5)
  (defvar-lexical count 0)
  (defun-lexical add-step (v) (+ v step))
  (defun bump! ()
    (setq count (add-step count))
    count)
  (export-functions bump!)
  (export-values count))
(fset 'add-step (lambda (_v) 9999))
(set 'step 9999)
(import-functions sample.counter :only (bump!))
(import-values sample.counter :only (count))
(let ((c0 count)
      (c1 (bump!))
      (c2 count))
  (list c0 c1 c2))

;;;; case T06-01b
;;;; error const|setq|eliscript-compile-error
(require 'eliscript)
(defmodule bad.const
  (defconst-lexical fixed 1)
  (defun mutate () (setq fixed 2)))

;;;; case T06-02a
;;;; expect [2, 1]
(require 'eliscript)
(defmacro-checked eval-once-double (form)
  (declare (eliscript :pure t :portable t))
  (let ((tmp (macro-gensym "val")))
    `(let ((,tmp ,form))
       (+ ,tmp ,tmp))))
(let ((counter 0))
  (list (eval-once-double (setq counter (1+ counter)))
        counter))

;;;; case T06-02b
;;;; error inputs|undeclared|eliscript-compile-error
(require 'eliscript)
(defmacro-checked bad-reader ()
  (macro-read-file "package.json"))
(bad-reader)

;;;; case T07-01a
;;;; expect [0, 45, 100]
(require 'eliscript)
(defun clamp-pct (x)
  (declare (eliscript :pure t :portable t
                      :params ((x numberp))
                      :returns numberp
                      :requires ((>= x -1000))
                      :ensures ((and (>= result 0) (<= result 100)))))
  (min 100 (max 0 x)))
(list (clamp-pct -20) (clamp-pct 45) (clamp-pct 250))

;;;; case T07-01b
;;;; error defun-async|async|eliscript-compile-error
(require 'eliscript)
(defun sneaky-async (x)
  (declare (eliscript :async t))
  x)

;;;; case T07-01c
;;;; error defun-bind|destructure|eliscript-compile-error
(require 'eliscript)
(defun sneaky-bind ([x y])
  (declare (eliscript :destructure t))
  (+ x y))

;;;; case T07-01d
;;;; error portable|current-buffer|eliscript-compile-error
(require 'eliscript)
(defun non-portable-fn ()
  (declare (eliscript :portable t))
  (current-buffer))

;;;; case T07-01e
;;;; error requires|contract
(require 'eliscript)
(defun positive-only (x)
  (declare (eliscript :requires ((> x 0)) :ensures ((> result 0))))
  x)
(positive-only -5)
