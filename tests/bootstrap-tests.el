;;; bootstrap-tests.el --- Seed/bootstrap conformance tests -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'json)
(require 'eliscript-analyzer)
(require 'eliscript-expander)
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

(provide 'bootstrap-tests)

;;; bootstrap-tests.el ends here
