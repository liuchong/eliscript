;;; eliscript-tests.el --- Tests for Eliscript -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'cl-lib)
(require 'eliscript)

(defun eliscript-tests--legacy-compile-string (source &optional filename)
  "Compile SOURCE from FILENAME through the compatibility form emitter."
  (eliscript-emit-module
   (mapcar
    #'eliscript-form-strip
    (eliscript-analyze-module
     (eliscript-expand-module
      (eliscript-read-located-string source filename)
      filename)
     filename))))

(defun eliscript-tests--decode-vlq-segment (segment)
  "Decode Base64 VLQ values from source-map SEGMENT."
  (let ((index 0)
        values)
    (while (< index (length segment))
      (let ((shift 0)
            (value 0)
            continuation)
        (while
            (progn
              (let* ((digit
                      (cl-position
                       (aref segment index)
                       eliscript-source-map--base64))
                     (payload (logand digit 31)))
                (setq index (1+ index)
                      value (logior value (ash payload shift))
                      shift (+ shift 5)
                      continuation (/= (logand digit 32) 0)))
              continuation))
        (push (if (= (logand value 1) 1)
                  (- (ash value -1))
                (ash value -1))
              values)))
    (nreverse values)))

(defun eliscript-tests--decode-mappings (mappings)
  "Decode source-map MAPPINGS into absolute five-field segments."
  (let ((generated-line 0)
        (previous-source 0)
        (previous-original-line 0)
        (previous-original-column 0)
        decoded)
    (dolist (line (split-string mappings ";" nil))
      (let ((previous-generated-column 0))
        (dolist (encoded (split-string line "," t))
          (pcase-let ((`(,generated-column-delta ,source-delta
                         ,original-line-delta ,original-column-delta)
                       (eliscript-tests--decode-vlq-segment encoded)))
            (setq previous-generated-column
                  (+ previous-generated-column generated-column-delta)
                  previous-source (+ previous-source source-delta)
                  previous-original-line
                  (+ previous-original-line original-line-delta)
                  previous-original-column
                  (+ previous-original-column original-column-delta))
            (push (list generated-line previous-generated-column
                        previous-source previous-original-line
                        previous-original-column)
                  decoded))))
      (setq generated-line (1+ generated-line)))
    (nreverse decoded)))

(ert-deftest eliscript-reader-reads-multiple-forms ()
  (should
   (equal (eliscript-read-string "; comment\n(defconst answer 42)\n(+ answer 1)")
          '((defconst answer 42) (+ answer 1)))))

(ert-deftest eliscript-reader-rejects-incomplete-input ()
  (let ((error-data
         (should-error
          (eliscript-read-string "; comment\n(defun broken (" "reader.eli")
          :type 'eliscript-read-error)))
    (should (string-match-p
             (regexp-quote
              "reader.eli:2:1: unexpected end of input")
             (error-message-string error-data)))))

(ert-deftest eliscript-diagnostics-preserve-human-and-structured-contracts ()
  (let* ((error-data
          (should-error
           (eliscript-compile-string
            "(defun broken ()\n  missing)" "broken.eli")
           :type 'eliscript-analyze-error))
         (diagnostic (eliscript-diagnostic-from-condition error-data))
         (span (eliscript-diagnostic-span diagnostic))
         (json (eliscript-diagnostic-to-json diagnostic)))
    (should (eliscript-diagnostic-p diagnostic))
    (should (equal (cadr error-data)
                   "broken.eli:2:3: unbound symbol: missing"))
    (should (equal (error-message-string error-data)
                   (concat "Eliscript analysis error: "
                           "\"broken.eli:2:3: unbound symbol: missing\"")))
    (should (equal (eliscript-diagnostic-code diagnostic) "ELI-A0001"))
    (should (equal (eliscript-diagnostic-severity diagnostic) "error"))
    (should (equal (eliscript-diagnostic-phase diagnostic) "analysis"))
    (should (equal (eliscript-diagnostic-message diagnostic)
                   "unbound symbol: missing"))
    (should (= (eliscript-source-span-start span) 19))
    (should (= (eliscript-source-span-line span) 2))
    (should (= (eliscript-source-span-column span) 3))
    (should (= (eliscript-source-span-end span) 26))
    (should (= (eliscript-source-span-end-line span) 2))
    (should (= (eliscript-source-span-end-column span) 10))
    (should (string-match-p
             (regexp-quote
              "\"format\":\"eliscript-diagnostic\",\"version\":1")
             json))
    (should (string-match-p
             (regexp-quote
              "\"start\":{\"offset\":19,\"line\":2,\"column\":3}")
             json))))

(ert-deftest eliscript-reader-locates-nested-forms ()
  (let* ((forms
          (eliscript-read-located-string
           "(defconst answer 42)\n\n(defun broken ()\n  missing)"
           "located.eli"))
         (function-form (nth 1 forms))
         (function-items (eliscript-form-value function-form))
         (missing-form (nth 3 function-items))
         (function-span (eliscript-form-span function-form))
         (missing-span (eliscript-form-span missing-form)))
    (should (= (eliscript-source-span-line function-span) 3))
    (should (= (eliscript-source-span-column function-span) 1))
    (should (= (eliscript-source-span-line missing-span) 4))
    (should (= (eliscript-source-span-column missing-span) 3))
    (should (equal (mapcar #'eliscript-form-strip forms)
                   '((defconst answer 42)
                     (defun broken () missing))))))

(ert-deftest eliscript-emits-literals-and-data ()
  (should (equal (eliscript-emitter-emit-expression nil) "null"))
  (should (equal (eliscript-emitter-emit-expression t) "true"))
  (should (equal (eliscript-emitter-emit-expression 'false) "false"))
  (should (equal (eliscript-emitter-emit-expression [1 "two" :three])
                 "[1, \"two\", \"three\"]"))
  (should (equal (eliscript-emitter-emit-expression
                  '(object :name "Ada" :active t))
                 "({\"name\": \"Ada\", \"active\": true})")))

(ert-deftest eliscript-distinguishes-nullish-values ()
  (let* ((source
          "(defun classify (value)
  [(nil? value) (undefined? value) (nullish? value) (null value)])")
         (output (eliscript-compile-string source "nullish.eli")))
    (should (equal output
                   (eliscript-tests--legacy-compile-string
                    source "nullish.eli")))
    (should (string-match-p "(value === null)" output))
    (should (string-match-p "(value === undefined)" output))
    (should (= (length (split-string output "(value == null)" t)) 3)))
  (should
   (string-match-p
    "function portable_classify(value)"
    (eliscript-compile-string
     "(defportable portable-classify (value)
  [(nil? value) (undefined? value) (nullish? value)])"
     "portable-nullish.eli")))
  (dolist (operator '(nil? undefined? nullish? null))
    (let ((error-data
           (should-error
            (eliscript-compile-string (format "(%s)" operator) "nullish.eli")
            :type 'eliscript-compile-error)))
      (should (string-match-p
               (regexp-quote (format "%s expects 1 argument" operator))
               (error-message-string error-data))))))

(ert-deftest eliscript-emits-functions-and-lexical-bindings ()
  (let ((output
         (eliscript-compile-string
          "(defun add-one (value) (let ((step 1)) (+ value step)))")))
    (should (string-match-p "function add_one(value)" output))
    (should (string-match-p
             (regexp-quote "((step) => {\n    return (value + step);\n  })(1)")
             output))))

(ert-deftest eliscript-supports-optional-and-rest-parameters ()
  (let* ((source
          "(defun collect (required &optional optional &rest rest)
  [required optional rest])
(defconst invoke
  (lambda (first &optional second &rest tail)
    [first second tail]))")
         (output (eliscript-compile-string source "parameters.eli"))
         (program (eliscript-compile-ir-string source "parameters.eli"))
         (function (nth 0 (eliscript-ir-program-body program)))
         (lambda-node
          (car (eliscript-ir-node-children
                (nth 1 (eliscript-ir-program-body program)))))
         (function-parameters
          (cl-subseq
           (eliscript-ir-node-children function)
           0 (eliscript-ir-property function :parameter-count)))
         (lambda-parameters
          (cl-subseq
           (eliscript-ir-node-children lambda-node)
           0 (eliscript-ir-property lambda-node :parameter-count))))
    (should (equal output
                   (eliscript-tests--legacy-compile-string
                    source "parameters.eli")))
    (should (string-match-p
             (regexp-quote
              "function collect(required, optional = null, ...rest)")
             output))
    (should (string-match-p
             (regexp-quote "(first, second = null, ...tail) =>")
             output))
    (should (equal
             (mapcar (lambda (node)
                       (eliscript-ir-property node :parameter-kind))
                     function-parameters)
             '(required optional rest)))
    (should (equal
             (mapcar (lambda (node)
                       (eliscript-ir-property node :parameter-kind))
                     lambda-parameters)
             '(required optional rest)))
    (should (equal
             (eliscript-ir-program-to-forms program)
             '((defun collect
                   (required &optional optional &rest rest)
                 [required optional rest])
               (defconst invoke
                 (lambda (first &optional second &rest tail)
                   [first second tail]))))))
  (should
   (string-match-p
    (regexp-quote "function collect(required, optional = null, ...rest)")
    (eliscript-compile-portable-string
     "(defportable collect (required &optional optional &rest rest)
  [required optional rest])"
     '(collect)
     "portable-parameters.eli")))
  (dolist (source
           '("(defun broken (&optional value &optional next) value)"
             "(defun broken (value &rest) value)"
             "(defun broken (value &rest rest extra) value)"
             "(defun broken (&body forms) forms)"))
    (should-error (eliscript-compile-string source "parameters.eli")
                  :type 'eliscript-analyze-error)))

(ert-deftest eliscript-supports-vector-binding-patterns ()
  (let* ((source
          "(defun unpack ([first [second nil fourth] &rest tail]
               &optional [fallback])
  (let* (([head &rest rest] tail)
         ([nested] [fallback]))
    [first second fourth tail fallback head rest nested]))
(defun catch-pair ()
  (try
    (throw [7 \"caught\"])
    (catch [code message] [code message])))")
         (output (eliscript-compile-string source "patterns.eli"))
         (program (eliscript-compile-ir-string source "patterns.eli"))
         kinds
         rest-pattern)
    (eliscript-ir-walk
     program
     (lambda (node)
       (push (eliscript-ir-node-kind node) kinds)
       (when (and (eq (eliscript-ir-node-kind node)
                      'array-binding-pattern)
                  (eliscript-ir-property node :rest))
         (setq rest-pattern node))))
    (should (equal output
                   (eliscript-tests--legacy-compile-string
                    source "patterns.eli")))
    (should (string-match-p
             (regexp-quote
              "function unpack([first, [second, , fourth], ...tail], [fallback] = [])")
             output))
    (should (string-match-p
             (regexp-quote "catch ([code, message])") output))
    (dolist (kind '(array-binding-pattern binding-name binding-hole))
      (should (memq kind kinds)))
    (should rest-pattern)
    (should
     (equal
      (eliscript-ir-program-to-forms program)
      '((defun unpack
            ([first [second nil fourth] &rest tail] &optional [fallback])
          (let* (([head &rest rest] tail)
                 ([nested] [fallback]))
            [first second fourth tail fallback head rest nested]))
        (defun catch-pair nil
          (try
            (throw [7 "caught"])
            (catch [code message] [code message])))))))
  (should
   (string-match-p
    (regexp-quote "function pair_sum([left, right])")
    (eliscript-compile-portable-string
     "(defportable pair-sum ([left right]) (+ left right))"
     '(pair-sum)
     "portable-patterns.eli")))
  (dolist (source
           '("(defun broken ([value value]) value)"
             "(defun broken ([foo-bar foo_bar]) foo-bar)"
             "(defun broken ([value &rest]) value)"
             "(defun broken ([value &rest tail extra]) value)"
             "(defun broken ([value &rest [tail]]) value)"
             "(defun broken ([value &optional next]) value)"
             "(defun broken (&rest [items]) items)"
             "(let (([left right] [1 2]) ([next] [left])) next)"
             "(progn (try (throw [1]) (catch [value] value)) value)"))
    (should-error (eliscript-compile-string source "patterns.eli")
                  :type 'eliscript-analyze-error)))

(ert-deftest eliscript-supports-async-functions-and-await ()
  (let* ((source
          "(defasync resolve-value (value &optional transform)
  (let ((resolved (await value)))
    (if transform (await (funcall transform resolved)) resolved)))
(defconst delayed-double
  (async (value) (* (await value) 2)))")
         (output (eliscript-compile-string source "async.eli"))
         (program (eliscript-compile-ir-string source "async.eli"))
         (declaration (nth 0 (eliscript-ir-program-body program)))
         (constant (nth 1 (eliscript-ir-program-body program)))
         (function-expression (car (eliscript-ir-node-children constant)))
         kinds)
    (eliscript-ir-walk
     program
     (lambda (node) (push (eliscript-ir-node-kind node) kinds)))
    (should (equal output
                   (eliscript-tests--legacy-compile-string
                    source "async.eli")))
    (should (string-match-p
             (regexp-quote
              "async function resolve_value(value, transform = null)")
             output))
    (should (string-match-p
             (regexp-quote "async (value) =>") output))
    (should (string-match-p
             (regexp-quote "(await (async (resolved) =>") output))
    (should (eliscript-ir-property declaration :async))
    (should (eliscript-ir-property function-expression :async))
    (should (memq 'await-expression kinds))
    (should
     (equal
      (eliscript-ir-program-to-forms program)
      '((defasync resolve-value (value &optional transform)
          (let ((resolved (await value)))
            (if transform (await (funcall transform resolved)) resolved)))
        (defconst delayed-double
          (async (value) (* (await value) 2)))))))
  (dolist (source
           '("(await promise)"
             "(defun broken (promise) (await promise))"
             "(defasync outer (promise) (funcall (lambda () (await promise))))"
             "(defasync broken () (await))"
             "(async)"))
    (should-error (eliscript-compile-string source "async.eli")
                  :type 'eliscript-analyze-error))
  (let ((error-data
         (should-error
          (eliscript-compile-portable-string
           "(defportable work (value) (async () value))"
           '(work)
           "portable-async.eli")
          :type 'eliscript-compile-error)))
    (should (string-match-p
             (regexp-quote
              "portable function work cannot use async (asynchronous functions)")
             (error-message-string error-data)))))

(ert-deftest eliscript-supports-exception-control-flow ()
  (let* ((source
          "(defun safe-divide (value)
  (try
    (if (= value 0) (throw \"zero\") (/ 12 value))
    (catch error (str \"caught:\" error))
    (finally (print \"done\"))))
(defasync settle (promise)
  (try
    (await promise)
    (catch error (get error :message \"unknown\"))
    (finally (await promise))))")
         (output (eliscript-compile-string source "exceptions.eli"))
         (program (eliscript-compile-ir-string source "exceptions.eli"))
         kinds)
    (eliscript-ir-walk
     program
     (lambda (node) (push (eliscript-ir-node-kind node) kinds)))
    (should (equal output
                   (eliscript-tests--legacy-compile-string
                    source "exceptions.eli")))
    (should (string-match-p (regexp-quote "try {") output))
    (should (string-match-p (regexp-quote "catch (error) {") output))
    (should (string-match-p (regexp-quote "finally {") output))
    (should (string-match-p (regexp-quote ") => { throw ") output))
    (should (string-match-p
             (regexp-quote "(await (async () => {") output))
    (dolist (kind '(throw-expression try-expression catch-clause
                    catch-binding finally-clause))
      (should (memq kind kinds)))
    (should
     (equal
      (eliscript-ir-program-to-forms program)
      '((defun safe-divide (value)
          (try
            (if (= value 0) (throw "zero") (/ 12 value))
            (catch error (str "caught:" error))
            (finally (print "done"))))
        (defasync settle (promise)
          (try
            (await promise)
            (catch error (get error :message "unknown"))
            (finally (await promise))))))))
  (dolist (source
           '("(throw)"
             "(throw 1 2)"
             "(try 1)"
             "(try 1 (catch))"
             "(try 1 (catch error error) (catch other other))"
             "(try 1 (finally) (catch error error))"
             "(try 1 (finally) 2)"
             "(catch error error)"
             "(finally 1)"
             "(progn (try (throw \"x\") (catch error error)) error)"))
    (should-error (eliscript-compile-string source "exceptions.eli")
                  :type 'eliscript-analyze-error))
  (let ((error-data
         (should-error
          (eliscript-compile-portable-string
           "(defportable work () (throw \"stop\"))"
           '(work)
           "portable-exceptions.eli")
          :type 'eliscript-compile-error)))
    (should (string-match-p
             (regexp-quote
              "portable function work cannot use throw (exception control flow)")
             (error-message-string error-data)))))

(ert-deftest eliscript-preserves-lisp-truthiness ()
  (let ((output (eliscript-compile-string
                 "(print (if 0 \"truthy\" \"falsey\"))")))
    (should (string-match-p
             (regexp-quote
              "console.log((__eliscript_truthy(0) ? \"truthy\" : \"falsey\"));")
             output))))

(ert-deftest eliscript-emits-short-circuit-forms ()
  (let ((and-output (eliscript-emitter-emit-expression '(and a b c)))
        (or-output (eliscript-emitter-emit-expression '(or a b c))))
    (should (string-match-p "__eliscript_truthy" and-output))
    (should (string-match-p "__eliscript_truthy" or-output))
    (should-not (equal and-output or-output))))

(ert-deftest eliscript-emits-esm-imports-and-exports ()
  (let ((output
         (eliscript-compile-string
          "(import \"react\" :default React useState)\n(export React useState)")))
    (should (string-match-p
             (regexp-quote "import React, {useState} from \"react\";")
             output))
    (should (string-match-p
             (regexp-quote "export {React, useState};")
             output))))

(ert-deftest eliscript-emits-javascript-interop ()
  (should
   (equal
    (eliscript-emitter-emit-expression
     '(js-call [1 2 3] :map (lambda (value) (* value 2))))
    "([1, 2, 3])[\"map\"]((value) => {\n  return (value * 2);\n})"))
  (should
   (equal (eliscript-emitter-emit-expression '(get user :name "unknown"))
          "((user)[\"name\"] ?? \"unknown\")")))

(ert-deftest eliscript-emits-immutable-object-primitives ()
  (should
   (equal (eliscript-emitter-emit-expression '(object-keys value))
          "Object.keys((value) ?? {})"))
  (should
   (equal (eliscript-emitter-emit-expression '(object-has? value key))
          "Object.prototype.hasOwnProperty.call((value) ?? {}, key)"))
  (should
   (equal (eliscript-emitter-emit-expression '(object-assoc value key next))
          "({...((value) ?? {}), [key]: next})")))

(ert-deftest eliscript-rejects-invalid-arity ()
  (should-error (eliscript-emitter-emit-expression '(if t))
                :type 'eliscript-compile-error)
  (should-error (eliscript-emitter-emit-expression '(object :name))
                :type 'eliscript-compile-error)
  (dolist (form '((object-keys)
                  (object-has? value)
                  (object-assoc value key)))
    (should-error (eliscript-emitter-emit-expression form)
                  :type 'eliscript-compile-error)))

(ert-deftest eliscript-handles-empty-list-operations ()
  (should (equal (eliscript-emitter-emit-expression '(car nil))
                 "(((null) ?? [])[0] ?? null)"))
  (should (equal (eliscript-emitter-emit-expression '(cdr nil))
                 "((null) ?? []).slice(1)"))
  (should (equal (eliscript-emitter-emit-expression '(cons 1 nil))
                 "[1, ...((null) ?? [])]")))

(ert-deftest eliscript-rejects-special-binding-names ()
  (should-error (eliscript-compile-string "(defvar nil 1)")
                :type 'eliscript-compile-error)
  (should-error (eliscript-compile-string "(defvar false 1)")
                :type 'eliscript-compile-error)
  (should-error (eliscript-compile-string "(defun f (nil) nil)")
                :type 'eliscript-compile-error))

(ert-deftest eliscript-analyzer-resolves-module-and-lexical-bindings ()
  (let ((output
         (eliscript-compile-string
          "(defun first () (second))
(defun second () (let* ((value 1) (next (+ value 1))) next))
(export first second)")))
    (should (string-match-p "function first()" output))
    (should (string-match-p "function second()" output))))

(ert-deftest eliscript-analyzer-rejects-unbound-symbols ()
  (let ((error-data
         (should-error
          (eliscript-compile-string
           "(defun broken ()\n  missing)"
           "broken.eli")
          :type 'eliscript-analyze-error)))
    (should (string-match-p
             (regexp-quote "broken.eli:2:3: unbound symbol: missing")
             (error-message-string error-data)))))

(ert-deftest eliscript-analyzer-distinguishes-let-and-let-star ()
  (should-error
   (eliscript-compile-string
    "(defun broken () (let ((value 1) (next value)) next))")
   :type 'eliscript-analyze-error)
  (should
   (string-match-p
    "function valid()"
    (eliscript-compile-string
     "(defun valid () (let* ((value 1) (next value)) next))"))))

(ert-deftest eliscript-analyzer-rejects-duplicate-bindings ()
  (should-error
   (eliscript-compile-string "(defun duplicate (value value) value)")
   :type 'eliscript-analyze-error)
  (should-error
   (eliscript-compile-string "(let ((value 1) (value 2)) value)")
   :type 'eliscript-analyze-error))

(ert-deftest eliscript-analyzer-rejects-output-name-collisions ()
  (let ((error-data
         (should-error
          (eliscript-compile-string
           "(defconst foo-bar 1) (defconst foo_bar 2)")
          :type 'eliscript-analyze-error)))
    (should (string-match-p "collides with foo-bar"
                            (error-message-string error-data)))))

(ert-deftest eliscript-symbol-mapping-preserves-leading-digit-handling ()
  (should (equal (eliscript-symbol-binding-name '1value) "_1value")))

(ert-deftest eliscript-symbol-mapping-avoids-strict-mode-bindings ()
  (let ((output
         (eliscript-compile-string
          "(defun add (arguments eval) (+ arguments eval))")))
    (should (string-match-p
             (regexp-quote "function add(arguments$, eval$)")
             output))))

(ert-deftest eliscript-analyzer-validates-assignment-mutability ()
  (should-error
   (eliscript-compile-string "(defconst answer 42) (setq answer 43)")
   :type 'eliscript-analyze-error)
  (should
   (string-match-p
    "(answer = 43)"
    (eliscript-compile-string "(defvar answer 42) (setq answer 43)"))))

(ert-deftest eliscript-analyzer-validates-exports ()
  (should-error (eliscript-compile-string "(export missing)")
                :type 'eliscript-analyze-error))

(ert-deftest eliscript-analyzer-allows-qualified-javascript-references ()
  (should
   (string-match-p
    (regexp-quote "console.log(JSON.stringify(null));")
    (eliscript-compile-string "(print (JSON/stringify nil))"))))

(ert-deftest eliscript-portable-functions-emit-worker-manifest ()
  (let ((output
         (eliscript-compile-string
          "(defportable score-values (values) (length values))")))
    (should (string-match-p "function score_values(values)" output))
    (should (string-match-p
             (regexp-quote "export {score_values};") output))
    (should (string-match-p
             (regexp-quote
              "export const __eliscript_portable__ = Object.freeze(Object.fromEntries([[\"score-values\", score_values]]));")
             output))))

(ert-deftest eliscript-portable-functions-do-not-duplicate-explicit-exports ()
  (let ((output
         (eliscript-compile-string
          "(defportable work (value) value)\n(export work)")))
    (should (= (length (split-string output "export {work};" t)) 2))))

(ert-deftest eliscript-portable-selection-emits-transitive-closure-only ()
  (let ((output
         (eliscript-compile-portable-string
          "(defconst step 2)
(defportable helper (value) (* value step))
(defportable work (value) (helper value))
(defportable unused () 99)
(defun ordinary () 1)"
          '(work)
          "portable.eli")))
    (should (string-match-p "const step = 2;" output))
    (should (string-match-p "function helper(value)" output))
    (should (string-match-p "function work(value)" output))
    (should-not (string-match-p "function unused" output))
    (should-not (string-match-p "function ordinary" output))))

(ert-deftest eliscript-portable-imports-compile-as-named-esm-imports ()
  (let ((output
         (eliscript-compile-string
          "(import-portable \"./math.eli\" increment)\n(defportable work (value) (increment value))"
          "portable.eli")))
    (should (string-match-p
             (regexp-quote "import {increment} from \"./math.eli\";")
             output))
    (should (string-match-p "function work(value)" output))))

(ert-deftest eliscript-single-file-portable-selection-rejects-imports ()
  (let ((error-data
         (should-error
          (eliscript-compile-portable-string
           "(import-portable \"./math.eli\" increment)\n(defportable work (value) (increment value))"
           '(work)
           "portable.eli")
          :type 'eliscript-analyze-error)))
    (should (string-match-p
             "portable import increment requires a project build"
             (error-message-string error-data)))))

(ert-deftest eliscript-standard-library-sequence-closure-is-portable ()
  (let* ((source
          (expand-file-name "stdlib/sequence.eli" default-directory))
         (output (eliscript-compile-portable-file source '(map))))
    (should (string-match-p "function reverse(values)" output))
    (should (string-match-p "function map(function$, values)" output))
    (should-not (string-match-p "function filter" output))
    (should-not (string-match-p "function range" output))
    (should (string-match-p
             (regexp-quote
              "Object.fromEntries([[\"reverse\", reverse], [\"map\", map]])")
             output))))

(ert-deftest eliscript-standard-library-text-closure-is-portable ()
  (let* ((source
          (expand-file-name "stdlib/text.eli" default-directory))
         (output (eliscript-compile-portable-file source '(blank?))))
    (should (string-match-p "function slice(start, end, text)" output))
    (should (string-match-p "function whitespace" output))
    (should (string-match-p "function trim(text)" output))
    (should (string-match-p "function blank" output))
    (should-not (string-match-p "function join" output))
    (should-not (string-match-p "function repeat" output))
    (should (string-match-p
             (regexp-quote
              "[[\"empty?\", empty_QMARK_], [\"slice\", slice]")
             output))))

(ert-deftest eliscript-standard-library-object-closure-is-portable ()
  (let* ((source
          (expand-file-name "stdlib/object.eli" default-directory))
         (output (eliscript-compile-portable-file source '(omit))))
    (should (string-match-p "function keys(object)" output))
    (should (string-match-p "function key_in_QMARK_" output))
    (should (string-match-p "function omit(object, omitted_keys)" output))
    (should-not (string-match-p "function map_values" output))
    (should-not (string-match-p "function update" output))
    (should (string-match-p
             (regexp-quote "Object.keys((object) ?? {})")
             output))
    (should (string-match-p
             (regexp-quote
              "[[\"keys\", keys], [\"assoc\", assoc], [\"key-in?\", key_in_QMARK_], [\"omit\", omit]")
             output))))

(ert-deftest eliscript-standard-library-data-compiles-portable-imports ()
  (let* ((source
          (expand-file-name "stdlib/data.eli" default-directory))
         (output (eliscript-compile-file source)))
    (should (string-match-p
             (regexp-quote "import {assoc} from \"./object.eli\";") output))
    (should (string-match-p
             (regexp-quote "import {has_QMARK_} from \"./object.eli\";")
             output))
    (should (string-match-p "function group_by(key_function, values)" output))))

(ert-deftest eliscript-portable-functions-reject-non-portable-dependencies ()
  (dolist (source
           '("(defun helper () 1) (defportable work () (helper))"
             "(defvar total 0) (defportable work () total)"
             "(import \"pkg\" helper) (defportable work () (helper))"))
    (let ((error-data
           (should-error
            (eliscript-compile-string source "portable.eli")
            :type 'eliscript-analyze-error)))
      (should (string-match-p "portable function work depends on non-portable"
                              (error-message-string error-data))))))

(ert-deftest eliscript-portable-functions-reject-host-interop ()
  (dolist (source
           '("(defportable work () (js* \"globalThis\"))"
             "(defportable work (value) (put value :changed t))"
             "(defportable work () console/log)"))
    (should-error
     (eliscript-compile-string source "portable.eli")
     :type 'eliscript-analyze-error)))

(ert-deftest eliscript-portable-functions-allow-local-mutation ()
  (should
   (string-match-p
    "function count_to(limit)"
    (eliscript-compile-string
     "(defportable count-to (limit)
        (let ((index 0))
          (while (< index limit) (setq index (1+ index)))
          index))"))))

(ert-deftest eliscript-expander-expands-user-macros ()
  (let ((output
         (eliscript-compile-string
          "(module macro.example
  (defmacro twice (value) `(+ ,value ,value))
  (defun double (value) (twice value)))")))
    (should (string-match-p
             (regexp-quote "return (value + value);")
             output))
    (should-not (string-match-p "defmacro\\|twice" output))))

(ert-deftest eliscript-expander-supports-body-parameters ()
  (let ((output
         (eliscript-compile-string
          "(defmacro begin (&body forms) `(progn ,@forms))
(defun two () (begin 1 2))")))
    (should (string-match-p "function two()" output))
    (should (string-match-p
             (regexp-quote "    1;\n    return 2;")
             output))))

(ert-deftest eliscript-expander-can-generate-top-level-declarations ()
  (let ((output
         (eliscript-compile-string
          "(defmacro define-answer () '(defconst answer 42))
(define-answer)
(export answer)")))
    (should (string-match-p "const answer = 42;" output))
    (should (string-match-p "export {answer};" output))))

(ert-deftest eliscript-expander-preserves-quoted-data ()
  (let ((output
         (eliscript-compile-string
          "(defmacro twice (value) `(+ ,value ,value))
(defconst syntax '(twice 1))")))
    (should (string-match-p
             (regexp-quote "const syntax = [\"twice\", 1];")
             output))))

(ert-deftest eliscript-expander-isolates-compilations ()
  (eliscript-compile-string "(defmacro twice (value) `(+ ,value ,value))")
  (should-error (eliscript-compile-string "(twice 1)")
                :type 'eliscript-analyze-error))

(ert-deftest eliscript-expander-generates-deterministic-capture-safe-names ()
  (let* ((source
          "(defmacro once (form) `(let ((value$ ,form)) value$))
(defun work (value$G1) (once (+ value$G1 1)))")
         (first (eliscript-compile-string source "generated.eli"))
         (second (eliscript-compile-string source "generated.eli")))
    (should (equal first second))
    (should (string-match-p
             (regexp-quote "((value$G2) =>") first))
    (should-not (string-match-p
                 (regexp-quote "((value$G1) =>") first))))

(ert-deftest eliscript-expander-rejects-runaway-expansion ()
  (should-error
   (eliscript-compile-string
    "(defmacro forever (value) `(forever ,value)) (forever 1)")
   :type 'eliscript-expand-error))

(ert-deftest eliscript-expander-reports-macro-failures-with-filename ()
  (let ((error-data
         (should-error
          (eliscript-compile-string
           "(defmacro boom () (error \"bad expansion\"))\n\n(boom)"
           "macro.eli")
          :type 'eliscript-expand-error)))
    (should (string-match-p
             (regexp-quote
              "macro.eli:3:1: macro boom failed: bad expansion")
             (error-message-string error-data)))))

(ert-deftest eliscript-expander-rejects-host-functions ()
  (let ((error-data
         (should-error
          (eliscript-compile-string
           "(defmacro host-value () (getenv \"HOME\"))\n(host-value)"
           "host.eli")
          :type 'eliscript-expand-error)))
    (should (string-match-p
             (regexp-quote
              "host.eli:2:1: macro host-value failed: unsupported macro function: getenv")
             (error-message-string error-data)))))

(ert-deftest eliscript-expander-validates-expanded-code ()
  (let ((error-data
         (should-error
          (eliscript-compile-string
           "(defmacro missing-reference () 'missing)\n\n(missing-reference)"
           "expanded.eli")
          :type 'eliscript-analyze-error)))
    (should (string-match-p
             (regexp-quote
              "expanded.eli:3:1: unbound symbol: missing")
             (error-message-string error-data)))))

(ert-deftest eliscript-expander-rejects-nested-definitions ()
  (should-error
   (eliscript-compile-string "(defun broken () (defmacro nested () 1))")
   :type 'eliscript-expand-error))

(ert-deftest eliscript-lowerer-builds-explicit-ir ()
  (let* ((program
          (eliscript-compile-ir-string
           "(module ir.example
  (defconst answer 42)
  (defun choose (value)
    (let ((fallback answer))
      (if value value fallback)))
  (export choose))"
           "ir.eli"))
         (module (car (eliscript-ir-program-body program)))
         (declarations (eliscript-ir-node-children module))
         (constant (nth 0 declarations))
         (function (nth 1 declarations))
         (lexical-bindings
          (nth (eliscript-ir-property function :parameter-count)
               (eliscript-ir-node-children function)))
         (binding (car (eliscript-ir-node-children lexical-bindings)))
         (conditional
          (nth (eliscript-ir-property lexical-bindings :binding-count)
               (eliscript-ir-node-children lexical-bindings)))
         nodes-without-spans)
    (eliscript-ir-walk
     program
     (lambda (node)
       (unless (eliscript-ir-node-span node)
         (push node nodes-without-spans))))
    (should (eliscript-ir-program-p program))
    (should-not nodes-without-spans)
    (should (eq (eliscript-ir-node-kind module) 'module-declaration))
    (should (eq (eliscript-ir-node-kind constant) 'variable-declaration))
    (should-not (eliscript-ir-property constant :mutable))
    (should (eq (eliscript-ir-node-kind function) 'function-declaration))
    (should (eq (eliscript-ir-node-kind lexical-bindings) 'lexical-bindings))
    (should (eq (eliscript-ir-node-kind binding) 'lexical-binding))
    (should (eq (eliscript-ir-node-kind conditional) 'conditional))
    (should (= (eliscript-source-span-line
                (eliscript-ir-node-span lexical-bindings))
               4))))

(ert-deftest eliscript-lowerer-preserves-macro-call-origin ()
  (let* ((program
          (eliscript-compile-ir-string
           "(defmacro twice (value) `(+ ,value ,value))

(defun double (value)
  (twice value))"
         "macro-ir.eli"))
         (function (car (eliscript-ir-program-body program)))
         (intrinsic
          (nth (eliscript-ir-property function :parameter-count)
               (eliscript-ir-node-children function)))
         (span (eliscript-ir-node-span intrinsic)))
    (should (eq (eliscript-ir-node-kind intrinsic) 'intrinsic))
    (should (eq (eliscript-ir-node-value intrinsic) '+))
    (should (= (eliscript-source-span-line span) 4))
    (should (= (eliscript-source-span-column span) 3))))

(ert-deftest eliscript-ir-round-trip-preserves-computed-calls ()
  (let* ((source "(defun invoke (value) ((lambda (item) item) value))")
         (program (eliscript-compile-ir-string source "call.eli"))
         (function (car (eliscript-ir-program-body program)))
         (call
          (nth (eliscript-ir-property function :parameter-count)
               (eliscript-ir-node-children function)))
         (callee (car (eliscript-ir-node-children call))))
    (should (eq (eliscript-ir-node-kind call) 'call))
    (should (eq (eliscript-ir-node-kind callee) 'function-expression))
    (should
     (equal (eliscript-ir-program-to-forms program)
            '((defun invoke (value) ((lambda (item) item) value)))))))

(ert-deftest eliscript-ir-emitter-matches-compatibility-backend ()
  (let ((source
         "(import \"react\" :default React useState)
(import \"react-dom\" :as ReactDOM)
(import-portable \"./helper.eli\" helper)
(defvar state 0)
(defun optional-branch (value) (let* () (if value value)))
(defun exercise (value values)
  (let* ((next (1+ value))
         (record (object :next next (+ value 1) value)))
    (progn
      (setq state next)
      (set! state (if (and value next) next state))
      (when value (print (get record :next)))
      (unless false (put record :done t))
      (while (> state 10) (set! state (1- state)))
      (or (null values)
          (apply (lambda (item) item) values)
          (js-call values :map (lambda (item) (* item 2))))
      (cond ((= state 0) '(zero)) (t (str state))))))
(export exercise optional-branch state)
(export-default exercise)")
        (filename "emitter-parity.eli"))
    (should
     (equal (eliscript-compile-string source filename)
            (eliscript-tests--legacy-compile-string source filename)))))

(ert-deftest eliscript-loop-recur-matches-compatibility-backend ()
  (let ((source
         "(defun countdown (remaining count)
  (if (= remaining 0) count
    (recur (1- remaining) (1+ count))))
(defconst swapped
  (loop ((left 1) (right 2) (steps 1))
    (if (= steps 0) [left right]
      (recur right left (1- steps)))))")
        (filename "loop-recur-parity.eli"))
    (should
     (equal (eliscript-compile-string source filename)
            (eliscript-tests--legacy-compile-string source filename)))))

(ert-deftest eliscript-loop-recur-round-trips-through-ir-forms ()
  (let* ((source
          "(loop ((left 1) (right 2))
  (if left (recur right left) [left right]))")
         (forms
          (eliscript-analyze-module
           (eliscript-expand-module
            (eliscript-read-located-string source "loop-ir.eli")
            "loop-ir.eli")
           "loop-ir.eli"))
         (program (eliscript-lower-module forms "loop-ir.eli")))
    (should
     (equal (eliscript-ir-program-to-forms program)
            '((loop ((left 1) (right 2))
                (if left (recur right left) [left right])))))))

(ert-deftest eliscript-emits-portable-32-bit-operations ()
  (let* ((source
          "(defun bits (value distance)
  [(int32 value)
   (uint32 value)
   (imul32 value 31)
   (bit-and value 255)
   (bit-or value 256)
   (bit-xor value 85)
   (bit-not value)
   (bit-shift-left value distance)
   (bit-shift-right value distance)
   (unsigned-bit-shift-right value distance)])")
         (filename "bits.eli")
         (output (eliscript-compile-string source filename)))
    (should
     (equal output (eliscript-tests--legacy-compile-string source filename)))
    (dolist (fragment
             '("(value | 0)"
               "(value >>> 0)"
               "Math.imul(value, 31)"
               "(value & 255)"
               "(value | 256)"
               "(value ^ 85)"
               "(~value)"
               "(value << distance)"
               "(value >> distance)"
               "(value >>> distance)"))
      (should (string-match-p (regexp-quote fragment) output)))))

(ert-deftest eliscript-rejects-invalid-32-bit-operation-arities ()
  (dolist (source
           '("(int32)"
             "(uint32 1 2)"
             "(imul32 1)"
             "(bit-and 1)"
             "(bit-or 1 2 3)"
             "(bit-xor)"
             "(bit-not 1 2)"
             "(bit-shift-left 1)"
             "(bit-shift-right 1 2 3)"
             "(unsigned-bit-shift-right 1)"))
    (should-error (eliscript-compile-string source "bits-invalid.eli")
                  :type 'eliscript-compile-error)))

(ert-deftest eliscript-emits-portable-value-inspection-operations ()
  (let* ((source
          "(defun inspect-value (value text index)
  [(value-type value) (string-code-unit-at text index)
   (number-float64-words value)])")
         (filename "value-inspection.eli")
         (output (eliscript-compile-string source filename))
         (portable-output
          (eliscript-compile-portable-string
           "(defportable inspect-value (value text index)
  [(value-type value) (string-code-unit-at text index)
   (number-float64-words value)])"
           '(inspect-value)
           filename)))
    (should
     (equal output (eliscript-tests--legacy-compile-string source filename)))
    (dolist (generated (list output portable-output))
      (should
       (string-match-p
        (regexp-quote
         "__eliscript_value === null ? \"null\" : typeof __eliscript_value")
        generated))
      (should
       (string-match-p
        (regexp-quote "(text).charCodeAt(index)") generated))
      (should
       (string-match-p
        (regexp-quote
         "__eliscript_bytes.setFloat64(0, __eliscript_number === 0 ? 0 : __eliscript_number, true)")
        generated)))))

(ert-deftest eliscript-rejects-invalid-value-inspection-arities ()
  (dolist (source
           '("(value-type)"
             "(value-type 1 2)"
             "(string-code-unit-at \"a\")"
             "(string-code-unit-at \"a\" 0 1)"
             "(number-float64-words)"
             "(number-float64-words 1 2)"))
    (should-error (eliscript-compile-string source "value-invalid.eli")
                  :type 'eliscript-compile-error)))

(ert-deftest eliscript-ir-emitter-does-not-call-form-backend ()
  (let ((program
         (eliscript-compile-ir-string
          "(defun identity (value) value) (export identity)"
          "direct-ir.eli")))
    (cl-letf (((symbol-function 'eliscript-ir-program-to-forms)
               (lambda (&rest _arguments)
                 (error "IR form bridge must not run")))
              ((symbol-function 'eliscript-ir-node-to-form)
               (lambda (&rest _arguments)
                 (error "IR node bridge must not run")))
              ((symbol-function 'eliscript-emit-module)
               (lambda (&rest _arguments)
                 (error "form module emitter must not run")))
              ((symbol-function 'eliscript-emitter-emit-top-level)
               (lambda (&rest _arguments)
                 (error "form top-level emitter must not run")))
              ((symbol-function 'eliscript-emitter-emit-expression)
               (lambda (&rest _arguments)
                 (error "form expression emitter must not run"))))
      (should
       (string-match-p
        (regexp-quote "function identity(value)")
        (eliscript-emit-ir-module program))))))

(ert-deftest eliscript-source-map-encodes-signed-vlq-values ()
  (should (equal (eliscript-source-map--encode-vlq 0) "A"))
  (should (equal (eliscript-source-map--encode-vlq 1) "C"))
  (should (equal (eliscript-source-map--encode-vlq -1) "D"))
  (should (equal (eliscript-source-map--encode-vlq 16) "gB"))
  (should (equal (eliscript-source-map--encode-vlq -16) "hB")))

(ert-deftest eliscript-emitter-preserves-non-bmp-string-literals ()
  (let ((encoded (eliscript-emitter--json-string "😀")))
    (should (multibyte-string-p encoded))
    (should (equal encoded "\"😀\""))))

(ert-deftest eliscript-source-map-records-ir-spans-and-utf16-columns ()
  (let* ((source "(defun choose (value)\n\t(if value value nil))\n(print \"😀\" \"after\")")
         (emission
          (eliscript-compile-string-with-source-map
           source "source.eli" "output.mjs" "source.eli"))
         (map
          (json-parse-string
           (eliscript-emission-source-map emission)
           :object-type 'alist
           :array-type 'list))
         (segments
          (eliscript-tests--decode-mappings
           (alist-get 'mappings map))))
    (should (= (alist-get 'version map) 3))
    (should (equal (alist-get 'file map) "output.mjs"))
    (should (equal (alist-get 'sources map) '("source.eli")))
    (should (equal (alist-get 'sourcesContent map) (list source)))
    (should (equal-including-properties
             (eliscript-emission-javascript emission)
             (substring-no-properties
              (eliscript-emission-javascript emission))))
    (should (string-match-p
             (regexp-quote "console.log(\"😀\", \"after\");")
             (eliscript-emission-javascript emission)))
    (should (member '(3 0 0 0 0) segments))
    (should (cl-find-if
             (lambda (segment)
               (and (= (nth 3 segment) 1)
                    (= (nth 4 segment) 1)))
             segments))
    (should (cl-find-if
             (lambda (segment)
               (and (= (nth 1 segment) 18)
                    (= (nth 3 segment) 2)
                    (= (nth 4 segment) 12)))
             segments))))

(ert-deftest eliscript-source-map-points-expanded-code-to-macro-call ()
  (let* ((source
          "(defmacro twice (value) `(+ ,value ,value))\n\n(print (twice 21))")
         (emission
          (eliscript-compile-string-with-source-map
           source "macro-map.eli" "macro-map.mjs"))
         (map
          (json-parse-string
           (eliscript-emission-source-map emission)
           :object-type 'alist))
         (segments
          (eliscript-tests--decode-mappings
           (alist-get 'mappings map))))
    (should
     (cl-find-if
      (lambda (segment)
        (and (= (nth 3 segment) 2)
             (= (nth 4 segment) 7)))
      segments))))

(ert-deftest eliscript-react-lowers-components-and-elements-to-ir ()
  (let* ((source
         "(import \"react\" StrictMode)
(defcomponent App (props)
  (jsx StrictMode nil
    (fragment (jsx :h1 nil (get props :title)))))
(export App)")
         (program (eliscript-compile-ir-string source "react-ir.eli"))
         node-kinds
         react-nodes)
    (eliscript-ir-walk
     program
     (lambda (node)
       (push (eliscript-ir-node-kind node) node-kinds)
       (when (memq (eliscript-ir-node-kind node)
                   '(react-element react-fragment))
         (push node react-nodes))))
    (should (memq 'function-declaration node-kinds))
    (should (memq 'react-element node-kinds))
    (should (memq 'react-fragment node-kinds))
    (should (cl-every #'eliscript-ir-node-span react-nodes))
    (should-not (string-match-p
                 "defcomponent"
                 (eliscript-compile-string source "react-ir.eli")))))

(ert-deftest eliscript-react-emits-the-automatic-jsx-runtime ()
  (let ((output
         (eliscript-compile-string
          "(import \"react\" useState StrictMode)
(defcomponent Counter (props)
  (let* ((state (useState 0))
         (count (nth 0 state))
         (set-count (nth 1 state)))
    (jsx StrictMode nil
      (jsx :section (object :className \"counter\")
        (jsx :button
          (object :onClick (lambda () (set-count (1+ count))))
          \"Increment\")
        (fragment
          (when (> count 0) (jsx :strong nil count))
          (get props :children))))))
(export Counter)"
          "react-emitter.eli")))
    (should (= (length
                (split-string output "react/jsx-runtime" t))
               2))
    (should (string-match-p
             (regexp-quote
              "import * as __eliscript_react_jsx_runtime from \"react/jsx-runtime\";")
             output))
    (should (string-match-p
             (regexp-quote
              "__eliscript_react_jsx_runtime.jsx(StrictMode")
             output))
    (should (string-match-p
             (regexp-quote
              "__eliscript_react_jsx_runtime.jsxs(\"section\"")
             output))
    (should (string-match-p ".Fragment" output))
    (should (string-match-p "\"onClick\"" output))
    (should-not
     (string-match-p
      "react/jsx-runtime"
      (eliscript-compile-string "(defun identity (value) value)")))))

(ert-deftest eliscript-react-emits-key-as-a-runtime-argument ()
  (let ((output
         (eliscript-compile-string
          "(defun item (slug)
  (jsx :li (object :key slug :className \"entry\") slug))"
          "react-key.eli")))
    (should (string-match-p
             (regexp-quote
              "__eliscript_react_jsx_runtime.jsx(\"li\"")
             output))
    (should (string-match-p
             (regexp-quote "\"className\": \"entry\"")
             output))
    (should (string-match-p
             (regexp-quote "children: slug}, slug)")
             output))
    (should-not (string-match-p "\"key\":" output))))

(ert-deftest eliscript-react-validates-jsx-and-internal-bindings ()
  (should-error (eliscript-compile-string "(jsx :div)")
                :type 'eliscript-analyze-error)
  (should-error (eliscript-compile-string "(jsx Missing nil)")
                :type 'eliscript-analyze-error)
  (should-error
   (eliscript-compile-string
    "(defun outer () (defcomponent Inner () (jsx :span nil)))")
   :type 'eliscript-expand-error)
  (should-error (eliscript-compile-string "(defconst __eliscript_truthy 1)")
                :type 'eliscript-analyze-error)
  (should-error
   (eliscript-compile-string "(print __eliscript_react_jsx_runtime/jsx)")
   :type 'eliscript-analyze-error))

(provide 'eliscript-tests)

;;; eliscript-tests.el ends here
