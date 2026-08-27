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
   "Usage: eliscript [--output FILE] [--source-map] [--portable NAME] INPUT\n\n"
   "Compile INPUT to an ECMAScript module. Write to stdout when --output "
   "is absent.\n--source-map writes FILE.map and requires --output.\n"
   "Repeat --portable to emit only those worker entries and dependencies.\n"))

(defun eliscript-cli--parse (arguments)
  "Parse ARGUMENTS and return (INPUT OUTPUT SOURCE-MAP PORTABLE-ENTRIES)."
  (when (equal (car arguments) "--")
    (setq arguments (cdr arguments)))
  (let (input output source-map portable-entries)
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
         ((equal argument "--portable")
          (unless arguments
            (error "%s requires a function name" argument))
          (push (pop arguments) portable-entries))
         ((string-prefix-p "-" argument)
          (error "unknown option: %s" argument))
         (input (error "multiple input files are not supported yet"))
         (t (setq input argument)))))
    (unless input
      (error "missing input file"))
    (when (and source-map (null output))
      (error "--source-map requires --output"))
    (when (and source-map portable-entries)
      (error "--source-map is not supported with --portable yet"))
    (list input output source-map (nreverse portable-entries))))

(defun eliscript-cli-main (arguments)
  "Compile according to command-line ARGUMENTS."
  (condition-case error-data
      (pcase-let ((`(,input ,output ,source-map ,portable-entries)
                   (eliscript-cli--parse arguments)))
        (if source-map
            (eliscript-compile-file-with-source-map input output)
          (let ((generated
                 (if portable-entries
                     (eliscript-compile-portable-file
                      input portable-entries output)
                   (eliscript-compile-file input output))))
            (unless output
              (princ generated)))))
    (error
     (message "eliscript: %s" (error-message-string error-data))
     (kill-emacs 1))))

(eliscript-cli-main command-line-args-left)

;;; eliscript-cli.el ends here
