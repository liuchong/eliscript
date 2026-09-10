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

(defconst eliscript-emitter--host-identity-token-helper
  "const __eliscript_host_identity_token = (() => { const objects = new WeakMap(); const symbols = new Map(); let next = 1; return (value) => { const type = typeof value; if ((type !== \"object\" || value === null) && type !== \"function\" && type !== \"symbol\") throw new TypeError(\"host-identity-token expects an object, function, or symbol\"); const identities = type === \"symbol\" ? symbols : objects; const cached = identities.get(value); if (cached !== undefined) return cached; if (next > Number.MAX_SAFE_INTEGER) throw new RangeError(\"host identity token space exhausted\"); const token = next; next += 1; identities.set(value, token); return token; }; })();\n"
  "Generated module helper for process-local opaque host identities.")
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

(defun eliscript-emitter--fail (format-string &rest arguments)
  "Signal a compiler error using FORMAT-STRING and ARGUMENTS."
  (apply #'eliscript-diagnostic-signal
         'eliscript-compile-error "ELI-E0001" "emission"
         nil nil format-string arguments))

(defun eliscript-emitter--json-string (value)
  "Encode string VALUE as an ECMAScript string literal."
  (let ((encoded (json-serialize value)))
    ;; Emacs 30 returns UTF-8 JSON strings as unibyte data.  Decode before
    ;; composing them with multibyte emitter fragments so non-ASCII values do
    ;; not turn into one replacement character per encoded byte.
    (if (multibyte-string-p encoded)
        encoded
      (decode-coding-string encoded 'utf-8-unix))))

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

(defun eliscript-emitter--emit-callee (form)
  "Emit FORM in a position where ECMAScript expects a callable value."
  (let ((output (eliscript-emitter-emit-expression form)))
    (if (symbolp form) output (format "(%s)" output))))

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

(defun eliscript-emitter--emit-returning-body (forms)
  "Emit FORMS as a block body that returns its final value."
  (if (null forms)
      "return null;"
    (let ((initial (butlast forms))
          (final (car (last forms))))
      (mapconcat #'identity
                 (append
                  (mapcar (lambda (form)
                            (concat (eliscript-emitter-emit-expression form) ";"))
                          initial)
                  (list (concat "return "
                                (eliscript-emitter-emit-expression final)
                                ";")))
                 "\n"))))

(defun eliscript-emitter--emit-statement-body (forms)
  "Emit FORMS as statements whose values are discarded."
  (mapconcat
   (lambda (form)
     (concat (eliscript-emitter-emit-expression form) ";"))
   forms
   "\n"))

(defun eliscript-emitter--contains-await-p (form)
  "Return non-nil when FORM contains `await' in the current function."
  (cond
   ((vectorp form)
    (cl-some #'eliscript-emitter--contains-await-p (append form nil)))
   ((consp form)
    (let ((operator (car form)))
      (cond
       ((eq operator 'await) t)
       ((memq operator '(lambda fn async)) nil)
       (t (cl-some #'eliscript-emitter--contains-await-p form)))))
   (t nil)))

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
    (format "%s(%s) => {\n%s\n}"
            (if asynchronous "async " "")
            (mapconcat #'eliscript-emitter--emit-parameter parameters ", ")
            (eliscript-emitter--indent
             (eliscript-emitter--emit-function-body parameters body)))))

(defun eliscript-emitter--contains-function-recur-p (form)
  "Return non-nil when FORM recurs to its current function."
  (cond
   ((vectorp form)
    (cl-some #'eliscript-emitter--contains-function-recur-p
             (append form nil)))
   ((consp form)
    (let ((operator (car form)))
      (cond
       ((eq operator 'recur) t)
       ((memq operator '(lambda fn async loop)) nil)
       (t
        (cl-some #'eliscript-emitter--contains-function-recur-p form)))))
   (t nil)))

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
  (if (null clauses)
      "return null;"
    (let ((clause (car clauses)))
      (unless (and (listp clause) clause)
        (eliscript-emitter--fail "cond clause must be a non-empty list"))
      (let ((test (car clause))
            (body (cdr clause)))
        (if (eq test t)
            (eliscript-emitter--emit-tail-body body target)
          (format "if (__eliscript_truthy(%s)) {\n%s\n} else {\n%s\n}"
                  (eliscript-emitter-emit-expression test)
                  (eliscript-emitter--indent
                   (eliscript-emitter--emit-tail-body body target))
                  (eliscript-emitter--indent
                   (eliscript-emitter--emit-tail-cond
                    (cdr clauses) target))))))))

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

(defun eliscript-emitter--emit-tail-short-circuit (arguments kind target)
  "Emit recur-aware short-circuit ARGUMENTS of KIND for TARGET."
  (cond
   ((null arguments)
    (format "return %s;" (if (eq kind 'and) "true" "null")))
   ((null (cdr arguments))
    (eliscript-emitter--emit-tail-form (car arguments) target))
   (t
    (let ((temporary (eliscript-emitter--fresh-name)))
      (format
       "const %s = %s;\nif (__eliscript_truthy(%s)) {\n%s\n} else {\n%s\n}"
       temporary
       (eliscript-emitter-emit-expression (car arguments))
       temporary
       (eliscript-emitter--indent
        (if (eq kind 'and)
            (eliscript-emitter--emit-tail-short-circuit
             (cdr arguments) kind target)
          (format "return %s;" temporary)))
       (eliscript-emitter--indent
        (if (eq kind 'and)
            (format "return %s;" temporary)
          (eliscript-emitter--emit-tail-short-circuit
           (cdr arguments) kind target))))))))

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

(defun eliscript-emitter--emit-function-body (parameters body)
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
  (format "(__eliscript_truthy(%s) ? %s : %s)"
          (eliscript-emitter-emit-expression (nth 0 arguments))
          (eliscript-emitter-emit-expression (nth 1 arguments))
          (eliscript-emitter-emit-expression (nth 2 arguments))))

(defun eliscript-emitter--emit-cond (clauses)
  "Emit nested conditional expressions for CLAUSES."
  (if (null clauses)
      "null"
    (let ((clause (car clauses)))
      (unless (and (listp clause) clause)
        (eliscript-emitter--fail "invalid cond clause: %S" clause))
      (let ((test (car clause))
            (body (cdr clause)))
        (if (eq test t)
            (eliscript-emitter--emit-do body)
          (format "(__eliscript_truthy(%s) ? %s : %s)"
                  (eliscript-emitter-emit-expression test)
                  (eliscript-emitter--emit-do body)
                  (eliscript-emitter--emit-cond (cdr clauses))))))))

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
       (format "while (__eliscript_truthy(%s)) {\n"
               (eliscript-emitter-emit-expression test))
       (eliscript-emitter--indent
        (mapconcat (lambda (form)
                     (concat (eliscript-emitter-emit-expression form) ";"))
                   body "\n"))
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
  (cond
   ((null arguments) (if (eq kind 'and) "true" "null"))
   ((null (cdr arguments))
    (eliscript-emitter-emit-expression (car arguments)))
   (t
    (let ((temporary (eliscript-emitter--fresh-name))
          (first (eliscript-emitter-emit-expression (car arguments)))
          (rest (eliscript-emitter--emit-short-circuit (cdr arguments) kind)))
      (if (eliscript-emitter--contains-await-p (cdr arguments))
          (format
           "(await (async (%s) => (__eliscript_truthy(%s) ? %s : %s))(%s))"
           temporary temporary
           (if (eq kind 'and) rest temporary)
           (if (eq kind 'and) temporary rest)
           first)
        (format "((%s) => (__eliscript_truthy(%s) ? %s : %s))(%s)"
                temporary temporary
                (if (eq kind 'and) rest temporary)
                (if (eq kind 'and) temporary rest)
                first))))))

(defun eliscript-emitter--emit-infix (name arguments operator &optional minimum)
  "Emit ARGUMENTS joined by OPERATOR for Lisp function NAME."
  (eliscript-emitter--require-arity name arguments (or minimum 2))
  (format "(%s)"
          (mapconcat #'eliscript-emitter-emit-expression
                     arguments
                     (format " %s " operator))))

(defun eliscript-emitter--emit-binary-infix (name arguments operator)
  "Emit exact binary NAME over ARGUMENTS using JavaScript OPERATOR."
  (eliscript-emitter--require-arity name arguments 2 2)
  (format "(%s %s %s)"
          (eliscript-emitter-emit-expression (nth 0 arguments))
          operator
          (eliscript-emitter-emit-expression (nth 1 arguments))))

(defun eliscript-emitter--emit-comparison (name arguments operator)
  "Emit one-evaluation n-ary comparison NAME using OPERATOR."
  (eliscript-emitter--require-arity name arguments 2)
  (if (= (length arguments) 2)
      (format "(%s %s %s)"
              (eliscript-emitter-emit-expression (nth 0 arguments))
              operator
              (eliscript-emitter-emit-expression (nth 1 arguments)))
    (let ((parameters (mapcar (lambda (_argument)
                                (eliscript-emitter--fresh-name))
                              arguments))
          comparisons)
      (cl-loop for left on parameters
               while (cdr left)
               do (push (format "%s %s %s" (car left) operator (cadr left))
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

(defun eliscript-emitter--emit-js-call (arguments)
  "Emit a receiver-preserving JavaScript method call from ARGUMENTS."
  (eliscript-emitter--require-arity "js-call" arguments 2)
  (format "(%s)[%s](%s)"
          (eliscript-emitter-emit-expression (nth 0 arguments))
          (eliscript-emitter--emit-property-key (nth 1 arguments))
          (eliscript-emitter--emit-arguments (nthcdr 2 arguments))))

(defun eliscript-emitter--emit-quoted (value)
  "Emit quoted Eliscript VALUE as canonical persistent data."
  (cond
   ((null value) "__eliscript_list()")
   ((eq value t) "true")
   ((eq value 'undefined) "undefined")
   ((numberp value) (number-to-string value))
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
       (format "(!__eliscript_truthy(%s))"
               (eliscript-emitter-emit-expression (car arguments))))
      ('quote
       (eliscript-emitter--require-arity "quote" arguments 1 1)
       (eliscript-emitter--emit-quoted (car arguments)))
      ('+ (if arguments
              (format "(%s)" (mapconcat #'eliscript-emitter-emit-expression
                                         arguments " + "))
            "0"))
      ('* (if arguments
              (format "(%s)" (mapconcat #'eliscript-emitter-emit-expression
                                         arguments " * "))
            "1"))
      ('-
       (eliscript-emitter--require-arity "-" arguments 1)
       (if (= (length arguments) 1)
           (format "(-%s)" (eliscript-emitter-emit-expression (car arguments)))
         (eliscript-emitter--emit-infix "-" arguments "-")))
      ('/
       (eliscript-emitter--require-arity "/" arguments 1)
       (if (= (length arguments) 1)
           (format "(1 / %s)" (eliscript-emitter-emit-expression (car arguments)))
         (eliscript-emitter--emit-infix "/" arguments "/")))
      ((or '% 'mod) (eliscript-emitter--emit-infix (symbol-name operator)
                                                    arguments "%"))
      ('int32
       (eliscript-emitter--require-arity "int32" arguments 1 1)
       (format "(%s | 0)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('uint32
       (eliscript-emitter--require-arity "uint32" arguments 1 1)
       (format "(%s >>> 0)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('imul32
       (eliscript-emitter--require-arity "imul32" arguments 2 2)
       (format "Math.imul(%s, %s)"
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
       (format "(~%s)"
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
       (format
        "((__eliscript_value) => { if (__eliscript_value === null) return \"null\"; const __eliscript_host_type = typeof __eliscript_value; if (__eliscript_host_type !== \"object\" && __eliscript_host_type !== \"function\") return __eliscript_host_type; try { const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for(\"eliscript.value.type\")); if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, \"value\") && (__eliscript_type.value === \"keyword\" || __eliscript_type.value === \"symbol\")) return __eliscript_type.value; const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, \"kind\"); if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, \"value\")) { if (__eliscript_kind.value === \"eliscript/keyword\") return \"keyword\"; if (__eliscript_kind.value === \"eliscript/symbol\") return \"symbol\"; } return __eliscript_host_type; } catch { return __eliscript_host_type; } })(%s)"
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
       (format "Number(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('string-to-bigint
       (eliscript-emitter--require-arity "string-to-bigint" arguments 1 1)
       (format
        "((__eliscript_text) => { try { return BigInt(__eliscript_text); } catch { return null; } })(%s)"
        (eliscript-emitter-emit-expression (car arguments))))
      ('number-float64-words
       (eliscript-emitter--require-arity
        "number-float64-words" arguments 1 1)
       (format
        "((__eliscript_number) => { const __eliscript_bytes = new DataView(new ArrayBuffer(8)); __eliscript_bytes.setFloat64(0, __eliscript_number === 0 ? 0 : __eliscript_number, true); return [__eliscript_bytes.getUint32(0, true), __eliscript_bytes.getUint32(4, true)]; })(%s)"
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
       (format "(%s - 1)" (eliscript-emitter-emit-expression (car arguments))))
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
        "((label, arity) => { throw new TypeError(label + \" received unsupported arity: \" + arity); })(%s, %s)"
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
       (format "new %s(%s)"
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
       (format "%s(%s)"
               (eliscript-emitter--emit-callee (car arguments))
               (eliscript-emitter--emit-arguments (cdr arguments))))
      ('apply
       (eliscript-emitter--require-arity "apply" arguments 2 2)
       (format "%s(...%s)"
               (eliscript-emitter--emit-callee (car arguments))
               (eliscript-emitter-emit-expression (cadr arguments))))
      (_
       (when (memq operator '(defun defn defvar defconst export import module))
         (eliscript-emitter--fail "%s is only valid at module top level" operator))
       (format "%s(%s)"
               (eliscript-emitter--emit-callee operator)
               (eliscript-emitter--emit-arguments arguments))))))

(defun eliscript-emitter-emit-expression (form)
  "Emit Eliscript FORM as an ECMAScript expression."
  (cond
   ((null form) "null")
   ((eq form t) "true")
   ((numberp form)
    (let ((text (number-to-string form)))
      (when (string-match-p "INF\\|NaN" text)
        (eliscript-emitter--fail "non-finite numbers are not supported: %S" form))
      text))
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
         (format "%s %s = %s;"
                 (if (eq operator 'defconst) "const" "let")
                 (eliscript-emitter--binding-name (car arguments))
                 (eliscript-emitter-emit-expression (cadr arguments))))
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

(defun eliscript-emitter--uses-host-identity-token-p (forms)
  "Return non-nil when FORMS contain a host identity token call."
  (cl-labels
      ((walk
        (form)
        (cond
         ((vectorp form) (cl-some #'walk (append form nil)))
         ((consp form)
          (or (eq (car form) 'host-identity-token)
              (cl-some #'walk form)))
         (t nil))))
    (cl-some #'walk forms)))

(defun eliscript-emitter--uses-literal-runtime-p (forms)
  "Return non-nil when FORMS construct canonical language literal values."
  (cl-labels
      ((walk-object
        (arguments)
        (let (found)
          (while arguments
            (let ((key (pop arguments))
                  (value (pop arguments)))
              (when (or (and (not (or (keywordp key)
                                      (stringp key)
                                      (symbolp key)))
                             (walk key))
                        (walk value))
                (setq found t))))
          found))
       (walk-static-key-call
        (arguments key-index)
        (cl-loop
         for argument in arguments
         for index from 0
         thereis
         (and (not (and (= index key-index) (keywordp argument)))
              (walk argument))))
       (walk
        (form)
        (cond
         ((keywordp form) t)
         ((vectorp form) t)
         ((consp form)
          (let ((operator (car form))
                (arguments (cdr form)))
            (cond
             ((eq operator 'quote)
              (eliscript-emitter--quoted-uses-literal-runtime-p
               (car arguments)))
             ((memq operator '(import import-portable)) nil)
             ((memq operator '(list vector hash-map hash-set queue)) t)
             ((eq operator 'js-object) (walk-object arguments))
             ((memq operator '(get put js-call aref object-has? object-assoc))
              (walk-static-key-call arguments 1))
             (t (cl-some #'walk form)))))
         (t nil))))
    (cl-some #'walk forms)))

(defun eliscript-emitter--uses-collection-runtime-p (forms)
  "Return non-nil when FORMS use protocol-driven collection operations."
  (cl-labels
      ((walk
        (form)
        (cond
         ((vectorp form) (cl-some #'walk (append form nil)))
         ((consp form)
          (cond
           ((eq (car form) 'quote) nil)
           ((memq (car form) '(nth length)) t)
           (t (cl-some #'walk form))))
         (t nil))))
    (cl-some #'walk forms)))

(defun eliscript-emitter--uses-list-runtime-p (forms)
  "Return non-nil when FORMS use canonical persistent List operations."
  (cl-labels
      ((walk
        (form)
        (cond
         ((vectorp form) (cl-some #'walk (append form nil)))
         ((consp form)
          (cond
           ((eq (car form) 'quote) nil)
           ((memq (car form) '(car cdr cons)) t)
           (t (cl-some #'walk form))))
         (t nil))))
    (cl-some #'walk forms)))

(defun eliscript-emitter--uses-value-runtime-p (forms)
  "Return non-nil when FORMS use canonical language value equality."
  (cl-labels
      ((walk
        (form)
        (cond
         ((vectorp form) (cl-some #'walk (append form nil)))
         ((consp form)
          (cond
           ((eq (car form) 'quote) nil)
           ((eq (car form) 'equal) t)
           (t (cl-some #'walk form))))
         (t nil))))
    (cl-some #'walk forms)))

(defun eliscript-emit-module (forms)
  "Emit FORMS as one ECMAScript module."
  (let ((eliscript-emitter--temporary-counter 0))
    (concat
     "// Generated by Eliscript. Do not edit.\n"
     (if (eliscript-emitter--uses-literal-runtime-p forms)
         eliscript-emitter--literal-runtime-import
       "")
     (if (eliscript-emitter--uses-collection-runtime-p forms)
         eliscript-emitter--collection-runtime-import
       "")
     (if (eliscript-emitter--uses-list-runtime-p forms)
         eliscript-emitter--list-runtime-import
       "")
     (if (eliscript-emitter--uses-value-runtime-p forms)
         eliscript-emitter--value-runtime-import
       "")
     "const __eliscript_truthy = (value) => value !== false && value != null;\n"
     (if (eliscript-emitter--uses-host-identity-token-p forms)
         eliscript-emitter--host-identity-token-helper
       "")
     "\n"
     (mapconcat #'eliscript-emitter-emit-top-level forms "\n\n")
     "\n")))

(provide 'eliscript-emitter)

;;; eliscript-emitter.el ends here
