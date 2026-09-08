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

(cl-defstruct (eliscript-project-macro-dependency
               (:constructor eliscript-project-macro-dependency-create))
  specifier
  source
  digest
  content)

(cl-defstruct (eliscript-project-module
               (:constructor eliscript-project-module-create))
  source
  output
  source-map
  source-digest
  output-digest
  source-map-digest
  dependencies
  macro-dependencies
  portable-entries
  reused
  reason)

(cl-defstruct (eliscript-project-build-result
               (:constructor eliscript-project-build-result-create))
  root
  out-dir
  entry
  entry-output
  entries
  entry-outputs
  modules
  manifest
  digest
  compiled-count
  reused-count
  mode
  portable-entries
  cache-enabled
  cache-status
  cache-reason
  cache-read-ms
  work-ms
  manifest-write-ms
  total-ms)

(cl-defstruct (eliscript-project-cache
               (:constructor eliscript-project-cache-create))
  records
  sources
  manifest
  digest
  source-version)

(cl-defstruct (eliscript-project-cache-lookup
               (:constructor eliscript-project-cache-lookup-create))
  cache
  reason)

(cl-defstruct (eliscript-project-cache-decision
               (:constructor eliscript-project-cache-decision-create))
  module
  reason)

(cl-defstruct (eliscript-project-request
               (:constructor eliscript-project-request-create))
  entry
  entries
  out-dir
  root
  portable-entries
  macro-capabilities
  macro-file-dependencies
  use-cache
  configuration)

(defconst eliscript-project-manifest-filename "eliscript-project.json"
  "Filename of the deterministic project build manifest.")

(defconst eliscript-project-cache-format "eliscript-project-cache"
  "Stable identity of private incremental project metadata.")

(defconst eliscript-project-cache-version 2
  "Version of private incremental metadata in the project manifest.")

(defconst eliscript-project-cache-legacy-version 1
  "Oldest private cache version accepted for read-only migration.")

(defconst eliscript-project-build-report-version 1
  "Version of the public project build decision report.")

(defconst eliscript-project-build-report-multi-version 2
  "Version of the multi-entry project build decision report.")

(defconst eliscript-project-configuration-version 1
  "Current version of the public `eliscript.json' request schema.")

(defconst eliscript-project-configuration-multi-version 2
  "Version of the public multi-entry project request schema.")

(defconst eliscript-project-configuration-format "eliscript-project-request"
  "Stable identity of the versioned project request schema family.")

(defconst eliscript-project-configuration-filename "eliscript.json"
  "Conventional filename for an Eliscript project request.")

(defconst eliscript-project--configuration-keys-v1
  '(schemaVersion sourceRoot entry outDir portableEntries
    macroCapabilities macroFileDependencies cache)
  "Complete top-level key set accepted by configuration version 1.")

(defconst eliscript-project--configuration-keys-v2
  '(schemaVersion sourceRoot entries outDir portableEntries
    macroCapabilities macroFileDependencies cache)
  "Complete top-level key set accepted by configuration version 2.")

(defvar eliscript-project-use-cache t
  "When non-nil, project builds may reuse verified manifest artifacts.")

(defconst eliscript-project--macro-capabilities '("read-file")
  "Macro capabilities implemented by the project host.")

(defconst eliscript-project--compiler-directory
  (file-name-directory (or load-file-name buffer-file-name))
  "Directory whose compiler sources determine incremental cache validity.")

(defun eliscript-project--elapsed-ms (started-at)
  "Return non-negative milliseconds elapsed since STARTED-AT."
  (max 0.0 (* 1000.0 (- (float-time) started-at))))

(defun eliscript-project--report-ms (milliseconds)
  "Round MILLISECONDS to three decimal places for a build report."
  (/ (float (round (* milliseconds 1000.0))) 1000.0))

(defun eliscript-project--fail (filename span format-string &rest arguments)
  "Signal a project error at SPAN in FILENAME.

FORMAT-STRING and ARGUMENTS describe the failure."
  (apply #'eliscript-diagnostic-signal
         'eliscript-project-error "ELI-B0001" "project-build"
         filename span format-string arguments))

(defun eliscript-project--configuration-fail
    (filename format-string &rest arguments)
  "Signal a configuration failure in FILENAME.

FORMAT-STRING and ARGUMENTS describe the failure."
  (apply #'eliscript-diagnostic-signal
         'eliscript-project-error "ELI-B0002" "project-config"
         filename nil format-string arguments))

(defun eliscript-project--safe-relative-path-p (path)
  "Return non-nil when PATH is a non-empty contained relative path."
  (and (stringp path)
       (not (string-empty-p path))
       (not (file-name-absolute-p path))
       (not (member ".." (split-string path "[/\\\\]" t)))))

(defun eliscript-project--configuration-field
    (configuration key default)
  "Return KEY from CONFIGURATION, or DEFAULT when it is absent."
  (let ((entry (assq key configuration)))
    (if entry (cdr entry) default)))

