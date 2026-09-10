;;; benchmark.el --- Eliscript worker end-to-end benchmark -*- lexical-binding: t; -*-

;;; Commentary:

;; Run in batch mode. Optional environment variables:
;; ELISCRIPT_BENCHMARK_SIZE, ELISCRIPT_BENCHMARK_ROUNDS,
;; ELISCRIPT_BENCHMARK_ITERATIONS, and BUN.

;;; Code:

(let* ((script-directory
        (file-name-directory (or load-file-name buffer-file-name)))
       (project-directory
        (expand-file-name "../.." script-directory)))
  (add-to-list 'load-path (expand-file-name "compiler" project-directory))
  (add-to-list 'load-path script-directory))

(require 'json)
(require 'eliscript)
(require 'eliscript-worker)

(defconst eliscript-worker-benchmark--project-directory
  (expand-file-name
   "../.."
   (file-name-directory (or load-file-name buffer-file-name)))
  "Project directory used by the benchmark.")

(defun eliscript-worker-benchmark--positive-environment (name default)
  "Return positive integer environment variable NAME or DEFAULT."
  (let ((text (getenv name)))
    (if text
        (let ((value (string-to-number text)))
          (unless (> value 0)
            (error "%s must be a positive integer" name))
          value)
      default)))

(defun eliscript-worker-benchmark--score-values (values rounds)
  "Return the Emacs reference score for VALUES over ROUNDS."
  (let ((total 0))
    (dotimes (round rounds)
      (dotimes (index (length values))
        (setq total
              (% (+ (* total 33) (aref values index) round)
                 1000000007))))
    total))

(defun eliscript-worker-benchmark--milliseconds-since (started)
  "Return milliseconds elapsed since float time STARTED."
  (* 1000.0 (- (float-time) started)))

(defun eliscript-worker-benchmark--temporary-directory ()
  "Return a stable temporary root for generated benchmark modules."
  (if (and (eq system-type 'darwin) (file-directory-p "/private/tmp"))
      "/private/tmp/"
    temporary-file-directory))

(defun eliscript-worker-benchmark--median (values)
  "Return the median of numeric VALUES."
  (let* ((sorted (sort (copy-sequence values) #'<))
         (count (length sorted))
         (middle (/ count 2)))
    (if (= (% count 2) 1)
        (nth middle sorted)
      (/ (+ (nth (1- middle) sorted) (nth middle sorted)) 2.0))))

(defun eliscript-worker-benchmark--ratio (numerator denominator)
  "Return NUMERATOR divided by DENOMINATOR, or nil when undefined."
  (and (> denominator 0) (/ numerator denominator)))

(defun eliscript-worker-benchmark--worker-call
    (worker module values rounds)
  "Measure one WORKER call to MODULE for VALUES and ROUNDS."
  (let ((started (float-time))
        timing)
    (let ((value
           (eliscript-worker-call-sync
            worker module "score_values" (list values rounds)
            :metrics (lambda (worker-timing) (setq timing worker-timing))
            :timeout-ms 30000)))
      `((value . ,value)
        (endToEndMs . ,(eliscript-worker-benchmark--milliseconds-since started))
        (timing . ,timing)))))

(defun eliscript-worker-benchmark-run ()
  "Run and return the worker benchmark report as an alist."
  (let* ((size
          (eliscript-worker-benchmark--positive-environment
           "ELISCRIPT_BENCHMARK_SIZE" 20000))
         (rounds
          (eliscript-worker-benchmark--positive-environment
           "ELISCRIPT_BENCHMARK_ROUNDS" 20))
         (iterations
          (eliscript-worker-benchmark--positive-environment
           "ELISCRIPT_BENCHMARK_ITERATIONS" 5))
         (values (make-vector size 0))
         (temporary-file-directory
          (eliscript-worker-benchmark--temporary-directory))
         (directory (make-temp-file "eliscript-worker-benchmark-" t))
         (fixture
          (expand-file-name "tests/fixtures/worker.eli"
                            eliscript-worker-benchmark--project-directory))
         (module (expand-file-name "worker.mjs" directory))
         worker)
    (dotimes (index size) (aset values index (% index 997)))
    (unwind-protect
        (let* ((compile-started (float-time))
               (_compiled (eliscript-compile-file fixture module))
               (compile-ms
                (eliscript-worker-benchmark--milliseconds-since
                 compile-started))
               (emacs-samples nil)
               checksum)
          (garbage-collect)
          (dotimes (_iteration iterations)
            (let ((started (float-time))
                  (value
                   (eliscript-worker-benchmark--score-values values rounds)))
              (if checksum
                  (unless (= checksum value)
                    (error "Emacs benchmark result changed between iterations"))
                (setq checksum value))
              (push (eliscript-worker-benchmark--milliseconds-since started)
                    emacs-samples)))
          (setq emacs-samples (nreverse emacs-samples))

          (let* ((eliscript-worker-program
                  (or (getenv "BUN") eliscript-worker-program))
                 (startup-started (float-time))
                 (_worker (setq worker (eliscript-worker-start)))
                 (startup-ms
                  (eliscript-worker-benchmark--milliseconds-since
                   startup-started))
                 (cold
                  (eliscript-worker-benchmark--worker-call
                   worker module values rounds))
                 (warm-samples nil))
            (unless (= checksum (alist-get 'value cold))
              (error "cold worker result differs from Emacs"))
            (dotimes (_iteration iterations)
              (let ((sample
                     (eliscript-worker-benchmark--worker-call
                      worker module values rounds)))
                (unless (= checksum (alist-get 'value sample))
                  (error "warm worker result differs from Emacs"))
                (push sample warm-samples)))
            (setq warm-samples (nreverse warm-samples))

            (let* ((emacs-median
                    (eliscript-worker-benchmark--median emacs-samples))
                   (warm-end-to-end
                    (mapcar (lambda (sample)
                              (alist-get 'endToEndMs sample))
                            warm-samples))
                   (warm-worker
                    (mapcar (lambda (sample)
                              (alist-get
                               'workerMs (alist-get 'timing sample)))
                            warm-samples))
                   (warm-execution
                    (mapcar (lambda (sample)
                              (alist-get
                               'executionMs (alist-get 'timing sample)))
                            warm-samples))
                   (warm-serialization
                    (mapcar (lambda (sample)
                              (alist-get
                               'serializationMs (alist-get 'timing sample)))
                            warm-samples))
                   (warm-end-to-end-median
                    (eliscript-worker-benchmark--median warm-end-to-end))
                   (warm-worker-median
                    (eliscript-worker-benchmark--median warm-worker))
                   (warm-execution-median
                    (eliscript-worker-benchmark--median warm-execution)))
              `((protocolVersion . ,eliscript-worker-protocol-version)
                (workload . ((name . "score-values")
                             (size . ,size)
                             (rounds . ,rounds)
                             (iterations . ,iterations)
                             (checksum . ,checksum)))
                (timingsMs
                 . ((compile . ,compile-ms)
                    (workerStartup . ,startup-ms)
                    (emacsMedian . ,emacs-median)
                    (coldEndToEnd . ,(alist-get 'endToEndMs cold))
                    (coldWorker . ,(alist-get
                                    'workerMs (alist-get 'timing cold)))
                    (coldModuleLoad . ,(alist-get
                                        'moduleLoadMs
                                        (alist-get 'timing cold)))
                    (coldExecution . ,(alist-get
                                       'executionMs
                                       (alist-get 'timing cold)))
                    (warmEndToEndMedian . ,warm-end-to-end-median)
                    (warmWorkerMedian . ,warm-worker-median)
                    (warmExecutionMedian . ,warm-execution-median)
                    (warmTransportAndClientMedian
                     . ,(max 0.0
                             (- warm-end-to-end-median
                                warm-worker-median)))
                    (warmSerializationMedian
                     . ,(eliscript-worker-benchmark--median
                         warm-serialization))))
                (ratios
                 . ((warmExecutionSpeedup
                     . ,(eliscript-worker-benchmark--ratio
                         emacs-median warm-execution-median))
                    (warmEndToEndSpeedup
                     . ,(eliscript-worker-benchmark--ratio
                         emacs-median warm-end-to-end-median))))
                (samples
                 . ((emacs . ,(vconcat emacs-samples))
                    (worker . ,(vconcat warm-samples))))))))
      (when worker (eliscript-worker-stop worker t))
      (delete-directory directory t))))

(condition-case error-data
    (progn
      (princ
       (json-serialize
        (eliscript-worker-benchmark-run)
        :null-object nil
        :false-object :false))
      (princ "\n"))
  (error
   (message "eliscript worker benchmark: %s"
            (error-message-string error-data))
   (kill-emacs 1)))

;;; benchmark.el ends here
