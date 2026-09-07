;;; lifecycle-soak.el --- Long-lived worker lifecycle soak -*- lexical-binding: t; -*-

;;; Commentary:

;; Exercise one Emacs client across a fixed request corpus and deliberate worker
;; lifecycle faults.  The default 100,000-request run is the M12 worker soak.

;;; Code:

(defconst eliscript-worker-soak--script-directory
  (file-name-directory (or load-file-name buffer-file-name)))

(defconst eliscript-worker-soak--project-directory
  (expand-file-name "../.." eliscript-worker-soak--script-directory))

(add-to-list
 'load-path
 (expand-file-name "compiler" eliscript-worker-soak--project-directory))
(add-to-list 'load-path eliscript-worker-soak--script-directory)

(require 'cl-lib)
(require 'json)
(require 'seq)
(require 'subr-x)
(require 'eliscript)
(require 'eliscript-worker)

(defconst eliscript-worker-soak-format "eliscript-worker-lifecycle-soak")
(defconst eliscript-worker-soak-version 1)
(defconst eliscript-worker-soak--modulus 1000000007)

(defun eliscript-worker-soak--positive-environment (name default)
  "Return positive integer environment variable NAME or DEFAULT."
  (let ((text (getenv name)))
    (if text
        (progn
          (unless (string-match-p "\\`[0-9]+\\'" text)
            (error "%s must be a positive integer" name))
          (let ((value (string-to-number text)))
            (unless (> value 0) (error "%s must be positive" name))
            value))
      default)))

(defun eliscript-worker-soak--rss-kib (pid)
  "Return resident memory for PID in KiB, or nil when unavailable."
  (when (and (integerp pid) (> pid 0))
    (let ((rss (alist-get 'rss (process-attributes pid))))
      (and (integerp rss) (>= rss 0) rss))))

(defun eliscript-worker-soak--median (values)
  "Return the median of numeric VALUES."
  (let* ((sorted (sort (copy-sequence values) #'<))
         (middle (/ (length sorted) 2)))
    (unless sorted (error "cannot take median of an empty sequence"))
    (if (= (% (length sorted) 2) 1)
        (nth middle sorted)
      (/ (+ (nth (1- middle) sorted) (nth middle sorted)) 2.0))))

(defun eliscript-worker-soak--file-digest (relative-file)
  "Return SHA-256 for repository-relative RELATIVE-FILE."
  (with-temp-buffer
    (set-buffer-multibyte nil)
    (insert-file-contents-literally
     (expand-file-name relative-file eliscript-worker-soak--project-directory))
    (secure-hash 'sha256 (current-buffer))))

(defun eliscript-worker-soak--source-files ()
  "Return the complete source contract for the worker soak."
  (append
   (mapcar
    (lambda (file) (concat "compiler/" (file-name-nondirectory file)))
    (sort
     (directory-files
      (expand-file-name "compiler" eliscript-worker-soak--project-directory)
      t "\\.el\\'")
     #'string<))
   '("platform/worker.mjs"
     "runtime/worker.mjs"
     "tools/worker/eliscript-value-codec.el"
     "tools/worker/eliscript-value-stream.el"
     "tools/worker/eliscript-worker.el"
     "tools/worker/lifecycle-soak.el")))

(defun eliscript-worker-soak--source-contract ()
  "Return file-level and aggregate source identities for this soak."
  (let* ((entries
          (mapcar
           (lambda (file)
             (cons file (eliscript-worker-soak--file-digest file)))
           (eliscript-worker-soak--source-files)))
         (aggregate
          (mapconcat
           (lambda (entry) (format "%s:%s\n" (car entry) (cdr entry)))
           entries "")))
    `((digest . ,(secure-hash 'sha256 aggregate))
      (files . ,(vconcat
                 (mapcar
                  (lambda (entry)
                    `((file . ,(car entry)) (sha256 . ,(cdr entry))))
                  entries))))))

(defun eliscript-worker-soak--program-version (program)
  "Return the first version line printed by PROGRAM."
  (with-temp-buffer
    (let ((status (call-process program nil t nil "--version")))
      (unless (and (integerp status) (zerop status))
        (error "%s --version failed" program))
      (car (split-string (string-trim (buffer-string)) "\n" t)))))

(defun eliscript-worker-soak--source (revision)
  "Return the deterministic worker module source for REVISION."
  (format
   (concat
    "(module soak.worker\n"
    "  (defconst revision %d)\n\n"
    "  (defun evaluate-request (request salt)\n"
    "    (%% (+ (* request 17) salt revision) 1000000007))\n\n"
    "  (defconst delayed-echo\n"
    "    (js* \"(value, delayMs, context) => new Promise((resolve, reject) => { context.progress({stage: 'started'}); const timer = setTimeout(() => resolve(value), delayMs); context.signal.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('operation aborted')); }, {once: true}); })\"))\n\n"
    "  (defconst blocking-echo\n"
    "    (js* \"(value, delayMs) => { const deadline = performance.now() + delayMs; while (performance.now() < deadline) {} return value; }\"))\n\n"
    "  (export evaluate-request delayed-echo blocking-echo))\n")
   revision))

(defun eliscript-worker-soak--compile-module (source module revision)
  "Compile REVISION of temporary Eliscript SOURCE to MODULE."
  (with-temp-file source
    (insert (eliscript-worker-soak--source revision)))
  (eliscript-compile-file-with-source-map source module))

(defun eliscript-worker-soak--wait (worker predicate timeout-seconds)
  "Wait on WORKER until PREDICATE succeeds or TIMEOUT-SECONDS expires."
  (let ((deadline (+ (float-time) timeout-seconds)))
    (while (and (not (funcall predicate)) (< (float-time) deadline))
      (accept-process-output (eliscript-worker-process worker) 0.01))
    (funcall predicate)))

(defun eliscript-worker-soak--steady-state (samples allowance-kib)
  "Summarize steady-state SAMPLES under ALLOWANCE-KIB growth."
  (unless (>= (length samples) 4)
    (error "steady-state analysis requires at least four checkpoints"))
  (let* ((window (last samples 4))
         (emacs-values (mapcar (lambda (sample) (alist-get 'emacsKiB sample)) window))
         (worker-values (mapcar (lambda (sample) (alist-get 'workerKiB sample)) window))
         (initial-emacs (eliscript-worker-soak--median (seq-take emacs-values 2)))
         (final-emacs (eliscript-worker-soak--median (last emacs-values 2)))
         (initial-worker (eliscript-worker-soak--median (seq-take worker-values 2)))
         (final-worker (eliscript-worker-soak--median (last worker-values 2)))
         (emacs-delta (- final-emacs initial-emacs))
         (worker-delta (- final-worker initial-worker)))
    `((checkpoints . ,(length samples))
      (warmupCheckpoints . ,(- (length samples) 4))
      (initialMedianKiB . ((emacs . ,initial-emacs) (worker . ,initial-worker)))
      (finalMedianKiB . ((emacs . ,final-emacs) (worker . ,final-worker)))
      (deltaKiB . ((emacs . ,emacs-delta) (worker . ,worker-delta)))
      (allowanceKiB . ,allowance-kib)
      (bounded . ,(and (<= emacs-delta allowance-kib)
                       (<= worker-delta allowance-kib))))))

(defun eliscript-worker-soak--cross-generation-state
    (generation-memory allowance-kib)
  "Compare final steady windows in GENERATION-MEMORY under ALLOWANCE-KIB."
  (let* ((first (car generation-memory))
         (final (car (last generation-memory)))
         (first-values
          (alist-get 'finalMedianKiB (alist-get 'steadyState first)))
         (final-values
          (alist-get 'finalMedianKiB (alist-get 'steadyState final)))
         (emacs-delta
          (- (alist-get 'emacs final-values) (alist-get 'emacs first-values)))
         (worker-delta
          (- (alist-get 'worker final-values) (alist-get 'worker first-values))))
    `((fromGeneration . ,(alist-get 'generation first))
      (toGeneration . ,(alist-get 'generation final))
      (initialMedianKiB . ,first-values)
      (finalMedianKiB . ,final-values)
      (deltaKiB . ((emacs . ,emacs-delta) (worker . ,worker-delta)))
      (allowanceKiB . ,allowance-kib)
      (bounded . ,(and (<= emacs-delta allowance-kib)
                       (<= worker-delta allowance-kib))))))

(defun eliscript-worker-soak--run ()
  "Run the fixed worker lifecycle soak and return its report."
  (let* ((requests
          (eliscript-worker-soak--positive-environment
           "ELISCRIPT_WORKER_SOAK_REQUESTS" 100000))
         (batch-size
          (eliscript-worker-soak--positive-environment
           "ELISCRIPT_WORKER_SOAK_BATCH_SIZE" 64))
         (checkpoint-every
          (eliscript-worker-soak--positive-environment
           "ELISCRIPT_WORKER_SOAK_CHECKPOINT_EVERY" 2500))
         (timeout-seconds
          (eliscript-worker-soak--positive-environment
           "ELISCRIPT_WORKER_SOAK_TIMEOUT_SECONDS" 180))
         (emacs-budget-kib
          (* 1024 (eliscript-worker-soak--positive-environment
                   "ELISCRIPT_WORKER_SOAK_EMACS_BUDGET_MIB" 512)))
         (worker-budget-kib
          (* 1024 (eliscript-worker-soak--positive-environment
                   "ELISCRIPT_WORKER_SOAK_WORKER_BUDGET_MIB" 512)))
         (combined-budget-kib
          (* 1024 (eliscript-worker-soak--positive-environment
                   "ELISCRIPT_WORKER_SOAK_COMBINED_BUDGET_MIB" 768)))
         (trend-allowance-kib
          (* 1024 (eliscript-worker-soak--positive-environment
                   "ELISCRIPT_WORKER_SOAK_TREND_ALLOWANCE_MIB" 16)))
         (acceptance-qualified
          (if (and (= requests 100000)
                   (= batch-size 64)
                   (= checkpoint-every 2500)
                   (= timeout-seconds 180)
                   (= emacs-budget-kib (* 512 1024))
                   (= worker-budget-kib (* 512 1024))
                   (= combined-budget-kib (* 768 1024))
                   (= trend-allowance-kib (* 16 1024)))
              t
            :false))
         (phase-units (/ requests 10))
         (phase-counts
          (list phase-units phase-units (* phase-units 2)
                (* phase-units 2) (* phase-units 2)
                (- requests (* phase-units 8))))
         (directory (make-temp-file "eliscript-worker-soak-" t))
         (source (expand-file-name "worker-soak.eli" directory))
         (module (expand-file-name "worker-soak.mjs" directory))
         (eliscript-worker-program
          (or (getenv "BUN") eliscript-worker-program))
         (started (float-time))
         (deadline (+ started timeout-seconds))
         (seen (make-bool-vector requests nil))
         (successful 0)
         (response-count 0)
         (duplicate-count 0)
         (peak-in-flight 0)
         (checksum 0)
         (expected-checksum 0)
         (next-checkpoint checkpoint-every)
         (samples nil)
         (processes nil)
         (known-pids nil)
         (emacs-pid (emacs-pid))
         (emacs-peak-kib 0)
         (worker-peak-kib 0)
         (combined-peak-kib 0)
         (memory-sample-count 0)
         (fault-callbacks 0)
         (fault-events nil)
         clean-shutdown
         worker
         report)
    (unless (= requests 100000)
      (message "Eliscript worker soak diagnostic request count: %d" requests))
    (unless (and (>= requests 100)
                 (<= batch-size requests)
                 (<= checkpoint-every phase-units))
      (error "request, batch, and checkpoint configuration cannot cover every phase"))
    (cl-labels
        ((current-process
           () (and worker (eliscript-worker-process worker)))
         (register-process
           ()
           (let* ((process (current-process))
                  (pid (and process (process-id process))))
             (when (and (process-live-p process) (not (memq pid known-pids)))
               (push pid known-pids)
               (push process processes))
             pid))
         (sample-memory
           (&optional checkpoint phase)
           (let* ((pid (register-process))
                  (emacs-rss (or (eliscript-worker-soak--rss-kib emacs-pid) 0))
                  (worker-rss (or (eliscript-worker-soak--rss-kib pid) 0))
                  (combined (+ emacs-rss worker-rss)))
             (cl-incf memory-sample-count)
             (setq emacs-peak-kib (max emacs-peak-kib emacs-rss)
                   worker-peak-kib (max worker-peak-kib worker-rss)
                   combined-peak-kib (max combined-peak-kib combined))
             (when checkpoint
               (push `((request . ,checkpoint)
                       (phase . ,phase)
                       (generation . ,(eliscript-worker-generation worker))
                       (pid . ,pid)
                       (emacsKiB . ,emacs-rss)
                       (workerKiB . ,worker-rss))
                     samples))))
         (checkpoint
           (phase)
           (while (<= next-checkpoint successful)
             (garbage-collect)
             (sample-memory next-checkpoint phase)
             (setq next-checkpoint (+ next-checkpoint checkpoint-every))))
         (assert-ready
           (label)
           (unless (and (eliscript-worker-live-p worker)
			(eq (eliscript-worker-state worker) 'ready))
             (error "%s did not leave a ready worker" label))
           (unless (= (hash-table-count (eliscript-worker-pending worker)) 0)
             (error "%s left pending requests" label)))
         (wait-until
           (predicate label)
           (while (and (not (funcall predicate)) (< (float-time) deadline))
             (accept-process-output (current-process) 0.01)
             (sample-memory))
           (unless (funcall predicate)
             (error "%s exceeded the soak deadline" label)))
         (run-phase
           (phase count revision)
           (let ((remaining count))
             (while (> remaining 0)
               (let* ((issued (min batch-size remaining))
                      (batch-completed 0)
                      first-error)
                 (dotimes (offset issued)
                   (let* ((request (+ successful offset))
                          (expected
                           (% (+ (* request 17) 31 revision)
                              eliscript-worker-soak--modulus)))
                     (setq expected-checksum
                           (% (+ expected-checksum expected)
                              eliscript-worker-soak--modulus))
                     (eliscript-worker-call
                      worker module "evaluate_request" (list request 31)
                      (lambda (value error-object)
			(cl-incf response-count)
			(cl-incf batch-completed)
			(when (aref seen request) (cl-incf duplicate-count))
			(aset seen request t)
			(cond
                         (error-object
                          (unless first-error
                            (setq first-error
                                  (format "request %d failed: %S"
                                          request error-object))))
                         ((not (equal value expected))
                          (unless first-error
                            (setq first-error
                                  (format "request %d returned %S, expected %S"
                                          request value expected))))
                         (t
                          (setq checksum
				(% (+ checksum value)
                                   eliscript-worker-soak--modulus)))))
                      :module-version (format "revision-%d" revision)
                      :timeout-ms 5000)
                     (setq peak-in-flight
                           (max peak-in-flight
				(hash-table-count
                                 (eliscript-worker-pending worker))))))
                 (register-process)
                 (wait-until (lambda () (= batch-completed issued)) phase)
                 (when first-error (error "%s" first-error))
                 (cl-incf successful issued)
                 (setq remaining (- remaining issued))
                 (checkpoint phase)
                 (assert-ready phase)))))
         (fault-result
           (name expected-code thunk)
           (let ((before fault-callbacks)
                 done
                 error-object)
             (funcall
              thunk
              (lambda (_value request-error)
		(cl-incf fault-callbacks)
		(setq error-object request-error
                      done t)))
             (wait-until (lambda () done) name)
             (unless (= fault-callbacks (1+ before))
               (error "%s callback count was not exactly one" name))
             (unless (equal (alist-get 'code error-object) expected-code)
               (error "%s returned %S, expected %s"
                      name error-object expected-code))
             (push `((name . ,name)
                     (errorCode . ,expected-code)
                     (callbackCount . 1)
                     (pendingAfter . ,(hash-table-count
                                       (eliscript-worker-pending worker))))
                   fault-events)
             error-object)))
      (unwind-protect
          (progn
            (eliscript-worker-soak--compile-module source module 1)
            (setq worker (eliscript-worker-start))
            (register-process)
            (sample-memory)

            (run-phase "generation-1-a" (nth 0 phase-counts) 1)

            (let (progress request-id)
              (fault-result
               "cooperative-cancellation" "cancelled"
               (lambda (callback)
                 (setq request-id
                       (eliscript-worker-call
                        worker module "delayed_echo" '("cancel" 5000) callback
                        :module-version "revision-1"
                        :progress (lambda (value) (setq progress value))
                        :timeout-ms 5000))
                 (unless (eliscript-worker-soak--wait
                          worker (lambda () progress) 2.0)
                   (error "cooperative cancellation emitted no progress"))
                 (unless (equal (alist-get 'stage progress) "started")
                   (error "unexpected cancellation progress: %S" progress))
                 (unless (eliscript-worker-cancel worker request-id)
                   (error "worker rejected cooperative cancellation")))))
            (assert-ready "cooperative cancellation")

            (run-phase "generation-1-b" (nth 1 phase-counts) 1)

            (let ((before (eliscript-worker-generation worker)))
              (eliscript-worker-restart worker)
              (register-process)
              (unless (= (eliscript-worker-generation worker) (1+ before))
                (error "explicit restart did not advance generation"))
              (push `((name . "explicit-restart")
                      (fromGeneration . ,before)
                      (toGeneration . ,(eliscript-worker-generation worker))
                      (pendingAfter . ,(hash-table-count
                                        (eliscript-worker-pending worker))))
                    fault-events))

            (run-phase "generation-2" (nth 2 phase-counts) 1)

            (eliscript-worker-soak--compile-module source module 2)
            (let ((before (eliscript-worker-generation worker)))
              (run-phase "generation-3-module-replacement"
                         (nth 3 phase-counts) 2)
              (unless (= (eliscript-worker-generation worker) (1+ before))
                (error "module replacement did not advance generation"))
              (push `((name . "module-replacement")
                      (fromGeneration . ,before)
                      (toGeneration . ,(eliscript-worker-generation worker))
                      (revision . 2)
                      (pendingAfter . ,(hash-table-count
                                        (eliscript-worker-pending worker))))
                    fault-events))

            (let ((before (eliscript-worker-generation worker))
                  timeout-error)
              (condition-case error-data
                  (eliscript-worker-call-sync
                   worker module "blocking_echo" '("late" 1000)
                   :module-version "revision-2" :timeout-ms 25)
                (eliscript-worker-timeout (setq timeout-error error-data)))
              (unless timeout-error
                (error "blocking request did not trigger client timeout"))
              (cl-incf fault-callbacks)
              (unless (= (hash-table-count (eliscript-worker-pending worker)) 0)
                (error "blocking timeout left pending requests"))
              (push `((name . "blocking-timeout")
                      (fromGeneration . ,before)
                      (errorCode . "timeout")
                      (callbackCount . 1)
                      (workerStopped . ,(not (eliscript-worker-live-p worker)))
                      (pendingAfter . 0))
                    fault-events))

            (run-phase "generation-4-timeout-recovery" (nth 4 phase-counts) 2)

            (let ((before (eliscript-worker-generation worker))
                  progress)
              (fault-result
               "process-death" "worker-exit"
               (lambda (callback)
                 (eliscript-worker-call
                  worker module "delayed_echo" '("death" 5000) callback
                  :module-version "revision-2"
                  :progress (lambda (value) (setq progress value))
                  :timeout-ms 5000)
                 (unless (eliscript-worker-soak--wait
                          worker (lambda () progress) 2.0)
                   (error "process-death request emitted no progress"))
                 (delete-process (eliscript-worker-process worker))))
              (unless (not (eliscript-worker-live-p worker))
                (error "deliberately terminated worker remained live"))
              (setf (alist-get 'fromGeneration (car fault-events)) before))

            (run-phase "generation-5-death-recovery" (nth 5 phase-counts) 2)

            (unless (and (= successful requests)
                         (= response-count requests)
                         (= duplicate-count 0)
                         (= checksum expected-checksum)
                         (not (seq-contains-p seen nil)))
              (error
               "request integrity failed: successful=%d responses=%d duplicates=%d checksum=%d expected=%d"
               successful response-count duplicate-count checksum expected-checksum))
            (assert-ready "completed request corpus")
            (garbage-collect)
            (sample-memory)

            (let* ((ordered-samples (nreverse samples))
                   (generations
                    (delete-dups
                     (mapcar (lambda (sample) (alist-get 'generation sample))
                             ordered-samples)))
                   (generation-memory
                    (mapcar
                     (lambda (generation)
                       (let* ((generation-samples
                               (seq-filter
                                (lambda (sample)
                                  (= (alist-get 'generation sample) generation))
                                ordered-samples))
                              (steady
                               (eliscript-worker-soak--steady-state
                                generation-samples trend-allowance-kib)))
                         `((generation . ,generation)
                           (pid . ,(alist-get 'pid (car generation-samples)))
                           (checkpointCount . ,(length generation-samples))
                           (steadyState . ,steady))))
                     generations))
                   (global-steady
                    (eliscript-worker-soak--cross-generation-state
                     generation-memory trend-allowance-kib))
                   (bounded-trend
                    (and (alist-get 'bounded global-steady)
                         (seq-every-p
                          (lambda (generation)
                            (alist-get 'bounded
                                       (alist-get 'steadyState generation)))
                          generation-memory)))
                   (within-budget
                    (and (<= emacs-peak-kib emacs-budget-kib)
                         (<= worker-peak-kib worker-budget-kib)
                         (<= combined-peak-kib combined-budget-kib))))
              (unless bounded-trend
                (error "worker soak memory growth exceeded the steady-state allowance"))
              (unless within-budget
                (error "worker soak memory exceeded an absolute budget"))
              (let ((final-generation (eliscript-worker-generation worker))
                    (restart-count (eliscript-worker-restart-count worker))
                    (final-process (eliscript-worker-process worker)))
                (eliscript-worker-stop worker)
                (setq clean-shutdown
                      (and (not (eliscript-worker-live-p worker))
                           (eq (eliscript-worker-state worker) 'closed)
                           (eq (process-status final-process) 'exit)
                           (zerop (process-exit-status final-process))))
                (unless clean-shutdown
                  (error "worker did not complete a clean protocol shutdown"))
                (setq report
                      `((schemaVersion . 1)
			(format . ,eliscript-worker-soak-format)
			(version . ,eliscript-worker-soak-version)
			(verified . t)
                        (acceptanceQualified . ,acceptance-qualified)
			(limits
			 . ((runTimeoutSeconds . ,timeout-seconds)
                            (requestTimeoutMs . 5000)
                            (blockingTimeoutMs . 25)))
			(workload
			 . ((successfulRequests . ,successful)
                            (responseCount . ,response-count)
                            (uniqueResponses . ,(- response-count duplicate-count))
                            (duplicateResponses . ,duplicate-count)
                            (lostResponses . ,(- requests response-count))
                            (batchSize . ,batch-size)
                            (peakInFlight . ,peak-in-flight)
                            (checkpointEvery . ,checkpoint-every)
                            (resultChecksum . ,checksum)
                            (expectedChecksum . ,expected-checksum)))
			(recovery
			 . ((events . ,(vconcat (nreverse fault-events)))
                            (faultCallbacks . ,fault-callbacks)
                            (initialGeneration . 1)
                            (finalGeneration . ,final-generation)
                            (restartCount . ,restart-count)))
			(memory
			 . ((unit . "KiB")
                            (withinBudget . ,within-budget)
                            (boundedTrend . ,bounded-trend)
                            (sampleCount . ,memory-sample-count)
                            (peakKiB
                             . ((emacs . ,emacs-peak-kib)
				(worker . ,worker-peak-kib)
				(combined . ,combined-peak-kib)))
                            (budgetKiB
                             . ((emacs . ,emacs-budget-kib)
				(worker . ,worker-budget-kib)
				(combined . ,combined-budget-kib)))
                            (steadyState . ,global-steady)
                            (generations . ,(vconcat generation-memory))
                            (checkpoints . ,(vconcat ordered-samples))))
			(lifecycle
			 . ((pendingAfterCorpus . 0)
                            (ownedProcessCount . ,(length processes))
                            (ownedPids . ,(vconcat (nreverse known-pids)))))
			(elapsedMs . ,(* 1000.0 (- (float-time) started)))
			(host
			 . ((systemType . ,(symbol-name system-type))
                            (systemConfiguration . ,system-configuration)
                            (emacsVersion . ,emacs-version)
                            (javascriptProgram
                             . ,(file-name-nondirectory eliscript-worker-program))
                            (javascriptVersion
                             . ,(eliscript-worker-soak--program-version
				 eliscript-worker-program))))
			(source . ,(eliscript-worker-soak--source-contract)))))))
	(when worker (ignore-errors (eliscript-worker-stop worker t)))
	(dolist (process processes)
          (when (process-live-p process) (ignore-errors (delete-process process))))
	(delete-directory directory t)
	(dolist (process processes)
	  (when (process-live-p process)
            (error "owned worker process remained live after cleanup")))
	(let ((reap-deadline (+ (float-time) 2.0)))
	  (while (and (seq-some #'eliscript-worker-soak--rss-kib known-pids)
                      (< (float-time) reap-deadline))
            (accept-process-output nil 0.01))
	  (when (seq-some #'eliscript-worker-soak--rss-kib known-pids)
            (error "owned worker PID remained present after cleanup")))
	(when (file-exists-p directory)
          (error "worker soak temporary directory remained after cleanup")))
      (setf (alist-get 'reclaimedProcessCount (alist-get 'lifecycle report))
            (length processes)
            (alist-get 'temporaryDirectoryRemoved (alist-get 'lifecycle report))
            (not (file-exists-p directory))
            (alist-get 'cleanShutdown (alist-get 'lifecycle report))
            clean-shutdown)
      report)))

(condition-case error-data
    (let* ((report (eliscript-worker-soak--run))
           (json
            (concat
             (json-serialize report :null-object nil :false-object :false)
             "\n"))
           (output (getenv "ELISCRIPT_WORKER_SOAK_OUTPUT")))
      (if output
          (with-temp-file output (insert json))
        (princ json)))
  (error
   (message "eliscript worker lifecycle soak: %s"
            (error-message-string error-data))
   (kill-emacs 1)))

;;; lifecycle-soak.el ends here
