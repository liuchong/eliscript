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
  (signal 'eliscript-compile-error
          (list (apply #'format format-string arguments))))

(defun eliscript-emitter--json-string (value)
  "Encode string VALUE as an ECMAScript string literal."
  (json-serialize value))

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

(defun eliscript-emitter--emit-do (forms)
  "Emit FORMS as one value-producing expression."
  (pcase (length forms)
    (0 "null")
    (1 (eliscript-emitter-emit-expression (car forms)))
    (_ (format "(() => {\n%s\n})()"
               (eliscript-emitter--indent
                (eliscript-emitter--emit-returning-body forms))))))

(defun eliscript-emitter--parse-binding (binding)
  "Return the name and initializer represented by BINDING."
  (cond
   ((symbolp binding) (list binding nil))
   ((and (listp binding) (<= 1 (length binding)) (<= (length binding) 2)
         (symbolp (car binding)))
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
                              (eliscript-emitter--binding-name (car item)))
                            parsed))
             (values (mapcar (lambda (item)
                               (eliscript-emitter-emit-expression (cadr item)))
                             parsed)))
        (format "((%s) => {\n%s\n})(%s)"
                (string-join names ", ")
                (eliscript-emitter--indent
                 (eliscript-emitter--emit-returning-body body))
                (string-join values ", "))))))