(defun eliscript-project--configuration-path
    (filename directory key value)
  "Resolve relative configuration path VALUE below DIRECTORY.

FILENAME and KEY identify invalid values in diagnostics."
  (unless (eliscript-project--safe-relative-path-p value)
    (eliscript-project--configuration-fail
     filename "%s must be a contained relative path" key))
  (expand-file-name value directory))

(defun eliscript-project--read-configuration-json ()
  "Read one JSON value while preserving every object entry."
  (let ((json-object-type 'alist)
        (json-array-type 'list)
        (json-key-type 'symbol)
        (json-null :null)
        (json-false :false))
    (prog1 (json-read)
      (skip-chars-forward " \t\r\n")
      (unless (eobp)
        (signal 'json-error '("trailing content after JSON value"))))))

(defun eliscript-project-read-configuration (filename)
  "Read and validate a versioned project request from FILENAME."
  (let* ((expanded (expand-file-name filename))
         (canonical
          (if (file-regular-p expanded)
              (file-truename expanded)
            (eliscript-project--configuration-fail
             expanded "configuration file does not exist")))
         (directory (file-name-directory canonical))
         configuration)
    (condition-case error-data
        (with-temp-buffer
          (insert-file-contents canonical)
          (setq configuration
                (eliscript-project--read-configuration-json)))
      (error
       (eliscript-project--configuration-fail
        canonical "invalid JSON: %s" (error-message-string error-data))))
    (unless (and (listp configuration)
                 (cl-every #'consp configuration))
      (eliscript-project--configuration-fail
       canonical "configuration root must be an object"))
    (let (seen duplicate)
      (dolist (key (mapcar #'car configuration))
        (if (memq key seen)
            (unless duplicate (setq duplicate key))
          (push key seen)))
      (when duplicate
        (eliscript-project--configuration-fail
         canonical "duplicate configuration key: %s" duplicate)))
    (let* ((version
            (eliscript-project--configuration-field
             configuration 'schemaVersion nil))
           (configuration-keys
            (cond
             ((equal version eliscript-project-configuration-version)
              eliscript-project--configuration-keys-v1)
             ((equal version eliscript-project-configuration-multi-version)
              eliscript-project--configuration-keys-v2)
             (t
              (eliscript-project--configuration-fail
               canonical "unsupported schemaVersion: %s" version))))
           (unknown
           (sort
            (cl-remove-if
             (lambda (key)
               (memq key configuration-keys))
             (mapcar #'car configuration))
            (lambda (left right)
              (string-lessp (symbol-name left) (symbol-name right))))))
      (when unknown
        (eliscript-project--configuration-fail
         canonical "unknown configuration key: %s" (car unknown))))
    (let* ((version
            (eliscript-project--configuration-field
             configuration 'schemaVersion nil))
           (source-root
            (eliscript-project--configuration-field
             configuration 'sourceRoot "."))
           (entry
            (eliscript-project--configuration-field
             configuration 'entry nil))
           (entries
            (eliscript-project--configuration-field
             configuration 'entries nil))
           (out-dir
            (eliscript-project--configuration-field
             configuration 'outDir nil))
           (portable-entries
            (eliscript-project--configuration-field
             configuration 'portableEntries nil))
           (macro-capabilities
            (eliscript-project--configuration-field
             configuration 'macroCapabilities nil))
           (macro-file-dependencies
            (eliscript-project--configuration-field
             configuration 'macroFileDependencies nil))
           (cache
            (eliscript-project--configuration-field
             configuration 'cache t)))
      (unless (and (listp portable-entries)
                   (cl-every
                    (lambda (name)
                      (and (stringp name) (not (string-empty-p name))))
                    portable-entries))
        (eliscript-project--configuration-fail
         canonical "portableEntries must be an array of non-empty strings"))
      (unless (= (length portable-entries)
                 (length (delete-dups (copy-sequence portable-entries))))
        (eliscript-project--configuration-fail
         canonical "portableEntries must not contain duplicates"))
      (unless (and (listp macro-capabilities)
                   (cl-every
                    (lambda (name)
                      (and (stringp name) (not (string-empty-p name))))
                    macro-capabilities))
        (eliscript-project--configuration-fail
         canonical "macroCapabilities must be an array of non-empty strings"))
      (unless (= (length macro-capabilities)
                 (length (delete-dups (copy-sequence macro-capabilities))))
        (eliscript-project--configuration-fail
         canonical "macroCapabilities must not contain duplicates"))
      (let ((unsupported
             (cl-find-if
              (lambda (name)
                (not (member name eliscript-project--macro-capabilities)))
              macro-capabilities)))
        (when unsupported
          (eliscript-project--configuration-fail
           canonical "unsupported macro capability: %s" unsupported)))
      (unless (and (listp macro-file-dependencies)
                   (cl-every #'eliscript-project--safe-relative-path-p
                             macro-file-dependencies))
        (eliscript-project--configuration-fail
         canonical
         "macroFileDependencies must contain only contained relative paths"))
      (unless (= (length macro-file-dependencies)
                 (length
                  (delete-dups (copy-sequence macro-file-dependencies))))
        (eliscript-project--configuration-fail
         canonical "macroFileDependencies must not contain duplicates"))
      (when (and macro-file-dependencies
                 (not (member "read-file" macro-capabilities)))
        (eliscript-project--configuration-fail
         canonical
         "macroFileDependencies require the read-file macro capability"))
      (unless (memq cache '(t :false))
        (eliscript-project--configuration-fail
         canonical "cache must be a boolean"))
      (when (equal version eliscript-project-configuration-multi-version)
        (unless (and (listp entries) entries
                     (cl-every #'eliscript-project--safe-relative-path-p
                               entries))
          (eliscript-project--configuration-fail
           canonical
           "entries must be an array of contained relative paths"))
        (unless (= (length entries)
                   (length (delete-dups (copy-sequence entries))))
          (eliscript-project--configuration-fail
           canonical "entries must not contain duplicates"))
        (when (and (> (length entries) 1) portable-entries)
          (eliscript-project--configuration-fail
           canonical
           "multi-entry portable project configurations are not supported")))
      (let* ((root
              (eliscript-project--configuration-path
               canonical directory 'sourceRoot source-root))
             (entry-paths
              (if (equal version
                         eliscript-project-configuration-multi-version)
                  (sort
                   (mapcar
                    (lambda (source)
                      (eliscript-project--configuration-path
                       canonical root 'entries source))
                    entries)
                   #'string-lessp)
                (list
                 (eliscript-project--configuration-path
                  canonical root 'entry entry))))
             (output-path
              (eliscript-project--configuration-path
               canonical directory 'outDir out-dir)))
        (eliscript-project-request-create
         :entry (and (= (length entry-paths) 1) (car entry-paths))
         :entries (and (equal version
                              eliscript-project-configuration-multi-version)
                       entry-paths)
         :out-dir output-path
         :root root
         :portable-entries portable-entries
         :macro-capabilities (sort macro-capabilities #'string-lessp)
         :macro-file-dependencies
         (sort macro-file-dependencies #'string-lessp)
         :use-cache (eq cache t)
         :configuration canonical)))))

(defun eliscript-project-execute (request)
  "Execute validated project build REQUEST through the shared operation."
  (unless (eliscript-project-request-p request)
    (eliscript-project--fail nil nil "project request is invalid"))
  (let* ((entry (eliscript-project-request-entry request))
         (requested-entries (eliscript-project-request-entries request))
         (entries (or requested-entries (and entry (list entry))))
         (out-dir (eliscript-project-request-out-dir request))
         (root (eliscript-project-request-root request))
         (portable-entries
          (eliscript-project-request-portable-entries request))
         (macro-capabilities
          (eliscript-project-request-macro-capabilities request))
         (macro-file-dependencies
          (eliscript-project-request-macro-file-dependencies request))
         (eliscript-project-use-cache
          (eliscript-project-request-use-cache request)))
    (unless (and entries
                 (cl-every
                  (lambda (source)
                    (and (stringp source) (not (string-empty-p source))))
                  entries)
                 (= (length entries)
                    (length (delete-dups (copy-sequence entries)))))
      (eliscript-project--fail nil nil "project request entries are invalid"))
    (unless (and (stringp out-dir) (not (string-empty-p out-dir)))
      (eliscript-project--fail (car entries) nil
                               "project request output is invalid"))
    (unless (or (null root) (stringp root))
      (eliscript-project--fail (car entries) nil
                               "project request root is invalid"))
    (unless (and (listp portable-entries)
                 (cl-every
                  (lambda (name)
                    (or (symbolp name)
                        (and (stringp name) (not (string-empty-p name)))))
                  portable-entries))
      (eliscript-project--fail
       (car entries) nil "project request portable entries are invalid"))
    (when (and (> (length entries) 1) portable-entries)
      (eliscript-project--fail
       (car entries) nil
       "multi-entry portable project requests are not supported"))
    (unless (and (listp macro-capabilities)
                 (cl-every
                  (lambda (name)
                    (member name eliscript-project--macro-capabilities))
                  macro-capabilities))
      (eliscript-project--fail
       (car entries) nil "project request macro capabilities are invalid"))
    (unless (= (length macro-capabilities)
               (length (delete-dups (copy-sequence macro-capabilities))))
      (eliscript-project--fail
       (car entries) nil
       "project request macro capabilities must not contain duplicates"))
    (unless (and (listp macro-file-dependencies)
                 (cl-every #'eliscript-project--safe-relative-path-p
                           macro-file-dependencies))
      (eliscript-project--fail
       (car entries) nil "project request macro file dependencies are invalid"))
    (unless (= (length macro-file-dependencies)
               (length
                (delete-dups (copy-sequence macro-file-dependencies))))
      (eliscript-project--fail
       (car entries) nil
       "project request macro file dependencies must not contain duplicates"))
    (when (and macro-file-dependencies
               (not (member "read-file" macro-capabilities)))
      (eliscript-project--fail
       (car entries) nil
       "macro file dependencies require the read-file macro capability"))
    (setq macro-capabilities
          (sort (copy-sequence macro-capabilities) #'string-lessp)
          macro-file-dependencies
          (sort (copy-sequence macro-file-dependencies) #'string-lessp))
    (if portable-entries
        (eliscript-project-build-portable
         (car entries) portable-entries out-dir root
         macro-capabilities macro-file-dependencies)
      (eliscript-project--build-many
       entries out-dir root macro-capabilities macro-file-dependencies))))

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

(defun eliscript-project--macro-dependencies (specifiers root filename)
  "Resolve declared macro file SPECIFIERS below ROOT for FILENAME."
  (let ((dependencies
         (mapcar
          (lambda (specifier)
            (let ((expanded (expand-file-name specifier root)))
              (unless (file-regular-p expanded)
                (eliscript-project--fail
                 filename nil
                 "macro file dependency does not exist: %s" specifier))
              (let ((source (file-truename expanded)))
                (unless (file-in-directory-p source root)
                  (eliscript-project--fail
                   filename nil
                   "macro file dependency escapes project root: %s" specifier))
                (let ((snapshot
                       (eliscript-project--read-utf8-input source specifier)))
                  (eliscript-project-macro-dependency-create
                   :specifier specifier
                   :source source
                   :digest (car snapshot)
                   :content (cdr snapshot))))))
          specifiers)))
    (unless (= (length dependencies)
               (length
                (delete-dups
                 (mapcar #'eliscript-project-macro-dependency-source
                         dependencies))))
      (eliscript-project--fail
       filename nil "macro file dependencies resolve to duplicates"))
    dependencies))

(defun eliscript-project--read-utf8-input (filename specifier)
  "Return FILENAME's SHA-256 digest and UTF-8 text for macro SPECIFIER."
  (let (bytes decoded)
    (with-temp-buffer
      (set-buffer-multibyte nil)
      (insert-file-contents-literally filename)
      (setq bytes (buffer-string)))
    (setq decoded (decode-coding-string bytes 'utf-8-unix))
    (unless (and (not (cl-some (lambda (character)
                                (> character #x10ffff))
                              decoded))
                 (equal bytes
                        (encode-coding-string decoded 'utf-8-unix t)))
      (eliscript-project--fail
       filename nil "macro file dependency is not valid UTF-8: %s" specifier))
    (cons (secure-hash 'sha256 bytes) decoded)))

(defun eliscript-project--macro-context (capabilities dependencies)
  "Create a compiler macro context from CAPABILITIES and DEPENDENCIES."
  (let ((capability-table (make-hash-table :test #'equal))
        (file-table (make-hash-table :test #'equal)))
    (dolist (capability capabilities)
      (puthash capability t capability-table))
    (dolist (dependency dependencies)
      (puthash
       (eliscript-project-macro-dependency-specifier dependency)
       (eliscript-project-macro-dependency-content dependency)
       file-table))
    (list :capabilities capability-table :files file-table)))

(defun eliscript-project--macro-dependency-records (dependencies root)
  "Return stable manifest records for macro DEPENDENCIES below ROOT."
  (vconcat
   (mapcar
    (lambda (dependency)
      `((path . ,(file-relative-name
                  (eliscript-project-macro-dependency-source dependency) root))
        (digest . ,(eliscript-project-macro-dependency-digest dependency))))
    dependencies)))

(defun eliscript-project--source-output (source root out-dir)
  "Map Eliscript SOURCE below ROOT into its ESM path below OUT-DIR."
  (let ((relative (file-relative-name source root)))
    (expand-file-name
     (concat (string-remove-suffix ".eli" relative) ".mjs")
     out-dir)))

(defun eliscript-project--same-file-path-p (left right)
  "Return non-nil when LEFT and RIGHT name the same physical file."
  (or (string-equal (file-truename left) (file-truename right))
      (and (file-exists-p left)
           (file-exists-p right)
           (condition-case nil
             (file-equal-p left right)
             (file-error nil)))))

(defun eliscript-project--path-contained-p (root candidate)
  "Return non-nil when CANDIDATE is lexically contained below canonical ROOT."
  (let ((relative
         (file-relative-name candidate (file-name-as-directory root))))
    (and (not (file-name-absolute-p relative))
         (not (string-equal relative ".."))
         (not (string-prefix-p (file-name-as-directory "..") relative)))))

(defun eliscript-project--validate-output-isolation
    (sources macro-dependencies root out-dir)
  "Validate every generated path before writing SOURCES below OUT-DIR.

MACRO-DEPENDENCIES and SOURCES are protected inputs.  ROOT maps source paths
to output paths.  Existing symbolic and hard links cannot redirect generated
artifacts onto an input, another artifact, or outside OUT-DIR."
  (let* ((protected
          (append
           sources
           (mapcar #'eliscript-project-macro-dependency-source
                   macro-dependencies)))
         (artifacts
          (append
           (apply
            #'append
            (mapcar
             (lambda (source)
               (let ((output
                      (eliscript-project--source-output
                       source root out-dir)))
                 (list output (concat output ".map"))))
             sources))
           (list (expand-file-name
                  eliscript-project-manifest-filename out-dir))))
         validated)
    (dolist (artifact artifacts)
      (let ((physical
             (condition-case nil
                 (file-truename artifact)
               (file-error
                (eliscript-project--fail
                 artifact nil
                 "generated artifact path cannot be resolved: %s"
                 artifact)))))
        (unless (eliscript-project--path-contained-p out-dir physical)
          (eliscript-project--fail
           artifact nil "generated artifact escapes output directory: %s"
           artifact))
        (when (cl-some
               (lambda (input)
                 (eliscript-project--same-file-path-p artifact input))
               protected)
          (eliscript-project--fail
           artifact nil "generated artifact would overwrite an input: %s"
           artifact))
        (when (cl-some
               (lambda (previous)
                 (eliscript-project--same-file-path-p artifact previous))
               validated)
          (eliscript-project--fail
           artifact nil "generated artifacts resolve to the same file: %s"
           artifact))
        (push artifact validated)))))

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
    ,@(when (eliscript-project-module-macro-dependencies module)
        `((macroDependencies
           . ,(eliscript-project--macro-dependency-records
               (eliscript-project-module-macro-dependencies module) root))))
    (portableEntries
     . ,(vconcat
         (or (eliscript-project-module-portable-entries module) nil)))))

(defun eliscript-project--cache-identity-module (record)
  "Normalize parsed cache RECORD for deterministic digest verification."
  `((source . ,(alist-get 'source record))
    (dependencies . ,(vconcat (alist-get 'dependencies record)))
    ,@(when (assq 'macroDependencies record)
        `((macroDependencies
           . ,(vconcat (alist-get 'macroDependencies record)))))
    (portableEntries . ,(vconcat (alist-get 'portableEntries record)))))

(defun eliscript-project--manifest-identity-module (record)
  "Normalize parsed public manifest RECORD for digest verification."
  (mapcar
   (lambda (entry)
     (if (eq (car entry) 'macroDependencies)
         (cons 'macroDependencies (vconcat (cdr entry)))
       entry))
   record))

(defun eliscript-project--cache-version-kind (cache)
  "Return the supported version kind of CACHE, or nil."
  (cond
   ((and (equal (alist-get 'format cache) eliscript-project-cache-format)
         (equal (alist-get 'version cache) eliscript-project-cache-version))
    'current)
   ((and (null (alist-get 'format cache))
         (equal (alist-get 'version cache)
                eliscript-project-cache-legacy-version))
    'legacy)))

(defun eliscript-project--cache-identity (cache cache-modules version-kind)
  "Normalize CACHE and CACHE-MODULES for VERSION-KIND digest verification."
  (let ((identity
         `((version . ,(alist-get 'version cache))
           (compilerDigest . ,(alist-get 'compilerDigest cache))
           (mode . ,(alist-get 'mode cache))
           (portableEntries . ,(vconcat (alist-get 'portableEntries cache)))
           (modules
            . ,(vconcat
                (mapcar
                 #'eliscript-project--cache-identity-module
                 cache-modules))))))
    (if (eq version-kind 'current)
        (cons `(format . ,(alist-get 'format cache)) identity)
      identity)))

(defun eliscript-project--cache-miss (reason)
  "Return a cache lookup miss with stable REASON."
  (eliscript-project-cache-lookup-create :reason reason))

(defun eliscript-project--read-cache
    (out-dir entry-outputs mode portable-entries compiler-digest)
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
                 (cache-version-kind
                  (and (consp cache)
                       (eliscript-project--cache-version-kind cache)))
                 (expected-entries
                  (mapcar
                   (lambda (entry-output)
                     (file-relative-name entry-output out-dir))
                   entry-outputs)))
            (cond
             ((or (not (equal (alist-get 'format manifest)
                              "eliscript-project"))
                  (not (memq (alist-get 'version manifest) '(1 2)))
                  (not (listp identity-modules)))
              (eliscript-project--cache-miss "manifest-version-changed"))
             ((and (equal (alist-get 'version manifest) 1)
                   (not (equal (list (alist-get 'entry manifest))
                               expected-entries)))
              (eliscript-project--cache-miss "entry-changed"))
             ((and (equal (alist-get 'version manifest) 2)
                   (not (equal (alist-get 'entries manifest)
                               expected-entries)))
              (eliscript-project--cache-miss "entries-changed"))
             ((let ((graph-identity
                     (if (equal (alist-get 'version manifest) 1)
                         `((format . ,(alist-get 'format manifest))
                           (version . 1)
                           (entry . ,(alist-get 'entry manifest))
                           (modules
                            . ,(vconcat
                                (mapcar
                                 #'eliscript-project--manifest-identity-module
                                 identity-modules))))
                       `((format . ,(alist-get 'format manifest))
                         (version . 2)
                         (entries . ,(vconcat (alist-get 'entries manifest)))
                         (modules
                          . ,(vconcat
                              (mapcar
                               #'eliscript-project--manifest-identity-module
                               identity-modules)))))))
                (not (equal (alist-get 'digest manifest)
                            (eliscript-project--json-digest graph-identity))))
              (eliscript-project--cache-miss "graph-digest-invalid"))
             ((not (consp cache))
              (eliscript-project--cache-miss "cache-missing"))
             ((not cache-version-kind)
              (eliscript-project--cache-miss "cache-version-changed"))
             ((not (listp cache-modules))
              (eliscript-project--cache-miss "cache-records-invalid"))
             ((let ((cache-identity
                     (eliscript-project--cache-identity
                      cache cache-modules cache-version-kind)))
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
                      :digest (alist-get 'digest manifest)
                      :source-version (alist-get 'version cache))
                     :reason "verified")
                  (eliscript-project--cache-miss
                   "cache-records-invalid"))))))
        (error
         (eliscript-project--cache-miss "manifest-unreadable")))))))

(defun eliscript-project--cache-decision
    (source root out-dir cache
            &optional expected-portable-entries expected-macro-dependencies)
  "Return the cache decision for SOURCE.

EXPECTED-PORTABLE-ENTRIES is a sorted string list. The symbol `any' accepts
the entries recorded by CACHE for complete-graph reuse.  Macro dependencies
must match their current project-relative paths and content digests."
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
               (macro-dependency-records
                (append (alist-get 'macroDependencies metadata) nil))
               (expected-macro-records
                (append
                 (eliscript-project--macro-dependency-records
                  expected-macro-dependencies root)
                 nil))
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
                 ((not (equal macro-dependency-records
                              expected-macro-records))
                  "macro-dependencies-changed")
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
                    :macro-dependencies expected-macro-dependencies
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
    (root out-dir entries cache mode portable-entries macro-dependencies
          started-at cache-read-ms)
  "Return a fully reused result for ENTRIES from CACHE, or nil.

STARTED-AT and CACHE-READ-MS provide the complete build timing boundary."
  (when (and cache
             (= (eliscript-project-cache-source-version cache)
                eliscript-project-cache-version))
    (let (modules valid)
      (setq valid t)
      (dolist (relative (eliscript-project-cache-sources cache))
        (let* ((source (expand-file-name relative root))
               (decision
                (and (file-regular-p source)
                     (eliscript-project--cache-decision
                      (file-truename source) root out-dir cache 'any
                      macro-dependencies)))
               (module
                (and decision
                     (eliscript-project-cache-decision-module decision))))
          (if module
              (push module modules)
            (setq valid nil))))
      (when (and valid
                 (cl-every
                  (lambda (entry)
                    (cl-find entry modules
                             :key #'eliscript-project-module-source
                             :test #'equal))
                  entries))
        (setq modules
              (sort modules
                    (lambda (left right)
                      (string-lessp
                       (eliscript-project-module-source left)
                       (eliscript-project-module-source right)))))
        (let* ((total-ms (eliscript-project--elapsed-ms started-at))
               (work-ms (max 0.0 (- total-ms cache-read-ms))))
          (eliscript-project-build-result-create
           :root root
           :out-dir out-dir
           :entry (and (= (length entries) 1) (car entries))
           :entry-output
           (and (= (length entries) 1)
                (eliscript-project--source-output (car entries) root out-dir))
           :entries entries
           :entry-outputs
           (mapcar
            (lambda (entry)
              (eliscript-project--source-output entry root out-dir))
            entries)
           :modules modules
           :manifest (eliscript-project-cache-manifest cache)
           :digest (eliscript-project-cache-digest cache)
           :compiled-count 0
           :reused-count (length modules)
           :mode mode
           :portable-entries portable-entries
           :cache-enabled t
           :cache-status "hit"
           :cache-reason "verified"
           :cache-read-ms cache-read-ms
           :work-ms work-ms
           :manifest-write-ms 0.0
           :total-ms total-ms))))))

(defun eliscript-project--write-module
    (program source source-text output-path dependencies macro-dependencies
             portable-entries reason)
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
     :macro-dependencies macro-dependencies
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
     . ,(eliscript-project-module-source-map-digest module))
    ,@(when (eliscript-project-module-macro-dependencies module)
        `((macroDependencies
           . ,(eliscript-project--macro-dependency-records
               (eliscript-project-module-macro-dependencies module) root))))))

(defun eliscript-project--write-manifest
    (root out-dir entry-outputs modules mode portable-entries compiler-digest)
  "Write and return (PATH DIGEST) for the build rooted at ENTRY-OUTPUTS.

ROOT and OUT-DIR provide stable relative namespaces for MODULES."
  (let* ((records
          (vconcat
           (mapcar
            (lambda (module)
              (eliscript-project--manifest-module module root out-dir))
            modules)))
         (relative-entries
          (mapcar
           (lambda (entry-output)
             (file-relative-name entry-output out-dir))
           entry-outputs))
         (identity
          (if (= (length relative-entries) 1)
              `((format . "eliscript-project")
                (version . 1)
                (entry . ,(car relative-entries))
                (modules . ,records))
            `((format . "eliscript-project")
              (version . 2)
              (entries . ,(vconcat relative-entries))
              (modules . ,records))))
         (digest (eliscript-project--json-digest identity))
         (manifest-path
          (expand-file-name eliscript-project-manifest-filename out-dir))
         (cache-identity
          `((format . ,eliscript-project-cache-format)
            (version . ,eliscript-project-cache-version)
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
    (root out-dir entries modules mode portable-entries compiler-digest
          cache-lookup started-at cache-read-ms)
  "Create a complete project build result for ENTRIES and MODULES.

STARTED-AT and CACHE-READ-MS provide the complete build timing boundary."
  (let* ((entry-outputs
          (mapcar
           (lambda (entry)
             (eliscript-project--source-output entry root out-dir))
           entries))
         (manifest-started-at (float-time))
         (manifest-data
          (eliscript-project--write-manifest
           root out-dir entry-outputs modules mode portable-entries
           compiler-digest))
         (manifest-write-ms
          (eliscript-project--elapsed-ms manifest-started-at))
         (total-ms (eliscript-project--elapsed-ms started-at))
         (work-ms
          (max 0.0 (- total-ms cache-read-ms manifest-write-ms)))
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
     :entry (and (= (length entries) 1) (car entries))
     :entry-output (and (= (length entries) 1) (car entry-outputs))
     :entries entries
     :entry-outputs entry-outputs
     :modules modules
     :manifest (car manifest-data)
     :digest (cadr manifest-data)
     :compiled-count compiled-count
     :reused-count reused-count
     :mode mode
     :portable-entries portable-entries
     :cache-enabled cache-enabled
     :cache-status cache-status
     :cache-reason cache-reason
     :cache-read-ms cache-read-ms
     :work-ms work-ms
     :manifest-write-ms manifest-write-ms
     :total-ms total-ms)))

(defun eliscript-project-build-report (result)
  "Return a stable JSON-compatible report for project build RESULT."
  (unless (eliscript-project-build-result-p result)
    (signal 'wrong-type-argument
            (list 'eliscript-project-build-result-p result)))
  (let* ((root (eliscript-project-build-result-root result))
         (out-dir (eliscript-project-build-result-out-dir result))
         (entries (eliscript-project-build-result-entries result))
         (entry-outputs (eliscript-project-build-result-entry-outputs result))
         (multi (> (length entries) 1)))
    `((format . "eliscript-build-report")
      (version
       . ,(if multi
              eliscript-project-build-report-multi-version
            eliscript-project-build-report-version))
      (mode . ,(eliscript-project-build-result-mode result))
      (root . ,(directory-file-name root))
      (outDir . ,(directory-file-name out-dir))
      ,@(if multi
            `((entries
               . ,(vconcat
                   (mapcar (lambda (entry)
                             (file-relative-name entry root))
                           entries)))
              (entryOutputs
               . ,(vconcat
                   (mapcar (lambda (entry-output)
                             (file-relative-name entry-output out-dir))
                           entry-outputs))))
          `((entry
             . ,(file-relative-name
                 (eliscript-project-build-result-entry result) root))
            (entryOutput
             . ,(file-relative-name
                 (eliscript-project-build-result-entry-output result)
                 out-dir))))
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
      (timings
       . ((cacheReadMs
           . ,(eliscript-project--report-ms
               (eliscript-project-build-result-cache-read-ms result)))
          (workMs
           . ,(eliscript-project--report-ms
               (eliscript-project-build-result-work-ms result)))
          (manifestWriteMs
           . ,(eliscript-project--report-ms
               (eliscript-project-build-result-manifest-write-ms result)))
          (totalMs
           . ,(eliscript-project--report-ms
               (eliscript-project-build-result-total-ms result)))))
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
                ,@(when (eliscript-project-module-macro-dependencies module)
                    `((macroDependencies
                       . ,(eliscript-project--macro-dependency-records
                           (eliscript-project-module-macro-dependencies module)
                           root))))
                (portableEntries
                 . ,(vconcat
                     (or (eliscript-project-module-portable-entries module)
                         nil)))))
            (eliscript-project-build-result-modules result)))))))

(defun eliscript-project-build (entry out-dir &optional root)
  "Compile the local Eliscript graph rooted at ENTRY into OUT-DIR."
  (eliscript-project--build-many (list entry) out-dir root))

(defun eliscript-project--build-many
    (entries out-dir &optional root macro-capabilities macro-file-dependencies)
  "Compile local Eliscript graphs rooted at ENTRIES into OUT-DIR.

ROOT defaults to the only entry's directory.  Relative `.eli' imports are
recursively compiled, remain within ROOT, preserve their source directory
structure, and are rewritten to `.mjs'.  Other import specifiers remain
unchanged."
  (unless (and entries
               (cl-every
                (lambda (entry)
                  (and (stringp entry) (not (string-empty-p entry))))
                entries))
    (eliscript-project--fail nil nil "project entries are invalid"))
  (when (and (> (length entries) 1) (null root))
    (eliscript-project--fail
     (car entries) nil
     "multi-entry project builds require an explicit project root"))
  (let* ((started-at (float-time))
         (entry-paths (mapcar #'expand-file-name entries))
         (root-path
          (eliscript-project--canonical-directory
           (or root (file-name-directory (car entry-paths))) "project root"))
         (canonical-entries
          (sort
           (mapcar
            (lambda (entry-path)
              (eliscript-project--canonical-source
               entry-path root-path entry-path nil))
            entry-paths)
           #'string-lessp))
         (macro-dependencies
          (eliscript-project--macro-dependencies
           macro-file-dependencies root-path (car canonical-entries)))
         (macro-context
          (eliscript-project--macro-context
           macro-capabilities macro-dependencies))
         (resolved-out-dir (file-truename (expand-file-name out-dir)))
         (output-directory
          (file-name-as-directory resolved-out-dir))
         (compiler-digest (eliscript-project--compiler-digest))
         (entry-outputs
          (mapcar
           (lambda (entry)
             (eliscript-project--source-output
              entry root-path output-directory))
           canonical-entries))
         (cache-started-at (float-time))
         (cache-lookup
          (eliscript-project--read-cache
           output-directory entry-outputs "standard" nil
           compiler-digest))
         (cache-read-ms
          (eliscript-project--elapsed-ms cache-started-at))
         (cache (eliscript-project-cache-lookup-cache cache-lookup))
         (states (make-hash-table :test #'equal))
         pending-writes
         modules)
    (unless (= (length canonical-entries)
               (length (delete-dups (copy-sequence canonical-entries))))
      (eliscript-project--fail
       (car canonical-entries) nil
       "project entries resolve to duplicate sources"))
    (dolist (entry canonical-entries)
      (unless (string-suffix-p ".eli" entry)
        (eliscript-project--fail
         entry nil "entry file must use the .eli extension")))
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
                       source root-path output-directory cache nil
                       macro-dependencies))
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
                         (program
                          (eliscript-compile-ir-string
                           source-text source macro-context))
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
                     (list
                      program source source-text output-path dependencies
                      macro-dependencies nil
                      (if cache
                          (eliscript-project-cache-decision-reason decision)
			(eliscript-project-cache-lookup-reason cache-lookup)))
                     pending-writes)))
		(puthash source 'done states))))))
      (dolist (entry canonical-entries)
        (visit entry)))
    (let (sources)
      (maphash (lambda (source _state) (push source sources)) states)
      (eliscript-project--validate-output-isolation
       sources macro-dependencies root-path output-directory))
    (dolist (pending (nreverse pending-writes))
      (push (apply #'eliscript-project--write-module pending) modules))
    (setq modules
          (sort modules
                (lambda (left right)
                  (string-lessp
                   (eliscript-project-module-source left)
                   (eliscript-project-module-source right)))))
    (eliscript-project--build-result
     root-path output-directory canonical-entries modules "standard" nil
     compiler-digest cache-lookup started-at cache-read-ms)))

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

(defun eliscript-project-build-portable
    (entry entries out-dir
           &optional root macro-capabilities macro-file-dependencies)
  "Compile portable ENTRIES and their local module graph from ENTRY.

Every `import-portable' edge must name a relative `.eli' module below ROOT.
The target binding must resolve to `defportable'; each generated module contains
only the requested declarations, immutable constants, and portable imports."
  (unless entries
    (eliscript-project--fail entry nil "portable build requires an entry name"))
  (let* ((started-at (float-time))
         (entry-path (expand-file-name entry))
         (root-path
          (eliscript-project--canonical-directory
           (or root (file-name-directory entry-path)) "project root"))
         (canonical-entry
          (eliscript-project--canonical-source
           entry-path root-path entry-path nil))
         (macro-dependencies
          (eliscript-project--macro-dependencies
           macro-file-dependencies root-path canonical-entry))
         (macro-context
          (eliscript-project--macro-context
           macro-capabilities macro-dependencies))
         (resolved-out-dir (file-truename (expand-file-name out-dir)))
         (output-directory (file-name-as-directory resolved-out-dir))
         (portable-entry-names
          (eliscript-project--portable-entry-names entries))
         (compiler-digest (eliscript-project--compiler-digest))
         (entry-output
          (eliscript-project--source-output
           canonical-entry root-path output-directory))
         (cache-started-at (float-time))
         (cache-lookup
          (eliscript-project--read-cache
           output-directory (list entry-output) "portable"
           portable-entry-names compiler-digest))
         (cache-read-ms
          (eliscript-project--elapsed-ms cache-started-at))
         (cache (eliscript-project-cache-lookup-cache cache-lookup))
         (cached-result
          (eliscript-project--cached-build-result
           root-path output-directory (list canonical-entry) cache
           "portable" portable-entry-names macro-dependencies
           started-at cache-read-ms))
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
                         (forms
                          (eliscript--analyzed-string
                           text source macro-context)))
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
           (eliscript-project--validate-output-isolation
            sources macro-dependencies root-path output-directory)
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
                        source root-path output-directory cache entry-names
                        macro-dependencies))
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
                       output-path dependencies macro-dependencies entry-names
                       (if cache
                           (eliscript-project-cache-decision-reason decision)
                         (eliscript-project-cache-lookup-reason cache-lookup)))
                      modules)))))))
         (eliscript-project--build-result
          root-path output-directory (list canonical-entry) (nreverse modules)
          "portable" portable-entry-names compiler-digest
          cache-lookup started-at cache-read-ms))))))

(provide 'eliscript-project)

;;; eliscript-project.el ends here
