;;; bootstrap-tests.el --- Seed/bootstrap conformance tests -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'json)
(require 'eliscript)
(require 'eliscript-analyzer)
(require 'eliscript-expander)
(require 'eliscript-ir)
(require 'eliscript-ir-emitter)
(require 'eliscript-lower)
(require 'eliscript-reader)
(require 'eliscript-symbol)

(defconst eliscript-bootstrap-tests--symbol-fixture
  (expand-file-name "tests/fixtures/bootstrap-symbols.json" default-directory)
  "Shared symbol conformance fixture.")

(defconst eliscript-bootstrap-tests--reader-fixture
  (expand-file-name "tests/fixtures/bootstrap-reader.json" default-directory)
  "Shared reader conformance fixture.")

(defconst eliscript-bootstrap-tests--analyzer-fixture
  (expand-file-name "tests/fixtures/bootstrap-analyzer.json" default-directory)
  "Shared analyzer conformance fixture.")

(defconst eliscript-bootstrap-tests--expander-fixture
  (expand-file-name "tests/fixtures/bootstrap-expander.json" default-directory)
  "Shared macro expander conformance fixture.")

(defconst eliscript-bootstrap-tests--ir-fixture
  (expand-file-name "tests/fixtures/bootstrap-ir.json" default-directory)
  "Shared IR lowering conformance fixture.")

(defvar eliscript-bootstrap-tests--position-index-cache
  (make-hash-table :test #'equal)
  "Character position indexes keyed by fixture source text.")

(defun eliscript-bootstrap-tests--field (name object)
  "Read field NAME from parsed JSON OBJECT."
  (alist-get name object))

(defun eliscript-bootstrap-tests--read-json (filename)
  "Read JSON FILENAME as alists, lists, and Eliscript literal values."
  (with-temp-buffer
    (let ((coding-system-for-read 'utf-8-unix))
      (insert-file-contents filename))
    (json-parse-buffer
     :object-type 'alist
     :array-type 'list
     :null-object nil
     :false-object :false)))

(defun eliscript-bootstrap-tests--logical-position (source offset)
  "Return one-based character line and column at SOURCE OFFSET."
  (let ((positions
         (or (gethash source eliscript-bootstrap-tests--position-index-cache)
             (let ((result (make-vector (1+ (length source)) nil))
                   (line 1)
                   (column 1)
                   (index 0))
               (aset result 0 (cons line column))
               (while (< index (length source))
                 (if (= (aref source index) ?\n)
                     (setq line (1+ line)
                           column 1)
                   (setq column (1+ column)))
                 (setq index (1+ index))
                 (aset result index (cons line column)))
               (puthash source result
                        eliscript-bootstrap-tests--position-index-cache)
               result))))
    (aref positions offset)))

(defun eliscript-bootstrap-tests--normalize-span (span source)
  "Convert seed source SPAN in SOURCE to the portable JSON shape."
  (let ((start
         (eliscript-bootstrap-tests--logical-position
          source (eliscript-source-span-start span)))
        (end
         (eliscript-bootstrap-tests--logical-position
          source (eliscript-source-span-end span))))
    `((filename . ,(eliscript-source-span-filename span))
      (start . ,(eliscript-source-span-start span))
      (end . ,(eliscript-source-span-end span))
      (line . ,(car start))
      (column . ,(cdr start))
      (endLine . ,(car end))
      (endColumn . ,(cdr end)))))

(defun eliscript-bootstrap-tests--normalize-form (form source)
  "Convert located seed FORM from SOURCE to the portable syntax-node shape."
  (let ((value (eliscript-form-value form))
        (span (eliscript-bootstrap-tests--normalize-span
               (eliscript-form-span form) source)))
    (cond
     ((null value) `((kind . "literal") (value . nil) (span . ,span)))
     ((eq value t) `((kind . "literal") (value . t) (span . ,span)))
     ((eq value 'false)
      `((kind . "literal") (value . :false) (span . ,span)))
     ((eq value 'undefined) `((kind . "undefined") (span . ,span)))
     ((or (numberp value) (stringp value))
      `((kind . "literal") (value . ,value) (span . ,span)))
     ((keywordp value)
      `((kind . "keyword")
        (name . ,(substring (symbol-name value) 1))
        (span . ,span)))
     ((symbolp value)
      `((kind . "symbol") (name . ,(symbol-name value)) (span . ,span)))
     ((vectorp value)
      `((kind . "vector")
        (items . ,(vconcat
                   (mapcar
                    (lambda (item)
                      (eliscript-bootstrap-tests--normalize-form item source))
                    (append value nil))))
        (span . ,span)))
     ((proper-list-p value)
      `((kind . "list")
        (items . ,(vconcat
                   (mapcar
                    (lambda (item)
                      (eliscript-bootstrap-tests--normalize-form item source))
                    value)))
        (span . ,span)))
     (t (error "unsupported seed reader value: %S" value)))))

(defun eliscript-bootstrap-tests--case-source (case)
  "Return inline or file-backed source for fixture CASE."
  (or (eliscript-bootstrap-tests--field 'source case)
      (let ((filename (eliscript-bootstrap-tests--field 'file case)))
        (unless filename
          (error "fixture case has neither source nor file: %S" case))
        (with-temp-buffer
          (let ((coding-system-for-read 'utf-8-unix))
            (insert-file-contents (expand-file-name filename default-directory)))
          (buffer-string)))))

(defun eliscript-bootstrap-tests--seed-reader-result (case)
  "Return normalized seed reader output for fixture CASE."
  (let ((name (eliscript-bootstrap-tests--field 'name case))
        (filename (eliscript-bootstrap-tests--field 'filename case))
        (source (eliscript-bootstrap-tests--case-source case)))
    (condition-case error-data
        (let ((forms (eliscript-read-located-string source filename)))
          `((name . ,name)
            (status . "ok")
            (forms . ,(vconcat
                       (mapcar
                        (lambda (form)
                          (eliscript-bootstrap-tests--normalize-form
                           form source))
                        forms)))))
      (eliscript-read-error
       `((name . ,name) (status . "error")
         (message . ,(cadr error-data)))))))

(defun eliscript-bootstrap-tests-reader-results (&optional fixture-file)
  "Return normalized seed results for reader FIXTURE-FILE."
  (let* ((fixture
          (eliscript-bootstrap-tests--read-json
           (or fixture-file eliscript-bootstrap-tests--reader-fixture)))
         (cases
          (append (eliscript-bootstrap-tests--field 'valid fixture)
                  (eliscript-bootstrap-tests--field 'invalid fixture))))
    (vconcat (mapcar #'eliscript-bootstrap-tests--seed-reader-result cases))))

(defun eliscript-bootstrap-tests--seed-analyzer-result (case)
  "Return normalized seed analyzer output for fixture CASE."
  (let ((name (eliscript-bootstrap-tests--field 'name case))
        (filename (eliscript-bootstrap-tests--field 'filename case))
        (source (eliscript-bootstrap-tests--case-source case)))
    (condition-case error-data
        (progn
          (eliscript-analyze-module
           (eliscript-read-located-string source filename)
           filename)
          `((name . ,name) (status . "ok")))
      ((eliscript-read-error eliscript-analyze-error)
       `((name . ,name) (status . "error")
         (message . ,(cadr error-data)))))))

(defun eliscript-bootstrap-tests-analyzer-results (&optional fixture-file)
  "Return normalized seed results for analyzer FIXTURE-FILE."
  (let* ((fixture
          (eliscript-bootstrap-tests--read-json
           (or fixture-file eliscript-bootstrap-tests--analyzer-fixture)))
         (cases
          (append (eliscript-bootstrap-tests--field 'valid fixture)
                  (eliscript-bootstrap-tests--field 'invalid fixture))))
    (vconcat (mapcar #'eliscript-bootstrap-tests--seed-analyzer-result cases))))

(defun eliscript-bootstrap-tests--seed-expander-result (case)
  "Return normalized seed expander output for fixture CASE."
  (let ((name (eliscript-bootstrap-tests--field 'name case))
        (filename (eliscript-bootstrap-tests--field 'filename case))
        (source (eliscript-bootstrap-tests--case-source case)))
    (condition-case error-data
        (let ((forms
               (eliscript-expand-module
                (eliscript-read-located-string source filename)
                filename)))
          `((name . ,name)
            (status . "ok")
            (forms . ,(vconcat
                       (mapcar
                        (lambda (form)
                          (eliscript-bootstrap-tests--normalize-form
                           form source))
                        forms)))))
      ((eliscript-read-error eliscript-expand-error)
       `((name . ,name) (status . "error")
         (message . ,(cadr error-data)))))))

(defun eliscript-bootstrap-tests-expander-results (&optional fixture-file)
  "Return normalized seed results for expander FIXTURE-FILE."
  (let* ((fixture
          (eliscript-bootstrap-tests--read-json
           (or fixture-file eliscript-bootstrap-tests--expander-fixture)))
         (cases
          (append (eliscript-bootstrap-tests--field 'valid fixture)
                  (eliscript-bootstrap-tests--field 'invalid fixture))))
    (vconcat (mapcar #'eliscript-bootstrap-tests--seed-expander-result cases))))

(defun eliscript-bootstrap-tests--normalize-datum (value)
  "Convert quoted seed VALUE to its JSON-safe portable representation."
  (cond
   ((null value) nil)
   ((eq value t) t)
   ((eq value 'false) '((kind . "symbol") (name . "false")))
   ((eq value 'undefined) '((kind . "undefined")))
   ((or (numberp value) (stringp value)) value)
   ((keywordp value)
    `((kind . "keyword") (name . ,(substring (symbol-name value) 1))))
   ((symbolp value)
    `((kind . "symbol") (name . ,(symbol-name value))))
   ((vectorp value)
    `((kind . "vector")
      (items . ,(vconcat
                 (mapcar #'eliscript-bootstrap-tests--normalize-datum
                         (append value nil))))))
   ((proper-list-p value)
    `((kind . "list")
      (items . ,(vconcat
                 (mapcar #'eliscript-bootstrap-tests--normalize-datum
                         value)))))
   (t (error "unsupported quoted IR datum: %S" value))))

(defun eliscript-bootstrap-tests--normalize-ir-properties (node)
  "Convert seed IR NODE properties to portable camel-case fields."
  (let ((kind (eliscript-ir-node-kind node)))
    (pcase kind
      ('function-declaration
       `((parameterCount . ,(eliscript-ir-property node :parameter-count))
         (sourceOperator . ,(symbol-name
                             (eliscript-ir-property node :source-operator)))
         (portable . ,(if (eliscript-ir-property node :portable) t :false))
         (async . ,(if (eliscript-ir-property node :async) t :false))))
      ('function-expression
       `((parameterCount . ,(eliscript-ir-property node :parameter-count))
         (async . ,(if (eliscript-ir-property node :async) t :false))))
      ('parameter-binding
       `((parameterKind . ,(symbol-name
                            (eliscript-ir-property node :parameter-kind)))))
      ('variable-declaration
       `((sourceOperator . ,(symbol-name
                             (eliscript-ir-property node :source-operator)))
         (mutable . ,(if (eliscript-ir-property node :mutable) t :false))))
      ('import-declaration
       (and (eliscript-ir-property node :portable)
            '((portable . t))))
      ('lexical-bindings
       `((sequential . ,(if (eliscript-ir-property node :sequential) t :false))
         (bindingCount . ,(eliscript-ir-property node :binding-count))))
      ('lexical-binding
       `((style . ,(symbol-name (eliscript-ir-property node :style)))))
      ((or 'react-element 'react-fragment)
       `((childCount . ,(eliscript-ir-property node :child-count))))
      ('object-property
       `((computed . ,(if (eliscript-ir-property node :computed) t :false))))
      (_ nil))))

(defun eliscript-bootstrap-tests--normalize-ir-value (node)
  "Convert seed IR NODE value to its portable JSON representation."
  (let ((kind (eliscript-ir-node-kind node))
        (value (eliscript-ir-node-value node)))
    (cond
     ((null value) nil)
     ((eq value t) t)
     ((eq kind 'quoted-literal)
      (eliscript-bootstrap-tests--normalize-datum value))
     ((and (eq kind 'literal) (eq value 'undefined)) nil)
     ((and (eq kind 'literal) (keywordp value))
      (substring (symbol-name value) 1))
     ((and (eq kind 'object-property)
           (not (eliscript-ir-property node :computed))
           (symbolp value))
      (if (keywordp value)
          (substring (symbol-name value) 1)
        (symbol-name value)))
     ((eq value 'false) :false)
     ((symbolp value) (symbol-name value))
     (t value))))

(defun eliscript-bootstrap-tests--normalize-ir-node (node source)
  "Convert seed IR NODE from SOURCE to the portable object shape."
  (let* ((kind (eliscript-ir-node-kind node))
         (properties (eliscript-bootstrap-tests--normalize-ir-properties node)))
    (when (eq kind 'literal)
      (let ((value (eliscript-ir-node-value node)))
        (cond
         ((eq value 'undefined)
          (setq properties '((literalKind . "undefined"))))
         ((keywordp value)
          (setq properties '((literalKind . "keyword")))))))
    (append
     `((kind . ,(symbol-name kind))
       (span . ,(eliscript-bootstrap-tests--normalize-span
                 (eliscript-ir-node-span node) source))
       (value . ,(eliscript-bootstrap-tests--normalize-ir-value node))
       (children . ,(vconcat
                     (mapcar
                      (lambda (child)
                        (eliscript-bootstrap-tests--normalize-ir-node
                         child source))
                      (eliscript-ir-node-children node)))))
     (and properties `((properties . ,properties))))))

(defun eliscript-bootstrap-tests--seed-ir-result (case)
  "Return normalized seed IR output for fixture CASE."
  (let ((name (eliscript-bootstrap-tests--field 'name case))
        (filename (eliscript-bootstrap-tests--field 'filename case))
        (source (eliscript-bootstrap-tests--case-source case)))
    (condition-case error-data
        (let* ((forms
                (eliscript-expand-module
                 (eliscript-read-located-string source filename)
                 filename))
               (_analysis (eliscript-analyze-module forms filename))
               (program (eliscript-lower-module forms filename)))
          `((name . ,name)
            (status . "ok")
            (program . ((filename . ,(eliscript-ir-program-filename program))
                        (body . ,(vconcat
                                  (mapcar
                                   (lambda (node)
                                     (eliscript-bootstrap-tests--normalize-ir-node
                                      node source))
                                   (eliscript-ir-program-body program))))))))
      ((eliscript-read-error eliscript-expand-error eliscript-analyze-error)
       `((name . ,name) (status . "error")
         (message . ,(cadr error-data)))))))

(defun eliscript-bootstrap-tests-ir-results (&optional fixture-file)
  "Return normalized seed results for IR FIXTURE-FILE."
  (let* ((fixture
          (eliscript-bootstrap-tests--read-json
           (or fixture-file eliscript-bootstrap-tests--ir-fixture)))
         (cases (eliscript-bootstrap-tests--field 'valid fixture)))
    (vconcat (mapcar #'eliscript-bootstrap-tests--seed-ir-result cases))))

(defun eliscript-bootstrap-tests--seed-emitter-result (case)
  "Return seed ESM and Source Map output for fixture CASE."
  (let ((name (eliscript-bootstrap-tests--field 'name case))
        (filename (eliscript-bootstrap-tests--field 'filename case))
        (source (eliscript-bootstrap-tests--case-source case)))
    (condition-case error-data
        (let ((emission
               (eliscript-compile-string-with-source-map
                source filename "fixture.mjs" filename)))
          `((name . ,name)
            (status . "ok")
            (javascript . ,(decode-coding-string
                            (substring-no-properties
                             (eliscript-emission-javascript emission))
                            'utf-8-unix))
            (sourceMap . ,(json-parse-string
                           (eliscript-emission-source-map emission)
                           :object-type 'alist
                           :array-type 'array
                           :null-object nil
                           :false-object :false))))
      ((eliscript-read-error eliscript-expand-error eliscript-analyze-error
        eliscript-compile-error)
       `((name . ,name) (status . "error")
         (message . ,(cadr error-data)))))))

(defun eliscript-bootstrap-tests-emitter-results (&optional fixture-file)
  "Return normalized seed emission results for FIXTURE-FILE."
  (let* ((fixture
          (eliscript-bootstrap-tests--read-json
           (or fixture-file eliscript-bootstrap-tests--ir-fixture)))
         (cases (eliscript-bootstrap-tests--field 'valid fixture)))
    (vconcat (mapcar #'eliscript-bootstrap-tests--seed-emitter-result cases))))

(defun eliscript-bootstrap-tests--seed-symbol-result (operation input)
  "Run seed symbol OPERATION for INPUT and return a result object."
  (condition-case error-data
      (let ((output
             (pcase operation
               ('segment (eliscript-symbol-munge-segment input))
               ('binding (eliscript-symbol-binding-name (intern input)))
               ('reference (eliscript-symbol-reference-name (intern input))))))
        `((output . ,output)))
    (eliscript-compile-error
     `((error . ,(cadr error-data))))))

(ert-deftest eliscript-seed-symbol-module-matches-bootstrap-contract ()
  (let ((fixture
         (eliscript-bootstrap-tests--read-json
          eliscript-bootstrap-tests--symbol-fixture)))
    (dolist (operation '(segment binding reference))
      (dolist (case (eliscript-bootstrap-tests--field operation fixture))
        (let* ((input (eliscript-bootstrap-tests--field 'input case))
               (actual
                (eliscript-bootstrap-tests--seed-symbol-result
                 operation input)))
          (should (equal case (append `((input . ,input)) actual))))))))

(ert-deftest eliscript-seed-reader-satisfies-bootstrap-cases ()
  (let* ((fixture
          (eliscript-bootstrap-tests--read-json
           eliscript-bootstrap-tests--reader-fixture))
         (valid (eliscript-bootstrap-tests--field 'valid fixture))
         (invalid (eliscript-bootstrap-tests--field 'invalid fixture)))
    (dolist (case valid)
      (let ((result (eliscript-bootstrap-tests--seed-reader-result case)))
        (should (equal (eliscript-bootstrap-tests--field 'status result) "ok"))))
    (dolist (case invalid)
      (let ((result (eliscript-bootstrap-tests--seed-reader-result case)))
        (should (equal (eliscript-bootstrap-tests--field 'status result)
                       "error"))
        (should (equal (eliscript-bootstrap-tests--field 'message result)
                       (eliscript-bootstrap-tests--field 'error case)))))))

(ert-deftest eliscript-seed-analyzer-satisfies-bootstrap-cases ()
  (let* ((fixture
          (eliscript-bootstrap-tests--read-json
           eliscript-bootstrap-tests--analyzer-fixture))
         (valid (eliscript-bootstrap-tests--field 'valid fixture))
         (invalid (eliscript-bootstrap-tests--field 'invalid fixture)))
    (dolist (case valid)
      (let ((result (eliscript-bootstrap-tests--seed-analyzer-result case)))
        (should (equal (eliscript-bootstrap-tests--field 'status result) "ok"))))
    (dolist (case invalid)
      (let ((result (eliscript-bootstrap-tests--seed-analyzer-result case)))
        (should (equal (eliscript-bootstrap-tests--field 'status result)
                       "error"))
        (should (equal (eliscript-bootstrap-tests--field 'message result)
                       (eliscript-bootstrap-tests--field 'error case)))))))

(ert-deftest eliscript-seed-expander-satisfies-bootstrap-cases ()
  (let* ((fixture
          (eliscript-bootstrap-tests--read-json
           eliscript-bootstrap-tests--expander-fixture))
         (valid (eliscript-bootstrap-tests--field 'valid fixture))
         (invalid (eliscript-bootstrap-tests--field 'invalid fixture)))
    (dolist (case valid)
      (let ((result (eliscript-bootstrap-tests--seed-expander-result case)))
        (should (equal (eliscript-bootstrap-tests--field 'status result) "ok"))))
    (dolist (case invalid)
      (let ((result (eliscript-bootstrap-tests--seed-expander-result case)))
        (should (equal (eliscript-bootstrap-tests--field 'status result)
                       "error"))
        (should (equal (eliscript-bootstrap-tests--field 'message result)
                       (eliscript-bootstrap-tests--field 'error case)))))))

(ert-deftest eliscript-seed-ir-lowering-satisfies-bootstrap-cases ()
  (let* ((fixture
          (eliscript-bootstrap-tests--read-json
           eliscript-bootstrap-tests--ir-fixture))
         (valid (eliscript-bootstrap-tests--field 'valid fixture)))
    (dolist (case valid)
      (let ((result (eliscript-bootstrap-tests--seed-ir-result case)))
        (should (equal (eliscript-bootstrap-tests--field 'status result)
                       "ok"))))))

(ert-deftest eliscript-seed-emitter-satisfies-bootstrap-cases ()
  (let* ((fixture
          (eliscript-bootstrap-tests--read-json
           eliscript-bootstrap-tests--ir-fixture))
         (valid (eliscript-bootstrap-tests--field 'valid fixture)))
    (dolist (case valid)
      (let ((result (eliscript-bootstrap-tests--seed-emitter-result case)))
        (should (equal (eliscript-bootstrap-tests--field 'status result)
                       "ok"))))))

(provide 'bootstrap-tests)

;;; bootstrap-tests.el ends here