(defun eliscript-emitter--emit-function (arguments body)
  "Emit a function with ARGUMENTS and BODY."
  (unless (listp arguments)
    (eliscript-emitter--fail "function arguments must be a list"))
  (when (cl-find-if-not #'symbolp arguments)
    (eliscript-emitter--fail "function arguments must be symbols: %S" arguments))
  (format "(%s) => {\n%s\n}"
          (mapconcat #'eliscript-emitter--binding-name arguments ", ")
          (eliscript-emitter--indent
           (eliscript-emitter--emit-returning-body body))))

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

(defun eliscript-emitter--emit-while (arguments)
  "Emit a value-producing while expression from ARGUMENTS."
  (eliscript-emitter--require-arity "while" arguments 1)
  (let ((test (car arguments))
        (body (cdr arguments)))
    (format "(() => {\n%s\n})()"
            (eliscript-emitter--indent
             (concat
              (format "while (__eliscript_truthy(%s)) {\n"
                      (eliscript-emitter-emit-expression test))
              (eliscript-emitter--indent
               (mapconcat (lambda (form)
                            (concat (eliscript-emitter-emit-expression form) ";"))
                          body "\n"))
              "\n}\nreturn null;")))))

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
      (format "((%s) => (__eliscript_truthy(%s) ? %s : %s))(%s)"
              temporary temporary
              (if (eq kind 'and) rest temporary)
              (if (eq kind 'and) temporary rest)
              first)))))

(defun eliscript-emitter--emit-infix (name arguments operator &optional minimum)
  "Emit ARGUMENTS joined by OPERATOR for Lisp function NAME."
  (eliscript-emitter--require-arity name arguments (or minimum 2))
  (format "(%s)"
          (mapconcat #'eliscript-emitter-emit-expression
                     arguments
                     (format " %s " operator))))

(defun eliscript-emitter--emit-comparison (name arguments operator)
  "Emit one-evaluation n-ary comparison NAME using OPERATOR."
  (eliscript-emitter--require-arity name arguments 2)
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
            (eliscript-emitter--emit-arguments arguments))))

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
  "Emit quoted Eliscript VALUE as plain ECMAScript data."
  (cond
   ((null value) "[]")
   ((eq value t) "true")
   ((numberp value) (number-to-string value))
   ((stringp value) (eliscript-emitter--json-string value))
   ((symbolp value) (eliscript-emitter--json-string (symbol-name value)))
   ((vectorp value)
    (format "[%s]"
            (mapconcat #'eliscript-emitter--emit-quoted (append value nil) ", ")))
   ((consp value)
    (unless (proper-list-p value)
      (eliscript-emitter--fail "dotted quoted lists are not supported yet"))
    (format "[%s]"
            (mapconcat #'eliscript-emitter--emit-quoted value ", ")))
   (t (eliscript-emitter--fail "cannot quote value: %S" value))))

(defun eliscript-emitter--emit-call (form)
  "Emit list FORM as an expression."
  (let ((operator (car form))
        (arguments (cdr form)))
    (pcase operator
      ((or 'lambda 'fn)
       (eliscript-emitter--require-arity (symbol-name operator) arguments 1)
       (eliscript-emitter--emit-function (car arguments) (cdr arguments)))
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
      ((or 'eq 'equal)
       (eliscript-emitter--require-arity (symbol-name operator) arguments 2 2)
       (format "(%s === %s)"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('null
       (eliscript-emitter--require-arity "null" arguments 1 1)
       (format "(%s == null)"
               (eliscript-emitter-emit-expression (car arguments))))
      ((or 'list 'vector 'array)
       (format "[%s]" (eliscript-emitter--emit-arguments arguments)))
      ('car
       (eliscript-emitter--require-arity "car" arguments 1 1)
       (format "(((%s) ?? [])[0] ?? null)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('cdr
       (eliscript-emitter--require-arity "cdr" arguments 1 1)
       (format "((%s) ?? []).slice(1)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('cons
       (eliscript-emitter--require-arity "cons" arguments 2 2)
       (format "[%s, ...((%s) ?? [])]"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('nth
       (eliscript-emitter--require-arity "nth" arguments 2 2)
       (format "((((%s) ?? [])[%s]) ?? null)"
               (eliscript-emitter-emit-expression (nth 1 arguments))
               (eliscript-emitter-emit-expression (nth 0 arguments))))
      ('aref
       (eliscript-emitter--require-arity "aref" arguments 2 2)
       (format "(%s)[%s]"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('length
       (eliscript-emitter--require-arity "length" arguments 1 1)
       (format "((%s) ?? []).length"
               (eliscript-emitter-emit-expression (car arguments))))
      ('object (eliscript-emitter--emit-object arguments))
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
    (eliscript-emitter--json-string (substring (symbol-name form) 1)))
   ((eq form 'false) "false")
   ((eq form 'undefined) "undefined")
   ((symbolp form) (eliscript-emitter--reference-name form))
   ((vectorp form)
    (format "[%s]"
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
        ('import (eliscript-emitter--emit-import arguments))
        ((or 'defvar 'defconst)
         (eliscript-emitter--require-arity (symbol-name operator) arguments 1 2)
         (format "%s %s = %s;"
                 (if (eq operator 'defconst) "const" "let")
                 (eliscript-emitter--binding-name (car arguments))
                 (eliscript-emitter-emit-expression (cadr arguments))))
        ((or 'defun 'defn)
         (eliscript-emitter--require-arity (symbol-name operator) arguments 2)
         (let ((name (nth 0 arguments))
               (parameters (nth 1 arguments))
               (body (nthcdr 2 arguments)))
           (unless (symbolp name)
             (eliscript-emitter--fail "function name must be a symbol"))
           (unless (listp parameters)
             (eliscript-emitter--fail "function arguments must be a list"))
           (format "function %s(%s) {\n%s\n}"
                   (eliscript-emitter--binding-name name)
                   (mapconcat #'eliscript-emitter--binding-name parameters ", ")
                   (eliscript-emitter--indent
                    (eliscript-emitter--emit-returning-body body)))))
        ('export
         (eliscript-emitter--require-arity "export" arguments 1)
         (format "export {%s};"
                 (mapconcat #'eliscript-emitter--binding-name arguments ", ")))
        ('export-default
         (eliscript-emitter--require-arity "export-default" arguments 1 1)
         (format "export default %s;"
                 (eliscript-emitter-emit-expression (car arguments))))
        (_ (concat (eliscript-emitter-emit-expression form) ";"))))))

(defun eliscript-emit-module (forms)
  "Emit FORMS as one ECMAScript module."
  (let ((eliscript-emitter--temporary-counter 0))
    (concat
     "// Generated by Eliscript. Do not edit.\n"
     "const __eliscript_truthy = (value) => value !== false && value != null;\n\n"
     (mapconcat #'eliscript-emitter-emit-top-level forms "\n\n")
     "\n")))

(provide 'eliscript-emitter)

;;; eliscript-emitter.el ends here
