;;; eliscript.el --- Eliscript seed compiler -*- lexical-binding: t; -*-

;;; Commentary:

;; Public entry points for compiling Eliscript source with Emacs.

;;; Code:

(require 'eliscript-reader)
(require 'eliscript-expander)
(require 'eliscript-analyzer)
(require 'eliscript-emitter)

(defun eliscript-compile-string (source &optional filename)
  "Compile Eliscript SOURCE to an ECMAScript module.

FILENAME is used for compiler diagnostics."
  (eliscript-emit-module
   (eliscript-analyze-module
    (eliscript-expand-module
     (eliscript-read-string source filename)
     filename)
    filename)))

(defun eliscript-compile-file (input-file &optional output-file)
  "Compile INPUT-FILE and optionally write it to OUTPUT-FILE.

Return the generated ECMAScript source."
  (let ((output
         (eliscript-emit-module
          (eliscript-analyze-module
           (eliscript-expand-module
            (eliscript-read-file input-file)
            input-file)
           input-file))))
    (when output-file
      (make-directory (file-name-directory (expand-file-name output-file)) t)
      (with-temp-file output-file
        (insert output)))
    output))

(provide 'eliscript)

;;; eliscript.el ends here
