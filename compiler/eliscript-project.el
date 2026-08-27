;;; eliscript-project.el --- Multi-file project builds -*- lexical-binding: t; -*-

;;; Commentary:

;; Compile a graph of local Eliscript modules into an equivalent ESM tree.
;; Dependency discovery happens on expanded IR so generated imports participate
;; in the same build as imports written directly in source.

;;; Code:

(require 'cl-lib)
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
  source-map)

(cl-defstruct (eliscript-project-build-result
               (:constructor eliscript-project-build-result-create))
  root
  out-dir
  entry
  entry-output
  modules)

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
     :source-map map-path)))

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
    (eliscript-project-build-result-create
     :root root-path
     :out-dir output-directory
     :entry canonical-entry
     :entry-output
     (eliscript-project--source-output
      canonical-entry root-path output-directory)
     :modules modules)))

(provide 'eliscript-project)

;;; eliscript-project.el ends here
