;;; eliscript-service-tests.el --- Accelerated service tests -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'eliscript)
(require 'eliscript-service)

(defun eliscript-service-tests--score-values (values rounds)
  "Return the reference score for VALUES over ROUNDS."
  (let ((total 0))
    (dotimes (round rounds)
      (dotimes (index (length values))
        (setq total
              (% (+ (* total 33) (aref values index) round)
                 1000000007))))
    total))

(defun eliscript-service-tests--wait (service predicate timeout)
  "Wait on SERVICE until PREDICATE succeeds or TIMEOUT expires."
  (let* ((worker (eliscript-service-worker service))
         (deadline (+ (float-time) timeout)))
    (while (and (not (funcall predicate))
                (eliscript-worker-live-p worker)
                (< (float-time) deadline))
      (accept-process-output (eliscript-worker-process worker) 0.02))
    (funcall predicate)))

(ert-deftest eliscript-service-routes-verifies-and-owns-worker-lifecycle ()
  (let* ((directory (make-temp-file "eliscript-service-test-" t))
         (fixture
          (expand-file-name "tests/fixtures/worker.eli" default-directory))
         (module (expand-file-name "worker.mjs" directory))
         (score
          (eliscript-service-operation
           'score-values #'eliscript-service-tests--score-values
           :portable-name "score-values"
           :workload-size
           (lambda (arguments)
             (* (length (car arguments)) (cadr arguments)))
           :threshold 10))
         (bad-score
          (eliscript-service-operation
           'bad-score (lambda (_values _rounds) -1)
           :portable-name "score-values"
           :threshold 0))
         (delay
          (eliscript-service-operation
           'delay (lambda (value _milliseconds) value)
           :export-name "delayed_echo"
           :threshold 0))
         service)
    (unwind-protect
        (progn
          (eliscript-compile-file-with-source-map fixture module)
          (setq service
                (eliscript-service-start
                 (eliscript-service-module-declare module)
                 (list score bad-score delay)
                 :verify 'always
                 :value-codec nil
                 :value-chunks nil))
          (should (eliscript-service-live-p service))

          (let (value error-object)
            (let ((request
                   (eliscript-service-call
                    service 'score-values (list [1 2] 2)
                    (lambda (result request-error)
                      (setq value result error-object request-error)))))
              (should (eq (eliscript-service-request-path request) 'reference))
              (should (eliscript-service-request-done request))
              (should-not error-object)
              (should (= value
                         (eliscript-service-tests--score-values [1 2] 2)))))

          (let ((values (vconcat (number-sequence 0 99))) timing)
            (should
             (= (eliscript-service-call-sync
                 service 'score-values (list values 3)
                 :metrics (lambda (value) (setq timing value))
                 :timeout-ms 2000)
                (eliscript-service-tests--score-values values 3)))
            (should (alist-get 'workerMs timing)))

          (let ((state 17))
            (dotimes (case 20)
              (setq state (% (+ (* state 1103515245) 12345) 2147483647))
              (let* ((size (+ 5 (% state 40)))
                     (rounds (+ 1 (% (ash state -3) 5)))
                     (values (make-vector size 0)))
                (dotimes (index size)
                  (setq state
                        (% (+ (* state 1103515245) 12345) 2147483647))
                  (aset values index (% state 1000)))
                (should
                 (= (eliscript-service-call-sync
                     service 'score-values (list values rounds)
                     :path 'accelerated :timeout-ms 2000)
                    (eliscript-service-tests--score-values values rounds))))))

          (should-error
           (eliscript-service-call-sync
            service 'bad-score (list [1 2 3] 2) :timeout-ms 2000)
           :type 'eliscript-service-verification-error)

          (let (progress done error-object)
            (let ((request
                   (eliscript-service-call
                    service 'delay (list "late" 5000)
                    (lambda (_value request-error)
                      (setq error-object request-error done t))
                    :progress (lambda (value) (setq progress value))
                    :timeout-ms 2000)))
              (should
               (eliscript-service-tests--wait
                service (lambda () progress) 2.0))
              (should (equal (alist-get 'stage progress) "started"))
              (should (eliscript-service-cancel request))
              (should done)
              (should (equal (alist-get 'code error-object) "cancelled"))
              (should-not (eliscript-service-cancel request))))

          (let ((generation
                 (eliscript-worker-generation
                  (eliscript-service-worker service)))
                progress done error-object applied)
            (with-temp-buffer
              (eliscript-service-call
               service 'delay (list "obsolete" 5000)
               (lambda (_value request-error)
                 (setq error-object request-error done t))
               :buffer (current-buffer)
               :apply (lambda (_value) (setq applied t))
               :progress (lambda (value) (setq progress value))
               :timeout-ms 2000)
              (should
               (eliscript-service-tests--wait
                service (lambda () progress) 2.0))
              (eliscript-service-restart service)
              (should done)
              (should-not applied)
              (should (equal (alist-get 'code error-object) "worker-restart")))
            (should (> (eliscript-worker-generation
                        (eliscript-service-worker service))
                       generation))
            (should
             (= (eliscript-service-call-sync
                 service 'score-values (list [1 2 3] 4) :timeout-ms 2000)
                (eliscript-service-tests--score-values [1 2 3] 4))))

          (let (progress done error-object applied)
            (with-temp-buffer
              (eliscript-service-call
               service 'delay (list "replaced" 5000)
               (lambda (_value request-error)
                 (setq error-object request-error done t))
               :buffer (current-buffer)
               :apply (lambda (_value) (setq applied t))
               :progress (lambda (value) (setq progress value))
               :timeout-ms 2000)
              (should
               (eliscript-service-tests--wait
                service (lambda () progress) 2.0))
              (eliscript-service-update-module
               service
               (eliscript-service-module-declare
                module :version "replacement"))
              (should done)
              (should-not applied)
              (should (equal (alist-get 'code error-object)
                             "worker-restart"))))
          (should
           (= (eliscript-service-call-sync
               service 'score-values (list [2 4 6] 3) :timeout-ms 2000)
              (eliscript-service-tests--score-values [2 4 6] 3)))

          (should-error
           (eliscript-service-call-sync
            service 'delay (list "late" 5000) :timeout-ms 25)
           :type 'eliscript-service-error))
      (when service (eliscript-service-stop service t))
      (delete-directory directory t))))

(ert-deftest eliscript-service-guards-and-transactionally-applies-buffer-results ()
  (let* ((directory (make-temp-file "eliscript-service-buffer-" t))
         (fixture
          (expand-file-name "tests/fixtures/worker.eli" default-directory))
         (module (expand-file-name "worker.mjs" directory))
         (score
          (eliscript-service-operation
           'score-values #'eliscript-service-tests--score-values
           :portable-name "score-values"
           :threshold 0))
         service)
    (unwind-protect
        (progn
          (eliscript-compile-file-with-source-map fixture module)
          (setq service
                (eliscript-service-start
                 (eliscript-service-module-declare module)
                 (list score)
                 :verify 'always
                 :value-codec nil
                 :value-chunks nil))
          (with-temp-buffer
            (insert "original")
            (let (done result error-object applied)
              (eliscript-service-call
               service 'score-values (list [1 2 3] 20)
               (lambda (value request-error)
                 (setq result value error-object request-error done t))
               :buffer (current-buffer)
               :apply (lambda (_value)
                        (setq applied t)
                        (erase-buffer)
                        (insert "applied"))
               :timeout-ms 2000)
              (insert " changed")
              (should
               (eliscript-service-tests--wait
                service (lambda () done) 2.0))
              (should-not result)
              (should-not applied)
              (should (equal (alist-get 'code error-object) "stale-buffer"))
              (should (equal (buffer-string) "original changed")))

            (erase-buffer)
            (insert "stable")
            (should-error
             (eliscript-service-call-sync
              service 'score-values (list [1] 1)
              :path 'reference
              :buffer (current-buffer)
              :apply (lambda (_value)
                       (erase-buffer)
                       (insert "partial")
                       (error "apply failed")))
             :type 'eliscript-service-error)
            (should (equal (buffer-string) "stable"))))
      (when service (eliscript-service-stop service t))
      (delete-directory directory t))))

(ert-deftest eliscript-service-rejects-invalid-operation-declarations ()
  (should-error
   (eliscript-service-operation
    'missing-entry #'identity :threshold 0)
   :type 'eliscript-service-error)
  (should-error
   (eliscript-service-operation
    'two-entries #'identity
    :portable-name "portable" :export-name "direct" :threshold 0)
   :type 'eliscript-service-error)
  (should-error
   (eliscript-service-operation
    'bad-threshold #'identity :export-name "identity" :threshold -1)
   :type 'wrong-type-argument)
  (let ((operation
         (eliscript-service-operation
          'bad-size #'identity :export-name "identity"
          :workload-size (lambda (_arguments) -1))))
    (should-error (eliscript-service--path operation nil nil)
                  :type 'eliscript-service-error))
  (let ((duplicate
         (eliscript-service-operation
          'duplicate #'identity :export-name "identity")))
    (should-error
     (eliscript-service-start
      (eliscript-service-module-declare "/unused.mjs")
      (list duplicate duplicate)
      :command '("/definitely/missing/eliscript-worker"))
     :type 'eliscript-service-error)))

(provide 'eliscript-service-tests)

;;; eliscript-service-tests.el ends here
