;;; eliscript-worker-tests.el --- Worker integration tests -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'eliscript)
(require 'eliscript-worker)
(require 'eliscript-value-stream)
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

(ert-deftest eliscript-emacs-value-codec-preserves-language-categories ()
  (let* ((metadata
          (eliscript-value-map
           (vector (cons (eliscript-value-keyword "source") "emacs"))))
         (value
          (eliscript-value-list
           (vector
            (eliscript-value-keyword "ready" "app")
            (eliscript-value-symbol "item" "model" metadata)
            (eliscript-value-vector
             (vector eliscript-worker-value-undefined -0.0 0.0e+NaN))
            (eliscript-value-set (vector "beta" "alpha"))
            (eliscript-value-object
             (vector (cons "ready" :false))))
           metadata))
         (wire (eliscript-worker-value-encode value))
         (decoded (eliscript-worker-value-decode wire))
         (vector-value
          (aref (eliscript-value-list-values decoded) 2)))
    (should (eliscript-value-list-p decoded))
    (should (equal (eliscript-value-list-metadata decoded) metadata))
    (should (equal (aref (eliscript-value-list-values decoded) 0)
                   (eliscript-value-keyword "ready" "app")))
    (should (equal (eliscript-value-symbol-metadata
                    (aref (eliscript-value-list-values decoded) 1))
                   metadata))
    (should (eq (aref (eliscript-value-vector-values vector-value) 0)
                eliscript-worker-value-undefined))
    (should (< (copysign
                1.0
                (aref (eliscript-value-vector-values vector-value) 1))
               0.0))
    (should (isnan
             (aref (eliscript-value-vector-values vector-value) 2)))
    (should (equal (eliscript-worker-value-encode decoded) wire))
    (should (equal
             (eliscript-worker-value-encode
              (eliscript-value-set (vector "😀" "\uE000")))
             ["set" ["\uE000" "😀"] nil]))
    (let ((cycle (vector nil)))
      (aset cycle 0 cycle)
      (should-error (eliscript-worker-value-encode cycle)
                    :type 'eliscript-value-codec-error))
    (should-error
     (eliscript-worker-value-decode ["array" [1 2 3]]
                                    '((max-collection-length . 2)))
     :type 'eliscript-value-codec-error)))

(ert-deftest eliscript-emacs-value-stream-is-incremental-and-bounded ()
  (let* ((limits '((max-chunk-bytes . 256)
                   (max-events-per-chunk . 5)
                   (max-text-part-units . 3)))
         (metadata
          (eliscript-value-map
           (vector (cons (eliscript-value-keyword "source") "emacs"))))
         (value
          (eliscript-value-list
           (vector
            (eliscript-value-keyword "ready" "app")
            (eliscript-value-symbol "item" "model" metadata)
            (eliscript-value-vector
             (vector eliscript-worker-value-undefined -0.0 0.0e+NaN))
            (eliscript-value-set (vector "beta" "alpha"))
            (eliscript-value-object (vector (cons "ready" :false)))
            (concat (make-string 1000 ?a) "😀done"))
           metadata))
         (encoder (eliscript-worker-value-stream-encoder value limits))
         (decoder (eliscript-worker-value-stream-decoder limits))
         chunk
         (chunk-count 0))
    (while (setq chunk
                 (eliscript-worker-value-stream-next-chunk encoder))
      (cl-incf chunk-count)
      (should (<= (length chunk) 5))
      (should
       (<= (string-bytes
            (encode-coding-string
             (json-serialize chunk :null-object nil :false-object :false)
             'utf-8-unix t))
           256))
      (eliscript-worker-value-stream-write decoder chunk))
    (should (> chunk-count 1))
    (should (equal (eliscript-worker-value-stream-finish decoder) value))

    (let ((cycle (vector nil)))
      (aset cycle 0 cycle)
      (let ((cycle-encoder
             (eliscript-worker-value-stream-encoder cycle)))
        (should-error
         (while (eliscript-worker-value-stream-next-chunk cycle-encoder))
         :type 'eliscript-value-stream-error)))

    (let ((truncated (eliscript-worker-value-stream-decoder)))
      (eliscript-worker-value-stream-write
       truncated [["text" 4] ["text-part" "ab"]])
      (should-error (eliscript-worker-value-stream-finish truncated)
                    :type 'eliscript-value-stream-error))

    (let ((wide (eliscript-worker-value-stream-decoder
                 '((max-chunk-bytes . 32)))))
      (should-error
       (eliscript-worker-value-stream-write
        wide [["text" 20] ["text-part" "xxxxxxxxxxxxxxxxxxxx"]])
       :type 'eliscript-value-stream-error))

    (let ((duplicate (eliscript-worker-value-stream-decoder)))
      (should-error
       (eliscript-worker-value-stream-write
        duplicate
        [["open" "object" 2]
         ["text" 1] ["text-part" "x"] ["value" 1]
         ["text" 1] ["text-part" "x"] ["value" 2]])
       :type 'eliscript-value-stream-error))))

(ert-deftest eliscript-emacs-client-negotiates-persistent-value-codec ()
  (let* ((directory (make-temp-file "eliscript-value-codec-worker-" t))
         (source (expand-file-name "codec.eli" directory))
         (module (expand-file-name "codec.mjs" directory))
         (progress-module (expand-file-name "progress.mjs" directory))
         worker)
    (unwind-protect
        (progn
          (with-temp-file source
            (insert
             "(defportable echo (value) value)\n"
             "(defportable value ()\n"
             "  {:ready t\n"
             "   :items '(item :ready [undefined 2])})\n"
             "(export echo value)\n"))
          (eliscript-compile-portable-file-with-source-map
           source '(echo value) module)
          (with-temp-file progress-module
            (insert
             "export async function echo(value, context) {\n"
             "  await context.progress(value);\n"
             "  return value;\n"
             "}\n"))
          (setq worker (eliscript-worker-start))
          (should (member "value-codec-v1"
                          (eliscript-worker-capabilities worker)))
          (should (member "value-chunks-v1"
                          (eliscript-worker-capabilities worker)))
          (let* ((argument
                  (eliscript-value-map
                   (vector
                    (cons
                     (eliscript-value-keyword "items")
                     (eliscript-value-vector
                      (vector 1 eliscript-worker-value-undefined 3))))))
                 (result
                  (eliscript-worker-call-portable-sync
                   worker module "echo" (list argument)
                   :value-codec t
                   :timeout-ms 2000)))
            (should (equal result argument)))
          (let* ((text (concat (make-string 600000 ?a) "😀done"))
                 (argument
                  (eliscript-value-vector
                   (vector text (eliscript-value-keyword "large"))))
                 progress
                 timing
                 (result
                  (eliscript-worker-call-sync
                   worker progress-module "echo" (list argument)
                   :value-chunks t
                   :progress (lambda (value) (setq progress value))
                   :metrics (lambda (value) (setq timing value))
                   :timeout-ms 5000)))
            (should (equal result argument))
            (should (equal progress argument))
            (should (numberp (alist-get 'serializationMs timing))))
          (let (done request-error)
            (let ((id
                   (eliscript-worker-call
                    worker progress-module "echo"
                    (list (make-string 600000 ?z))
                    (lambda (_value error-object)
                      (setq request-error error-object
                            done t))
                    :value-chunks t
                    :timeout-ms 5000)))
              (should (eliscript-worker-cancel worker id))
              (should
               (eliscript-worker-tests--wait
                worker (lambda () done) 2.0))
              (should (equal (alist-get 'code request-error) "cancelled"))))
          (let* ((result
                  (eliscript-worker-call-portable-sync
                   worker module "value" nil
                   :value-codec t
                   :timeout-ms 2000))
                 (entries (eliscript-value-map-entries result))
                 (items
                  (cdr
                   (cl-find-if
                    (lambda (entry)
                      (equal (car entry)
                             (eliscript-value-keyword "items")))
                    entries)))
                 (values (eliscript-value-list-values items))
                 (vector-value (aref values 2)))
            (should (eliscript-value-map-p result))
            (should (eliscript-value-list-p items))
            (should (eliscript-value-symbol-p (aref values 0)))
            (should (equal (aref values 1)
                           (eliscript-value-keyword "ready")))
            (should (eliscript-value-vector-p vector-value))
            (should (eq (aref
                         (eliscript-value-vector-values vector-value) 0)
                        eliscript-worker-value-undefined))
            (should (= (aref
                        (eliscript-value-vector-values vector-value) 1)
                       2))))
      (when worker (eliscript-worker-stop worker t))
      (delete-directory directory t))))

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

(ert-deftest eliscript-emacs-client-tracks-project-graph-and-dependency-maps ()
  (let* ((root (make-temp-file "eliscript-worker-project-" t))
         (entry (expand-file-name "main.eli" root))
         (dependency (expand-file-name "dependency.eli" root))
         (out-dir (expand-file-name "build" root))
         worker)
    (unwind-protect
        (progn
          (with-temp-file entry
            (insert
             "(import-portable \"./dependency.eli\" explode)\n"
             "(defportable run (value) (explode value))\n"))
          (with-temp-file dependency
            (insert "(defportable explode (value)\n  (value))\n"))
          (let* ((first
                  (eliscript-project-build-portable
                   entry '(run) out-dir root))
                 (module
                  (eliscript-project-build-result-entry-output first))
                 (manifest
                  (eliscript-project-build-result-manifest first))
                 (entry-text
                  (with-temp-buffer
                    (insert-file-contents module)
                    (buffer-string))))
            (setq worker (eliscript-worker-start))
            (let* ((error-data
                    (should-error
                     (eliscript-worker-call-portable-sync
                      worker module "run" '(7)
                      :project-manifest manifest
                      :timeout-ms 2000)
                     :type 'eliscript-worker-request-error))
                   (error-object (nth 2 error-data))
                   (location
                    (eliscript-worker-error-location error-object)))
              (should (equal (alist-get 'file location)
                             (file-truename dependency)))
              (should (= (alist-get 'line location) 2)))
            (with-temp-file dependency
              (insert "(defportable explode (value)\n  (1+ value))\n"))
            (let ((second
                   (eliscript-project-build-portable
                    entry '(run) out-dir root)))
              (should-not
               (equal (eliscript-project-build-result-digest first)
                      (eliscript-project-build-result-digest second)))
              (should
               (equal entry-text
                      (with-temp-buffer
                        (insert-file-contents module)
                        (buffer-string))))
              (should
               (= 8
                  (eliscript-worker-call-portable-sync
                   worker module "run" '(7)
                   :project-manifest
                   (eliscript-project-build-result-manifest second)
                   :timeout-ms 2000)))
              (should (= (eliscript-worker-generation worker) 2))
              (should (= (eliscript-worker-restart-count worker) 1)))))
      (when worker (eliscript-worker-stop worker t))
      (delete-directory root t))))

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
            (should (= (alist-get 'sourceMapCount (aref timing-values 0)) 3))
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
