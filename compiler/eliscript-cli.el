;;; eliscript-cli.el --- Batch command for Eliscript -*- lexical-binding: t; -*-

;;; Commentary:

;; Run with:
;;   emacs --batch -Q -L compiler --script compiler/eliscript-cli.el -- FILE

;;; Code:

(add-to-list 'load-path
             (file-name-directory (or load-file-name buffer-file-name)))
(require 'eliscript)

(defconst eliscript-cli--usage
  (concat
   "Usage: eliscript [--output FILE] [--source-map] INPUT\n\n"
   "Compile INPUT to an ECMAScript module. Write to stdout when --output "
   "is absent.\n--source-map writes FILE.map and requires --output.\n"))

(defun eliscript-cli--parse (arguments)
  "Parse command line ARGUMENTS and return (INPUT OUTPUT SOURCE-MAP)."
  (when (equal (car arguments) "--")
    (setq arguments (cdr arguments)))
  (let (input output source-map)
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
         ((equal argument "--source-map")
          (setq source-map t))
         ((string-prefix-p "-" argument)
          (error "unknown option: %s" argument))
         (input (error "multiple input files are not supported yet"))
         (t (setq input argument)))))
    (unless input
      (error "missing input file"))
    (when (and source-map (null output))
      (error "--source-map requires --output"))
    (list input output source-map)))

(defun eliscript-cli-main (arguments)
  "Compile according to command-line ARGUMENTS."
  (condition-case error-data
      (pcase-let ((`(,input ,output ,source-map)
                   (eliscript-cli--parse arguments)))
        (if source-map
            (eliscript-compile-file-with-source-map input output)
          (let ((generated (eliscript-compile-file input output)))
            (unless output
              (princ generated)))))
    (error
     (message "eliscript: %s" (error-message-string error-data))
     (kill-emacs 1))))

(eliscript-cli-main command-line-args-left)

;;; eliscript-cli.el ends here
