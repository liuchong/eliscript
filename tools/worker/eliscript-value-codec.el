;;; eliscript-value-codec.el --- Eliscript worker value codec -*- lexical-binding: t; -*-

;;; Commentary:

;; Explicit Emacs representations for the versioned Eliscript worker value
;; encoding.  Plain vectors remain native JavaScript Arrays; persistent values
;; use the constructors in this file so their language categories survive the
;; process boundary.

;;; Code:

(require 'cl-lib)
(require 'json)

(define-error 'eliscript-value-codec-error "Eliscript value codec error")

(defconst eliscript-worker-value-encoding "eliscript-value-v1"
  "Value encoding negotiated by the worker protocol.")

(defconst eliscript-worker-value-undefined
  (make-symbol "eliscript-value-undefined")
  "Unique Emacs representation of an Eliscript undefined value.")

(defconst eliscript-worker-value-codec-limits
  '((max-depth . 64)
    (max-nodes . 100000)
    (max-collection-length . 100000))
  "Default resource limits for worker value encoding and decoding.")

(cl-defstruct
    (eliscript-value-keyword
     (:constructor eliscript-value--keyword-create (namespace name)))
  namespace name)

(cl-defstruct
    (eliscript-value-symbol
     (:constructor eliscript-value--symbol-create
                   (namespace name metadata)))
  namespace name metadata)

(cl-defstruct
    (eliscript-value-list
     (:constructor eliscript-value--list-create (values metadata)))
  values metadata)

(cl-defstruct
    (eliscript-value-vector
     (:constructor eliscript-value--vector-create (values metadata)))
  values metadata)

(cl-defstruct
    (eliscript-value-map
     (:constructor eliscript-value--map-create (entries metadata)))
  entries metadata)

(cl-defstruct
    (eliscript-value-set
     (:constructor eliscript-value--set-create (values metadata)))
  values metadata)

(cl-defstruct
    (eliscript-value-object
     (:constructor eliscript-value--object-create (entries)))
  entries)

(defun eliscript-value-codec--name (value label &optional nullable)
  "Validate VALUE as LABEL, allowing nil when NULLABLE is non-nil."
  (cond
   ((and nullable (null value)) nil)
   ((and (stringp value) (> (length value) 0)) value)
   (t
    (signal 'wrong-type-argument
            (list (if nullable 'eliscript-nullable-name-p 'eliscript-name-p)
                  value label)))))

(defun eliscript-value-keyword (name &optional namespace)
  "Return a worker Keyword value named NAME in optional NAMESPACE."
  (eliscript-value--keyword-create
   (eliscript-value-codec--name namespace "keyword namespace" t)
   (eliscript-value-codec--name name "keyword name")))

(defun eliscript-value-symbol (name &optional namespace metadata)
  "Return a worker Symbol value named NAME with NAMESPACE and METADATA."
  (eliscript-value--symbol-create
   (eliscript-value-codec--name namespace "symbol namespace" t)
   (eliscript-value-codec--name name "symbol name")
   metadata))

(defun eliscript-value-list (values &optional metadata)
  "Return a worker persistent List holding VALUES and optional METADATA."
  (eliscript-value--list-create (vconcat values) metadata))

(defun eliscript-value-vector (values &optional metadata)
  "Return a worker persistent Vector holding VALUES and optional METADATA."
  (eliscript-value--vector-create (vconcat values) metadata))

(defun eliscript-value-map (entries &optional metadata)
  "Return a worker persistent Map holding ENTRIES and optional METADATA."
  (eliscript-value--map-create (vconcat entries) metadata))

(defun eliscript-value-set (values &optional metadata)
  "Return a worker persistent Set holding VALUES and optional METADATA."
  (eliscript-value--set-create (vconcat values) metadata))

(defun eliscript-value-object (entries)
  "Return an explicit native JavaScript object holding ENTRIES."
  (eliscript-value--object-create (vconcat entries)))

(defun eliscript-value-codec--limit (limits name)
  "Return positive integer NAME from LIMITS or signal an error."
  (let ((value (alist-get name limits)))
    (unless (and (integerp value) (> value 0))
      (signal 'wrong-type-argument (list 'positive-integer-p value name)))
    value))

(defun eliscript-value-codec--state (&optional overrides)
  "Return mutable codec state using optional limit OVERRIDES."
  (let ((limits (copy-tree eliscript-worker-value-codec-limits)))
    (dolist (entry overrides)
      (setf (alist-get (car entry) limits) (cdr entry)))
    (dolist (name '(max-depth max-nodes max-collection-length))
      (eliscript-value-codec--limit limits name))
    (list :active (make-hash-table :test #'eq)
          :limits limits
          :nodes (vector 0))))

(defun eliscript-value-codec--error (code message path)
  "Signal a codec error with CODE, MESSAGE, and PATH."
  (signal 'eliscript-value-codec-error
          (list (format "%s at %s" message path) code path)))

(defun eliscript-value-codec--visit (state depth path mode)
  "Account for one node in STATE at DEPTH and PATH for MODE."
  (let* ((limits (plist-get state :limits))
         (nodes (plist-get state :nodes))
         (count (1+ (aref nodes 0))))
    (aset nodes 0 count)
    (when (> count (eliscript-value-codec--limit limits 'max-nodes))
      (eliscript-value-codec--error
       (intern (format "value-%s-limit" mode))
       (format "value exceeds %d nodes"
               (eliscript-value-codec--limit limits 'max-nodes))
       path))
    (when (> depth (eliscript-value-codec--limit limits 'max-depth))
      (eliscript-value-codec--error
       (intern (format "value-%s-limit" mode))
       (format "value exceeds depth %d"
               (eliscript-value-codec--limit limits 'max-depth))
       path))))

(defun eliscript-value-codec--collection-length (state value path mode)
  "Validate collection VALUE length in STATE at PATH for MODE."
  (let ((limit
         (eliscript-value-codec--limit
          (plist-get state :limits) 'max-collection-length)))
    (when (> (length value) limit)
      (eliscript-value-codec--error
       (intern (format "value-%s-limit" mode))
       (format "collection exceeds %d values" limit)
       path))))

(defun eliscript-value-codec--with-active (state value path function)
  "Run FUNCTION while VALUE is active in STATE at PATH."
  (let ((active (plist-get state :active)))
    (when (gethash value active)
      (eliscript-value-codec--error
       'value-encoding-cycle "cyclic values are not transportable" path))
    (puthash value t active)
    (unwind-protect
        (funcall function)
      (remhash value active))))

(defun eliscript-value-codec--entry (entry label path)
  "Return two values from ENTRY or reject it using LABEL and PATH."
  (cond
   ((and (vectorp entry) (= (length entry) 2))
    (cons (aref entry 0) (aref entry 1)))
   ((and (consp entry) (not (consp (cdr entry)))) entry)
   (t
    (eliscript-value-codec--error
     'value-encoding-invalid
     (format "%s must contain exactly two values" label)
     path))))

(defun eliscript-value-codec--wire-text (value)
  "Return deterministic UTF-8 JSON bytes for encoded VALUE."
  (encode-coding-string
   (json-serialize value :null-object nil :false-object :false)
   'utf-8-unix t))

(defun eliscript-value-codec--text-less-p (left right)
  "Return non-nil when LEFT precedes RIGHT by UTF-8 byte order."
  (string< (encode-coding-string left 'utf-8-unix t)
           (encode-coding-string right 'utf-8-unix t)))

(defun eliscript-value-codec--negative-zero-p (value)
  "Return non-nil when VALUE is negative floating-point zero."
  (and (floatp value)
       (= value 0.0)
       (< (copysign 1.0 value) 0.0)))

(defun eliscript-value-codec--infinity-p (value)
  "Return non-nil when VALUE is positive or negative infinity."
  (and (floatp value)
       (not (isnan value))
       (not (= value 0.0))
       (= value (* value 2.0))))

(defun eliscript-value-codec--encode (value state depth path)
  "Encode VALUE using STATE at DEPTH and PATH."
  (eliscript-value-codec--visit state depth path "encoding")
  (cond
   ((eq value eliscript-worker-value-undefined) ["undefined"])
   ((or (null value) (eq value t) (eq value :false) (stringp value)) value)
   ((numberp value)
    (cond
     ((and (floatp value) (isnan value)) ["number" "nan"])
     ((eliscript-value-codec--infinity-p value)
      (vector "number" (if (> value 0.0)
                           "positive-infinity"
                         "negative-infinity")))
     ((eliscript-value-codec--negative-zero-p value)
      ["number" "negative-zero"])
     (t value)))
   ((eliscript-value-keyword-p value)
    (vector "keyword"
            (eliscript-value-keyword-namespace value)
            (eliscript-value-keyword-name value)))
   ((eliscript-value-symbol-p value)
    (eliscript-value-codec--with-active
     state value path
     (lambda ()
       (vector
        "symbol"
        (eliscript-value-symbol-namespace value)
        (eliscript-value-symbol-name value)
        (if (eliscript-value-symbol-metadata value)
            (eliscript-value-codec--encode
             (eliscript-value-symbol-metadata value)
             state (1+ depth) (concat path ".metadata"))
          nil)))))
   ((or (eliscript-value-list-p value)
        (eliscript-value-vector-p value))
    (eliscript-value-codec--with-active
     state value path
     (lambda ()
       (let* ((list-p (eliscript-value-list-p value))
              (values (if list-p
                          (eliscript-value-list-values value)
                        (eliscript-value-vector-values value)))
              (metadata (if list-p
                            (eliscript-value-list-metadata value)
                          (eliscript-value-vector-metadata value))))
         (eliscript-value-codec--collection-length
          state values path "encoding")
         (vector
          (if list-p "list" "vector")
          (cl-loop for item across values
                   for index from 0
                   collect
                   (eliscript-value-codec--encode
                    item state (1+ depth)
                    (format "%s[%d]" path index))
                   into encoded
                   finally return (vconcat encoded))
          (if metadata
              (eliscript-value-codec--encode
               metadata state (1+ depth) (concat path ".metadata"))
            nil))))))
   ((eliscript-value-map-p value)
    (eliscript-value-codec--with-active
     state value path
     (lambda ()
       (let ((entries (eliscript-value-map-entries value))
             encoded)
         (eliscript-value-codec--collection-length
          state entries path "encoding")
         (dotimes (index (length entries))
           (let* ((entry
                   (eliscript-value-codec--entry
                    (aref entries index) "map entry"
                    (format "%s[%d]" path index)))
                  (wire
                   (vector
                    (eliscript-value-codec--encode
                     (car entry) state (1+ depth)
                     (format "%s.keys[%d]" path index))
                    (eliscript-value-codec--encode
                     (cdr entry) state (1+ depth)
                     (format "%s.values[%d]" path index)))))
             (push (cons (eliscript-value-codec--wire-text wire) wire)
                   encoded)))
         (setq encoded (sort encoded (lambda (left right)
                                       (string< (car left) (car right)))))
         (vector
          "map"
          (vconcat (mapcar #'cdr encoded))
          (if (eliscript-value-map-metadata value)
              (eliscript-value-codec--encode
               (eliscript-value-map-metadata value)
               state (1+ depth) (concat path ".metadata"))
            nil))))))
   ((eliscript-value-set-p value)
    (eliscript-value-codec--with-active
     state value path
     (lambda ()
       (let ((values (eliscript-value-set-values value))
             encoded)
         (eliscript-value-codec--collection-length
          state values path "encoding")
         (dotimes (index (length values))
           (let ((wire
                  (eliscript-value-codec--encode
                   (aref values index) state (1+ depth)
                   (format "%s[%d]" path index))))
             (push (cons (eliscript-value-codec--wire-text wire) wire)
                   encoded)))
         (setq encoded (sort encoded (lambda (left right)
                                       (string< (car left) (car right)))))
         (vector
          "set"
          (vconcat (mapcar #'cdr encoded))
          (if (eliscript-value-set-metadata value)
              (eliscript-value-codec--encode
               (eliscript-value-set-metadata value)
               state (1+ depth) (concat path ".metadata"))
            nil))))))
   ((eliscript-value-object-p value)
    (eliscript-value-codec--with-active
     state value path
     (lambda ()
       (let ((entries (eliscript-value-object-entries value))
             encoded keys)
         (eliscript-value-codec--collection-length
          state entries path "encoding")
         (dotimes (index (length entries))
           (let* ((entry
                   (eliscript-value-codec--entry
                    (aref entries index) "object entry"
                    (format "%s[%d]" path index)))
                  (key (car entry)))
             (unless (and (stringp key) (> (length key) 0))
               (eliscript-value-codec--error
                'value-encoding-invalid
                "object key must be a non-empty string"
                (format "%s.keys[%d]" path index)))
             (when (member key keys)
               (eliscript-value-codec--error
                'value-encoding-invalid
                (format "object contains duplicate key %s" key)
                (format "%s.keys[%d]" path index)))
             (push key keys)
             (push
              (vector
               key
               (eliscript-value-codec--encode
                (cdr entry) state (1+ depth) (concat path "." key)))
              encoded)))
         (vector "object"
                 (vconcat
                  (sort encoded
                        (lambda (left right)
                          (eliscript-value-codec--text-less-p
                           (aref left 0) (aref right 0))))))))))
   ((vectorp value)
    (eliscript-value-codec--with-active
     state value path
     (lambda ()
       (eliscript-value-codec--collection-length
        state value path "encoding")
       (vector
        "array"
        (cl-loop for item across value
                 for index from 0
                 collect
                 (eliscript-value-codec--encode
                  item state (1+ depth) (format "%s[%d]" path index))
                 into encoded
                 finally return (vconcat encoded))))))
   (t
    (eliscript-value-codec--error
     'value-encoding-unsupported
     (format "unsupported Emacs value %S" value)
     path))))

(defun eliscript-worker-value-encode (value &optional limits)
  "Encode one Emacs VALUE for the worker using optional LIMITS."
  (eliscript-value-codec--encode
   value (eliscript-value-codec--state limits) 0 "$"))

(defun eliscript-worker-values-encode (values &optional limits)
  "Encode argument VALUES for the worker using optional LIMITS."
  (let* ((state (eliscript-value-codec--state limits))
         (values (vconcat values)))
    (eliscript-value-codec--collection-length
     state values "$arguments" "encoding")
    (cl-loop for value across values
             for index from 0
             collect
             (eliscript-value-codec--encode
              value state 0 (format "$arguments[%d]" index))
             into encoded
             finally return (vconcat encoded))))

(defun eliscript-value-codec--tuple (node length tag path)
  "Require NODE to have LENGTH fields for TAG at PATH."
  (unless (= (length node) length)
    (eliscript-value-codec--error
     'value-decoding-invalid
     (format "%s node must contain %d fields" tag length)
     path)))

(defun eliscript-value-codec--decode-metadata
    (node state depth path)
  "Decode metadata NODE using STATE at DEPTH and PATH."
  (if (null node)
      nil
    (let ((metadata
           (eliscript-value-codec--decode node state (1+ depth) path)))
      (unless (eliscript-value-map-p metadata)
        (eliscript-value-codec--error
         'value-decoding-invalid
         "metadata must decode to a persistent Map"
         path))
      metadata)))

(defun eliscript-value-codec--decode-values
    (nodes state depth path)
  "Decode vector NODES using STATE at DEPTH and PATH."
  (unless (vectorp nodes)
    (eliscript-value-codec--error
     'value-decoding-invalid "encoded collection must be an array" path))
  (eliscript-value-codec--collection-length
   state nodes path "decoding")
  (cl-loop for node across nodes
           for index from 0
           collect
           (eliscript-value-codec--decode
            node state (1+ depth) (format "%s[%d]" path index))
           into values
           finally return (vconcat values)))

(defun eliscript-value-codec--decode (node state depth path)
  "Decode wire NODE using STATE at DEPTH and PATH."
  (eliscript-value-codec--visit state depth path "decoding")
  (cond
   ((or (null node) (eq node t) (eq node :false)
        (stringp node) (numberp node))
    node)
   ((not (vectorp node))
    (eliscript-value-codec--error
     'value-decoding-invalid
     "encoded value must be a scalar or tagged array"
     path))
   ((or (= (length node) 0) (not (stringp (aref node 0))))
    (eliscript-value-codec--error
     'value-decoding-invalid
     "encoded value tag must be a non-empty string"
     path))
   (t
    (let ((tag (aref node 0)))
      (cond
       ((equal tag "undefined")
        (eliscript-value-codec--tuple node 1 tag path)
        eliscript-worker-value-undefined)
       ((equal tag "number")
        (eliscript-value-codec--tuple node 2 tag path)
        (cond
         ((equal (aref node 1) "nan") 0.0e+NaN)
         ((equal (aref node 1) "positive-infinity") 1.0e+INF)
         ((equal (aref node 1) "negative-infinity") -1.0e+INF)
         ((equal (aref node 1) "negative-zero") -0.0)
         (t
          (eliscript-value-codec--error
           'value-decoding-invalid
           (format "unknown special number %S" (aref node 1))
           path))))
       ((equal tag "keyword")
        (eliscript-value-codec--tuple node 3 tag path)
        (eliscript-value--keyword-create
         (eliscript-value-codec--name
          (aref node 1) "keyword namespace" t)
         (eliscript-value-codec--name
          (aref node 2) "keyword name")))
       ((equal tag "symbol")
        (eliscript-value-codec--tuple node 4 tag path)
        (eliscript-value--symbol-create
         (eliscript-value-codec--name
          (aref node 1) "symbol namespace" t)
         (eliscript-value-codec--name
          (aref node 2) "symbol name")
         (eliscript-value-codec--decode-metadata
          (aref node 3) state depth (concat path ".metadata"))))
       ((member tag '("list" "vector"))
        (eliscript-value-codec--tuple node 3 tag path)
        (let ((values
               (eliscript-value-codec--decode-values
                (aref node 1) state depth path))
              (metadata
               (eliscript-value-codec--decode-metadata
                (aref node 2) state depth (concat path ".metadata"))))
          (if (equal tag "list")
              (eliscript-value--list-create values metadata)
            (eliscript-value--vector-create values metadata))))
       ((equal tag "map")
        (eliscript-value-codec--tuple node 3 tag path)
        (let ((entries (aref node 1)) decoded)
          (unless (vectorp entries)
            (eliscript-value-codec--error
             'value-decoding-invalid "map entries must be an array" path))
          (eliscript-value-codec--collection-length
           state entries path "decoding")
          (dotimes (index (length entries))
            (let ((entry (aref entries index)))
              (unless (and (vectorp entry) (= (length entry) 2))
                (eliscript-value-codec--error
                 'value-decoding-invalid
                 "map entry must contain two values"
                 (format "%s[%d]" path index)))
              (push
               (cons
                (eliscript-value-codec--decode
                 (aref entry 0) state (1+ depth)
                 (format "%s.keys[%d]" path index))
                (eliscript-value-codec--decode
                 (aref entry 1) state (1+ depth)
                 (format "%s.values[%d]" path index)))
               decoded)))
          (eliscript-value--map-create
           (vconcat (nreverse decoded))
           (eliscript-value-codec--decode-metadata
            (aref node 2) state depth (concat path ".metadata")))))
       ((equal tag "set")
        (eliscript-value-codec--tuple node 3 tag path)
        (eliscript-value--set-create
         (eliscript-value-codec--decode-values
          (aref node 1) state depth path)
         (eliscript-value-codec--decode-metadata
          (aref node 2) state depth (concat path ".metadata"))))
       ((equal tag "array")
        (eliscript-value-codec--tuple node 2 tag path)
        (eliscript-value-codec--decode-values
         (aref node 1) state depth path))
       ((equal tag "object")
        (eliscript-value-codec--tuple node 2 tag path)
        (let ((entries (aref node 1)) decoded keys)
          (unless (vectorp entries)
            (eliscript-value-codec--error
             'value-decoding-invalid "object entries must be an array" path))
          (eliscript-value-codec--collection-length
           state entries path "decoding")
          (dotimes (index (length entries))
            (let ((entry (aref entries index)))
              (unless (and (vectorp entry) (= (length entry) 2)
                           (stringp (aref entry 0))
                           (> (length (aref entry 0)) 0))
                (eliscript-value-codec--error
                 'value-decoding-invalid
                 "object entry must contain a non-empty string key and value"
                 (format "%s[%d]" path index)))
              (when (member (aref entry 0) keys)
                (eliscript-value-codec--error
                 'value-decoding-invalid
                 (format "object contains duplicate key %s" (aref entry 0))
                 (format "%s.keys[%d]" path index)))
              (push (aref entry 0) keys)
              (push
               (cons
                (aref entry 0)
                (eliscript-value-codec--decode
                 (aref entry 1) state (1+ depth)
                 (concat path "." (aref entry 0))))
               decoded)))
          (eliscript-value--object-create
           (vconcat (nreverse decoded)))))
       (t
        (eliscript-value-codec--error
         'value-decoding-invalid
         (format "unknown value tag %s" tag)
         path)))))))

(defun eliscript-worker-value-decode (value &optional limits)
  "Decode one worker VALUE using optional LIMITS."
  (eliscript-value-codec--decode
   value (eliscript-value-codec--state limits) 0 "$"))

(defun eliscript-worker-values-decode (values &optional limits)
  "Decode worker argument VALUES using optional LIMITS."
  (unless (vectorp values)
    (eliscript-value-codec--error
     'value-decoding-invalid
     "encoded values must be an array"
     "$arguments"))
  (let ((state (eliscript-value-codec--state limits)))
    (eliscript-value-codec--collection-length
     state values "$arguments" "decoding")
    (cl-loop for value across values
             for index from 0
             collect
             (eliscript-value-codec--decode
              value state 0 (format "$arguments[%d]" index))
             into decoded
             finally return (vconcat decoded))))

(provide 'eliscript-value-codec)

;;; eliscript-value-codec.el ends here
