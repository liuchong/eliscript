;;; femacs-host-cache.el --- Verifiable standalone FEmacs Lisp host cache -*- lexical-binding: t; -*-

;;; Commentary:
;; Validates relocatable `femacs-lisp' host packages against their cryptographic
;; `manifest.json' identity and maintains a content-addressed cache keyed by
;; clean source commit, target triple, build config, and package SHA-256.
;; Rejects missing, tampered, symlinked, wrong-platform, or stale entries.

;;; Code:

(require 'cl-lib)
(require 'json)
(require 'subr-x)

(define-error 'eliscript-femacs-host-cache-error
  "FEmacs host cache verification error")

(defun eliscript-femacs-host--fail (reason message &rest args)
  "Signal a structured cache verification error with REASON and MESSAGE."
  (signal 'eliscript-femacs-host-cache-error
          (list reason (apply #'format message args))))

(defun eliscript-femacs-host-current-target ()
  "Return the normalized host target triple for `system-configuration'."
  (let ((cfg (or system-configuration "")))
    (cond
     ((string-match "\\`aarch64-apple-darwin" cfg) "aarch64-apple-darwin")
     ((string-match "\\`x86_64-apple-darwin" cfg) "x86_64-apple-darwin")
     ((string-match "\\`\\([^-]+\\)-[^-]+-linux" cfg)
      (format "%s-unknown-linux-gnu" (match-string 1 cfg)))
     (t cfg))))

(defun eliscript-femacs-host--sha256-file (path)
  "Return lowercase hex SHA-256 digest of regular file PATH."
  (with-temp-buffer
    (set-buffer-multibyte nil)
    (insert-file-contents-literally path)
    (secure-hash 'sha256 (current-buffer))))

(defun eliscript-femacs-host--sha256-string (text)
  "Return lowercase hex SHA-256 digest of UTF-8 TEXT."
  (secure-hash 'sha256 (encode-coding-string text 'utf-8)))

(defun eliscript-femacs-host--validate-segment (label value)
  "Validate safe directory segment VALUE for LABEL."
  (unless (and (stringp value)
               (not (string-empty-p value))
               (not (member value '("." "..")))
               (string-match-p "\\`[A-Za-z0-9._-]+\\'" value))
    (eliscript-femacs-host--fail
     "invalid-segment" "Invalid %s segment: %S" label value))
  value)

(defun eliscript-femacs-host--slugify-config (build-config)
  "Convert BUILD-CONFIG into a single safe cache directory segment."
  (unless (and (stringp build-config) (not (string-empty-p build-config)))
    (eliscript-femacs-host--fail
     "missing-identity" "Manifest missing non-empty build_config"))
  (eliscript-femacs-host--validate-segment
   "build_config" (replace-regexp-in-string "/" "__" build-config t t)))

(defun eliscript-femacs-host--validate-commit (label value)
  "Validate 40-hex clean commit SHA VALUE for LABEL."
  (unless (and (stringp value)
               (string-match-p "\\`[0-9a-f]\\{40\\}\\'" value))
    (eliscript-femacs-host--fail
     "unverified-source-commit"
     "%s must be a 40-hex verified clean commit, got %S" label value))
  value)

(defun eliscript-femacs-host--validate-sha256 (label value)
  "Validate 64-hex SHA-256 string VALUE for LABEL."
  (unless (and (stringp value)
               (string-match-p "\\`[0-9a-f]\\{64\\}\\'" value))
    (eliscript-femacs-host--fail
     "invalid-package-sha256"
     "%s must be a 64-hex SHA-256 digest, got %S" label value))
  value)

(defun eliscript-femacs-host--ensure-no-symlinks (root)
  "Reject any symlink at ROOT or recursively beneath ROOT."
  (when (file-symlink-p root)
    (eliscript-femacs-host--fail
     "symlink" "Package root must not be a symlink: %s" root))
  (let ((pending (list (directory-file-name (expand-file-name root)))))
    (while pending
      (let* ((dir (pop pending))
             (entries (directory-files dir t "\\`[^.]\\|\\`\\.[^.]\\|\\`\\.\\." t)))
        (dolist (entry entries)
          (let ((name (file-name-nondirectory entry)))
            (unless (member name '("." ".."))
              (when (file-symlink-p entry)
                (eliscript-femacs-host--fail
                 "symlink" "Package contains forbidden symlink: %s" entry))
              (when (file-directory-p entry)
                (push entry pending)))))))))

(defun eliscript-femacs-host--walk-files-relative (root)
  "Return sorted relative POSIX paths for regular files under ROOT."
  (let ((base (file-name-as-directory (expand-file-name root)))
        (pending (list (directory-file-name (expand-file-name root))))
        (files nil))
    (while pending
      (let* ((dir (pop pending))
             (entries (directory-files dir t nil t)))
        (dolist (entry entries)
          (let ((name (file-name-nondirectory entry)))
            (unless (member name '("." ".."))
              (when (file-symlink-p entry)
                (eliscript-femacs-host--fail
                 "symlink" "Resource tree contains symlink: %s" entry))
              (cond
               ((file-directory-p entry)
                (push entry pending))
               ((file-regular-p entry)
                (push (file-relative-name entry base) files))
               (t
                (eliscript-femacs-host--fail
                 "symlink" "Resource tree contains non-regular entry: %s" entry))))))))
    (sort files #'string<)))

(defun eliscript-femacs-host--hash-resource-tree (root)
  "Compute `(file_count sha256 total_bytes)' table for resource directory ROOT."
  (when (or (file-symlink-p root) (not (file-directory-p root)))
    (eliscript-femacs-host--fail
     "missing-resource-tree" "Resource root is not a directory: %s" root))
  (let* ((base (file-name-as-directory (expand-file-name root)))
         (rel-files (eliscript-femacs-host--walk-files-relative base))
         (total-bytes 0)
         (parts nil))
    (dolist (rel rel-files)
      (let* ((fpath (expand-file-name rel base))
             (size (file-attribute-size (file-attributes fpath)))
             (digest (eliscript-femacs-host--sha256-file fpath)))
        (setq total-bytes (+ total-bytes size))
        (push (format "%s\0%d\0%s\n" rel size digest) parts)))
    (let ((tbl (make-hash-table :test 'equal)))
      (puthash "file_count" (length rel-files) tbl)
      (puthash "sha256"
               (eliscript-femacs-host--sha256-string
                (apply #'concat (nreverse parts)))
               tbl)
      (puthash "total_bytes" total-bytes tbl)
      tbl)))

(defun eliscript-femacs-host--canonical-json (value)
  "Serialize VALUE deterministically matching sorted compact JSON."
  (cond
   ((hash-table-p value)
    (let ((keys nil))
      (maphash (lambda (k _v) (push k keys)) value)
      (setq keys (sort keys #'string<))
      (concat
       "{"
       (mapconcat
        (lambda (k)
          (concat (json-encode-string k)
                  ":"
                  (eliscript-femacs-host--canonical-json (gethash k value))))
        keys
        ",")
       "}")))
   ((stringp value) (json-encode-string value))
   ((integerp value) (number-to-string value))
   ((numberp value) (json-encode value))
   ((eq value t) "true")
   ((or (eq value nil) (eq value :json-false)) "false")
   ((listp value)
    (concat "["
            (mapconcat #'eliscript-femacs-host--canonical-json value ",")
            "]"))
   (t
    (eliscript-femacs-host--fail
     "invalid-manifest" "Unsupported canonical JSON value: %S" value))))

(defun eliscript-femacs-host--compute-package-sha256 (manifest)
  "Recompute canonical `package_sha256' from MANIFEST hash-table."
  (let ((canon (make-hash-table :test 'equal)))
    (dolist (k '("binaries" "build_config" "resource_trees" "source_commit" "target"))
      (puthash k (gethash k manifest) canon))
    (eliscript-femacs-host--sha256-string
     (eliscript-femacs-host--canonical-json canon))))

(defun eliscript-femacs-host-read-manifest (pkg-dir)
  "Read and perform schema validation on PKG-DIR/manifest.json."
  (unless (and (stringp pkg-dir)
               (file-exists-p pkg-dir)
               (not (file-symlink-p pkg-dir))
               (file-directory-p pkg-dir))
    (eliscript-femacs-host--fail
     "missing-package" "Package directory missing or invalid: %s" pkg-dir))
  (let ((manifest-path (expand-file-name "manifest.json" pkg-dir)))
    (when (or (file-symlink-p manifest-path) (not (file-regular-p manifest-path)))
      (eliscript-femacs-host--fail
       "missing-manifest" "manifest.json not found under %s" pkg-dir))
    (let ((raw (with-temp-buffer
                 (insert-file-contents manifest-path)
                 (buffer-string))))
      (when (or (string-search "/Users/" raw) (string-search "/home/" raw))
        (eliscript-femacs-host--fail
         "host-path-leak" "Manifest leaks personal host path: %s" manifest-path))
      (let ((manifest (condition-case err
                          (json-parse-string raw
                                             :object-type 'hash-table
                                             :array-type 'list
                                             :null-object nil
                                             :false-object :json-false)
                        (error
                         (eliscript-femacs-host--fail
                          "invalid-manifest"
                          "Manifest JSON decode failed: %s"
                          (error-message-string err))))))
        (unless (hash-table-p manifest)
          (eliscript-femacs-host--fail
           "invalid-manifest" "Manifest root must be a JSON object"))
        (unless (eql (gethash "schema" manifest) 1)
          (eliscript-femacs-host--fail
           "invalid-schema" "Unsupported manifest schema: %S"
           (gethash "schema" manifest)))
        (unless (equal (gethash "product" manifest) "femacs-lisp")
          (eliscript-femacs-host--fail
           "invalid-product" "Unexpected product: %S"
           (gethash "product" manifest)))
        manifest))))

(defun eliscript-femacs-host-verify-package
    (pkg-dir &optional expect-commit expect-target expect-config expect-sha256)
  "Verify PKG-DIR integrity and identity; return parsed manifest hash-table.
EXPECT-TARGET may be a string or `'host' to assert the current host target."
  (eliscript-femacs-host--ensure-no-symlinks pkg-dir)
  (let* ((manifest (eliscript-femacs-host-read-manifest pkg-dir))
         (resolved-pkg (file-truename (expand-file-name pkg-dir)))
         (source-commit (gethash "source_commit" manifest))
         (target (gethash "target" manifest))
         (build-config (gethash "build_config" manifest))
         (pkg-sha256 (gethash "package_sha256" manifest))
         (resolved-target (if (eq expect-target 'host)
                              (eliscript-femacs-host-current-target)
                            expect-target)))
    (dolist (field '("source_commit" "target" "build_config" "package_sha256"))
      (let ((val (gethash field manifest)))
        (unless (and (stringp val) (not (string-empty-p val)))
          (eliscript-femacs-host--fail
           "missing-identity" "Manifest missing required `%s'" field))))
    (eliscript-femacs-host--validate-commit "manifest source_commit" source-commit)
    (eliscript-femacs-host--validate-segment "manifest target" target)
    (eliscript-femacs-host--slugify-config build-config)
    (eliscript-femacs-host--validate-sha256 "manifest package_sha256" pkg-sha256)
    (when expect-commit
      (eliscript-femacs-host--validate-commit "expect_commit" expect-commit)
      (unless (equal source-commit expect-commit)
        (eliscript-femacs-host--fail
         "commit-mismatch" "source_commit mismatch: expected %s, got %s"
         expect-commit source-commit)))
    (when resolved-target
      (unless (equal target resolved-target)
        (eliscript-femacs-host--fail
         "target-mismatch" "target mismatch: expected %s, got %s"
         resolved-target target)))
    (when expect-config
      (unless (equal build-config expect-config)
        (eliscript-femacs-host--fail
         "build-config-mismatch" "build_config mismatch: expected %s, got %s"
         expect-config build-config)))
    (when expect-sha256
      (eliscript-femacs-host--validate-sha256 "expect_package_sha256" expect-sha256)
      (unless (equal pkg-sha256 expect-sha256)
        (eliscript-femacs-host--fail
         "package-sha256-mismatch" "package_sha256 mismatch: expected %s, got %s"
         expect-sha256 pkg-sha256)))

    ;; Verify exact canonical binaries layout and digests.
    (let ((binaries (gethash "binaries" manifest))
          (canonical '(("femacs-lisp" . "bin/femacs-lisp")
                       ("femacs-lisp.pdmp" . "bin/femacs-lisp.pdmp")
                       ("http-host" . "bin/http-host"))))
      (unless (and (hash-table-p binaries)
                   (= (hash-table-count binaries) (length canonical)))
        (eliscript-femacs-host--fail
         "invalid-binaries" "Manifest binaries must match canonical keys"))
      (dolist (spec canonical)
        (let* ((name (car spec))
               (rel (cdr spec))
               (entry (gethash name binaries)))
          (unless (hash-table-p entry)
            (eliscript-femacs-host--fail
             "missing-binary-entry" "Manifest missing binary entry %s" name))
          (unless (equal (gethash "relative_path" entry) rel)
            (eliscript-femacs-host--fail
             "invalid-binary-path"
             "Binary %s must use %s, got %S"
             name rel (gethash "relative_path" entry)))
          (let ((exp-bytes (gethash "bytes" entry))
                (exp-sha (gethash "sha256" entry))
                (fpath (expand-file-name rel resolved-pkg)))
            (unless (and (integerp exp-bytes) (>= exp-bytes 0)
                         (stringp exp-sha)
                         (string-match-p "\\`[0-9a-f]\\{64\\}\\'" exp-sha))
              (eliscript-femacs-host--fail
               "invalid-binary-entry" "Malformed binary metadata for %s" name))
            (when (or (file-symlink-p fpath) (not (file-regular-p fpath)))
              (eliscript-femacs-host--fail
               "missing-binary-file" "Packaged binary missing: %s" rel))
            (let ((act-bytes (file-attribute-size (file-attributes fpath)))
                  (act-sha (eliscript-femacs-host--sha256-file fpath)))
              (unless (= act-bytes exp-bytes)
                (eliscript-femacs-host--fail
                 "binary-bytes-mismatch"
                 "Binary %s size mismatch: manifest=%d actual=%d"
                 name exp-bytes act-bytes))
              (unless (equal act-sha exp-sha)
                (eliscript-femacs-host--fail
                 "binary-sha256-mismatch"
                 "Binary %s sha256 mismatch: manifest=%s actual=%s"
                 name exp-sha act-sha))))))
      (let ((bin-dir (expand-file-name "bin" resolved-pkg))
            (expected-bins '("femacs-lisp" "femacs-lisp.pdmp" "http-host")))
        (when (or (file-symlink-p bin-dir) (not (file-directory-p bin-dir)))
          (eliscript-femacs-host--fail
           "missing-binary-file" "Package bin directory missing: %s" bin-dir))
        (let ((actual-bins
               (sort (cl-remove-if
                      (lambda (name) (member name '("." "..")))
                      (directory-files bin-dir nil nil t))
                     #'string<)))
          (unless (equal actual-bins expected-bins)
            (eliscript-femacs-host--fail
             "unexpected-bin-entry" "Package bin/ entries %S differ from %S"
             actual-bins expected-bins)))
        (unless (file-executable-p (expand-file-name "femacs-lisp" bin-dir))
          (eliscript-femacs-host--fail
           "binary-not-executable" "Packaged femacs-lisp is not executable"))))

    ;; Verify resource trees and absence of unexpected top-level entries.
    (let ((resource-trees (gethash "resource_trees" manifest))
          (actual-dirs nil))
      (unless (hash-table-p resource-trees)
        (eliscript-femacs-host--fail
         "missing-resource-trees" "Manifest missing resource_trees object"))
      (dolist (req '("lisp" "etc"))
        (unless (hash-table-p (gethash req resource-trees))
          (eliscript-femacs-host--fail
           "missing-resource-tree" "Manifest missing required resource tree %s" req)))
      (dolist (entry (directory-files resolved-pkg t nil t))
        (let ((name (file-name-nondirectory entry)))
          (unless (member name '("." ".."))
            (when (file-symlink-p entry)
              (eliscript-femacs-host--fail
               "symlink" "Package contains forbidden symlink: %s" entry))
            (cond
             ((equal name "manifest.json")
              (unless (file-regular-p entry)
                (eliscript-femacs-host--fail
                 "invalid-manifest" "manifest.json is not a regular file")))
             ((equal name "bin") nil)
             ((file-directory-p entry)
              (eliscript-femacs-host--validate-segment "resource_tree" name)
              (push name actual-dirs))
             (t
              (eliscript-femacs-host--fail
               "unexpected-package-entry"
               "Unexpected top-level entry in package root: %s" name))))))
      (dolist (dir actual-dirs)
        (unless (gethash dir resource-trees)
          (eliscript-femacs-host--fail
           "unverified-resource-tree"
           "Package directory %s omitted from manifest" dir)))
      (let ((tree-keys nil))
        (maphash (lambda (k _v) (push k tree-keys)) resource-trees)
        (setq tree-keys (sort tree-keys #'string<))
        (dolist (dir tree-keys)
          (unless (member dir actual-dirs)
            (eliscript-femacs-host--fail
             "missing-resource-tree"
             "Manifest resource tree %s missing from package" dir))
          (let* ((recorded (gethash dir resource-trees))
                 (actual (eliscript-femacs-host--hash-resource-tree
                          (expand-file-name dir resolved-pkg))))
            (unless (and (hash-table-p recorded)
                         (eql (gethash "file_count" actual) (gethash "file_count" recorded))
                         (eql (gethash "total_bytes" actual) (gethash "total_bytes" recorded))
                         (equal (gethash "sha256" actual) (gethash "sha256" recorded)))
              (eliscript-femacs-host--fail
               "resource-tree-mismatch"
               "Resource tree %s tampered or drifted" dir))))))

    ;; Verify overall canonical package digest.
    (let ((recomputed (eliscript-femacs-host--compute-package-sha256 manifest)))
      (unless (equal recomputed pkg-sha256)
        (eliscript-femacs-host--fail
         "package-digest-mismatch"
         "package_sha256 mismatch: recorded=%s recomputed=%s"
         pkg-sha256 recomputed)))
    manifest))

(defun eliscript-femacs-host--cache-slot (cache-root manifest)
  "Compute immutable cache slot path under CACHE-ROOT for MANIFEST."
  (let ((commit (eliscript-femacs-host--validate-commit
                 "source_commit" (gethash "source_commit" manifest)))
        (target (eliscript-femacs-host--validate-segment
                 "target" (gethash "target" manifest)))
        (cfg (eliscript-femacs-host--slugify-config
              (gethash "build_config" manifest)))
        (sha (eliscript-femacs-host--validate-sha256
              "package_sha256" (gethash "package_sha256" manifest))))
    (expand-file-name
     (mapconcat #'identity (list commit target cfg sha) "/")
     (expand-file-name cache-root))))

(defun eliscript-femacs-host--copy-tree-no-symlinks (src dst)
  "Copy regular directory tree SRC to fresh non-existent DST without symlinks."
  (when (or (file-exists-p dst) (file-symlink-p dst))
    (eliscript-femacs-host--fail
     "staging-exists" "Staging destination already exists: %s" dst))
  (make-directory dst t)
  (let ((stack (list (cons (file-name-as-directory (expand-file-name src))
                           (file-name-as-directory (expand-file-name dst))))))
    (while stack
      (let* ((pair (pop stack))
             (sdir (car pair))
             (ddir (cdr pair)))
        (dolist (entry (directory-files sdir t nil t))
          (let ((name (file-name-nondirectory entry)))
            (unless (member name '("." ".."))
              (when (file-symlink-p entry)
                (eliscript-femacs-host--fail
                 "symlink" "Cannot copy symlink into cache: %s" entry))
              (let ((target (expand-file-name name ddir)))
                (cond
                 ((file-directory-p entry)
                  (make-directory target t)
                  (push (cons (file-name-as-directory entry)
                              (file-name-as-directory target))
                        stack))
                 ((file-regular-p entry)
                  (copy-file entry target t t nil nil)
                  (when (file-executable-p entry)
                    (set-file-modes target (logior (or (file-modes entry) #o755) #o100))))
                 (t
                  (eliscript-femacs-host--fail
                   "symlink" "Unsupported file type in package: %s" entry)))))))))))

(defun eliscript-femacs-host--result-plist (status slot manifest)
  "Build result plist for STATUS, cache SLOT, and verified MANIFEST."
  (let ((resolved (file-truename slot)))
    (list :status status
          :cache-entry resolved
          :lisp-bin (expand-file-name "bin/femacs-lisp" resolved)
          :http-bin (expand-file-name "bin/http-host" resolved)
          :source-commit (gethash "source_commit" manifest)
          :target (gethash "target" manifest)
          :build-config (gethash "build_config" manifest)
          :package-sha256 (gethash "package_sha256" manifest))))

(defun eliscript-femacs-host-ensure-cache
    (source-pkg-dir cache-root
     &optional expect-commit expect-target expect-config expect-sha256)
  "Verify SOURCE-PKG-DIR and populate/hit CACHE-ROOT.
Returns result plist with `:status' (`hit' or `rebuilt') and `:lisp-bin'."
  (let* ((manifest (eliscript-femacs-host-verify-package
                    source-pkg-dir expect-commit
                    (or expect-target 'host)
                    expect-config expect-sha256))
         (slot (eliscript-femacs-host--cache-slot cache-root manifest)))
    (if (or (file-exists-p slot) (file-symlink-p slot))
        (let ((cached (eliscript-femacs-host-verify-package
                       slot
                       (gethash "source_commit" manifest)
                       (gethash "target" manifest)
                       (gethash "build_config" manifest)
                       (gethash "package_sha256" manifest))))
          (eliscript-femacs-host--result-plist 'hit slot cached))
      (let ((parent (file-name-directory (directory-file-name slot))))
        (make-directory parent t)
        (let ((staging (make-temp-name (expand-file-name ".staging-" parent))))
          (unwind-protect
              (progn
                (eliscript-femacs-host--copy-tree-no-symlinks source-pkg-dir staging)
                (let ((staged-manifest (eliscript-femacs-host-verify-package
                                        staging
                                        (gethash "source_commit" manifest)
                                        (gethash "target" manifest)
                                        (gethash "build_config" manifest)
                                        (gethash "package_sha256" manifest))))
                  (rename-file staging slot nil)
                  (eliscript-femacs-host--result-plist 'rebuilt slot staged-manifest)))
            (when (or (file-exists-p staging) (file-symlink-p staging))
              (delete-directory staging t))))))))

(defun eliscript-femacs-host-resolve-cache
    (cache-root expect-commit expect-target expect-config expect-sha256)
  "Resolve and verify an existing cached host entry under CACHE-ROOT."
  (let* ((commit (eliscript-femacs-host--validate-commit "expect_commit" expect-commit))
         (target (eliscript-femacs-host--validate-segment "expect_target" expect-target))
         (cfg (eliscript-femacs-host--slugify-config expect-config))
         (sha (eliscript-femacs-host--validate-sha256 "expect_package_sha256" expect-sha256))
         (slot (expand-file-name
                (mapconcat #'identity (list commit target cfg sha) "/")
                (expand-file-name cache-root))))
    (unless (or (file-exists-p slot) (file-symlink-p slot))
      (eliscript-femacs-host--fail
       "cache-miss" "No cached host entry at %s" slot))
    (let ((manifest (eliscript-femacs-host-verify-package
                     slot commit target expect-config sha)))
      (eliscript-femacs-host--result-plist 'hit slot manifest))))

(defun eliscript-femacs-host--plist-to-json (plist)
  "Encode cache result PLIST as JSON string."
  (json-encode
   `((status . ,(symbol-name (plist-get plist :status)))
     (cache_entry . ,(plist-get plist :cache-entry))
     (lisp_bin . ,(plist-get plist :lisp-bin))
     (http_bin . ,(plist-get plist :http-bin))
     (source_commit . ,(plist-get plist :source-commit))
     (target . ,(plist-get plist :target))
     (build_config . ,(plist-get plist :build-config))
     (package_sha256 . ,(plist-get plist :package-sha256)))))

(defun eliscript-femacs-host-cache-main (&optional args)
  "CLI entrypoint for standalone FEmacs host cache verification and lookup."
  (let ((cursor (or args command-line-args-left))
        mode source pkg cache-dir expect-commit expect-target expect-config expect-sha256
        print-bin json-out)
    (when (equal (car cursor) "--")
      (setq cursor (cdr cursor)))
    (while cursor
      (let ((flag (pop cursor)))
        (cond
         ((member flag '("--ensure" "--verify" "--resolve"))
          (setq mode flag))
         ((equal flag "--source") (setq source (pop cursor)))
         ((equal flag "--package") (setq pkg (pop cursor)))
         ((equal flag "--cache-dir") (setq cache-dir (pop cursor)))
         ((equal flag "--expect-commit") (setq expect-commit (pop cursor)))
         ((equal flag "--expect-target") (setq expect-target (pop cursor)))
         ((equal flag "--expect-config") (setq expect-config (pop cursor)))
         ((member flag '("--expect-sha256" "--expect-package-sha256"))
          (setq expect-sha256 (pop cursor)))
         ((equal flag "--print-bin") (setq print-bin t))
         ((equal flag "--json") (setq json-out t))
         (t (eliscript-femacs-host--fail
             "invalid-argument" "Unknown argument: %s" flag)))))
    (setq command-line-args-left nil)
    (let ((result
           (cond
            ((equal mode "--ensure")
             (unless (and source cache-dir)
               (eliscript-femacs-host--fail
                "invalid-argument" "--ensure requires --source and --cache-dir"))
             (eliscript-femacs-host-ensure-cache
              source cache-dir expect-commit
              (or expect-target 'host) expect-config expect-sha256))
            ((equal mode "--resolve")
             (unless (and cache-dir expect-commit expect-target expect-config expect-sha256)
               (eliscript-femacs-host--fail
                "invalid-argument"
                "--resolve requires --cache-dir and all --expect-* flags"))
             (eliscript-femacs-host-resolve-cache
              cache-dir expect-commit expect-target expect-config expect-sha256))
            ((equal mode "--verify")
             (unless pkg
               (eliscript-femacs-host--fail
                "invalid-argument" "--verify requires --package"))
             (let ((manifest (eliscript-femacs-host-verify-package
                              pkg expect-commit
                              (or expect-target 'host)
                              expect-config expect-sha256)))
               (eliscript-femacs-host--result-plist 'verified pkg manifest)))
            (t
             (eliscript-femacs-host--fail
              "invalid-argument"
              "Expected one of --ensure, --verify, or --resolve")))))
      (cond
       (print-bin (princ (format "%s\n" (plist-get result :lisp-bin))))
       (json-out (princ (format "%s\n" (eliscript-femacs-host--plist-to-json result))))
       (t (princ (format "%s\n" (eliscript-femacs-host--plist-to-json result))))))))

(when (and noninteractive
           (not (bound-and-true-p byte-compile-current-file))
           (cl-some (lambda (arg) (member arg '("--ensure" "--verify" "--resolve")))
                    command-line-args-left))
  (condition-case err
      (eliscript-femacs-host-cache-main command-line-args-left)
    (error
     (message "femacs-host-cache: %s" (error-message-string err))
     (kill-emacs 1))))

(provide 'femacs-host-cache)
;;; femacs-host-cache.el ends here
