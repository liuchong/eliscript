;;; eliscript-version-comparison-tests.el --- Isolated measurement guards -*- lexical-binding: t; -*-

(require 'ert)
(require 'cl-lib)

(defvar eliscript-version-comparison-workload-ids)
(defvar eliscript-version-comparison-worker-timeout)
(declare-function eliscript-version-comparison-setup "../tools/performance/version-comparison-emacs" ())
(declare-function eliscript-version-comparison-workload "../tools/performance/version-comparison-emacs" (id inputs))
(declare-function eliscript-version-comparison-child-command "../tools/performance/version-comparison-emacs" ())
(declare-function eliscript-version-comparison-child "../tools/performance/version-comparison-emacs" (id))
(declare-function eliscript-version-comparison-isolated "../tools/performance/version-comparison-emacs" ())

(defconst eliscript-version-comparison-tests--root
  (expand-file-name ".." (file-name-directory (or load-file-name buffer-file-name))))

(let ((noninteractive nil))
  (load (expand-file-name "tools/performance/version-comparison-emacs.el"
                          eliscript-version-comparison-tests--root) nil t t))

(ert-deftest eliscript-version-comparison-timed-closures-do-not-look-up-inputs ()
  (let* ((inputs (eliscript-version-comparison-setup))
         (functions (mapcar (lambda (id)
                              (eliscript-version-comparison-workload id inputs))
                            eliscript-version-comparison-workload-ids))
         (results
          (cl-letf (((symbol-function 'plist-get)
                     (lambda (&rest _args) (error "Input lookup entered the timed workload"))))
            (mapcar #'funcall functions))))
    (should (= (length functions) 9))
    (should (cl-every #'identity results))
    (dolist (function functions)
      (should (equal (func-arity function) '(0 . 0))))))

(ert-deftest eliscript-version-comparison-child-keeps-the-selected-emacs ()
  (let* ((exec-path nil)
         (command (eliscript-version-comparison-child-command)))
    (should (file-name-absolute-p (car command)))
    (should (equal (file-truename (car command))
                   (file-truename (expand-file-name invocation-name invocation-directory))))))

(ert-deftest eliscript-version-comparison-child-deadline-reaps-its-processes ()
  (let ((before (process-list))
        (started (float-time))
        (eliscript-version-comparison-worker-timeout 0.2)
        (command (list (expand-file-name invocation-name invocation-directory)
                       "--batch" "-Q" "--eval" "(sleep-for 60)")))
    (cl-letf (((symbol-function 'eliscript-version-comparison-child-command)
               (lambda () command)))
      (should-error (eliscript-version-comparison-child "sequence.first10k") :type 'error))
    (should (< (- (float-time) started) 5))
    (should-not
     (cl-remove-if-not
      (lambda (child) (string-prefix-p "eliscript-benchmark-" (process-name child)))
      (cl-set-difference (process-list) before :test #'eq)))))

(ert-deftest eliscript-version-comparison-collects-every-independent-failure ()
  (let (seen)
    (cl-letf (((symbol-function 'eliscript-version-comparison-child)
               (lambda (id) (push id seen) (error "Expected child failure: %s" id))))
      (should-error (eliscript-version-comparison-isolated) :type 'error))
    (should (equal (nreverse seen) eliscript-version-comparison-workload-ids))))

;;; eliscript-version-comparison-tests.el ends here
