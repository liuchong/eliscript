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
   "Usage: eliscript [--output FILE] [--source-map] [--portable NAME]\n"
   "                  [--diagnostic-format human|json] INPUT\n\n"
   "Compile INPUT to an ECMAScript module. Write to stdout when --output "
   "is absent.\n--source-map writes FILE.map and requires --output.\n"
   "Repeat --portable to emit only those worker entries and dependencies.\n"
   "Use JSON diagnostics for editor and CI integrations.\n"))

(defun eliscript-cli--requested-diagnostic-format (arguments)
  "Return a usable diagnostic format requested by raw ARGUMENTS."
  (let ((remaining arguments)
        (format-name "human"))
    (while remaining
      (when (and (equal (car remaining) "--diagnostic-format")
                 (cdr remaining)
                 (equal (cadr remaining) "json"))
        (setq format-name "json"))
      (setq remaining (cdr remaining)))
    format-name))

(defun eliscript-cli--parse (arguments)
  "Parse ARGUMENTS into input, output, maps, portable, and diagnostic fields."
  (when (equal (car arguments) "--")
    (setq arguments (cdr arguments)))
  (let ((diagnostic-format "human")
        input output source-map portable-entries)
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
         ((equal argument "--diagnostic-format")
          (unless arguments
            (error "%s requires human or json" argument))
          (setq diagnostic-format (pop arguments))
          (unless (member diagnostic-format '("human" "json"))
            (error "unsupported diagnostic format: %s" diagnostic-format)))
         ((string-prefix-p "-" argument)
          (error "unknown option: %s" argument))
         (input (error "multiple input files are not supported yet"))
         (t (setq input argument)))))
    (unless input
      (error "missing input file"))
    (when (and source-map (null output))
      (error "--source-map requires --output"))
    (list input output source-map (nreverse portable-entries)
          diagnostic-format)))

(defun eliscript-cli-main (arguments)
  "Compile according to command-line ARGUMENTS."
  (let ((requested-format
         (eliscript-cli--requested-diagnostic-format arguments)))
    (condition-case error-data
        (pcase-let ((`(,input ,output ,source-map ,portable-entries
                              ,diagnostic-format)
                      (eliscript-cli--parse arguments)))
          (setq requested-format diagnostic-format)
          (if source-map
              (if portable-entries
                  (eliscript-compile-portable-file-with-source-map
                   input portable-entries output)
                (eliscript-compile-file-with-source-map input output))
            (let ((generated
                   (if portable-entries
                       (eliscript-compile-portable-file
                        input portable-entries output)
                     (eliscript-compile-file input output))))
              (unless output
                (princ generated)))))
      (error
       (if (equal requested-format "json")
           (message
            "%s"
            (eliscript-diagnostic-to-json
             (eliscript-diagnostic-from-error error-data)))
         (message
          "eliscript: %s"
          (eliscript-diagnostic-condition-message error-data)))
       (kill-emacs 1)))))

(eliscript-cli-main command-line-args-left)

;;; eliscript-cli.el ends here
