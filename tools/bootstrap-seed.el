;;; bootstrap-seed.el --- Seed compiler modules in one process -*- lexical-binding: t; -*-

;;; Commentary:
;; This private build entry uses the same file compiler as the seed CLI.
;; Outputs remain independent modules with their original source maps.

;;; Code:

(eval-and-compile
  (let ((source (or load-file-name buffer-file-name
                    (and (boundp 'byte-compile-current-file)
                         (symbol-value 'byte-compile-current-file)))))
    (when source
      (add-to-list 'load-path
                   (expand-file-name "../compiler"
                                     (file-name-directory source))))))
(require 'eliscript)

(defun eliscript-bootstrap-seed-main (arguments)
  "Compile the compiler modules named by ARGUMENTS using the normal seed API."
  (when (equal (car arguments) "--")
    (setq arguments (cdr arguments)))
  (let ((root (pop arguments))
        (output (pop arguments)))
    (unless (and root output arguments)
      (error "bootstrap seed requires project, output and module names"))
    (dolist (name arguments)
      (unless (string-match-p "\\`[a-z][a-z-]*\\'" name)
        (error "invalid bootstrap module name: %s" name))
      (eliscript-compile-file-with-source-map
       (expand-file-name (concat "bootstrap/compiler/" name ".eli") root)
       (expand-file-name (concat name ".mjs") output)))))

(let ((arguments command-line-args-left))
  (setq command-line-args-left nil)
  (condition-case error-data
      (eliscript-bootstrap-seed-main arguments)
    (error
     (message "eliscript: %s"
              (eliscript-diagnostic-condition-message error-data))
     (kill-emacs 1))))

;;; bootstrap-seed.el ends here
