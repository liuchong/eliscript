;;; eliscript-org-tests.el --- Tests for Org publishing -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'eliscript-org)

(defmacro eliscript-org-tests--with-directory (binding &rest body)
  "Bind BINDING to a temporary content directory while evaluating BODY."
  (declare (indent 1) (debug (symbolp body)))
  `(let ((,binding (make-temp-file "eliscript-org-test-" t)))
     (unwind-protect
         (progn ,@body)
       (delete-directory ,binding t))))

(defun eliscript-org-tests--write (directory name content)
  "Write CONTENT to NAME under DIRECTORY and return its path."
  (let ((file (expand-file-name name directory)))
    (make-directory (file-name-directory file) t)
    (with-temp-file file
      (insert content))
    file))

(ert-deftest eliscript-org-exports-deterministic-articles ()
  (eliscript-org-tests--with-directory directory
    (eliscript-org-tests--write
     directory "older.org"
     (concat
      "#+TITLE: Emacs as a compiler host\n"
      "#+DATE: 2026-08-20\n"
      "#+DESCRIPTION: A portable publishing experiment.\n"
      "#+FILETAGS: :emacs:compiler:emacs:\n\n"
      "The body contains *strong text*.\n\n"
      "* Stable heading\n\n"
      "#+begin_src elisp\n(+ 1 2)\n#+end_src\n"))
    (eliscript-org-tests--write
     directory "nested/newer.org"
     (concat
      "#+TITLE: 现代 Lisp 网站\n"
      "#+DATE: 2026-08-28\n"
      "#+SLUG: 现代-lisp\n"
      "#+FILETAGS: publishing, react\n\n"
      "Org 内容进入 React。\n"))
    (eliscript-org-tests--write
     directory "draft.org"
     (concat
      "#+TITLE: Hidden draft\n"
      "#+DATE: 2026-09-01\n"
      "#+DRAFT: true\n\n"
      "Not published.\n"))
    (let* ((articles (eliscript-org-read-directory directory))
           (newer (nth 0 articles))
           (older (nth 1 articles))
           (first-module (eliscript-org-emit-module directory))
           (second-module (eliscript-org-emit-module directory)))
      (should (= (length articles) 2))
      (should (equal (alist-get 'slug newer) "现代-lisp"))
      (should (equal (alist-get 'source newer) "nested/newer.org"))
      (should (equal (alist-get 'tags newer) ["publishing" "react"]))
      (should (equal (alist-get 'tags older) ["compiler" "emacs"]))
      (should (string-match-p "<b>strong text</b>"
                              (alist-get 'html older)))
      (should (string-match-p
               "id=\"older-section-1\""
               (alist-get 'html older)))
      (should (string-match-p "src-elisp" (alist-get 'html older)))
      (should (equal first-module second-module))
      (should-not (string-match-p "Hidden draft" first-module))
      (should (string-match-p
               (regexp-quote "export default articles;")
               first-module))
      (should (= (length
                  (eliscript-org-read-directory directory t))
                 3)))))

(ert-deftest eliscript-org-preserves-explicit-custom-heading-ids ()
  (eliscript-org-tests--with-directory directory
    (let* ((file
            (eliscript-org-tests--write
             directory "custom.org"
             (concat
              "#+TITLE: Custom heading\n"
              "#+DATE: 2026-08-28\n\n"
              "* Heading\n"
              ":PROPERTIES:\n"
              ":CUSTOM_ID: chosen-id\n"
              ":END:\n\n"
              "Body.\n")))
           (article (eliscript-org-read-article file directory)))
      (should (string-match-p "id=\"chosen-id\""
                              (alist-get 'html article)))
      (should-not (string-match-p "custom-section-1"
                                  (alist-get 'html article))))))

(ert-deftest eliscript-org-validates-metadata-and-slugs ()
  (eliscript-org-tests--with-directory directory
    (let ((missing-title
           (eliscript-org-tests--write
            directory "missing-title.org"
            "#+DATE: 2026-08-28\n\nBody.\n")))
      (should-error
       (eliscript-org-read-article missing-title directory)
       :type 'eliscript-org-error))
    (delete-file (expand-file-name "missing-title.org" directory))
    (let ((invalid-date
           (eliscript-org-tests--write
            directory "invalid-date.org"
            "#+TITLE: Invalid\n#+DATE: August 28\n\nBody.\n")))
      (should-error
       (eliscript-org-read-article invalid-date directory)
       :type 'eliscript-org-error))
    (delete-file (expand-file-name "invalid-date.org" directory))
    (let ((impossible-date
           (eliscript-org-tests--write
            directory "impossible-date.org"
            "#+TITLE: Invalid\n#+DATE: 2026-02-30\n\nBody.\n")))
      (should-error
       (eliscript-org-read-article impossible-date directory)
       :type 'eliscript-org-error))
    (delete-file (expand-file-name "impossible-date.org" directory))
    (eliscript-org-tests--write
     directory "one.org"
     "#+TITLE: One\n#+DATE: 2026-08-28\n#+SLUG: same\n")
    (eliscript-org-tests--write
     directory "two.org"
     (concat
      "#+TITLE: Two\n#+DATE: 2026-08-27\n"
      "#+SLUG: same\n#+DRAFT: t\n"))
    (should-error
     (eliscript-org-read-directory directory)
     :type 'eliscript-org-error)))

(provide 'eliscript-org-tests)

;;; eliscript-org-tests.el ends here
