;;; eliscript-cli.el --- Batch command for Eliscript -*- lexical-binding: t; -*-

;;; Commentary:

;; Run with:
;;   emacs --batch -Q -L compiler --script compiler/eliscript-cli.el -- FILE

;;; Code:

(add-to-list 'load-path
             (file-name-directory (or load-file-name buffer-file-name)))
(require 'eliscript)

(defconst eliscript-cli--usage
  "Usage: eliscript [--output FILE] INPUT\n\nCompile INPUT to an ECMAScript module. Write to stdout when --output is absent.\n")

(defun eliscript-cli--parse (arguments)
  "Parse command line ARGUMENTS and return (INPUT OUTPUT)."
  (when (equal (car arguments) "--")
    (setq arguments (cdr arguments)))
  (let (input output)
    (while arguments
      (let ((argument (pop arguments)))
        (cond
         ((member argument '("-h" "--help"))
          (princ eliscript-cli--usage)
          (kill-emacs 0))
         ((member argument '("-o" "--output"))
          (unless arguments
            (error "%s requires a file" argument))
          (setq output (pop arguments)))
         ((string-prefix-p "-" argument)
          (error "unknown option: %s" argument))
         (input (error "multiple input files are not supported yet"))
         (t (setq input argument)))))
    (unless input
      (error "missing input file"))
    (list input output)))

(defun eliscript-cli-main (arguments)
  "Compile according to command-line ARGUMENTS."
  (condition-case error-data
      (pcase-let ((`(,input ,output) (eliscript-cli--parse arguments)))
        (let ((generated (eliscript-compile-file input output)))
          (unless output
            (princ generated))))
    (error
     (message "eliscript: %s" (error-message-string error-data))
     (kill-emacs 1))))

(eliscript-cli-main command-line-args-left)

;;; eliscript-cli.el ends here
