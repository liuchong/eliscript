;;; value-stream-probe.el --- Large worker value-stream probe -*- lexical-binding: t; -*-

;;; Commentary:

;; Run a real chunked Emacs -> Bun -> Emacs string round trip and report
;; per-process resident-memory peaks.  The default dataset is small enough for
;; automated tests.  Set ELISCRIPT_VALUE_STREAM_PROBE_MIB=256 for PD-08.

;;; Code:

(let* ((script-directory
        (file-name-directory (or load-file-name buffer-file-name)))
       (project-directory (expand-file-name "../.." script-directory)))
  (add-to-list 'load-path (expand-file-name "compiler" project-directory))
  (add-to-list 'load-path script-directory))

(require 'cl-lib)
(require 'json)
(require 'subr-x)
(require 'eliscript-worker)

(defconst eliscript-value-stream-probe-format
  "eliscript-worker-value-stream-probe"
  "Format identifier emitted by the large-value probe.")

(defconst eliscript-value-stream-probe-version 1
  "Report version emitted by the large-value probe.")

(defconst eliscript-value-stream-probe--project-directory
  (expand-file-name
   "../.."
   (file-name-directory (or load-file-name buffer-file-name)))
  "Project directory containing the probe sources.")

(defconst eliscript-value-stream-probe--prepared-runtime-capsules
  '("runtime/array-text.mjs"
    "runtime/errors.mjs"
    "runtime/math.mjs"
    "runtime/number-radix.mjs"
    "runtime/prelude.mjs"
    "runtime/primitives.mjs"
    "runtime/unicode-case.mjs"
    "runtime/unicode-case-data.mjs")
  "Actual runtime capsules installed by the prepared final stage3 package.")

(defconst eliscript-value-stream-probe--prepared-runtime-sources
  '("runtime/array-text.eli"
    "runtime/errors.eli"
    "runtime/math.eli"
    "runtime/number-radix.eli"
    "runtime/prelude.eli"
    "runtime/primitives.eli"
    "runtime/unicode-case.eli")
  "Maintained sources for the prepared runtime capsules.")

(defun eliscript-value-stream-probe--positive-environment (name default)
  "Return positive integer environment variable NAME or DEFAULT."
  (let ((text (getenv name)))
    (if text
        (let ((value (string-to-number text)))
          (unless (and (string-match-p "\\`[0-9]+\\'" text) (> value 0))
            (error "%s must be a positive integer" name))
          value)
      default)))

(defun eliscript-value-stream-probe--rss-kib (pid)
  "Return resident memory for PID in KiB, or nil when unavailable."
  (when (and (integerp pid) (> pid 0))
    (let ((rss (alist-get 'rss (process-attributes pid))))
      (and (integerp rss) (>= rss 0) rss))))

(defun eliscript-value-stream-probe--file-digest (filename)
  "Return SHA-256 digest of FILENAME without normalizing its bytes."
  (with-temp-buffer
    (set-buffer-multibyte nil)
    (insert-file-contents-literally filename)
    (secure-hash 'sha256 (current-buffer))))

(defun eliscript-value-stream-probe--source-contract (prepared)
  "Return source files and their aggregate digest for this probe.
PREPARED is the freshly authenticated portable prepared stage3 identity."
  (let* ((files
          (delete-dups
           (copy-sequence
            (append
             '("runtime/worker.mjs"
               "runtime/worker-value-stream.mjs"
               "tools/worker/eliscript-worker.el"
               "tools/worker/eliscript-value-stream.el"
               "tools/worker/value-stream-probe.el"
               "tests/fixtures/worker-value-stream-probe.mjs"
               "bootstrap/runtime/memory.eli"
               "tools/runtime/unicode-case-runtime.el")
             eliscript-value-stream-probe--prepared-runtime-capsules
             eliscript-value-stream-probe--prepared-runtime-sources))))
         (entries
          (mapcar
           (lambda (file)
             (cons file
                   (eliscript-value-stream-probe--file-digest
                    (expand-file-name
                     file eliscript-value-stream-probe--project-directory))))
           files))
         (aggregate
          (mapconcat (lambda (entry)
                       (format "%s:%s\n" (car entry) (cdr entry)))
                     entries "")))
    `((digest . ,(secure-hash 'sha256 aggregate))
      (files . ,(vconcat
                 (mapcar (lambda (entry)
                           `((file . ,(car entry))
                             (sha256 . ,(cdr entry))))
                         entries)))
      (preparedCompiler . ,prepared))))

(defun eliscript-value-stream-probe--program-version (program)
  "Return the first version line printed by PROGRAM."
  (with-temp-buffer
    (let ((status (call-process program nil t nil "--version")))
      (unless (and (integerp status) (zerop status))
        (error "%s --version failed" program))
      (car (split-string (string-trim (buffer-string)) "\n" t)))))

(defun eliscript-value-stream-probe--milliseconds-since (started)
  "Return milliseconds elapsed since float time STARTED."
  (* 1000.0 (- (float-time) started)))

(defun eliscript-value-stream-probe--mib (kib)
  "Convert KIB to MiB."
  (/ kib 1024.0))

(defun eliscript-value-stream-probe--prepared-report-identity (identity)
  "Return portable prepared stage3 report IDENTITY or signal an error."
  (unless (and (listp identity)
               (equal (alist-get 'format identity) "eliscript-prepared-stage3")
               (integerp (alist-get 'version identity))
               (integerp (alist-get 'fixedPointFileCount identity))
               (stringp (alist-get 'sourceSha256 identity))
               (stringp (alist-get 'productSha256 identity)))
    (error "prepared stage3 gate returned an invalid portable identity"))
  identity)

(defun eliscript-value-stream-probe--require-prepared-stage3 ()
  "Authenticate the prepared final stage3 and return its portable identity.
Standard output must contain exactly the machine-readable JSON identity;
diagnostics stay on standard error so warnings cannot corrupt it."
  (let* ((module (expand-file-name "tools/backends/dist/release-cli.mjs"
                                   eliscript-value-stream-probe--project-directory))
         (program (or (getenv "BUN") eliscript-worker-program))
         (script (format
                  (concat "import(%S).then((m) => m.requirePreparedStage3())"
                          ".then((p) => { process.stdout.write(JSON.stringify(p.reportIdentity)); })"
                          ".catch((e) => { console.error(e && e.message); process.exit(1); })")
                  (concat "file://" module)))
         (stdout (generate-new-buffer " *eliscript-prepared-stage3-stdout*"))
         (stderr (generate-new-buffer " *eliscript-prepared-stage3-stderr*"))
         process)
    (unwind-protect
        (progn
          (setq process
                (make-process
                 :name "eliscript-value-stream-probe-prepared-stage3"
                 :command (list program "--eval" script)
                 :buffer stdout
                 :stderr stderr
                 :sentinel #'ignore
                 :noquery t))
          (while (process-live-p process)
            (accept-process-output process 0.05))
          (let ((status (process-exit-status process)))
            (unless (and (integerp status) (zerop status))
              (error "prepared stage3 is required for formal measurements: %s"
                     (let ((diagnostic
                            (string-trim
                             (with-current-buffer stderr (buffer-string)))))
                       (if (= (length diagnostic) 0)
                           (format "gate exited with status %s" status)
                         diagnostic)))))
          (eliscript-value-stream-probe--prepared-report-identity
           (with-current-buffer stdout
             (json-parse-string (string-trim (buffer-string))
                                :object-type 'alist
                                :array-type 'list
                                :null-object nil
                                :false-object :false))))
      (when (process-live-p process)
        (delete-process process))
      (kill-buffer stdout)
      (kill-buffer stderr))))

(defun eliscript-value-stream-probe-run ()
  "Run the chunked round-trip probe and return its report alist."
  (let* ((prepared (eliscript-value-stream-probe--require-prepared-stage3))
         (logical-mib
          (eliscript-value-stream-probe--positive-environment
           "ELISCRIPT_VALUE_STREAM_PROBE_MIB" 2))
         (logical-bytes (* logical-mib 1024 1024))
         (emacs-budget-mib
          (eliscript-value-stream-probe--positive-environment
           "ELISCRIPT_VALUE_STREAM_PROBE_EMACS_BUDGET_MIB" 2048))
         (worker-budget-mib
          (eliscript-value-stream-probe--positive-environment
           "ELISCRIPT_VALUE_STREAM_PROBE_WORKER_BUDGET_MIB" 1536))
         (combined-budget-mib
          (eliscript-value-stream-probe--positive-environment
           "ELISCRIPT_VALUE_STREAM_PROBE_COMBINED_BUDGET_MIB" 3072))
         (timeout-seconds
          (eliscript-value-stream-probe--positive-environment
           "ELISCRIPT_VALUE_STREAM_PROBE_TIMEOUT_SECONDS" 300))
         (max-string-units
          (alist-get 'max-string-units
                     eliscript-worker-value-stream-limits))
         (fixture
          (expand-file-name
           "tests/fixtures/worker-value-stream-probe.mjs"
           eliscript-value-stream-probe--project-directory))
         (eliscript-worker-program
          (or (getenv "BUN") eliscript-worker-program))
         (source-contract
          (eliscript-value-stream-probe--source-contract prepared))
         (started (float-time))
         (emacs-pid (emacs-pid))
         worker
         worker-pid
         emacs-baseline
         worker-baseline
         (emacs-peak 0)
         (worker-peak 0)
         (combined-peak 0)
         (sample-count 0)
         budget-exceeded
         cancel-issued
         request-id
         done
         request-error
         progress-length
         worker-timing
         source
         expected-hash
         result
         actual-hash
         construction-ms
         source-hash-ms
         round-trip-ms
         result-hash-ms
         report)
    (when (> logical-bytes max-string-units)
      (error "logical dataset exceeds stream string limit %d" max-string-units))
    (cl-labels
        ((sample-memory
          ()
          (let* ((emacs-rss
                  (or (eliscript-value-stream-probe--rss-kib emacs-pid) 0))
                 (worker-rss
                  (or (and worker-pid
                           (eliscript-value-stream-probe--rss-kib worker-pid))
                      0))
                 (combined (+ emacs-rss worker-rss)))
            (cl-incf sample-count)
            (setq emacs-peak (max emacs-peak emacs-rss)
                  worker-peak (max worker-peak worker-rss)
                  combined-peak (max combined-peak combined))
            (when (or (> emacs-rss (* emacs-budget-mib 1024))
                      (> worker-rss (* worker-budget-mib 1024))
                      (> combined (* combined-budget-mib 1024)))
              (setq budget-exceeded t)))))
      (unwind-protect
          (progn
            (garbage-collect)
            (setq worker (eliscript-worker-start)
                  worker-pid (process-id (eliscript-worker-process worker)))
            (sample-memory)
            (setq emacs-baseline emacs-peak
                  worker-baseline worker-peak)

            (let ((phase-started (float-time)))
              (setq source (make-string logical-bytes ?x)
                    construction-ms
                    (eliscript-value-stream-probe--milliseconds-since
                     phase-started)))
            (sample-memory)
            (let ((phase-started (float-time)))
              (setq expected-hash (secure-hash 'sha256 source)
                    source-hash-ms
                    (eliscript-value-stream-probe--milliseconds-since
                     phase-started)))
            (sample-memory)

            (let ((phase-started (float-time)))
              (setq request-id
                    (eliscript-worker-call
                     worker fixture "echo_text" (list source)
                     (lambda (value error-object)
                       (setq result value
                             request-error error-object
                             done t))
                     :progress
                     (lambda (value)
                       (setq progress-length value
                             source nil)
                       (garbage-collect)
                       (sample-memory))
                     :metrics
                     (lambda (timing) (setq worker-timing timing))
                     :value-chunks t
                     :timeout-ms (* timeout-seconds 1000)))
              (while (and (not done)
                          (eliscript-worker-live-p worker)
                          (< (- (float-time) phase-started) timeout-seconds))
                (accept-process-output (eliscript-worker-process worker) 0.05)
                (sample-memory)
                (when (and budget-exceeded (not cancel-issued))
                  (setq cancel-issued t)
                  (eliscript-worker-cancel worker request-id)))
              (setq round-trip-ms
                    (eliscript-value-stream-probe--milliseconds-since
                     phase-started)))
            (sample-memory)

            (unless done
              (setq request-error
                    '((code . "probe-timeout")
                      (message . "probe did not complete before its deadline"))))
            (when (and result (not request-error))
              (let ((phase-started (float-time)))
                (setq actual-hash (secure-hash 'sha256 result)
                      result-hash-ms
                      (eliscript-value-stream-probe--milliseconds-since
                       phase-started))))
            (sample-memory)

            (let* ((stream-timing (and worker-timing
                                       (alist-get 'valueStream worker-timing)))
                   (argument-chunks
                    (and stream-timing
                         (alist-get 'argumentChunks stream-timing)))
                   (response-chunks
                    (and stream-timing
                         (alist-get 'responseChunks stream-timing)))
                   (verified
                    (and (null request-error)
                         (equal progress-length logical-bytes)
                         (stringp result)
                         (= (length result) logical-bytes)
                         (stringp actual-hash)
                         (equal actual-hash expected-hash)
                         (equal (alist-get 'framing stream-timing)
                                eliscript-worker-value-framing)
                         (numberp argument-chunks)
                         (> argument-chunks 1)
                         (numberp response-chunks)
                         (> response-chunks 1)))
                   (within-budget
                    (and (not budget-exceeded)
                         (<= emacs-peak (* emacs-budget-mib 1024))
                         (<= worker-peak (* worker-budget-mib 1024))
                         (<= combined-peak (* combined-budget-mib 1024)))))
              (setq report
                    `((schemaVersion . 1)
                      (format . ,eliscript-value-stream-probe-format)
                      (version . ,eliscript-value-stream-probe-version)
                      (verified . ,(if verified t :false))
                      (withinBudget . ,(if within-budget t :false))
                      (dataset
                       . ((kind . "ascii-string-round-trip")
                          (logicalMiB . ,logical-mib)
                          (logicalBytes . ,logical-bytes)
                          (sha256 . ,expected-hash)))
                      (transport
                       . ((encoding . ,eliscript-worker-value-encoding)
                          (framing . ,eliscript-worker-value-framing)
                          (argumentChunks . ,argument-chunks)
                          (responseChunks . ,response-chunks)
                          (maxChunkBytes
                           . ,(alist-get 'maxChunkBytes stream-timing))
                          (maxEventsPerChunk
                           . ,(alist-get 'maxEventsPerChunk stream-timing))
                          (maxTextPartUnits
                           . ,(alist-get 'maxTextPartUnits stream-timing))))
                      (memory
                       . ((unit . "KiB")
                          (sampleCount . ,sample-count)
                          (emacs
                           . ((baseline . ,emacs-baseline)
                              (peak . ,emacs-peak)
                              (delta . ,(- emacs-peak emacs-baseline))
                              (peakMiB
                               . ,(eliscript-value-stream-probe--mib
                                   emacs-peak))))
                          (worker
                           . ((baseline . ,worker-baseline)
                              (peak . ,worker-peak)
                              (delta . ,(- worker-peak worker-baseline))
                              (peakMiB
                               . ,(eliscript-value-stream-probe--mib
                                   worker-peak))))
                          (combinedPeak . ,combined-peak)
                          (combinedPeakMiB
                           . ,(eliscript-value-stream-probe--mib
                               combined-peak))
                          (sumOfProcessPeaks . ,(+ emacs-peak worker-peak))))
                      (budgetsMiB
                       . ((emacsPeak . ,emacs-budget-mib)
                          (workerPeak . ,worker-budget-mib)
                          (combinedPeak . ,combined-budget-mib)))
                      (timingsMs
                       . ((datasetConstruction . ,construction-ms)
                          (sourceHash . ,source-hash-ms)
                          (roundTrip . ,round-trip-ms)
                          (resultHash . ,result-hash-ms)
                          (worker . ,worker-timing)
                          (total
                           . ,(eliscript-value-stream-probe--milliseconds-since
                               started))))
                      (host
                       . ((systemType . ,(symbol-name system-type))
                          (systemConfiguration . ,system-configuration)
                          (emacsVersion . ,emacs-version)
                          (bunVersion
                           . ,(eliscript-value-stream-probe--program-version
                               eliscript-worker-program))))
                      (source . ,source-contract)
                      (error . ,request-error)))))
        (setq source nil result nil)
        (when worker (eliscript-worker-stop worker t))
        (garbage-collect)))
    report))

(condition-case error-data
    (let ((report (eliscript-value-stream-probe-run)))
      (princ (json-serialize report :null-object nil :false-object :false))
      (princ "\n")
      (unless (and (eq (alist-get 'verified report) t)
                   (eq (alist-get 'withinBudget report) t))
        (kill-emacs 1)))
  (error
   (message "eliscript value-stream probe: %s"
            (error-message-string error-data))
   (kill-emacs 1)))

;;; value-stream-probe.el ends here
