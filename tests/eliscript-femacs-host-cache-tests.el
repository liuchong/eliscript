;;; eliscript-femacs-host-cache-tests.el --- ERT tests for FEmacs host cache -*- lexical-binding: t; -*-

;;; Commentary:
;; Verifies cache rebuild on empty directory, hit reuse, target/commit/sha256
;; mismatch rejection, tampering detection, and optional real FEmacs host check.

;;; Code:

(require 'ert)
(require 'json)
(require 'cl-lib)

(eval-and-compile
  (let* ((here (file-name-directory (or load-file-name buffer-file-name
                                        default-directory)))
         (tools-dir (expand-file-name "../tools" here)))
    (add-to-list 'load-path tools-dir)))

(require 'femacs-host-cache)

(defun eliscript-femacs-host-cache-tests--write-text (path text &optional executable)
  "Write TEXT to PATH, creating parents and marking EXECUTABLE if non-nil."
  (make-directory (file-name-directory path) t)
  (with-temp-file path
    (set-buffer-multibyte nil)
    (insert (encode-coding-string text 'utf-8)))
  (when executable
    (set-file-modes path #o755)))

(defun eliscript-femacs-host-cache-tests--make-synthetic-pkg (pkg target cfg commit)
  "Populate a valid synthetic host package at PKG and return its `package_sha256'."
  (eliscript-femacs-host-cache-tests--write-text
   (expand-file-name "bin/femacs-lisp" pkg) "#!/bin/sh\necho ok\n" t)
  (eliscript-femacs-host-cache-tests--write-text
   (expand-file-name "bin/femacs-lisp.pdmp" pkg) "pdmp\n")
  (eliscript-femacs-host-cache-tests--write-text
   (expand-file-name "bin/http-host" pkg) "#!/bin/sh\necho http\n" t)
  (eliscript-femacs-host-cache-tests--write-text
   (expand-file-name "lisp/subr.el" pkg) ";; subr\n")
  (eliscript-femacs-host-cache-tests--write-text
   (expand-file-name "etc/NEWS" pkg) "news\n")
  (let ((manifest (make-hash-table :test 'equal))
        (binaries (make-hash-table :test 'equal))
        (trees (make-hash-table :test 'equal)))
    (dolist (spec '(("femacs-lisp" "bin/femacs-lisp")
                    ("femacs-lisp.pdmp" "bin/femacs-lisp.pdmp")
                    ("http-host" "bin/http-host")))
      (let ((fpath (expand-file-name (cadr spec) pkg))
            (entry (make-hash-table :test 'equal)))
        (puthash "relative_path" (cadr spec) entry)
        (puthash "bytes" (file-attribute-size (file-attributes fpath)) entry)
        (puthash "sha256" (eliscript-femacs-host--sha256-file fpath) entry)
        (puthash (car spec) entry binaries)))
    (puthash "lisp" (eliscript-femacs-host--hash-resource-tree
                     (expand-file-name "lisp" pkg))
             trees)
    (puthash "etc" (eliscript-femacs-host--hash-resource-tree
                    (expand-file-name "etc" pkg))
             trees)
    (puthash "binaries" binaries manifest)
    (puthash "build_config" cfg manifest)
    (puthash "resource_trees" trees manifest)
    (puthash "source_commit" commit manifest)
    (puthash "target" target manifest)
    (puthash "package_sha256"
             (eliscript-femacs-host--compute-package-sha256 manifest)
             manifest)
    (puthash "product" "femacs-lisp" manifest)
    (puthash "schema" 1 manifest)
    (eliscript-femacs-host-cache-tests--write-text
     (expand-file-name "manifest.json" pkg)
     (concat (eliscript-femacs-host--canonical-json manifest) "\n"))
    (gethash "package_sha256" manifest)))

(ert-deftest eliscript-femacs-host-cache-synthetic-lifecycle ()
  "Verify cache rebuild, hit reuse, and identity/tamper rejection."
  (let* ((tmp (make-temp-file "eliscript-host-cache-test-" t))
         (pkg (expand-file-name "pkg" tmp))
         (cache-dir (expand-file-name "cache" tmp))
         (commit (make-string 40 ?b))
         (target (eliscript-femacs-host-current-target))
         (cfg "macos-terminal/darwin-arm64/release"))
    (unwind-protect
        (let* ((pkg-sha (eliscript-femacs-host-cache-tests--make-synthetic-pkg
                         pkg target cfg commit))
               (first (eliscript-femacs-host-ensure-cache pkg cache-dir commit target cfg pkg-sha))
               (second (eliscript-femacs-host-ensure-cache pkg cache-dir commit target cfg pkg-sha))
               (resolved (eliscript-femacs-host-resolve-cache cache-dir commit target cfg pkg-sha)))
          (should (eq (plist-get first :status) 'rebuilt))
          (should (eq (plist-get second :status) 'hit))
          (should (equal (plist-get first :cache-entry) (plist-get second :cache-entry)))
          (should (equal (plist-get resolved :lisp-bin) (plist-get first :lisp-bin)))
          ;; Wrong platform/target rejected
          (should-error
           (eliscript-femacs-host-ensure-cache
            pkg cache-dir commit "x86_64-unknown-linux-gnu" cfg pkg-sha)
           :type 'eliscript-femacs-host-cache-error)
          ;; Wrong commit rejected
          (should-error
           (eliscript-femacs-host-ensure-cache
            pkg cache-dir (make-string 40 ?c) target cfg pkg-sha)
           :type 'eliscript-femacs-host-cache-error)
          ;; Tampered cached Lisp file rejected on resolve/hit
          (eliscript-femacs-host-cache-tests--write-text
           (expand-file-name "lisp/subr.el" (plist-get first :cache-entry))
           ";; tampered\n")
          (should-error
           (eliscript-femacs-host-resolve-cache cache-dir commit target cfg pkg-sha)
           :type 'eliscript-femacs-host-cache-error)
          (should-error
           (eliscript-femacs-host-ensure-cache pkg cache-dir commit target cfg pkg-sha)
           :type 'eliscript-femacs-host-cache-error))
      (delete-directory tmp t))))

(ert-deftest eliscript-femacs-host-cache-rejects-hidden-bin-entry ()
  "Reject hidden dotfiles under `bin/' before any copy into cache."
  (let* ((tmp (make-temp-file "eliscript-host-cache-hidden-" t))
         (pkg (expand-file-name "pkg" tmp))
         (cache-dir (expand-file-name "cache" tmp))
         (commit (make-string 40 ?b))
         (target (eliscript-femacs-host-current-target))
         (cfg "macos-terminal/darwin-arm64/release"))
    (unwind-protect
        (let ((pkg-sha (eliscript-femacs-host-cache-tests--make-synthetic-pkg
                        pkg target cfg commit)))
          (eliscript-femacs-host-cache-tests--write-text
           (expand-file-name "bin/.hidden" pkg) "hidden\n")
          (let ((verify-err
                 (condition-case err
                     (progn
                       (eliscript-femacs-host-verify-package
                        pkg commit target cfg pkg-sha)
                       nil)
                   (eliscript-femacs-host-cache-error err)))
                (ensure-err
                 (condition-case err
                     (progn
                       (eliscript-femacs-host-ensure-cache
                        pkg cache-dir commit target cfg pkg-sha)
                       nil)
                   (eliscript-femacs-host-cache-error err))))
            (should verify-err)
            (should (equal (nth 1 verify-err) "unexpected-bin-entry"))
            (should ensure-err)
            (should (equal (nth 1 ensure-err) "unexpected-bin-entry"))))
      (delete-directory tmp t))))

(ert-deftest eliscript-femacs-host-cache-optional-live-package ()
  "Verify real FEmacs host package when `ELISCRIPT_FEMACS_LISP_PKG' is set."
  (let ((live-pkg (getenv "ELISCRIPT_FEMACS_LISP_PKG")))
    (when (and live-pkg (file-directory-p live-pkg))
      (let* ((tmp (make-temp-file "eliscript-live-host-cache-" t))
             (cache-dir (expand-file-name "cache" tmp)))
        (unwind-protect
            (let* ((rebuilt (eliscript-femacs-host-ensure-cache live-pkg cache-dir))
                   (hit (eliscript-femacs-host-ensure-cache live-pkg cache-dir)))
              (should (eq (plist-get rebuilt :status) 'rebuilt))
              (should (eq (plist-get hit :status) 'hit))
              (should (file-executable-p (plist-get hit :lisp-bin))))
          (delete-directory tmp t))))))

(provide 'eliscript-femacs-host-cache-tests)
;;; eliscript-femacs-host-cache-tests.el ends here
