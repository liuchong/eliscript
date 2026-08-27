;;; eliscript-project-cli.el --- Batch project builder -*- lexical-binding: t; -*-

;;; Commentary:

;; Run with:
;;   emacs --batch -Q --script compiler/eliscript-project-cli.el -- ENTRY --out-dir DIR

;;; Code:

(add-to-list 'load-path
             (file-name-directory (or load-file-name buffer-file-name)))
(require 'eliscript-project)

(defconst eliscript-project-cli--usage
  (concat
   "Usage: eliscript-build [--root DIR] [--portable NAME] [--no-cache] [--json] --out-dir DIR ENTRY\n\n"
   "Compile ENTRY and its relative .eli imports into an ESM directory tree.\n"
   "Write eliscript-project.json with deterministic graph content digests.\n"
   "Reuse verified modules by default; --no-cache forces complete compilation.\n"
   "Use --json for a machine-readable build decision report on stdout.\n"
   "Repeat --portable to emit a verified, dependency-pruned portable graph.\n"))

(defun eliscript-project-cli--parse (arguments)
  "Parse ARGUMENTS into entry, output, root, portable, cache, and JSON fields."
  (when (equal (car arguments) "--")
    (setq arguments (cdr arguments)))
  (let ((use-cache t)
        (json-report nil)
        entry out-dir root portable-entries)
    (while arguments
      (let ((argument (pop arguments)))
        (cond
         ((member argument '("-h" "--help"))
          (princ eliscript-project-cli--usage)
          (kill-emacs 0))
         ((equal argument "--out-dir")
          (unless arguments
            (error "%s requires a directory" argument))
          (setq out-dir (pop arguments)))
         ((equal argument "--root")
          (unless arguments
            (error "%s requires a directory" argument))
          (setq root (pop arguments)))
         ((equal argument "--portable")
          (unless arguments
            (error "%s requires an entry name" argument))
          (push (pop arguments) portable-entries))
         ((equal argument "--no-cache")
          (setq use-cache nil))
         ((equal argument "--json")
          (setq json-report t))
         ((string-prefix-p "-" argument)
          (error "unknown option: %s" argument))
         (entry (error "multiple entry files are not supported"))
         (t (setq entry argument)))))
    (unless entry
      (error "missing entry file"))
    (unless out-dir
      (error "missing --out-dir"))
    (list entry out-dir root (nreverse portable-entries)
          use-cache json-report)))

(defun eliscript-project-cli-main (arguments)
  "Build an Eliscript project according to command-line ARGUMENTS."
  (condition-case error-data
      (pcase-let ((`(,entry ,out-dir ,root ,portable-entries
			    ,use-cache ,json-report)
                   (eliscript-project-cli--parse arguments)))
        (let* ((eliscript-project-use-cache use-cache)
               (result
                (if portable-entries
                    (eliscript-project-build-portable
                     entry portable-entries out-dir root)
                  (eliscript-project-build entry out-dir root))))
          (princ
           (if json-report
               (json-serialize
                (eliscript-project-build-report result)
                :false-object :false)
             (eliscript-project-build-result-entry-output result)))
          (princ "\n")))
    (error
     (message "eliscript-build: %s" (error-message-string error-data))
     (kill-emacs 1))))

(eliscript-project-cli-main command-line-args-left)

;;; eliscript-project-cli.el ends here
