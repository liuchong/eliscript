;;; eliscript-org-cli.el --- Batch command for Org publishing -*- lexical-binding: t; -*-

;;; Commentary:

;; Run with:
;;   emacs --batch -Q --script tools/org/eliscript-org-cli.el -- DIRECTORY

;;; Code:

(add-to-list 'load-path
             (file-name-directory (or load-file-name buffer-file-name)))
(require 'eliscript-org)

(defconst eliscript-org-cli--usage
  (concat
   "Usage: eliscript-org [--output FILE] [--include-drafts] DIRECTORY\n\n"
   "Export Org articles under DIRECTORY as a deterministic ESM module.\n"
   "Write to stdout when --output is absent.\n"))

(defun eliscript-org-cli--parse (arguments)
  "Parse command-line ARGUMENTS as (DIRECTORY OUTPUT INCLUDE-DRAFTS)."
  (when (equal (car arguments) "--")
    (setq arguments (cdr arguments)))
  (let (directory output include-drafts)
    (while arguments
      (let ((argument (pop arguments)))
        (cond
         ((member argument '("-h" "--help"))
          (princ eliscript-org-cli--usage)
          (kill-emacs 0))
         ((member argument '("-o" "--output"))
          (unless arguments
            (error "%s requires a file" argument))
          (setq output (pop arguments)))
         ((equal argument "--include-drafts")
          (setq include-drafts t))
         ((string-prefix-p "-" argument)
          (error "unknown option: %s" argument))
         (directory
          (error "multiple content directories are not supported"))
         (t (setq directory argument)))))
    (unless directory
      (error "missing content directory"))
    (list directory output include-drafts)))

(defun eliscript-org-cli-main (arguments)
  "Publish Org content according to command-line ARGUMENTS."
  (condition-case error-data
      (pcase-let ((`(,directory ,output ,include-drafts)
                   (eliscript-org-cli--parse arguments)))
        (let ((module
               (eliscript-org-publish-directory
                directory output include-drafts)))
          (unless output
            (princ module))))
    (error
     (message "eliscript-org: %s" (error-message-string error-data))
     (kill-emacs 1))))

(eliscript-org-cli-main command-line-args-left)

;;; eliscript-org-cli.el ends here
