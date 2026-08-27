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
   "Usage: eliscript-build [--root DIR] --out-dir DIR ENTRY\n\n"
   "Compile ENTRY and its relative .eli imports into an ESM directory tree.\n"))

(defun eliscript-project-cli--parse (arguments)
  "Parse ARGUMENTS and return (ENTRY OUT-DIR ROOT)."
  (when (equal (car arguments) "--")
    (setq arguments (cdr arguments)))
  (let (entry out-dir root)
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
         ((string-prefix-p "-" argument)
          (error "unknown option: %s" argument))
         (entry (error "multiple entry files are not supported"))
         (t (setq entry argument)))))
    (unless entry
      (error "missing entry file"))
    (unless out-dir
      (error "missing --out-dir"))
    (list entry out-dir root)))

(defun eliscript-project-cli-main (arguments)
  "Build an Eliscript project according to command-line ARGUMENTS."
  (condition-case error-data
      (pcase-let ((`(,entry ,out-dir ,root)
                   (eliscript-project-cli--parse arguments)))
        (let ((result (eliscript-project-build entry out-dir root)))
          (princ (eliscript-project-build-result-entry-output result))
          (princ "\n")))
    (error
     (message "eliscript-build: %s" (error-message-string error-data))
     (kill-emacs 1))))

(eliscript-project-cli-main command-line-args-left)

;;; eliscript-project-cli.el ends here
