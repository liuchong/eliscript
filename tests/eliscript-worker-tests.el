;;; eliscript-worker-tests.el --- Worker integration tests -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'eliscript)
(require 'eliscript-worker)

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
          (eliscript-compile-file fixture module)
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

          (setq worker (eliscript-worker-start))
          (should
           (= (eliscript-worker-call-sync
               worker module "score_values" (list [1 2 3] 2)
               :timeout-ms 2000)
              (eliscript-worker-tests--score-values [1 2 3] 2))))
      (when worker (eliscript-worker-stop worker t))
      (delete-directory directory t))))

(provide 'eliscript-worker-tests)

;;; eliscript-worker-tests.el ends here
