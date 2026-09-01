;;; eliscript-evaluation-tests.el --- Seed evaluation tests -*- lexical-binding: t; -*-

(require 'ert)
(require 'eliscript)

(ert-deftest eliscript-evaluation-seed-normalizes-closed-operations ()
  (should
   (equal
    (eliscript-evaluation-operation-request
     '((id . 7)
       (operation . "evaluate")
       (source . "(+ 1 2)")
       (filename . "repl.eli")))
    '((format . "eliscript-evaluation-operation")
      (version . 1)
      (id . 7)
      (operation . "evaluate")
      (source . "(+ 1 2)")
      (filename . "repl.eli")
      (root)
      (line . 1)
      (column . 1))))
  (should-error
   (eliscript-evaluation-operation-request
    '((operation . "describe") (framework . "anything")))
   :type 'eliscript-evaluation-error)
  (should-error
   (eliscript-evaluation-operation-request
    '((operation . "reset") (source . "(+ 1 2)")))
   :type 'eliscript-evaluation-error)
  (should-error
   (eliscript-evaluation-operation-request
    '((id . 9007199254740992) (operation . "describe")))
   :type 'eliscript-evaluation-error)
  (should-error
   (eliscript-evaluation-operation-request
    '((operation . "evaluate")
      (source . "(+ 1 2)")
      (filename . "repl.eli")
      (line . 9007199254740992)))
   :type 'eliscript-evaluation-error))

(ert-deftest eliscript-evaluation-seed-classifies-language-forms ()
  (should
   (equal
    (eliscript-evaluation-form-description
     "(defun value () 42)" "repl.eli")
    '((format . "eliscript-evaluation-form")
      (version . 1)
      (kind . "definition")
      (head . "defun")
      (name . "value")
      (runtimeBinding . t)
      (filename . "repl.eli"))))
  (should
   (eq :false
       (alist-get
        'runtimeBinding
        (eliscript-evaluation-form-description
         "(defmacro twice (value) `(+ ,value ,value))" "repl.eli"))))
  (dolist (name '(jsx fragment defcomponent))
    (should
     (equal
      (alist-get
       'kind
       (eliscript-evaluation-form-description
        (format "(%s 1)" name) "repl.eli"))
      "expression"))))

(ert-deftest eliscript-evaluation-seed-describes-module-bindings-and-macros ()
  (let ((description
         (eliscript-evaluation-module-description
          (concat
           "(module sample\n"
           "  (import \"./value.mjs\" imported)\n"
           "  (defmacro twice (value) `(+ ,value ,value))\n"
           "  (defvar private-value 1)\n"
           "  (defun public-value () private-value)\n"
           "  (export public-value))")
          "sample.eli")))
    (should
     (equal (alist-get 'bindings description)
            ["imported" "private-value" "public-value"]))
    (should (equal (alist-get 'exports description) ["public-value"]))
    (should
     (equal
      (alist-get 'macroSources description)
      ["(defmacro twice (value) `(+ ,value ,value))"]))))

(provide 'eliscript-evaluation-tests)

;;; eliscript-evaluation-tests.el ends here
