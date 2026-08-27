;;; eliscript-symbol.el --- Eliscript identifier mapping -*- lexical-binding: t; -*-

;;; Commentary:

;; Identifier validation and deterministic ECMAScript name mapping are shared
;; by analysis and emission so collisions are diagnosed before output.

;;; Code:

(require 'subr-x)
(require 'eliscript-diagnostic)

(defconst eliscript-symbol-reserved-words
  '("await" "break" "case" "catch" "class" "const" "continue"
    "debugger" "default" "delete" "do" "else" "enum" "export"
    "extends" "false" "finally" "for" "function" "if" "implements"
    "import" "in" "instanceof" "interface" "let" "new" "null"
    "package" "private" "protected" "public" "return" "static"
    "super" "switch" "this" "throw" "true" "try" "typeof" "var"
    "void" "while" "with" "yield"))

(defconst eliscript-symbol-internal-prefix "__eliscript_"
  "ECMAScript identifier prefix reserved for generated compiler bindings.")

(defun eliscript-symbol--fail (format-string &rest arguments)
  "Signal an identifier error using FORMAT-STRING and ARGUMENTS."
  (signal 'eliscript-compile-error
          (list (apply #'format format-string arguments))))

(defun eliscript-symbol-munge-segment (name)
  "Convert Lisp identifier segment NAME to an ECMAScript identifier."
  (let ((index 0)
        pieces)
    (while (< index (length name))
      (let ((character (aref name index)))
        (push
         (cond
          ((string-match-p "[A-Za-z0-9_$]" (char-to-string character))
           (char-to-string character))
          ((eq character ?-) "_")
          ((eq character ??) "_QMARK_")
          ((eq character ?!) "_BANG_")
          ((eq character ?*) "_STAR_")
          ((eq character ?+) "_PLUS_")
          ((eq character ?=) "_EQ_")
          ((eq character ?<) "_LT_")
          ((eq character ?>) "_GT_")
          (t (format "_U%04X_" character)))
         pieces))
      (setq index (1+ index)))
    (let ((result (apply #'concat (nreverse pieces))))
      (when (string-empty-p result)
        (eliscript-symbol--fail "empty identifier"))
      (when (string-match-p "\\`[0-9]" result)
        (setq result (concat "_" result)))
      (when (member result eliscript-symbol-reserved-words)
        (setq result (concat result "$")))
      result)))

(defun eliscript-symbol-binding-name (symbol)
  "Return the ECMAScript binding name for SYMBOL."
  (unless (symbolp symbol)
    (eliscript-symbol--fail "expected binding name, got %S" symbol))
  (when (or (keywordp symbol)
            (memq symbol '(nil t false undefined))
            (string-prefix-p "&" (symbol-name symbol)))
    (eliscript-symbol--fail "reserved value cannot be a binding: %S" symbol))
  (let ((name (symbol-name symbol)))
    (when (string-match-p "[./]" name)
      (eliscript-symbol--fail "qualified name cannot be a binding: %s" name))
    (let ((output-name (eliscript-symbol-munge-segment name)))
      (when (string-prefix-p eliscript-symbol-internal-prefix output-name)
        (eliscript-symbol--fail
         "binding name uses reserved compiler prefix: %s" name))
      output-name)))

(defun eliscript-symbol-reference-name (symbol)
  "Return an ECMAScript reference for SYMBOL."
  (let ((reference
         (mapconcat #'eliscript-symbol-munge-segment
                    (split-string (symbol-name symbol) "[./]" t)
                    ".")))
    (when (string-prefix-p eliscript-symbol-internal-prefix reference)
      (eliscript-symbol--fail
       "reference uses reserved compiler prefix: %s" symbol))
    reference))

(provide 'eliscript-symbol)

;;; eliscript-symbol.el ends here
