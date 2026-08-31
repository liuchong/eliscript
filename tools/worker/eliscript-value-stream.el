;;; eliscript-value-stream.el --- Chunked Eliscript worker values -*- lexical-binding: t; -*-

;;; Commentary:

;; Incremental event encoding and decoding for large worker values.  The
;; state machines keep transport buffering independent of logical value size.

;;; Code:

(require 'cl-lib)
(require 'json)
(require 'subr-x)
(require 'eliscript-value-codec)

(define-error 'eliscript-value-stream-error "Eliscript value stream error"
  'eliscript-value-codec-error)

(defconst eliscript-worker-value-framing "eliscript-value-chunks-v1"
  "Chunk framing negotiated by the worker protocol.")

(defconst eliscript-worker-value-stream-limits
  '((max-depth . 64)
    (max-nodes . 8000000)
    (max-collection-length . 4000000)
    (max-string-units . 268435456)
    (max-total-string-units . 536870912)
    (max-chunk-bytes . 262144)
    (max-events-per-chunk . 512)
    (max-text-part-units . 8192))
  "Default resource limits for chunked worker values.")

(cl-defstruct
    (eliscript-value-stream-encoder
     (:constructor eliscript-value-stream-encoder--create))
  state stack pending-event done)

(cl-defstruct
    (eliscript-value-stream-frame
     (:constructor eliscript-value-stream-frame--create))
  tag length expected received path storage metadata key keys seen)

(cl-defstruct
    (eliscript-value-stream-text
     (:constructor eliscript-value-stream-text--create))
  remaining path parts)

(cl-defstruct
    (eliscript-value-stream-decoder
     (:constructor eliscript-value-stream-decoder--create))
  state stack text has-root root finished)

(defun eliscript-value-stream--limits (&optional overrides)
  "Return validated stream limits with optional OVERRIDES."
  (let ((limits (copy-tree eliscript-worker-value-stream-limits)))
    (dolist (entry overrides)
      (setf (alist-get (car entry) limits) (cdr entry)))
    (dolist (entry limits)
      (unless (and (integerp (cdr entry)) (> (cdr entry) 0))
        (signal 'wrong-type-argument
                (list 'positive-integer-p (cdr entry) (car entry)))))
    (when (< (alist-get 'max-text-part-units limits) 2)
      (signal 'wrong-type-argument
              (list 'integer-at-least-two-p
                    (alist-get 'max-text-part-units limits))))
    (when (> (alist-get 'max-text-part-units limits)
             (alist-get 'max-string-units limits))
      (signal 'wrong-type-argument
              (list 'text-part-within-string-limit-p limits)))
    limits))

(defun eliscript-value-stream--state (mode &optional overrides)
  "Return mutable stream state for MODE using optional limit OVERRIDES."
  (list :active (make-hash-table :test #'eq)
        :limits (eliscript-value-stream--limits overrides)
        :mode mode
        :nodes (vector 0)
        :string-units (vector 0)))

(defun eliscript-value-stream--limit (state name)
  "Return limit NAME from STATE."
  (alist-get name (plist-get state :limits)))

(defun eliscript-value-stream--error (state suffix message path)
  "Signal a stream error in STATE with SUFFIX, MESSAGE, and PATH."
  (let ((code (intern (format "value-stream-%s-%s"
                              (plist-get state :mode) suffix))))
    (signal 'eliscript-value-stream-error
            (list (format "%s at %s" message path) code path))))

(defun eliscript-value-stream--visit (state depth path)
  "Account for one logical node in STATE at DEPTH and PATH."
  (let* ((nodes (plist-get state :nodes))
         (count (1+ (aref nodes 0))))
    (aset nodes 0 count)
    (when (> count (eliscript-value-stream--limit state 'max-nodes))
      (eliscript-value-stream--error
       state 'limit
       (format "value stream exceeds %d nodes"
               (eliscript-value-stream--limit state 'max-nodes))
       path))
    (when (> depth (eliscript-value-stream--limit state 'max-depth))
      (eliscript-value-stream--error
       state 'limit
       (format "value stream exceeds depth %d"
               (eliscript-value-stream--limit state 'max-depth))
       path))))

(defun eliscript-value-stream--collection-length (state length path)
  "Validate collection LENGTH in STATE at PATH."
  (unless (and (integerp length) (>= length 0))
    (eliscript-value-stream--error
     state 'invalid "collection length must be a non-negative integer" path))
  (when (> length (eliscript-value-stream--limit
                   state 'max-collection-length))
    (eliscript-value-stream--error
     state 'limit
     (format "collection exceeds %d values"
             (eliscript-value-stream--limit state 'max-collection-length))
     path)))

(defun eliscript-value-stream--string-length (state length path)
  "Account for string LENGTH in UTF-16 units in STATE at PATH."
  (unless (and (integerp length) (>= length 0))
    (eliscript-value-stream--error
     state 'invalid "string length must be a non-negative integer" path))
  (when (> length (eliscript-value-stream--limit state 'max-string-units))
    (eliscript-value-stream--error
     state 'limit
     (format "string exceeds %d UTF-16 units"
             (eliscript-value-stream--limit state 'max-string-units))
     path))
  (let* ((total (plist-get state :string-units))
         (next (+ (aref total 0) length)))
    (aset total 0 next)
    (when (> next (eliscript-value-stream--limit
                   state 'max-total-string-units))
      (eliscript-value-stream--error
       state 'limit
       (format "value stream exceeds %d string units"
               (eliscript-value-stream--limit
                state 'max-total-string-units))
       path))))

(defun eliscript-value-stream--utf16-units (value)
  "Return the number of UTF-16 code units in string VALUE."
  (cl-loop for character across value
           sum (if (> character #xffff) 2 1)))

(defun eliscript-value-stream--text-end (value start maximum-units)
  "Return end index in VALUE after START within MAXIMUM-UNITS."
  (let ((index start)
        (units 0)
        (length (length value)))
    (while (and (< index length)
                (let ((next (+ units
                               (if (> (aref value index) #xffff) 2 1))))
                  (when (<= next maximum-units)
                    (setq units next)
                    t)))
      (setq index (1+ index)))
    (if (= index start) (1+ start) index)))

(defun eliscript-value-stream--activate (state value path)
  "Mark VALUE active in STATE or reject a cycle at PATH."
  (let ((active (plist-get state :active)))
    (when (gethash value active)
      (eliscript-value-stream--error
       state 'cycle "cyclic values are not transportable" path))
    (puthash value t active)))

(defun eliscript-value-stream--entry (entry label state path)
  "Return pair represented by ENTRY or reject LABEL using STATE and PATH."
  (cond
   ((and (vectorp entry) (= (length entry) 2))
    (cons (aref entry 0) (aref entry 1)))
   ((and (consp entry) (not (consp (cdr entry)))) entry)
   (t
    (eliscript-value-stream--error
     state 'invalid
     (format "%s must contain exactly two values" label)
     path))))

(defun eliscript-value-stream--push-value
    (encoder value depth path)
  "Push VALUE task at DEPTH and PATH onto ENCODER."
  (push (list 'value value depth path)
        (eliscript-value-stream-encoder-stack encoder)))

(defun eliscript-value-stream--push-sequence
    (encoder kind values depth path)
  "Push sequence iterator KIND over VALUES onto ENCODER."
  (push (list kind values 0 depth path)
        (eliscript-value-stream-encoder-stack encoder)))

(defun eliscript-value-stream--encode-number (value)
  "Return stream event for numeric VALUE."
  (cond
   ((and (floatp value) (isnan value)) ["number" "nan"])
   ((eliscript-value-codec--infinity-p value)
    (vector "number" (if (> value 0.0)
                         "positive-infinity"
                       "negative-infinity")))
   ((eliscript-value-codec--negative-zero-p value)
    ["number" "negative-zero"])
   (t (vector "value" value))))

(defun eliscript-value-stream--open-value
    (encoder value depth path)
  "Expand VALUE in ENCODER at DEPTH and PATH and return its first event."
  (let ((state (eliscript-value-stream-encoder-state encoder))
        (stack (eliscript-value-stream-encoder-stack encoder)))
    (eliscript-value-stream--visit state depth path)
    (cond
     ((eq value eliscript-worker-value-undefined) ["undefined"])
     ((or (null value) (eq value t) (eq value :false))
      (vector "value" value))
     ((stringp value)
      (let ((units (eliscript-value-stream--utf16-units value)))
        (eliscript-value-stream--string-length state units path)
        (when (> (length value) 0)
          (push (list 'text value 0 path) stack))
        (setf (eliscript-value-stream-encoder-stack encoder) stack)
        (vector "text" units)))
     ((numberp value) (eliscript-value-stream--encode-number value))
     ((eliscript-value-keyword-p value)
      (eliscript-value-stream--push-value
       encoder (eliscript-value-keyword-name value) (1+ depth)
       (concat path ".name"))
      (eliscript-value-stream--push-value
       encoder (eliscript-value-keyword-namespace value) (1+ depth)
       (concat path ".namespace"))
      ["open" "keyword" 2])
     ((eliscript-value-symbol-p value)
      (eliscript-value-stream--activate state value path)
      (push (list 'leave value) (eliscript-value-stream-encoder-stack encoder))
      (eliscript-value-stream--push-value
       encoder (eliscript-value-symbol-metadata value) (1+ depth)
       (concat path ".metadata"))
      (eliscript-value-stream--push-value
       encoder (eliscript-value-symbol-name value) (1+ depth)
       (concat path ".name"))
      (eliscript-value-stream--push-value
       encoder (eliscript-value-symbol-namespace value) (1+ depth)
       (concat path ".namespace"))
      ["open" "symbol" 3])
     ((or (eliscript-value-list-p value)
          (eliscript-value-vector-p value))
      (let* ((list-p (eliscript-value-list-p value))
             (values (if list-p
                         (eliscript-value-list-values value)
                       (eliscript-value-vector-values value)))
             (metadata (if list-p
                           (eliscript-value-list-metadata value)
                         (eliscript-value-vector-metadata value))))
        (eliscript-value-stream--collection-length state (length values) path)
        (eliscript-value-stream--activate state value path)
        (push (list 'leave value)
              (eliscript-value-stream-encoder-stack encoder))
        (eliscript-value-stream--push-value
         encoder metadata (1+ depth) (concat path ".metadata"))
        (eliscript-value-stream--push-sequence
         encoder 'sequence values depth path)
        (vector "open" (if list-p "list" "vector") (length values))))
     ((eliscript-value-map-p value)
      (let ((entries (eliscript-value-map-entries value)))
        (eliscript-value-stream--collection-length state (length entries) path)
        (eliscript-value-stream--activate state value path)
        (push (list 'leave value)
              (eliscript-value-stream-encoder-stack encoder))
        (eliscript-value-stream--push-value
         encoder (eliscript-value-map-metadata value) (1+ depth)
         (concat path ".metadata"))
        (eliscript-value-stream--push-sequence
         encoder 'map entries depth path)
        (vector "open" "map" (length entries))))
     ((eliscript-value-set-p value)
      (let ((values (eliscript-value-set-values value)))
        (eliscript-value-stream--collection-length state (length values) path)
        (eliscript-value-stream--activate state value path)
        (push (list 'leave value)
              (eliscript-value-stream-encoder-stack encoder))
        (eliscript-value-stream--push-value
         encoder (eliscript-value-set-metadata value) (1+ depth)
         (concat path ".metadata"))
        (eliscript-value-stream--push-sequence
         encoder 'sequence values depth path)
        (vector "open" "set" (length values))))
     ((eliscript-value-object-p value)
      (let ((entries (eliscript-value-object-entries value)))
        (eliscript-value-stream--collection-length state (length entries) path)
        (eliscript-value-stream--activate state value path)
        (push (list 'leave value)
              (eliscript-value-stream-encoder-stack encoder))
        (eliscript-value-stream--push-sequence
         encoder 'object entries depth path)
        (vector "open" "object" (length entries))))
     ((vectorp value)
      (eliscript-value-stream--collection-length state (length value) path)
      (eliscript-value-stream--activate state value path)
      (push (list 'leave value)
            (eliscript-value-stream-encoder-stack encoder))
      (eliscript-value-stream--push-sequence
       encoder 'sequence value depth path)
      (vector "open" "array" (length value)))
     (t
      (eliscript-value-stream--error
       state 'unsupported (format "unsupported Emacs value %S" value) path)))))

(defun eliscript-value-stream--next-task-event (encoder task)
  "Execute TASK in ENCODER and return an event or nil."
  (pcase (car task)
    ('value
     (eliscript-value-stream--open-value
      encoder (nth 1 task) (nth 2 task) (nth 3 task)))
    ('leave
     (remhash (nth 1 task)
              (plist-get (eliscript-value-stream-encoder-state encoder)
                         :active))
     nil)
    ('text
     (let* ((value (nth 1 task))
            (start (nth 2 task))
            (path (nth 3 task))
            (end (eliscript-value-stream--text-end
                  value start
                  (eliscript-value-stream--limit
                   (eliscript-value-stream-encoder-state encoder)
                   'max-text-part-units))))
       (when (< end (length value))
         (push (list 'text value end path)
               (eliscript-value-stream-encoder-stack encoder)))
       (vector "text-part" (substring value start end))))
    ('sequence
     (let* ((values (nth 1 task))
            (index (nth 2 task))
            (depth (nth 3 task))
            (path (nth 4 task)))
       (when (< index (length values))
         (push (list 'sequence values (1+ index) depth path)
               (eliscript-value-stream-encoder-stack encoder))
         (eliscript-value-stream--push-value
          encoder (aref values index) (1+ depth)
          (format "%s[%d]" path index)))
       nil))
    ((or 'map 'object)
     (let* ((kind (car task))
            (entries (nth 1 task))
            (index (nth 2 task))
            (depth (nth 3 task))
            (path (nth 4 task)))
       (when (< index (length entries))
         (let* ((entry (eliscript-value-stream--entry
                        (aref entries index)
                        (if (eq kind 'map) "map entry" "object entry")
                        (eliscript-value-stream-encoder-state encoder)
                        (format "%s[%d]" path index)))
                (key (car entry)))
           (when (and (eq kind 'object)
                      (not (and (stringp key) (> (length key) 0))))
             (eliscript-value-stream--error
              (eliscript-value-stream-encoder-state encoder)
              'invalid "object key must be a non-empty string"
              (format "%s.keys[%d]" path index)))
           (push (list kind entries (1+ index) depth path)
                 (eliscript-value-stream-encoder-stack encoder))
           (eliscript-value-stream--push-value
            encoder (cdr entry) (1+ depth)
            (format "%s.values[%d]" path index))
           (eliscript-value-stream--push-value
            encoder key (1+ depth)
            (format "%s.keys[%d]" path index))))
       nil))
    (_
     (eliscript-value-stream--error
      (eliscript-value-stream-encoder-state encoder)
      'invalid (format "unknown encoder task %S" (car task)) "$"))))

(defun eliscript-worker-value-stream-encoder (value &optional limits)
  "Return an incremental stream encoder for VALUE using optional LIMITS."
  (eliscript-value-stream-encoder--create
   :state (eliscript-value-stream--state "encoding" limits)
   :stack (list (list 'value value 0 "$"))))

(defun eliscript-worker-value-stream-next-event (encoder)
  "Return the next event from ENCODER, or nil when complete."
  (or (prog1 (eliscript-value-stream-encoder-pending-event encoder)
        (setf (eliscript-value-stream-encoder-pending-event encoder) nil))
      (let (event)
        (while (and (not event)
                    (eliscript-value-stream-encoder-stack encoder))
          (setq event
                (eliscript-value-stream--next-task-event
                 encoder
                 (pop (eliscript-value-stream-encoder-stack encoder)))))
        (unless (or event (eliscript-value-stream-encoder-stack encoder))
          (setf (eliscript-value-stream-encoder-done encoder) t))
        event)))

(defun eliscript-value-stream--json-bytes (value)
  "Return UTF-8 JSON byte length of VALUE."
  (string-bytes
   (encode-coding-string
    (json-serialize value :null-object nil :false-object :false)
    'utf-8-unix t)))

(defun eliscript-value-stream--event-bytes (event)
  "Return UTF-8 JSON byte length of EVENT."
  (eliscript-value-stream--json-bytes event))

(defun eliscript-worker-value-stream-next-chunk (encoder)
  "Return the next bounded event vector from ENCODER, or nil."
  (let* ((state (eliscript-value-stream-encoder-state encoder))
         (max-bytes (eliscript-value-stream--limit state 'max-chunk-bytes))
         (max-events (eliscript-value-stream--limit
                      state 'max-events-per-chunk))
         (bytes 2)
         events
         event)
    (catch 'chunk-full
      (while (and (< (length events) max-events)
                  (setq event
                        (eliscript-worker-value-stream-next-event encoder)))
        (let* ((event-bytes (eliscript-value-stream--event-bytes event))
               (added (+ event-bytes (if events 1 0))))
          (when (> (+ event-bytes 2) max-bytes)
            (eliscript-value-stream--error
             state 'limit
             (format "one value event exceeds %d bytes" max-bytes) "$"))
          (if (and events (> (+ bytes added) max-bytes))
              (progn
                (setf (eliscript-value-stream-encoder-pending-event encoder)
                      event)
                (throw 'chunk-full nil))
            (push event events)
            (setq bytes (+ bytes added))))))
    (and events (vconcat (nreverse events)))))

(defun eliscript-worker-value-stream-encoder-complete-p (encoder)
  "Return non-nil when ENCODER has no event remaining."
  (and (null (eliscript-value-stream-encoder-pending-event encoder))
       (null (eliscript-value-stream-encoder-stack encoder))))

(defun eliscript-value-stream--name (value label state path &optional nullable)
  "Validate VALUE as LABEL using STATE and PATH, optionally NULLABLE."
  (cond
   ((and nullable (null value)) nil)
   ((and (stringp value) (> (length value) 0)) value)
   (t
    (eliscript-value-stream--error
     state 'invalid
     (format "%s must be a non-empty string%s"
             label (if nullable " or null" ""))
     path))))

(defun eliscript-value-stream--metadata (value state path)
  "Validate metadata VALUE using STATE at PATH."
  (if (null value)
      nil
    (unless (eliscript-value-map-p value)
      (eliscript-value-stream--error
       state 'invalid "metadata must decode to a persistent Map" path))
    value))

(defun eliscript-value-stream--child-path (frame)
  "Return path for FRAME's next child."
  (let ((tag (eliscript-value-stream-frame-tag frame))
        (index (eliscript-value-stream-frame-received frame))
        (length (eliscript-value-stream-frame-length frame))
        (path (eliscript-value-stream-frame-path frame)))
    (cond
     ((member tag '("keyword" "symbol"))
      (concat path "." (nth index '("namespace" "name" "metadata"))))
     ((member tag '("list" "vector" "set"))
      (if (< index length)
          (format "%s[%d]" path index)
        (concat path ".metadata")))
     ((equal tag "array") (format "%s[%d]" path index))
     ((equal tag "map")
      (cond
       ((= index (* length 2)) (concat path ".metadata"))
       ((zerop (% index 2))
        (format "%s.keys[%d]" path (/ index 2)))
       (t (format "%s.values[%d]" path (/ (1- index) 2)))))
     ((equal tag "object")
      (if (zerop (% index 2))
          (format "%s.keys[%d]" path (/ index 2))
        (format "%s.values[%d]" path (/ (1- index) 2))))
     (t path))))

(defun eliscript-value-stream--frame (tag length path state)
  "Create decoder frame TAG with LENGTH at PATH using STATE."
  (unless (and (stringp tag) (integerp length) (>= length 0))
    (eliscript-value-stream--error
     state 'invalid "open event tag and length are invalid" path))
  (unless (member tag '("keyword" "symbol" "list" "vector"
                        "map" "set" "array" "object"))
    (eliscript-value-stream--error
     state 'invalid (format "unknown open event tag %s" tag) path))
  (when (and (equal tag "keyword") (/= length 2))
    (eliscript-value-stream--error
     state 'invalid "keyword open event must declare arity 2" path))
  (when (and (equal tag "symbol") (/= length 3))
    (eliscript-value-stream--error
     state 'invalid "symbol open event must declare arity 3" path))
  (unless (member tag '("keyword" "symbol"))
    (eliscript-value-stream--collection-length state length path))
  (let* ((expected
          (cond
           ((member tag '("keyword" "symbol")) length)
           ((equal tag "map") (1+ (* length 2)))
           ((equal tag "object") (* length 2))
           ((member tag '("list" "vector" "set")) (1+ length))
           (t length)))
         (storage-length
          (cond
           ((member tag '("keyword" "symbol")) length)
           ((equal tag "map") length)
           ((equal tag "object") length)
           ((member tag '("list" "vector" "set" "array")) length)
           (t 0))))
    (eliscript-value-stream-frame--create
     :tag tag
     :length length
     :expected expected
     :received 0
     :path path
     :storage (make-vector storage-length nil)
     :keys (and (equal tag "object") (make-hash-table :test #'equal))
     :seen (and (member tag '("map" "set"))
                (make-hash-table :test #'equal)))))

(defun eliscript-value-stream--consume (frame value state)
  "Consume VALUE into FRAME using STATE."
  (let ((tag (eliscript-value-stream-frame-tag frame))
        (index (eliscript-value-stream-frame-received frame))
        (length (eliscript-value-stream-frame-length frame))
        (path (eliscript-value-stream--child-path frame)))
    (cond
     ((member tag '("keyword" "symbol"))
      (aset (eliscript-value-stream-frame-storage frame) index value))
     ((member tag '("list" "vector"))
      (if (< index length)
          (aset (eliscript-value-stream-frame-storage frame) index value)
        (setf (eliscript-value-stream-frame-metadata frame) value)))
     ((equal tag "array")
      (aset (eliscript-value-stream-frame-storage frame) index value))
     ((equal tag "map")
      (cond
       ((= index (* length 2))
        (setf (eliscript-value-stream-frame-metadata frame) value))
       ((zerop (% index 2))
        (when (gethash value (eliscript-value-stream-frame-seen frame))
          (eliscript-value-stream--error
           state 'invalid "map contains an equal duplicate key" path))
        (puthash value t (eliscript-value-stream-frame-seen frame))
        (setf (eliscript-value-stream-frame-key frame) value))
       (t
        (aset (eliscript-value-stream-frame-storage frame)
              (/ (1- index) 2)
              (cons (eliscript-value-stream-frame-key frame) value)))))
     ((equal tag "set")
      (if (< index length)
          (progn
            (when (gethash value (eliscript-value-stream-frame-seen frame))
              (eliscript-value-stream--error
               state 'invalid "set contains an equal duplicate value" path))
            (puthash value t (eliscript-value-stream-frame-seen frame))
            (aset (eliscript-value-stream-frame-storage frame) index value))
        (setf (eliscript-value-stream-frame-metadata frame) value)))
     ((equal tag "object")
      (if (zerop (% index 2))
          (let ((key (eliscript-value-stream--name
                      value "object key" state path)))
            (when (gethash key (eliscript-value-stream-frame-keys frame))
              (eliscript-value-stream--error
               state 'invalid (format "object contains duplicate key %s" key)
               path))
            (puthash key t (eliscript-value-stream-frame-keys frame))
            (setf (eliscript-value-stream-frame-key frame) key))
        (aset (eliscript-value-stream-frame-storage frame)
              (/ (1- index) 2)
              (cons (eliscript-value-stream-frame-key frame) value)))))
    (cl-incf (eliscript-value-stream-frame-received frame))))

(defun eliscript-value-stream--finalize (frame state)
  "Return decoded value from complete FRAME using STATE."
  (let ((tag (eliscript-value-stream-frame-tag frame))
        (path (eliscript-value-stream-frame-path frame))
        (values (eliscript-value-stream-frame-storage frame)))
    (cond
     ((equal tag "keyword")
      (eliscript-value--keyword-create
       (eliscript-value-stream--name
        (aref values 0) "keyword namespace" state
        (concat path ".namespace") t)
       (eliscript-value-stream--name
        (aref values 1) "keyword name" state (concat path ".name"))))
     ((equal tag "symbol")
      (eliscript-value--symbol-create
       (eliscript-value-stream--name
        (aref values 0) "symbol namespace" state
        (concat path ".namespace") t)
       (eliscript-value-stream--name
        (aref values 1) "symbol name" state (concat path ".name"))
       (eliscript-value-stream--metadata
        (aref values 2) state (concat path ".metadata"))))
     ((equal tag "list")
      (eliscript-value--list-create
       values
       (eliscript-value-stream--metadata
        (eliscript-value-stream-frame-metadata frame)
        state (concat path ".metadata"))))
     ((equal tag "vector")
      (eliscript-value--vector-create
       values
       (eliscript-value-stream--metadata
        (eliscript-value-stream-frame-metadata frame)
        state (concat path ".metadata"))))
     ((equal tag "map")
      (eliscript-value--map-create
       values
       (eliscript-value-stream--metadata
        (eliscript-value-stream-frame-metadata frame)
        state (concat path ".metadata"))))
     ((equal tag "set")
      (eliscript-value--set-create
       values
       (eliscript-value-stream--metadata
        (eliscript-value-stream-frame-metadata frame)
        state (concat path ".metadata"))))
     ((equal tag "array") values)
     ((equal tag "object") (eliscript-value--object-create values))
     (t
      (eliscript-value-stream--error
       state 'invalid (format "cannot finalize unknown container %s" tag)
       path)))))

(defun eliscript-value-stream--current-path (decoder)
  "Return path for DECODER's next value."
  (let ((frame (car (eliscript-value-stream-decoder-stack decoder))))
    (if frame (eliscript-value-stream--child-path frame) "$")))

(defun eliscript-value-stream--accept (decoder value)
  "Accept complete VALUE into DECODER."
  (let ((state (eliscript-value-stream-decoder-state decoder))
        complete)
    (setq complete value)
    (catch 'accepted
      (while t
        (let ((frame (car (eliscript-value-stream-decoder-stack decoder))))
          (if (null frame)
              (progn
                (when (eliscript-value-stream-decoder-has-root decoder)
                  (eliscript-value-stream--error
                   state 'invalid "value stream contains multiple roots" "$"))
                (setf (eliscript-value-stream-decoder-root decoder) complete
                      (eliscript-value-stream-decoder-has-root decoder) t)
                (throw 'accepted nil))
            (eliscript-value-stream--consume frame complete state)
            (if (< (eliscript-value-stream-frame-received frame)
                   (eliscript-value-stream-frame-expected frame))
                (throw 'accepted nil)
              (pop (eliscript-value-stream-decoder-stack decoder))
              (setq complete
                    (eliscript-value-stream--finalize frame state)))))))))

(defun eliscript-value-stream--tuple (event length tag state path)
  "Validate EVENT tuple LENGTH and TAG using STATE at PATH."
  (unless (and (vectorp event) (= (length event) length)
               (equal (aref event 0) tag))
    (eliscript-value-stream--error
     state 'invalid
     (format "%s event must contain %d fields" tag length)
     path)))

(defun eliscript-value-stream--write-text (decoder event)
  "Apply text-part EVENT to DECODER."
  (let* ((state (eliscript-value-stream-decoder-state decoder))
         (text (eliscript-value-stream-decoder-text decoder))
         (path (eliscript-value-stream-text-path text)))
    (eliscript-value-stream--tuple event 2 "text-part" state path)
    (let* ((part (aref event 1))
           (units (and (stringp part)
                       (eliscript-value-stream--utf16-units part))))
      (unless (and units (> units 0))
        (eliscript-value-stream--error
         state 'invalid "text-part payload must be non-empty" path))
      (when (> units (eliscript-value-stream-text-remaining text))
        (eliscript-value-stream--error
         state 'invalid "text parts exceed declared string length" path))
      (push part (eliscript-value-stream-text-parts text))
      (cl-decf (eliscript-value-stream-text-remaining text) units)
      (when (zerop (eliscript-value-stream-text-remaining text))
        (let ((value (string-join
                      (nreverse (eliscript-value-stream-text-parts text))
                      "")))
          (setf (eliscript-value-stream-decoder-text decoder) nil)
          (eliscript-value-stream--accept decoder value))))))

(defun eliscript-worker-value-stream-decoder (&optional limits)
  "Return an incremental value stream decoder using optional LIMITS."
  (eliscript-value-stream-decoder--create
   :state (eliscript-value-stream--state "decoding" limits)))

(defun eliscript-worker-value-stream-write-event (decoder event)
  "Write one EVENT into DECODER."
  (let* ((state (eliscript-value-stream-decoder-state decoder))
         (path (eliscript-value-stream--current-path decoder)))
    (when (eliscript-value-stream-decoder-finished decoder)
      (eliscript-value-stream--error
       state 'invalid "cannot write after stream completion" "$"))
    (if (eliscript-value-stream-decoder-text decoder)
        (eliscript-value-stream--write-text decoder event)
      (unless (and (vectorp event) (> (length event) 0)
                   (stringp (aref event 0)))
        (eliscript-value-stream--error
         state 'invalid "value event must be a tagged array" path))
      (pcase (aref event 0)
        ("value"
         (eliscript-value-stream--tuple event 2 "value" state path)
         (let ((value (aref event 1)))
           (unless (or (null value) (eq value t) (eq value :false)
                       (numberp value))
             (eliscript-value-stream--error
              state 'invalid "value event contains an invalid scalar" path))
           (eliscript-value-stream--visit
            state (length (eliscript-value-stream-decoder-stack decoder)) path)
           (eliscript-value-stream--accept decoder value)))
        ("undefined"
         (eliscript-value-stream--tuple event 1 "undefined" state path)
         (eliscript-value-stream--visit
          state (length (eliscript-value-stream-decoder-stack decoder)) path)
         (eliscript-value-stream--accept
          decoder eliscript-worker-value-undefined))
        ("number"
         (eliscript-value-stream--tuple event 2 "number" state path)
         (eliscript-value-stream--visit
          state (length (eliscript-value-stream-decoder-stack decoder)) path)
         (let ((name (aref event 1)))
           (eliscript-value-stream--accept
            decoder
            (cond
             ((equal name "nan") 0.0e+NaN)
             ((equal name "positive-infinity") 1.0e+INF)
             ((equal name "negative-infinity") -1.0e+INF)
             ((equal name "negative-zero") -0.0)
             (t
              (eliscript-value-stream--error
               state 'invalid
               (format "unknown special number %S" name) path))))))
        ("text"
         (eliscript-value-stream--tuple event 2 "text" state path)
         (eliscript-value-stream--visit
          state (length (eliscript-value-stream-decoder-stack decoder)) path)
         (let ((units (aref event 1)))
           (eliscript-value-stream--string-length state units path)
           (if (zerop units)
               (eliscript-value-stream--accept decoder "")
             (setf (eliscript-value-stream-decoder-text decoder)
                   (eliscript-value-stream-text--create
                    :remaining units :path path)))))
        ("open"
         (eliscript-value-stream--tuple event 3 "open" state path)
         (eliscript-value-stream--visit
          state (length (eliscript-value-stream-decoder-stack decoder)) path)
         (let ((frame (eliscript-value-stream--frame
                       (aref event 1) (aref event 2) path state)))
           (push frame (eliscript-value-stream-decoder-stack decoder))
           (when (zerop (eliscript-value-stream-frame-expected frame))
             (pop (eliscript-value-stream-decoder-stack decoder))
             (eliscript-value-stream--accept
              decoder (eliscript-value-stream--finalize frame state)))))
        (_
         (eliscript-value-stream--error
          state 'invalid
          (format "unknown value event %S" (aref event 0)) path))))))

(defun eliscript-worker-value-stream-write (decoder events)
  "Write vector EVENTS into DECODER and return it."
  (let ((state (eliscript-value-stream-decoder-state decoder)))
    (unless (vectorp events)
      (eliscript-value-stream--error
       state 'invalid "value chunk events must be an array"
       (eliscript-value-stream--current-path decoder)))
    (when (> (eliscript-value-stream--json-bytes events)
             (eliscript-value-stream--limit state 'max-chunk-bytes))
      (eliscript-value-stream--error
       state 'limit
       (format "value chunk exceeds %d bytes"
               (eliscript-value-stream--limit state 'max-chunk-bytes))
       (eliscript-value-stream--current-path decoder)))
    (when (> (length events)
             (eliscript-value-stream--limit state 'max-events-per-chunk))
      (eliscript-value-stream--error
       state 'limit
       (format "value chunk exceeds %d events"
               (eliscript-value-stream--limit state 'max-events-per-chunk))
       (eliscript-value-stream--current-path decoder)))
    (dotimes (index (length events))
      (eliscript-worker-value-stream-write-event
       decoder (aref events index)))
    decoder))

(defun eliscript-worker-value-stream-finish (decoder)
  "Finish DECODER and return its one complete value."
  (let ((state (eliscript-value-stream-decoder-state decoder)))
    (when (eliscript-value-stream-decoder-finished decoder)
      (eliscript-value-stream--error
       state 'invalid "value stream was already completed" "$"))
    (when (eliscript-value-stream-decoder-text decoder)
      (eliscript-value-stream--error
       state 'truncated "value stream ended inside a string"
       (eliscript-value-stream-text-path
        (eliscript-value-stream-decoder-text decoder))))
    (when (eliscript-value-stream-decoder-stack decoder)
      (eliscript-value-stream--error
       state 'truncated "value stream ended inside a container"
       (eliscript-value-stream--current-path decoder)))
    (unless (eliscript-value-stream-decoder-has-root decoder)
      (eliscript-value-stream--error
       state 'truncated "value stream did not contain a root" "$"))
    (setf (eliscript-value-stream-decoder-finished decoder) t)
    (eliscript-value-stream-decoder-root decoder)))

(provide 'eliscript-value-stream)

;;; eliscript-value-stream.el ends here
