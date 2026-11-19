;;; unicode-case-runtime.el --- Compact owned Unicode tables -*- lexical-binding: t; -*-

(require 'cl-lib)
(require 'subr-x)

(defun eliscript-unicode-case-runtime-rename (form)
  "Translate only the pure numeric table vocabulary in FORM."
  (cond ((consp form) (mapcar #'eliscript-unicode-case-runtime-rename form))
        ((eq form 'word-and) 'bit-and)
        ((and (symbolp form) (string-prefix-p "heap-unicode-" (symbol-name form)))
         (intern (concat "unicode-case-data-" (substring (symbol-name form) 13))))
        (t form)))

(defun eliscript-unicode-case-runtime-cut (form)
  "Return FORM's ordered code-point split, or nil for a leaf."
  (when (and (eq (car-safe form) 'if)
             (memq (car-safe (cadr form)) '(< <=)))
    (let ((condition (cadr form)))
      (unless (and (= (length condition) 3) (eq (cadr condition) 'code)
                   (integerp (caddr condition)))
        (error "Unexpected Unicode range condition: %S" condition))
      (+ (caddr condition) (if (eq (car condition) '<=) 1 0)))))

(defun eliscript-unicode-case-runtime-resolve (form bodies active)
  "Resolve pure table delegation in FORM from BODIES, rejecting cycles."
  (cond
   ((not (consp form)) form)
   ((gethash (car form) bodies)
    (unless (equal (cdr form) '(code))
      (error "Unexpected Unicode table call: %S" form))
    (when (memq (car form) active) (error "Cyclic Unicode table delegation"))
    (eliscript-unicode-case-runtime-resolve
     (gethash (car form) bodies) bodies (cons (car form) active)))
   (t (mapcar (lambda (item)
                (eliscript-unicode-case-runtime-resolve item bodies active)) form))))

(defun eliscript-unicode-case-runtime-formula (form parity code)
  "Describe pure FORM on CODE's interval for PARITY."
  (cond
   ((eq form 'code) '(0 0))
   ((integerp form) (list 1 form))
   ((and (memq (car-safe form) '(+ -)) (= (length form) 3)
         (eq (cadr form) 'code) (integerp (caddr form)))
    (list 2 (* (if (eq (car form) '+) 1 -1) (caddr form))))
   ((eq (car-safe form) 'if)
    (let* ((cut (eliscript-unicode-case-runtime-cut form))
           (condition (cadr form)) (bits (cadr condition))
           (offset (car-safe (cdr-safe bits)))
           (branch
            (if cut (< code cut)
              (unless (and (= (length condition) 3) (eq (car condition) '=)
                           (eq (car-safe bits) 'word-and) (equal (caddr bits) 1)
                           (eq (car-safe offset) '-) (eq (cadr offset) 'code)
                           (integerp (caddr offset)) (memq (caddr condition) '(0 1)))
                (error "Unexpected Unicode parity condition: %S" condition))
              (= (logand (- parity (caddr offset)) 1) (caddr condition)))))
      (eliscript-unicode-case-runtime-formula
       (if branch (nth 2 form) (nth 3 form)) parity code)))
   (t (error "Unexpected Unicode mapping expression: %S" form))))

(defun eliscript-unicode-case-runtime-ranges (body fallback &optional baseline)
  "Extract BODY ranges differing from BASELINE or the FALLBACK formula."
  (let ((cuts (make-hash-table :test 'eql)) ranges)
    (puthash 128 t cuts)
    (puthash #x110000 t cuts)
    (cl-labels
        ((visit (form)
           (when (eq (car-safe form) 'if)
             (let ((cut (eliscript-unicode-case-runtime-cut form)))
               (when (and cut (> cut 128) (< cut #x110000))
                 (puthash cut t cuts)))
             (visit (nth 2 form))
             (visit (nth 3 form)))))
      (visit body)
      (when baseline (visit baseline)))
    ;; Every ordered predicate is constant between consecutive cuts. Resolve
    ;; parity separately, including delegation below a parity branch.
    (let ((boundaries (sort (hash-table-keys cuts) #'<)))
      (while (cdr boundaries)
        (let* ((low (car boundaries)) (high (1- (cadr boundaries)))
               (even (eliscript-unicode-case-runtime-formula body 0 low))
               (odd (eliscript-unicode-case-runtime-formula body 1 low))
               (base-even (if baseline (eliscript-unicode-case-runtime-formula baseline 0 low) fallback))
               (base-odd (if baseline (eliscript-unicode-case-runtime-formula baseline 1 low) fallback)))
          (unless (and (equal even base-even) (equal odd base-odd))
            (if (and ranges (= (1+ (nth 1 (car ranges))) low)
                     (equal (nth 2 (car ranges)) even)
                     (equal (nth 3 (car ranges)) odd))
                (setcar (cdr (car ranges)) high)
              (push (list low high even odd) ranges))))
        (setq boundaries (cdr boundaries))))
    (nreverse ranges)))

(defun eliscript-unicode-case-runtime-ascii (form low high)
  "Prune ordered FORM branches unreachable within ASCII LOW..HIGH."
  (let ((cut (eliscript-unicode-case-runtime-cut form)))
    (cond ((not cut) (eliscript-unicode-case-runtime-rename form))
          ((<= cut low)
           (eliscript-unicode-case-runtime-ascii (nth 3 form) low high))
          ((> cut high)
           (eliscript-unicode-case-runtime-ascii (nth 2 form) low high))
          (t (list 'if (cadr form)
                   (eliscript-unicode-case-runtime-ascii (nth 2 form) low (1- cut))
                   (eliscript-unicode-case-runtime-ascii (nth 3 form) cut high))))))

(defun eliscript-unicode-case-runtime-pack (ranges)
  "Encode sorted RANGES as printable, deterministic unsigned varints."
  (let ((alphabet "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/")
        (previous 127) (patterns (make-hash-table :test 'equal))
        ordered characters)
    (dolist (row ranges)
      (let ((pattern (list (nth 2 row) (nth 3 row))))
        (unless (gethash pattern patterns)
          (puthash pattern (1+ (hash-table-count patterns)) patterns)
          (push pattern ordered))))
    (cl-labels
        ((number (value)
           (unless (and (integerp value) (>= value 0))
             (error "Invalid unsigned Unicode table word: %S" value))
           (while (>= value 32)
             (push (aref alphabet (+ 32 (logand value 31))) characters)
             (setq value (ash value -5)))
           (push (aref alphabet value) characters))
         (signed (value) (number (if (< value 0) (1- (* -2 value)) (* 2 value)))))
      ;; Repeated mapping formulae belong to the table, not every range.
      (number (hash-table-count patterns))
      (dolist (pattern (nreverse ordered))
        (let ((even (car pattern)) (odd (cadr pattern)))
          (number (if (equal even odd) (car even)
                    (+ 16 (car even) (* 4 (car odd)))))
          (signed (cadr even))
          (unless (equal even odd) (signed (cadr odd)))))
      (number (length ranges))
      (dolist (row ranges)
        (number (- (nth 0 row) (1+ previous)))
        (number (- (nth 1 row) (nth 0 row)))
        (number (1- (gethash (list (nth 2 row) (nth 3 row)) patterns)))
        (setq previous (nth 1 row))))
    (concat (nreverse characters))))

(defconst eliscript-unicode-case-runtime-decoder
  '((defun packed-word (state)
      (let ((answer 0) (factor 1) (more t))
        (while more
          (let* ((index (get state :position))
                 (digit (aref packed-digits (aref (get state :source) index))))
            (put state :position (1+ index))
            (setq answer (+ answer (* (bit-and digit 31) factor)))
            (setq factor (* factor 32) more (>= digit 32)))) answer))
    (defun packed-signed (state)
      (let* ((word (packed-word state)) (half (unsigned-bit-shift-right word 1)))
        (if (= (bit-and word 1) 0) half (- -1 half))))
    (defun packed-node (state count)
      (if (= count 0) nil
        (let* ((left-count (unsigned-bit-shift-right count 1))
               (left (packed-node state left-count))
               (low (+ (1+ (get state :end)) (packed-word state)))
               (high (+ low (packed-word state)))
               (pattern (aref (get state :patterns) (packed-word state))))
          (put state :end high)
          (js-object :low low :high high :pattern pattern :left left
		     :right (packed-node state (- (- count left-count) 1))))))
    (defun packed-root (table)
      (let ((tree (get table :tree)))
        (if (not (undefined? tree)) tree
          (let* ((patterns (js-array))
                 (state (js-object :source (get table :source) :position 0 :end 127 :patterns patterns))
                 (count (packed-word state)) (index 0))
            (while (< index count)
              (let* ((tag (packed-word state)) (first (packed-signed state))
                     (second (if (< tag 16) first (packed-signed state))))
                (put patterns index (js-object :tag tag :first first :second second)))
              (setq index (1+ index)))
            (let ((root (packed-node state (packed-word state))))
              (put table :tree root) root)))))
    (defun packed-case (code ascii base override fallback)
      (if (< code 128) (funcall ascii code)
        (let ((value (if (nil? override) undefined (packed-lookup override code undefined))))
          (if (undefined? value) (packed-lookup base code fallback) value))))
    (defun packed-lookup (table code fallback)
      (let ((node (packed-root table)) (answer fallback))
        (while (not (nil? node))
          (cond
           ((< code (get node :low)) (setq node (get node :left)))
           ((> code (get node :high)) (setq node (get node :right)))
           (t
            (when (and (>= code (get node :low)) (<= code (get node :high)))
              (let* ((pattern (get node :pattern)) (tag (get pattern :tag))
                     (odd (and (>= tag 16) (= (bit-and code 1) 1)))
                     (mode (if (< tag 16) tag
                             (if odd (bit-and (unsigned-bit-shift-right tag 2) 3)
                               (bit-and tag 3))))
                     (value (if odd (get pattern :second) (get pattern :first))))
                (setq answer (cond ((= mode 0) code) ((= mode 1) value) (t (+ code value))))))
            (setq node nil)))) answer)))
  "One lazy decoder and balanced lookup over private, own-field nodes.
Packed string indexing and own literal keys avoid new replaceable host calls.")

(defun eliscript-generate-unicode-case-runtime-data (root)
  "Generate compact Eli tables from ROOT's sole maintained Unicode region."
  (let* ((source (expand-file-name "bootstrap/runtime/memory.eli" root))
         (destination (expand-file-name "runtime/unicode-case-data.eli" root))
         (begin "  ;; BEGIN GENERATED UNICODE CASE DATA")
         (end "  ;; END GENERATED UNICODE CASE DATA")
         (tables (make-hash-table :test 'equal))
         (bodies (make-hash-table :test 'eq))
         (ascii (make-hash-table :test 'equal))
         region originals declarations names caches ascii-declarations)
    (with-temp-buffer
      (let ((coding-system-for-read 'utf-8-unix)) (insert-file-contents source))
      (goto-char (point-min))
      (unless (search-forward begin nil t) (error "Unicode case source region is missing"))
      (let ((start (- (point) (length begin))))
        (unless (search-forward end nil t) (error "Unicode case source region is incomplete"))
        (setq region (buffer-substring-no-properties start (point)))))
    (with-temp-buffer
      (insert region) (goto-char (point-min))
      (condition-case nil
          (while t
            (let ((form (read (current-buffer))))
              (unless (and (consp form) (eq (car form) 'defun))
                (error "Unicode case region contains a nonfunction form"))
              (when (string-match-p
                     "\\`heap-unicode-\\(?:\\(?:upper\\|lower\\)-[012]\\|cased\\|case-ignorable\\)-\\(?:17\\|160\\|151\\)\\'"
                     (symbol-name (cadr form)))
                (push form originals)
                (puthash (cadr form) (nth 3 form) bodies))))
        (end-of-file nil)))
    (unless (= (length originals) 24)
      (error "Unicode case source must provide all 24 pure per-version functions"))
    (cl-labels
        ((table-for (ranges)
           (let* ((packed (eliscript-unicode-case-runtime-pack ranges))
                  (cache (gethash packed tables)))
             (unless cache
               (setq cache (intern (format "packed-table-%s" (hash-table-count tables))))
               (puthash packed cache tables)
               (push `(defconst ,cache (js-object :source ,packed :tree undefined)) caches))
             cache))
         (ascii-for (body)
           (let* ((expression (eliscript-unicode-case-runtime-ascii body 0 127))
                  (helper (gethash expression ascii)))
             (unless helper
               (setq helper (intern (format "packed-ascii-%s" (hash-table-count ascii))))
               (puthash expression helper ascii)
               (push `(defun ,helper (code) ,expression) ascii-declarations))
             helper)))
      (dolist (form (nreverse originals))
        (let* ((name (cadr (eliscript-unicode-case-runtime-rename form)))
               (body (eliscript-unicode-case-runtime-resolve
                      (nth 3 form) bodies (list (cadr form))))
               (base-name (intern (replace-regexp-in-string
                                   "-\\(?:17\\|160\\|151\\)\\'" "-17" (symbol-name (cadr form)))))
               (base-body (eliscript-unicode-case-runtime-resolve
                           (gethash base-name bodies) bodies (list base-name)))
               (identity (string-match-p "-\\(?:upper\\|lower\\)-0-" (symbol-name name)))
               (fallback (if identity '(0 0) '(1 0)))
               (cache (table-for (eliscript-unicode-case-runtime-ranges base-body fallback)))
               (differences (unless (eq base-name (cadr form))
                              (eliscript-unicode-case-runtime-ranges body fallback base-body)))
               (override (if differences (table-for differences) nil)))
          (push `(defun ,name (code)
                   (packed-case code ,(ascii-for body) ,cache ,override ,(if identity 'code 0))) declarations)
          (push name names))))
    (let* ((print-length nil) (print-level nil) (print-circle nil)
           (digest (secure-hash 'sha256 (encode-coding-string region 'utf-8-unix)))
           (alphabet "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/")
           (digits (list 'js-object))
           (index 0))
      (while (< index (length alphabet))
        (setq digits (append digits (list (char-to-string (aref alphabet index)) index)))
        (setq index (1+ index)))
      (let ((text
             (concat
              ";; Generated from bootstrap/runtime/memory.eli; do not edit.\n"
              ";; Unicode 15.1 / 16 / 17, Unicode-3.0: https://www.unicode.org/license.txt\n"
              ";; Shared Unicode 17 ranges plus exact profile differences; lazy non-ASCII decoding.\n"
              "(module eliscript.runtime.unicode-case-data\n"
              "  (defconst unicodeCaseDataSourceSha256 " (prin1-to-string digest) ")\n"
              "  " (prin1-to-string `(defconst packed-digits ,digits)) "\n"
              (mapconcat (lambda (form) (concat "  " (prin1-to-string form)))
                         (append eliscript-unicode-case-runtime-decoder
                                 (nreverse caches) (nreverse ascii-declarations)
                                 (nreverse declarations)) "\n")
              "\n  (export unicodeCaseDataSourceSha256 "
              (mapconcat #'symbol-name (nreverse names) " ") "))\n")))
        (make-directory (file-name-directory destination) t)
        (let ((coding-system-for-write 'utf-8-unix))
          (with-temp-file destination (insert text))))
      destination)))

(provide 'unicode-case-runtime)
