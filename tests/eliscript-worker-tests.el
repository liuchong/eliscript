;;; eliscript-worker-tests.el --- Worker integration tests -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'eliscript)
(require 'eliscript-worker)
(require 'eliscript-index)

(defun eliscript-worker-tests--score-values (values rounds)
  "Return the reference score for VALUES over ROUNDS."
  (let ((total 0))
    (dotimes (round rounds)
      (dotimes (index (length values))
        (setq total
              (% (+ (* total 33) (aref values index) round)
                 1000000007))))
    total))

(defun eliscript-worker-tests--wait (worker predicate timeout)
  "Wait on WORKER until PREDICATE returns non-nil or TIMEOUT expires."
  (let ((deadline (+ (float-time) timeout)))
    (while (and (not (funcall predicate))
                (eliscript-worker-live-p worker)
                (< (float-time) deadline))
      (accept-process-output (eliscript-worker-process worker) 0.02))
    (funcall predicate)))

(ert-deftest eliscript-emacs-client-runs-and-cancels-worker-requests ()
  (let* ((directory (make-temp-file "eliscript-worker-test-" t))
         (fixture
          (expand-file-name "tests/fixtures/worker.eli" default-directory))
         (module (expand-file-name "worker.mjs" directory))
         worker)
    (unwind-protect
        (progn
          (eliscript-compile-file-with-source-map fixture module)
          (setq worker (eliscript-worker-start))
          (should (member "request" (eliscript-worker-capabilities worker)))
          (let* ((values (vconcat (number-sequence 0 499)))
                 (expected
                  (eliscript-worker-tests--score-values values 3)))
            (should
             (= expected
                (eliscript-worker-call-sync
                 worker module "score_values" (list values 3)
                 :timeout-ms 2000)))
            (should
             (= (eliscript-worker-tests--score-values values 2)
                (eliscript-worker-call-portable-sync
                 worker module "score-values" (list values 2)
                 :timeout-ms 2000))))

          (let (progress done request-error)
            (let ((id
                   (eliscript-worker-call
                    worker module "delayed_echo" '("late" 5000)
                    (lambda (_value error-object)
                      (setq request-error error-object
                            done t))
                    :progress (lambda (value) (setq progress value))
                    :timeout-ms 2000)))
              (should
               (eliscript-worker-tests--wait
                worker (lambda () progress) 2.0))
              (should (equal (alist-get 'stage progress) "started"))
              (should (eliscript-worker-cancel worker id))
              (should
               (eliscript-worker-tests--wait
                worker (lambda () done) 2.0))
              (should (equal (alist-get 'code request-error) "cancelled"))))

          (let ((error-data
                 (should-error
                  (eliscript-worker-call-sync
                   worker module "absent" nil :timeout-ms 2000)
                  :type 'eliscript-worker-request-error)))
            (should
             (string-match-p
              "does not export a function"
              (error-message-string error-data))))

          (let* ((error-data
                  (should-error
                   (eliscript-worker-call-portable-sync
                    worker module "crash-at-source" '(7) :timeout-ms 2000)
                   :type 'eliscript-worker-request-error))
                 (error-object (nth 2 error-data))
                 (location (eliscript-worker-error-location error-object)))
            (should (equal (alist-get 'file location) fixture))
            (should (= (alist-get 'line location) 15))
            (should (string-match-p
                     (regexp-quote "tests/fixtures/worker.eli:15")
                     (error-message-string error-data))))

          (should
           (equal
            (eliscript-worker-call-sync
             worker module "noisy_echo" '("framed") :timeout-ms 2000)
            "framed"))
          (should
           (eliscript-worker-tests--wait
            worker
            (lambda ()
              (string-match-p "worker module log"
                              (eliscript-worker-stderr worker)))
            2.0))

          (should-error
           (eliscript-worker-call-sync
            worker module "blocking_echo" '("late" 1000) :timeout-ms 25)
           :type 'eliscript-worker-timeout)
          (should-not (eliscript-worker-live-p worker))

          (should
           (= (eliscript-worker-call-sync
               worker module "score_values" (list [1 2 3] 2)
               :timeout-ms 2000)
              (eliscript-worker-tests--score-values [1 2 3] 2)))
          (should (= (eliscript-worker-generation worker) 2))
          (should (= (eliscript-worker-restart-count worker) 1)))
      (when worker (eliscript-worker-stop worker t))
      (delete-directory directory t))))

(ert-deftest eliscript-emacs-client-restarts-after-module-change ()
  (let* ((directory (make-temp-file "eliscript-worker-reload-" t))
         (module (expand-file-name "reload.mjs" directory))
         worker)
    (unwind-protect
        (progn
          (with-temp-file module
            (insert "export function value() { return 1; }\n"))
          (setq worker (eliscript-worker-start))
          (should (= 1 (eliscript-worker-call-sync
                        worker module "value" nil :timeout-ms 2000)))
          (with-temp-file module
            (insert "export function value() { return 22; }\n"))
          (should (= 22 (eliscript-worker-call-sync
                         worker module "value" nil :timeout-ms 2000)))
          (should (= (eliscript-worker-generation worker) 2))
          (delete-process (eliscript-worker-process worker))
          (should (= 22 (eliscript-worker-call-sync
                         worker module "value" nil :timeout-ms 2000)))
          (should (= (eliscript-worker-generation worker) 3))
          (should (= (eliscript-worker-restart-count worker) 2)))
      (when worker (eliscript-worker-stop worker t))
      (delete-directory directory t))))

(ert-deftest eliscript-index-scores-texts-asynchronously ()
  (let (session directory timing-values)
    (unwind-protect
        (progn
          (setq session (eliscript-index-start))
          (setq directory (eliscript-index-session-directory session))
          (should (= (length
                      (eliscript-project-build-result-modules
                       (eliscript-index-session-build session)))
                     3))
          (let ((entry
                 (eliscript-index-session-module session))
                (data (expand-file-name "stdlib/data.mjs" directory))
                (object (expand-file-name "stdlib/object.mjs" directory)))
            (should (string-suffix-p
                     "examples/emacs-index/index.mjs" entry))
            (dolist (module (list entry data object))
              (should (file-exists-p module))
              (should (file-exists-p (concat module ".map"))))
            (should (string-match-p
                     "function count_by"
                     (with-temp-buffer
                       (insert-file-contents data)
                       (buffer-string))))
            (should-not
             (string-match-p
              "function group_by"
              (with-temp-buffer
                (insert-file-contents data)
                (buffer-string)))))
          (let ((results
                 (eliscript-index-search-sync
                  session
                  '(("compiler" . "Emacs compiler JavaScript compiler")
                    ("site" . "Org React publishing")
                    ("runtime" . "JavaScript worker for Emacs"))
                  "emacs javascript"
                  :metrics (lambda (values) (setq timing-values values))
                  :timeout-ms 2000)))
            (should (equal (mapcar (lambda (result)
                                    (alist-get 'id result))
                                  (append results nil))
                           '("compiler" "site" "runtime")))
            (should (equal (mapcar (lambda (result)
                                    (alist-get 'matches result))
                                  (append results nil))
                           '(2 0 2)))
            (should (= (length timing-values) 3))
            (should (eq (alist-get 'moduleCacheHit (aref timing-values 0))
                        :false))
            (should (alist-get 'moduleCacheHit (aref timing-values 1))))
          (let ((duplicate-query
                 (eliscript-index-search-sync
                  session
                  '(("compiler" . "compiler compiler"))
                  "compiler compiler"
                  :timeout-ms 2000)))
            (should (= (alist-get 'matches (aref duplicate-query 0)) 4)))
          (let ((empty-query
                 (eliscript-index-search-sync
                  session '(("empty" . "")) "" :timeout-ms 2000)))
            (should (= (alist-get 'matches (aref empty-query 0)) 0))
            (should (= (alist-get 'terms (aref empty-query 0)) 0))))
      (when session (eliscript-index-stop session))
      (when directory
        (should-not (file-exists-p directory))))))

(provide 'eliscript-worker-tests)

;;; eliscript-worker-tests.el ends here
