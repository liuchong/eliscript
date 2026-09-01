;;; eliscript-repl-tests.el --- Persistent editor evaluation tests -*- lexical-binding: t; -*-

(require 'ert)
(require 'eliscript-mode)

(defun eliscript-repl-tests--wait (predicate &optional timeout)
  "Wait up to TIMEOUT seconds for PREDICATE while accepting process output."
  (let ((deadline (+ (float-time) (or timeout 20.0))))
    (while (and (not (funcall predicate)) (< (float-time) deadline))
      (accept-process-output nil 0.05))
    (funcall predicate)))

(defun eliscript-repl-tests--idle-p (session)
  "Return non-nil when SESSION is ready with no pending protocol request."
  (and (eq (eliscript-repl--session-state session) 'ready)
       (= (hash-table-count (eliscript-repl--session-pending session)) 0)))

(ert-deftest eliscript-repl-mode-surface-is-framework-neutral ()
  (dolist (name '("jsx" "fragment" "defcomponent"))
    (should-not (member name eliscript-mode--function-heads))
    (should-not (member name eliscript-mode--special-heads))
    (should-not (member name eliscript-mode--top-level-heads)))
  (with-temp-buffer
    (eliscript-mode)
    (should (eq (key-binding (kbd "C-c C-e"))
                #'eliscript-mode-eval-last-form))
    (should (eq (key-binding (kbd "C-M-x"))
                #'eliscript-mode-eval-defun))
    (should (eq (key-binding (kbd "C-c C-l"))
                #'eliscript-mode-eval-buffer))
    (should (eq (key-binding (kbd "C-c C-z"))
                #'eliscript-mode-show-repl))
    (should (eq (key-binding (kbd "C-c C-q"))
                #'eliscript-mode-stop-repl))))

(ert-deftest eliscript-repl-diagnostic-regexp-captures-location ()
  (let ((regexp (nth 1 eliscript-repl--compilation-regexp))
        (line "eliscript-eval: /tmp/example.eli:8:30: evaluation failed"))
    (should (string-match regexp line))
    (should (equal (match-string 1 line) "/tmp/example.eli"))
    (should (equal (match-string 2 line) "8"))
    (should (equal (match-string 3 line) "30"))))

(ert-deftest eliscript-repl-recovery-replaces-a-redefined-binding ()
  (let* ((session (eliscript-repl--session-create :recovery nil))
         (first
          (eliscript-repl--pending-create
           :payload '((operation . "evaluate")
                      (source . "(defvar value 1)"))))
         (second
          (eliscript-repl--pending-create
           :payload '((operation . "evaluate")
                      (source . "(defvar value 2)"))))
         (result '((status . "ok")
                   (operation . "evaluate")
                   (kind . "definition")
                   (binding . "value"))))
    (eliscript-repl--remember-result session first result)
    (eliscript-repl--remember-result session second result)
    (should (= (length (eliscript-repl--session-recovery session)) 1))
    (should
     (equal
      (alist-get 'source
                 (cdr (car (eliscript-repl--session-recovery session))))
      "(defvar value 2)"))))

(ert-deftest eliscript-repl-loads-evaluates-and-recovers-project-session ()
  (let* ((project-directory default-directory)
         (fixture
          (expand-file-name "tests/fixtures/evaluation-session/main.eli"
                            project-directory))
         (eliscript-mode-eval-command
          (list (expand-file-name "bin/eliscript-eval" project-directory)
                "--stdio"))
         (process-environment
          (cons "ELISCRIPT_JS_RUNTIME=node" process-environment))
         session result-buffer generation current-result failure-result)
    (unwind-protect
        (with-temp-buffer
          (setq buffer-file-name fixture
                default-directory project-directory)
          (insert-file-contents fixture)
          (eliscript-mode)
          (eliscript-mode-eval-buffer)
          (setq session (eliscript-repl--session))
          (should
           (eliscript-repl-tests--wait
            (lambda () (eliscript-repl-tests--idle-p session))))
          (should (process-live-p (eliscript-repl--session-process session)))
          (should (= (length (eliscript-repl--session-recovery session)) 1))
          (setq result-buffer (eliscript-repl--result-buffer session))
          (with-current-buffer result-buffer
            (should (string-match-p "evaluation fixture loaded"
                                    (buffer-string)))
            (should (string-match-p "loaded [0-9]+ bindings"
                                    (buffer-string))))

          (eliscript-repl--submit
           (eliscript-repl--source-request
            "evaluate" "(current)" fixture 1 1)
           (lambda (result) (setq current-result result)))
          (should
           (eliscript-repl-tests--wait (lambda () current-result)))
          (should (equal (alist-get 'value current-result) "[1 1]"))

          (eliscript-repl--submit
           (eliscript-repl--source-request
            "evaluate" "(explode)" fixture 1 1)
           (lambda (result) (setq failure-result result)))
          (should
           (eliscript-repl-tests--wait (lambda () failure-result)))
          (should (equal (alist-get 'status failure-result) "error"))
          (with-current-buffer result-buffer
            (should
             (string-match-p
              (concat "eliscript-eval: " (regexp-quote fixture)
                      ":8:30:")
              (buffer-string))))

          (setq generation (eliscript-repl--session-generation session))
          (delete-process (eliscript-repl--session-process session))
          (should
           (eliscript-repl-tests--wait
            (lambda ()
              (and (> (eliscript-repl--session-generation session) generation)
                   (eliscript-repl-tests--idle-p session)))))
          (setq current-result nil)
          (eliscript-repl--submit
           (eliscript-repl--source-request
            "evaluate" "(current)" fixture 1 1)
           (lambda (result) (setq current-result result)))
          (should
           (eliscript-repl-tests--wait (lambda () current-result)))
          (should (equal (alist-get 'value current-result) "[1 1]"))

          (eliscript-mode-stop-repl)
          (should-not (process-live-p (eliscript-repl--session-process session)))
          (should-not (gethash (eliscript-repl--session-root session)
                               eliscript-repl--sessions)))
      (maphash
       (lambda (_root active)
         (setf (eliscript-repl--session-stopped active) t)
         (when (process-live-p (eliscript-repl--session-process active))
           (delete-process (eliscript-repl--session-process active)))
         (eliscript-repl--cleanup-process-buffers active))
       eliscript-repl--sessions)
      (clrhash eliscript-repl--sessions)
      (when (buffer-live-p result-buffer) (kill-buffer result-buffer)))))

(provide 'eliscript-repl-tests)

;;; eliscript-repl-tests.el ends here
