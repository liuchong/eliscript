;;; eliscript-analysis-tests.el --- Accelerated analysis tests -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'eliscript-analysis)

(defun eliscript-analysis-tests--wait (session predicate timeout)
  "Wait for PREDICATE using SESSION for at most TIMEOUT seconds."
  (let* ((service (eliscript-analysis-session-service session))
         (worker (eliscript-service-worker service))
         (deadline (+ (float-time) timeout)))
    (while (and (not (funcall predicate))
                (eliscript-worker-live-p worker)
                (< (float-time) deadline))
      (accept-process-output (eliscript-worker-process worker) 0.02))
    (funcall predicate)))

(defun eliscript-analysis-tests--sources (documents terms)
  "Return deterministic DOCUMENTS containing TERMS words each."
  (mapcar
   (lambda (document)
     (cons (format "document-%d" document)
           (mapconcat
            (lambda (term) (format "term%d" (% (+ term document) 250)))
            (number-sequence 0 (1- terms)) " ")))
   (number-sequence 0 (1- documents))))

(ert-deftest eliscript-analysis-workflows-agree-across-both-paths ()
  (let ((sources
         '(("one" . "Emacs Lisp and Eliscript")
           ("two" . "Eliscript runs in JavaScript")
           ("three" . "Persistent data in Emacs")))
        session)
    (unwind-protect
        (progn
          (setq session (eliscript-analysis-start :verify 'always))
          (let ((reference
                 (eliscript-analysis-search-sync
                  session sources "eliscript javascript" :path 'reference))
                (accelerated
                 (eliscript-analysis-search-sync
                  session sources "eliscript javascript"
                  :path 'accelerated :timeout-ms 2000)))
            (should (equal accelerated reference))
            (should (= (length accelerated) 2))
            (should (equal (alist-get 'id (aref accelerated 0)) "one")))
          (should
           (equal
            (eliscript-analysis-statistics-sync
             session sources :path 'accelerated :timeout-ms 2000)
            (eliscript-analysis-statistics-sync
             session sources :path 'reference)))
          (should
           (eliscript-analysis--frequency-equal
            (eliscript-analysis-frequencies-sync
             session sources :path 'accelerated :timeout-ms 2000)
            (eliscript-analysis-frequencies-sync
             session sources :path 'reference))))
      (when session (eliscript-analysis-stop session)))))

(ert-deftest eliscript-analysis-buffer-application-rejects-stale-results ()
  (let ((sources
         (mapcar
          (lambda (index)
            (cons (format "document-%d" index)
                  (mapconcat
                   (lambda (term) (format "term%d" (% term 100)))
                   (number-sequence 0 399) " ")))
          (number-sequence 0 49)))
        session)
    (unwind-protect
        (progn
          (setq session (eliscript-analysis-start))
          (eliscript-analysis-search-sync
           session sources "term3 term17" :path 'accelerated
           :timeout-ms 5000)
          (with-temp-buffer
            (insert "current")
            (let (done result error-object applied)
              (eliscript-analysis-search
               session sources "term3 term17"
               (lambda (value request-error)
                 (setq result value error-object request-error done t))
               :path 'accelerated
               :buffer (current-buffer)
               :apply (lambda (_value)
                        (setq applied t)
                        (erase-buffer)
                        (insert "accelerated"))
               :timeout-ms 5000)
              (insert " changed")
              (should
               (eliscript-analysis-tests--wait
                session (lambda () done) 5.0))
              (should-not result)
              (should-not applied)
              (should (equal (alist-get 'code error-object) "stale-buffer"))
              (should (equal (buffer-string) "current changed"))))
          (with-temp-buffer
            (insert "stable")
            (let (done error-object applied-count)
              (eliscript-analysis-statistics
               session sources
               (lambda (_value request-error)
                 (setq error-object request-error done t))
               :path 'accelerated
               :buffer (current-buffer)
               :apply (lambda (value)
                        (setq applied-count (length value))
                        (erase-buffer)
                        (insert "applied"))
               :timeout-ms 5000)
              (should
               (eliscript-analysis-tests--wait
                session (lambda () done) 5.0))
              (should-not error-object)
              (should (= applied-count (length sources)))
              (should (equal (buffer-string) "applied")))))
      (when session (eliscript-analysis-stop session)))))

(ert-deftest eliscript-analysis-routes-and-reindexes-worker-generations ()
  (let ((small (eliscript-analysis-tests--sources 10 50))
        (large (eliscript-analysis-tests--sources 25 100))
        session)
    (unwind-protect
        (progn
          (setq session (eliscript-analysis-start))
          (let (done)
            (let ((request
                   (eliscript-analysis-search
                    session small "term3"
                    (lambda (_value error-object)
                      (should-not error-object)
                      (setq done t)))))
              (should (eq (eliscript-service-request-path request) 'reference))
              (should done)))
          (let (done result)
            (let ((request
                   (eliscript-analysis-search
                    session large "term3"
                    (lambda (value error-object)
                      (should-not error-object)
                      (setq result value done t))
                    :timeout-ms 5000)))
              (should
               (eq (eliscript-service-request-path request) 'accelerated))
              (should
               (eliscript-analysis-tests--wait
                session (lambda () done) 5.0))
              (should result)))
          (let* ((service (eliscript-analysis-session-service session))
                 (documents (eliscript-analysis-session-documents session))
                 (revision (eliscript-analysis-session-revision session)))
            (should
             (eq
              (eliscript-service--path
               eliscript-analysis--frequencies-operation
               (list documents revision) nil)
              'reference))
            (should-error
             (eliscript-service-call-sync
              service 'search-documents
              (list documents "term3" (1+ revision))
              :path 'accelerated :timeout-ms 5000)
             :type 'eliscript-service-error)
            (eliscript-service-restart service)
            (should
             (equal
              (eliscript-analysis-search-sync
               session large "term3" :path 'accelerated :timeout-ms 5000)
              (eliscript-analysis-search-sync
               session large "term3" :path 'reference)))))
      (when session (eliscript-analysis-stop session)))))

(provide 'eliscript-analysis-tests)

;;; eliscript-analysis-tests.el ends here
