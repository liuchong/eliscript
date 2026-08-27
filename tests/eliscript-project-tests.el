;;; eliscript-project-tests.el --- Tests for project builds -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'json)
(require 'eliscript-project)

(defmacro eliscript-project-tests--with-directory (binding &rest body)
  "Bind BINDING to a temporary project directory while evaluating BODY."
  (declare (indent 1) (debug (symbolp body)))
  `(let ((,binding (make-temp-file "eliscript-project-test-" t)))
     (unwind-protect
         (progn ,@body)
       (delete-directory ,binding t))))

(defun eliscript-project-tests--write (filename contents)
  "Write CONTENTS to FILENAME, creating its parent directory."
  (make-directory (file-name-directory filename) t)
  (with-temp-file filename
    (insert contents)))

(defun eliscript-project-tests--read (filename)
  "Read FILENAME into a string."
  (with-temp-buffer
    (insert-file-contents filename)
    (buffer-string)))

(ert-deftest eliscript-project-builds-expanded-import-graph ()
  (eliscript-project-tests--with-directory root
    (let* ((entry (expand-file-name "src/main.eli" root))
           (dependency (expand-file-name "src/lib/value.eli" root))
           (out-dir (expand-file-name "build" root)))
      (eliscript-project-tests--write
       entry
       (concat
        "(defmacro use-value () '(import \"./lib/value.eli\" answer))\n"
        "(import \"runtime-package\" runtime-value)\n"
        "(import \"./theme.css\")\n"
        "(use-value)\n"
        "(print answer)\n"))
      (eliscript-project-tests--write
       dependency
       "(defconst answer 42)\n(export answer)\n")
      (let* ((result (eliscript-project-build entry out-dir root))
             (main-output
              (file-truename (expand-file-name "src/main.mjs" out-dir)))
             (dependency-output
              (file-truename
               (expand-file-name "src/lib/value.mjs" out-dir)))
             (main-map
              (json-parse-string
               (eliscript-project-tests--read (concat main-output ".map"))
               :object-type 'alist
               :array-type 'list)))
        (should (= (length
                    (eliscript-project-build-result-modules result))
                   2))
        (should (equal
                 (eliscript-project-build-result-entry-output result)
                 main-output))
        (should (file-exists-p dependency-output))
        (should (string-match-p
                 (regexp-quote "from \"./lib/value.mjs\"")
                 (eliscript-project-tests--read main-output)))
        (should-not (string-match-p
                     "\\.eli"
                     (eliscript-project-tests--read main-output)))
        (should (string-match-p
                 (regexp-quote "from \"runtime-package\"")
                 (eliscript-project-tests--read main-output)))
        (should (string-match-p
                 (regexp-quote "import \"./theme.css\";")
                 (eliscript-project-tests--read main-output)))
        (should (equal (alist-get 'file main-map) "main.mjs"))
        (should (equal (alist-get 'sources main-map)
                       '("../../src/main.eli")))))))

(ert-deftest eliscript-project-allows-cyclic-imports ()
  (eliscript-project-tests--with-directory root
    (let ((a (expand-file-name "a.eli" root))
          (b (expand-file-name "b.eli" root))
          (out-dir (expand-file-name "build" root)))
      (eliscript-project-tests--write
       a "(import \"./b.eli\" b)\n(defconst a 1)\n(export a)\n")
      (eliscript-project-tests--write
       b "(import \"./a.eli\" a)\n(defconst b 2)\n(export b)\n")
      (let ((result (eliscript-project-build a out-dir root)))
        (should (= (length
                    (eliscript-project-build-result-modules result))
                   2))
        (should (file-exists-p (expand-file-name "a.mjs" out-dir)))
        (should (file-exists-p (expand-file-name "b.mjs" out-dir)))))))

(ert-deftest eliscript-project-rejects-missing-and-escaping-imports ()
  (eliscript-project-tests--with-directory parent
    (let* ((root (expand-file-name "project" parent))
           (entry (expand-file-name "main.eli" root))
           (outside (expand-file-name "outside.eli" parent))
           (out-dir (expand-file-name "build" root)))
      (eliscript-project-tests--write outside "(defconst value 1)\n(export value)\n")
      (eliscript-project-tests--write
       entry "(import \"./missing.eli\" value)\n(print value)\n")
      (should-error (eliscript-project-build entry out-dir root)
                    :type 'eliscript-project-error)
      (eliscript-project-tests--write
       entry "(import \"../outside.eli\" value)\n(print value)\n")
      (let ((error-data
             (should-error
              (eliscript-project-build entry out-dir root)
              :type 'eliscript-project-error)))
        (should (string-match-p
                 "escapes project root"
                 (error-message-string error-data)))))))

(ert-deftest eliscript-project-rejects-bare-source-imports ()
  (eliscript-project-tests--with-directory root
    (let ((entry (expand-file-name "main.eli" root)))
      (eliscript-project-tests--write
       entry "(import \"package.eli\" value)\n(print value)\n")
      (should-error
       (eliscript-project-build entry (expand-file-name "build" root) root)
       :type 'eliscript-project-error))))

(ert-deftest eliscript-project-rejects-symlink-root-escape ()
  (eliscript-project-tests--with-directory parent
    (let* ((root (expand-file-name "project" parent))
           (entry (expand-file-name "main.eli" root))
           (outside (expand-file-name "outside.eli" parent))
           (linked (expand-file-name "linked.eli" root)))
      (eliscript-project-tests--write outside
                                      "(defconst value 1)\n(export value)\n")
      (eliscript-project-tests--write
       entry "(import \"./linked.eli\" value)\n(print value)\n")
      (make-symbolic-link outside linked)
      (should-error
       (eliscript-project-build entry (expand-file-name "build" root) root)
       :type 'eliscript-project-error))))

(ert-deftest eliscript-project-rejects-file-output-path ()
  (eliscript-project-tests--with-directory root
    (let ((entry (expand-file-name "main.eli" root))
          (output (expand-file-name "output" root)))
      (eliscript-project-tests--write entry "(print 1)\n")
      (eliscript-project-tests--write output "occupied\n")
      (let ((error-data
             (should-error
              (eliscript-project-build entry output root)
              :type 'eliscript-project-error)))
        (should (string-match-p
                 "output path is not a directory"
                 (error-message-string error-data)))))))

(provide 'eliscript-project-tests)

;;; eliscript-project-tests.el ends here
