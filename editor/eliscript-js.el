;;; eliscript-js.el --- Explicit JavaScript host interop, raw sentinels, and JS regexps -*- lexical-binding: t; -*-

;;; Commentary:

;; Implements `eliscript-js` for Eliscript 0.1.0:
;; - Non-nil fidelity sentinels `js-false`, `js-null`, `js-undefined` and predicates
;; - `js-import`, `js-array`, `js-object`, `js-get`, `js-get-raw`, `js-put`, `js-call`, `js-call-raw`, `js-new`, `js-expr`
;; - `js-divide`, `js-remainder`, `js-length` (UTF-16 code units), `js-substring`
;; - `js-regexp`, `js-regexp-find`, `js-regexp-matches`, `js-regexp-seq`, `js-regexp-replace` (preserving Emacs `match-data`)

;;; Code:

(require 'cl-lib)
(require 'eliscript-data)

;; ============================================================================
;; 1. Non-nil Fidelity Sentinels (`js-false`, `js-null`, `js-undefined`)
;; ============================================================================

(progn
  (cl-defstruct (eliscript-js-sentinel (:constructor eliscript-js-sentinel--create))
    kind))

(defconst js-false (eliscript-js-sentinel--create :kind 'false)
  "Non-nil sentinel representing JavaScript `false' (truthy in Lisp conditionals).")

(defconst js-null (eliscript-js-sentinel--create :kind 'null)
  "Non-nil sentinel representing JavaScript `null' (truthy in Lisp conditionals).")

(defconst js-undefined (eliscript-js-sentinel--create :kind 'undefined)
  "Non-nil sentinel representing JS `undefined' (truthy in Lisp).")

(defun js-false-p (val)
  "Return t if VAL is the `js-false' sentinel."
  (and (eliscript-js-sentinel-p val)
       (eq (eliscript-js-sentinel-kind val) 'false)
       t))

(defun js-null-p (val)
  "Return t if VAL is the `js-null' sentinel."
  (and (eliscript-js-sentinel-p val)
       (eq (eliscript-js-sentinel-kind val) 'null)
       t))

(defun js-undefined-p (val)
  "Return t if VAL is the `js-undefined' sentinel."
  (and (eliscript-js-sentinel-p val)
       (eq (eliscript-js-sentinel-kind val) 'undefined)
       t))

(defun js-nullish-p (val)
  "Return t if VAL is `js-null' or `js-undefined'."
  (or (js-null-p val) (js-undefined-p val)))

(defun eliscript-js--normalize-key (key)
  "Convert KEY to string property name."
  (cond
   ((keywordp key) (substring (symbol-name key) 1))
   ((symbolp key) (symbol-name key))
   ((stringp key) key)
   (t (format "%s" key))))

(defun eliscript-js--to-default-lisp (raw-val)
  "Convert RAW-VAL according to the default JS -> Lisp boundary table."
  (cond
   ((or (js-false-p raw-val)
        (js-null-p raw-val)
        (js-undefined-p raw-val))
    nil)
   (t raw-val)))

;; ============================================================================
;; 2. JS Host Containers & Operations (`js-object`, `js-array`, `js-get`, `js-get-raw`, etc.)
;; ============================================================================

(progn
  (cl-defstruct (eliscript-js-object (:constructor eliscript-js-object--create))
    props))

(defun js-array (&rest items)
  "Create a mutable JS array representation from ITEMS."
  (vconcat items))

(defun js-object (&rest kvs)
  "Create a mutable JS object representation from alternating KVS."
  (let ((ht (make-hash-table :test 'equal))
        (cursor kvs))
    (while cursor
      (let ((k (eliscript-js--normalize-key (car cursor)))
            (v (cadr cursor)))
        (puthash k v ht))
      (setq cursor (cddr cursor)))
    (eliscript-js-object--create :props ht)))

(defun js-get-raw (obj key)
  "Read property KEY from OBJ preserving `js-false', `js-null', and `js-undefined'."
  (let ((k (eliscript-js--normalize-key key))
        (missing (make-symbol "js-missing")))
    (cond
     ((eliscript-js-object-p obj)
      (let ((val (gethash k (eliscript-js-object-props obj) missing)))
        (if (eq val missing)
            js-undefined
          (if (null val) js-null val))))
     ((hash-table-p obj)
      (let ((val (gethash k obj missing)))
        (if (eq val missing) js-undefined val)))
     ((vectorp obj)
      (if (and (integerp key) (>= key 0) (< key (length obj)))
          (aref obj key)
        js-undefined))
     (t js-undefined))))

(defun js-get (obj key)
  "Read property KEY from OBJ converting `false'/`null'/`undefined' to `nil'."
  (eliscript-js--to-default-lisp (js-get-raw obj key)))

(defun js-put (obj key val)
  "Set property KEY on OBJ to VAL and return VAL."
  (let ((k (eliscript-js--normalize-key key)))
    (cond
     ((eliscript-js-object-p obj)
      (puthash k val (eliscript-js-object-props obj)))
     ((hash-table-p obj)
      (puthash k val obj))
     ((vectorp obj)
      (aset obj key val)))
    val))

(defun js-call-raw (target method &rest args)
  "Call METHOD on TARGET with ARGS preserving raw JS sentinels."
  (let ((fn (if (functionp target)
                target
              (js-get-raw target method))))
    (if (functionp fn)
        (apply fn args)
      (error "js-call-raw: property %S is not callable on %S" method target))))

(defun js-call (target method &rest args)
  "Call METHOD on TARGET with ARGS using default JS -> Lisp conversion."
  (eliscript-js--to-default-lisp (apply #'js-call-raw target method args)))

(defun js-new (ctor &rest args)
  "Instantiate CTOR with ARGS."
  (if (functionp ctor)
      (apply ctor args)
    (js-object :ctor ctor :args (vconcat args))))

(defmacro js-import (spec &rest opts)
  "Bind imported JS module SPEC according to OPTS (`:as var')."
  (let ((as-var (plist-get opts :as)))
    (if as-var
        `(defvar ,as-var (js-object :module ,spec))
      `',spec)))

(defmacro js-expr (code-str)
  "Represent explicit inline JS expression CODE-STR."
  `,code-str)

;; ============================================================================
;; 3. JS Arithmetic & UTF-16 String Operations
;; ============================================================================

(defun js-divide (a b)
  "Perform IEEE 754 floating-point division `(/ (float A) (float B))'."
  (/ (float a) (float b)))

(defun js-remainder (a b)
  "Perform JavaScript `%` remainder with dividend sign."
  (let ((fa (float a))
        (fb (float b)))
    (- fa (* (truncate (/ fa fb)) fb))))

(defun eliscript-js--to-utf16-units (str)
  "Convert Lisp string STR into a list of 16-bit UTF-16 code units."
  (let ((units nil))
    (dolist (cp (string-to-list str) (nreverse units))
      (if (> cp #xffff)
          (let* ((u (- cp #x10000))
                 (high (+ #xd800 (ash u -10)))
                 (low (+ #xdc00 (logand u #x3ff))))
            (push high units)
            (push low units))
        (push cp units)))))

(defun eliscript-js--from-utf16-units (units)
  "Convert a list of 16-bit UTF-16 code UNITS back to a Lisp string."
  (let ((cps nil)
        (cursor units))
    (while cursor
      (let ((u1 (car cursor))
            (u2 (cadr cursor)))
        (if (and (>= u1 #xd800) (<= u1 #xdbff)
                 u2 (>= u2 #xdc00) (<= u2 #xdfff))
            (progn
              (push (+ #x10000 (ash (- u1 #xd800) 10) (- u2 #xdc00)) cps)
              (setq cursor (cddr cursor)))
          (push u1 cps)
          (setq cursor (cdr cursor)))))
    (apply #'string (nreverse cps))))

(defun js-length (str)
  "Return the UTF-16 code unit length of STR."
  (length (eliscript-js--to-utf16-units str)))

(defun js-substring (str start &optional end)
  "Return substring of STR indexed by UTF-16 code units from START to END."
  (let* ((units (eliscript-js--to-utf16-units str))
         (sub (cl-subseq units start end)))
    (eliscript-js--from-utf16-units sub)))

;; ============================================================================
;; 4. JS Regexp Operations (`js-regexp*`) without Mutating Emacs `match-data`
;; ============================================================================

(progn
  (cl-defstruct (eliscript-js-regexp (:constructor eliscript-js-regexp--create))
    pattern flags emacs-pattern))

(defun eliscript-js--translate-pattern-to-emacs (pat)
  "Translate simple JS regex grouping in PAT to Emacs regex syntax."
  (let ((out "")
        (len (length pat))
        (i 0))
    (while (< i len)
      (let ((ch (aref pat i)))
        (cond
         ((= ch ?\\)
          (if (< (1+ i) len)
              (let ((next (aref pat (1+ i))))
                (cond
                 ((= next ?d) (setq out (concat out "[0-9]")))
                 ((= next ?w) (setq out (concat out "[[:alnum:]_]")))
                 ((= next ?s) (setq out (concat out "[ \t\n\r]")))
                 ((memq next '(?\( ?\) ?|))
                  (setq out (concat out (string next))))
                 (t (setq out (concat out "\\" (string next)))))
                (setq i (+ i 2)))
            (setq out (concat out "\\"))
            (setq i (1+ i))))
         ((memq ch '(?\( ?\) ?|))
          (setq out (concat out "\\" (string ch)))
          (setq i (1+ i)))
         (t
          (setq out (concat out (string ch)))
          (setq i (1+ i))))))
    out))

(defun js-regexp (pattern &optional flags)
  "Compile JS regular expression PATTERN with optional FLAGS."
  (let ((fl (or flags "")))
    (dotimes (i (length fl))
      (unless (memq (aref fl i) '(?g ?i ?m ?s ?u ?y ?d))
        (error "Invalid JS regexp flag: %c" (aref fl i))))
    (eliscript-js-regexp--create
     :pattern pattern
     :flags fl
     :emacs-pattern (eliscript-js--translate-pattern-to-emacs pattern))))

(defun js-regexp-p (obj)
  "Return t if OBJ is a `js-regexp'."
  (and (eliscript-js-regexp-p obj) t))

(defun js-regexp-find (rx str &optional start-pos)
  "Find first match of `js-regexp' RX in STR without modifying Emacs `match-data'."
  (let ((re (if (eliscript-js-regexp-p rx)
                (eliscript-js-regexp-emacs-pattern rx)
              (eliscript-js--translate-pattern-to-emacs rx)))
        (case-fold-search (and (eliscript-js-regexp-p rx)
                               (string-match-p "i" (eliscript-js-regexp-flags rx))
                               t)))
    (save-match-data
      (if (string-match re str (or start-pos 0))
          (let ((full (match-string 0 str))
                (m-start (match-beginning 0))
                (m-end (match-end 0))
                (groups nil)
                (g-idx 1))
            (while (match-beginning g-idx)
              (push (match-string g-idx str) groups)
              (setq g-idx (1+ g-idx)))
            (persistent-map
             :match full
             :start m-start
             :end m-end
             :groups (apply #'persistent-vector (nreverse groups))))
        nil))))

(defun js-regexp-matches (rx str)
  "Return t if `js-regexp' RX matches in STR without altering `match-data'."
  (and (js-regexp-find rx str) t))

(defun js-regexp-seq (rx str)
  "Return a persistent-vector of all non-overlapping matches of RX in STR."
  (let ((acc nil)
        (pos 0)
        (len (length str))
        (keep-going t))
    (while (and (<= pos len) keep-going)
      (let ((m (js-regexp-find rx str pos)))
        (if m
            (let ((m-end (value-get m :end)))
              (push m acc)
              (setq pos (if (= m-end pos) (1+ pos) m-end)))
          (setq keep-going nil))))
    (apply #'persistent-vector (nreverse acc))))

(defun js-regexp-replace (rx str replacement)
  "Replace matches of `js-regexp' RX in STR with REPLACEMENT cleanly."
  (let ((re (if (eliscript-js-regexp-p rx)
                (eliscript-js-regexp-emacs-pattern rx)
              (eliscript-js--translate-pattern-to-emacs rx))))
    (save-match-data
      (replace-regexp-in-string re replacement str t t))))

(provide 'eliscript-js)

;;; eliscript-js.el ends here
