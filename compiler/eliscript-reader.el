;;; eliscript-reader.el --- Reader for Eliscript -*- lexical-binding: t; -*-

;;; Commentary:

;; Eliscript intentionally starts with the Emacs Lisp reader.  The compiler
;; owns the language semantics after reading, so accepting an Emacs Lisp form
;; does not imply that the form has Emacs Lisp runtime behavior.

;;; Code:

(require 'cl-lib)
(require 'lisp-mode)
(require 'eliscript-diagnostic)
(require 'eliscript-form)

(define-error 'eliscript-read-error
  "Eliscript reader error"
  'eliscript-compile-error)

(cl-defstruct (eliscript-reader--node
               (:constructor eliscript-reader--node-create))
  span
  children
  kind)

(defun eliscript-reader--queue-opening-index (source index)
  "Return the opening bracket index for a Queue tag at INDEX in SOURCE."
  (let ((tag-end (+ index 6)))
    (when (and (<= tag-end (length source))
               (string= (substring source index tag-end) "#queue"))
      (let ((cursor tag-end)
            done)
        (while (and (< cursor (length source)) (not done))
          (let ((character (aref source cursor)))
            (cond
             ((memq character '(32 9 10 13 12))
              (setq cursor (1+ cursor)))
             ((= character ?\;)
              (while (and (< cursor (length source))
                          (/= (aref source cursor) ?\n))
                (setq cursor (1+ cursor))))
             (t (setq done t)))))
        (and (< cursor (length source))
             (= (aref source cursor) ?\[)
             cursor)))))

(defun eliscript-reader--queue-closing-index (source opening)
  "Return the bracket closing Queue OPENING in SOURCE, or nil."
  (let ((cursor (1+ opening))
        (stack (list ?\]))
        in-string escaped in-comment result)
    (while (and (< cursor (length source)) stack)
      (let ((character (aref source cursor)))
        (cond
         (in-comment
          (when (= character ?\n) (setq in-comment nil)))
         (in-string
          (cond
           (escaped (setq escaped nil))
           ((= character ?\\) (setq escaped t))
           ((= character ?\") (setq in-string nil))))
         ((= character ?\;) (setq in-comment t))
         ((= character ?\") (setq in-string t))
         ((= character ?\() (push ?\) stack))
         ((= character ?\[) (push ?\] stack))
         ((= character ?\{) (push ?\} stack))
         ((memq character '(?\) ?\] ?\}))
          (if (= character (car stack))
              (progn
                (pop stack)
                (unless stack (setq result cursor)))
            (setq stack nil result nil)))))
      (setq cursor (1+ cursor)))
    result))

(defun eliscript-reader--emacs-source (source)
  "Return a length-preserving Emacs-readable copy of SOURCE.

Map braces outside strings and comments become parentheses.  Set literals
become a same-length parenthesized form with the dispatch brace replaced by
whitespace.  Eliscript owns both persistent value semantics after the host
reader has produced a list."
  (let ((result (copy-sequence source))
        (index 0)
        (in-string nil)
        (escaped nil)
        (in-comment nil))
    (while (< index (length result))
      (let ((character (aref result index)))
        (cond
         (in-comment
          (when (= character ?\n)
            (setq in-comment nil)))
         (in-string
          (cond
           (escaped (setq escaped nil))
           ((= character ?\\) (setq escaped t))
           ((= character ?\") (setq in-string nil))))
         ((= character ?\;) (setq in-comment t))
         ((= character ?\") (setq in-string t))
         ((let ((opening
                 (eliscript-reader--queue-opening-index source index)))
            (when opening
              (aset result index ?\()
              (aset result opening ?\s)
              (let ((closing
                     (eliscript-reader--queue-closing-index source opening)))
                (when closing (aset result closing ?\))))
              t)))
         ((and (= character ?#)
               (< (1+ index) (length result))
               (= (aref result (1+ index)) ?\{))
          (aset result index ?\()
          (aset result (1+ index) ?\s))
         ((= character ?\{) (aset result index ?\())
         ((= character ?\}) (aset result index ?\)))))
      (setq index (1+ index)))
    result))

(defun eliscript-reader--span (start end filename)
  "Return a source span from buffer positions START to END in FILENAME."
  (let (line column end-line end-column)
    (save-excursion
      (goto-char start)
      (setq line (line-number-at-pos)
            column (1+ (- start (line-beginning-position))))
      (goto-char end)
      (setq end-line (line-number-at-pos)
            end-column (1+ (- end (line-beginning-position)))))
    (eliscript-source-span-create
     :filename filename
     :start (1- start)
     :end (1- end)
     :line line
     :column column
     :end-line end-line
     :end-column end-column)))

(defun eliscript-reader--prefix-length ()
  "Return the reader-prefix length at point, or nil when none is present."
  (cond
   ((looking-at "#'") 2)
   ((memq (char-after) '(?' ?`)) 1)
   ((eq (char-after) ?,)
    (if (eq (char-after (1+ (point))) ?@) 2 1))))

(defun eliscript-reader--queue-opening-position ()
  "Return the Queue payload opening position at point, or nil."
  (let ((start (point)))
    (when (and (<= (+ start 6) (point-max))
               (string= (buffer-substring-no-properties start (+ start 6))
                        "#queue"))
      (save-excursion
        (goto-char (+ start 6))
        (forward-comment (point-max))
        (and (eq (char-after) ?\[) (point))))))

(defun eliscript-reader--scan-node (filename)
  "Scan one source node at point for FILENAME and return its location tree."
  (forward-comment (point-max))
  (let* ((start (point))
         (prefix-length (eliscript-reader--prefix-length))
         (queue-opening (eliscript-reader--queue-opening-position))
         children)
    (cond
     (prefix-length
      (forward-char prefix-length)
      (let* ((prefix-end (point))
             (child (eliscript-reader--scan-node filename))
             (end (point)))
        (setq children
              (list
               (eliscript-reader--node-create
                :span (eliscript-reader--span start prefix-end filename)
                :kind 'prefix-token)
               child))
        (eliscript-reader--node-create
         :span (eliscript-reader--span start end filename)
         :children children
         :kind 'prefix)))
     (queue-opening
      (goto-char queue-opening)
      (forward-char 1)
      (forward-comment (point-max))
      (while (and (char-after) (not (eq (char-after) ?\])))
        (when (memq (char-after) '(?\) ?\}))
          (eliscript-diagnostic-signal
           'eliscript-read-error "ELI-R0001" "reader"
           filename (eliscript-reader--span start (+ start 6) filename)
           "Invalid read syntax: %S" (char-to-string (char-after))))
        (push (eliscript-reader--scan-node filename) children)
        (forward-comment (point-max)))
      (when (eq (char-after) ?\]) (forward-char 1))
      (eliscript-reader--node-create
       :span (eliscript-reader--span start (point) filename)
       :children (nreverse children)
       :kind 'queue))
     ((and (eq (char-after) ?#)
           (eq (char-after (1+ (point))) ?\{))
      (forward-char 2)
      (forward-comment (point-max))
      (while (and (char-after) (not (eq (char-after) ?\})))
        (when (memq (char-after) '(?\) ?\]))
          (eliscript-diagnostic-signal
           'eliscript-read-error "ELI-R0001" "reader"
           filename (eliscript-reader--span start (+ start 2) filename)
           "Invalid read syntax: %S" (char-to-string (char-after))))
        (push (eliscript-reader--scan-node filename) children)
        (forward-comment (point-max)))
      (when (eq (char-after) ?\})
        (forward-char 1))
      (eliscript-reader--node-create
       :span (eliscript-reader--span start (point) filename)
       :children (nreverse children)
       :kind 'set))
     ((memq (char-after) '(?\( ?\[ ?\{))
      (let* ((opening (char-after))
             (closing (pcase opening
                        (?\( ?\))
                        (?\[ ?\])
                        (?\{ ?\})))
             (kind (pcase opening
                     (?\( 'list)
                     (?\[ 'vector)
                     (?\{ 'map))))
        (forward-char 1)
        (forward-comment (point-max))
        (while (and (char-after) (not (eq (char-after) closing)))
          (when (memq (char-after) '(?\) ?\] ?\}))
            (eliscript-diagnostic-signal
             'eliscript-read-error "ELI-R0001" "reader"
             filename (eliscript-reader--span start (1+ start) filename)
             "Invalid read syntax: %S" (char-to-string (char-after))))
          (push (eliscript-reader--scan-node filename) children)
          (forward-comment (point-max)))
        (when (eq (char-after) closing)
          (forward-char 1))
        (eliscript-reader--node-create
         :span (eliscript-reader--span start (point) filename)
         :children (nreverse children)
         :kind kind)))
     (t
      (let ((end (scan-sexps start 1)))
        (unless end
          (setq end (point-max)))
        (goto-char end)
        (eliscript-reader--node-create
         :span (eliscript-reader--span start end filename)
         :kind 'atom))))))

(defun eliscript-reader--map-operator-span (span)
  "Return the opening-brace operator span within map SPAN."
  (eliscript-source-span-create
   :filename (eliscript-source-span-filename span)
   :start (eliscript-source-span-start span)
   :end (1+ (eliscript-source-span-start span))
   :line (eliscript-source-span-line span)
   :column (eliscript-source-span-column span)
   :end-line (eliscript-source-span-line span)
   :end-column (1+ (eliscript-source-span-column span))))

(defun eliscript-reader--set-operator-span (span)
  "Return the dispatch-brace operator span within Set SPAN."
  (eliscript-source-span-create
   :filename (eliscript-source-span-filename span)
   :start (eliscript-source-span-start span)
   :end (+ 2 (eliscript-source-span-start span))
   :line (eliscript-source-span-line span)
   :column (eliscript-source-span-column span)
   :end-line (eliscript-source-span-line span)
   :end-column (+ 2 (eliscript-source-span-column span))))

(defun eliscript-reader--queue-operator-span (span)
  "Return the Queue tag operator span within Queue SPAN."
  (eliscript-source-span-create
   :filename (eliscript-source-span-filename span)
   :start (eliscript-source-span-start span)
   :end (+ 6 (eliscript-source-span-start span))
   :line (eliscript-source-span-line span)
   :column (eliscript-source-span-column span)
   :end-line (eliscript-source-span-line span)
   :end-column (+ 6 (eliscript-source-span-column span))))

(defun eliscript-reader--valid-keyword-name-p (name)
  "Return non-nil when NAME is a valid source Keyword name."
  (let ((slash-count (cl-count ?/ name)))
    (and (> (length name) 0)
         (or (= slash-count 0)
             (and (= slash-count 1)
                  (not (= (aref name 0) ?/))
                  (not (= (aref name (1- (length name))) ?/)))))))

(defun eliscript-reader--locate-value (value node)
  "Attach locations from NODE to recursively read VALUE."
  (let ((span (eliscript-reader--node-span node))
        (children (eliscript-reader--node-children node))
        (kind (eliscript-reader--node-kind node)))
    (cond
     ((keywordp value)
      (let ((name (substring (symbol-name value) 1)))
        (unless (eliscript-reader--valid-keyword-name-p name)
          (eliscript-diagnostic-signal
           'eliscript-read-error "ELI-R0001" "reader"
           (eliscript-source-span-filename span) span
           "invalid keyword literal: %s" value))
        (eliscript-form-locate-generated value span)))
     ((eq kind 'map)
      (when (= (% (length children) 2) 1)
        (eliscript-diagnostic-signal
         'eliscript-read-error "ELI-R0001" "reader"
         (eliscript-source-span-filename span) span
         "map literal must contain an even number of forms"))
      (eliscript-form-wrap
       (cons
        (eliscript-form-wrap
         'hash-map (eliscript-reader--map-operator-span span))
        (cl-mapcar #'eliscript-reader--locate-value value children))
       span))
     ((eq kind 'set)
      (eliscript-form-wrap
       (cons
        (eliscript-form-wrap
         'hash-set (eliscript-reader--set-operator-span span))
        (cl-mapcar #'eliscript-reader--locate-value value children))
       span))
     ((eq kind 'queue)
      (eliscript-form-wrap
       (cons
        (eliscript-form-wrap
         'queue (eliscript-reader--queue-operator-span span))
        (cl-mapcar #'eliscript-reader--locate-value (cdr value) children))
       span))
     ((and (vectorp value) (= (length value) (length children)))
      (eliscript-form-wrap
       (apply #'vector
              (cl-mapcar #'eliscript-reader--locate-value
                         (append value nil) children))
       span))
     ((and (proper-list-p value) (= (length value) (length children)))
      (eliscript-form-wrap
       (cl-mapcar #'eliscript-reader--locate-value value children)
       span))
     (t (eliscript-form-locate-generated value span)))))

(defun eliscript-reader--diagnostic-span (filename)
  "Return a one-character diagnostic span at point in FILENAME."
  (let ((start (point)))
    (eliscript-reader--span
     start (min (point-max) (1+ start)) filename)))

(defun eliscript-reader--invalid-syntax-message (source start error-data)
  "Return a stable invalid-reader message for SOURCE at START.

Emacs releases disagree on whether an unknown dispatch reports `#' or its
two-character dispatch prefix.  Eliscript owns that diagnostic contract."
  (if (and (< start (length source))
           (= (aref source start) ?#))
      (format "Invalid read syntax: %S"
              (substring source start (min (length source) (+ start 2))))
    (if (and (< start (length source))
             (= (aref source start) ?\}))
        "Invalid read syntax: \"}\""
      (error-message-string error-data))))

(defun eliscript-read-located-string (source &optional filename)
  "Read every Eliscript form from SOURCE with recursive source locations."
  (with-temp-buffer
    (insert source)
    (set-syntax-table (copy-syntax-table emacs-lisp-mode-syntax-table))
    (modify-syntax-entry ?\{ "(}" (syntax-table))
    (modify-syntax-entry ?\} "){" (syntax-table))
    (goto-char (point-min))
    (let ((emacs-source (eliscript-reader--emacs-source source))
          forms done)
      (while (not done)
        (forward-comment (point-max))
        (if (eobp)
            (setq done t)
          (let ((start (point)))
            (condition-case error-data
                (let* ((result (read-from-string emacs-source (1- start)))
                       (value (car result))
                       (end (cdr result))
                       (node (eliscript-reader--scan-node filename)))
                  (push (eliscript-reader--locate-value value node) forms)
                  (goto-char (1+ end)))
              (end-of-file
               (eliscript-diagnostic-signal
                'eliscript-read-error "ELI-R0001" "reader"
                filename (eliscript-reader--diagnostic-span filename)
                "unexpected end of input"))
              (invalid-read-syntax
               (eliscript-diagnostic-signal
                'eliscript-read-error "ELI-R0001" "reader"
                filename (eliscript-reader--diagnostic-span filename)
                "%s" (eliscript-reader--invalid-syntax-message
                       source (1- start) error-data)))))))
      (nreverse forms))))

(defun eliscript-read-string (source &optional filename)
  "Read every Eliscript form from SOURCE.

FILENAME is used only to improve diagnostics."
  (mapcar #'eliscript-form-strip
          (eliscript-read-located-string source filename)))

(defun eliscript-read-file (filename)
  "Read all Eliscript forms from FILENAME."
  (with-temp-buffer
    (insert-file-contents filename)
    (eliscript-read-string (buffer-string) filename)))

(defun eliscript-read-located-file (filename)
  "Read located Eliscript forms from FILENAME."
  (with-temp-buffer
    (insert-file-contents filename)
    (eliscript-read-located-string (buffer-string) filename)))

(provide 'eliscript-reader)

;;; eliscript-reader.el ends here
