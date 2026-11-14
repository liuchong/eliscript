;;; eliscript-emitter.el --- ECMAScript emitter for Eliscript -*- lexical-binding: t; -*-

;;; Commentary:

;; The version-zero emitter compiles a deliberately small Lisp language to
;; readable ECMAScript modules.  It preserves Lisp truthiness: false, null, and
;; undefined are false; every other JavaScript value is true.

;;; Code:

(require 'cl-lib)
(require 'json)
(require 'subr-x)
(require 'eliscript-diagnostic)
(require 'eliscript-parameters)
(require 'eliscript-ir)

(declare-function eliscript-ir-emitter--binding-initializer "eliscript-ir-emitter" (node))
(declare-function eliscript-ir-emitter--children "eliscript-ir-emitter" (node))
(declare-function eliscript-ir-emitter--split-counted-children "eliscript-ir-emitter" (node property))

;; Shared runtime algorithms are maintained in ordinary Eli modules.
(defconst eliscript-emitter--prelude-array-text-names
  '("__eliscript_at" "__eliscript_at_direct"))
(defconst eliscript-emitter--prelude-number-conversion-names
  '("__eliscript_to_number"))
(defconst eliscript-emitter--prelude-numeric-coercion-names
  '("__eliscript_numeric_decrement" "__eliscript_numeric_relation"
    "__eliscript_numeric_sub" "__eliscript_numeric_mul" "__eliscript_numeric_div"
    "__eliscript_numeric_rem" "__eliscript_numeric_and" "__eliscript_numeric_or"
    "__eliscript_numeric_xor" "__eliscript_numeric_shl" "__eliscript_numeric_shr"
    "__eliscript_numeric_ushr" "__eliscript_numeric_neg" "__eliscript_numeric_int32"
    "__eliscript_numeric_uint32" "__eliscript_numeric_not"))
(defconst eliscript-emitter--prelude-imul-names
  '("__eliscript_numeric_imul"))

(defun eliscript-emitter--prelude-import (array-text number-conversion numeric-coercion imul)
  "Import the shared helpers selected by each runtime requirement."
  (let ((names (append (and array-text eliscript-emitter--prelude-array-text-names)
                       (and number-conversion eliscript-emitter--prelude-number-conversion-names)
                       (and numeric-coercion eliscript-emitter--prelude-numeric-coercion-names)
                       (and imul eliscript-emitter--prelude-imul-names))))
    (if names
        (concat "import { " (string-join names ", ") " } from \"eliscript/runtime/prelude.mjs\";\n")
      "")))
(defconst eliscript-emitter--host-identity-token-helper
  "import { createHostIdentityToken as __eliscript_create_host_identity_token } from \"eliscript/runtime/primitives.mjs\";\nconst __eliscript_host_identity_token = __eliscript_create_host_identity_token();\n"
  "Instantiate a private identity allocator implemented in maintained Eli.")
(defconst eliscript-emitter--literal-runtime-import
  "import { hashMap as __eliscript_hash_map, hashSet as __eliscript_hash_set, keyword as __eliscript_keyword, list as __eliscript_list, queue as __eliscript_queue, symbol as __eliscript_symbol, vector as __eliscript_vector } from \"eliscript/runtime/literals.mjs\";\n"
  "Generated import for canonical language literal construction.")
(defconst eliscript-emitter--collection-runtime-import
  "import { count as __eliscript_count, nth as __eliscript_nth } from \"eliscript/runtime/core/collection.mjs\";\n"
  "Generated import for protocol-driven collection operations.")
(defconst eliscript-emitter--list-runtime-import
  "import { cons as __eliscript_cons, first as __eliscript_first, rest as __eliscript_rest } from \"eliscript/runtime/core/list.mjs\";\n"
  "Generated import for canonical persistent List operations.")
(defconst eliscript-emitter--value-runtime-import
  "import { equalValues as __eliscript_equal } from \"eliscript/runtime/core/value.mjs\";\n"
  "Generated import for canonical language value equality.")
(require 'eliscript-symbol)

(defalias 'eliscript-emitter--munge-segment
  #'eliscript-symbol-munge-segment)
(defalias 'eliscript-emitter--binding-name
  #'eliscript-symbol-binding-name)
(defalias 'eliscript-emitter--reference-name
  #'eliscript-symbol-reference-name)

(defvar eliscript-emitter--temporary-counter 0)
(defconst eliscript-emitter--tdz-import
  "import { tdz as __eliscript_tdz_error, immutable as __eliscript_const_error } from \"eliscript/runtime/errors.mjs\";\n")
;; Private module initialization state is separate from public ESM bindings.
(defvar eliscript-emitter--tdz-state nil)
(defconst eliscript-emitter--tdz-read-tag (make-symbol "eliscript-tdz-read"))
(defconst eliscript-emitter--tdz-write-tag (make-symbol "eliscript-tdz-write"))
(defconst eliscript-emitter--tdz-assignment-tag (make-symbol "eliscript-tdz-assignment"))
(defun eliscript-emitter--tdz-ready-name (record)
  (format "__eliscript_tdz_ready_%d" (plist-get record :index)))
(defun eliscript-emitter--tdz-writer-name (record)
  (format "__eliscript_tdz_write_%d" (plist-get record :index)))
(defun eliscript-emitter--tdz-root (name)
  ;; Resolve the established emitted binding namespace, just like the
  ;; self-hosted emitter. Distinct source spellings can share a JS binding.
  ;; Reference mapping also accepts literal symbols, which are never bindings.
  (eliscript-emitter--reference-name
   (intern (car (split-string (symbol-name name) "[./]")))))
(defun eliscript-emitter--tdz-read-text (record reference)
  (if (null record) (eliscript-emitter--reference-name reference)
    (let* ((name (eliscript-emitter--binding-name (plist-get record :name)))
           (text (eliscript-emitter--reference-name reference)))
      ;; Expose the actual lexical binding on the initialized branch. A reader
      ;; call obscures constant constructors and intrinsics from host JITs.
      (concat "(" (eliscript-emitter--tdz-ready-name record) " === true ? " name
              " : __eliscript_tdz_error(" (eliscript-emitter--json-string name) "))"
              (substring text (length name))))))
(defun eliscript-emitter--tdz-write-text (record name value)
  (if record (concat (eliscript-emitter--tdz-writer-name record) "(" value ")")
    (format "(%s = %s)" (eliscript-emitter--binding-name name) value)))
(defun eliscript-emitter--tdz-state-create ()
  "Return empty module-variable initialization analysis state."
  (list :variables nil :declarations (make-hash-table :test #'eq)
        :reads (make-hash-table :test #'eq) :writes (make-hash-table :test #'eq)
        :functions (make-hash-table :test #'equal) :references (make-hash-table :test #'equal)
        :raw (make-hash-table :test #'equal) :exported nil :imports nil
        :sites nil :decisions nil :cursor 0 :position 0 :owner nil))
(defun eliscript-emitter--tdz-declare (state name mutable)
  "Record module variable NAME declared at the current top-level position."
  (let ((record (list :index (length (plist-get state :variables)) :name name :mutable mutable
                      :statement (plist-get state :position) :read nil :write nil)))
    (setf (plist-get state :variables) (append (plist-get state :variables) (list record)))
    record))
(defun eliscript-emitter--tdz-function (state key)
  "Record module function KEY and return its scope entry."
  (puthash key t (plist-get state :functions))
  (list :function key))
(defun eliscript-emitter--tdz-variable-p (record)
  (and record (plist-get record :index) t))
(defun eliscript-emitter--tdz-guarded-p (record)
  (and record (or (plist-get record :read) (plist-get record :write))))
(defun eliscript-emitter--tdz-reference (state record)
  "Record that the current owner can call the function scope entry RECORD."
  (push (plist-get record :function) (gethash (plist-get state :owner) (plist-get state :references))))
(defun eliscript-emitter--tdz-raw (state)
  "Record raw JavaScript, which may call any module function."
  (puthash (plist-get state :owner) t (plist-get state :raw)))
(defun eliscript-emitter--tdz-site (state kind record &optional object)
  "Record access KIND to RECORD, or replay its finalized guard decision.
Form rewriting cannot identify interned symbols, so it walks twice in the
same order; IR walks pass the accessing OBJECT and finalize only once."
  (let ((decisions (plist-get state :decisions)))
    (if decisions
        (let ((cursor (plist-get state :cursor)))
          (setf (plist-get state :cursor) (1+ cursor))
          (aref decisions cursor))
      (push (list kind record (plist-get state :owner) object) (plist-get state :sites))
      t)))
(defun eliscript-emitter--tdz-finalize (state)
  "Guard only accesses that can run before their declaration completes.
A top-level statement runs at its own position. A function can first run
when a statement or earlier function references it; with imports an exported
function can run through a cycle before this module, and raw JavaScript can
call any function. Return the decision of each recorded access in order."
  (let ((functions (plist-get state :functions)) (references (plist-get state :references))
        (raw (plist-get state :raw)) (early (make-hash-table :test #'equal))
        (all most-positive-fixnum) pending)
    (cl-flet ((lower (key index)
                (when (and (gethash key functions)
                           (< index (gethash key early most-positive-fixnum)))
                  (puthash key index early)
                  (push key pending))))
      (when (plist-get state :imports)
        (dolist (key (plist-get state :exported)) (lower key -1)))
      (maphash (lambda (owner keys) (when (integerp owner) (dolist (key keys) (lower key owner)))) references)
      (maphash (lambda (owner _) (when (integerp owner) (setq all (min all owner)))) raw)
      (while pending
        (let* ((key (pop pending)) (index (gethash key early)))
          (when (gethash key raw) (setq all (min all index)))
          (dolist (callee (gethash key references)) (lower callee index)))))
    (mapcar
     (lambda (site)
       (let* ((kind (nth 0 site)) (record (nth 1 site)) (owner (nth 2 site)) (object (nth 3 site))
              (time (if (integerp owner) owner (min all (gethash owner early most-positive-fixnum))))
              (guarded (or (and (eq kind :write) (not (plist-get record :mutable)))
                           (<= time (plist-get record :statement)))))
         (when guarded
           (plist-put record kind t)
           (when object
             (puthash object record (plist-get state (if (eq kind :read) :reads :writes)))))
         guarded))
     (reverse (plist-get state :sites)))))
(defun eliscript-emitter--tdz-prologue (state)
  (let ((records (cl-remove-if-not #'eliscript-emitter--tdz-guarded-p (plist-get state :variables))))
    (when records
      (concat eliscript-emitter--tdz-import
        (mapconcat
          (lambda (record)
            (let* ((ready (eliscript-emitter--tdz-ready-name record))
                   (name (eliscript-emitter--binding-name (plist-get record :name)))
                   (argument (format "__eliscript_tdz_value_%d" (plist-get record :index)))
                   (quoted (eliscript-emitter--json-string name)))
              (concat "var " ready ";\n"
                (when (plist-get record :write)
                  (concat "function " (eliscript-emitter--tdz-writer-name record) "(" argument ") { if (" ready
                          " !== true) __eliscript_tdz_error(" quoted "); "
                          (if (plist-get record :mutable) (concat "return (" name " = " argument ");") "return __eliscript_const_error();") " }\n")))))
          records "")))))



(defun eliscript-emitter--tdz-ground-shadow (pattern scope)
  (let ((pending (list pattern)))
    (while pending
      (let ((item (pop pending)))
        (cond ((and item (symbolp item) (not (keywordp item))
                    (not (string-prefix-p "&" (symbol-name item))))
               (puthash (eliscript-emitter--binding-name item) nil scope))
              ((vectorp item)
               (let ((index (1- (length item))))
                 (while (>= index 0) (push (aref item index) pending) (setq index (1- index))))))))))

(defun eliscript-emitter--tdz-ground-parameters (parameters scope)
  (dolist (parameter parameters) (eliscript-emitter--tdz-ground-shadow parameter scope)))
(defun eliscript-emitter--tdz-ground-predeclare (forms scope state)
  (dolist (form forms)
    (if (and (consp form) (eq (car form) 'module))
        (eliscript-emitter--tdz-ground-predeclare (cddr form) scope state)
      (when (consp form)
        (pcase (car form)
          ((or 'defvar 'defconst)
           (let ((record (eliscript-emitter--tdz-declare state (cadr form) (eq (car form) 'defvar))))
             (puthash form record (plist-get state :declarations))
             (puthash (eliscript-emitter--binding-name (cadr form)) record scope)))
          ((or 'defun 'defn 'defasync)
           (let ((key (eliscript-emitter--binding-name (cadr form))))
             (puthash key (eliscript-emitter--tdz-function state key) scope)))
          ('export
           (dolist (name (cdr form))
             (push (eliscript-emitter--binding-name name) (plist-get state :exported))))
          ((or 'import 'import-portable)
           (setf (plist-get state :imports) t)
           (dolist (name (cddr form))
             (when (and name (symbolp name) (not (keywordp name)))
               (puthash (eliscript-emitter--binding-name name) nil scope))))))
      (setf (plist-get state :position) (1+ (plist-get state :position))))))
(defun eliscript-emitter--tdz-ground-sequence (forms scope)
  (mapcar (lambda (form) (eliscript-emitter--tdz-ground-expression form scope)) forms))
(defun eliscript-emitter--tdz-ground-expression (form scope)
  "Rewrite ordinary TDZ expression trees using explicit continuations."
  (eliscript-emitter--run-depth-plan #'eliscript-emitter--tdz-depth-plan :expression form scope))

(defun eliscript-emitter--tdz-depth-plan (mode value scope)
  (pcase mode
    (:sequence
     (list :children (mapcar (lambda (form) (list :expression form scope)) value)
           (lambda (results) (list :value results))))
    (:bindings
     (let ((remaining (nth 0 value)) (original (nth 1 value)) (reversed (nth 2 value))
           (operator (nth 3 value)) (body (nth 4 value)) (child (nth 5 value)) (sequential (nth 6 value)))
       (if remaining
           (let* ((binding (car remaining)) (parsed (eliscript-emitter--parse-binding binding)) (target (car parsed)))
             (list :children (list (list :expression (cadr parsed) (if sequential child scope)))
                   (lambda (results)
                     (when sequential (eliscript-emitter--tdz-ground-shadow target child))
                     (list :children
                           (list (list :bindings
                                       (list (cdr remaining) original
                                             (cons (if (or (symbolp binding) (vectorp binding)) binding (list target (car results))) reversed)
                                             operator body child sequential) scope))
                           (lambda (tail) (list :value (car tail)))))))
         (unless sequential
           (dolist (binding original)
             (eliscript-emitter--tdz-ground-shadow (car (eliscript-emitter--parse-binding binding)) child)))
         (list :children (list (list :sequence body child))
               (lambda (results) (list :value (cons operator (cons (nreverse reversed) (car results)))))))))
    (:expression
     (cond
      ((vectorp value)
       (list :children (list (list :sequence (append value nil) scope))
             (lambda (results) (list :value (vconcat (car results))))))
      ((and (consp value) (memq (car value) '(let let* loop)))
       (list :children (list (list :bindings (list (cadr value) (cadr value) nil (car value) (cddr value)
                                                  (copy-hash-table scope) (eq (car value) 'let*)) scope))
             (lambda (results) (list :value (car results)))))
      ((and (consp value) (memq (car value) '(lambda fn async)))
       (let ((child (copy-hash-table scope)))
         (eliscript-emitter--tdz-ground-parameters (cadr value) child)
         (list :children (list (list :sequence (cddr value) child))
               (lambda (results) (list :value (cons (car value) (cons (cadr value) (car results))))))))
      ((and (consp value) (not (memq (car value) '(quote js* setq set! try cond js-object))))
       (let* ((operator (car value))
              (fixed (memq operator '(if when unless progn do while recur and or not
                + * - / % mod = /= not= < <= > >= 1+ 1- eq equal null nil? undefined? nullish?
                int32 uint32 imul32 bit-and bit-or bit-xor bit-not bit-shift-left bit-shift-right unsigned-bit-shift-right
                value-type host-identity-token string-code-unit-at string-from-code-unit string-to-number string-to-bigint number-float64-words
                list vector hash-map hash-set queue js-array car cdr cons js-cons nth js-nth aref length js-length __eliscript_array_build
                new print str object-keys object-has? object-assoc __eliscript_arity_error funcall apply get put js-call await throw))))
         (list :children
               (append (unless fixed (list (list :expression operator scope)))
                       (mapcar (lambda (form) (list :expression form scope)) (cdr value)))
               (lambda (results) (list :value (if fixed (cons operator results) results))))))
      (t (list :value (eliscript-emitter--tdz-ground-expression-recursive value scope)))))
    (_ (error "unknown TDZ continuation mode: %S" mode))))

(defun eliscript-emitter--tdz-ground-expression-recursive (form scope)
  (cond
   ((and form (symbolp form) (not (keywordp form)))
    (let ((record (gethash (eliscript-emitter--tdz-root form) scope))
          (state eliscript-emitter--tdz-state))
      (cond
       ((and record (not (eliscript-emitter--tdz-variable-p record)))
        (eliscript-emitter--tdz-reference state record) form)
       ((and record (eliscript-emitter--tdz-site state :read record))
        (list eliscript-emitter--tdz-read-tag record form))
       (t form))))
   ((vectorp form) (vconcat (eliscript-emitter--tdz-ground-sequence (append form nil) scope)))
   ((consp form)
    (let ((operator (car form)) (arguments (cdr form)))
      (pcase operator
        ('quote form)
        ('js* (eliscript-emitter--tdz-raw eliscript-emitter--tdz-state) form)
        ((or 'lambda 'fn 'async)
         (let ((child (copy-hash-table scope)))
           (eliscript-emitter--tdz-ground-parameters (car arguments) child)
           (cons operator (cons (car arguments) (eliscript-emitter--tdz-ground-sequence (cdr arguments) child)))))
        ((or 'let 'let* 'loop)
         (let ((child (copy-hash-table scope)) (sequential (eq operator 'let*)) bindings)
           (dolist (binding (car arguments))
             (let* ((parsed (eliscript-emitter--parse-binding binding))
                    (target (car parsed))
                    (value (eliscript-emitter--tdz-ground-expression (cadr parsed) (if sequential child scope))))
               (push (if (or (symbolp binding) (vectorp binding)) binding (list target value)) bindings)
               (when sequential (eliscript-emitter--tdz-ground-shadow target child))))
           (unless sequential
             (dolist (binding (car arguments))
               (eliscript-emitter--tdz-ground-shadow (car (eliscript-emitter--parse-binding binding)) child)))
           (cons operator (cons (nreverse bindings) (eliscript-emitter--tdz-ground-sequence (cdr arguments) child)))))
        ((or 'setq 'set!)
         (if (eq operator 'set!) (eliscript-emitter--require-arity "set!" arguments 2 2)
           (when (or (null arguments) (= (% (length arguments) 2) 1))
             (eliscript-emitter--fail "setq expects one or more name/value pairs")))
         (let ((pending arguments) pairs original-pairs guarded)
           (while pending
             (let* ((name (pop pending)) (value (pop pending))
                    (rewritten (eliscript-emitter--tdz-ground-expression value scope))
                    (entry (and (symbolp name) (gethash (eliscript-emitter--tdz-root name) scope)))
                    (record (and (eliscript-emitter--tdz-variable-p entry)
                                 (eliscript-emitter--tdz-site eliscript-emitter--tdz-state :write entry)
                                 entry)))
               (when record (setq guarded t))
               (push (list name rewritten) original-pairs)
               (push (list eliscript-emitter--tdz-write-tag record name rewritten) pairs)))
           (if guarded
               (list eliscript-emitter--tdz-assignment-tag operator (nreverse pairs))
             (cons operator (apply #'append (nreverse original-pairs))))))
        ('try
         (cons operator
           (mapcar (lambda (clause)
             (cond
              ((and (consp clause) (eq (car clause) 'catch))
               (let ((child (copy-hash-table scope)))
                 (eliscript-emitter--tdz-ground-shadow (cadr clause) child)
                 (cons 'catch (cons (cadr clause) (eliscript-emitter--tdz-ground-sequence (cddr clause) child)))))
              ((and (consp clause) (eq (car clause) 'finally))
               (cons 'finally (eliscript-emitter--tdz-ground-sequence (cdr clause) scope)))
              (t (eliscript-emitter--tdz-ground-expression clause scope)))) arguments)))
        ('cond
         (cons operator (mapcar (lambda (clause) (eliscript-emitter--tdz-ground-sequence clause scope)) arguments)))
        ('js-object
         (let ((pending arguments) fields)
           (while pending
             (let ((key (pop pending)) (value (pop pending)))
               (push (if (or (symbolp key) (stringp key)) key (eliscript-emitter--tdz-ground-expression key scope)) fields)
               (push (eliscript-emitter--tdz-ground-expression value scope) fields)))
           (cons operator (nreverse fields))))
        (_
         (cons
          (if (memq operator '(if when unless progn do while recur and or not
                + * - / % mod = /= not= < <= > >= 1+ 1- eq equal null nil? undefined? nullish?
                int32 uint32 imul32 bit-and bit-or bit-xor bit-not bit-shift-left bit-shift-right unsigned-bit-shift-right
                value-type host-identity-token string-code-unit-at string-from-code-unit string-to-number string-to-bigint number-float64-words
                list vector hash-map hash-set queue js-array car cdr cons js-cons nth js-nth aref length js-length __eliscript_array_build
                new print str object-keys object-has? object-assoc __eliscript_arity_error funcall apply get put js-call await throw))
              operator (eliscript-emitter--tdz-ground-expression operator scope))
          (eliscript-emitter--tdz-ground-sequence arguments scope))))))
   (t form)))
(defun eliscript-emitter--tdz-ground-top (form scope state)
  (if (and (consp form) (eq (car form) 'module))
      (cons 'module (cons (cadr form) (mapcar (lambda (child) (eliscript-emitter--tdz-ground-top child scope state)) (cddr form))))
    (let ((position (plist-get state :position)))
      (setf (plist-get state :position) (1+ position))
      (setf (plist-get state :owner)
            (if (and (consp form) (memq (car form) '(defun defn defasync)))
                (eliscript-emitter--binding-name (cadr form))
              position))
      (if (not (consp form)) (eliscript-emitter--tdz-ground-expression form scope)
        (pcase (car form)
          ((or 'import 'import-portable 'export) form)
          ((or 'defvar 'defconst)
           (let ((copy (cons (car form) (cons (cadr form) (eliscript-emitter--tdz-ground-sequence (cddr form) scope)))))
             (puthash copy (gethash form (plist-get state :declarations)) (plist-get state :declarations)) copy))
          ((or 'defun 'defn 'defasync)
           (let ((child (copy-hash-table scope)))
             (eliscript-emitter--tdz-ground-parameters (nth 2 form) child)
             (append (list (car form) (cadr form) (nth 2 form)) (eliscript-emitter--tdz-ground-sequence (nthcdr 3 form) child))))
          ('export-default (cons 'export-default (eliscript-emitter--tdz-ground-sequence (cdr form) scope)))
          (_ (eliscript-emitter--tdz-ground-expression form scope)))))))

(defun eliscript-emitter--tdz-ground-rewrite (forms scope state)
  "Rewrite FORMS with only the TDZ guards their accesses require."
  (let ((rewrite (lambda ()
                   (setf (plist-get state :position) 0)
                   (mapcar (lambda (form) (eliscript-emitter--tdz-ground-top form scope state)) forms))))
    (funcall rewrite)
    (setf (plist-get state :decisions) (vconcat (eliscript-emitter--tdz-finalize state)))
    (funcall rewrite)))

(defun eliscript-emitter--fail (format-string &rest arguments)
  "Signal a compiler error using FORMAT-STRING and ARGUMENTS."
  (apply #'eliscript-diagnostic-signal
         'eliscript-compile-error "ELI-E0001" "emission"
         nil nil format-string arguments))

(defun eliscript-emitter--json-string (value)
  "Encode string VALUE as an ECMAScript string literal."
  (cl-labels
      ((encode (text)
         (let* ((encoded (json-serialize text))
                (decoded
           ;; Emacs 30 returns UTF-8 JSON strings as unibyte data. Decode
           ;; before composing them with multibyte emitter fragments.
                 (if (multibyte-string-p encoded) encoded
                   (decode-coding-string encoded 'utf-8-unix)))
                (index 0))
           ;; Jansson uses uppercase escape digits; JSON.stringify uses
           ;; lowercase. Skip escaped backslashes so literal text such as
           ;; "\\u00AB" retains its exact original spelling.
           (while (< index (length decoded))
             (if (= (aref decoded index) ?\\)
                 (if (= (aref decoded (1+ index)) ?u)
                     (progn
                       (dotimes (digit 4)
                         (let* ((at (+ index 2 digit)) (unit (aref decoded at)))
                           (when (<= ?A unit ?F) (aset decoded at (+ unit 32)))))
                       (setq index (+ index 6)))
                   (setq index (+ index 2)))
               (setq index (1+ index))))
           decoded)))
    (if (or (not (stringp value))
            (not (cl-find-if (lambda (unit) (<= #xd800 unit #xdfff)) value)))
        (encode value)
      ;; Emacs can represent raw UTF16 surrogate code units in a string, but
      ;; json-serialize accepts Unicode scalar values only. JSON.stringify
      ;; emits isolated halves as lowercase escapes and paired halves as one
      ;; scalar. Preserve the serializer's rejection of non-Unicode Emacs
      ;; characters rather than treating them as additional UTF16 code units.
      (when (cl-find-if (lambda (unit) (> unit #x10ffff)) value)
        (encode value))
      (with-temp-buffer
        (insert "\"")
        (let ((start 0) (index 0) (size (length value)))
          (while (< index size)
            (let ((unit (aref value index)))
              (if (<= #xd800 unit #xdfff)
                  (progn
                    (when (< start index)
                      (insert (substring (encode (substring value start index)) 1 -1)))
                    (if (and (<= unit #xdbff) (< (1+ index) size)
                             (<= #xdc00 (aref value (1+ index)) #xdfff))
                        (let ((point (+ #x10000 (ash (- unit #xd800) 10)
                                        (- (aref value (1+ index)) #xdc00))))
                          (insert (substring (encode (char-to-string point)) 1 -1))
                          (setq index (+ index 2)))
                      (insert (format "\\u%04x" unit))
                      (setq index (1+ index)))
                    (setq start index))
                (setq index (1+ index)))))
          (when (< start size)
            (insert (substring (encode (substring value start size)) 1 -1))))
        (insert "\"")
        (buffer-string)))))

(defun eliscript-emitter--fresh-name ()
  "Return a fresh internal ECMAScript identifier."
  (setq eliscript-emitter--temporary-counter
        (1+ eliscript-emitter--temporary-counter))
  (format "__eliscript_value_%d" eliscript-emitter--temporary-counter))

(defun eliscript-emitter--indent (text &optional level)
  "Indent every non-empty line in TEXT by LEVEL two-space units."
  (let ((prefix (make-string (* 2 (or level 1)) ?\s)))
    (mapconcat (lambda (line)
                 (if (string-empty-p line) line (concat prefix line)))
               (split-string text "\n")
               "\n")))

(defun eliscript-emitter--require-arity (name arguments minimum &optional maximum)
  "Validate that NAME receives an allowed number of ARGUMENTS."
  (let ((count (length arguments)))
    (when (or (< count minimum)
              (and maximum (> count maximum)))
      (eliscript-emitter--fail
       "%s expects %s argument%s, got %d"
       name
       (if (and maximum (= minimum maximum))
           (number-to-string minimum)
         (format "%d%s" minimum
                 (if maximum (format "..%d" maximum) "+")))
       (if (and maximum (= minimum maximum) (= minimum 1)) "" "s")
       count))))

(defun eliscript-emitter--emit-arguments (arguments)
  "Emit comma-separated ARGUMENTS."
  (mapconcat #'eliscript-emitter-emit-expression arguments ", "))

(defun eliscript-emitter--qualified-apply-callee-p (form)
  "Whether FORM reads a qualified apply property in call position.
Keep references themselves unchanged: custom namespace objects and aliases
must retain their ordinary property identity and receiver."
  (let ((reference (if (and (consp form)
                            (eq (car form) eliscript-emitter--tdz-read-tag))
                       (nth 2 form) form)))
    (and (symbolp reference)
         (string-match-p "[./]apply[./]*\\'" (symbol-name reference)))))

(defun eliscript-emitter--emit-callee (form)
  "Emit FORM in a position where ECMAScript expects a callable value."
  (let ((output (eliscript-emitter-emit-expression form)))
    (cond
     ((eliscript-emitter--qualified-apply-callee-p form)
      ;; The already emitted reference retains its lexical/TDZ root lookup.
      ;; Capture the actual property before arguments, then let the shared
      ;; dispatcher recognize intrinsic Reflect.apply by identity only.
      (format "__eliscript_at(%s, \"apply\")" (substring output 0 -6)))
     ((symbolp form) output)
     (t (format "(%s)" output)))))

(defun eliscript-emitter--binding-pattern-p (form)
  "Return non-nil when FORM is a vector binding pattern."
  (vectorp (eliscript-form-value form)))

(defun eliscript-emitter--emit-binding-target (form)
  "Emit symbol or vector binding FORM as JavaScript syntax."
  (let ((value (eliscript-form-value form)))
    (cond
     ((and value (symbolp value))
      (eliscript-emitter--binding-name value))
     ((vectorp value)
      (let (parts rest-next last-hole)
        (dolist (element (append value nil))
          (let ((element-value (eliscript-form-value element)))
            (cond
             ((eq element-value '&rest) (setq rest-next t))
             (t
              (setq last-hole (null element-value))
              (push
               (if rest-next
                   (concat "..."
                           (eliscript-emitter--emit-binding-target element))
                 (if last-hole
                     ""
                   (eliscript-emitter--emit-binding-target element)))
               parts)
              (setq rest-next nil)))))
        (format "[%s%s]"
                (string-join (nreverse parts) ", ")
                (if last-hole "," ""))))
     (t (eliscript-emitter--fail
         "invalid binding pattern: %S" (eliscript-form-strip form))))))

(defun eliscript-emitter--boolean-p (form)
  "Whether FORM is proven to return a JavaScript boolean."
  (or (memq form '(t false))
      (and (consp form)
           (or (and (memq (car form) '(funcall if))
                    (eliscript-emitter--primitive-boolean-expression-p form))
               (and (eq (car form) 'js*) (= (length form) 2)
                    (stringp (cadr form))
                    (string-match-p "\\`!![A-Za-z_$][A-Za-z0-9_$]*\\'" (string-trim (cadr form))))
               (memq (car form)
                     '(not = /= not= < <= > >= eq equal nil? undefined? null nullish?))
               (and (memq (car form) '(and or)) (cdr form)
                    (cl-every #'eliscript-emitter--boolean-p (cdr form)))))))

(defun eliscript-emitter--emit-test (form)
  "Emit conditions directly, without changing value-context short circuits."
  (let ((pending (list (cons :form form))) parts)
    (while pending
      (let* ((task (pop pending)) (value (cdr task)))
        (if (eq (car task) :text) (push value parts)
          (cond
           ((and (consp value) (proper-list-p value) (memq (car value) '(and or)))
            (let ((arguments (cdr value)) (operator (if (eq (car value) 'and) " && " " || ")))
              (if (null arguments) (push (if (eq (car value) 'and) "true" "false") parts)
                (push (cons :text ")") pending)
                (let ((rest (reverse arguments)))
                  (while rest
                    (push (cons :form (pop rest)) pending)
                    (when rest (push (cons :text operator) pending))))
                (push (cons :text "(") pending))))
           ((and (consp value) (proper-list-p value) (eq (car value) 'not) (= (length value) 2))
            (push (cons :text ")") pending)
            (push (cons :form (cadr value)) pending)
            (push (cons :text "!(") pending))
           (t
            (let ((output (eliscript-emitter-emit-expression value)))
              (push (if (eliscript-emitter--boolean-p value) output
                      (concat "__eliscript_truthy(" output ")")) parts)))))))
    (apply #'concat (nreverse parts))))

(defun eliscript-emitter--context-sequential-safe-p (bindings &optional parallel)
  "Whether parsed BINDINGS can share a scope without observing a TDZ.
With PARALLEL, every initializer must be independent of every new binding."
  (when (if parallel bindings (> (length bindings) 1))
    (let ((names (make-hash-table :test #'equal)) (index 0) (safe t))
      (dolist (binding bindings)
        (let ((name (eliscript-emitter--binding-name (car binding))))
          (if (gethash name names) (setq safe nil)
            (puthash name (1+ index) names)))
        (setq index (1+ index)))
      (cl-labels
          ((walk-pattern (pattern)
             (cond
              ((vectorp pattern)
               (mapc #'walk-pattern (append pattern nil)))
              ((eliscript-binding-map-pattern-p pattern)
               (let ((spec (eliscript-binding-map-spec
                            pattern (lambda (_form message)
                                      (eliscript-emitter--fail "%s" message)))))
                 (dolist (entry (plist-get spec :entries))
                   (walk-pattern (plist-get entry :target))
                   (unless (memq (plist-get entry :key-kind) '(keys strs syms))
                     (walk (plist-get entry :key)))
                   (when (plist-member entry :default)
                     (walk (plist-get entry :default))))))))
           (walk-bindings (nested)
             (dolist (binding nested)
               (if (or (symbolp binding) (vectorp binding)
                       (eliscript-binding-map-pattern-p binding))
                   (walk-pattern binding)
                 (walk-pattern (car binding))
                 (walk (cadr binding)))))
           (walk (form)
             ;; Match references and assignment targets, not syntax names.
             ;; References inside a shadowing function remain conservative, as
             ;; in the independent IR proof; declaration names do not count.
             (when safe
               (cond
                ((and (symbolp form) form (not (keywordp form))
                      (not (memq form '(t false undefined))))
                 (let* ((name (eliscript-emitter--reference-name form))
                        (position (gethash (car (split-string name "\\.")) names)))
                   (when (and position (or parallel (> position index))) (setq safe nil))))
                ((vectorp form) (mapc #'walk (append form nil)))
                ((consp form)
                 (let ((operator (car form)) (arguments (cdr form)))
                   (cond
                    ((and (eq operator 'funcall)
                          (eliscript-emitter--primitive-invocation-operator arguments t))
                     ;; The closed a/b arrow has no free binding roots. Its
                     ;; operands still participate in the complete scope proof.
                     (mapc #'walk (cdr arguments)))
                    ((eq operator 'js*) (setq safe nil))
                    ((eq operator 'quote) nil)
                    ((memq operator '(lambda fn async))
                     (dolist (parameter
                              (eliscript-parameters-parse
                               (car arguments)
                               (lambda (_form message)
                                 (eliscript-emitter--fail "%s" message))))
                       (walk-pattern (eliscript-parameter-form parameter)))
                     (mapc #'walk (cdr arguments)))
                    ((memq operator '(let let* loop))
                     (walk-bindings (car arguments))
                     (mapc #'walk (cdr arguments)))
                    ((eq operator 'try)
                     (dolist (clause arguments)
                       (pcase (car-safe clause)
                         ('catch (walk-pattern (cadr clause))
                                 (mapc #'walk (cddr clause)))
                         ('finally (mapc #'walk (cdr clause)))
                         (_ (walk clause)))))
                    ((eq operator 'cond)
                     (dolist (clause arguments) (mapc #'walk clause)))
                    ((eq operator 'js-object)
                     (while arguments
                       (let ((key (pop arguments)) (value (pop arguments)))
                         (unless (or (keywordp key) (stringp key) (symbolp key))
                           (walk key))
                         (walk value))))
                    ((memq operator
                           '(await throw if when unless progn do recur setq set!
                             while and or vector hash-map hash-set queue list js-array
                             not + * - / % mod = /= not= < <= > >= 1+ 1-
                             int32 uint32 imul32 bit-and bit-or bit-xor bit-not
                             bit-shift-left bit-shift-right unsigned-bit-shift-right
                             value-type host-identity-token string-code-unit-at
                             string-from-code-unit string-to-number string-to-bigint
                             number-float64-words eq equal null nil? undefined? nullish?
                             car cdr cons js-cons nth js-nth aref length js-length __eliscript_array_build
                             object-keys object-has? object-assoc __eliscript_arity_error
                             get put js-call new print str funcall apply))
                     (mapc #'walk arguments))
                    (t (mapc #'walk form)))))))))
        (setq index 0)
        (dolist (binding bindings)
          (walk (cadr binding))
          (setq index (1+ index))))
      safe)))

(defun eliscript-emitter--emit-context-let (bindings body sequential returning)
  "Emit parsed simple BINDINGS and BODY without a closure.
Keep initializer and binding scopes separate, including sequential shadowing."
  (if (null bindings)
      (if returning (eliscript-emitter--emit-returning-body body)
        (eliscript-emitter--emit-statement-body body))
    (if (eliscript-emitter--context-sequential-safe-p bindings (not sequential))
        (concat "{\n" (eliscript-emitter--indent
         (string-join
          (append (mapcar (lambda (binding)
                            (concat "let " (eliscript-emitter--emit-binding-target (car binding))
                                    " = " (eliscript-emitter-emit-expression (cadr binding)) ";")) bindings)
                  (list (if returning (eliscript-emitter--emit-returning-body body)
                          (eliscript-emitter--emit-statement-body body)))) "\n")) "\n}")
    (let* ((group (if sequential (list (car bindings)) bindings))
           (temporaries (mapcar (lambda (_) (eliscript-emitter--fresh-name)) group))
           initializers declarations)
      (cl-mapc
       (lambda (binding temporary)
         (push (format "const %s = %s;" temporary
                       (eliscript-emitter-emit-expression (cadr binding)))
               initializers)) group temporaries)
      (cl-mapc
       (lambda (binding temporary)
         (push (format "let %s = %s;"
                       (eliscript-emitter--emit-binding-target (car binding)) temporary)
               declarations)) group temporaries)
      (push (eliscript-emitter--emit-context-let
             (and sequential (cdr bindings)) body sequential returning) declarations)
      (concat "{\n"
              (eliscript-emitter--indent
               (string-join
                (append (nreverse initializers)
                        (list (concat "{\n"
                                      (eliscript-emitter--indent
                                       (string-join (nreverse declarations) "\n"))
                                      "\n}"))) "\n"))
              "\n}")))))

(defun eliscript-emitter--emit-context-cond (clauses returning)
  "Emit CLAUSES as statements or RETURNING values."
  (let ((result (if returning "return null;" "")) frames)
    (while clauses
      (let* ((clause (pop clauses)) (test (car clause)) (body (cdr clause)))
        (if (eq test t)
            (setq result (if returning (eliscript-emitter--emit-returning-body body)
                           (eliscript-emitter--emit-statement-body body))
                  clauses nil)
          (let ((condition (eliscript-emitter--emit-test test))
                (consequent (if returning (eliscript-emitter--emit-returning-body body)
                              (eliscript-emitter--emit-statement-body body))))
            (push (list condition consequent) frames)))))
    (dolist (frame frames)
      (setq result (concat "if (" (car frame) ") {\n"
                           (eliscript-emitter--indent (cadr frame))
                           "\n} else {\n" (eliscript-emitter--indent result) "\n}")))
    result))

(defun eliscript-emitter--run-depth-plan (adapter mode value options)
  "Run ADAPTER's emission continuations without nesting host Lisp calls.
Children finish in source order; a continuation may schedule another stage
when temporary allocation or binding setup must occur between child groups."
  (let* ((result (list nil))
         (pending (list (list :visit mode value options result))))
    (while pending
      (let ((job (pop pending)))
        (pcase (car job)
          (:visit
           (push (list :plan (funcall adapter (nth 1 job) (nth 2 job) (nth 3 job))
                       (nth 4 job)) pending))
          (:plan
           (let ((plan (nth 1 job)) (output (nth 2 job)))
             (if (eq (car plan) :value)
                 (setcar output (nth 1 plan))
               (let* ((specs (nth 1 plan))
                      (cells (mapcar (lambda (_spec) (list nil)) specs)))
                 (push (list :combine (nth 2 plan) cells output) pending)
                 (let ((pairs (cl-mapcar #'cons specs cells)))
                   (dolist (pair (nreverse pairs))
                     (let ((spec (car pair)))
                       (push (list :visit (nth 0 spec) (nth 1 spec) (nth 2 spec) (cdr pair))
                             pending))))))))
          (:combine
           (push (list :plan (funcall (nth 1 job) (mapcar #'car (nth 2 job)))
                       (nth 3 job)) pending)))))
    (car result)))

(defun eliscript-emitter--emit-context (form returning)
  "Emit FORM using explicit continuations for ordinary conditional trees."
  (if (and (consp form) (memq (car form) '(if let let* progn do))
           (not (eliscript-emitter--contains-await-p form)))
      (eliscript-emitter--run-depth-plan #'eliscript-emitter--depth-plan :context form returning)
    (eliscript-emitter--emit-context-recursive form returning)))

(defun eliscript-emitter--depth-plan (mode value options)
  "Describe an ordinary form emission step without recursing into its tree."
  (pcase mode
    (:value (list :value value))
    (:test
     (cond
      ((and (consp value) (proper-list-p value) (memq (car value) '(and or)))
       (let ((and-p (eq (car value) 'and)))
         (if (null (cdr value)) (list :value (if and-p "true" "false"))
           (list :children (mapcar (lambda (form) (list :test form nil)) (cdr value))
                 (lambda (results) (list :value (concat "(" (string-join results (if and-p " && " " || ")) ")")))))))
      ((and (consp value) (proper-list-p value) (eq (car value) 'not) (= (length value) 2))
       (list :children (list (list :test (cadr value) nil))
             (lambda (results) (list :value (concat "!(" (car results) ")")))))
      (t (list :children (list (list :expression value nil))
               (lambda (results) (list :value (if (eliscript-emitter--boolean-p value) (car results)
                                                (concat "__eliscript_truthy(" (car results) ")"))))))))
    (:expression
     (if (and (consp value) (eq (car value) 'if))
         (let ((arguments (cdr value)))
           (eliscript-emitter--require-arity "if" arguments 2 3)
           (list :children (list (list :test (nth 0 arguments) nil)
                                 (list :expression (nth 1 arguments) nil)
                                 (list :expression (nth 2 arguments) nil))
                 (lambda (results)
                   (list :value (format "(%s ? %s : %s)"
                                         (nth 0 results)
                                         (nth 1 results) (nth 2 results))))))
       (list :value (eliscript-emitter--emit-expression-recursive value))))
    (:body
     (if (null value) (list :value (if options "return null;" ""))
       (let ((remaining value) specs)
         (while remaining
           (push (list :context (car remaining) (and options (null (cdr remaining)))) specs)
           (setq remaining (cdr remaining)))
         (list :children (nreverse specs)
               (lambda (results) (list :value (string-join results "\n")))))))
    (:declaration
     (let ((name (eliscript-emitter--emit-binding-target (car value))))
       (list :children (list (list :expression (cadr value) nil))
             (lambda (results) (list :value (concat "let " name " = " (car results) ";"))))))
    (:context-let
     (let ((bindings (nth 0 value)) (body (nth 1 value)) (sequential (nth 2 value)))
       (cond
        ((null bindings) (list :children (list (list :body body options))
                               (lambda (results) (list :value (car results)))))
        ((eliscript-emitter--context-sequential-safe-p bindings (not sequential))
         (list :children (append (mapcar (lambda (binding) (list :declaration binding nil)) bindings)
                                 (list (list :body body options)))
               (lambda (results)
                 (list :value (concat "{\n" (eliscript-emitter--indent (string-join results "\n")) "\n}")))))
        (t
         (let* ((group (if sequential (list (car bindings)) bindings))
                (temporaries (mapcar (lambda (_binding) (eliscript-emitter--fresh-name)) group)))
           (list :children (mapcar (lambda (binding) (list :expression (cadr binding) nil)) group)
                 (lambda (results)
                   (let ((initializers (cl-mapcar (lambda (temporary text) (format "const %s = %s;" temporary text)) temporaries results))
                         (declarations (cl-mapcar (lambda (binding temporary)
                                                  (format "let %s = %s;" (eliscript-emitter--emit-binding-target (car binding)) temporary)) group temporaries)))
                     (list :children (list (list :context-let (list (and sequential (cdr bindings)) body sequential) options))
                           (lambda (tail)
                             (list :value
                                   (concat "{\n" (eliscript-emitter--indent
                                                   (string-join
                                                    (append initializers
                                                            (list (concat "{\n" (eliscript-emitter--indent
                                                                                 (string-join (append declarations tail) "\n")) "\n}"))) "\n")) "\n}"))))))))))))
    (:context
     (let ((operator (and (consp value) (car value))) (arguments (and (consp value) (cdr value))))
       (cond
        ((eliscript-emitter--contains-await-p value)
         (list :value (eliscript-emitter--emit-context-recursive value options)))
        ((memq operator '(progn do))
         (list :children (list (list :body arguments options))
               (lambda (results) (list :value (car results)))))
        ((eq operator 'if)
         (list :children
               (list (list :test (nth 0 arguments) nil)
                     (list :context (nth 1 arguments) options)
                     (if (nthcdr 2 arguments) (list :context (nth 2 arguments) options)
                       (list :value (if options "return null;" "") nil)))
               (lambda (results)
                 (list :value
                       (concat "if (" (nth 0 results) ") {\n"
                               (eliscript-emitter--indent (nth 1 results)) "\n}"
                               (if (or options (nthcdr 2 arguments))
                                   (concat " else {\n" (eliscript-emitter--indent (nth 2 results)) "\n}") ""))))))
        ((and (memq operator '(let let*))
              (let ((parsed (mapcar #'eliscript-emitter--parse-binding (car arguments))))
                (cl-every (lambda (binding) (symbolp (car binding))) parsed)))
         (list :children
               (list (list :context-let
                           (list (mapcar #'eliscript-emitter--parse-binding (car arguments))
                                 (cdr arguments) (eq operator 'let*)) options))
               (lambda (results) (list :value (car results)))))
        (t (list :value (eliscript-emitter--emit-context-recursive value options))))))
    (_ (error "unknown form emission continuation mode: %S" mode))))

(defun eliscript-emitter--emit-context-recursive (form returning)
  "Emit FORM as a statement or a RETURNING body value."
  (let ((operator (and (consp form) (car form)))
        (arguments (and (consp form) (cdr form))))
    (cond
     ((eliscript-emitter--contains-await-p form)
      (concat (if returning "return " "") (eliscript-emitter-emit-expression form) ";"))
     ((memq operator '(progn do))
      (if returning (eliscript-emitter--emit-returning-body arguments)
        (eliscript-emitter--emit-statement-body arguments)))
     ((eq operator 'if)
      (concat "if (" (eliscript-emitter--emit-test (car arguments)) ") {\n"
              (eliscript-emitter--indent
               (eliscript-emitter--emit-context (nth 1 arguments) returning))
              "\n}"
              (if (or returning (nthcdr 2 arguments))
                  (concat " else {\n" (eliscript-emitter--indent
                   (if (nthcdr 2 arguments)
                       (eliscript-emitter--emit-context (nth 2 arguments) returning)
                     "return null;")) "\n}") "")))
     ((memq operator '(when unless))
      (concat "if ("
              (if (eq operator 'when) (eliscript-emitter--emit-test (car arguments))
                (concat "(!" (eliscript-emitter--emit-test (car arguments)) ")"))
              ") {\n"
              (eliscript-emitter--indent
               (if returning (eliscript-emitter--emit-returning-body (cdr arguments))
                 (eliscript-emitter--emit-statement-body (cdr arguments))))
              "\n}" (if returning " else {\n  return null;\n}" "")))
     ((eq operator 'cond)
      (eliscript-emitter--emit-context-cond arguments returning))
     ((eq operator 'while)
      (eliscript-emitter--require-arity "while" arguments 1)
      (concat "while (" (eliscript-emitter--emit-test (car arguments)) ") {\n"
              (eliscript-emitter--indent
               (eliscript-emitter--emit-statement-body (cdr arguments)))
              "\n}" (if returning "\nreturn null;" "")))
     ((and (memq operator '(let let*))
           (let ((parsed (mapcar #'eliscript-emitter--parse-binding (car arguments))))
             (cl-every (lambda (binding) (symbolp (car binding))) parsed)))
      (eliscript-emitter--emit-context-let
       (mapcar #'eliscript-emitter--parse-binding (car arguments))
       (cdr arguments) (eq operator 'let*) returning))
     (t (concat (if returning "return " "")
                (eliscript-emitter-emit-expression form) ";")))))

(defun eliscript-emitter--emit-returning-body (forms)
  "Emit FORMS as a block body that returns its final value."
  (if (null forms) "return null;"
    (string-join
     (append (mapcar (lambda (form) (eliscript-emitter--emit-context form nil))
                     (butlast forms))
             (list (eliscript-emitter--emit-context (car (last forms)) t)))
     "\n")))

(defun eliscript-emitter--emit-statement-body (forms)
  "Emit FORMS as statements whose values are discarded."
  (mapconcat (lambda (form) (eliscript-emitter--emit-context form nil)) forms "\n"))

(defun eliscript-emitter--some-form (forms predicate &optional excluded)
  "Find PREDICATE in source preorder without recursive host calls.
EXCLUDED operators prune their complete forms after the node predicate."
  (let ((pending (list (cons :sequence forms))) found)
    (while (and pending (not found))
      (let* ((job (pop pending)) (value (cdr job)))
        (if (eq (car job) :sequence)
            (when value
              (unless (consp value) (signal 'wrong-type-argument (list 'listp value)))
              (push (cons :sequence (cdr value)) pending)
              (push (cons :node (car value)) pending))
          (setq found (funcall predicate value))
          (unless found
            (cond ((vectorp value) (push (cons :sequence (append value nil)) pending))
                  ((and (consp value) (not (memq (car value) excluded)))
                   (push (cons :sequence value) pending)))))))
    found))

(defun eliscript-emitter--contains-await-p (form)
  "Return non-nil when FORM contains await outside nested functions."
  (eliscript-emitter--some-form (list form)
    (lambda (node) (and (consp node) (eq (car node) 'await))) '(lambda fn async quote)))

(defun eliscript-emitter--emit-iife
    (parameters body arguments asynchronous)
  "Emit an IIFE with PARAMETERS, BODY, ARGUMENTS, and ASYNCHRONOUS mode."
  (if asynchronous
      (format "(await (async (%s) => {\n%s\n})(%s))"
              parameters body arguments)
    (format "((%s) => {\n%s\n})(%s)" parameters body arguments)))

(defun eliscript-emitter--emit-do (forms)
  "Emit FORMS as one value-producing expression."
  (pcase (length forms)
    (0 "null")
    (1 (eliscript-emitter-emit-expression (car forms)))
    (_ (eliscript-emitter--emit-iife
        ""
        (eliscript-emitter--indent
         (eliscript-emitter--emit-returning-body forms))
        ""
        (eliscript-emitter--contains-await-p forms)))))

(defun eliscript-emitter--parse-binding (binding)
  "Return the name and initializer represented by BINDING."
  (cond
   ((or (symbolp binding) (vectorp binding)) (list binding nil))
   ((and (listp binding) (<= 1 (length binding)) (<= (length binding) 2)
         (or (symbolp (car binding)) (vectorp (car binding))))
    (list (car binding) (cadr binding)))
   (t (eliscript-emitter--fail "invalid let binding: %S" binding))))

(defun eliscript-emitter--emit-let (arguments sequential)
  "Emit let ARGUMENTS, using sequential semantics when SEQUENTIAL is non-nil."
  (eliscript-emitter--require-arity (if sequential "let*" "let") arguments 1)
  (let ((bindings (car arguments))
        (body (cdr arguments)))
    (unless (listp bindings)
      (eliscript-emitter--fail "let bindings must be a list"))
    (if sequential
        (if (null bindings)
            (eliscript-emitter--emit-do body)
          (eliscript-emitter--emit-let
           (list (list (car bindings))
                 (cons 'let* (cons (cdr bindings) body)))
           nil))
      (let* ((parsed (mapcar #'eliscript-emitter--parse-binding bindings))
             (names (mapcar (lambda (item)
                              (eliscript-emitter--emit-binding-target
                               (car item)))
                            parsed))
             (values (mapcar (lambda (item)
                               (if (and (null (cadr item))
                                        (eliscript-emitter--binding-pattern-p
                                         (car item)))
                                   "[]"
                                 (eliscript-emitter-emit-expression
                                  (cadr item))))
                             parsed)))
        (eliscript-emitter--emit-iife
         (string-join names ", ")
         (eliscript-emitter--indent
          (eliscript-emitter--emit-returning-body body))
         (string-join values ", ")
         (eliscript-emitter--contains-await-p body))))))

(defun eliscript-emitter--emit-function (arguments body &optional asynchronous)
  "Emit a function with ARGUMENTS and BODY.

Prefix the function with `async' when ASYNCHRONOUS is non-nil."
  (let ((parameters
         (eliscript-parameters-parse
          arguments
          (lambda (_form message) (eliscript-emitter--fail "%s" message)))))
    (format "(%s(%s) => {\n%s\n})"
            (if asynchronous "async " "")
            (mapconcat #'eliscript-emitter--emit-parameter parameters ", ")
            (eliscript-emitter--indent
             (eliscript-emitter--emit-function-body parameters body)))))

(defun eliscript-emitter--contains-function-recur-p (form)
  "Return non-nil when FORM recurs outside nested functions or loops."
  (eliscript-emitter--some-form (list form)
    (lambda (node) (and (consp node) (eq (car node) 'recur))) '(lambda fn async loop quote)))

(defun eliscript-emitter--emit-rebinding-target (binding temporary)
  "Assign TEMPORARY to mutable BINDING, including a vector pattern."
  (let ((target (eliscript-emitter--emit-binding-target binding)))
    (if (eliscript-emitter--binding-pattern-p binding)
        (format "(%s = %s);" target temporary)
      (format "%s = %s;" target temporary))))

(defun eliscript-emitter--emit-recur-tail (arguments target)
  "Emit tail recur ARGUMENTS for TARGET."
  (let ((bindings (plist-get target :bindings)))
    (unless (= (length arguments) (length bindings))
      (eliscript-emitter--fail
       "recur expects %d arguments, got %d"
       (length bindings) (length arguments)))
    (let ((temporaries
           (mapcar (lambda (_argument) (eliscript-emitter--fresh-name))
                   arguments))
          parts)
      (cl-mapc
       (lambda (temporary argument)
         (push (format "const %s = %s;"
                       temporary
                       (eliscript-emitter-emit-expression argument))
               parts))
       temporaries arguments)
      (cl-mapc
       (lambda (binding temporary)
         (push (eliscript-emitter--emit-rebinding-target binding temporary)
               parts))
       bindings temporaries)
      (push (format "continue %s;" (plist-get target :label)) parts)
      (string-join (nreverse parts) "\n"))))

(defun eliscript-emitter--emit-tail-body (forms target)
  "Emit FORMS so their final value returns or recurs to TARGET."
  (if (null forms)
      "return null;"
    (string-join
     (append
      (mapcar
       (lambda (form)
         (concat (eliscript-emitter-emit-expression form) ";"))
       (butlast forms))
      (list (eliscript-emitter--emit-tail-form (car (last forms)) target)))
     "\n")))

(defun eliscript-emitter--emit-tail-cond (clauses target)
  "Emit conditional CLAUSES in recur-aware tail position for TARGET."
  (let ((result "return null;") frames)
    (while clauses
      (let ((clause (pop clauses)))
      (unless (and (listp clause) clause)
        (eliscript-emitter--fail "cond clause must be a non-empty list"))
      (let ((test (car clause))
            (body (cdr clause)))
        (if (eq test t)
            (setq result (eliscript-emitter--emit-tail-body body target) clauses nil)
          (let ((condition (eliscript-emitter-emit-expression test))
                (consequent (eliscript-emitter--emit-tail-body body target)))
            (push (list condition consequent) frames))))))
    (dolist (frame frames)
      (setq result (format "if (__eliscript_truthy(%s)) {\n%s\n} else {\n%s\n}"
                           (car frame) (eliscript-emitter--indent (cadr frame))
                           (eliscript-emitter--indent result))))
    result))

(defun eliscript-emitter--emit-tail-let (arguments sequential target)
  "Emit lexical ARGUMENTS in tail position for TARGET."
  (eliscript-emitter--require-arity (if sequential "let*" "let") arguments 1)
  (let ((bindings (car arguments))
        (body (cdr arguments))
        parts)
    (unless (listp bindings)
      (eliscript-emitter--fail "let bindings must be a list"))
    (let ((parsed (mapcar #'eliscript-emitter--parse-binding bindings)))
      (if sequential
          (dolist (binding parsed)
            (let ((target-form (car binding))
                  (initializer (cadr binding)))
              (push
               (format "let %s = %s;"
                       (eliscript-emitter--emit-binding-target target-form)
                       (if initializer
                           (eliscript-emitter-emit-expression initializer)
                         (if (eliscript-emitter--binding-pattern-p target-form)
                             "[]" "null")))
               parts)))
        (let ((temporaries
               (mapcar (lambda (_binding) (eliscript-emitter--fresh-name))
                       parsed)))
          (cl-mapc
           (lambda (binding temporary)
             (let ((target-form (car binding))
                   (initializer (cadr binding)))
               (push
                (format "const %s = %s;"
                        temporary
                        (if initializer
                            (eliscript-emitter-emit-expression initializer)
                          (if (eliscript-emitter--binding-pattern-p target-form)
                              "[]" "null")))
                parts)))
           parsed temporaries)
          (cl-mapc
           (lambda (binding temporary)
             (push
              (format "let %s = %s;"
                      (eliscript-emitter--emit-binding-target (car binding))
                      temporary)
              parts))
           parsed temporaries)))
      (push (eliscript-emitter--emit-tail-body body target) parts)
      (format "{\n%s\n}"
              (eliscript-emitter--indent
               (string-join (nreverse parts) "\n"))))))

(defun eliscript-emitter--assemble-tail-short-circuit (frames kind result)
  "Assemble emitted FRAMES and final RESULT of tail short-circuit KIND.
FRAMES are in reverse evaluation order.  Indent each fragment at its final
depth once, rather than copying and reindenting the growing nested suffix."
  (if (null frames) result
    (with-temp-buffer
      (let ((depth 0))
        (cl-labels ((line (level text)
                     (unless (= (point) (point-min)) (insert "\n"))
                     (insert (if (= level 0) text
                               (eliscript-emitter--indent text level)))))
          (dolist (frame (reverse frames))
            (let ((temporary (car frame)))
              (line depth (format "const %s = %s;" temporary (cadr frame)))
              (line depth (format "if (__eliscript_truthy(%s)) {" temporary))
              (when (eq kind 'or)
                (line (1+ depth) (format "return %s;" temporary))
                (line depth "} else {"))
              (setq depth (1+ depth))))
          (line depth result)
          (dolist (frame frames)
            (setq depth (1- depth))
            (when (eq kind 'and)
              (line depth "} else {")
              (line (1+ depth) (format "return %s;" (car frame))))
            (line depth "}"))))
      (buffer-string))))

(defun eliscript-emitter--emit-tail-short-circuit (arguments kind target)
  "Emit recur-aware short-circuit ARGUMENTS of KIND for TARGET."
  (let (frames result)
    (while (cdr arguments)
      (let ((temporary (eliscript-emitter--fresh-name))
            (first (eliscript-emitter-emit-expression (pop arguments))))
        (push (list temporary first) frames)))
    (setq result (if arguments (eliscript-emitter--emit-tail-form (car arguments) target)
                   (format "return %s;" (if (eq kind 'and) "true" "null"))))
    (eliscript-emitter--assemble-tail-short-circuit frames kind result)))

(defun eliscript-emitter--emit-tail-form (form target)
  "Emit FORM in a tail position controlled by TARGET."
  (if (not (consp form))
      (format "return %s;" (eliscript-emitter-emit-expression form))
    (let ((operator (car form))
          (arguments (cdr form)))
      (pcase operator
        ('recur (eliscript-emitter--emit-recur-tail arguments target))
        ('if
         (eliscript-emitter--require-arity "if" arguments 2 3)
         (format "if (__eliscript_truthy(%s)) {\n%s\n} else {\n%s\n}"
                 (eliscript-emitter-emit-expression (nth 0 arguments))
                 (eliscript-emitter--indent
                  (eliscript-emitter--emit-tail-form
                   (nth 1 arguments) target))
                 (eliscript-emitter--indent
                  (if (nth 2 arguments)
                      (eliscript-emitter--emit-tail-form
                       (nth 2 arguments) target)
                    "return null;"))))
        ((or 'when 'unless)
         (eliscript-emitter--require-arity (symbol-name operator) arguments 1)
         (format "if (%s__eliscript_truthy(%s)) {\n%s\n} else {\n  return null;\n}"
                 (if (eq operator 'when) "" "!")
                 (eliscript-emitter-emit-expression (car arguments))
                 (eliscript-emitter--indent
                  (eliscript-emitter--emit-tail-body
                   (cdr arguments) target))))
        ('cond (eliscript-emitter--emit-tail-cond arguments target))
        ((or 'progn 'do)
         (eliscript-emitter--emit-tail-body arguments target))
        ('let (eliscript-emitter--emit-tail-let arguments nil target))
        ('let* (eliscript-emitter--emit-tail-let arguments t target))
        ('and
         (eliscript-emitter--emit-tail-short-circuit arguments 'and target))
        ('or
         (eliscript-emitter--emit-tail-short-circuit arguments 'or target))
        (_ (format "return %s;"
                   (eliscript-emitter-emit-expression form)))))))

(defvar eliscript-emitter--numeric-profile nil)

(defun eliscript-emitter--scalar-proof-plan (model mode value context)
  "Prove scalar operations with explicit scope and short-circuit actions."
  (let ((scope (car context)) (state (cadr context)))
    (pcase mode
      (:value (list :value value))
      (:every
       (if (null value) (list :value t)
         (list :children (list (list :node (car value) context))
               (lambda (results)
                 (if (car results)
                     (list :children (list (list :every (cdr value) context))
                           (lambda (tail) (list :value (car tail))))
                   (list :value nil))))))
      (:bindings
       (let ((remaining (nth 0 value)) (inner (nth 1 value)) (forms (nth 2 value))
             (sequential (nth 3 value)) (valid (nth 4 value)))
         (if (null remaining)
             (if valid (list :children (list (list :every forms (list inner state)))
                             (lambda (results) (list :value (car results)))) (list :value nil))
           (let* ((binding (car remaining))
                  (target (if (eq model 'ir) (eliscript-ir-node-value binding)
                            (if (consp binding) (car binding) binding)))
                  (initializer (if (eq model 'ir) (eliscript-ir-emitter--binding-initializer binding)
                                 (and (consp binding) (cadr binding))))
                  (shape (if (eq model 'ir)
                             (and (eq (eliscript-ir-node-kind binding) 'lexical-binding)
                                  (not (eliscript-ir-property binding :pattern)))
                           (and (symbolp target) (or (symbolp binding)
                                (and (proper-list-p binding) (<= 1 (length binding) 2)))))))
             (list :children (list (if shape (list :node initializer (list (if sequential inner scope) state))
                                    (list :value nil context)))
                   (lambda (results)
                     (list :children (list (list :bindings
                              (list (cdr remaining) (cons target inner) forms sequential (and valid (car results))) context))
                           (lambda (tail) (list :value (car tail))))))))))
      (:pairs
       (if (null value) (list :value t)
         (let* ((ir (eq model 'ir)) (pair (if ir (car value) value))
                (target (if ir (eliscript-ir-node-value pair) (car pair)))
                (shape (and (or (not ir) (eq (eliscript-ir-node-kind pair) 'assignment-pair)) (memq target scope)))
                (operand (if ir (car (eliscript-ir-node-children pair)) (cadr pair))))
           (list :children (list (if shape (list :node operand context) (list :value nil context)))
                 (lambda (results)
                   (if (and ir (not (car results))) (list :value nil)
                     (list :children (list (list :pairs (if ir (cdr value) (cddr value)) context))
                           (lambda (tail) (list :value (and (car results) (car tail)))))))))))
      (:node
       (if (eq model 'ir)
           (if (null value) (list :value t)
             (let ((kind (eliscript-ir-node-kind value)) (datum (eliscript-ir-node-value value))
                   (children (eliscript-ir-emitter--children value)))
               (pcase kind
                 ('literal (list :value (or (numberp datum) (memq datum '(nil t false undefined)))))
                 ('reference (list :value (memq datum scope)))
                 ('lexical-bindings
                  (let ((split (eliscript-ir-emitter--split-counted-children value :binding-count)))
                    (list :children (list (list :bindings (list (car split) scope (cadr split)
                                        (eliscript-ir-property value :sequential) t) context))
                          (lambda (results) (list :value (car results))))))
                 ('assignment (list :children (list (list :pairs children context))
                                    (lambda (results) (list :value (car results)))))
                 ((or 'intrinsic 'conditional 'conditional-sugar 'short-circuit 'sequence 'loop)
                  (when (eq kind 'loop) (setcar state t))
                  (if (and (or (not (eq kind 'intrinsic))
                               (memq datum '(+ - * / % mod 1+ 1- = eq < <= > >= /= not= not)))
                           (or (not (and (eq kind 'intrinsic) (memq datum '(< <= > >=)))) (= (length children) 2)))
                      (list :children (list (list :every children context)) (lambda (results) (list :value (car results))))
                    (list :value nil)))
                 (_ (list :value nil)))))
         (cond
          ((or (numberp value) (memq value '(nil t false undefined))) (list :value t))
          ((symbolp value) (list :value (memq value scope)))
          ((consp value)
           (let ((operator (car value)) (arguments (cdr value)))
             (cond
              ((memq operator '(let let*))
               (list :children (list (list :bindings (list (car arguments) scope (cdr arguments) (eq operator 'let*) t) context))
                     (lambda (results) (list :value (car results)))))
              ((memq operator '(setq set!)) (list :children (list (list :pairs arguments context))
                                                (lambda (results) (list :value (car results)))))
              ((memq operator '(+ - * / % mod 1+ 1- = eq < <= > >= /= not= not and or if when unless progn do while))
               (when (eq operator 'while) (setcar state t))
               (if (or (not (memq operator '(< <= > >=))) (= (length arguments) 2))
                   (list :children (list (list :every arguments context)) (lambda (results) (list :value (car results))))
                 (list :value nil)))
              (t (list :value nil)))))
          (t (list :value nil)))))
      (_ (error "unknown scalar proof continuation: %S" mode)))))

(defun eliscript-emitter--closed-scalar-loop-p (names body)
  "Prove the original scalar subset without recursive expression scans."
  (when names
    (let* ((state (list nil))
           (valid (eliscript-emitter--run-depth-plan
                   (lambda (mode value context) (eliscript-emitter--scalar-proof-plan 'form mode value context))
                   :every body (list names state))))
      (and valid (car state)))))

(defun eliscript-emitter--emit-function-body (parameters body)
  "Version closed scalar loops behind one Number guard per parameter."
  (let ((names (mapcar #'eliscript-parameter-form parameters)))
    (if (and (not eliscript-emitter--numeric-profile)
             (cl-every (lambda (p) (eq (eliscript-parameter-kind p) 'required)) parameters)
             (cl-every #'symbolp names)
             (eliscript-emitter--closed-scalar-loop-p names body))
        (let ((fast (let ((eliscript-emitter--numeric-profile t))
                      (eliscript-emitter--emit-function-body-unversioned parameters body)))
              (slow (eliscript-emitter--emit-function-body-unversioned parameters body)))
          (format "if (%s) {\n%s\n} else {\n%s\n}"
                  (mapconcat (lambda (name) (format "typeof %s === \"number\""
                                                    (eliscript-emitter--binding-name name))) names " && ")
                  (eliscript-emitter--indent fast) (eliscript-emitter--indent slow)))
      (eliscript-emitter--emit-function-body-unversioned parameters body))))

(defun eliscript-emitter--emit-function-body-unversioned (parameters body)
  "Emit function BODY with recur-aware PARAMETER rebinding when required."
  (if (not (eliscript-emitter--contains-function-recur-p body))
      (eliscript-emitter--emit-returning-body body)
    (let* ((label (eliscript-emitter--fresh-name))
           (target
            (list :bindings
                  (mapcar #'eliscript-parameter-form parameters)
                  :label label)))
      (format "%s: while (true) {\n%s\n}"
              label
              (eliscript-emitter--indent
               (eliscript-emitter--emit-tail-body body target))))))

(defun eliscript-emitter--emit-binding-loop (arguments)
  "Emit recur-capable lexical binding loop ARGUMENTS."
  (eliscript-emitter--require-arity "loop" arguments 1)
  (let ((bindings (car arguments))
        (body (cdr arguments)))
    (unless (listp bindings)
      (eliscript-emitter--fail "loop bindings must be a list"))
    (let (targets initializers)
      (dolist (binding bindings)
        (unless (and (listp binding) (= (length binding) 2)
                     (or (symbolp (car binding)) (vectorp (car binding))))
          (eliscript-emitter--fail
           "loop binding must contain a target and initializer: %S" binding))
        (push (car binding) targets)
        (push (cadr binding) initializers))
      (setq targets (nreverse targets)
            initializers (nreverse initializers))
      (let* ((label (eliscript-emitter--fresh-name))
             (target (list :bindings targets :label label)))
        (eliscript-emitter--emit-iife
         (mapconcat #'eliscript-emitter--emit-binding-target targets ", ")
         (eliscript-emitter--indent
          (format "%s: while (true) {\n%s\n}"
                  label
                  (eliscript-emitter--indent
                   (eliscript-emitter--emit-tail-body body target))))
         (mapconcat #'eliscript-emitter-emit-expression initializers ", ")
         (eliscript-emitter--contains-await-p body))))))

(defun eliscript-emitter--emit-parameter (parameter)
  "Emit parsed function PARAMETER."
  (let* ((form (eliscript-parameter-form parameter))
         (name (eliscript-emitter--emit-binding-target form))
         (pattern (eliscript-emitter--binding-pattern-p form)))
    (pcase (eliscript-parameter-kind parameter)
      ('optional (format "%s = %s" name (if pattern "[]" "null")))
      ('rest (format "...%s" name))
      (_ name))))

(defun eliscript-emitter--emit-if (arguments)
  "Emit an if expression from ARGUMENTS."
  (eliscript-emitter--require-arity "if" arguments 2 3)
  (format "(%s ? %s : %s)"
          (eliscript-emitter--emit-test (nth 0 arguments))
          (eliscript-emitter-emit-expression (nth 1 arguments))
          (eliscript-emitter-emit-expression (nth 2 arguments))))

(defun eliscript-emitter--emit-cond (clauses)
  "Emit nested conditional expressions for CLAUSES."
  (let ((result "null") frames)
    (while clauses
      (let ((clause (pop clauses)))
      (unless (and (listp clause) clause)
        (eliscript-emitter--fail "invalid cond clause: %S" clause))
      (let ((test (car clause))
            (body (cdr clause)))
        (if (eq test t)
            (setq result (eliscript-emitter--emit-do body) clauses nil)
          (let ((condition (eliscript-emitter--emit-test test))
                (consequent (eliscript-emitter--emit-do body)))
            (push (list condition consequent) frames))))))
    (dolist (frame frames)
      (setq result (format "(%s ? %s : %s)" (car frame) (cadr frame) result)))
    result))

(defun eliscript-emitter--try-clause-operator (form)
  "Return FORM's try clause operator, or nil."
  (and (proper-list-p form)
       form
       (symbolp (car form))
       (car form)))

(defun eliscript-emitter--emit-throw (arguments)
  "Emit a throw expression from ARGUMENTS."
  (eliscript-emitter--require-arity "throw" arguments 1 1)
  (let ((temporary (eliscript-emitter--fresh-name)))
    (format "((%s) => { throw %s; })(%s)"
            temporary temporary
            (eliscript-emitter-emit-expression (car arguments)))))

(defun eliscript-emitter--emit-try (arguments)
  "Emit value-producing try ARGUMENTS."
  (let (body catch-name catch-body finally-body
             clauses-started catch-seen finally-seen)
    (dolist (argument arguments)
      (pcase (eliscript-emitter--try-clause-operator argument)
        ('catch
         (when catch-seen
           (eliscript-emitter--fail
            "try accepts at most one catch clause"))
         (when finally-seen
           (eliscript-emitter--fail "catch must precede finally"))
         (unless (and (cdr argument)
                      (let ((binding (cadr argument)))
                        (or (and binding (symbolp binding))
                            (vectorp binding))))
           (eliscript-emitter--fail
            "catch requires a binding symbol or vector"))
         (setq clauses-started t
               catch-seen t
               catch-name (cadr argument)
               catch-body (cddr argument)))
        ('finally
         (when finally-seen
           (eliscript-emitter--fail
            "try accepts at most one finally clause"))
         (setq clauses-started t
               finally-seen t
               finally-body (cdr argument)))
        (_
         (if clauses-started
             (eliscript-emitter--fail
              "try body forms must precede catch and finally clauses")
           (setq body (append body (list argument)))))))
    (unless (or catch-seen finally-seen)
      (eliscript-emitter--fail "try requires a catch or finally clause"))
    (let ((try-block
           (concat
            "try {\n"
            (eliscript-emitter--indent
             (eliscript-emitter--emit-returning-body body))
            "\n}"
            (if catch-seen
                (concat
                 " catch ("
                 (eliscript-emitter--emit-binding-target catch-name)
                 ") {\n"
                 (eliscript-emitter--indent
                  (eliscript-emitter--emit-returning-body catch-body))
                 "\n}")
              "")
            (if finally-seen
                (concat
                 " finally {\n"
                 (eliscript-emitter--indent
                  (eliscript-emitter--emit-statement-body finally-body))
                 "\n}")
              ""))))
      (eliscript-emitter--emit-iife
       "" (eliscript-emitter--indent try-block) ""
       (eliscript-emitter--contains-await-p arguments)))))

(defun eliscript-emitter--emit-while (arguments)
  "Emit a value-producing while expression from ARGUMENTS."
  (eliscript-emitter--require-arity "while" arguments 1)
  (let ((test (car arguments))
        (body (cdr arguments)))
    (eliscript-emitter--emit-iife
     ""
     (eliscript-emitter--indent
      (concat
       (format "while (%s) {\n"
               (eliscript-emitter--emit-test test))
       (eliscript-emitter--indent
        (eliscript-emitter--emit-statement-body body))
       "\n}\nreturn null;"))
     ""
     (eliscript-emitter--contains-await-p arguments))))

(defun eliscript-emitter--emit-setq (arguments)
  "Emit assignments represented by setq ARGUMENTS."
  (when (or (null arguments) (= (% (length arguments) 2) 1))
    (eliscript-emitter--fail "setq expects one or more name/value pairs"))
  (let (assignments)
    (while arguments
      (let ((name (pop arguments))
            (value (pop arguments)))
        (push (format "(%s = %s)"
                      (eliscript-emitter--binding-name name)
                      (eliscript-emitter-emit-expression value))
              assignments)))
    (format "(%s)" (string-join (nreverse assignments) ", "))))

(defun eliscript-emitter--emit-short-circuit (arguments kind)
  "Emit Lisp-style short-circuit ARGUMENTS for KIND, either and or or."
  (let (frames result done)
    (while (not done)
      (cond
       ((null arguments) (setq result (if (eq kind 'and) "true" "null") done t))
       ((null (cdr arguments))
        (setq result (eliscript-emitter-emit-expression (car arguments)) done t))
       ((and (cl-every #'eliscript-emitter--boolean-p arguments)
             (not (eliscript-emitter--contains-await-p arguments)))
        (setq result (format "(%s)" (mapconcat #'eliscript-emitter-emit-expression arguments
                                               (if (eq kind 'and) " && " " || ")))
              done t))
       (t
        (let ((temporary (eliscript-emitter--fresh-name))
              (first (eliscript-emitter-emit-expression (car arguments))))
          (setq arguments (cdr arguments))
          (push (list temporary first arguments) frames)))))
    (dolist (frame frames)
      (let ((temporary (car frame)))
        (setq result
              (format (if (eliscript-emitter--contains-await-p (nth 2 frame))
                          "(await (async (%s) => (__eliscript_truthy(%s) ? %s : %s))(%s))"
                        "((%s) => (__eliscript_truthy(%s) ? %s : %s))(%s)")
                      temporary temporary
                      (if (eq kind 'and) result temporary)
                      (if (eq kind 'and) temporary result)
                      (cadr frame)))))
    result))

(defun eliscript-emitter--numeric-tag (operator)
  "Return the primitive helper tag for OPERATOR."
  (cdr (assoc operator '(("-" . "sub") ("*" . "mul") ("/" . "div")
                        ("%" . "rem") ("&" . "and") ("|" . "or")
                        ("^" . "xor") ("<<" . "shl") (">>" . "shr")
                        (">>>" . "ushr") ("imul" . "imul")))))
(defun eliscript-emitter--relational-p (operator)
  "Return non-nil for a relational OPERATOR."
  (member operator '("<" "<=" ">" ">=")))
(defun eliscript-emitter--numeric-coercion-p (name)
  "Return non-nil when intrinsic NAME needs numeric conversion."
  (memq name '(- * / % mod < <= > >= 1- int32 uint32 imul32 bit-not bit-and
              bit-or bit-xor bit-shift-left bit-shift-right unsigned-bit-shift-right)))
(defun eliscript-emitter--numeric-binary (operator left right)
  "Emit OPERATOR over already emitted LEFT and RIGHT, preserving conversions."
  (cond (eliscript-emitter--numeric-profile (format "(%s %s %s)" left operator right))
        ((and (equal operator "-") (equal right "1"))
         (format "__eliscript_numeric_decrement(%s)" left))
        ((eliscript-emitter--relational-p operator)
         (format "__eliscript_numeric_relation(\"%s\", %s, %s)" operator left right))
        ((eliscript-emitter--numeric-tag operator)
         (format "__eliscript_numeric_%s(%s, %s)"
                 (eliscript-emitter--numeric-tag operator) left right))
        (t (format "(%s %s %s)" left operator right))))
(defun eliscript-emitter--numeric-fold (operator expressions)
  "Left-fold emitted EXPRESSIONS with OPERATOR."
  (if (and (not eliscript-emitter--numeric-profile)
           (eliscript-emitter--numeric-tag operator) (cdr expressions))
      (let ((result (car expressions)))
        (dolist (right (cdr expressions))
          (setq result (eliscript-emitter--numeric-binary operator result right))) result)
    (format "(%s)" (string-join expressions (format " %s " operator)))))
(defun eliscript-emitter--emit-infix (name arguments operator &optional minimum)
  "Emit ARGUMENTS joined by OPERATOR for Lisp function NAME."
  (eliscript-emitter--require-arity name arguments (or minimum 2))
  (eliscript-emitter--numeric-fold operator (mapcar #'eliscript-emitter-emit-expression arguments)))

(defun eliscript-emitter--emit-binary-infix (name arguments operator)
  "Emit exact binary NAME over ARGUMENTS using JavaScript OPERATOR."
  (eliscript-emitter--require-arity name arguments 2 2)
  (eliscript-emitter--numeric-binary operator
    (eliscript-emitter-emit-expression (nth 0 arguments)) (eliscript-emitter-emit-expression (nth 1 arguments))))

(defun eliscript-emitter--emit-comparison (name arguments operator)
  "Emit one-evaluation n-ary comparison NAME using OPERATOR."
  (eliscript-emitter--require-arity name arguments 2)
  (if (= (length arguments) 2)
      (eliscript-emitter--numeric-binary operator
        (eliscript-emitter-emit-expression (nth 0 arguments)) (eliscript-emitter-emit-expression (nth 1 arguments)))
    (let ((parameters (mapcar (lambda (_argument)
                                (eliscript-emitter--fresh-name))
                              arguments))
          comparisons)
      (cl-loop for left on parameters
               while (cdr left)
               do (push (if (eliscript-emitter--relational-p operator)
                            (eliscript-emitter--numeric-binary operator (car left) (cadr left))
                          (format "%s %s %s" (car left) operator (cadr left)))
                        comparisons))
      (format "((%s) => (%s))(%s)"
              (string-join parameters ", ")
              (string-join (nreverse comparisons) " && ")
              (eliscript-emitter--emit-arguments arguments)))))

(defun eliscript-emitter--emit-distinct (name arguments)
  "Emit a one-evaluation pairwise distinct comparison for NAME ARGUMENTS."
  (eliscript-emitter--require-arity name arguments 2)
  (let ((parameters (mapcar (lambda (_argument)
                              (eliscript-emitter--fresh-name))
                            arguments))
        comparisons)
    (cl-loop for left-index from 0 below (length parameters)
             do (cl-loop for right-index from (1+ left-index)
                         below (length parameters)
                         do (push
                             (format "%s !== %s"
                                     (nth left-index parameters)
                                     (nth right-index parameters))
                             comparisons)))
    (format "((%s) => (%s))(%s)"
            (string-join parameters ", ")
            (string-join (nreverse comparisons) " && ")
            (eliscript-emitter--emit-arguments arguments))))

(defun eliscript-emitter--emit-object (arguments)
  "Emit an object literal from alternating key/value ARGUMENTS."
  (when (= (% (length arguments) 2) 1)
    (eliscript-emitter--fail "object expects key/value pairs"))
  (let (properties)
    (while arguments
      (let ((key (pop arguments))
            (value (pop arguments)))
        (push
         (format "%s: %s"
                 (cond
                  ((keywordp key)
                   (eliscript-emitter--json-string
                    (substring (symbol-name key) 1)))
                  ((stringp key) (eliscript-emitter--json-string key))
                  ((symbolp key)
                   (eliscript-emitter--json-string (symbol-name key)))
                  (t (format "[%s]"
                             (eliscript-emitter-emit-expression key))))
                 (eliscript-emitter-emit-expression value))
         properties)))
    (format "({%s})" (string-join (nreverse properties) ", "))))

(defun eliscript-emitter--emit-property-key (key)
  "Emit KEY for bracket-style JavaScript property access."
  (cond
   ((keywordp key)
    (eliscript-emitter--json-string (substring (symbol-name key) 1)))
   ((stringp key) (eliscript-emitter--json-string key))
   (t (eliscript-emitter-emit-expression key))))

(defun eliscript-emitter--emit-get (arguments)
  "Emit property access from get ARGUMENTS."
  (eliscript-emitter--require-arity "get" arguments 2 3)
  (let ((access (format "(%s)[%s]"
                        (eliscript-emitter-emit-expression (nth 0 arguments))
                        (eliscript-emitter--emit-property-key (nth 1 arguments)))))
    (if (= (length arguments) 3)
        (format "(%s ?? %s)"
                access
                (eliscript-emitter-emit-expression (nth 2 arguments)))
      access)))

(defun eliscript-emitter--array-text-key-p (key)
  "Return non-nil for text and borrowed-call methods or computed KEY."
  (if (or (keywordp key) (stringp key) (numberp key) (memq key '(nil t false undefined)))
      (member (if (keywordp key) (substring (symbol-name key) 1) key)
              '("join" "toString" "call" "apply" "bind"))
    t))

(defun eliscript-emitter--primitive-literal-p (form)
  "Return non-nil for primitive literal FORM, excluding allocated tagged values."
  (or (numberp form) (stringp form) (memq form '(nil t false undefined))))

(defun eliscript-emitter--emit-js-call (arguments)
  "Emit a receiver-preserving JavaScript method call from ARGUMENTS."
  (eliscript-emitter--require-arity "js-call" arguments 2)
  (format (if (eliscript-emitter--array-text-key-p (nth 1 arguments))
              (if (cl-every #'eliscript-emitter--primitive-literal-p (nthcdr 2 arguments))
                  (if (nthcdr 2 arguments) "__eliscript_at_direct(%s, %s, %s)"
                    "__eliscript_at_direct(%s, %s%s)")
                "__eliscript_at(%s, %s)(%s)")
            "(%s)[%s](%s)")
          (eliscript-emitter-emit-expression (nth 0 arguments))
          (eliscript-emitter--emit-property-key (nth 1 arguments))
          (eliscript-emitter--emit-arguments (nthcdr 2 arguments))))

(defun eliscript-emitter--number-text (value)
  "Spell numeric VALUE as the same binary64 literal as the JavaScript emitter.

Use Emacs's shortest round-tripping digits, then change only decimal-point
placement and exponent spelling. No rounded decimal arithmetic is involved."
  (let* ((float-output-format nil)
         ;; Eliscript Numbers have the same binary64 conversion as Number in
         ;; the self-hosted reader, including Emacs integers beyond 2^53.
         (text (number-to-string (float value))))
    (when (string-match-p "INF\\|NaN" text)
      (eliscript-emitter--fail "non-finite numbers are not supported: %S" value))
    (if (zerop value)
        (if (string-prefix-p "-" text) "-0.0" "0")
      (let* ((negative (string-prefix-p "-" text))
             (unsigned (if negative (substring text 1) text))
             (exponent-at (string-match "[eE]" unsigned))
             (mantissa (if exponent-at (substring unsigned 0 exponent-at) unsigned))
             (exponent (if exponent-at (string-to-number (substring unsigned (1+ exponent-at))) 0))
             (point (or (string-match "\\." mantissa) (length mantissa)))
             (digits (replace-regexp-in-string "\\." "" mantissa t t))
             (position (+ point exponent)))
        (while (and (> (length digits) 1) (= (aref digits 0) ?0))
          (setq digits (substring digits 1) position (1- position)))
        (while (and (> (length digits) 1) (= (aref digits (1- (length digits))) ?0))
          (setq digits (substring digits 0 -1)))
        (concat
         (if negative "-" "")
         (cond
          ((and (> position 0) (<= position 21))
           (if (>= position (length digits))
               (concat digits (make-string (- position (length digits)) ?0))
             (concat (substring digits 0 position) "." (substring digits position))))
          ((and (> position -6) (<= position 0))
           (concat "0." (make-string (- position) ?0) digits))
          (t
           (concat (substring digits 0 1)
                   (if (> (length digits) 1) (concat "." (substring digits 1)) "")
                   "e" (if (> position 0) "+" "")
                   (number-to-string (1- position))))))))))

(defun eliscript-emitter--emit-quoted (value)
  "Emit quoted Eliscript VALUE as canonical persistent data."
  (cond
   ((null value) "__eliscript_list()")
   ((eq value t) "true")
   ((eq value 'undefined) "undefined")
   ((numberp value) (eliscript-emitter--number-text value))
   ((stringp value) (eliscript-emitter--json-string value))
   ((keywordp value)
    (format "__eliscript_keyword(%s)"
            (eliscript-emitter--json-string
             (substring (symbol-name value) 1))))
   ((symbolp value)
    (format "__eliscript_symbol(%s)"
            (eliscript-emitter--json-string (symbol-name value))))
   ((vectorp value)
    (format "__eliscript_vector(%s)"
            (mapconcat #'eliscript-emitter--emit-quoted (append value nil) ", ")))
   ((consp value)
    (unless (proper-list-p value)
      (eliscript-emitter--fail "dotted quoted lists are not supported yet"))
    (format "__eliscript_list(%s)"
            (mapconcat #'eliscript-emitter--emit-quoted value ", ")))
   (t (eliscript-emitter--fail "cannot quote value: %S" value))))

(defun eliscript-emitter--quoted-uses-literal-runtime-p (value)
  "Return non-nil when quoted VALUE constructs a persistent runtime value."
  (cond
   ((null value) t)
   ((or (eq value t) (eq value 'undefined)
        (numberp value) (stringp value)) nil)
   ((or (keywordp value) (symbolp value)
        (vectorp value) (consp value)) t)
   (t nil)))

(defun eliscript-emitter--raw-binary-operator (source)
  "Recognize a closed, eager two-argument JavaScript primitive template.
Only canonical a/b arrows are reduced. Other js* expressions stay ordinary
calls, including short circuits, assignments, defaults and repeated operands."
  (when (and (stringp source) (not (string-match-p "[\r\n]" source))
             (or (string-match
              "\\`[ \t]*([ \t]*a[ \t]*,[ \t]*b[ \t]*)[ \t]*=>[ \t]*a[ \t]*\\([+*/%<>=!&|^-]+\\)[ \t]*b[ \t]*\\'"
              source)
                 (string-match
                  "\\`[ \t]*([ \t]*a[ \t]*,[ \t]*b[ \t]*)[ \t]*=>[ \t]*a[ \t]+\\(instanceof\\)[ \t]+b[ \t]*\\'"
                  source)))
    (let ((operator (match-string 1 source)))
      (and (member operator '("+" "-" "*" "/" "%" "<" ">" "<=" ">="
                              "==" "!=" "===" "!==" "&" "|" "^" "<<" ">>" ">>>" "instanceof"))
           operator))))

(defun eliscript-emitter--primitive-operand-p (form)
  "Accept literals, references and reads without recursive proof traversal."
  (let ((pending (list form)) (safe t))
    (while (and pending safe)
      (let ((item (pop pending)))
        (cond ((or (symbolp item) (stringp item) (numberp item)) nil)
              ((and (consp item) (eq (car item) eliscript-emitter--tdz-read-tag)
                    (= (length item) 3) (symbolp (nth 2 item))) nil)
              ((and (consp item) (memq (car item) '(get aref js-length)))
               (dolist (child (cdr item)) (push child pending)))
              (t (setq safe nil)))))
    safe))

(defun eliscript-emitter--primitive-invocation-operator (arguments &optional unguarded)
  "Prove a closed primitive invocation without emitting or changing state."
  (let* ((callee (car arguments))
         (operator (and (= (length arguments) 3) (consp callee)
                        (eq (car callee) 'js*) (= (length callee) 2)
                        (eliscript-emitter--raw-binary-operator (cadr callee)))))
    (and operator (cl-every #'eliscript-emitter--primitive-operand-p (cdr arguments))
         (or (not unguarded)
             (not (eliscript-emitter--some-form (cdr arguments)
                    (lambda (form) (and (consp form) (eq (car form) eliscript-emitter--tdz-read-tag))))))
         operator)))

(defconst eliscript-emitter--primitive-comparisons
  '("<" ">" "<=" ">=" "==" "!=" "===" "!==" "instanceof"))

(defun eliscript-emitter--primitive-boolean-expression-p (form)
  "Prove boolean leaves, widening only expressions containing a primitive.
Conditions retain their ordinary Lisp truth conversion; numeric primitive
results are never boolean. Use an explicit stack for deep conditional trees."
  (let ((pending (list form)) (safe t) seen)
    (while (and pending safe)
      (let* ((item (pop pending)) (operator (car-safe item)))
        (cond
         ((eq operator 'funcall)
          (if (member (eliscript-emitter--primitive-invocation-operator (cdr item))
                      eliscript-emitter--primitive-comparisons)
              (setq seen t) (setq safe nil)))
         ((eq operator 'if)
          (if (= (length item) 4)
              (setq pending (cons (nth 2 item) (cons (nth 3 item) pending)))
            (setq safe nil)))
         ((memq operator '(and or))
          (if (cdr item) (dolist (child (cdr item)) (push child pending))
            (setq safe nil)))
         ((not (eliscript-emitter--boolean-p item)) (setq safe nil)))))
    (and safe seen)))

(defun eliscript-emitter--method-formal-name-p (name)
  "Require an unchanged strict identifier, excluding the captured callback."
  (and (not (member name '("fn" "undefined" "nil" "t" "false")))
       (not (string-prefix-p eliscript-symbol-internal-prefix name))
       (equal name (eliscript-symbol-binding-name (intern name)))))

(defun eliscript-emitter--raw-method-wrapper (source)
  "Recognize closed native methods forwarding each argument once to fn."
  (when (and (stringp source) (not (string-match-p "[\r\n]" source)))
    (cond
     ((string-match
       "\\`(fn) => ({ \\([A-Za-z_$][A-Za-z0-9_$]*\\)(\\([^()]*\\)) { return fn(\\([^()]*\\)); } })\\.\\([A-Za-z_$][A-Za-z0-9_$]*\\)\\'" source)
      (let* ((name (match-string 1 source)) (formal-text (match-string 2 source))
             (call (match-string 3 source)) (result (match-string 4 source))
             (formals (unless (string-empty-p formal-text) (split-string formal-text ", ")))
             names defaults (safe (equal name result)))
        (dolist (formal formals)
          (if (string-match "\\`\\([A-Za-z_$][A-Za-z0-9_$]*\\)\\( = undefined\\)?\\'" formal)
              (progn (push (match-string 1 formal) names)
                     (push (not (null (match-string 2 formal))) defaults))
            (setq safe nil)))
        (setq names (nreverse names) defaults (nreverse defaults))
        (when (and safe (cl-every #'eliscript-emitter--method-formal-name-p names)
                   (= (length names) (length (delete-dups (copy-sequence names)))))
          (cond ((equal call (string-join (cons "this" names) ", "))
                 (list :name name :receiver t :defaults defaults))
                ((equal call (string-join names ", "))
                 (list :name name :receiver nil :defaults defaults))))))
     ((string-match
       "\\`(fn) => Object\\.getOwnPropertyDescriptor({ get \\([A-Za-z_$][A-Za-z0-9_$]*\\)() { return fn(this); } }, '\\([A-Za-z_$][A-Za-z0-9_$]*\\)')\\.get\\'" source)
      (when (equal (match-string 1 source) (match-string 2 source))
        (list :name (match-string 1 source) :getter t :receiver t :defaults nil))))))

(defun eliscript-emitter--method-callback-safe-p (body)
  "Refuse implicit host context, preserving literal object keys and quotes."
  (let ((pending (copy-sequence body)) (safe t))
    (while (and pending safe)
      (let ((form (pop pending)))
        (cond
         ((symbolp form)
          (when (and form (not (keywordp form))
                     (string-match-p "[./]" (symbol-name form))
                     (equal (car (split-string (symbol-name form) "[./]" t)) "arguments"))
            (setq safe nil)))
         ((vectorp form) (setq pending (append (append form nil) pending)))
         ((consp form)
          (cond
           ((eq (car form) 'quote) nil)
           ((memq (car form) '(defun defvar defconst import export)) (setq safe nil))
           ((eq (car form) 'js*)
            (unless (and (= (length form) 2) (eliscript-emitter--raw-binary-operator (cadr form)))
              (setq safe nil)))
           ((eq (car form) 'js-object)
            (let ((pairs (cdr form)))
              (while pairs
                (let ((key (pop pairs)) (value (pop pairs)))
                  (unless (or (symbolp key) (stringp key)) (push key pending))
                  (push value pending)))))
           ((memq (car form) (list eliscript-emitter--tdz-read-tag eliscript-emitter--tdz-write-tag))
            (setq pending (append (nthcdr 2 form) pending)))
           (t (setq pending (append form pending))))))))
    safe))

(defun eliscript-emitter--method-wrapper-shell (spec names body &optional locate)
  "Wrap an Eli callback BODY in its proven native method signature."
  (let* ((receiver (plist-get spec :receiver))
         (formals (if receiver (cdr names) names))
         (defaults (plist-get spec :defaults))
         (signature (cl-mapcar (lambda (name optional)
                                (concat name (if optional " = undefined" ""))) formals defaults))
         (method (format "%s%s(%s) {\n%s\n}"
                   (if (plist-get spec :getter) "get " "") (plist-get spec :name)
                   (string-join signature ", ")
                   (eliscript-emitter--indent
                    (concat (if receiver (format "let %s = this;\n" (car names)) "") body)))))
    (when locate (setq method (funcall locate method)))
    (if (plist-get spec :getter)
        (format "(0, Object.getOwnPropertyDescriptor({%s}, '%s').get)" method (plist-get spec :name))
      (format "(0, ({%s}).%s)" method (plist-get spec :name)))))

(defun eliscript-emitter--emit-method-wrapper (arguments)
  "Inline only a direct synchronous, required-parameter callback literal."
  (when (= (length arguments) 2)
    (let* ((callee (car arguments)) (callback (cadr arguments))
           (spec (and (consp callee) (eq (car callee) 'js*) (= (length callee) 2)
                      (eliscript-emitter--raw-method-wrapper (cadr callee)))))
      (when (and spec (consp callback) (proper-list-p callback)
                 (consp (cdr callback)) (memq (car callback) '(lambda fn)))
        (let* ((parameters (eliscript-parameters-parse (cadr callback)
                             (lambda (_form message) (eliscript-emitter--fail "%s" message))))
               (body (cddr callback)))
          (when (and (= (length parameters) (+ (length (plist-get spec :defaults))
                                                (if (plist-get spec :receiver) 1 0)))
                     (cl-every (lambda (parameter)
                                 (and (eq (eliscript-parameter-kind parameter) 'required)
                                      (symbolp (eliscript-parameter-form parameter)))) parameters)
                     (eliscript-emitter--method-callback-safe-p body))
            (let ((names (mapcar (lambda (p) (eliscript-emitter--binding-name (eliscript-parameter-form p))) parameters)))
              (when (= (length names) (length (delete-dups (copy-sequence names))))
                (eliscript-emitter--method-wrapper-shell spec names
                  (eliscript-emitter--emit-function-body parameters body))))))))))

(defun eliscript-emitter--emit-primitive-invocation (arguments)
  "Reduce a proven primitive without changing operand evaluation."
  (let ((operator (eliscript-emitter--primitive-invocation-operator arguments)))
    (when operator
      (format "((%s) %s (%s))"
              (eliscript-emitter-emit-expression (nth 1 arguments)) operator
              (eliscript-emitter-emit-expression (nth 2 arguments))))))

(defun eliscript-emitter--emit-call (form)
  "Emit list FORM as an expression."
  (let ((operator (car form))
        (arguments (cdr form)))
    (pcase operator
      ((or 'lambda 'fn)
       (eliscript-emitter--require-arity (symbol-name operator) arguments 1)
       (eliscript-emitter--emit-function (car arguments) (cdr arguments)))
      ('async
       (eliscript-emitter--require-arity "async" arguments 1)
       (eliscript-emitter--emit-function
        (car arguments) (cdr arguments) t))
      ('await
       (eliscript-emitter--require-arity "await" arguments 1 1)
       (format "await (%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('throw (eliscript-emitter--emit-throw arguments))
      ('try (eliscript-emitter--emit-try arguments))
      ((or 'catch 'finally)
       (eliscript-emitter--fail
        "%s is only valid as a try clause" operator))
      ('if (eliscript-emitter--emit-if arguments))
      ('when
       (eliscript-emitter--require-arity "when" arguments 1)
       (eliscript-emitter--emit-if
        (list (car arguments) (cons 'progn (cdr arguments)) nil)))
      ('unless
       (eliscript-emitter--require-arity "unless" arguments 1)
       (eliscript-emitter--emit-if
        (list (list 'not (car arguments)) (cons 'progn (cdr arguments)) nil)))
      ('cond (eliscript-emitter--emit-cond arguments))
      ((or 'progn 'do) (eliscript-emitter--emit-do arguments))
      ('let (eliscript-emitter--emit-let arguments nil))
      ('let* (eliscript-emitter--emit-let arguments t))
      ('setq (eliscript-emitter--emit-setq arguments))
      ('set!
       (eliscript-emitter--require-arity "set!" arguments 2 2)
       (format "(%s = %s)"
               (eliscript-emitter--binding-name (car arguments))
               (eliscript-emitter-emit-expression (cadr arguments))))
      ('while (eliscript-emitter--emit-while arguments))
      ('loop (eliscript-emitter--emit-binding-loop arguments))
      ('recur
       (eliscript-emitter--fail "recur is only valid in tail position"))
      ('and (eliscript-emitter--emit-short-circuit arguments 'and))
      ('or (eliscript-emitter--emit-short-circuit arguments 'or))
      ('not
       (eliscript-emitter--require-arity "not" arguments 1 1)
       (format "(!%s)"
               (eliscript-emitter--emit-test (car arguments))))
      ('quote
       (eliscript-emitter--require-arity "quote" arguments 1 1)
       (eliscript-emitter--emit-quoted (car arguments)))
      ('+ (if arguments
              (format "(%s)" (mapconcat #'eliscript-emitter-emit-expression
                                         arguments " + "))
            "0"))
      ('* (if arguments
              (eliscript-emitter--emit-infix "*" arguments "*" 1)
            "1"))
      ('-
       (eliscript-emitter--require-arity "-" arguments 1)
       (if (= (length arguments) 1)
           (format (if eliscript-emitter--numeric-profile "(-%s)" "__eliscript_numeric_neg(%s)") (eliscript-emitter-emit-expression (car arguments)))
         (eliscript-emitter--emit-infix "-" arguments "-")))
      ('/
       (eliscript-emitter--require-arity "/" arguments 1)
       (if (= (length arguments) 1)
           (eliscript-emitter--numeric-binary "/" "1" (eliscript-emitter-emit-expression (car arguments)))
         (eliscript-emitter--emit-infix "/" arguments "/")))
      ((or '% 'mod) (eliscript-emitter--emit-infix (symbol-name operator)
                                                    arguments "%"))
      ('int32
       (eliscript-emitter--require-arity "int32" arguments 1 1)
       (format "__eliscript_numeric_int32(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('uint32
       (eliscript-emitter--require-arity "uint32" arguments 1 1)
       (format "__eliscript_numeric_uint32(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('imul32
       (eliscript-emitter--require-arity "imul32" arguments 2 2)
       (format "__eliscript_numeric_imul(%s, %s)"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('bit-and
       (eliscript-emitter--emit-binary-infix "bit-and" arguments "&"))
      ('bit-or
       (eliscript-emitter--emit-binary-infix "bit-or" arguments "|"))
      ('bit-xor
       (eliscript-emitter--emit-binary-infix "bit-xor" arguments "^"))
      ('bit-not
       (eliscript-emitter--require-arity "bit-not" arguments 1 1)
       (format "__eliscript_numeric_not(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('bit-shift-left
       (eliscript-emitter--emit-binary-infix
        "bit-shift-left" arguments "<<"))
      ('bit-shift-right
       (eliscript-emitter--emit-binary-infix
        "bit-shift-right" arguments ">>"))
      ('unsigned-bit-shift-right
       (eliscript-emitter--emit-binary-infix
        "unsigned-bit-shift-right" arguments ">>>"))
      ('value-type
       (eliscript-emitter--require-arity "value-type" arguments 1 1)
       (format "__eliscript_value_type(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('host-identity-token
       (eliscript-emitter--require-arity
        "host-identity-token" arguments 1 1)
       (format "__eliscript_host_identity_token(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('string-code-unit-at
       (eliscript-emitter--require-arity
        "string-code-unit-at" arguments 2 2)
       (format "(%s).charCodeAt(%s)"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('string-from-code-unit
       (eliscript-emitter--require-arity
        "string-from-code-unit" arguments 1 1)
       (format "String.fromCharCode(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('string-to-number
       (eliscript-emitter--require-arity "string-to-number" arguments 1 1)
       (format "__eliscript_to_number(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('string-to-bigint
       (eliscript-emitter--require-arity "string-to-bigint" arguments 1 1)
       (format
        "__eliscript_string_to_bigint(%s)"
        (eliscript-emitter-emit-expression (car arguments))))
      ('number-float64-words
       (eliscript-emitter--require-arity
        "number-float64-words" arguments 1 1)
       (format
        "__eliscript_number_float64_words(%s)"
        (eliscript-emitter-emit-expression (car arguments))))
      ('= (eliscript-emitter--emit-comparison "=" arguments "==="))
      ((or '/= 'not=)
       (eliscript-emitter--emit-distinct (symbol-name operator) arguments))
      ('< (eliscript-emitter--emit-comparison "<" arguments "<"))
      ('<= (eliscript-emitter--emit-comparison "<=" arguments "<="))
      ('> (eliscript-emitter--emit-comparison ">" arguments ">"))
      ('>= (eliscript-emitter--emit-comparison ">=" arguments ">="))
      ('1+
       (eliscript-emitter--require-arity "1+" arguments 1 1)
       (format "(%s + 1)" (eliscript-emitter-emit-expression (car arguments))))
      ('1-
       (eliscript-emitter--require-arity "1-" arguments 1 1)
       (eliscript-emitter--numeric-binary "-" (eliscript-emitter-emit-expression (car arguments)) "1"))
      ('eq
       (eliscript-emitter--require-arity (symbol-name operator) arguments 2 2)
       (format "(%s === %s)"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('equal
       (eliscript-emitter--require-arity "equal" arguments 2 2)
       (format "__eliscript_equal(%s, %s)"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('nil?
       (eliscript-emitter--require-arity "nil?" arguments 1 1)
       (format "(%s === null)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('undefined?
       (eliscript-emitter--require-arity "undefined?" arguments 1 1)
       (format "(%s === undefined)"
               (eliscript-emitter-emit-expression (car arguments))))
      ((or 'null 'nullish?)
       (eliscript-emitter--require-arity
        (symbol-name operator) arguments 1 1)
       (format "(%s == null)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('vector
       (format "__eliscript_vector(%s)"
               (eliscript-emitter--emit-arguments arguments)))
      ('hash-map
       (when (= (% (length arguments) 2) 1)
         (eliscript-emitter--fail
          "hash-map expects complete key/value pairs"))
       (format "__eliscript_hash_map(%s)"
               (eliscript-emitter--emit-arguments arguments)))
      ('hash-set
       (format "__eliscript_hash_set(%s)"
               (eliscript-emitter--emit-arguments arguments)))
      ('queue
       (format "__eliscript_queue(%s)"
               (eliscript-emitter--emit-arguments arguments)))
      ('list
       (format "__eliscript_list(%s)"
               (eliscript-emitter--emit-arguments arguments)))
      ('js-array
       (format "[%s]" (eliscript-emitter--emit-arguments arguments)))
      ('car
       (eliscript-emitter--require-arity "car" arguments 1 1)
       (format "__eliscript_first(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('cdr
       (eliscript-emitter--require-arity "cdr" arguments 1 1)
       (format "__eliscript_rest(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('cons
       (eliscript-emitter--require-arity "cons" arguments 2 2)
       (format "__eliscript_cons(%s, %s)"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('__eliscript_array_build
       (eliscript-emitter--require-arity "__eliscript_array_build" arguments 2 2)
       (format "__eliscript_array_build(%s, %s)"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('js-cons
       (eliscript-emitter--require-arity "js-cons" arguments 2 2)
       (format "[%s, ...((%s) ?? [])]"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('nth
       (eliscript-emitter--require-arity "nth" arguments 2 2)
       (format "__eliscript_nth(%s, %s, null)"
               (eliscript-emitter-emit-expression (nth 1 arguments))
               (eliscript-emitter-emit-expression (nth 0 arguments))))
      ('js-nth
       (eliscript-emitter--require-arity "js-nth" arguments 2 2)
       (format "((((%s) ?? [])[%s]) ?? null)"
               (eliscript-emitter-emit-expression (nth 1 arguments))
               (eliscript-emitter-emit-expression (nth 0 arguments))))
      ('aref
       (eliscript-emitter--require-arity "aref" arguments 2 2)
       (format "(%s)[%s]"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter--emit-property-key (nth 1 arguments))))
      ('length
       (eliscript-emitter--require-arity "length" arguments 1 1)
       (format "__eliscript_count(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('js-length
       (eliscript-emitter--require-arity "js-length" arguments 1 1)
       (format "((%s) ?? []).length"
               (eliscript-emitter-emit-expression (car arguments))))
      ('__eliscript_arity_error
       (eliscript-emitter--require-arity
        "__eliscript_arity_error" arguments 2 2)
       (format
        "__eliscript_arity_error(%s, %s)"
        (eliscript-emitter-emit-expression (nth 0 arguments))
        (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('object-keys
       (eliscript-emitter--require-arity "object-keys" arguments 1 1)
       (format "Object.keys((%s) ?? {})"
               (eliscript-emitter-emit-expression (car arguments))))
      ('object-has?
       (eliscript-emitter--require-arity "object-has?" arguments 2 2)
       (format "Object.prototype.hasOwnProperty.call((%s) ?? {}, %s)"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter--emit-property-key (nth 1 arguments))))
      ('object-assoc
       (eliscript-emitter--require-arity "object-assoc" arguments 3 3)
       (format "({...((%s) ?? {}), [%s]: %s})"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter--emit-property-key (nth 1 arguments))
               (eliscript-emitter-emit-expression (nth 2 arguments))))
      ('js-object
       (eliscript-emitter--emit-object arguments))
      ('get (eliscript-emitter--emit-get arguments))
      ('put
       (eliscript-emitter--require-arity "put" arguments 3 3)
       (format "((%s)[%s] = %s)"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter--emit-property-key (nth 1 arguments))
               (eliscript-emitter-emit-expression (nth 2 arguments))))
      ('js-call (eliscript-emitter--emit-js-call arguments))
      ('new
       (eliscript-emitter--require-arity "new" arguments 1)
       (format "new (%s)(%s)"
               (eliscript-emitter-emit-expression (car arguments))
               (eliscript-emitter--emit-arguments (cdr arguments))))
      ('js*
       (eliscript-emitter--require-arity "js*" arguments 1 1)
       (unless (stringp (car arguments))
         (eliscript-emitter--fail "js* expects a string literal"))
       (car arguments))
      ('print
       (format "console.log(%s)"
               (eliscript-emitter--emit-arguments arguments)))
      ('str
       (if (null arguments)
           "\"\""
         (format "(%s)"
                 (mapconcat
                  (lambda (argument)
                    (format "String(%s)"
                            (eliscript-emitter-emit-expression argument)))
                  arguments " + "))))
      ('funcall
       (eliscript-emitter--require-arity "funcall" arguments 1)
       (or (eliscript-emitter--emit-method-wrapper arguments)
           (eliscript-emitter--emit-primitive-invocation arguments)
           (format "%s(%s)"
                   (eliscript-emitter--emit-callee (car arguments))
                   (eliscript-emitter--emit-arguments (cdr arguments)))))
      ('apply
       (eliscript-emitter--require-arity "apply" arguments 2)
       (let ((fixed (butlast (cdr arguments)))
             (tail (car (last arguments))))
         (format "%s(%s...(%s ?? []))"
                 (eliscript-emitter--emit-callee (car arguments))
                 (if fixed
                     (concat (eliscript-emitter--emit-arguments fixed) ", ")
                   "")
                 (eliscript-emitter-emit-expression tail))))
      (_
       (when (memq operator '(defun defn defvar defconst export import module))
         (eliscript-emitter--fail "%s is only valid at module top level" operator))
       (format "%s(%s)"
               (eliscript-emitter--emit-callee operator)
               (eliscript-emitter--emit-arguments arguments))))))

(defun eliscript-emitter-emit-expression (form)
  "Emit FORM with explicit continuations for ordinary if expression trees."
  (if (and (consp form) (eq (car form) 'if))
      (eliscript-emitter--run-depth-plan #'eliscript-emitter--depth-plan :expression form nil)
    (eliscript-emitter--emit-expression-recursive form)))

(defun eliscript-emitter--emit-expression-recursive (form)
  "Emit Eliscript FORM as an ECMAScript expression."
  (cond
   ((and (consp form) (eq (car form) eliscript-emitter--tdz-assignment-tag))
    (let ((outputs (mapcar #'eliscript-emitter-emit-expression (nth 2 form))))
      (if (eq (nth 1 form) 'set!) (car outputs)
        (format "(%s)" (string-join outputs ", ")))))
   ((and (consp form) (eq (car form) eliscript-emitter--tdz-read-tag))
    (eliscript-emitter--tdz-read-text (nth 1 form) (nth 2 form)))
   ((and (consp form) (eq (car form) eliscript-emitter--tdz-write-tag))
    (eliscript-emitter--tdz-write-text (nth 1 form) (nth 2 form)
      (eliscript-emitter-emit-expression (nth 3 form))))
   ((null form) "null")
   ((eq form t) "true")
   ((numberp form) (eliscript-emitter--number-text form))
   ((stringp form) (eliscript-emitter--json-string form))
   ((keywordp form)
    (format "__eliscript_keyword(%s)"
            (eliscript-emitter--json-string
             (substring (symbol-name form) 1))))
   ((eq form 'false) "false")
   ((eq form 'undefined) "undefined")
   ((symbolp form) (eliscript-emitter--reference-name form))
   ((vectorp form)
    (format "__eliscript_vector(%s)"
            (mapconcat #'eliscript-emitter-emit-expression
                       (append form nil) ", ")))
   ((consp form)
    (unless (proper-list-p form)
      (eliscript-emitter--fail "dotted call forms are not supported: %S" form))
    (eliscript-emitter--emit-call form))
   (t (eliscript-emitter--fail "unsupported form: %S" form))))

(defun eliscript-emitter--emit-import (arguments)
  "Emit an ESM import declaration from ARGUMENTS."
  (eliscript-emitter--require-arity "import" arguments 1)
  (let ((module-name (car arguments))
        (specifiers (cdr arguments))
        default-binding
        namespace-binding
        named-bindings)
    (unless (stringp module-name)
      (eliscript-emitter--fail "import module must be a string"))
    (while specifiers
      (let ((specifier (pop specifiers)))
        (pcase specifier
          (:default
           (unless specifiers
             (eliscript-emitter--fail ":default requires a binding"))
           (setq default-binding
                 (eliscript-emitter--binding-name (pop specifiers))))
          (:as
           (unless specifiers
             (eliscript-emitter--fail ":as requires a namespace binding"))
           (setq namespace-binding
                 (eliscript-emitter--binding-name (pop specifiers))))
          ((pred symbolp)
           (push (eliscript-emitter--binding-name specifier) named-bindings))
          (_ (eliscript-emitter--fail "invalid import specifier: %S" specifier)))))
    (when (and namespace-binding named-bindings)
      (eliscript-emitter--fail "namespace and named imports cannot be combined"))
    (let ((clause
           (string-join
            (delq nil
                  (list default-binding
                        (and namespace-binding (concat "* as " namespace-binding))
                        (and named-bindings
                             (format "{%s}"
                                     (string-join (nreverse named-bindings) ", ")))))
            ", ")))
      (if (string-empty-p clause)
          (format "import %s;" (eliscript-emitter--json-string module-name))
        (format "import %s from %s;"
                clause (eliscript-emitter--json-string module-name))))))

(defun eliscript-emitter-emit-top-level (form)
  "Emit top-level Eliscript FORM as an ECMAScript declaration or statement."
  (if (not (consp form))
      (concat (eliscript-emitter-emit-expression form) ";")
    (let ((operator (car form))
          (arguments (cdr form)))
      (pcase operator
        ('module
         (eliscript-emitter--require-arity "module" arguments 1)
         (unless (symbolp (car arguments))
           (eliscript-emitter--fail "module name must be a symbol"))
         (mapconcat #'eliscript-emitter-emit-top-level (cdr arguments) "\n"))
        ((or 'import 'import-portable)
         (eliscript-emitter--emit-import arguments))
        ((or 'defvar 'defconst)
         (eliscript-emitter--require-arity (symbol-name operator) arguments 1 2)
         (concat
          (format "%s %s = %s;"
                  (if (eq operator 'defconst) "const" "let")
                  (eliscript-emitter--binding-name (car arguments))
                  (eliscript-emitter-emit-expression (cadr arguments)))
          (let ((record (and eliscript-emitter--tdz-state
                         (gethash form (plist-get eliscript-emitter--tdz-state :declarations)))))
            (when (eliscript-emitter--tdz-guarded-p record)
              (concat "\n" (eliscript-emitter--tdz-ready-name record) " = true;")))))
        ((or 'defun 'defn 'defasync)
         (eliscript-emitter--require-arity (symbol-name operator) arguments 2)
         (let ((name (nth 0 arguments))
               (parameter-forms (nth 1 arguments))
               (body (nthcdr 2 arguments)))
           (unless (symbolp name)
             (eliscript-emitter--fail "function name must be a symbol"))
           (let ((parameters
                  (eliscript-parameters-parse
                   parameter-forms
                   (lambda (_form message)
                     (eliscript-emitter--fail "%s" message)))))
             (format "%sfunction %s(%s) {\n%s\n}"
                     (if (eq operator 'defasync) "async " "")
                     (eliscript-emitter--binding-name name)
                     (mapconcat
                      #'eliscript-emitter--emit-parameter parameters ", ")
                     (eliscript-emitter--indent
                      (eliscript-emitter--emit-function-body
                       parameters body))))))
        ('export
         (eliscript-emitter--require-arity "export" arguments 1)
         (format "export {%s};"
                 (mapconcat #'eliscript-emitter--binding-name arguments ", ")))
        ('export-default
         (eliscript-emitter--require-arity "export-default" arguments 1 1)
         (format "export default %s;"
                 (eliscript-emitter-emit-expression (car arguments))))
        (_ (concat (eliscript-emitter-emit-expression form) ";"))))))

(defun eliscript-emitter--uses-number-conversion-p (forms)
  "Find the corresponding unquoted runtime operation without host recursion."
  (eliscript-emitter--some-form forms
    (lambda (node) (and (consp node) (memq (car node) '(string-to-number)) t)) '(quote)))

(defun eliscript-emitter--uses-numeric-coercion-p (forms)
  "Find unquoted dynamic numeric operations without host recursion."
  (eliscript-emitter--some-form forms
    (lambda (node) (and (consp node)
                       (eliscript-emitter--numeric-coercion-p (car node))
                       (or (not (eq (car node) '*)) (> (length (cdr node)) 1)))) '(quote)))

(defconst eliscript-emitter--primitive-runtime-import
  "import { stringToBigint as __eliscript_string_to_bigint, float64Words as __eliscript_number_float64_words, buildArray as __eliscript_array_build, unsupportedArity as __eliscript_arity_error } from \"eliscript/runtime/primitives.mjs\";\n")
(defun eliscript-emitter--uses-primitive-runtime-p (forms)
  "Find native conversion and private runtime calls in active forms."
  (eliscript-emitter--some-form forms
    (lambda (node) (and (consp node)
                       (memq (car node) '(string-to-bigint number-float64-words
                                         __eliscript_array_build __eliscript_arity_error)))) '(quote)))

(defconst eliscript-emitter--value-type-import
  "import { valueType as __eliscript_value_type } from \"eliscript/runtime/primitives.mjs\";\n")
(defun eliscript-emitter--uses-value-type-p (forms)
  "Find active value-type calls without traversing quoted fixture data."
  (eliscript-emitter--some-form forms
    (lambda (node) (and (consp node) (eq (car node) 'value-type))) '(quote)))

(defun eliscript-emitter--uses-host-identity-token-p (forms)
  "Retain the original host-token scan, including its quoted-form traversal."
  (eliscript-emitter--some-form forms
    (lambda (node) (and (consp node) (eq (car node) 'host-identity-token)))))

(defun eliscript-emitter--uses-literal-runtime-p (forms)
  "Find canonical literal construction without recursive ordinary-tree walks."
  (cl-some #'eliscript-emitter--form-uses-literal-runtime-p forms))

(defun eliscript-emitter--form-uses-literal-runtime-p (form)
  (let ((pending (list form)) found)
    (while (and pending (not found))
      (let ((item (pop pending)))
        (cond
         ((keywordp item) (setq found t))
         ((vectorp item) (setq found t))
         ((consp item)
          (let ((operator (car item)) (arguments (cdr item)))
            (cond
             ((eq operator 'quote) (setq found (eliscript-emitter--quoted-uses-literal-runtime-p (car arguments))))
             ((memq operator '(import import-portable)) nil)
             ((memq operator '(list vector hash-map hash-set queue)) (setq found t))
             ((eq operator 'js-object)
              ;; Retain the original complete pair traversal of object fields.
              (while arguments
                (let ((key (pop arguments)) (value (pop arguments)))
                  (when (or (and (not (or (keywordp key) (stringp key) (symbolp key)))
                                 (eliscript-emitter--form-uses-literal-runtime-p key))
                            (eliscript-emitter--form-uses-literal-runtime-p value)) (setq found t)))))
             (t
              (let ((index 0) selected)
                (dolist (child (if (memq operator '(get put js-call aref object-has? object-assoc)) arguments item))
                  (unless (and (memq operator '(get put js-call aref object-has? object-assoc)) (= index 1) (keywordp child))
                    (push child selected))
                  (setq index (1+ index)))
                (dolist (child selected) (push child pending))))))))))
    found))

(defun eliscript-emitter--uses-collection-runtime-p (forms)
  "Find the corresponding unquoted runtime operation without host recursion."
  (eliscript-emitter--some-form forms
    (lambda (node) (and (consp node) (memq (car node) '(nth length)) t)) '(quote)))

(defun eliscript-emitter--uses-list-runtime-p (forms)
  "Find the corresponding unquoted runtime operation without host recursion."
  (eliscript-emitter--some-form forms
    (lambda (node) (and (consp node) (memq (car node) '(car cdr cons)) t)) '(quote)))

(defun eliscript-emitter--uses-value-runtime-p (forms)
  "Find the corresponding unquoted runtime operation without host recursion."
  (eliscript-emitter--some-form forms
    (lambda (node) (and (consp node) (memq (car node) '(equal)) t)) '(quote)))

(defun eliscript-emitter--uses-imul-p (forms)
  "Find the corresponding unquoted runtime operation without host recursion."
  (eliscript-emitter--some-form forms
    (lambda (node) (and (consp node) (memq (car node) '(imul32)) t)) '(quote)))

(defconst eliscript-emitter--unicode-runtime-import
  "import \"eliscript/runtime/unicode-case.mjs\";\n")

(defun eliscript-emitter--runtime-capsule-p (filename module-name entries)
  "Recognize one of ENTRIES by full source and module identity."
  (let ((name (if (symbolp module-name) (symbol-name module-name) module-name)))
    (and (stringp filename)
         (cl-some
          (lambda (entry)
            (and (equal name (cdr entry))
                 (or (equal filename (car entry))
                     (and (file-name-absolute-p filename)
                          (string-suffix-p (concat "/" (car entry)) filename)))))
          entries))))

(defun eliscript-emitter--unicode-capsule-p (filename module-name)
  "Recognize bootstrap capsules by full source and module identity."
  (eliscript-emitter--runtime-capsule-p
   filename module-name
   '(("runtime/unicode-case.eli" . "eliscript.runtime.unicode-case")
     ("runtime/unicode-case-data.eli" . "eliscript.runtime.unicode-case-data")
     ("runtime/number-radix.eli" . "eliscript.runtime.number-radix")
     ("runtime/array-text.eli" . "eliscript.runtime.array-text")
     ("runtime/prelude.eli" . "eliscript.runtime.prelude")
     ("runtime/primitives.eli" . "eliscript.runtime.primitives")
     ("runtime/errors.eli" . "eliscript.runtime.errors")
     ("runtime/binding.eli" . "eliscript.runtime.binding"))))

(defun eliscript-emitter--array-text-capsule-p (filename module-name)
  "Recognize array-text bootstrap modules that emit raw numeric operators."
  (eliscript-emitter--runtime-capsule-p
   filename module-name
   '(("runtime/number-radix.eli" . "eliscript.runtime.number-radix")
     ("runtime/array-text.eli" . "eliscript.runtime.array-text"))))

(defun eliscript-emitter--forms-array-text-capsule-p (forms filename)
  "Require a single exact array-text bootstrap module and its source context."
  (and (= (length forms) 1) (consp (car forms))
       (eq (caar forms) 'module)
       (eliscript-emitter--array-text-capsule-p filename (cadar forms))))



(defun eliscript-emitter--forms-unicode-capsule-p (forms filename)
  "Require a single exact module as well as its compilation source context."
  (and (= (length forms) 1) (consp (car forms))
       (eq (caar forms) 'module)
       (eliscript-emitter--unicode-capsule-p filename (cadar forms))))



(defconst eliscript-emitter--math-runtime-import
  "import \"eliscript/runtime/math.mjs\";\n")

(defun eliscript-emitter--math-reference-p (value)
  "Recognize explicit references to the real Math namespace."
  (let ((name (if (symbolp value) (symbol-name value) value)))
    (and (stringp name)
         (or (member name '("Math" "globalThis/Math" "globalThis.Math"))
             (cl-some (lambda (prefix) (string-prefix-p prefix name))
                      '("Math/" "Math." "globalThis/Math/" "globalThis/Math."
                        "globalThis.Math/" "globalThis.Math."))))))

(defun eliscript-emitter--uses-math-runtime-p (forms)
  "Find unquoted Math references, including the existing raw namespace form."
  (eliscript-emitter--some-form forms
    (lambda (node)
      (or (and (symbolp node) (eliscript-emitter--math-reference-p node))
          (and (consp node) (eq (car node) 'js*)
               (member (cadr node) '("Math" "globalThis.Math"))))) '(quote)))

(defun eliscript-emitter--uses-array-text-p (forms)
  "Find unquoted guarded method calls without host recursion."
  (eliscript-emitter--some-form forms
    (lambda (node)
      (and (consp node)
           (or (and (eq (car node) 'js-call)
                    (eliscript-emitter--array-text-key-p (nth 2 node)))
               (eliscript-emitter--qualified-apply-callee-p (car node))
               (and (memq (car node) '(funcall apply))
                    (eliscript-emitter--qualified-apply-callee-p (nth 1 node)))))) '(quote)))

(defun eliscript-emit-module (forms &optional filename)
  "Emit FORMS as one ECMAScript module."
  (let* ((eliscript-emitter--tdz-state (eliscript-emitter--tdz-state-create))
         (scope (make-hash-table :test #'equal)))
    (eliscript-emitter--tdz-ground-predeclare forms scope eliscript-emitter--tdz-state)
    (eliscript-emitter--emit-module-ready
       (if (plist-get eliscript-emitter--tdz-state :variables)
           (eliscript-emitter--tdz-ground-rewrite forms scope eliscript-emitter--tdz-state)
         forms)
       forms filename)))

(defun eliscript-emitter--emit-module-ready (forms &optional source-forms filename)
  (let* ((eliscript-emitter--temporary-counter 0)
         (prologue-forms (or source-forms forms))
         (eliscript-emitter--numeric-profile
          (or eliscript-emitter--numeric-profile
              (eliscript-emitter--forms-array-text-capsule-p prologue-forms filename))))
    (concat
     "// Generated by Eliscript. Do not edit.\n"
     (eliscript-emitter--tdz-prologue eliscript-emitter--tdz-state)
     (if (eliscript-emitter--forms-unicode-capsule-p prologue-forms filename)
         "" eliscript-emitter--unicode-runtime-import)
     (if (eliscript-emitter--uses-math-runtime-p prologue-forms) eliscript-emitter--math-runtime-import "")
     (let ((numeric-coercion (and (not eliscript-emitter--numeric-profile)
                                  (eliscript-emitter--uses-numeric-coercion-p prologue-forms))))
       (eliscript-emitter--prelude-import
        (and (not (eliscript-emitter--forms-array-text-capsule-p prologue-forms filename))
             (eliscript-emitter--uses-array-text-p prologue-forms))
        (and (not eliscript-emitter--numeric-profile)
             (or numeric-coercion (eliscript-emitter--uses-number-conversion-p prologue-forms)))
        numeric-coercion
        (and (not eliscript-emitter--numeric-profile)
             (eliscript-emitter--uses-imul-p prologue-forms))))
     (if (eliscript-emitter--uses-literal-runtime-p prologue-forms)
         eliscript-emitter--literal-runtime-import
       "")
     (if (eliscript-emitter--uses-collection-runtime-p prologue-forms)
         eliscript-emitter--collection-runtime-import
       "")
     (if (eliscript-emitter--uses-list-runtime-p prologue-forms)
         eliscript-emitter--list-runtime-import
       "")
     (if (eliscript-emitter--uses-value-runtime-p prologue-forms)
         eliscript-emitter--value-runtime-import
       "")
     (if (eliscript-emitter--uses-primitive-runtime-p prologue-forms)
         eliscript-emitter--primitive-runtime-import "")
     (if (eliscript-emitter--uses-value-type-p prologue-forms)
         eliscript-emitter--value-type-import "")
     "const __eliscript_truthy = (value) => value !== false && value != null;\n"
     (if (eliscript-emitter--uses-host-identity-token-p prologue-forms)
         eliscript-emitter--host-identity-token-helper
       "")
     "\n"
     (mapconcat #'eliscript-emitter-emit-top-level forms "\n\n")
     "\n")))

(provide 'eliscript-emitter)

;;; eliscript-emitter.el ends here
