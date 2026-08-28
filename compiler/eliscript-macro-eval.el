;;; eliscript-macro-eval.el --- Deterministic macro evaluation -*- lexical-binding: t; -*-

;;; Commentary:

;; Macro bodies run over native, location-free Eliscript data.  This evaluator
;; intentionally exposes a small pure language instead of the Emacs runtime.

;;; Code:

(require 'cl-lib)
(require 'eliscript-diagnostic)

(define-error 'eliscript-macro-eval-error
	      "Eliscript macro evaluation error")

(cl-defstruct (eliscript-macro-eval-parameters
               (:constructor eliscript-macro-eval-parameters-create))
  required
  optional
  rest)

(cl-defstruct (eliscript-macro-eval--scope
               (:constructor eliscript-macro-eval--scope-create))
  parent
  values)

(defconst eliscript-macro-eval--missing (make-symbol "missing")
  "Sentinel that distinguishes an absent value from source `undefined'.")

(defconst eliscript-macro-eval--quasiquote-symbol (intern "`")
  "Reader symbol used for quasiquote forms.")

(defconst eliscript-macro-eval--unquote-symbol (intern ",")
  "Reader symbol used for unquote forms.")

(defconst eliscript-macro-eval--splice-symbol (intern ",@")
  "Reader symbol used for unquote-splicing forms.")

(defun eliscript-macro-eval--fail (format-string &rest arguments)
  "Signal a macro evaluation error using FORMAT-STRING and ARGUMENTS."
  (apply #'eliscript-diagnostic-signal
         'eliscript-macro-eval-error "ELI-X0002" "macro-evaluation"
         nil nil format-string arguments))

(defun eliscript-macro-eval--symbol-p (value)
  "Return non-nil when VALUE is an ordinary Eliscript symbol."
  (and (symbolp value)
       value
       (not (keywordp value))
       (not (memq value '(t false undefined)))))

(defun eliscript-macro-eval-symbol-p (value)
  "Return non-nil when VALUE is an ordinary Eliscript symbol."
  (eliscript-macro-eval--symbol-p value))

(defun eliscript-macro-eval--list-p (value)
  "Return non-nil when VALUE is a proper Eliscript list."
  (or (null value) (and (consp value) (proper-list-p value))))

(defun eliscript-macro-eval--sequence-items (value)
  "Return VALUE as list items, or the missing sentinel when not a sequence."
  (cond
   ((null value) nil)
   ((and (consp value) (proper-list-p value)) value)
   ((vectorp value) (append value nil))
   (t eliscript-macro-eval--missing)))

(defun eliscript-macro-eval--boolean (value)
  "Return an Eliscript boolean for host predicate VALUE."
  (if value t 'false))

(defun eliscript-macro-eval--truthy-p (value)
  "Return non-nil when VALUE is true under Eliscript truthiness."
  (not (memq value '(nil false undefined))))

(defun eliscript-macro-eval--display (value)
  "Return a stable source-like display string for VALUE."
  (cond
   ((null value) "nil")
   ((eq value t) "t")
   ((eq value 'false) "false")
   ((eq value 'undefined) "undefined")
   ((stringp value) (prin1-to-string value))
   ((symbolp value) (symbol-name value))
   ((numberp value) (number-to-string value))
   (t (prin1-to-string value))))

(defun eliscript-macro-eval--value-string (value)
  "Return VALUE converted by the macro `str' contract."
  (cond
   ((stringp value) value)
   ((null value) "nil")
   ((eq value t) "true")
   ((symbolp value) (symbol-name value))
   ((numberp value) (number-to-string value))
   (t (eliscript-macro-eval--display value))))

(defun eliscript-macro-eval--require-number (value operator)
  "Return numeric VALUE or report that OPERATOR received another type."
  (unless (numberp value)
    (eliscript-macro-eval--fail
     "%s expects numbers, got %s"
     operator (eliscript-macro-eval--display value)))
  value)

(defun eliscript-macro-eval--make-scope (&optional parent)
  "Return an empty evaluator scope with optional PARENT."
  (eliscript-macro-eval--scope-create
   :parent parent :values (make-hash-table :test #'eq)))

(defun eliscript-macro-eval--scope-bind (scope name value)
  "Bind NAME to VALUE in SCOPE and return VALUE."
  (puthash name value (eliscript-macro-eval--scope-values scope))
  value)

(defun eliscript-macro-eval--scope-find (scope name)
  "Return the scope containing NAME, or nil when NAME is unbound."
  (let (found)
    (while (and scope (not found))
      (let ((value
             (gethash name (eliscript-macro-eval--scope-values scope)
                      eliscript-macro-eval--missing)))
        (unless (eq value eliscript-macro-eval--missing)
          (setq found scope)))
      (setq scope (and (not found)
                       (eliscript-macro-eval--scope-parent scope))))
    found))

(defun eliscript-macro-eval--scope-value (scope name)
  "Return NAME's value visible from SCOPE."
  (let ((owner (eliscript-macro-eval--scope-find scope name)))
    (unless owner
      (eliscript-macro-eval--fail "void variable: %s" name))
    (gethash name (eliscript-macro-eval--scope-values owner))))

(defun eliscript-macro-eval--scope-set (scope name value)
  "Set existing NAME to VALUE through SCOPE and return VALUE."
  (let ((owner (eliscript-macro-eval--scope-find scope name)))
    (unless owner
      (eliscript-macro-eval--fail
       "cannot set unbound macro variable: %s" name))
    (puthash name value (eliscript-macro-eval--scope-values owner))
    value))

(defun eliscript-macro-eval--operator-p (form operator)
  "Return non-nil when FORM is a proper call to OPERATOR."
  (and (consp form)
       (proper-list-p form)
       (eq (car form) operator)))

(defun eliscript-macro-eval--splice-p (form depth)
  "Return non-nil when FORM is a comma-splice active at DEPTH."
  (and (= depth 1)
       (eliscript-macro-eval--operator-p
        form eliscript-macro-eval--splice-symbol)))

(defun eliscript-macro-eval--quasiquote-items (items scope depth)
  "Evaluate quasiquoted ITEMS in SCOPE at nesting DEPTH."
  (let (result)
    (dolist (item items (nreverse result))
      (if (eliscript-macro-eval--splice-p item depth)
          (progn
            (unless (= (length item) 2)
              (eliscript-macro-eval--fail ",@ expects one value"))
            (let* ((value (eliscript-macro-eval--eval (cadr item) scope))
                   (parts (eliscript-macro-eval--sequence-items value)))
              (when (eq parts eliscript-macro-eval--missing)
                (eliscript-macro-eval--fail
                 "cannot splice %s" (eliscript-macro-eval--display value)))
              (dolist (part parts)
                (push part result))))
        (push (eliscript-macro-eval--quasiquote item scope depth) result)))))

(defun eliscript-macro-eval--quasiquote (form scope depth)
  "Evaluate quasiquoted FORM in SCOPE at nesting DEPTH."
  (cond
   ((vectorp form)
    (apply #'vector
           (eliscript-macro-eval--quasiquote-items
            (append form nil) scope depth)))
   ((and (= depth 1)
         (eliscript-macro-eval--operator-p
          form eliscript-macro-eval--unquote-symbol))
    (unless (= (length form) 2)
      (eliscript-macro-eval--fail ", expects one value"))
    (eliscript-macro-eval--eval (cadr form) scope))
   ((and (= depth 1)
         (eliscript-macro-eval--operator-p
          form eliscript-macro-eval--splice-symbol))
    (eliscript-macro-eval--fail ",@ is only valid inside a collection"))
   ((eliscript-macro-eval--operator-p
     form eliscript-macro-eval--quasiquote-symbol)
    (unless (= (length form) 2)
      (eliscript-macro-eval--fail "` expects one value"))
    (list (car form)
          (eliscript-macro-eval--quasiquote (cadr form) scope (1+ depth))))
   ((and (> depth 1)
         (eliscript-macro-eval--operator-p
          form eliscript-macro-eval--unquote-symbol))
    (list (car form)
          (eliscript-macro-eval--quasiquote (cadr form) scope (1- depth))))
   ((eliscript-macro-eval--list-p form)
    (eliscript-macro-eval--quasiquote-items form scope depth))
   (t form)))

(defun eliscript-macro-eval--eval-sequence (forms scope)
  "Evaluate FORMS in SCOPE and return the final value."
  (let ((result nil))
    (dolist (form forms result)
      (setq result (eliscript-macro-eval--eval form scope)))))

(defun eliscript-macro-eval--eval-args (forms scope)
  "Evaluate argument FORMS in SCOPE from left to right."
  (mapcar (lambda (form) (eliscript-macro-eval--eval form scope)) forms))

(defun eliscript-macro-eval--eval-if (arguments scope)
  "Evaluate macro if ARGUMENTS in SCOPE."
  (unless (<= 2 (length arguments) 3)
    (eliscript-macro-eval--fail "if expects 2..3 arguments"))
  (if (eliscript-macro-eval--truthy-p
       (eliscript-macro-eval--eval (nth 0 arguments) scope))
      (eliscript-macro-eval--eval (nth 1 arguments) scope)
    (if (= (length arguments) 3)
        (eliscript-macro-eval--eval (nth 2 arguments) scope)
      nil)))

(defun eliscript-macro-eval--eval-cond (clauses scope)
  "Evaluate macro cond CLAUSES in SCOPE."
  (let ((result nil)
        done)
    (dolist (clause clauses result)
      (unless done
        (unless (and (eliscript-macro-eval--list-p clause) clause)
          (eliscript-macro-eval--fail
           "invalid macro cond clause: %s"
           (eliscript-macro-eval--display clause)))
        (let ((test-value
               (eliscript-macro-eval--eval (car clause) scope)))
          (when (eliscript-macro-eval--truthy-p test-value)
            (setq result
                  (if (cdr clause)
                      (eliscript-macro-eval--eval-sequence
                       (cdr clause) scope)
                    test-value)
                  done t)))))))

(defun eliscript-macro-eval--parse-binding (binding)
  "Return macro let BINDING as a name/value-form cons."
  (cond
   ((eliscript-macro-eval--symbol-p binding)
    (cons binding eliscript-macro-eval--missing))
   ((and (eliscript-macro-eval--list-p binding)
         (<= 1 (length binding) 2)
         (eliscript-macro-eval--symbol-p (car binding)))
    (cons (car binding)
          (if (cdr binding) (cadr binding) eliscript-macro-eval--missing)))
   (t
    (eliscript-macro-eval--fail
     "invalid macro let binding: %s"
     (eliscript-macro-eval--display binding)))))

(defun eliscript-macro-eval--eval-let (arguments scope sequential)
  "Evaluate macro let ARGUMENTS in SCOPE, sequentially when SEQUENTIAL."
  (unless arguments
    (eliscript-macro-eval--fail "macro let requires a binding list"))
  (let ((bindings (car arguments))
        (child (eliscript-macro-eval--make-scope scope)))
    (unless (eliscript-macro-eval--list-p bindings)
      (eliscript-macro-eval--fail "macro let bindings must be a list"))
    (if sequential
        (dolist (binding bindings)
          (pcase-let ((`(,name . ,value-form)
                       (eliscript-macro-eval--parse-binding binding)))
            (eliscript-macro-eval--scope-bind
             child name
             (if (eq value-form eliscript-macro-eval--missing)
                 nil
               (eliscript-macro-eval--eval value-form child)))))
      (let (values)
        (dolist (binding bindings)
          (pcase-let ((`(,name . ,value-form)
                       (eliscript-macro-eval--parse-binding binding)))
            (push (cons name
                        (if (eq value-form eliscript-macro-eval--missing)
                            nil
                          (eliscript-macro-eval--eval value-form scope)))
                  values)))
        (dolist (binding (nreverse values))
          (eliscript-macro-eval--scope-bind
           child (car binding) (cdr binding)))))
    (eliscript-macro-eval--eval-sequence (cdr arguments) child)))

(defun eliscript-macro-eval--eval-setq (arguments scope)
  "Evaluate macro setq ARGUMENTS in SCOPE."
  (when (or (null arguments) (cl-oddp (length arguments)))
    (eliscript-macro-eval--fail "macro setq expects name/value pairs"))
  (let ((result nil))
    (while arguments
      (let ((name (pop arguments))
            (value-form (pop arguments)))
        (unless (eliscript-macro-eval--symbol-p name)
          (eliscript-macro-eval--fail
           "macro setq target must be a symbol"))
        (setq result (eliscript-macro-eval--eval value-form scope))
        (eliscript-macro-eval--scope-set scope name result)))
    result))

(defun eliscript-macro-eval--eval-list-operation (operator values)
  "Evaluate list OPERATOR over VALUES, or return the missing sentinel."
  (pcase operator
    ('list values)
    ('vector (apply #'vector values))
    ('car
     (unless (= (length values) 1)
       (eliscript-macro-eval--fail "car expects 1 argument"))
     (let ((items (eliscript-macro-eval--sequence-items (car values))))
       (when (eq items eliscript-macro-eval--missing)
         (eliscript-macro-eval--fail "car expects a list or vector"))
       (car items)))
    ('cdr
     (unless (= (length values) 1)
       (eliscript-macro-eval--fail "cdr expects 1 argument"))
     (let ((items (eliscript-macro-eval--sequence-items (car values))))
       (when (eq items eliscript-macro-eval--missing)
         (eliscript-macro-eval--fail "cdr expects a list or vector"))
       (cdr items)))
    ('nth
     (unless (= (length values) 2)
       (eliscript-macro-eval--fail "nth expects 2 arguments"))
     (let* ((index (eliscript-macro-eval--require-number
                    (nth 0 values) "nth"))
            (items (eliscript-macro-eval--sequence-items (nth 1 values))))
       (when (eq items eliscript-macro-eval--missing)
         (eliscript-macro-eval--fail "nth expects a list or vector"))
       (if (and (integerp index) (>= index 0) (< index (length items)))
           (nth index items)
         nil)))
    ('length
     (unless (= (length values) 1)
       (eliscript-macro-eval--fail "length expects 1 argument"))
     (let* ((value (car values))
            (items (eliscript-macro-eval--sequence-items value)))
       (cond
        ((not (eq items eliscript-macro-eval--missing)) (length items))
        ((stringp value)
         (cl-loop for character across value
                  sum (if (> character #xffff) 2 1)))
        (t (eliscript-macro-eval--fail "length expects a sequence")))))
    ('cons
     (unless (= (length values) 2)
       (eliscript-macro-eval--fail "cons expects 2 arguments"))
     (let ((tail (eliscript-macro-eval--sequence-items (nth 1 values))))
       (when (eq tail eliscript-macro-eval--missing)
         (eliscript-macro-eval--fail "cons tail must be a list or vector"))
       (cons (nth 0 values) tail)))
    ('append
     (let (result)
       (dolist (value values result)
         (let ((parts (eliscript-macro-eval--sequence-items value)))
           (when (eq parts eliscript-macro-eval--missing)
             (eliscript-macro-eval--fail
              "append expects lists or vectors"))
           (setq result (append result parts))))))
    (_ eliscript-macro-eval--missing)))

(defun eliscript-macro-eval--eq (left right)
  "Return host truth for Eliscript identity between LEFT and RIGHT."
  (cond
   ((and (symbolp left) (symbolp right)) (eq left right))
   ((and (numberp left) (numberp right)) (= left right))
   ((and (stringp left) (stringp right)) (equal left right))
   (t (eq left right))))

(defun eliscript-macro-eval--eval-predicate (operator values)
  "Evaluate predicate OPERATOR over VALUES, or return the missing sentinel."
  (let ((arity (length values)))
    (pcase operator
      ('not
       (unless (= arity 1)
         (eliscript-macro-eval--fail "not expects 1 argument"))
       (eliscript-macro-eval--boolean
        (not (eliscript-macro-eval--truthy-p (car values)))))
      ('nil?
       (unless (= arity 1)
         (eliscript-macro-eval--fail "nil? expects 1 argument"))
       (eliscript-macro-eval--boolean (null (car values))))
      ('undefined?
       (unless (= arity 1)
         (eliscript-macro-eval--fail "undefined? expects 1 argument"))
       (eliscript-macro-eval--boolean (eq (car values) 'undefined)))
      ((or 'null 'nullish?)
       (unless (= arity 1)
         (eliscript-macro-eval--fail "%s expects 1 argument" operator))
       (eliscript-macro-eval--boolean
        (memq (car values) '(nil undefined))))
      ('symbolp
       (unless (= arity 1)
         (eliscript-macro-eval--fail "symbolp expects 1 argument"))
       (eliscript-macro-eval--boolean
        (eliscript-macro-eval--symbol-p (car values))))
      ('keywordp
       (unless (= arity 1)
         (eliscript-macro-eval--fail "keywordp expects 1 argument"))
       (eliscript-macro-eval--boolean (keywordp (car values))))
      ('listp
       (unless (= arity 1)
         (eliscript-macro-eval--fail "listp expects 1 argument"))
       (eliscript-macro-eval--boolean
        (eliscript-macro-eval--list-p (car values))))
      ('consp
       (unless (= arity 1)
         (eliscript-macro-eval--fail "consp expects 1 argument"))
       (eliscript-macro-eval--boolean
        (and (consp (car values)) (proper-list-p (car values)))))
      ('vectorp
       (unless (= arity 1)
         (eliscript-macro-eval--fail "vectorp expects 1 argument"))
       (eliscript-macro-eval--boolean (vectorp (car values))))
      ('stringp
       (unless (= arity 1)
         (eliscript-macro-eval--fail "stringp expects 1 argument"))
       (eliscript-macro-eval--boolean (stringp (car values))))
      ('numberp
       (unless (= arity 1)
         (eliscript-macro-eval--fail "numberp expects 1 argument"))
       (eliscript-macro-eval--boolean (numberp (car values))))
      ('atom
       (unless (= arity 1)
         (eliscript-macro-eval--fail "atom expects 1 argument"))
       (eliscript-macro-eval--boolean
        (not (and (consp (car values)) (proper-list-p (car values))))))
      ('eq
       (unless (= arity 2)
         (eliscript-macro-eval--fail "eq expects 2 arguments"))
       (eliscript-macro-eval--boolean
        (eliscript-macro-eval--eq (nth 0 values) (nth 1 values))))
      ('equal
       (unless (= arity 2)
         (eliscript-macro-eval--fail "equal expects 2 arguments"))
       (eliscript-macro-eval--boolean
        (equal (nth 0 values) (nth 1 values))))
      (_ eliscript-macro-eval--missing))))

(defun eliscript-macro-eval--normalize-number (value)
  "Return integer VALUE when a finite float has no fractional part."
  (if (and (floatp value)
           (= value (truncate value)))
      (truncate value)
    value))

(defun eliscript-macro-eval--eval-arithmetic (operator values)
  "Evaluate arithmetic OPERATOR over VALUES, or return the missing sentinel."
  (if (not (memq operator
                 '(+ - * / % mod 1+ 1- = /= < <= > >=)))
      eliscript-macro-eval--missing
    (let ((arity (length values)))
      (cond
       ((memq operator '(1+ 1-))
        (unless (= arity 1)
          (eliscript-macro-eval--fail "%s expects 1 argument" operator)))
       ((memq operator '(% mod = /= < <= > >=))
        (unless (= arity 2)
          (eliscript-macro-eval--fail "%s expects 2 arguments" operator)))
       ((memq operator '(- /))
        (when (= arity 0)
          (eliscript-macro-eval--fail
           "%s expects one or more numbers" operator))))
      (let ((numbers
             (mapcar (lambda (value)
                       (eliscript-macro-eval--require-number value operator))
                     values)))
        (pcase operator
          ('1+ (1+ (car numbers)))
          ('1- (1- (car numbers)))
          ('+ (apply #'+ numbers))
          ('* (apply #'* numbers))
          ('-
           (if (= arity 1)
               (- (car numbers))
             (cl-reduce #'- (cdr numbers) :initial-value (car numbers))))
          ('/
           (eliscript-macro-eval--normalize-number
            (if (= arity 1)
                (/ 1.0 (car numbers))
              (cl-reduce (lambda (left right) (/ (float left) right))
                         (cdr numbers) :initial-value (car numbers)))))
          ((or '% 'mod) (% (nth 0 numbers) (nth 1 numbers)))
          ('= (eliscript-macro-eval--boolean
               (= (nth 0 numbers) (nth 1 numbers))))
          ('/= (eliscript-macro-eval--boolean
                (/= (nth 0 numbers) (nth 1 numbers))))
          ('< (eliscript-macro-eval--boolean
               (< (nth 0 numbers) (nth 1 numbers))))
          ('<= (eliscript-macro-eval--boolean
                (<= (nth 0 numbers) (nth 1 numbers))))
          ('> (eliscript-macro-eval--boolean
               (> (nth 0 numbers) (nth 1 numbers))))
          ('>= (eliscript-macro-eval--boolean
                (>= (nth 0 numbers) (nth 1 numbers)))))))))

(defun eliscript-macro-eval--eval-call (form scope)
  "Evaluate macro call FORM in SCOPE."
  (let ((operator (car form))
        (arguments (cdr form)))
    (unless (eliscript-macro-eval--symbol-p operator)
      (eliscript-macro-eval--fail "macro call operator must be a symbol"))
    (if (eq operator eliscript-macro-eval--quasiquote-symbol)
        (progn
          (unless (= (length arguments) 1)
            (eliscript-macro-eval--fail "` expects 1 argument"))
          (eliscript-macro-eval--quasiquote (car arguments) scope 1))
      (pcase operator
	('quote
	 (unless (= (length arguments) 1)
           (eliscript-macro-eval--fail "quote expects 1 argument"))
	 (car arguments))
	('if (eliscript-macro-eval--eval-if arguments scope))
	('when
	    (if (and arguments
                     (eliscript-macro-eval--truthy-p
                      (eliscript-macro-eval--eval (car arguments) scope)))
		(eliscript-macro-eval--eval-sequence (cdr arguments) scope)
              nil))
	('unless
	    (if (and arguments
                     (not (eliscript-macro-eval--truthy-p
			   (eliscript-macro-eval--eval
			    (car arguments) scope))))
		(eliscript-macro-eval--eval-sequence (cdr arguments) scope)
              nil))
	((or 'progn 'do)
	 (eliscript-macro-eval--eval-sequence arguments scope))
	('let (eliscript-macro-eval--eval-let arguments scope nil))
	('let* (eliscript-macro-eval--eval-let arguments scope t))
	('setq (eliscript-macro-eval--eval-setq arguments scope))
	('cond (eliscript-macro-eval--eval-cond arguments scope))
	('and
	 (let ((result t))
           (while (and arguments
                       (eliscript-macro-eval--truthy-p result))
             (setq result (eliscript-macro-eval--eval
                           (pop arguments) scope)))
           result))
	('or
	 (let ((result nil))
           (while (and arguments
                       (not (eliscript-macro-eval--truthy-p result)))
             (setq result (eliscript-macro-eval--eval
                           (pop arguments) scope)))
           result))
	('error
	 (unless arguments
           (eliscript-macro-eval--fail "error expects a message"))
	 (eliscript-macro-eval--fail
          "%s" (eliscript-macro-eval--value-string
		(eliscript-macro-eval--eval (car arguments) scope))))
	(_
	 (let* ((values (eliscript-macro-eval--eval-args arguments scope))
		(list-result
		 (eliscript-macro-eval--eval-list-operation operator values))
		(predicate-result
		 (if (eq list-result eliscript-macro-eval--missing)
                     (eliscript-macro-eval--eval-predicate operator values)
                   eliscript-macro-eval--missing))
		(arithmetic-result
		 (if (and (eq list-result eliscript-macro-eval--missing)
                          (eq predicate-result eliscript-macro-eval--missing))
                     (eliscript-macro-eval--eval-arithmetic operator values)
                   eliscript-macro-eval--missing)))
           (cond
            ((not (eq list-result eliscript-macro-eval--missing)) list-result)
            ((not (eq predicate-result eliscript-macro-eval--missing))
             predicate-result)
            ((not (eq arithmetic-result eliscript-macro-eval--missing))
             arithmetic-result)
            ((eq operator 'symbol-name)
             (unless (and (= (length values) 1)
                          (eliscript-macro-eval--symbol-p (car values)))
               (eliscript-macro-eval--fail
		"symbol-name expects a symbol"))
             (symbol-name (car values)))
            ((eq operator 'intern)
             (unless (and (= (length values) 1) (stringp (car values)))
               (eliscript-macro-eval--fail "intern expects a string"))
             (intern (car values)))
            ((memq operator '(concat str))
             (mapconcat #'eliscript-macro-eval--value-string values ""))
            (t
             (eliscript-macro-eval--fail
              "unsupported macro function: %s" operator)))))))))

(defun eliscript-macro-eval--eval (form scope)
  "Evaluate location-free macro FORM in SCOPE."
  (cond
   ((or (null form)
        (eq form t)
        (memq form '(false undefined))
        (numberp form)
        (stringp form)
        (keywordp form)
        (vectorp form))
    form)
   ((eliscript-macro-eval--symbol-p form)
    (eliscript-macro-eval--scope-value scope form))
   ((and (consp form) (proper-list-p form))
    (eliscript-macro-eval--eval-call form scope))
   (t
    (eliscript-macro-eval--fail
     "unsupported macro value: %s"
     (eliscript-macro-eval--display form)))))

(defun eliscript-macro-eval-parse-parameters (parameters)
  "Parse location-free macro PARAMETERS into a deterministic descriptor."
  (unless (eliscript-macro-eval--list-p parameters)
    (eliscript-macro-eval--fail
     "macro parameters must be a list: %s"
     (eliscript-macro-eval--display parameters)))
  (let (required optional
		 (rest eliscript-macro-eval--missing)
		 (mode 'required))
    (dolist (parameter parameters)
      (unless (eliscript-macro-eval--symbol-p parameter)
        (eliscript-macro-eval--fail
         "macro parameters must be symbols: %s"
         (eliscript-macro-eval--display parameters)))
      (cond
       ((eq parameter '&optional)
        (when (or (eq mode 'rest)
                  (not (eq rest eliscript-macro-eval--missing)))
          (eliscript-macro-eval--fail "invalid macro parameter list"))
        (setq mode 'optional))
       ((memq parameter '(&rest &body))
        (when (or (eq mode 'rest)
                  (not (eq rest eliscript-macro-eval--missing)))
          (eliscript-macro-eval--fail "invalid macro parameter list"))
        (setq mode 'rest))
       ((eq mode 'rest)
        (setq rest parameter
              mode 'done))
       ((eq mode 'done)
        (eliscript-macro-eval--fail "invalid macro parameter list"))
       ((eq mode 'required) (push parameter required))
       (t (push parameter optional))))
    (when (eq mode 'rest)
      (eliscript-macro-eval--fail "invalid macro parameter list"))
    (eliscript-macro-eval-parameters-create
     :required (nreverse required)
     :optional (nreverse optional)
     :rest rest)))

(defun eliscript-macro-eval-run (name parameters body arguments)
  "Evaluate macro NAME with PARAMETERS, BODY, and raw ARGUMENTS."
  (let* ((required (eliscript-macro-eval-parameters-required parameters))
         (optional (eliscript-macro-eval-parameters-optional parameters))
         (rest (eliscript-macro-eval-parameters-rest parameters))
         (minimum (length required))
         (maximum (+ minimum (length optional)))
         (count (length arguments))
         (scope (eliscript-macro-eval--make-scope))
         (index 0))
    (when (< count minimum)
      (eliscript-macro-eval--fail
       "wrong number of arguments for %s" name))
    (when (and (eq rest eliscript-macro-eval--missing)
               (> count maximum))
      (eliscript-macro-eval--fail
       "wrong number of arguments for %s" name))
    (dolist (parameter required)
      (eliscript-macro-eval--scope-bind
       scope parameter (nth index arguments))
      (setq index (1+ index)))
    (dolist (parameter optional)
      (eliscript-macro-eval--scope-bind
       scope parameter (if (< index count) (nth index arguments) nil))
      (setq index (1+ index)))
    (unless (eq rest eliscript-macro-eval--missing)
      (eliscript-macro-eval--scope-bind scope rest (nthcdr index arguments)))
    (eliscript-macro-eval--eval-sequence body scope)))

(provide 'eliscript-macro-eval)

;;; eliscript-macro-eval.el ends here
