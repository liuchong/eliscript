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
  source-map-digest)

(cl-defstruct (eliscript-project-build-result
               (:constructor eliscript-project-build-result-create))
  root
  out-dir
  entry
  entry-output
  modules
  manifest
  digest)

(defconst eliscript-project-manifest-filename "eliscript-project.json"
  "Filename of the deterministic project build manifest.")

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

(defun eliscript-project--write-module
    (program source source-text output-path)
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
     :source-map-digest (eliscript-project--file-digest map-path))))

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

(defun eliscript-project--write-manifest (root out-dir entry-output modules)
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
         (identity-json (json-serialize identity))
         (digest
          (secure-hash
           'sha256 (encode-coding-string identity-json 'utf-8-unix t)))
         (manifest-path
          (expand-file-name eliscript-project-manifest-filename out-dir)))
    (make-directory out-dir t)
    (with-temp-file manifest-path
      (insert (json-serialize (append identity `((digest . ,digest)))) "\n"))
    (list (file-truename manifest-path) digest)))

(defun eliscript-project--build-result (root out-dir entry modules)
  "Create a complete project build result for ENTRY and MODULES."
  (let* ((entry-output (eliscript-project--source-output entry root out-dir))
         (manifest-data
          (eliscript-project--write-manifest
           root out-dir entry-output modules)))
    (eliscript-project-build-result-create
     :root root
     :out-dir out-dir
     :entry entry
     :entry-output entry-output
     :modules modules
     :manifest (car manifest-data)
     :digest (cadr manifest-data))))

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
             (let* ((source-text (eliscript-project--read-source source))
                    (program (eliscript-compile-ir-file source))
                    (output-path
                     (eliscript-project--source-output
                      source root-path output-directory))
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
                                 specifier (file-name-directory source)))
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
               (dolist (dependency
                        (sort (delete-dups dependencies) #'string-lessp))
                 (visit dependency))
               (push
                (eliscript-project--write-module
                 program source source-text output-path)
                modules)
               (puthash source 'done states))))))
      (visit canonical-entry))
    (setq modules
          (sort modules
                (lambda (left right)
                  (string-lessp
                   (eliscript-project-module-source left)
                   (eliscript-project-module-source right)))))
    (eliscript-project--build-result
     root-path output-directory canonical-entry modules)))

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
        (pcase-let* ((`(,source . ,name) (pop queue))
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
              (dolist (import (eliscript-project--portable-imports selected))
                (let ((dependency
                       (resolve-import source (nth 0 import) (nth 2 import))))
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
            (let ((program
                   (eliscript-lower-module
                    (eliscript-portable-select-module forms names source t)
                    source)))
              (eliscript-ir-walk
               program
               (lambda (node)
                 (when (eq (eliscript-ir-node-kind node) 'import-declaration)
                   (let* ((specifier (eliscript-ir-node-value node))
                          (dependency
                           (resolve-import
                            source specifier (eliscript-ir-node-span node)))
                          (dependency-output
                           (eliscript-project--source-output
                            dependency root-path output-directory)))
                     (setf (eliscript-ir-node-value node)
                           (eliscript-project--relative-import
                            dependency-output output-path))))))
              (push
               (eliscript-project--write-module
                program source (gethash source texts-by-source) output-path)
               modules)))))
    (eliscript-project--build-result
     root-path output-directory canonical-entry (nreverse modules)))))

(provide 'eliscript-project)

;;; eliscript-project.el ends here
