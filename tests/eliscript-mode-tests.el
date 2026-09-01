;;; eliscript-mode-tests.el --- Tests for Eliscript mode -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'imenu)
(require 'eliscript-mode)

(defconst eliscript-mode-tests--root
  (expand-file-name ".." (file-name-directory
                           (or load-file-name buffer-file-name))))

(defun eliscript-mode-tests--face-at (text)
  "Return the face on the last character of the next TEXT."
  (search-forward text)
  (get-text-property (1- (point)) 'face))

(defun eliscript-mode-tests--imenu-names (index)
  "Return every named entry contained in Imenu INDEX."
  (let (names)
    (dolist (entry index)
      (when (consp entry)
        (if (imenu--subalist-p entry)
            (setq names
                  (append names
                          (eliscript-mode-tests--imenu-names (cdr entry))))
          (push (car entry) names))))
    names))

(ert-deftest eliscript-mode-activates-complete-source-syntax ()
  (with-temp-buffer
    (setq buffer-file-name "/tmp/example.eli")
    (set-auto-mode)
    (should (eq major-mode 'eliscript-mode))
    (should (equal comment-start "; "))
    (should (equal comment-end ""))
    (insert "[{:key \"text\"} #{:a :b}] ; comment\n")
    (goto-char (point-min))
    (let ((end (scan-sexps (point) 1)))
      (should (eq (char-before end) ?\])))
    (search-forward "text")
    (should (nth 3 (syntax-ppss (1- (point)))))
    (search-forward "comment")
    (should (nth 4 (syntax-ppss (1- (point)))))
    (goto-char (point-min))
    (insert "'` , ,@ #'")
    (dolist (character '(?' ?` ?, ?#))
      (should (= (char-syntax character) ?')))))

(ert-deftest eliscript-mode-indentation-matches-formatter-structure ()
  (with-temp-buffer
    (eliscript-mode)
    (insert "(module demo\n(defun answer (x)\n(if x\n(print :yes)\n(print :no))))\n")
    (indent-region (point-min) (point-max))
    (let ((canonical
           "(module demo\n  (defun answer (x)\n    (if x\n      (print :yes)\n      (print :no))))\n"))
      (should (equal (buffer-string) canonical))
      (indent-region (point-min) (point-max))
      (should (equal (buffer-string) canonical)))))

(ert-deftest eliscript-mode-font-locks-semantic-categories ()
  (with-temp-buffer
    (eliscript-mode)
    (insert "(module demo.core)\n"
            "(defn answer (&optional x)\n"
            "  (if x :yes false))\n"
            "(defconst label \"ready\")\n"
            "; note\n")
    (font-lock-ensure)
    (goto-char (point-min))
    (should (eq (eliscript-mode-tests--face-at "module")
                'font-lock-keyword-face))
    (should (eq (eliscript-mode-tests--face-at "demo.core")
                'font-lock-type-face))
    (should (eq (eliscript-mode-tests--face-at "defn")
                'font-lock-keyword-face))
    (should (eq (eliscript-mode-tests--face-at "answer")
                'font-lock-function-name-face))
    (should (eq (eliscript-mode-tests--face-at "&optional")
                'font-lock-builtin-face))
    (should (eq (eliscript-mode-tests--face-at ":yes")
                'font-lock-constant-face))
    (should (eq (eliscript-mode-tests--face-at "false")
                'font-lock-constant-face))
    (should (eq (eliscript-mode-tests--face-at "label")
                'font-lock-variable-name-face))
    (should (eq (eliscript-mode-tests--face-at "ready")
                'font-lock-string-face))
    (should (eq (eliscript-mode-tests--face-at "note")
                'font-lock-comment-face))))

(ert-deftest eliscript-mode-indexes-and-navigates-definitions ()
  (with-temp-buffer
    (eliscript-mode)
    (insert "(module demo.core)\n\n"
            "(defun first (x)\n  (print x))\n\n"
            "(defmacro with-value (&body body)\n  body)\n\n"
            "(defconst answer 42)\n")
    (font-lock-ensure)
    (let ((names (eliscript-mode-tests--imenu-names
                  (imenu--make-index-alist t))))
      (dolist (name '("demo.core" "first" "with-value" "answer"))
        (should (member name names))))
    (goto-char (point-min))
    (search-forward "print")
    (beginning-of-defun)
    (should (looking-at-p "(defun first"))
    (end-of-defun)
    (should (save-excursion
              (skip-chars-backward " \t\r\n")
              (eq (char-before) ?\))))
    (search-forward "body")
    (beginning-of-defun)
    (should (looking-at-p "(defmacro with-value"))
    (end-of-defun)
    (should (save-excursion
              (skip-chars-backward " \t\r\n")
              (looking-back "body)" (line-beginning-position))))))

(ert-deftest eliscript-mode-discovers-configured-and-vcs-projects ()
  (let* ((directory (make-temp-file "eliscript-mode-project-" t))
         (configured (expand-file-name "configured" directory))
         (vcs (expand-file-name "vcs" directory))
         (configured-source (expand-file-name "src/nested" configured))
         (vcs-source (expand-file-name "src/nested" vcs)))
    (unwind-protect
        (progn
          (make-directory configured-source t)
          (make-directory vcs-source t)
          (make-directory (expand-file-name ".git" configured) t)
          (make-directory (expand-file-name ".git" vcs) t)
          (write-region "{}" nil (expand-file-name "eliscript.json" configured)
                        nil 'silent)
          (with-temp-buffer
            (setq default-directory configured-source)
            (should (equal (eliscript-mode-project-root)
                           (file-name-as-directory configured))))
          (with-temp-buffer
            (setq default-directory vcs-source)
            (should (equal (eliscript-mode-project-root)
                           (file-name-as-directory vcs)))))
      (delete-directory directory t))))

(ert-deftest eliscript-mode-formats-buffer-through-public-command ()
  (let ((eliscript-mode-format-command
         (list (expand-file-name "bin/eliscript-format"
                                eliscript-mode-tests--root))))
    (with-temp-buffer
      (eliscript-mode)
      (insert "; heading   \n(module   demo.mode\n(defun answer () 42))\n")
      (goto-char (point-min))
      (search-forward "answer")
      (let ((position (point)))
        (should (eliscript-mode-format-buffer))
        (should (equal
                 (buffer-string)
                 "; heading\n(module demo.mode (defun answer () 42))\n"))
        (should (<= (abs (- (point) position)) 5))
        (should (equal (buffer-substring-no-properties
                        (- (point) 6) (point))
                       "answer")))
      (set-buffer-modified-p nil)
      (should-not (eliscript-mode-format-buffer))
      (should-not (buffer-modified-p)))))

(ert-deftest eliscript-mode-formatter-failure-is-transactional ()
  (let ((eliscript-mode-format-command
         '("sh" "-c" "printf formatter-failed >&2; exit 7" "eliscript-test")))
    (with-temp-buffer
      (eliscript-mode)
      (insert "(module unchanged)\n")
      (goto-char 9)
      (set-buffer-modified-p nil)
      (let ((source (buffer-string))
            (position (point))
            failure)
        (condition-case error
            (eliscript-mode-format-buffer)
          (eliscript-mode-error (setq failure error)))
        (should failure)
        (should (string-match-p "formatter-failed"
                                (error-message-string failure)))
        (should (equal (buffer-string) source))
        (should (= (point) position))
        (should-not (buffer-modified-p))))))

(ert-deftest eliscript-mode-rejects-invalid-formatter-command ()
  (let ((eliscript-mode-format-command nil))
    (with-temp-buffer
      (eliscript-mode)
      (insert "(module unchanged)\n")
      (should-error (eliscript-mode-format-buffer)
                    :type 'eliscript-mode-error))))

(provide 'eliscript-mode-tests)

;;; eliscript-mode-tests.el ends here
