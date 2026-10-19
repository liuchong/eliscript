;;; eliscript-emitted-alias-tests.el --- Seed emitted-name parity -*- lexical-binding: t; -*-

(require 'ert)
(require 'eliscript)

(ert-deftest eliscript-seed-preserves-established-emitted-name-shadowing ()
  ;; These are the existing JS/managed project-linking contracts, not a new
  ;; source-name policy. The Seed must not invent a different TDZ namespace.
  (let* ((root (expand-file-name ".." (file-name-directory (locate-library "eliscript"))))
         (compiler (expand-file-name "dist/bootstrap/compiler.mjs" root))
         (directory (make-temp-file "eliscript-emitted-alias-" t))
         (node (or (getenv "NODE") "node"))
         (cases
          '(("(defvar value-name 3) (defun f (value_name) value-name) (export f)" 5)
            ("(defvar value-name 3) (defun f (value_name) ((lambda () value-name))) (export f)" 5)
            ("(defvar value-name 3) (defun f (value_name) (setq value-name 7) (+ (* value-name 10) value_name)) (defun global () value-name) (export f global)" 77)
            ("(defun f (value-name) (let ((value_name (+ value-name 1))) ((lambda () value-name)))) (export f)" 6)
            ("(defun f (value-name) (let ((value_name (+ value-name 1))) (let ((value-name (+ value_name 1))) ((lambda () value_name))))) (export f)" 7)
            ("(defvar default 3) (defun f (default$) default) (export f)" 5)
            ("(defvar 值 3) (defun f (_U503C_) 值) (export f)" 5)
            ("(defvar value 3) (defun f ($eliscript-link-0-0) value) (export f)" 3)))
         (forms (list (format "(import %s :as Compiler)"
                              (eliscript-emitter--json-string compiler))
                      "(import \"node:fs\" writeFileSync)"
                      "(import \"node:module\" createRequire)"
                      "(import \"node:assert/strict\" :default assert)"))
         (index 0))
    (unwind-protect
        (progn
          (should (file-exists-p compiler))
          (dolist (entry cases)
            (let* ((source (car entry)) (expected (cadr entry))
                   (seed (expand-file-name (format "seed-%d.mjs" index) directory))
                   (hosted (expand-file-name (format "hosted-%d.mjs" index) directory)))
              (with-temp-file seed (insert (eliscript-compile-string source "alias.eli")))
              (setq forms
                    (append forms
                            (list
                             (format "(writeFileSync %s (js-call Compiler :compile_string %s \"alias.eli\"))"
                                     (eliscript-emitter--json-string hosted)
                                     (eliscript-emitter--json-string source))
                             (format "(defconst seed%d (funcall (createRequire %s) %s))"
                                     index (eliscript-emitter--json-string seed) (eliscript-emitter--json-string seed))
                             (format "(defconst hosted%d (funcall (createRequire %s) %s))"
                                     index (eliscript-emitter--json-string hosted) (eliscript-emitter--json-string hosted))
                             (format "(js-call assert :strictEqual (js-call seed%d :f 5) %d)" index expected)
                             (format "(js-call assert :strictEqual (js-call hosted%d :f 5) %d)" index expected)
                             (format "(when (get seed%d :global) (js-call assert :strictEqual (js-call seed%d :global) 3) (js-call assert :strictEqual (js-call hosted%d :global) 3))"
                                     index index index)))))
            (setq index (1+ index)))
          (let ((runner (expand-file-name "verify.mjs" directory)))
            (with-temp-file runner
              (insert (eliscript-compile-string (mapconcat #'identity forms "\n") "verify.eli")))
            (with-temp-buffer
              (let ((status (call-process node nil t nil runner)))
                (should (equal (list status (buffer-string)) '(0 "")))))))
      (delete-directory directory t))))

(provide 'eliscript-emitted-alias-tests)
;;; eliscript-emitted-alias-tests.el ends here
