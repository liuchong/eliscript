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

(defun eliscript-project-tests--digest (filename)
  "Return the SHA-256 digest of FILENAME's exact bytes."
  (with-temp-buffer
    (set-buffer-multibyte nil)
    (insert-file-contents-literally filename)
    (secure-hash 'sha256 (current-buffer))))

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

(ert-deftest eliscript-project-emits-deterministic-graph-manifest ()
  (eliscript-project-tests--with-directory root
    (let* ((entry (expand-file-name "src/main.eli" root))
           (dependency (expand-file-name "src/lib/value.eli" root))
           (out-dir (expand-file-name "build" root)))
      (eliscript-project-tests--write
       entry
       "(import \"./lib/value.eli\" answer)\n(print answer)\n")
      (eliscript-project-tests--write
       dependency
       "(defconst answer 42)\n(export answer)\n")
      (let* ((first (eliscript-project-build entry out-dir root))
             (manifest-path
              (eliscript-project-build-result-manifest first))
             (first-text (eliscript-project-tests--read manifest-path))
             (manifest
              (json-parse-string
               first-text :object-type 'alist :array-type 'list))
             (modules (alist-get 'modules manifest))
             (main (cadr modules))
             (second (eliscript-project-build entry out-dir root)))
        (should (equal (alist-get 'format manifest) "eliscript-project"))
        (should (= (alist-get 'version manifest) 1))
        (should (equal (alist-get 'entry manifest) "src/main.mjs"))
        (should (equal (mapcar (lambda (module) (alist-get 'source module))
                               modules)
                       '("src/lib/value.eli" "src/main.eli")))
        (should (equal (alist-get 'output main) "src/main.mjs"))
        (should (equal (alist-get 'sourceMap main) "src/main.mjs.map"))
        (should (equal
                 (alist-get 'outputDigest main)
                 (eliscript-project-tests--digest
                  (expand-file-name "src/main.mjs" out-dir))))
        (should (equal
                 (alist-get 'sourceMapDigest main)
                 (eliscript-project-tests--digest
                  (expand-file-name "src/main.mjs.map" out-dir))))
        (should (equal (alist-get 'digest manifest)
                       (eliscript-project-build-result-digest first)))
        (should (equal (eliscript-project-build-result-digest first)
                       (eliscript-project-build-result-digest second)))
        (should (equal first-text
                       (eliscript-project-tests--read
                        (eliscript-project-build-result-manifest second))))))))

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

(ert-deftest eliscript-project-builds-pruned-portable-module-graph ()
  (eliscript-project-tests--with-directory root
    (let* ((entry (expand-file-name "main.eli" root))
           (dependency (expand-file-name "lib/math.eli" root))
           (out-dir (expand-file-name "build" root)))
      (eliscript-project-tests--write
       entry
       (concat
        "(import-portable \"./lib/math.eli\" increment unused-helper)\n"
        "(defportable twice (value) (increment (increment value)))\n"
        "(defportable unused-main () 99)\n"))
      (eliscript-project-tests--write
       dependency
       (concat
        "(defportable increment (value) (1+ value))\n"
        "(defportable unused-helper () 42)\n"))
      (let* ((result
              (eliscript-project-build-portable
               entry '(twice) out-dir root))
             (main-output (expand-file-name "main.mjs" out-dir))
             (dependency-output
              (expand-file-name "lib/math.mjs" out-dir))
             (main-text (eliscript-project-tests--read main-output))
             (dependency-text
              (eliscript-project-tests--read dependency-output)))
        (should (= (length
                    (eliscript-project-build-result-modules result))
                   2))
        (should (string-match-p
                 (regexp-quote "from \"./lib/math.mjs\"") main-text))
        (should-not (string-match-p "unused_helper" main-text))
        (should (string-match-p "function twice(value)" main-text))
        (should-not (string-match-p "unused_main" main-text))
        (should (string-match-p
                 "function increment(value)" dependency-text))
        (should-not (string-match-p "unused_helper" dependency-text))))))

(ert-deftest eliscript-project-allows-portable-import-cycles ()
  (eliscript-project-tests--with-directory root
    (let ((a (expand-file-name "a.eli" root))
          (b (expand-file-name "b.eli" root))
          (out-dir (expand-file-name "build" root)))
      (eliscript-project-tests--write
       a
       "(import-portable \"./b.eli\" from-b)\n(defportable from-a (value) (if value (from-b false) 1))\n")
      (eliscript-project-tests--write
       b
       "(import-portable \"./a.eli\" from-a)\n(defportable from-b (value) (if value (from-a false) 2))\n")
      (let ((result
             (eliscript-project-build-portable
              a '(from-a) out-dir root)))
        (should (= (length
                    (eliscript-project-build-result-modules result))
                   2))
        (should (file-exists-p (expand-file-name "a.mjs" out-dir)))
        (should (file-exists-p (expand-file-name "b.mjs" out-dir)))))))

(ert-deftest eliscript-project-portable-build-rejects-invalid-target ()
  (eliscript-project-tests--with-directory root
    (let ((entry (expand-file-name "main.eli" root))
          (dependency (expand-file-name "helper.eli" root)))
      (eliscript-project-tests--write
       entry
       "(import-portable \"./helper.eli\" helper)\n(defportable work () (helper))\n")
      (eliscript-project-tests--write dependency "(defun helper () 1)\n")
      (should-error
       (eliscript-project-build-portable
        entry '(work) (expand-file-name "build" root) root)
       :type 'eliscript-analyze-error))))

(ert-deftest eliscript-project-portable-build-requires-local-source-imports ()
  (eliscript-project-tests--with-directory root
    (let ((entry (expand-file-name "main.eli" root)))
      (eliscript-project-tests--write
       entry
       "(import-portable \"portable-package\" helper)\n(defportable work () (helper))\n")
      (let ((error-data
             (should-error
              (eliscript-project-build-portable
               entry '(work) (expand-file-name "build" root) root)
              :type 'eliscript-project-error)))
        (should (string-match-p
                 "portable import must be a relative .eli module"
                 (error-message-string error-data)))))))

(ert-deftest eliscript-project-selects-portable-standard-library-graph ()
  (eliscript-project-tests--with-directory output
    (let* ((root (expand-file-name "stdlib" default-directory))
           (entry (expand-file-name "data.eli" root))
           (result
            (eliscript-project-build-portable
             entry '(group-by) output root))
           (data-text
            (eliscript-project-tests--read
             (expand-file-name "data.mjs" output)))
           (object-text
            (eliscript-project-tests--read
             (expand-file-name "object.mjs" output))))
      (should (= (length
                  (eliscript-project-build-result-modules result))
                 2))
      (should (string-match-p "function group_by" data-text))
      (should-not (string-match-p "function index_by" data-text))
      (should-not (string-match-p "function count_by" data-text))
      (should (string-match-p "function assoc" object-text))
      (should (string-match-p "function has_QMARK_" object-text))
      (should-not (string-match-p "function keys" object-text)))))

(ert-deftest eliscript-project-builds-portable-indexing-application-graph ()
  (eliscript-project-tests--with-directory output
    (let* ((root default-directory)
           (entry
            (expand-file-name "examples/emacs-index/index.eli" root))
           (result
            (eliscript-project-build-portable
             entry '(score-document) output root))
           (entry-output
            (file-truename
             (expand-file-name "examples/emacs-index/index.mjs" output)))
           (data-output
            (file-truename (expand-file-name "stdlib/data.mjs" output)))
           (object-output
            (file-truename (expand-file-name "stdlib/object.mjs" output)))
           (entry-text (eliscript-project-tests--read entry-output))
           (data-text (eliscript-project-tests--read data-output))
           (object-text (eliscript-project-tests--read object-output)))
      (should (= (length
                  (eliscript-project-build-result-modules result))
                 3))
      (should (equal
               (eliscript-project-build-result-entry-output result)
               entry-output))
      (dolist (module (list entry-output data-output object-output))
        (should (file-exists-p module))
        (should (file-exists-p (concat module ".map"))))
      (should (string-match-p "function score_document" entry-text))
      (should (string-match-p "function count_by" data-text))
      (should-not (string-match-p "function index_by" data-text))
      (should-not (string-match-p "function group_by" data-text))
      (should (string-match-p "function assoc" object-text))
      (should (string-match-p "function has_QMARK_" object-text))
      (should-not (string-match-p "function keys" object-text)))))

(provide 'eliscript-project-tests)

;;; eliscript-project-tests.el ends here
