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

(ert-deftest eliscript-reader-columns-count-source-characters ()
  (let* ((source (concat "\t" (string #x1f600)))
         (form (car (eliscript-read-located-string source "columns.eli")))
         (span (eliscript-form-span form)))
    (should (= (eliscript-source-span-start span) 1))
    (should (= (eliscript-source-span-end span) 2))
    (should (= (eliscript-source-span-column span) 2))
    (should (= (eliscript-source-span-end-column span) 3)))
  (let* ((source (concat "\t" (string #x1f600) ")"))
         (error-data
          (should-error
           (eliscript-read-located-string source "columns.eli")
           :type 'eliscript-read-error)))
    (should (string-match-p
             (regexp-quote "columns.eli:1:3: Invalid read syntax")
             (error-message-string error-data)))))

(ert-deftest eliscript-emits-literals-and-data ()
  (should (equal (eliscript-emitter-emit-expression nil) "null"))
  (should (equal (eliscript-emitter-emit-expression t) "true"))
  (should (equal (eliscript-emitter-emit-expression 'false) "false"))
  (should (equal (eliscript-emitter-emit-expression [1 "two" :three])
                 "__eliscript_vector(1, \"two\", __eliscript_keyword(\"three\"))"))
  (should (equal (eliscript-emitter-emit-expression '(quote nil))
                 "__eliscript_list()"))
  (should
   (equal
    (eliscript-emitter-emit-expression
     '(quote (alpha :beta [1 undefined])))
    (concat "__eliscript_list(__eliscript_symbol(\"alpha\"), "
            "__eliscript_keyword(\"beta\"), "
            "__eliscript_vector(1, undefined))")))
  (should-error
   (eliscript-emitter-emit-expression '(quote (1 . 2)))
   :type 'eliscript-compile-error)
  (should (equal (eliscript-emitter-emit-expression
                 '(js-object :name "Ada" :active t))
                 "({\"name\": \"Ada\", \"active\": true})")))

(ert-deftest eliscript-emits-first-class-keyword-values ()
  (let* ((source
          "(defconst keyword-value :article/title)
(defconst data {:article/title keyword-value})
(defconst host (js-object :ready t))
(defconst host-ready (get host :ready))
(defconst host-indexed (aref host :ready))
(defconst host-has (object-has? host :ready))
(defconst host-copy (object-assoc host :count 1))")
         (output (eliscript-compile-string source "keywords.eli")))
    (should (equal output
                   (eliscript-tests--legacy-compile-string
                    source "keywords.eli")))
    (should (= (length (split-string output "eliscript/runtime/literals" t))
               2))
    (should (= (length (split-string output "__eliscript_keyword(" t))
               3))
    (should (string-match-p
             (regexp-quote
              "const keyword_value = __eliscript_keyword(\"article/title\")")
             output))
    (should (string-match-p
             (regexp-quote "const host_ready = (host)[\"ready\"]")
             output))
    (should (string-match-p
             (regexp-quote "const host_indexed = (host)[\"ready\"]")
             output))
    (should (string-match-p
             (regexp-quote
              "Object.prototype.hasOwnProperty.call((host) ?? {}, \"ready\")")
             output))
    (should (string-match-p
             (regexp-quote "[\"count\"]: 1") output))))

(ert-deftest eliscript-separates-persistent-vectors-from-host-arrays ()
  (let* ((source
          "(defconst persistent [1 [2]])
(defconst host (js-array 3 4))
(defconst report
  [(nth 0 persistent) (length persistent)
   (nth 0 host) (length host)])")
         (program (eliscript-compile-ir-string source "vectors.eli"))
         (output (eliscript-compile-string source "vectors.eli"))
         kinds)
    (eliscript-ir-walk
     program
     (lambda (node) (push (eliscript-ir-node-kind node) kinds)))
    (should (= (cl-count 'persistent-vector-literal kinds) 3))
    (should (= (cl-count 'array-literal kinds) 1))
    (should (= (length (split-string output "eliscript/runtime/literals" t))
               2))
    (should (= (length (split-string output "runtime/core/collection.mjs" t))
               2))
    (should (equal output
                   (eliscript-tests--legacy-compile-string
                    source "vectors.eli")))
    (should
     (equal
      (eliscript-ir-program-to-forms program)
      '((defconst persistent (vector 1 (vector 2)))
        (defconst host (js-array 3 4))
        (defconst report
          (vector
           (nth 0 persistent) (length persistent)
           (nth 0 host) (length host))))))))

(ert-deftest eliscript-lowers-map-syntax-to-persistent-map-literals ()
  (let* ((source
          "(defconst data
  {:name \"Eliscript\" [1 2] {:nested [3]}})")
         (located (eliscript-read-located-string source "maps.eli"))
         (program (eliscript-compile-ir-string source "maps.eli"))
         (output (eliscript-compile-string source "maps.eli"))
         kinds)
    (eliscript-ir-walk
     program
     (lambda (node) (push (eliscript-ir-node-kind node) kinds)))
    (should
     (equal (mapcar #'eliscript-form-strip located)
            '((defconst data
                (hash-map :name "Eliscript"
                          [1 2]
                          (hash-map :nested [3]))))))
    (should (= (cl-count 'persistent-map-literal kinds) 2))
    (should (= (cl-count 'persistent-vector-literal kinds) 2))
    (should (= (length (split-string output "eliscript/runtime/literals" t))
               2))
    (should (equal output
                   (eliscript-tests--legacy-compile-string
                    source "maps.eli")))
    (should
     (equal
      (eliscript-ir-program-to-forms program)
      '((defconst data
          (hash-map :name "Eliscript"
                    (vector 1 2)
                    (hash-map :nested (vector 3)))))))))

(ert-deftest eliscript-lowers-set-syntax-to-persistent-set-literals ()
  (let* ((source
          "(defconst data
  #{:name [1 2] #{:nested} {:ready t} :name})")
         (located (eliscript-read-located-string source "sets.eli"))
         (program (eliscript-compile-ir-string source "sets.eli"))
         (output (eliscript-compile-string source "sets.eli"))
         kinds)
    (eliscript-ir-walk
     program
     (lambda (node) (push (eliscript-ir-node-kind node) kinds)))
    (should
     (equal (mapcar #'eliscript-form-strip located)
            '((defconst data
                (hash-set :name [1 2] (hash-set :nested)
                          (hash-map :ready t) :name)))))
    (let* ((declaration (car located))
           (set-form (nth 2 (eliscript-form-value declaration)))
           (operator (car (eliscript-form-value set-form)))
           (set-span (eliscript-form-span set-form))
           (operator-span (eliscript-form-span operator)))
      (should (string-prefix-p
               "#{" (substring source
                               (eliscript-source-span-start set-span)
                               (eliscript-source-span-end set-span))))
      (should (equal
               (substring source
                          (eliscript-source-span-start operator-span)
                          (eliscript-source-span-end operator-span))
               "#{")))
    (should (= (cl-count 'persistent-set-literal kinds) 2))
    (should (= (cl-count 'persistent-map-literal kinds) 1))
    (should (= (cl-count 'persistent-vector-literal kinds) 1))
    (should (= (length (split-string output "eliscript/runtime/literals" t))
               2))
    (should (string-match-p "__eliscript_hash_set" output))
    (should (equal output
                   (eliscript-tests--legacy-compile-string
                    source "sets.eli")))
    (should
     (equal
      (eliscript-ir-program-to-forms program)
      '((defconst data
          (hash-set :name (vector 1 2) (hash-set :nested)
                    (hash-map :ready t) :name)))))))

(ert-deftest eliscript-lowers-queue-syntax-to-persistent-queue-literals ()
  (let* ((source
          "(defconst data
  #queue [1 [2] #queue[3] {:ready t}])")
         (located (eliscript-read-located-string source "queues.eli"))
         (program (eliscript-compile-ir-string source "queues.eli"))
         (output (eliscript-compile-string source "queues.eli"))
         kinds)
    (eliscript-ir-walk
     program
     (lambda (node) (push (eliscript-ir-node-kind node) kinds)))
    (should
     (equal (mapcar #'eliscript-form-strip located)
            '((defconst data
                (queue 1 [2] (queue 3) (hash-map :ready t))))))
    (let* ((declaration (car located))
           (queue-form (nth 2 (eliscript-form-value declaration)))
           (operator (car (eliscript-form-value queue-form)))
           (queue-span (eliscript-form-span queue-form))
           (operator-span (eliscript-form-span operator)))
      (should (string-prefix-p
               "#queue"
               (substring source
                          (eliscript-source-span-start queue-span)
                          (eliscript-source-span-end queue-span))))
      (should (equal
               (substring source
                          (eliscript-source-span-start operator-span)
                          (eliscript-source-span-end operator-span))
               "#queue")))
    (should (= (cl-count 'persistent-queue-literal kinds) 2))
    (should (= (cl-count 'persistent-map-literal kinds) 1))
    (should (= (cl-count 'persistent-vector-literal kinds) 1))
    (should (= (length (split-string output "eliscript/runtime/literals" t))
               2))
    (should (string-match-p "__eliscript_queue" output))
    (should (equal output
                   (eliscript-tests--legacy-compile-string
                    source "queues.eli")))
    (should
     (equal
      (eliscript-ir-program-to-forms program)
      '((defconst data
          (queue 1 (vector 2) (queue 3) (hash-map :ready t))))))))

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
  (js-array (nil? value) (undefined? value) (nullish? value)))"
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
                 (vector required optional rest))
               (defconst invoke
                 (lambda (first &optional second &rest tail)
                   (vector first second tail)))))))
  (should
   (string-match-p
    (regexp-quote "function collect(required, optional = null, ...rest)")
    (eliscript-compile-portable-string
     "(defportable collect (required &optional optional &rest rest)
  (js-array required optional rest))"
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
                 ([nested] (vector fallback)))
            (vector first second fourth tail fallback head rest nested)))
        (defun catch-pair nil
          (try
            (throw (vector 7 "caught"))
            (catch [code message] (vector code message))))))))
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

(ert-deftest eliscript-supports-map-binding-patterns ()
  (let* ((source
          "(defun unpack ({:keys [name age] :or {age 18} :as row})
  [name age row])
(defun nested ({alias :name {:keys [city]} :profile}) [alias city])
(defun shortcuts ({:keys [profile/name] :account/keys [id]
                   :strs [label] :syms [token] :or {id 7}})
  [name id label token])
(defun recover ()
  (try (throw (js-object :code 7))
    (catch {:keys [code]} code)))")
         (output (eliscript-compile-string source "map-patterns.eli"))
         (program (eliscript-compile-ir-string source "map-patterns.eli"))
         kinds)
    (eliscript-ir-walk
     program
     (lambda (node) (push (eliscript-ir-node-kind node) kinds)))
    (should (string-match-p
             (regexp-quote "function unpack(__eliscript_value_1)") output))
    (should (string-match-p
             (regexp-quote "__eliscript_binding_get") output))
    (should (string-match-p
             (regexp-quote "__eliscript_binding_missing") output))
    (dolist (kind '(map-binding-pattern map-binding-entry binding-name))
      (should (memq kind kinds)))
    (should
     (equal
      (eliscript-ir-program-to-forms program)
      '((defun unpack ((hash-map name :name age :age
                                :or (hash-map age 18) :as row))
          (vector name age row))
        (defun nested ((hash-map alias :name
                                  (hash-map city :city) :profile))
          (vector alias city))
        (defun shortcuts ((hash-map name :profile/name id :account/id
                                     label "label" token (quote token)
                                     :or (hash-map id 7)))
          (vector name id label token))
        (defun recover nil
          (try (throw (js-object :code 7))
            (catch (hash-map code :code) code)))))))
  (should
   (string-match-p
    (regexp-quote "function portable_name(__eliscript_value_1)")
    (eliscript-compile-portable-string
     "(defportable portable-name ({:keys [name]}) name)"
     '(portable-name)
     "portable-map-patterns.eli")))
  (let ((output
         (eliscript-compile-string
          "(defun shortcut ({:keys [profile/name] :strs [label] :syms [token]}) [name label token])"
          "map-shortcuts.eli")))
    (should (string-match-p
             (regexp-quote "__eliscript_keyword(\"profile/name\")") output))
    (should (string-match-p
             (regexp-quote "__eliscript_symbol(\"token\")") output)))
  (dolist (source
           '("(defun broken ({:keys name}) name)"
             "(defun broken ({:keys [name] :keys [other]}) name)"
             "(defun broken ({:strs label}) label)"
             "(defun broken ({:syms [:token]}) token)"
             "(defun broken ({:account/keys [id] :account/keys [other]}) id)"
             "(defun broken ({:or {missing 1} :keys [name]}) name)"
             "(defun broken ({:as 1}) nil)"
             "(defun broken ({:unknown value}) value)"))
    (should-error (eliscript-compile-string source "map-patterns.eli")
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

(ert-deftest eliscript-specializes-binary-comparisons ()
  (dolist (case '((= "===") (< "<") (<= "<=") (> ">") (>= ">=")))
    (let* ((operator (nth 0 case))
           (javascript-operator (nth 1 case))
           (binary (eliscript-emitter-emit-expression
                    (list operator '(left) '(right))))
           (n-ary (eliscript-emitter-emit-expression
                   (list operator '(first) '(second) '(third)))))
      (should (equal binary
                     (format "(left() %s right())" javascript-operator)))
      (should-not (string-match-p "=>" binary))
      (should (string-match-p "=>" n-ary))
      (should (string-match-p "first()" n-ary))
      (should (string-match-p "second()" n-ary))
      (should (string-match-p "third()" n-ary))))
  (let ((source
         "(defun compare (left right third) [(= left right) (< left right third)])"))
    (should
     (equal (eliscript-compile-string source "comparison.eli")
            (eliscript-tests--legacy-compile-string source "comparison.eli")))))

(ert-deftest eliscript-separates-identity-and-value-equality ()
  (let* ((source
          "(defun compare (left right) [(eq left right) (equal left right)])")
         (output (eliscript-compile-string source "equality.eli"))
         (legacy (eliscript-tests--legacy-compile-string source "equality.eli"))
         (runtime-path "eliscript/runtime/core/value.mjs")
         (first-import (string-match (regexp-quote runtime-path) output)))
    (should (equal output legacy))
    (should first-import)
    (should-not
     (string-match (regexp-quote runtime-path)
                   output (+ first-import (length runtime-path))))
    (should (string-match-p (regexp-quote "(left === right)") output))
    (should
     (string-match-p
      (regexp-quote "__eliscript_equal(left, right)") output))
    (should-not
     (string-match-p
      (regexp-quote runtime-path)
      (eliscript-compile-string
       "(defun same-object (left right) (eq left right))" "identity.eli")))
    (should-not
     (string-match-p
      (regexp-quote runtime-path)
      (eliscript-compile-string "(defconst form '(equal left right))"
                                "quoted-equality.eli")))))

(ert-deftest eliscript-enforces-complete-esm-import-contract ()
  (let ((output
         (eliscript-compile-string
          "(import \"side-effect\")
(import \"named\" createView createViews)
(import \"default\" :default View)
(import \"default-named\" :default App render)
(import \"namespace\" :as Runtime)
(import \"default-namespace\" :default Main :as Bundle)
(export View App Main createView createViews render Runtime Bundle)")))
    (should (string-match-p
             (regexp-quote "import \"side-effect\";")
             output))
    (should (string-match-p
             (regexp-quote "import {createView, createViews} from \"named\";")
             output))
    (should (string-match-p
             (regexp-quote "import View from \"default\";")
             output))
    (should (string-match-p
             (regexp-quote "import App, {render} from \"default-named\";")
             output))
    (should (string-match-p
             (regexp-quote "import * as Runtime from \"namespace\";")
             output))
    (should (string-match-p
             (regexp-quote
              "import Main, * as Bundle from \"default-namespace\";")
             output)))
  (let ((error
         (should-error
          (eliscript-compile-string
           "(import \"invalid\" :as Runtime createView)"
           "invalid-import.eli")
          :type 'eliscript-compile-error)))
    (should
     (string-match-p
      (regexp-quote
       "invalid-import.eli:1:1: namespace and named imports cannot be combined")
      (error-message-string error)))))

(ert-deftest eliscript-emits-javascript-interop ()
  (should
   (equal
    (eliscript-emitter-emit-expression
     '(js-call (js-array 1 2 3) :map (lambda (value) (* value 2))))
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
  (should-error (eliscript-emitter-emit-expression '(js-object :name))
                :type 'eliscript-compile-error)
  (dolist (form '((object-keys)
                  (object-has? value)
                  (object-assoc value key)))
    (should-error (eliscript-emitter-emit-expression form)
                  :type 'eliscript-compile-error)))

(ert-deftest eliscript-emits-persistent-list-and-explicit-host-cons ()
  (should (equal (eliscript-emitter-emit-expression '(list 1 2))
                 "__eliscript_list(1, 2)"))
  (should (equal (eliscript-emitter-emit-expression '(car nil))
                 "__eliscript_first(null)"))
  (should (equal (eliscript-emitter-emit-expression '(cdr nil))
                 "__eliscript_rest(null)"))
  (should (equal (eliscript-emitter-emit-expression '(cons 1 nil))
                 "__eliscript_cons(1, null)"))
  (should (equal (eliscript-emitter-emit-expression '(js-cons 1 nil))
                 "[1, ...((null) ?? [])]")))

(ert-deftest eliscript-rejects-retired-host-container-aliases ()
  (dolist (entry '(("(array 1 2)" . "unbound symbol: array")
                   ("(object :ready t)" . "unbound symbol: object")))
    (let ((error-data
           (should-error
            (eliscript-compile-string (car entry) "host-alias.eli")
            :type 'eliscript-analyze-error)))
      (should (string-match-p
               (regexp-quote (cdr entry))
               (error-message-string error-data))))))

(ert-deftest eliscript-lowers-list-construction-to-persistent-ir ()
  (let* ((source
          "(defconst values (list 1 2))\n(defconst tail (cdr values))\n(defconst host (js-cons 0 (js-array 1 2)))")
         (program (eliscript-compile-ir-string source "lists.eli"))
         (output (eliscript-compile-string source "lists.eli"))
         kinds)
    (eliscript-ir-walk
     program
     (lambda (node) (push (eliscript-ir-node-kind node) kinds)))
    (should (= (cl-count 'persistent-list-literal kinds) 1))
    (should (= (cl-count 'array-literal kinds) 1))
    (should (string-match-p "__eliscript_list(1, 2)" output))
    (should (string-match-p "__eliscript_rest(values)" output))
    (should
     (string-match-p
      (regexp-quote "[0, ...(([1, 2]) ?? [])]")
      output))
    (should (string-match-p "runtime/core/list.mjs" output))
    (should
     (equal
      (eliscript-ir-program-to-forms program)
      '((defconst values (list 1 2))
        (defconst tail (cdr values))
        (defconst host (js-cons 0 (js-array 1 2))))))))

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

(ert-deftest eliscript-transient-analysis-allows-local-owned-construction ()
  (let ((imports
         "(import \"./stdlib/core/transient.mjs\"
         transient conj! persistent!)\n"))
    (dolist
        (body
         '("(defun build (source)
  (let ((builder (transient source)))
    (conj! builder 1)
    (persistent! builder)))"
           "(defun build (source ready)
  (let ((builder (transient source)))
    (if ready (persistent! builder) (persistent! builder))))"
           "(defasync build (source promise)
  (let ((builder (transient source)))
    (conj! builder 1)
    (persistent! builder))
  (await promise))"
           "(defun build (source)
  (let* ((transient (transient source))
         (value (persistent! transient)))
    value))"
           "(defun build (source)
  (let ((builder (transient source)))
    (try (conj! builder 1) (catch error nil))
    (persistent! builder)))"))
      (should (string-match-p
               "function build"
               (eliscript-compile-string
                (concat imports body) "transient-valid.eli"))))
    (should
     (string-match-p
      "function build"
      (eliscript-compile-string
       "(defun transient (value) value)
(defun build (source) (transient source))"
       "ordinary-transient-name.eli")))))

(ert-deftest eliscript-transient-analysis-rejects-ownership-escape ()
  (let ((imports
         "(import \"./stdlib/core/transient.mjs\"
         transient conj! persistent!)\n")
        (namespace-import
         "(import \"./runtime/core/transient.mjs\" :as Runtime)\n"))
    (dolist
        (case
         `(("(defasync build (source promise)
  (let ((builder (transient source)))
    (await promise)
    (persistent! builder)))"
            "cannot remain active across await")
           ("(defconst builder (transient [])) (export builder)"
            "cannot be exported")
           ("(defun build (source)
  (let ((builder (transient source)))
    (persistent! builder)
    (conj! builder 1)
    nil))"
            "no longer editable after persistent!")
           ("(defun sink (value) value)
(defun build (source)
  (let ((builder (transient source)))
    (sink builder)))"
            "may only be used by a direct transient operation")
           ("(defun build (source)
  (let ((builder (transient source)))
    (lambda () (conj! builder 1))))"
            "cannot cross a function boundary")
           ("(defun build (source ready)
  (let ((builder (transient source)))
    (when ready (persistent! builder))
    (conj! builder 1)
    nil))"
            "may already be persistent after conditional control flow")
           ("(defun build (source)
  (let ((builder (transient source)))
    (loop ((remaining 1))
      (persistent! builder))))"
            "cannot be completed inside a repeated loop")
           ("(defun build (source) (transient source))"
            "must be bound directly to one symbol")
           ("(defun build (source)
  (let* ((builder (transient source))
         (result (conj! builder 1)))
    result))"
            "update result cannot be used as an ordinary value")
           ("(defun build (source)
  (let ((builder (transient source)))
    (try
      (persistent! builder)
      (throw \"failed\")
      (catch error (conj! builder error)))
    nil))"
            "may already be persistent after conditional control flow")))
      (let ((error-data
             (should-error
              (eliscript-compile-string
               (concat imports (car case)) "transient-invalid.eli")
              :type 'eliscript-analyze-error)))
        (should (string-match-p
                 (regexp-quote (cadr case))
                 (error-message-string error-data)))))
    (let ((error-data
           (should-error
            (eliscript-compile-string
             (concat namespace-import
                     "(defun build (source)
  (funcall Runtime/transient source))")
             "transient-indirect.eli")
            :type 'eliscript-analyze-error)))
      (should (string-match-p
               "transient operation Runtime/transient must be called directly"
               (error-message-string error-data))))))

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
             output))
    (should (string-match-p
             (regexp-quote "return (arguments$ + eval$);")
             output)))
  (should (equal (eliscript-symbol-reference-name 'arguments) "arguments$"))
  (should (equal (eliscript-symbol-reference-name 'globalThis/arguments)
                 "globalThis.arguments")))

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

(ert-deftest eliscript-file-output-isolation-rejects-physical-aliases ()
  (let* ((directory (make-temp-file "eliscript-output-isolation-" t))
         (source (expand-file-name "main.eli" directory))
         (linked-output (expand-file-name "linked.mjs" directory))
         (mapped-output (expand-file-name "mapped.mjs" directory))
         (mapped-map (concat mapped-output ".map"))
         (aliased-output (expand-file-name "aliased.mjs" directory))
         (aliased-map (concat aliased-output ".map"))
         (source-text
          "(defportable answer () 42)\n(export answer)\n"))
    (unwind-protect
        (progn
          (with-temp-file source (insert source-text))
          (should-error (eliscript-compile-file source source))
          (should-error
           (eliscript-compile-portable-file source '(answer) source))
          (should (equal (with-temp-buffer
                           (insert-file-contents source)
                           (buffer-string))
                         source-text))

          (make-symbolic-link source linked-output)
          (should-error (eliscript-compile-file source linked-output))
          (should (equal (with-temp-buffer
                           (insert-file-contents source)
                           (buffer-string))
                         source-text))

          (make-symbolic-link source mapped-map)
          (should-error
           (eliscript-compile-file-with-source-map
            source mapped-output mapped-map))
          (should (equal (with-temp-buffer
                           (insert-file-contents source)
                           (buffer-string))
                         source-text))

          (with-temp-file aliased-output (insert "existing output\n"))
          (add-name-to-file aliased-output aliased-map)
          (should-error
           (eliscript-compile-portable-file-with-source-map
            source '(answer) aliased-output aliased-map)))
      (delete-directory directory t))))

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

(ert-deftest eliscript-expander-desugars-multimethod-declarations ()
  (let ((output
         (eliscript-compile-string
          (concat
           "(import \"./multimethod.eli\" add-method! multi-fn)\n"
           "(defmulti render (lambda (kind value) kind) \"fallback\")\n"
           "(defmethod render \"text\" (kind value) (str value))\n"
           "(export render)")
          "declarative.eli")))
    (should (string-match-p
             (regexp-quote
              "const render = multi_fn(\"render\", (kind, value) =>")
             output))
    (should (string-match-p
             (regexp-quote
              "add_method_BANG_(render, \"text\", (kind, value) =>")
             output))
    (should-not (string-match-p "defmulti\\|defmethod" output))))

(ert-deftest eliscript-expander-validates-multimethod-declarations ()
  (dolist (case
           '(("(defmulti render)"
             "defmulti expects a name, dispatch function, and optional default value")
             ("(defmulti \"render\" (lambda (value) value))"
              "defmulti name must be a symbol")
             ("(defmethod render :text)"
             "defmethod expects a multimethod, dispatch value, and parameter list")
             ("(defmethod (get registry :render) :text (value) value)"
              "defmethod target must be a symbol")
             ("(defun broken () (defmulti nested (lambda (value) value)))"
              "defmulti is only valid at module top level")
             ("(defun broken () (defmethod render :text (value) value))"
              "defmethod is only valid at module top level")))
    (let ((error-data
           (should-error
            (eliscript-compile-string (car case) "declarative-error.eli")
            :type 'eliscript-expand-error)))
      (should (string-match-p
               (regexp-quote (cadr case))
               (error-message-string error-data))))))

(ert-deftest eliscript-expander-desugars-protocol-declarations ()
  (let ((output
         (eliscript-compile-string
          (concat
           "(import \"./protocol.eli\" define-protocol protocol-method "
           "extend-protocol-category extend-protocol-default)\n"
           "(defprotocol IDescribe describe measure)\n"
           "(extend-category \"number\" IDescribe "
           "(describe (value) (str value)) "
           "(measure (value scale) (* value scale)))\n"
           "(extend-default IDescribe "
           "(describe (_value) \"default\") "
           "(measure (_value _scale) 0))\n"
           "(export IDescribe describe measure)")
          "declarative-protocol.eli")))
    (should (string-match-p
             (regexp-quote
              "const IDescribe = define_protocol(\"IDescribe\", [\"describe\", \"measure\"]);")
             output))
    (should (string-match-p
             (regexp-quote
              "const describe = protocol_method(IDescribe, \"describe\");")
             output))
    (should (string-match-p
             (regexp-quote
              "extend_protocol_category(IDescribe, \"number\"")
             output))
    (should (string-match-p
             (regexp-quote "extend_protocol_default(IDescribe") output))
    (should-not
     (string-match-p
      "defprotocol\\|extend-category\\|extend-default" output))))

(ert-deftest eliscript-expander-validates-protocol-declarations ()
  (dolist (case
           '(("(defprotocol IEmpty)"
              "defprotocol expects a name and at least one operation")
             ("(defprotocol \"Wrong\" describe)"
              "defprotocol name must be a symbol")
             ("(defprotocol IDescribe describe describe)"
              "defprotocol declares duplicate operation: describe")
             ("(extend-type (get registry :Box) IDescribe (describe (x) x))"
              "extend-type target must be a symbol")
             ("(extend-category :number IDescribe (describe (x) x))"
              "extend-category category must be a non-empty string")
             ("(extend-default IDescribe (describe (x) x) (describe (x) x))"
              "extend-default declares duplicate method: describe")
             ("(extend-default IDescribe describe)"
              "extend-default method must contain an operation and parameter list")
             ("(defun broken () (defprotocol INested read))"
              "defprotocol is only valid at module top level")
             ("(defun broken () (extend-default IDescribe (read (x) x)))"
              "extend-default is only valid at module top level")))
    (let ((error-data
           (should-error
            (eliscript-compile-string (car case) "protocol-error.eli")
            :type 'eliscript-expand-error)))
      (should (string-match-p
               (regexp-quote (cadr case))
               (error-message-string error-data))))))

(ert-deftest eliscript-expander-desugars-record-declarations ()
  (let ((output
         (eliscript-compile-string
          (concat
           "(import \"./record.eli\" define-record-type)\n"
           "(defrecord Person [name age])\n"
           "(export Person ->Person map->Person Person?)")
          "declarative-record.eli")))
    (should (string-match-p
             (regexp-quote
              "const Person = define_record_type(\"Person\", [\"name\", \"age\"]);")
             output))
    (should (string-match-p
             (regexp-quote
              "const __GT_Person = (name, age) =>")
             output))
    (should (string-match-p
             (regexp-quote "(Person)[\"create\"](name, age)") output))
    (should (string-match-p
             (regexp-quote "const map__GT_Person = (source) =>") output))
    (should (string-match-p
             (regexp-quote "(Person)[\"fromMap\"](source)") output))
    (should (string-match-p
             (regexp-quote "const Person_QMARK_ = (value) =>") output))
    (should-not (string-match-p "defrecord" output))))

(ert-deftest eliscript-expander-validates-record-declarations ()
  (dolist (case
           '(("(defrecord Person)"
              "defrecord expects a name and field vector")
             ("(defrecord \"Person\" [name])"
              "defrecord name must be an unqualified symbol")
             ("(defrecord domain/Person [name])"
              "defrecord name must be an unqualified symbol")
             ("(defrecord Person (name))"
              "defrecord fields must be a vector")
             ("(defrecord Person [name domain/age])"
              "defrecord fields must be unqualified symbols")
             ("(defrecord Person [name name])"
              "defrecord declares duplicate field: name")
             ("(defun broken () (defrecord Nested [value]))"
              "defrecord is only valid at module top level")))
    (let ((error-data
           (should-error
            (eliscript-compile-string (car case) "record-error.eli")
            :type 'eliscript-expand-error)))
      (should (string-match-p
               (regexp-quote (cadr case))
               (error-message-string error-data))))))

(ert-deftest eliscript-expander-desugars-type-and-reify-forms ()
  (let ((output
         (eliscript-compile-string
          (concat
           "(import \"./protocol.eli\" define-protocol protocol-method)\n"
           "(import \"./type.eli\" define-type reify-protocols)\n"
           "(defprotocol IRead read)\n"
           "(deftype Box [value] IRead (read (box) (get box :value)))\n"
           "(defun captured (prefix) "
           "(reify IRead (read (_self suffix) (str prefix suffix))))\n"
           "(export Box ->Box Box? captured)")
          "declarative-type.eli")))
    (should (string-match-p
             (regexp-quote
              "const Box = define_type(\"Box\", [\"value\"], [[IRead")
             output))
    (should (string-match-p
             (regexp-quote "const __GT_Box = (value) =>") output))
    (should (string-match-p
             (regexp-quote "(Box)[\"create\"](value)") output))
    (should (string-match-p
             (regexp-quote "const Box_QMARK_ = (value) =>") output))
    (should (string-match-p
             (regexp-quote "return reify_protocols([[IRead") output))
    (should-not (string-match-p "deftype\|reify " output))))

(ert-deftest eliscript-expander-validates-type-and-reify-forms ()
  (dolist (case
           '(("(deftype Box)"
              "deftype expects a name, field vector")
             ("(deftype domain/Box [value])"
              "deftype name must be an unqualified symbol")
             ("(deftype Box (value))"
              "deftype fields must be a vector")
             ("(deftype Box [value value])"
              "deftype declares duplicate field: value")
             ("(deftype Box [] \"IRead\" (read (x) x))"
              "deftype protocol must be a symbol")
             ("(deftype Box [] IRead)"
              "deftype protocol IRead expects at least one method")
             ("(deftype Box [] IRead (read () nil))"
              "deftype method must declare a receiver parameter")
             ("(reify)"
              "reify expects at least one protocol implementation")
             ("(reify IRead (read (x) x) IRead (read (x) x))"
              "reify declares duplicate protocol: IRead")
             ("(defun broken () (deftype Nested []))"
              "deftype is only valid at module top level")))
    (let ((error-data
           (should-error
            (eliscript-compile-string (car case) "type-error.eli")
            :type 'eliscript-expand-error)))
      (should (string-match-p
               (regexp-quote (cadr case))
               (error-message-string error-data))))))

(ert-deftest eliscript-expander-desugars-threading-and-binding-forms ()
  (let ((output
         (eliscript-compile-string
          (concat
           "(defun first (value) (-> value (1+) (* 2)))\n"
           "(defun last (value) (->> value (+ 1) (* 2)))\n"
           "(defun named (value) (as-> value item (+ item 1) (* item 2)))\n"
           "(defun conditional (value) (cond-> value t (1+) false (* 2)))\n"
           "(defun present-pipeline (value) (some-> value (1+) (* 2)))\n"
           "(defun truthy (value) (if-let (item value) item :missing))\n"
           "(defun present (value) (if-some (item value) item :missing))\n"
           "(defun bodies (value) "
           "(when-let (item value) (print item) (1+ item)))")
          "core-forms.eli")))
    (should (string-match-p
             (regexp-quote "return ((value + 1) * 2);") output))
    (should (string-match-p
             (regexp-quote "return (2 * (1 + value));") output))
    (should (string-match-p
             (regexp-quote "return ((item) => {") output))
    (should (string-match-p "thread\\$G[0-9]+" output))
    (should (string-match-p
             (regexp-quote "__eliscript_truthy(item) ? item") output))
    (should (string-match-p
             (regexp-quote "item === null") output))
    (should (string-match-p
             (regexp-quote "console.log(item);") output))
    (should-not
     (string-match-p
      (regexp-opt
       '("cond->" "some->" "if-let" "if-some" "when-let" "as->" "->>"))
      output))))

(ert-deftest eliscript-expander-validates-threading-and-binding-forms ()
  (dolist (case
           '(("(->)" "-> expects an initial expression")
             ("(-> 1 ())" "thread step must be a symbol or non-empty list")
             ("(->> 1 2)" "thread step must be a symbol or non-empty list")
             ("(cond->)" "cond-> expects an initial expression")
             ("(cond-> 1 t)" "cond-> expects test and step pairs")
             ("(cond->> 1 t)" "cond->> expects test and step pairs")
             ("(some->)" "some-> expects an initial expression")
             ("(some->> 1 ())"
              "thread step must be a symbol or non-empty list")
             ("(as-> 1 value)"
              "as-> expects an initial expression, binding name, and at least one form")
             ("(as-> 1 :value (+ value 1))"
              "as-> binding name must be a symbol")
             ("(if-let (value) value)"
              "if-let binding must contain a name and initializer")
             ("(if-some (:value 1) value)"
              "if-some binding name must be a symbol")
             ("(if-let (value 1) value 0 2)"
              "if-let expects a binding, then form, and optional else form")
             ("(when-let (value 1))"
              "when-let expects a binding and at least one body form")
             ("(when-some value value)"
              "when-some binding must contain a name and initializer")))
    (let ((error-data
           (should-error
            (eliscript-compile-string (car case) "core-forms-error.eli")
            :type 'eliscript-expand-error)))
      (should (string-match-p
               (regexp-quote (cadr case))
               (error-message-string error-data))))))

(ert-deftest eliscript-expander-desugars-value-dispatch-forms ()
  (let ((output
         (eliscript-compile-string
          (concat
           "(defun choose (value) "
           "(case value (1 2) :small ready :ready :other))\n"
           "(defun select (predicate value) "
           "(condp predicate value 1 :one 2 :>> (lambda (match) match) :other))")
          "value-dispatch.eli")))
    (should (string-match-p "case_value\$G[0-9]+" output))
    (should (string-match-p
             (regexp-quote "__eliscript_equal(case_value") output))
    (should (string-match-p "condp_predicate\$G[0-9]+" output))
    (should (string-match-p
             (regexp-quote "new globalThis.TypeError(\"condp found no matching clause\")")
             (eliscript-compile-string
              "(defun select (predicate value) (condp predicate value 1 :one))"
              "value-dispatch-no-default.eli")))
    (should-not
     (string-match-p "\\_<case\\_>\\|\\_<condp\\_>" output))))

(ert-deftest eliscript-expander-validates-value-dispatch-forms ()
  (dolist (case
           '(("(case 1)"
              "case expects a dispatch expression and at least one match/result pair")
             ("(case 2 (1 2) :small 2 :duplicate)"
              "case declares duplicate match constant: 2")
             ("(condp predicate value)"
              "condp expects a predicate, dispatch expression, and at least one clause")
             ("(condp predicate value 1 :>>)"
              "condp :>> clause requires a result function")))
    (let ((error-data
           (should-error
            (eliscript-compile-string (car case) "value-dispatch-error.eli")
            :type 'eliscript-expand-error)))
      (should (string-match-p
               (regexp-quote (cadr case))
               (error-message-string error-data))))))

(ert-deftest eliscript-expander-desugars-multi-arity-functions ()
  (let ((output
         (eliscript-compile-string
          (concat
           "(defun choose (() :zero) ((value) value))\n"
           "(defn alias (() :zero) ((value) value))\n"
           "(defportable portable (() :zero) ((value) value))\n"
           "(defasync asynchronous (() :zero) ((value) value))\n"
           "(defconst chooser (lambda (() :zero) ((value) value)))\n"
           "(defconst alias-chooser (fn (() :zero) ((value) value)))\n"
           "(defconst async-chooser (async (() :zero) ((value) value)))")
          "multi-arity.eli")))
    (should (string-match-p "arity_arguments\$G[0-9]+" output))
    (should (string-match-p
             (regexp-quote "received unsupported arity:") output))
    (should-not
     (string-match-p "(lambda (()\|(fn (()\|(async (()" output))))

(ert-deftest eliscript-expander-validates-multi-arity-functions ()
  (dolist (case
           '(("(defun choose ((value) value))"
              "multi-arity function requires at least two clauses")
             ("(defun choose ((value) value) ((other) other))"
              "multi-arity function declares duplicate fixed arity: 1")
             ("(defun choose ((x &rest xs) x) ((y &rest ys) y))"
              "multi-arity function declares more than one variadic clause")
             ("(defun choose ((x &rest xs) x) ((x y) y))"
              "multi-arity fixed arity 2 is unreachable behind variadic arity 1")
             ("(defun choose ((x &optional y) y) ((x y z) z))"
              "multi-arity clauses do not support &optional")
             ("(defun choose ((x)) ((x y) y))"
              "multi-arity clause requires a parameter list and body")))
    (let ((error-data
           (should-error
            (eliscript-compile-string (car case) "multi-arity-error.eli")
            :type 'eliscript-expand-error)))
      (should (string-match-p
               (regexp-quote (cadr case))
               (error-message-string error-data))))))

(ert-deftest eliscript-expander-preserves-quoted-data ()
  (let ((output
         (eliscript-compile-string
          "(defmacro twice (value) `(+ ,value ,value))
(defconst syntax '(twice 1))")))
    (should (string-match-p
             (regexp-quote
              "const syntax = __eliscript_list(__eliscript_symbol(\"twice\"), 1);")
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
         "(import \"host-library\" :default Host createValue)
(import \"host-renderer\" :as Renderer)
(import-portable \"./helper.eli\" helper)
(defvar state 0)
(defconst quoted-constructor '(vector 1))
(defun optional-branch (value) (let* () (if value value)))
(defun exercise (value values)
  (let* ((next (1+ value))
         (record (js-object :next next (+ value 1) value)))
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
                (if left (recur right left) (vector left right))))))))

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
  [(value-type value) (host-identity-token value)
   (string-code-unit-at text index)
   (string-from-code-unit 65) (string-to-number \"1.5\")
   (string-to-bigint \"42\") (number-float64-words value)])")
         (filename "value-inspection.eli")
         (output (eliscript-compile-string source filename))
         (portable-output
          (eliscript-compile-portable-string
           "(defportable inspect-value (value text index)
  (js-array (value-type value) (host-identity-token value)
   (string-code-unit-at text index)
   (string-from-code-unit 65) (string-to-number \"1.5\")
   (string-to-bigint \"42\") (number-float64-words value)))"
           '(inspect-value)
           filename)))
    (should
     (equal output (eliscript-tests--legacy-compile-string source filename)))
    (dolist (generated (list output portable-output))
      (should
       (string-match-p
        (regexp-quote
         "Symbol.for(\"eliscript.value.type\")")
        generated))
      (should
       (string-match-p
        (regexp-quote
         "__eliscript_type.value === \"keyword\" || __eliscript_type.value === \"symbol\"")
        generated))
      (should
       (string-match-p
        (regexp-quote
         "__eliscript_kind.value === \"eliscript/keyword\"")
        generated))
      (should
       (string-match-p
        (regexp-quote
         "__eliscript_kind.value === \"eliscript/symbol\"")
        generated))
      (should
       (string-match-p
        (regexp-quote
         "const __eliscript_host_identity_token = (() =>")
        generated))
      (should
       (string-match-p
        (regexp-quote "const objects = new WeakMap()") generated))
      (should
       (string-match-p
        (regexp-quote "const symbols = new Map()") generated))
      (should
       (string-match-p
        (regexp-quote "__eliscript_host_identity_token(value)") generated))
      (should
       (string-match-p
        (regexp-quote "(text).charCodeAt(index)") generated))
      (should
       (string-match-p (regexp-quote "String.fromCharCode(65)") generated))
      (should
       (string-match-p (regexp-quote "Number(\"1.5\")") generated))
      (should
       (string-match-p
        (regexp-quote "return BigInt(__eliscript_text)") generated))
      (should
       (string-match-p
        (regexp-quote
         "__eliscript_bytes.setFloat64(0, __eliscript_number === 0 ? 0 : __eliscript_number, true)")
        generated)))))

(ert-deftest eliscript-rejects-invalid-value-inspection-arities ()
  (dolist (source
           '("(value-type)"
             "(value-type 1 2)"
             "(host-identity-token)"
             "(host-identity-token (js-object) (js-object))"
             "(string-code-unit-at \"a\")"
             "(string-code-unit-at \"a\" 0 1)"
             "(string-from-code-unit)"
             "(string-from-code-unit 65 66)"
             "(string-to-number)"
             "(string-to-number \"1\" \"2\")"
             "(string-to-bigint)"
             "(string-to-bigint \"1\" \"2\")"
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

(ert-deftest eliscript-framework-names-are-ordinary-bindings ()
  (let* ((source
          "(defun jsx (value) (+ value 1))
(defun fragment (value) (+ value 2))
(defun defcomponent (value) (+ value 3))
(defun values () [(jsx 1) (fragment 1) (defcomponent 1)])
(export jsx fragment defcomponent values)")
         (program (eliscript-compile-ir-string source "ordinary-names.eli"))
         node-kinds)
    (eliscript-ir-walk
     program
     (lambda (node)
       (push (eliscript-ir-node-kind node) node-kinds)))
    (should (memq 'call node-kinds))
    (should-not (memq 'react-element node-kinds))
    (should-not (memq 'react-fragment node-kinds))
    (let ((output (eliscript-compile-string source "ordinary-names.eli")))
      (should (string-match-p "function jsx(value)" output))
      (should (string-match-p "function fragment(value)" output))
      (should (string-match-p "function defcomponent(value)" output))
      (should-not (string-match-p "react/jsx-runtime" output)))))

(ert-deftest eliscript-ui-library-interop-uses-ordinary-esm ()
  (let ((output
         (eliscript-compile-string
          "(import \"view-runtime\" create-view create-views ViewGroup)
(defun render (title items)
  (create-view ViewGroup
    (js-object :title title :children items)))
(export render)"
          "ui-library.eli")))
    (should (string-match-p
             (regexp-quote
              "import {create_view, create_views, ViewGroup} from \"view-runtime\";")
             output))
    (should (string-match-p
             (regexp-quote "create_view(ViewGroup, ({\"title\": title")
             output))
    (should-not (string-match-p "__eliscript_.*view-runtime" output))))

(ert-deftest eliscript-framework-neutral-core-reserves-only-internal-prefix ()
  (should-error (eliscript-compile-string "(defconst __eliscript_truthy 1)")
                :type 'eliscript-analyze-error)
  (should-error
   (eliscript-compile-string "(print __eliscript_private/value)")
   :type 'eliscript-analyze-error))

(ert-deftest eliscript-macros-read-only-declared-context-files ()
  (let ((capabilities (make-hash-table :test #'equal))
        (files (make-hash-table :test #'equal))
        (source
         "(defmacro configured-value () (macro-read-file \"build-value.txt\"))
(defconst value (configured-value))
(export value)"))
    (puthash "read-file" t capabilities)
    (puthash "build-value.txt" "forty-two" files)
    (let ((output
           (eliscript-emit-ir-module
            (eliscript-compile-ir-string
             source "macro-context.eli"
             (list :capabilities capabilities :files files)))))
      (should (string-match-p
               (regexp-quote "const value = \"forty-two\";") output)))
    (let ((disabled
           (should-error
            (eliscript-compile-ir-string source "macro-context.eli")
            :type 'eliscript-expand-error)))
      (should (string-match-p
               "macro capability is not enabled: read-file"
               (error-message-string disabled))))
    (clrhash files)
    (let ((undeclared
           (should-error
            (eliscript-compile-ir-string
             source "macro-context.eli"
             (list :capabilities capabilities :files files))
            :type 'eliscript-expand-error)))
      (should (string-match-p
               "macro file dependency is not declared: build-value.txt"
               (error-message-string undeclared))))))

(provide 'eliscript-tests)

;;; eliscript-tests.el ends here
