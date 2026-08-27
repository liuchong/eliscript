;;; bootstrap-tests.el --- Seed/bootstrap conformance tests -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'json)
(require 'eliscript-symbol)

(defconst eliscript-bootstrap-tests--symbol-fixture
  (expand-file-name "tests/fixtures/bootstrap-symbols.json" default-directory)
  "Shared symbol conformance fixture.")

(defun eliscript-bootstrap-tests--field (name object)
  "Read field NAME from parsed JSON OBJECT."
  (alist-get name object))

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
         (with-temp-buffer
           (insert-file-contents eliscript-bootstrap-tests--symbol-fixture)
           (json-parse-buffer :object-type 'alist :array-type 'list))))
    (dolist (operation '(segment binding reference))
      (dolist (case (eliscript-bootstrap-tests--field operation fixture))
        (let* ((input (eliscript-bootstrap-tests--field 'input case))
               (actual
                (eliscript-bootstrap-tests--seed-symbol-result
                 operation input)))
          (should (equal case (append `((input . ,input)) actual))))))))

(provide 'bootstrap-tests)

;;; bootstrap-tests.el ends here
