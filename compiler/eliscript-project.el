;;; eliscript-project.el --- Multi-file project builds -*- lexical-binding: t; -*-

;;; Commentary:

;; Compile a graph of local Eliscript modules into an equivalent ESM tree.
;; Dependency discovery happens on expanded IR so generated imports participate
;; in the same build as imports written directly in source.

;;; Code:

(require 'cl-lib)
(require 'json)
(require 'subr-x)
(require 'eliscript)
(require 'eliscript-diagnostic)
(require 'eliscript-ir)

(define-error 'eliscript-project-error
	      "Eliscript project build error"
	      'eliscript-compile-error)

(cl-defstruct (eliscript-project-module
               (:constructor eliscript-project-module-create))
  source
  output
  source-map
  source-digest
  output-digest
  source-map-digest
  dependencies
  portable-entries
  reused
  reason)

(cl-defstruct (eliscript-project-build-result
               (:constructor eliscript-project-build-result-create))
  root
  out-dir
  entry
  entry-output
  modules
  manifest
  digest
  compiled-count
  reused-count
  mode
  portable-entries
  cache-enabled
  cache-status
  cache-reason)

(cl-defstruct (eliscript-project-cache
               (:constructor eliscript-project-cache-create))
  records
  sources
  manifest
  digest)

(cl-defstruct (eliscript-project-cache-lookup
               (:constructor eliscript-project-cache-lookup-create))
  cache
  reason)

(cl-defstruct (eliscript-project-cache-decision
               (:constructor eliscript-project-cache-decision-create))
  module
  reason)

(defconst eliscript-project-manifest-filename "eliscript-project.json"
  "Filename of the deterministic project build manifest.")

(defconst eliscript-project-cache-version 1
  "Version of private incremental metadata in the project manifest.")

(defconst eliscript-project-build-report-version 1
  "Version of the public project build decision report.")

(defvar eliscript-project-use-cache t
  "When non-nil, project builds may reuse verified manifest artifacts.")

(defconst eliscript-project--compiler-directory
  (file-name-directory (or load-file-name buffer-file-name))
  "Directory whose compiler sources determine incremental cache validity.")

(defun eliscript-project--fail (filename span format-string &rest arguments)
  "Signal a project error at SPAN in FILENAME.

FORMAT-STRING and ARGUMENTS describe the failure."
  (signal
   'eliscript-project-error
   (list
    (apply #'eliscript-diagnostic-format-at
           filename span format-string arguments))))

(defun eliscript-project--canonical-directory (directory label)
  "Return canonical DIRECTORY with a trailing slash, or fail using LABEL."
  (let ((path (expand-file-name directory)))
    (unless (file-directory-p path)
      (eliscript-project--fail path nil "%s is not a directory" label))
    (file-name-as-directory (file-truename path))))

(defun eliscript-project--canonical-source (path root filename span)
  "Return canonical source PATH after validating it against ROOT.

FILENAME and SPAN identify the import responsible for PATH."
  (let ((expanded (expand-file-name path)))
    (unless (file-regular-p expanded)
      (eliscript-project--fail
       filename span "local Eliscript module does not exist: %s" path))
    (let ((canonical (file-truename expanded)))
      (unless (file-in-directory-p canonical root)
        (eliscript-project--fail
         filename span "local Eliscript module escapes project root: %s" path))
      canonical)))

(defun eliscript-project--source-output (source root out-dir)
  "Map Eliscript SOURCE below ROOT into its ESM path below OUT-DIR."
  (let ((relative (file-relative-name source root)))
    (expand-file-name
     (concat (string-remove-suffix ".eli" relative) ".mjs")
     out-dir)))

(defun eliscript-project--relative-import (target importer)
  "Return an ESM import from IMPORTER to TARGET."
  (let ((relative
         (file-relative-name target (file-name-directory importer))))
    (if (or (string-prefix-p "./" relative)
            (string-prefix-p "../" relative))
        relative
      (concat "./" relative))))

(defun eliscript-project--local-import-p (specifier)
  "Return non-nil when SPECIFIER is a relative Eliscript source import."
  (and (string-suffix-p ".eli" specifier)
       (or (string-prefix-p "./" specifier)
           (string-prefix-p "../" specifier))))

(defun eliscript-project--read-source (filename)
  "Read FILENAME as a string."
  (with-temp-buffer
    (insert-file-contents filename)
    (buffer-string)))

(defun eliscript-project--file-digest (filename)
  "Return the lowercase SHA-256 digest of FILENAME's exact bytes."
  (with-temp-buffer
    (set-buffer-multibyte nil)
    (insert-file-contents-literally filename)
    (secure-hash 'sha256 (current-buffer))))

(defun eliscript-project--json-digest (object)
  "Return SHA-256 over the compact UTF-8 JSON encoding of OBJECT."
  (secure-hash
   'sha256
   (encode-coding-string (json-serialize object) 'utf-8-unix t)))

(defun eliscript-project--compiler-digest ()
  "Return a digest identifying the loaded seed compiler implementation."
  (let ((files
         (sort
          (directory-files-recursively
           eliscript-project--compiler-directory "\\.el\\'")
          #'string-lessp))
        parts)
    (dolist (file files)
      (push
       (format "%s\0%s"
               (file-relative-name file eliscript-project--compiler-directory)
               (eliscript-project--file-digest file))
       parts))
    (secure-hash
     'sha256
     (encode-coding-string (mapconcat #'identity (nreverse parts) "\n")
                           'utf-8-unix t))))

(defun eliscript-project--portable-entry-names (entries)
  "Return stable string names for portable ENTRIES."
  (sort
   (delete-dups
    (mapcar (lambda (entry)
              (if (symbolp entry) (symbol-name entry) entry))
            entries))
   #'string-lessp))

(defun eliscript-project--cache-module (module root)
  "Return private cache metadata for MODULE relative to ROOT."
  `((source . ,(file-relative-name
                (eliscript-project-module-source module) root))
    (dependencies
     . ,(vconcat
         (mapcar (lambda (dependency)
                   (file-relative-name dependency root))
                 (or (eliscript-project-module-dependencies module) nil))))
    (portableEntries
     . ,(vconcat
         (or (eliscript-project-module-portable-entries module) nil)))))

(defun eliscript-project--cache-identity-module (record)
  "Normalize parsed cache RECORD for deterministic digest verification."
  `((source . ,(alist-get 'source record))
    (dependencies . ,(vconcat (alist-get 'dependencies record)))
    (portableEntries . ,(vconcat (alist-get 'portableEntries record)))))

(defun eliscript-project--cache-miss (reason)
  "Return a cache lookup miss with stable REASON."
  (eliscript-project-cache-lookup-create :reason reason))

(defun eliscript-project--read-cache
    (out-dir entry-output mode portable-entries compiler-digest)
  "Read reusable build metadata for the requested project configuration."
  (let ((manifest-path
         (expand-file-name eliscript-project-manifest-filename out-dir)))
    (cond
     ((not eliscript-project-use-cache)
      (eliscript-project--cache-miss "cache-disabled"))
     ((not (file-regular-p manifest-path))
      (eliscript-project--cache-miss "manifest-missing"))
     (t
      (condition-case nil
          (let* ((manifest
                  (with-temp-buffer
                    (insert-file-contents manifest-path)
                    (json-parse-buffer
                     :object-type 'alist :array-type 'list
                     :null-object nil :false-object :false)))
                 (cache (alist-get 'cache manifest))
                 (identity-modules (alist-get 'modules manifest))
                 (cache-modules (alist-get 'modules cache))
                 (expected-entry (file-relative-name entry-output out-dir)))
            (cond
             ((or (not (equal (alist-get 'format manifest)
                              "eliscript-project"))
                  (not (equal (alist-get 'version manifest) 1))
                  (not (listp identity-modules)))
              (eliscript-project--cache-miss "manifest-version-changed"))
             ((not (equal (alist-get 'entry manifest) expected-entry))
              (eliscript-project--cache-miss "entry-changed"))
             ((let ((graph-identity
                     `((format . ,(alist-get 'format manifest))
                       (version . ,(alist-get 'version manifest))
                       (entry . ,(alist-get 'entry manifest))
                       (modules . ,(vconcat identity-modules)))))
                (not (equal (alist-get 'digest manifest)
                            (eliscript-project--json-digest graph-identity))))
              (eliscript-project--cache-miss "graph-digest-invalid"))
             ((not (consp cache))
              (eliscript-project--cache-miss "cache-missing"))
             ((not (equal (alist-get 'version cache)
                          eliscript-project-cache-version))
              (eliscript-project--cache-miss "cache-version-changed"))
             ((not (listp cache-modules))
              (eliscript-project--cache-miss "cache-records-invalid"))
             ((let ((cache-identity
                     `((version . ,(alist-get 'version cache))
                       (compilerDigest
                        . ,(alist-get 'compilerDigest cache))
                       (mode . ,(alist-get 'mode cache))
                       (portableEntries
                        . ,(vconcat (alist-get 'portableEntries cache)))
                       (modules
                        . ,(vconcat
                            (mapcar
                             #'eliscript-project--cache-identity-module
                             cache-modules))))))
                (not (equal (alist-get 'digest cache)
                            (eliscript-project--json-digest cache-identity))))
              (eliscript-project--cache-miss "cache-digest-invalid"))
             ((not (equal (alist-get 'compilerDigest cache)
                          compiler-digest))
              (eliscript-project--cache-miss "compiler-changed"))
             ((not (equal (alist-get 'mode cache) mode))
              (eliscript-project--cache-miss "mode-changed"))
             ((not (equal (alist-get 'portableEntries cache)
                          portable-entries))
              (eliscript-project--cache-miss "portable-roots-changed"))
             (t
              (let ((identities (make-hash-table :test #'equal))
                    (records (make-hash-table :test #'equal))
                    sources)
                (dolist (record identity-modules)
                  (let ((source (alist-get 'source record)))
                    (when (stringp source)
                      (puthash source record identities))))
                (dolist (metadata cache-modules)
                  (let* ((source (alist-get 'source metadata))
                         (identity (and (stringp source)
                                        (gethash source identities))))
                    (when identity
                      (puthash source (cons identity metadata) records)
                      (push source sources))))
                (if (and (= (length identity-modules)
                            (hash-table-count identities))
                         (= (length cache-modules)
                            (hash-table-count records))
                         (= (hash-table-count identities)
                            (hash-table-count records)))
                    (eliscript-project-cache-lookup-create
                     :cache
                     (eliscript-project-cache-create
                      :records records
                      :sources (sort sources #'string-lessp)
                      :manifest (file-truename manifest-path)
                      :digest (alist-get 'digest manifest))
                     :reason "verified")
                  (eliscript-project--cache-miss
                   "cache-records-invalid"))))))
        (error
         (eliscript-project--cache-miss "manifest-unreadable")))))))

(defun eliscript-project--cache-decision
    (source root out-dir cache &optional expected-portable-entries)
  "Return the cache decision for SOURCE.

EXPECTED-PORTABLE-ENTRIES is a sorted string list. The symbol `any' accepts
the entries recorded by CACHE for complete-graph reuse."
  (if (not cache)
      (eliscript-project-cache-decision-create :reason "not-cached")
    (condition-case nil
        (let* ((relative (file-relative-name source root))
               (pair
                (gethash relative
                         (eliscript-project-cache-records cache)))
               (identity (car pair))
               (metadata (cdr pair))
               (output
                (eliscript-project--source-output source root out-dir))
               (source-map (concat output ".map"))
               (portable-entries
                (alist-get 'portableEntries metadata))
               reason)
          (setq reason
                (cond
                 ((not pair) "not-cached")
                 ((not (equal (alist-get 'output identity)
                              (file-relative-name output out-dir)))
                  "output-path-changed")
                 ((not (equal (alist-get 'sourceMap identity)
                              (file-relative-name source-map out-dir)))
                  "source-map-path-changed")
                 ((not (or (eq expected-portable-entries 'any)
                           (equal portable-entries
                                  expected-portable-entries)))
                  "portable-entries-changed")
                 ((not (equal (alist-get 'sourceDigest identity)
                              (eliscript-project--file-digest source)))
                  "source-changed")
                 ((not (file-regular-p output)) "output-missing")
                 ((not (file-regular-p source-map)) "source-map-missing")
                 ((not (equal (alist-get 'outputDigest identity)
                              (eliscript-project--file-digest output)))
                  "output-digest-changed")
                 ((not (equal (alist-get 'sourceMapDigest identity)
                              (eliscript-project--file-digest source-map)))
                  "source-map-digest-changed")))
          (if reason
              (eliscript-project-cache-decision-create :reason reason)
            (condition-case nil
                (let ((dependencies
                       (mapcar
                        (lambda (dependency)
                          (eliscript-project--canonical-source
                           (expand-file-name dependency root)
                           root source nil))
                        (alist-get 'dependencies metadata))))
                  (eliscript-project-cache-decision-create
                   :module
                   (eliscript-project-module-create
                    :source source
                    :output output
                    :source-map source-map
                    :source-digest (alist-get 'sourceDigest identity)
                    :output-digest (alist-get 'outputDigest identity)
                    :source-map-digest (alist-get 'sourceMapDigest identity)
                    :dependencies dependencies
                    :portable-entries portable-entries
                    :reused t
                    :reason "verified")
                   :reason "verified"))
              (error
               (eliscript-project-cache-decision-create
                :reason "dependencies-invalid")))))
      (error
       (eliscript-project-cache-decision-create
        :reason "artifact-unreadable")))))

(defun eliscript-project--cached-build-result
    (root out-dir entry cache mode portable-entries)
  "Return a fully reused result for ENTRY from CACHE, or nil."
  (when cache
    (let (modules valid)
      (setq valid t)
      (dolist (relative (eliscript-project-cache-sources cache))
        (let* ((source (expand-file-name relative root))
               (decision
                (and (file-regular-p source)
                     (eliscript-project--cache-decision
                      (file-truename source) root out-dir cache 'any)))
               (module
                (and decision
                     (eliscript-project-cache-decision-module decision))))
          (if module
              (push module modules)
            (setq valid nil))))
      (when (and valid
                 (cl-find entry modules
                          :key #'eliscript-project-module-source
                          :test #'equal))
        (setq modules
              (sort modules
                    (lambda (left right)
                      (string-lessp
                       (eliscript-project-module-source left)
                       (eliscript-project-module-source right)))))
        (eliscript-project-build-result-create
         :root root
         :out-dir out-dir
         :entry entry
         :entry-output (eliscript-project--source-output entry root out-dir)
         :modules modules
         :manifest (eliscript-project-cache-manifest cache)
         :digest (eliscript-project-cache-digest cache)
         :compiled-count 0
         :reused-count (length modules)
         :mode mode
         :portable-entries portable-entries
         :cache-enabled t
         :cache-status "hit"
         :cache-reason "verified")))))

(defun eliscript-project--write-module
    (program source source-text output-path dependencies portable-entries reason)
  "Emit PROGRAM for SOURCE and write it to OUTPUT-PATH with a source map."
  (let* ((map-path (concat output-path ".map"))
         (map-directory (file-name-directory map-path))
         (generated-name (file-name-nondirectory output-path))
         (source-name (file-relative-name source map-directory))
         (emission
          (eliscript-emit-ir-module-with-source-map
           program source-text generated-name source-name))
         (javascript
          (concat (eliscript-emission-javascript emission)
                  "//# sourceMappingURL="
                  (file-name-nondirectory map-path)
                  "\n")))
    (make-directory map-directory t)
    (with-temp-file map-path
      (insert (eliscript-emission-source-map emission)))
    (with-temp-file output-path
      (insert javascript))
    (eliscript-project-module-create
     :source source
     :output output-path
     :source-map map-path
     :source-digest (eliscript-project--file-digest source)
     :output-digest (eliscript-project--file-digest output-path)
     :source-map-digest (eliscript-project--file-digest map-path)
     :dependencies dependencies
     :portable-entries portable-entries
     :reused nil
     :reason reason)))

(defun eliscript-project--manifest-module (module root out-dir)
  "Return the stable manifest record for MODULE below ROOT and OUT-DIR."
  `((source . ,(file-relative-name
                (eliscript-project-module-source module) root))
    (output . ,(file-relative-name
                (eliscript-project-module-output module) out-dir))
    (sourceMap . ,(file-relative-name
                   (eliscript-project-module-source-map module) out-dir))
    (sourceDigest . ,(eliscript-project-module-source-digest module))
    (outputDigest . ,(eliscript-project-module-output-digest module))
    (sourceMapDigest
     . ,(eliscript-project-module-source-map-digest module))))

(defun eliscript-project--write-manifest
    (root out-dir entry-output modules mode portable-entries compiler-digest)
  "Write and return (PATH DIGEST) for the build rooted at ENTRY-OUTPUT.

ROOT and OUT-DIR provide stable relative namespaces for MODULES."
  (let* ((records
          (vconcat
           (mapcar
            (lambda (module)
              (eliscript-project--manifest-module module root out-dir))
            modules)))
         (identity
          `((format . "eliscript-project")
            (version . 1)
            (entry . ,(file-relative-name entry-output out-dir))
            (modules . ,records)))
         (digest (eliscript-project--json-digest identity))
         (manifest-path
          (expand-file-name eliscript-project-manifest-filename out-dir))
         (cache-identity
          `((version . ,eliscript-project-cache-version)
            (compilerDigest . ,compiler-digest)
            (mode . ,mode)
            (portableEntries . ,(vconcat portable-entries))
            (modules
             . ,(vconcat
                 (mapcar
                  (lambda (module)
                    (eliscript-project--cache-module module root))
                  modules)))))
         (cache
          (append
           cache-identity
           `((digest . ,(eliscript-project--json-digest cache-identity))))))
    (make-directory out-dir t)
    (with-temp-file manifest-path
      (insert
       (json-serialize
        (append identity `((digest . ,digest) (cache . ,cache))))
       "\n"))
    (list (file-truename manifest-path) digest)))

(defun eliscript-project--build-result
    (root out-dir entry modules mode portable-entries compiler-digest
          cache-lookup)
  "Create a complete project build result for ENTRY and MODULES."
  (let* ((entry-output (eliscript-project--source-output entry root out-dir))
         (manifest-data
          (eliscript-project--write-manifest
           root out-dir entry-output modules mode portable-entries
           compiler-digest))
         (compiled-count
          (cl-count-if-not #'eliscript-project-module-reused modules))
         (reused-count
          (cl-count-if #'eliscript-project-module-reused modules))
         (cache (eliscript-project-cache-lookup-cache cache-lookup))
         (lookup-reason
          (eliscript-project-cache-lookup-reason cache-lookup))
         (cache-enabled (not (equal lookup-reason "cache-disabled")))
         (cache-status
          (cond
           ((not cache-enabled) "disabled")
           ((not cache) "miss")
           ((= reused-count (length modules)) "hit")
           ((> reused-count 0) "partial")
           (t "miss")))
         (cache-reason
          (cond
           ((not cache) lookup-reason)
           ((equal cache-status "hit") "verified")
           ((equal cache-status "partial") "dirty-modules")
           (t "all-modules-dirty"))))
    (eliscript-project-build-result-create
     :root root
     :out-dir out-dir
     :entry entry
     :entry-output entry-output
     :modules modules
     :manifest (car manifest-data)
     :digest (cadr manifest-data)
     :compiled-count compiled-count
     :reused-count reused-count
     :mode mode
     :portable-entries portable-entries
     :cache-enabled cache-enabled
     :cache-status cache-status
     :cache-reason cache-reason)))

(defun eliscript-project-build-report (result)
  "Return a stable JSON-compatible report for project build RESULT."
  (unless (eliscript-project-build-result-p result)
    (signal 'wrong-type-argument
            (list 'eliscript-project-build-result-p result)))
  (let ((root (eliscript-project-build-result-root result))
        (out-dir (eliscript-project-build-result-out-dir result)))
    `((format . "eliscript-build-report")
      (version . ,eliscript-project-build-report-version)
      (mode . ,(eliscript-project-build-result-mode result))
      (root . ,(directory-file-name root))
      (outDir . ,(directory-file-name out-dir))
      (entry
       . ,(file-relative-name
           (eliscript-project-build-result-entry result) root))
      (entryOutput
       . ,(file-relative-name
           (eliscript-project-build-result-entry-output result) out-dir))
      (manifest
       . ,(file-relative-name
           (eliscript-project-build-result-manifest result) out-dir))
      (digest . ,(eliscript-project-build-result-digest result))
      (portableEntries
       . ,(vconcat
           (or (eliscript-project-build-result-portable-entries result) nil)))
      (cache
       . ((enabled
           . ,(if (eliscript-project-build-result-cache-enabled result)
                  t :false))
          (status . ,(eliscript-project-build-result-cache-status result))
          (reason . ,(eliscript-project-build-result-cache-reason result))))
      (counts
       . ((modules
           . ,(length (eliscript-project-build-result-modules result)))
          (compiled . ,(eliscript-project-build-result-compiled-count result))
          (reused . ,(eliscript-project-build-result-reused-count result))))
      (modules
       . ,(vconcat
           (mapcar
            (lambda (module)
              `((source
                 . ,(file-relative-name
                     (eliscript-project-module-source module) root))
                (output
                 . ,(file-relative-name
                     (eliscript-project-module-output module) out-dir))
                (sourceMap
                 . ,(file-relative-name
                     (eliscript-project-module-source-map module) out-dir))
                (status
                 . ,(if (eliscript-project-module-reused module)
                        "reused" "compiled"))
                (reason . ,(eliscript-project-module-reason module))
                (dependencies
                 . ,(vconcat
                     (mapcar
                      (lambda (dependency)
                        (file-relative-name dependency root))
                      (or (eliscript-project-module-dependencies module)
                          nil))))
                (portableEntries
                 . ,(vconcat
                     (or (eliscript-project-module-portable-entries module)
                         nil)))))
            (eliscript-project-build-result-modules result)))))))

(defun eliscript-project-build (entry out-dir &optional root)
  "Compile the local Eliscript graph rooted at ENTRY into OUT-DIR.

ROOT defaults to ENTRY's directory.  Relative `.eli' imports are recursively
compiled, remain within ROOT, preserve their source directory structure, and
are rewritten to `.mjs'.  Other import specifiers remain unchanged."
  (let* ((entry-path (expand-file-name entry))
         (root-path
          (eliscript-project--canonical-directory
           (or root (file-name-directory entry-path)) "project root"))
         (canonical-entry
          (eliscript-project--canonical-source
           entry-path root-path entry-path nil))
         (resolved-out-dir (file-truename (expand-file-name out-dir)))
         (output-directory
          (file-name-as-directory resolved-out-dir))
         (compiler-digest (eliscript-project--compiler-digest))
         (entry-output
          (eliscript-project--source-output
           canonical-entry root-path output-directory))
         (cache-lookup
          (eliscript-project--read-cache
           output-directory entry-output "standard" nil
           compiler-digest))
         (cache (eliscript-project-cache-lookup-cache cache-lookup))
         (states (make-hash-table :test #'equal))
         modules)
    (unless (string-suffix-p ".eli" canonical-entry)
      (eliscript-project--fail
       canonical-entry nil "entry file must use the .eli extension"))
    (when (file-exists-p resolved-out-dir)
      (unless (file-directory-p resolved-out-dir)
        (eliscript-project--fail
         resolved-out-dir nil "output path is not a directory")))
    (cl-labels
        ((visit
           (source)
           (pcase (gethash source states)
             ('done nil)
             ('visiting nil)
             (_
              (puthash source 'visiting states)
              (let* ((output-path
                      (eliscript-project--source-output
                       source root-path output-directory))
                     (decision
                      (eliscript-project--cache-decision
                       source root-path output-directory cache nil))
                     (cached
                      (eliscript-project-cache-decision-module decision)))
		(if cached
                    (progn
                      (dolist (dependency
                               (eliscript-project-module-dependencies cached))
			(visit dependency))
                      (push cached modules))
                  (let* ((source-text
                          (eliscript-project--read-source source))
                         (program (eliscript-compile-ir-file source))
                         dependencies)
                    (eliscript-ir-walk
                     program
                     (lambda (node)
                       (when (eq (eliscript-ir-node-kind node)
                                 'import-declaration)
                         (let ((specifier (eliscript-ir-node-value node)))
                           (cond
                            ((eliscript-project--local-import-p specifier)
                             (let* ((candidate
                                     (expand-file-name
                                      specifier
                                      (file-name-directory source)))
                                    (dependency
                                     (eliscript-project--canonical-source
                                      candidate root-path source
                                      (eliscript-ir-node-span node)))
                                    (dependency-output
                                     (eliscript-project--source-output
                                      dependency root-path output-directory)))
                               (push dependency dependencies)
                               (setf (eliscript-ir-node-value node)
                                     (eliscript-project--relative-import
                                      dependency-output output-path))))
                            ((string-suffix-p ".eli" specifier)
                             (eliscript-project--fail
                              source (eliscript-ir-node-span node)
                              "Eliscript source import must be relative: %s"
                              specifier)))))))
                    (setq dependencies
                          (sort (delete-dups dependencies) #'string-lessp))
                    (dolist (dependency dependencies)
                      (visit dependency))
                    (push
                     (eliscript-project--write-module
                      program source source-text output-path dependencies nil
                      (if cache
                          (eliscript-project-cache-decision-reason decision)
			(eliscript-project-cache-lookup-reason cache-lookup)))
                     modules)))
		(puthash source 'done states))))))
      (visit canonical-entry))
    (setq modules
          (sort modules
                (lambda (left right)
                  (string-lessp
                   (eliscript-project-module-source left)
                   (eliscript-project-module-source right)))))
    (eliscript-project--build-result
     root-path output-directory canonical-entry modules "standard" nil
     compiler-digest cache-lookup)))

(defun eliscript-project--portable-imports (forms)
  "Return portable import descriptions from selected FORMS.

Each description has the shape (SPECIFIER NAMES SPAN)."
  (let (imports)
    (dolist (form forms)
      (let ((value (eliscript-form-value form)))
        (when (and (consp value)
                   (eq (eliscript-form-value (car value)) 'import-portable))
          (push
           (list
            (eliscript-form-value (cadr value))
            (eliscript-portable--import-names (cdr value))
            (eliscript-form-span form))
           imports))))
    (nreverse imports)))

(defun eliscript-project-build-portable (entry entries out-dir &optional root)
  "Compile portable ENTRIES and their local module graph from ENTRY.

Every `import-portable' edge must name a relative `.eli' module below ROOT.
The target binding must resolve to `defportable'; each generated module contains
only the requested declarations, immutable constants, and portable imports."
  (unless entries
    (eliscript-project--fail entry nil "portable build requires an entry name"))
  (let* ((entry-path (expand-file-name entry))
         (root-path
          (eliscript-project--canonical-directory
           (or root (file-name-directory entry-path)) "project root"))
         (canonical-entry
          (eliscript-project--canonical-source
           entry-path root-path entry-path nil))
         (resolved-out-dir (file-truename (expand-file-name out-dir)))
         (output-directory (file-name-as-directory resolved-out-dir))
         (portable-entry-names
          (eliscript-project--portable-entry-names entries))
         (compiler-digest (eliscript-project--compiler-digest))
         (entry-output
          (eliscript-project--source-output
           canonical-entry root-path output-directory))
         (cache-lookup
          (eliscript-project--read-cache
           output-directory entry-output "portable"
           portable-entry-names compiler-digest))
         (cache (eliscript-project-cache-lookup-cache cache-lookup))
         (cached-result
          (eliscript-project--cached-build-result
           root-path output-directory canonical-entry cache
           "portable" portable-entry-names))
         (forms-by-source (make-hash-table :test #'equal))
         (texts-by-source (make-hash-table :test #'equal))
         (requests (make-hash-table :test #'equal))
         queue
         modules)
    (unless (string-suffix-p ".eli" canonical-entry)
      (eliscript-project--fail
       canonical-entry nil "entry file must use the .eli extension"))
    (when (file-exists-p resolved-out-dir)
      (unless (file-directory-p resolved-out-dir)
        (eliscript-project--fail
         resolved-out-dir nil "output path is not a directory")))
    (or
     cached-result
     (progn
       (cl-labels
           ((load-forms
              (source)
              (or (gethash source forms-by-source)
                  (let* ((text (eliscript-project--read-source source))
                         (forms (eliscript--analyzed-string text source)))
                    (puthash source text texts-by-source)
                    (puthash source forms forms-by-source)
                    forms)))
            (enqueue
              (source name)
              (push (cons source (if (symbolp name) name (intern name))) queue))
            (resolve-import
              (source specifier span)
              (unless (eliscript-project--local-import-p specifier)
		(eliscript-project--fail
                 source span
                 "portable import must be a relative .eli module: %s"
                 specifier))
              (eliscript-project--canonical-source
               (expand-file-name specifier (file-name-directory source))
               root-path source span)))
         (dolist (name entries) (enqueue canonical-entry name))
         (while queue
           (pcase-let*
               ((`(,source . ,name) (pop queue))
                (source-requests
                 (or (gethash source requests)
                     (let ((table (make-hash-table :test #'eq)))
                       (puthash source table requests)
                       table))))
             (unless (gethash name source-requests)
               (puthash name t source-requests)
               (let* ((forms (load-forms source))
                      (selected
                       (eliscript-portable-select-module
                        forms
                        (let (names)
                          (maphash
                           (lambda (requested _present)
                             (push requested names))
                           source-requests)
                          (sort names
                                (lambda (left right)
                                  (string-lessp
                                   (symbol-name left) (symbol-name right)))))
                        source t)))
                 (dolist (import
                          (eliscript-project--portable-imports selected))
                   (let ((dependency
                          (resolve-import
                           source (nth 0 import) (nth 2 import))))
                     (dolist (imported-name (nth 1 import))
                       (enqueue dependency imported-name))))))))
         (let (sources)
           (maphash (lambda (source _names) (push source sources)) requests)
           (dolist (source (sort sources #'string-lessp))
             (let* ((source-requests (gethash source requests))
                    names
                    (forms (load-forms source))
                    (output-path
                     (eliscript-project--source-output
                      source root-path output-directory)))
               (maphash (lambda (name _present) (push name names)) source-requests)
               (setq names
                     (sort names
                           (lambda (left right)
                             (string-lessp
                              (symbol-name left) (symbol-name right)))))
               (let* ((selected
                       (eliscript-portable-select-module forms names source t))
                      (dependencies
                       (sort
                        (delete-dups
                         (mapcar
                          (lambda (import)
                            (resolve-import
                             source (nth 0 import) (nth 2 import)))
                          (eliscript-project--portable-imports selected)))
                        #'string-lessp))
                      (entry-names
                       (mapcar #'symbol-name names))
                      (decision
                       (eliscript-project--cache-decision
                        source root-path output-directory cache entry-names))
                      (cached
                       (eliscript-project-cache-decision-module decision)))
                 (if cached
                     (push cached modules)
                   (let ((program (eliscript-lower-module selected source)))
                     (eliscript-ir-walk
                      program
                      (lambda (node)
                        (when (eq (eliscript-ir-node-kind node)
                                  'import-declaration)
                          (let* ((specifier (eliscript-ir-node-value node))
                                 (dependency
                                  (resolve-import
                                   source specifier
                                   (eliscript-ir-node-span node)))
                                 (dependency-output
                                  (eliscript-project--source-output
                                   dependency root-path output-directory)))
                            (setf (eliscript-ir-node-value node)
                                  (eliscript-project--relative-import
                                   dependency-output output-path))))))
                     (push
                      (eliscript-project--write-module
                       program source (gethash source texts-by-source)
                       output-path dependencies entry-names
                       (if cache
                           (eliscript-project-cache-decision-reason decision)
                         (eliscript-project-cache-lookup-reason cache-lookup)))
                      modules)))))))
         (eliscript-project--build-result
          root-path output-directory canonical-entry (nreverse modules)
          "portable" portable-entry-names compiler-digest
          cache-lookup))))))

(provide 'eliscript-project)

;;; eliscript-project.el ends here
