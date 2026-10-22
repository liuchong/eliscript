;;; eliscript-data.el --- Persistent collections, schemas, protocols, cells, and lazy streams -*- lexical-binding: t; -*-

;;; Commentary:

;; Implements `eliscript-data` for Eliscript 0.1.0:
;; - 7 persistent collection types with Emacs `seq.el` and `map.el` integration
;; - `value-*` pure collection, structural equality, hash, compare, and metadata APIs
;; - `cl-defstruct-persistent` with field contracts and JSON Schema roundtrip
;; - `defprotocol`, `extend-protocol`, `defclass-protocol`, `reify-protocol`
;; - `cl-defgeneric-value` and `cl-defmethod-value`
;; - `state-cell`, `cell-value`, `cell-update!`, `cell-reset!`, `cell-watch`
;; - `delay`, `force`, `realized-p`, `memoize`, `lazy-seq`, `lazy-map`, `lazy-filter`, `lazy-take`, `lazy-range`
;; - `map-transducer`, `filter-transducer`, `take-transducer`, `seq-transduce`
;; - `with-transient`, `conj!`, `assoc!`, `dissoc!`
;; - `result-*`, `option-*`, `data-symbol*`

;;; Code:

(require 'cl-lib)
(require 'seq)
(require 'map)
(require 'json)
(require 'eliscript-contract)

;; ============================================================================
;; 1. Persistent Collection Structures & Predicates
;; ============================================================================

(progn
  (cl-defstruct (eliscript-persistent-list (:constructor eliscript-persistent-list--create))
    items meta)

  (cl-defstruct (eliscript-persistent-vector (:constructor eliscript-persistent-vector--create))
    items meta)

  (cl-defstruct (eliscript-persistent-map (:constructor eliscript-persistent-map--create))
    entries meta)

  (cl-defstruct (eliscript-persistent-set (:constructor eliscript-persistent-set--create))
    items meta)

  (cl-defstruct (eliscript-persistent-queue (:constructor eliscript-persistent-queue--create))
    items meta)

  (cl-defstruct (eliscript-persistent-sorted-map (:constructor eliscript-persistent-sorted-map--create))
    comparator entries meta)

  (cl-defstruct (eliscript-persistent-sorted-set (:constructor eliscript-persistent-sorted-set--create))
    comparator items meta)

  (cl-defstruct (eliscript-persistent-record (:constructor eliscript-persistent-record--create))
    type-name fields meta))

(defun persistent-list-p (obj)
  "Return t if OBJ is a persistent-list."
  (and (eliscript-persistent-list-p obj) t))

(defun persistent-vector-p (obj)
  "Return t if OBJ is a persistent-vector."
  (and (eliscript-persistent-vector-p obj) t))

(defun persistent-map-p (obj)
  "Return t if OBJ is a persistent-map."
  (and (eliscript-persistent-map-p obj) t))

(defun persistent-set-p (obj)
  "Return t if OBJ is a persistent-set."
  (and (eliscript-persistent-set-p obj) t))

(defun persistent-queue-p (obj)
  "Return t if OBJ is a persistent-queue."
  (and (eliscript-persistent-queue-p obj) t))

(defun persistent-sorted-map-p (obj)
  "Return t if OBJ is a persistent-sorted-map."
  (and (eliscript-persistent-sorted-map-p obj) t))

(defun persistent-sorted-set-p (obj)
  "Return t if OBJ is a persistent-sorted-set."
  (and (eliscript-persistent-sorted-set-p obj) t))

(progn
  (defun eliscript-persistent-collection-p (obj)
    "Return t if OBJ is any Eliscript persistent collection or lazy sequence."
    (or (eliscript-persistent-list-p obj)
        (eliscript-persistent-vector-p obj)
        (eliscript-persistent-map-p obj)
        (eliscript-persistent-set-p obj)
        (eliscript-persistent-queue-p obj)
        (eliscript-persistent-sorted-map-p obj)
        (eliscript-persistent-sorted-set-p obj)
        (eliscript-persistent-record-p obj))))

(defun persistent-list (&rest items)
  "Construct an immutable persistent list from ITEMS."
  (eliscript-persistent-list--create :items (copy-sequence items) :meta nil))

(defun persistent-vector (&rest items)
  "Construct an immutable persistent vector from ITEMS."
  (eliscript-persistent-vector--create :items (vconcat items) :meta nil))

(defun eliscript-data--assoc-alist (entries key val)
  "Return a new alist from ENTRIES with KEY mapped to VAL using `value-equal-p'."
  (let ((found nil)
        (out nil))
    (dolist (cell entries)
      (if (and (not found) (value-equal-p (car cell) key))
          (progn
            (setq found t)
            (push (cons key val) out))
        (push cell out)))
    (setq out (nreverse out))
    (unless found
      (setq out (append out (list (cons key val)))))
    out))

(defun eliscript-data--dissoc-alist (entries key)
  "Return a new alist from ENTRIES without KEY using `value-equal-p'."
  (let ((out nil))
    (dolist (cell entries)
      (unless (value-equal-p (car cell) key)
        (push cell out)))
    (nreverse out)))

(defun persistent-map (&rest kvs)
  "Construct an immutable persistent map from alternating KVS."
  (when (/= (% (length kvs) 2) 0)
    (error "persistent-map requires an even number of key/value arguments"))
  (let ((entries nil)
        (cursor kvs))
    (while cursor
      (setq entries (eliscript-data--assoc-alist entries (car cursor) (cadr cursor)))
      (setq cursor (cddr cursor)))
    (eliscript-persistent-map--create :entries entries :meta nil)))

(defun persistent-set (&rest items)
  "Construct an immutable persistent set from ITEMS."
  (let ((unique nil))
    (dolist (it items)
      (unless (cl-some (lambda (existing) (value-equal-p existing it)) unique)
        (push it unique)))
    (eliscript-persistent-set--create :items (nreverse unique) :meta nil)))

(defun persistent-queue (&rest items)
  "Construct an immutable persistent FIFO queue from ITEMS."
  (eliscript-persistent-queue--create :items (copy-sequence items) :meta nil))

(defun eliscript-data--normalize-cmp (cmp)
  "Wrap comparator CMP so it returns a negative, zero, or positive integer."
  (let ((fn (or cmp #'value-compare)))
    (lambda (a b)
      (let ((res (funcall fn a b)))
        (cond
         ((numberp res) res)
         ((eq res t) -1)
         (t (if (value-equal-p a b) 0 1)))))))

(defun persistent-sorted-map (&rest args)
  "Construct an immutable sorted map. Optional first arg is comparator function."
  (let* ((has-cmp (and args (functionp (car args)) (= (% (length (cdr args)) 2) 0)))
         (cmp (if has-cmp (car args) #'value-compare))
         (kvs (if has-cmp (cdr args) args))
         (norm-cmp (eliscript-data--normalize-cmp cmp))
         (entries nil)
         (cursor kvs))
    (when (/= (% (length kvs) 2) 0)
      (error "persistent-sorted-map requires an even number of key/value arguments"))
    (while cursor
      (setq entries (eliscript-data--assoc-alist entries (car cursor) (cadr cursor)))
      (setq cursor (cddr cursor)))
    (setq entries
          (sort (copy-sequence entries)
                (lambda (c1 c2) (< (funcall norm-cmp (car c1) (car c2)) 0))))
    (eliscript-persistent-sorted-map--create
     :comparator cmp
     :entries entries
     :meta nil)))

(defun persistent-sorted-set (&rest args)
  "Construct an immutable sorted set. Optional first arg is comparator function."
  (let* ((has-cmp (and args (functionp (car args))))
         (cmp (if has-cmp (car args) #'value-compare))
         (items (if has-cmp (cdr args) args))
         (norm-cmp (eliscript-data--normalize-cmp cmp))
         (unique nil))
    (dolist (it items)
      (unless (cl-some (lambda (existing) (= (funcall norm-cmp existing it) 0)) unique)
        (push it unique)))
    (setq unique
          (sort (nreverse unique)
                (lambda (a b) (< (funcall norm-cmp a b) 0))))
    (eliscript-persistent-sorted-set--create
     :comparator cmp
     :items unique
     :meta nil)))

;; ============================================================================
;; 2. Result, Option, and DataSymbol Types
;; ============================================================================

(progn
  (cl-defstruct (eliscript-result (:constructor eliscript-result--create))
    ok-p payload))

(defun result-ok (value)
  "Construct a successful Result wrapping VALUE."
  (eliscript-result--create :ok-p t :payload value))

(defun result-error (err)
  "Construct a failed Result wrapping ERR."
  (eliscript-result--create :ok-p nil :payload err))

(defun result-ok-p (res)
  "Return t if RES is a successful Result."
  (and (eliscript-result-p res) (eliscript-result-ok-p res) t))

(defun result-error-p (res)
  "Return t if RES is a failed Result."
  (and (eliscript-result-p res) (not (eliscript-result-ok-p res)) t))

(defun result-value (res)
  "Return the value inside `result-ok' RES, or signal an error."
  (unless (result-ok-p res)
    (error "result-value called on non-ok result: %S" res))
  (eliscript-result-payload res))

(defun result-error-value (res)
  "Return the error payload inside `result-error' RES, or signal an error."
  (unless (result-error-p res)
    (error "result-error-value called on non-error result: %S" res))
  (eliscript-result-payload res))

(defun result-bind (res fn)
  "If RES is ok, apply FN to its payload; otherwise return RES unchanged."
  (if (result-ok-p res)
      (funcall fn (eliscript-result-payload res))
    res))

(progn
  (cl-defstruct (eliscript-option (:constructor eliscript-option--create))
    some-p payload))

(defconst option-none (eliscript-option--create :some-p nil :payload nil)
  "Singleton non-nil value representing an absent Option.")

(defun option-some (value)
  "Construct a present Option wrapping VALUE."
  (eliscript-option--create :some-p t :payload value))

(defun option-some-p (opt)
  "Return t if OPT is `option-some'."
  (and (eliscript-option-p opt) (eliscript-option-some-p opt) t))

(defun option-none-p (opt)
  "Return t if OPT is `option-none'."
  (and (eliscript-option-p opt) (not (eliscript-option-some-p opt)) t))

(defun option-value (opt)
  "Return the value inside `option-some' OPT, or signal an error."
  (unless (option-some-p opt)
    (error "option-value called on option-none"))
  (eliscript-option-payload opt))

(progn
  (cl-defstruct (eliscript-data-symbol (:constructor eliscript-data-symbol--create))
    namespace name))

(defun data-symbol (name &optional namespace)
  "Construct an immutable data-symbol with NAME and optional NAMESPACE."
  (if (and (null namespace) (stringp name) (string-match "\\`\\([^/]+\\)/\\(.+\\)\\'" name))
      (eliscript-data-symbol--create
       :namespace (match-string 1 name)
       :name (match-string 2 name))
    (eliscript-data-symbol--create
     :namespace (and namespace (format "%s" namespace))
     :name (format "%s" name))))

(defun data-symbol-p (obj)
  "Return t if OBJ is a data-symbol."
  (and (eliscript-data-symbol-p obj) t))

(defun data-symbol-name (sym)
  "Return the name string of data-symbol SYM."
  (eliscript-data-symbol-name sym))

(defun data-symbol-namespace (sym)
  "Return the namespace string (or nil) of data-symbol SYM."
  (eliscript-data-symbol-namespace sym))

;; ============================================================================
;; 3. Value Equality, Hash, Comparison, Metadata, and `value-*` Operations
;; ============================================================================

(defun eliscript-data--seq-elements (coll)
  "Return elements of persistent or native sequential COLL as an Emacs list."
  (cond
   ((eliscript-persistent-list-p coll)
    (eliscript-persistent-list-items coll))
   ((eliscript-persistent-vector-p coll)
    (append (eliscript-persistent-vector-items coll) nil))
   ((eliscript-persistent-queue-p coll)
    (eliscript-persistent-queue-items coll))
   ((eliscript-persistent-set-p coll)
    (eliscript-persistent-set-items coll))
   ((eliscript-persistent-sorted-set-p coll)
    (eliscript-persistent-sorted-set-items coll))
   ((eliscript-persistent-map-p coll)
    (mapcar (lambda (c) (list (car c) (cdr c)))
            (eliscript-persistent-map-entries coll)))
   ((eliscript-persistent-sorted-map-p coll)
    (mapcar (lambda (c) (list (car c) (cdr c)))
            (eliscript-persistent-sorted-map-entries coll)))
   ((eliscript-persistent-record-p coll)
    (mapcar (lambda (c) (list (car c) (cdr c)))
            (eliscript-persistent-record-fields coll)))
   ((lazy-seq-p coll)
    (eliscript-lazy-seq--realize-list coll))
   ((vectorp coll)
    (append coll nil))
   ((listp coll)
    coll)
   (t (error "Not a sequential or collection value: %S" coll))))

(defun eliscript-data--map-entries (m)
  "Return alist entries of persistent map or record M."
  (cond
   ((eliscript-persistent-map-p m)
    (eliscript-persistent-map-entries m))
   ((eliscript-persistent-sorted-map-p m)
    (eliscript-persistent-sorted-map-entries m))
   ((eliscript-persistent-record-p m)
    (eliscript-persistent-record-fields m))
   ((hash-table-p m)
    (let ((acc nil))
      (maphash (lambda (k v) (push (cons k v) acc)) m)
      (nreverse acc)))
   (t nil)))

(defun value-equal-p (a b)
  "Return t if A and B are structurally equal by value."
  (cond
   ((eq a b) t)
   ((and (numberp a) (numberp b))
    (and (eq (floatp a) (floatp b)) (= a b)))
   ((and (stringp a) (stringp b))
    (string-equal a b))
   ((and (or (eliscript-persistent-list-p a)
             (eliscript-persistent-vector-p a)
             (eliscript-persistent-queue-p a))
         (or (eliscript-persistent-list-p b)
             (eliscript-persistent-vector-p b)
             (eliscript-persistent-queue-p b)))
    (let ((la (eliscript-data--seq-elements a))
          (lb (eliscript-data--seq-elements b)))
      (and (= (length la) (length lb))
           (cl-every #'value-equal-p la lb))))
   ((and (or (eliscript-persistent-map-p a) (eliscript-persistent-sorted-map-p a))
         (or (eliscript-persistent-map-p b) (eliscript-persistent-sorted-map-p b)))
    (let ((ea (eliscript-data--map-entries a))
          (eb (eliscript-data--map-entries b)))
      (and (= (length ea) (length eb))
           (cl-every
            (lambda (ca)
              (let ((match (cl-find-if (lambda (cb) (value-equal-p (car ca) (car cb))) eb)))
                (and match (value-equal-p (cdr ca) (cdr match)))))
            ea))))
   ((and (or (eliscript-persistent-set-p a) (eliscript-persistent-sorted-set-p a))
         (or (eliscript-persistent-set-p b) (eliscript-persistent-sorted-set-p b)))
    (let ((sa (eliscript-data--seq-elements a))
          (sb (eliscript-data--seq-elements b)))
      (and (= (length sa) (length sb))
           (cl-every (lambda (x) (cl-some (lambda (y) (value-equal-p x y)) sb)) sa))))
   ((and (eliscript-persistent-record-p a) (eliscript-persistent-record-p b))
    (and (eq (eliscript-persistent-record-type-name a)
             (eliscript-persistent-record-type-name b))
         (let ((fa (eliscript-persistent-record-fields a))
               (fb (eliscript-persistent-record-fields b)))
           (and (= (length fa) (length fb))
                (cl-every (lambda (ca)
                            (let ((cb (assq (car ca) fb)))
                              (and cb (value-equal-p (cdr ca) (cdr cb)))))
                          fa)))))
   ((and (eliscript-result-p a) (eliscript-result-p b))
    (and (eq (eliscript-result-ok-p a) (eliscript-result-ok-p b))
         (value-equal-p (eliscript-result-payload a) (eliscript-result-payload b))))
   ((and (eliscript-option-p a) (eliscript-option-p b))
    (and (eq (eliscript-option-some-p a) (eliscript-option-some-p b))
         (value-equal-p (eliscript-option-payload a) (eliscript-option-payload b))))
   ((and (eliscript-data-symbol-p a) (eliscript-data-symbol-p b))
    (and (equal (eliscript-data-symbol-namespace a) (eliscript-data-symbol-namespace b))
         (equal (eliscript-data-symbol-name a) (eliscript-data-symbol-name b))))
   ((and (vectorp a) (vectorp b))
    (and (= (length a) (length b))
         (cl-every #'value-equal-p (append a nil) (append b nil))))
   ((and (consp a) (consp b))
    (and (value-equal-p (car a) (car b))
         (value-equal-p (cdr a) (cdr b))))
   (t (equal a b))))

(defun value-hash (x)
  "Compute a deterministic structural hash for X."
  (cond
   ((eliscript-persistent-collection-p x)
    (sxhash-equal (eliscript-data--seq-elements x)))
   (t (sxhash-equal x))))

(defun value-compare (a b)
  "Deterministic structural comparison of A and B returning -1, 0, or 1."
  (cond
   ((value-equal-p a b) 0)
   ((null a) -1)
   ((null b) 1)
   ((and (numberp a) (numberp b))
    (if (< a b) -1 1))
   ((and (stringp a) (stringp b))
    (if (string< a b) -1 1))
   ((and (symbolp a) (symbolp b))
    (if (string< (symbol-name a) (symbol-name b)) -1 1))
   ((and (eliscript-data-symbol-p a) (eliscript-data-symbol-p b))
    (let ((na (or (eliscript-data-symbol-namespace a) ""))
          (nb (or (eliscript-data-symbol-namespace b) "")))
      (if (not (string-equal na nb))
          (if (string< na nb) -1 1)
        (if (string< (eliscript-data-symbol-name a) (eliscript-data-symbol-name b)) -1 1))))
   (t
    (let ((sa (format "%S" a))
          (sb (format "%S" b)))
      (if (string< sa sb) -1 1)))))

(defun value-meta (obj)
  "Return the persistent metadata attached to OBJ, or nil."
  (cond
   ((eliscript-persistent-list-p obj) (eliscript-persistent-list-meta obj))
   ((eliscript-persistent-vector-p obj) (eliscript-persistent-vector-meta obj))
   ((eliscript-persistent-map-p obj) (eliscript-persistent-map-meta obj))
   ((eliscript-persistent-set-p obj) (eliscript-persistent-set-meta obj))
   ((eliscript-persistent-queue-p obj) (eliscript-persistent-queue-meta obj))
   ((eliscript-persistent-sorted-map-p obj) (eliscript-persistent-sorted-map-meta obj))
   ((eliscript-persistent-sorted-set-p obj) (eliscript-persistent-sorted-set-meta obj))
   ((eliscript-persistent-record-p obj) (eliscript-persistent-record-meta obj))
   (t nil)))

(defun value-with-meta (obj meta-val)
  "Return a copy of persistent value OBJ carrying META-VAL."
  (cond
   ((eliscript-persistent-list-p obj)
    (eliscript-persistent-list--create
     :items (eliscript-persistent-list-items obj) :meta meta-val))
   ((eliscript-persistent-vector-p obj)
    (eliscript-persistent-vector--create
     :items (eliscript-persistent-vector-items obj) :meta meta-val))
   ((eliscript-persistent-map-p obj)
    (eliscript-persistent-map--create
     :entries (eliscript-persistent-map-entries obj) :meta meta-val))
   ((eliscript-persistent-set-p obj)
    (eliscript-persistent-set--create
     :items (eliscript-persistent-set-items obj) :meta meta-val))
   ((eliscript-persistent-queue-p obj)
    (eliscript-persistent-queue--create
     :items (eliscript-persistent-queue-items obj) :meta meta-val))
   ((eliscript-persistent-sorted-map-p obj)
    (eliscript-persistent-sorted-map--create
     :comparator (eliscript-persistent-sorted-map-comparator obj)
     :entries (eliscript-persistent-sorted-map-entries obj)
     :meta meta-val))
   ((eliscript-persistent-sorted-set-p obj)
    (eliscript-persistent-sorted-set--create
     :comparator (eliscript-persistent-sorted-set-comparator obj)
     :items (eliscript-persistent-sorted-set-items obj)
     :meta meta-val))
   ((eliscript-persistent-record-p obj)
    (eliscript-persistent-record--create
     :type-name (eliscript-persistent-record-type-name obj)
     :fields (eliscript-persistent-record-fields obj)
     :meta meta-val))
   (t (error "value-with-meta requires a persistent value, got %S" obj))))

(defun value-count (coll)
  "Return the number of elements or entries in COLL."
  (cond
   ((null coll) 0)
   ((eliscript-persistent-list-p coll) (length (eliscript-persistent-list-items coll)))
   ((eliscript-persistent-vector-p coll) (length (eliscript-persistent-vector-items coll)))
   ((eliscript-persistent-map-p coll) (length (eliscript-persistent-map-entries coll)))
   ((eliscript-persistent-set-p coll) (length (eliscript-persistent-set-items coll)))
   ((eliscript-persistent-queue-p coll) (length (eliscript-persistent-queue-items coll)))
   ((eliscript-persistent-sorted-map-p coll) (length (eliscript-persistent-sorted-map-entries coll)))
   ((eliscript-persistent-sorted-set-p coll) (length (eliscript-persistent-sorted-set-items coll)))
   ((eliscript-persistent-record-p coll) (length (eliscript-persistent-record-fields coll)))
   ((lazy-seq-p coll) (length (eliscript-lazy-seq--realize-list coll)))
   ((hash-table-p coll) (hash-table-count coll))
   (t (length coll))))

(defun value-empty-p (coll)
  "Return t if COLL has 0 elements."
  (= (value-count coll) 0))

(defun value-nth (coll index &optional not-found)
  "Return element at INDEX in sequential COLL."
  (let ((elems (cond
                ((eliscript-persistent-vector-p coll)
                 (let ((v (eliscript-persistent-vector-items coll)))
                   (if (and (>= index 0) (< index (length v)))
                       (cons t (aref v index))
                     nil)))
                ((vectorp coll)
                 (if (and (>= index 0) (< index (length coll)))
                     (cons t (aref coll index))
                   nil))
                (t
                 (let ((lst (eliscript-data--seq-elements coll)))
                   (if (and (>= index 0) (< index (length lst)))
                       (cons t (nth index lst))
                     nil))))))
    (if elems
        (cdr elems)
      not-found)))

(defun eliscript-data--normalize-field-key (key)
  "Normalize keyword `:foo' to symbol `foo' for record field lookup."
  (if (keywordp key)
      (intern (substring (symbol-name key) 1))
    key))

(defun value-contains-p (coll key)
  "Return t if COLL contains KEY (even if mapped to nil)."
  (cond
   ((or (eliscript-persistent-map-p coll) (eliscript-persistent-sorted-map-p coll))
    (and (cl-find-if (lambda (c) (value-equal-p (car c) key))
                     (eliscript-data--map-entries coll))
         t))
   ((eliscript-persistent-record-p coll)
    (let ((fk (eliscript-data--normalize-field-key key)))
      (and (assq fk (eliscript-persistent-record-fields coll)) t)))
   ((or (eliscript-persistent-set-p coll) (eliscript-persistent-sorted-set-p coll))
    (and (cl-some (lambda (it) (value-equal-p it key))
                  (eliscript-data--seq-elements coll))
         t))
   ((hash-table-p coll)
    (let ((sentinel (make-symbol "missing")))
      (not (eq (gethash key coll sentinel) sentinel))))
   ((eliscript-persistent-vector-p coll)
    (and (integerp key) (>= key 0) (< key (value-count coll))))
   ((vectorp coll)
    (and (integerp key) (>= key 0) (< key (length coll))))
   (t nil)))

(defun value-get (coll key &optional not-found)
  "Look up KEY in COLL, returning NOT-FOUND (default nil) when absent."
  (cond
   ((null coll) not-found)
   ((or (eliscript-persistent-map-p coll) (eliscript-persistent-sorted-map-p coll))
    (let ((cell (cl-find-if (lambda (c) (value-equal-p (car c) key))
                            (eliscript-data--map-entries coll))))
      (if cell (cdr cell) not-found)))
   ((eliscript-persistent-record-p coll)
    (let* ((fk (eliscript-data--normalize-field-key key))
           (cell (assq fk (eliscript-persistent-record-fields coll))))
      (if cell (cdr cell) not-found)))
   ((or (eliscript-persistent-set-p coll) (eliscript-persistent-sorted-set-p coll))
    (let ((found (cl-find-if (lambda (it) (value-equal-p it key))
                             (eliscript-data--seq-elements coll))))
      (if found found not-found)))
   ((eliscript-persistent-vector-p coll)
    (value-nth coll key not-found))
   ((hash-table-p coll)
    (gethash key coll not-found))
   ((vectorp coll)
    (if (and (integerp key) (>= key 0) (< key (length coll)))
        (aref coll key)
      not-found))
   (t not-found)))

(defun value-put (coll key val)
  "Return a new persistent collection from COLL with KEY set to VAL."
  (cond
   ((eliscript-persistent-map-p coll)
    (eliscript-persistent-map--create
     :entries (eliscript-data--assoc-alist (eliscript-persistent-map-entries coll) key val)
     :meta (eliscript-persistent-map-meta coll)))
   ((eliscript-persistent-sorted-map-p coll)
    (let* ((cmp (eliscript-persistent-sorted-map-comparator coll))
           (norm-cmp (eliscript-data--normalize-cmp cmp))
           (entries (eliscript-data--assoc-alist
                     (eliscript-persistent-sorted-map-entries coll) key val)))
      (eliscript-persistent-sorted-map--create
       :comparator cmp
       :entries (sort (copy-sequence entries)
                      (lambda (c1 c2) (< (funcall norm-cmp (car c1) (car c2)) 0)))
       :meta (eliscript-persistent-sorted-map-meta coll))))
   ((eliscript-persistent-vector-p coll)
    (let* ((old (eliscript-persistent-vector-items coll))
           (len (length old)))
      (when (or (< key 0) (> key len))
        (error "value-put index %d out of bounds for vector of length %d" key len))
      (let ((copy (vconcat old (if (= key len) (vector val) []))))
        (when (< key len)
          (aset copy key val))
        (eliscript-persistent-vector--create
         :items copy :meta (eliscript-persistent-vector-meta coll)))))
   (t (error "value-put unsupported on %S" coll))))

(defalias 'value-assoc #'value-put)

(defun value-remove (coll key)
  "Return a new persistent collection from COLL with KEY removed."
  (cond
   ((eliscript-persistent-map-p coll)
    (eliscript-persistent-map--create
     :entries (eliscript-data--dissoc-alist (eliscript-persistent-map-entries coll) key)
     :meta (eliscript-persistent-map-meta coll)))
   ((eliscript-persistent-sorted-map-p coll)
    (eliscript-persistent-sorted-map--create
     :comparator (eliscript-persistent-sorted-map-comparator coll)
     :entries (eliscript-data--dissoc-alist (eliscript-persistent-sorted-map-entries coll) key)
     :meta (eliscript-persistent-sorted-map-meta coll)))
   ((eliscript-persistent-set-p coll)
    (eliscript-persistent-set--create
     :items (cl-remove-if (lambda (it) (value-equal-p it key))
                          (eliscript-persistent-set-items coll))
     :meta (eliscript-persistent-set-meta coll)))
   ((eliscript-persistent-sorted-set-p coll)
    (eliscript-persistent-sorted-set--create
     :comparator (eliscript-persistent-sorted-set-comparator coll)
     :items (cl-remove-if (lambda (it) (value-equal-p it key))
                          (eliscript-persistent-sorted-set-items coll))
     :meta (eliscript-persistent-sorted-set-meta coll)))
   (t (error "value-remove unsupported on %S" coll))))

(defalias 'value-dissoc #'value-remove)

(defun value-conj (coll &rest items)
  "Return a new persistent collection with ITEMS added to COLL."
  (let ((cur coll))
    (dolist (item items cur)
      (setq cur
            (cond
             ((eliscript-persistent-list-p cur)
              (eliscript-persistent-list--create
               :items (cons item (eliscript-persistent-list-items cur))
               :meta (eliscript-persistent-list-meta cur)))
             ((eliscript-persistent-vector-p cur)
              (eliscript-persistent-vector--create
               :items (vconcat (eliscript-persistent-vector-items cur) (vector item))
               :meta (eliscript-persistent-vector-meta cur)))
             ((eliscript-persistent-queue-p cur)
              (eliscript-persistent-queue--create
               :items (append (eliscript-persistent-queue-items cur) (list item))
               :meta (eliscript-persistent-queue-meta cur)))
             ((eliscript-persistent-set-p cur)
              (let ((existing (eliscript-persistent-set-items cur)))
                (if (cl-some (lambda (x) (value-equal-p x item)) existing)
                    cur
                  (eliscript-persistent-set--create
                   :items (append existing (list item))
                   :meta (eliscript-persistent-set-meta cur)))))
             ((eliscript-persistent-sorted-set-p cur)
              (apply #'persistent-sorted-set
                     (eliscript-persistent-sorted-set-comparator cur)
                     (append (eliscript-persistent-sorted-set-items cur) (list item))))
             ((or (eliscript-persistent-map-p cur) (eliscript-persistent-sorted-map-p cur))
              (cond
               ((and (vectorp item) (= (length item) 2))
                (value-put cur (aref item 0) (aref item 1)))
               ((consp item)
                (value-put cur (car item) (if (consp (cdr item)) (cadr item) (cdr item))))
               (t (error "value-conj on map expects [k v] or (k . v), got %S" item))))
             (t (error "value-conj unsupported on %S" cur)))))))

(defun value-into (to from)
  "Pour elements of FROM into persistent collection TO."
  (apply #'value-conj to (eliscript-data--seq-elements from)))

;; ============================================================================
;; 4. Emacs `seq.el` and `map.el` Seamless Generic Interoperability
;; ============================================================================

(defun eliscript-data--seq-like-p (obj)
  "Return non-nil if OBJ is an Eliscript persistent collection or lazy-seq."
  (or (eliscript-persistent-collection-p obj)
      (lazy-seq-p obj)))

(defun eliscript-data--advise-seq-p (orig-fn obj)
  "Return t for Eliscript persistent collections or delegate to ORIG-FN for OBJ."
  (if (eliscript-data--seq-like-p obj)
      t
    (funcall orig-fn obj)))

(defun eliscript-data--advise-seq-length (orig-fn seq)
  "Return length for Eliscript SEQ or delegate to ORIG-FN."
  (if (eliscript-data--seq-like-p seq)
      (value-count seq)
    (funcall orig-fn seq)))

(defun eliscript-data--advise-seq-elt (orig-fn seq n)
  "Return element N of Eliscript SEQ or delegate to ORIG-FN."
  (if (eliscript-data--seq-like-p seq)
      (value-nth seq n)
    (funcall orig-fn seq n)))

(defun eliscript-data--advise-seq-empty-p (orig-fn seq)
  "Return t if Eliscript SEQ is empty or delegate to ORIG-FN."
  (if (eliscript-data--seq-like-p seq)
      (value-empty-p seq)
    (funcall orig-fn seq)))

(defun eliscript-data--advise-seq-do (orig-fn fn seq)
  "Apply FN to each element of Eliscript SEQ or delegate to ORIG-FN."
  (if (eliscript-data--seq-like-p seq)
      (dolist (x (eliscript-data--seq-elements seq) seq)
        (funcall fn x))
    (funcall orig-fn fn seq)))

(defun eliscript-data--advise-seq-map (orig-fn fn seq)
  "Map FN over Eliscript SEQ or delegate to ORIG-FN."
  (if (eliscript-data--seq-like-p seq)
      (mapcar fn (eliscript-data--seq-elements seq))
    (funcall orig-fn fn seq)))

(defun eliscript-data--advise-seq-filter (orig-fn pred seq)
  "Filter Eliscript SEQ by PRED or delegate to ORIG-FN."
  (if (eliscript-data--seq-like-p seq)
      (cl-remove-if-not pred (eliscript-data--seq-elements seq))
    (funcall orig-fn pred seq)))

(defun eliscript-data--advise-seq-reduce (orig-fn fn seq initial-value)
  "Reduce Eliscript SEQ with FN and INITIAL-VALUE or delegate to ORIG-FN."
  (if (eliscript-data--seq-like-p seq)
      (cl-reduce fn (eliscript-data--seq-elements seq) :initial-value initial-value)
    (funcall orig-fn fn seq initial-value)))

(defun eliscript-data--advise-seq-subseq (orig-fn seq start &optional end)
  "Return subsequence of Eliscript SEQ or delegate to ORIG-FN."
  (if (eliscript-data--seq-like-p seq)
      (let ((sub (cl-subseq (eliscript-data--seq-elements seq) start end)))
        (cond
         ((eliscript-persistent-vector-p seq) (apply #'persistent-vector sub))
         ((eliscript-persistent-list-p seq) (apply #'persistent-list sub))
         (t sub)))
    (funcall orig-fn seq start end)))

(defun eliscript-data--advise-seq-into (orig-fn seq type)
  "Convert SEQ into TYPE, supporting persistent collections and native types."
  (cond
   ((eq type 'persistent-vector-p)
    (persistent-vector-p (apply #'persistent-vector (eliscript-data--seq-elements seq))))
   ((eq type 'persistent-vector)
    (apply #'persistent-vector (eliscript-data--seq-elements seq)))
   ((eq type 'persistent-list)
    (apply #'persistent-list (eliscript-data--seq-elements seq)))
   ((eq type 'persistent-set)
    (apply #'persistent-set (eliscript-data--seq-elements seq)))
   ((eliscript-data--seq-like-p seq)
    (let ((elems (eliscript-data--seq-elements seq)))
      (cond
       ((eq type 'list) elems)
       ((eq type 'vector) (vconcat elems))
       (t (funcall orig-fn elems type)))))
   (t (funcall orig-fn seq type))))

(defun eliscript-data--map-like-p (m)
  "Return non-nil if M is an Eliscript map or persistent record."
  (or (eliscript-persistent-map-p m)
      (eliscript-persistent-sorted-map-p m)
      (eliscript-persistent-record-p m)))

(defun eliscript-data--advise-map-p (orig-fn m)
  "Return t if M is an Eliscript map/record or delegate to ORIG-FN."
  (if (eliscript-data--map-like-p m)
      t
    (funcall orig-fn m)))

(defun eliscript-data--advise-map-elt (orig-fn m key &optional default testfn)
  "Look up KEY in Eliscript map M or delegate to ORIG-FN."
  (if (eliscript-data--map-like-p m)
      (value-get m key default)
    (funcall orig-fn m key default testfn)))

(defun eliscript-data--advise-map-contains-key (orig-fn m key &optional testfn)
  "Return t if Eliscript map M contains KEY or delegate to ORIG-FN."
  (if (eliscript-data--map-like-p m)
      (value-contains-p m key)
    (funcall orig-fn m key testfn)))

(defun eliscript-data--advise-map-keys (orig-fn m)
  "Return keys of Eliscript map M or delegate to ORIG-FN."
  (if (eliscript-data--map-like-p m)
      (mapcar #'car (eliscript-data--map-entries m))
    (funcall orig-fn m)))

(defun eliscript-data--advise-map-values (orig-fn m)
  "Return values of Eliscript map M or delegate to ORIG-FN."
  (if (eliscript-data--map-like-p m)
      (mapcar #'cdr (eliscript-data--map-entries m))
    (funcall orig-fn m)))

(defun eliscript-data--advise-map-apply (orig-fn fn m)
  "Apply FN to each (key val) of Eliscript map M or delegate to ORIG-FN."
  (if (eliscript-data--map-like-p m)
      (mapcar (lambda (c) (funcall fn (car c) (cdr c)))
              (eliscript-data--map-entries m))
    (funcall orig-fn fn m)))

(advice-add 'seq-p :around #'eliscript-data--advise-seq-p)
(advice-add 'seq-length :around #'eliscript-data--advise-seq-length)
(advice-add 'seq-elt :around #'eliscript-data--advise-seq-elt)
(advice-add 'seq-empty-p :around #'eliscript-data--advise-seq-empty-p)
(advice-add 'seq-do :around #'eliscript-data--advise-seq-do)
(advice-add 'seq-map :around #'eliscript-data--advise-seq-map)
(advice-add 'seq-filter :around #'eliscript-data--advise-seq-filter)
(advice-add 'seq-reduce :around #'eliscript-data--advise-seq-reduce)
(advice-add 'seq-subseq :around #'eliscript-data--advise-seq-subseq)
(advice-add 'seq-into :around #'eliscript-data--advise-seq-into)

(advice-add 'map-p :around #'eliscript-data--advise-map-p)
(advice-add 'map-elt :around #'eliscript-data--advise-map-elt)
(advice-add 'map-contains-key :around #'eliscript-data--advise-map-contains-key)
(advice-add 'map-keys :around #'eliscript-data--advise-map-keys)
(advice-add 'map-values :around #'eliscript-data--advise-map-values)
(advice-add 'map-apply :around #'eliscript-data--advise-map-apply)

;; ============================================================================
;; 5. Persistent Structs & AI-Native JSON Schema (`cl-defstruct-persistent`)
;; ============================================================================

(defvar eliscript-data--struct-schemas (make-hash-table :test 'eq)
  "Registry of `cl-defstruct-persistent' schemas keyed by struct name symbol.")

(defun eliscript-data--parse-field-spec (spec)
  "Parse field SPEC from `cl-defstruct-persistent' into a plist."
  (if (symbolp spec)
      (list :name spec :type 'any :has-default nil :default nil :min nil :max nil :doc nil)
    (let ((fname (car spec))
          (opts (cdr spec)))
      (list :name fname
            :type (or (plist-get opts :type) 'any)
            :has-default (and (plist-member opts :default) t)
            :default (plist-get opts :default)
            :min (plist-get opts :min)
            :max (plist-get opts :max)
            :doc (plist-get opts :doc)))))

(defun eliscript-data--validate-field-value (struct-name field-plist val)
  "Validate VAL against FIELD-PLIST for STRUCT-NAME."
  (let ((fname (plist-get field-plist :name))
        (ftype (plist-get field-plist :type))
        (fmin (plist-get field-plist :min))
        (fmax (plist-get field-plist :max)))
    (let ((type-ok
           (cond
            ((memq ftype '(any t nil)) t)
            ((eq ftype 'string) (stringp val))
            ((eq ftype 'integer) (integerp val))
            ((eq ftype 'number) (numberp val))
            ((eq ftype 'float) (floatp val))
            ((eq ftype 'boolean) (booleanp val))
            ((eq ftype 'symbol) (symbolp val))
            ((eq ftype 'keyword) (keywordp val))
            ((and (symbolp ftype) (fboundp ftype)) (funcall ftype val))
            (t t))))
      (unless type-ok
        (error "Schema validation failed for %s.%s: expected type %S, got %S"
               struct-name fname ftype val))
      (when (and fmin (numberp val) (< val fmin))
        (error "Schema validation failed for %s.%s: value %S is below :min %S"
               struct-name fname val fmin))
      (when (and fmax (numberp val) (> val fmax))
        (error "Schema validation failed for %s.%s: value %S exceeds :max %S"
               struct-name fname val fmax))
      t)))

(defun eliscript-data--construct-struct (struct-name kvs)
  "Construct a persistent record of STRUCT-NAME from keyword arguments KVS."
  (let ((schema (gethash struct-name eliscript-data--struct-schemas)))
    (unless schema
      (error "Unknown persistent struct %S" struct-name))
    (let ((given (make-hash-table :test 'eq))
          (cursor kvs))
      (while cursor
        (let ((k (eliscript-data--normalize-field-key (car cursor)))
              (v (cadr cursor)))
          (puthash k v given))
        (setq cursor (cddr cursor)))
      (let ((fields-alist nil))
        (dolist (fspec (plist-get schema :fields))
          (let* ((fname (plist-get fspec :name))
                 (sentinel (make-symbol "absent"))
                 (provided (gethash fname given sentinel))
                 (val (if (not (eq provided sentinel))
                          provided
                        (if (plist-get fspec :has-default)
                            (plist-get fspec :default)
                          nil))))
            (eliscript-data--validate-field-value struct-name fspec val)
            (push (cons fname val) fields-alist)))
        (eliscript-persistent-record--create
         :type-name struct-name
         :fields (nreverse fields-alist)
         :meta nil)))))

(defun eliscript-data--update-struct (struct-name instance kvs)
  "Return a new persistent record of STRUCT-NAME copying INSTANCE with KVS updated."
  (unless (and (eliscript-persistent-record-p instance)
               (eq (eliscript-persistent-record-type-name instance) struct-name))
    (error "%s-with expected a %s instance, got %S" struct-name struct-name instance))
  (let ((merged-kvs nil))
    (dolist (cell (eliscript-persistent-record-fields instance))
      (push (intern (concat ":" (symbol-name (car cell)))) merged-kvs)
      (push (cdr cell) merged-kvs))
    (setq merged-kvs (append (nreverse merged-kvs) kvs))
    (let ((updated (eliscript-data--construct-struct struct-name merged-kvs)))
      (if (eliscript-persistent-record-meta instance)
          (value-with-meta updated (eliscript-persistent-record-meta instance))
        updated))))

(defmacro cl-defstruct-persistent (name &rest body)
  "Define an immutable persistent record NAME with optional doc and fields."
  (let* ((doc (and (stringp (car body)) (car body)))
         (raw-fields (if doc (cdr body) body))
         (parsed-fields (mapcar #'eliscript-data--parse-field-spec raw-fields))
         (make-sym (intern (format "make-%s" name)))
         (pred-sym (intern (format "%s-p" name)))
         (with-sym (intern (format "%s-with" name)))
         (accessor-forms nil))
    (dolist (fspec parsed-fields)
      (let* ((fname (plist-get fspec :name))
             (acc-sym (intern (format "%s-%s" name fname))))
        (push `(progn
                 (defun ,acc-sym (instance)
                   (unless (and (eliscript-persistent-record-p instance)
                                (eq (eliscript-persistent-record-type-name instance) ',name))
                     (error "%s expected a %s instance, got %S" ',acc-sym ',name instance))
                   (cdr (assq ',fname (eliscript-persistent-record-fields instance))))
                 (gv-define-setter ,acc-sym (_val _instance)
                   (error "Cannot mutate immutable persistent struct field %s via setf" ',acc-sym)))
              accessor-forms)))
    `(progn
       (puthash ',name
                (list :name ',name :doc ,doc :fields ',parsed-fields)
                eliscript-data--struct-schemas)
       (defun ,make-sym (&rest kvs)
         (eliscript-data--construct-struct ',name kvs))
       (defun ,pred-sym (obj)
         (and (eliscript-persistent-record-p obj)
              (eq (eliscript-persistent-record-type-name obj) ',name)
              t))
       (defun ,with-sym (instance &rest kvs)
         (eliscript-data--update-struct ',name instance kvs))
       ,@(nreverse accessor-forms)
       ',name)))

(defun struct-validate (struct-name value)
  "Validate that VALUE conforms to the schema of STRUCT-NAME."
  (let ((schema (gethash struct-name eliscript-data--struct-schemas)))
    (unless schema
      (error "Unknown persistent struct %S" struct-name))
    (dolist (fspec (plist-get schema :fields))
      (let* ((fname (plist-get fspec :name))
             (kw (intern (concat ":" (symbol-name fname))))
             (val (cond
                   ((and (eliscript-persistent-record-p value)
                         (eq (eliscript-persistent-record-type-name value) struct-name))
                    (cdr (assq fname (eliscript-persistent-record-fields value))))
                   ((eliscript-data--map-like-p value)
                    (value-get value kw (value-get value fname)))
                   (t (error "struct-validate expected %s or map, got %S" struct-name value)))))
        (eliscript-data--validate-field-value struct-name fspec val)))
    t))

(defun struct-json-schema (struct-name)
  "Export a persistent-map representing the JSON Schema for STRUCT-NAME."
  (let ((schema (gethash struct-name eliscript-data--struct-schemas)))
    (unless schema
      (error "Unknown persistent struct %S" struct-name))
    (let ((props (persistent-map))
          (req nil))
      (dolist (fspec (plist-get schema :fields))
        (let* ((fname (plist-get fspec :name))
               (kw (intern (concat ":" (symbol-name fname))))
               (ftype (plist-get fspec :type))
               (json-type (cond
                           ((eq ftype 'string) "string")
                           ((eq ftype 'integer) "integer")
                           ((memq ftype '(number float)) "number")
                           ((eq ftype 'boolean) "boolean")
                           (t "any")))
               (fmap (persistent-map :type json-type)))
          (when (plist-get fspec :doc)
            (setq fmap (value-put fmap :description (plist-get fspec :doc))))
          (when (plist-get fspec :min)
            (setq fmap (value-put fmap :minimum (plist-get fspec :min))))
          (when (plist-get fspec :max)
            (setq fmap (value-put fmap :maximum (plist-get fspec :max))))
          (setq props (value-put props kw fmap))
          (unless (or (plist-get fspec :has-default) (eq ftype 'any))
            (push (symbol-name fname) req))))
      (persistent-map
       :type "object"
       :title (symbol-name struct-name)
       :description (or (plist-get schema :doc) "")
       :properties props
       :required (apply #'persistent-vector (nreverse req))))))

(defun eliscript-data--to-json-ready (val)
  "Convert persistent/Lisp VAL into a form suitable for `json-serialize'."
  (cond
   ((null val) nil)
   ((eq val t) t)
   ((or (numberp val) (stringp val)) val)
   ((keywordp val) (substring (symbol-name val) 1))
   ((symbolp val) (symbol-name val))
   ((or (eliscript-persistent-map-p val)
        (eliscript-persistent-sorted-map-p val)
        (eliscript-persistent-record-p val))
    (let ((ht (make-hash-table :test 'equal)))
      (dolist (cell (eliscript-data--map-entries val))
        (let ((k (if (keywordp (car cell))
                     (substring (symbol-name (car cell)) 1)
                   (format "%s" (car cell)))))
          (puthash k (eliscript-data--to-json-ready (cdr cell)) ht)))
      ht))
   ((or (eliscript-persistent-vector-p val)
        (eliscript-persistent-list-p val)
        (eliscript-persistent-set-p val)
        (eliscript-persistent-sorted-set-p val)
        (eliscript-persistent-queue-p val))
    (vconcat (mapcar #'eliscript-data--to-json-ready (eliscript-data--seq-elements val))))
   ((vectorp val)
    (vconcat (mapcar #'eliscript-data--to-json-ready (append val nil))))
   ((listp val)
    (vconcat (mapcar #'eliscript-data--to-json-ready val)))
   (t val)))

(defun eliscript-data--from-json-ready (val)
  "Convert parsed JSON VAL into Eliscript persistent maps and vectors."
  (cond
   ((eq val :null) nil)
   ((eq val :false) nil)
   ((hash-table-p val)
    (let ((kvs nil))
      (maphash (lambda (k v)
                 (push (intern (concat ":" k)) kvs)
                 (push (eliscript-data--from-json-ready v) kvs))
               val)
      (apply #'persistent-map (nreverse kvs))))
   ((vectorp val)
    (apply #'persistent-vector (mapcar #'eliscript-data--from-json-ready (append val nil))))
   (t val)))

(defun struct-to-json (struct-name instance)
  "Validate INSTANCE against STRUCT-NAME and serialize to a JSON string."
  (struct-validate struct-name instance)
  (json-serialize (eliscript-data--to-json-ready instance)
                  :null-object nil
                  :false-object :false))

(defun struct-from-json (struct-name json-str)
  "Parse JSON-STR and construct a validated persistent struct of STRUCT-NAME."
  (let* ((raw (json-parse-string json-str
                                 :object-type 'hash-table
                                 :array-type 'array
                                 :null-object :null
                                 :false-object :false))
         (kvs nil))
    (maphash (lambda (k v)
               (push (intern (concat ":" k)) kvs)
               (push (eliscript-data--from-json-ready v) kvs))
             raw)
    (eliscript-data--construct-struct struct-name (nreverse kvs))))

;; ============================================================================
;; 6. Open Protocols & Value-Dispatched Multimethods
;; ============================================================================

(defvar eliscript-data--protocols (make-hash-table :test 'eq)
  "Registry of open protocols.")

(defvar eliscript-data--multimethods (make-hash-table :test 'eq)
  "Registry of value-dispatched multimethods.")

(defun eliscript-data--type-tag (val)
  "Return the protocol dispatch type symbol for VAL."
  (cond
   ((eliscript-persistent-record-p val)
    (eliscript-persistent-record-type-name val))
   ((eliscript-persistent-list-p val) 'persistent-list)
   ((eliscript-persistent-vector-p val) 'persistent-vector)
   ((eliscript-persistent-map-p val) 'persistent-map)
   ((eliscript-persistent-set-p val) 'persistent-set)
   ((eliscript-persistent-queue-p val) 'persistent-queue)
   ((and (consp val) (eq (car val) :eliscript-reified))
    (cadr val))
   ((null val) 'null)
   ((stringp val) 'string)
   ((integerp val) 'integer)
   ((floatp val) 'float)
   ((vectorp val) 'vector)
   ((consp val) 'cons)
   ((hash-table-p val) 'hash-table)
   (t (type-of val))))

(defun eliscript-data--dispatch-protocol (proto-name method-name args)
  "Dispatch METHOD-NAME of PROTO-NAME on first argument of ARGS."
  (let* ((target (car args))
         (tag (eliscript-data--type-tag target))
         (proto-table (gethash proto-name eliscript-data--protocols))
         (type-table (and proto-table (gethash tag proto-table)))
         (fn (and type-table (gethash method-name type-table))))
    (unless fn
      (error "No implementation of protocol %S method %S for %S (tag %S)"
             proto-name method-name target tag))
    (apply fn args)))

(defmacro defprotocol (name &rest method-sigs)
  "Define an open protocol NAME with METHOD-SIGS."
  (let ((forms nil))
    (dolist (sig method-sigs)
      (when (consp sig)
        (let ((mname (car sig)))
          (push `(defun ,mname (&rest args)
                   (eliscript-data--dispatch-protocol ',name ',mname args))
                forms))))
    `(progn
       (unless (gethash ',name eliscript-data--protocols)
         (puthash ',name (make-hash-table :test 'eq) eliscript-data--protocols))
       ,@(nreverse forms)
       ',name)))

(defun eliscript-data--register-protocol-impl (proto-name type-sym method-name fn)
  "Register FN as implementation of METHOD-NAME for TYPE-SYM in PROTO-NAME."
  (let ((proto-table (or (gethash proto-name eliscript-data--protocols)
                         (let ((ht (make-hash-table :test 'eq)))
                           (puthash proto-name ht eliscript-data--protocols)
                           ht))))
    (let ((type-table (or (gethash type-sym proto-table)
                          (let ((ht (make-hash-table :test 'eq)))
                            (puthash type-sym ht proto-table)
                            ht))))
      (puthash method-name fn type-table))))

(defmacro extend-protocol (proto-name type-sym &rest method-impls)
  "Extend PROTO-NAME to TYPE-SYM with METHOD-IMPLS."
  (let ((forms nil))
    (dolist (impl method-impls)
      (let ((mname (car impl))
            (margs (cadr impl))
            (mbody (cddr impl)))
        (push `(eliscript-data--register-protocol-impl
                ',proto-name ',type-sym ',mname
                (lambda ,margs ,@mbody))
              forms)))
    `(progn ,@(nreverse forms) ',proto-name)))

(defalias 'defclass-protocol #'extend-protocol)

(defmacro reify-protocol (proto-name &rest method-impls)
  "Create an anonymous instance implementing PROTO-NAME with METHOD-IMPLS."
  (let ((anon-tag (make-symbol "reified-instance"))
        (forms nil))
    (dolist (impl method-impls)
      (let ((mname (car impl))
            (margs (cadr impl))
            (mbody (cddr impl)))
        (push `(eliscript-data--register-protocol-impl
                ',proto-name ',anon-tag ',mname
                (lambda ,margs ,@mbody))
              forms)))
    `(progn
       ,@(nreverse forms)
       (list :eliscript-reified ',anon-tag))))

(defmacro cl-defgeneric-value (name args &rest body)
  "Define a value-dispatched generic function NAME with ARGS and dispatch BODY."
  (let ((dispatch-expr (if (and (stringp (car body)) (cdr body))
                           (cdr body)
                         body)))
    `(progn
       (puthash ',name
                (list :dispatch (lambda ,args ,@dispatch-expr)
                      :methods (make-hash-table :test 'equal))
                eliscript-data--multimethods)
       (defun ,name (&rest call-args)
         (let* ((entry (gethash ',name eliscript-data--multimethods))
                (dval (apply (plist-get entry :dispatch) call-args))
                (methods (plist-get entry :methods))
                (mfn (or (gethash dval methods)
                         (gethash :default methods))))
           (unless mfn
             (error "No method in %s for dispatch value %S" ',name dval))
           (apply mfn call-args))))))

(defmacro cl-defmethod-value (name dispatch-val args &rest body)
  "Define a method on value-generic NAME for DISPATCH-VAL with ARGS and BODY."
  `(let ((entry (gethash ',name eliscript-data--multimethods)))
     (unless entry
       (error "cl-defmethod-value on unknown generic %S" ',name))
     (puthash ,dispatch-val (lambda ,args ,@body) (plist-get entry :methods))
     ',name))

;; ============================================================================
;; 7. Observable State Cells (`state-cell`)
;; ============================================================================

(progn
  (cl-defstruct (eliscript-state-cell (:constructor eliscript-state-cell--create))
    val validator watches))

(defun state-cell (initial-value &rest options)
  "Create an observable state-cell holding INITIAL-VALUE."
  (let ((validator (plist-get options :validator)))
    (when (and validator (not (funcall validator initial-value)))
      (error "state-cell initial value %S rejected by :validator" initial-value))
    (eliscript-state-cell--create
     :val initial-value
     :validator validator
     :watches nil)))

(defun state-cell-p (obj)
  "Return t if OBJ is a state-cell."
  (and (eliscript-state-cell-p obj) t))

(defun cell-value (cell)
  "Return the current value of state-cell CELL."
  (unless (eliscript-state-cell-p cell)
    (error "cell-value expected a state-cell, got %S" cell))
  (eliscript-state-cell-val cell))

(defun cell-reset! (cell new-val)
  "Synchronously set CELL to NEW-VAL after `:validator' and notify watches."
  (unless (eliscript-state-cell-p cell)
    (error "cell-reset! expected a state-cell, got %S" cell))
  (let ((validator (eliscript-state-cell-validator cell))
        (old-val (eliscript-state-cell-val cell)))
    (when (and validator (not (funcall validator new-val)))
      (error "state-cell validator rejected new value %S" new-val))
    (setf (eliscript-state-cell-val cell) new-val)
    (dolist (w (eliscript-state-cell-watches cell))
      (funcall (cdr w) (car w) cell old-val new-val))
    new-val))

(defun cell-update! (cell fn &rest args)
  "Update CELL by applying FN to its current value and ARGS."
  (cell-reset! cell (apply fn (cell-value cell) args)))

(defun cell-watch (cell key callback)
  "Register CALLBACK under KEY to be notified when CELL changes."
  (let ((existing (eliscript-state-cell-watches cell)))
    (setf (eliscript-state-cell-watches cell)
          (cons (cons key callback)
                (cl-remove-if (lambda (w) (equal (car w) key)) existing)))
    cell))

(defun cell-unwatch (cell key)
  "Remove watch KEY from CELL."
  (setf (eliscript-state-cell-watches cell)
        (cl-remove-if (lambda (w) (equal (car w) key))
                      (eliscript-state-cell-watches cell)))
  cell)

;; ============================================================================
;; 8. Delay, Memoize, Lazy Sequences, Transducers & Scoped Transients
;; ============================================================================

(progn
  (cl-defstruct (eliscript-delay (:constructor eliscript-delay--create))
    thunk realized value))

(defmacro delay (&rest body)
  "Create a delayed computation from BODY."
  `(eliscript-delay--create :thunk (lambda () ,@body) :realized nil :value nil))

(defun delay-p (obj)
  "Return t if OBJ is a delay object."
  (and (eliscript-delay-p obj) t))

(defun realized-p (d)
  "Return t if delay or lazy-seq D has been realized."
  (cond
   ((eliscript-delay-p d) (and (eliscript-delay-realized d) t))
   (t nil)))

(defun force (d)
  "Force delay D (caching its result) or return D if not a delay."
  (if (eliscript-delay-p d)
      (progn
        (unless (eliscript-delay-realized d)
          (setf (eliscript-delay-value d) (funcall (eliscript-delay-thunk d)))
          (setf (eliscript-delay-realized d) t)
          (setf (eliscript-delay-thunk d) nil))
        (eliscript-delay-value d))
    d))

(defun memoize (fn)
  "Return a memoized version of function FN."
  (let ((cache (make-hash-table :test 'equal))
        (miss (make-symbol "miss")))
    (lambda (&rest args)
      (let ((cached (gethash args cache miss)))
        (if (eq cached miss)
            (let ((res (apply fn args)))
              (puthash args res cache)
              res)
          cached)))))

(progn
  (cl-defstruct (eliscript-lazy-seq (:constructor eliscript-lazy-seq--create))
    generator))

(defun lazy-seq-p (obj)
  "Return t if OBJ is a lazy sequence."
  (and (eliscript-lazy-seq-p obj) t))

(defmacro lazy-seq (&rest body)
  "Construct a lazy sequence whose elements are computed by BODY."
  `(eliscript-lazy-seq--create :generator (lambda () ,@body)))

(defun eliscript-lazy-seq--step (s)
  "Realize one step of sequence S into nil or (head . rest-seq)."
  (cond
   ((null s) nil)
   ((eliscript-lazy-seq-p s)
    (eliscript-lazy-seq--step (funcall (eliscript-lazy-seq-generator s))))
   ((consp s) s)
   (t (eliscript-data--seq-elements s))))

(defun eliscript-lazy-seq--realize-list (s)
  "Realize bounded lazy sequence S into an Emacs list."
  (let ((acc nil)
        (cur (eliscript-lazy-seq--step s)))
    (while cur
      (push (car cur) acc)
      (setq cur (eliscript-lazy-seq--step (cdr cur))))
    (nreverse acc)))

(defun lazy-range (&optional start end step)
  "Return a potentially infinite lazy sequence of numbers."
  (let ((s (or start 0))
        (st (or step 1)))
    (cl-labels ((gen (cur)
                  (lazy-seq
                   (if (and end (if (> st 0) (>= cur end) (<= cur end)))
                       nil
                     (cons cur (gen (+ cur st)))))))
      (gen s))))

(defun lazy-map (fn seq)
  "Lazily map FN over SEQ."
  (cl-labels ((gen (cur)
                (lazy-seq
                 (let ((step (eliscript-lazy-seq--step cur)))
                   (when step
                     (cons (funcall fn (car step))
                           (gen (cdr step))))))))
    (gen seq)))

(defun lazy-filter (pred seq)
  "Lazily filter SEQ by PRED."
  (cl-labels ((gen (cur)
                (lazy-seq
                 (let ((step (eliscript-lazy-seq--step cur))
                       (found nil))
                   (while (and step (not found))
                     (if (funcall pred (car step))
                         (setq found (cons (car step) (gen (cdr step))))
                       (setq step (eliscript-lazy-seq--step (cdr step)))))
                   found))))
    (gen seq)))

(defun lazy-take (n seq)
  "Lazily take at most N elements from SEQ."
  (cl-labels ((gen (rem cur)
                (lazy-seq
                 (when (> rem 0)
                   (let ((step (eliscript-lazy-seq--step cur)))
                     (when step
                       (cons (car step)
                             (gen (1- rem) (cdr step)))))))))
    (gen n seq)))

;; Transducers

(progn
  (cl-defstruct (eliscript-reduced (:constructor eliscript-reduced--create))
    val))

(defun map-transducer (fn)
  "Return a mapping transducer applying FN."
  (lambda (rf)
    (lambda (acc &optional input)
      (if (= (length (list input)) 0)
          acc
        (funcall rf acc (funcall fn input))))))

(defun filter-transducer (pred)
  "Return a filtering transducer keeping elements satisfying PRED."
  (lambda (rf)
    (lambda (acc &optional input)
      (if (funcall pred input)
          (funcall rf acc input)
        acc))))

(defun take-transducer (n)
  "Return a stateful transducer taking at most N elements."
  (lambda (rf)
    (let ((remaining n))
      (lambda (acc &optional input)
        (if (> remaining 0)
            (progn
              (setq remaining (1- remaining))
              (let ((res (funcall rf acc input)))
                (if (<= remaining 0)
                    (eliscript-reduced--create :val res)
                  res)))
          (eliscript-reduced--create :val acc))))))

(defun seq-transduce (xform f init coll)
  "Transduce COLL using transducer XFORM, reducing function F, and INIT."
  (let ((rf (funcall xform f))
        (acc init)
        (elems (eliscript-data--seq-elements coll)))
    (catch 'reduced-done
      (dolist (item elems)
        (let ((next (funcall rf acc item)))
          (if (eliscript-reduced-p next)
              (progn
                (setq acc (eliscript-reduced-val next))
                (throw 'reduced-done acc))
            (setq acc next)))))
    acc))

;; Scoped Transients (`with-transient`, `conj!`, `assoc!`, `dissoc!`)

(progn
  (cl-defstruct (eliscript-transient (:constructor eliscript-transient--create))
    kind active data meta comparator))

(defun eliscript-data--make-transient (source)
  "Create an active transient builder from persistent collection SOURCE."
  (cond
   ((eliscript-persistent-vector-p source)
    (eliscript-transient--create
     :kind 'vector :active t
     :data (append (eliscript-persistent-vector-items source) nil)
     :meta (eliscript-persistent-vector-meta source)))
   ((eliscript-persistent-list-p source)
    (eliscript-transient--create
     :kind 'list :active t
     :data (copy-sequence (eliscript-persistent-list-items source))
     :meta (eliscript-persistent-list-meta source)))
   ((eliscript-persistent-map-p source)
    (eliscript-transient--create
     :kind 'map :active t
     :data (copy-sequence (eliscript-persistent-map-entries source))
     :meta (eliscript-persistent-map-meta source)))
   ((eliscript-persistent-set-p source)
    (eliscript-transient--create
     :kind 'set :active t
     :data (copy-sequence (eliscript-persistent-set-items source))
     :meta (eliscript-persistent-set-meta source)))
   (t (error "with-transient requires a persistent collection, got %S" source))))

(defun eliscript-data--seal-transient (builder)
  "Seal transient BUILDER and return the resulting persistent collection."
  (unless (and (eliscript-transient-p builder) (eliscript-transient-active builder))
    (error "Transient builder is already sealed"))
  (setf (eliscript-transient-active builder) nil)
  (let ((kind (eliscript-transient-kind builder))
        (data (eliscript-transient-data builder))
        (meta (eliscript-transient-meta builder)))
    (cond
     ((eq kind 'vector)
      (eliscript-persistent-vector--create :items (vconcat data) :meta meta))
     ((eq kind 'list)
      (eliscript-persistent-list--create :items data :meta meta))
     ((eq kind 'map)
      (eliscript-persistent-map--create :entries data :meta meta))
     ((eq kind 'set)
      (eliscript-persistent-set--create :items data :meta meta)))))

(defun eliscript-data--ensure-active-transient (builder op-name)
  "Ensure BUILDER is an active transient for OP-NAME."
  (unless (and (eliscript-transient-p builder) (eliscript-transient-active builder))
    (error "%s called on expired or sealed transient builder" op-name)))

(defun conj! (builder &rest items)
  "Mutate active transient BUILDER in place by appending ITEMS."
  (eliscript-data--ensure-active-transient builder 'conj!)
  (let ((kind (eliscript-transient-kind builder)))
    (dolist (it items builder)
      (cond
       ((eq kind 'vector)
        (setf (eliscript-transient-data builder)
              (append (eliscript-transient-data builder) (list it))))
       ((eq kind 'list)
        (setf (eliscript-transient-data builder)
              (cons it (eliscript-transient-data builder))))
       ((eq kind 'set)
        (unless (cl-some (lambda (x) (value-equal-p x it))
                         (eliscript-transient-data builder))
          (setf (eliscript-transient-data builder)
                (append (eliscript-transient-data builder) (list it)))))
       ((eq kind 'map)
        (if (consp it)
            (setf (eliscript-transient-data builder)
                  (eliscript-data--assoc-alist
                   (eliscript-transient-data builder) (car it) (cdr it)))
          (error "conj! on transient map expects pair, got %S" it)))))))

(defun assoc! (builder key val)
  "Mutate active transient BUILDER by associating KEY with VAL."
  (eliscript-data--ensure-active-transient builder 'assoc!)
  (setf (eliscript-transient-data builder)
        (eliscript-data--assoc-alist (eliscript-transient-data builder) key val))
  builder)

(defun dissoc! (builder key)
  "Mutate active transient BUILDER by removing KEY."
  (eliscript-data--ensure-active-transient builder 'dissoc!)
  (setf (eliscript-transient-data builder)
        (eliscript-data--dissoc-alist (eliscript-transient-data builder) key))
  builder)

(defmacro with-transient (binding &rest body)
  "Bind `(VAR SOURCE)' to a transient builder, run BODY, and seal result."
  (let ((var (car binding))
        (source (cadr binding)))
    `(let ((,var (eliscript-data--make-transient ,source)))
       (unwind-protect
           (progn
             ,@body
             (eliscript-data--seal-transient ,var))
         (when (eliscript-transient-active ,var)
           (setf (eliscript-transient-active ,var) nil))))))

(progn
  (defun eliscript-data-reset-state! ()
    "Reset protocol, multimethod, and struct registries for isolated tests."
    (clrhash eliscript-data--struct-schemas)
    (clrhash eliscript-data--protocols)
    (clrhash eliscript-data--multimethods)))

(provide 'eliscript-data)

;;; eliscript-data.el ends here
