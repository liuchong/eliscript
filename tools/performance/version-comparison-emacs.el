;;; version-comparison-emacs.el --- Raw GNU Emacs benchmark reference -*- lexical-binding: t; -*-

(require 'cl-lib)
(require 'json)

(defconst eliscript-version-comparison-directory
  (file-name-directory (or load-file-name buffer-file-name)))

;; The minimal batch sizes are shared with the JavaScript runner and report
;; validation. Keep this driver directly loadable from its own source file.
(defconst eliscript-version-comparison-minima
  (if eliscript-version-comparison-directory
      (let ((json-object-type 'hash-table)
            (json-key-type 'string))
        (json-read-file (expand-file-name "version-comparison-minima.json"
                                          eliscript-version-comparison-directory)))
    (error "Benchmark driver must be loaded from its source file")))

(defun eliscript-benchmark-minimum (id)
  (let ((value (gethash id eliscript-version-comparison-minima 'missing)))
    (if (and (integerp value) (> value 0))
        value
      (error "Invalid benchmark minimum for %s: %S" id value))))

(defun eliscript-benchmark-batch (iterations function)
  "Measure a batch of ITERATIONS calls to FUNCTION in milliseconds."
  (let ((started (float-time)))
    (dotimes (_ iterations) (funcall function))
    (* 1000.0 (- (float-time) started))))

(defun eliscript-benchmark-calibrate (minimum function)
  "Increase MINIMUM calls until three consecutive batches span at least 1ms."
  (let ((iterations minimum) (batches nil))
    (while (< (length batches) 3)
      (let ((elapsed (eliscript-benchmark-batch iterations function)))
        (if (>= elapsed 1.0)
            (push elapsed batches)
          (when (>= iterations 16777216)
            (error "Benchmark batch calibration did not reach 1ms"))
          (setq iterations (min (* iterations 2) 16777216)
                batches nil))))
    `((minimumIterations . ,minimum)
      (iterationsPerBatch . ,iterations)
      (batchMs . ,(vconcat (nreverse batches))))))

(defun eliscript-benchmark-average (iterations function)
  "Return the median and all three warmed, at least 100ms samples."
  (let ((warmup 0.0) (samples nil) (calibration nil))
    (while (< warmup 20.0)
      (setq warmup (+ warmup (eliscript-benchmark-batch iterations function))))
    (setq calibration (eliscript-benchmark-calibrate iterations function)
          iterations (alist-get 'iterationsPerBatch calibration))
    (dotimes (_ 3)
      (garbage-collect)
      (let ((elapsed 0.0) (calls 0))
        (while (< elapsed 100.0)
          (setq elapsed (+ elapsed (eliscript-benchmark-batch iterations function))
                calls (+ calls iterations)))
        (push (/ elapsed calls) samples)))
    (list :median (nth 1 (sort (copy-sequence samples) #'<))
          :samples (vconcat (nreverse samples)) :calibration calibration)))

(defun eliscript-benchmark-score (values)
  "Evaluate the shared numeric workload on VALUES."
  (let ((total 0))
    (dotimes (round 10)
      (dotimes (index 10000)
        (setq total (% (+ (* total 33) (aref values index) round) 1000000007))))
    total))

(defun eliscript-benchmark-group (values)
  "Group VALUES by their remainder modulo 100."
  (let ((groups (make-hash-table :test 'eql)))
    (mapc (lambda (value)
            (let ((key (% value 100)))
              (puthash key (cons value (gethash key groups)) groups))) values)
    groups))

(defun eliscript-benchmark-frequencies (values)
  "Count occurrences in VALUES."
  (let ((counts (make-hash-table :test 'eql)))
    (mapc (lambda (value) (puthash value (1+ (gethash value counts 0)) counts)) values)
    counts))

(defun eliscript-benchmark-replace-leaf (nested)
  "Traverse 12000 parents in NESTED and persistently replace the leaf."
  (let ((current nested) (parents nil))
    (dotimes (_ 12000)
      (push current parents)
      (setq current (aref current 0)))
    (let ((rebuilt 42))
      (dolist (parent parents)
        (let ((copy (copy-sequence parent)))
          (aset copy 0 rebuilt)
          (setq rebuilt copy)))
      rebuilt)))

(defun eliscript-version-comparison-setup ()
  "Return the verified shared workload inputs as a plist."
  (let* ((size 10000)
         (values (vconcat (number-sequence 0 (1- size))))
         (shuffled (make-vector size 0))
         (mod-values (make-vector 100000 0))
         (scores (make-vector size 0))
         (nested (vector 0)))
    (dotimes (index size)
      (aset shuffled index (% (* index 7919) size))
      (aset scores index (% index 997)))
    (dotimes (index 100000) (aset mod-values index (% index 1000)))
    (dotimes (_ 12000) (setq nested (vector nested)))
    (cl-assert (= (aref values 0) 0))
    (cl-assert (= (aref values (1- (length values))) 9999))
    (cl-assert (equal (cl-subseq values (- (length values) 64))
                      (vconcat (number-sequence 9936 9999))))
    (cl-assert (equal values values))
    (cl-assert (equal (sort (copy-sequence shuffled) #'<) values))
    (let ((groups (eliscript-benchmark-group values))
          (counts (eliscript-benchmark-frequencies mod-values))
          (rebuilt (eliscript-benchmark-replace-leaf nested)))
      (cl-assert (= (hash-table-count groups) 100))
      (cl-assert (equal (reverse (gethash 0 groups))
                        (number-sequence 0 9900 100)))
      (cl-assert (= (hash-table-count counts) 1000))
      (dotimes (key 1000) (cl-assert (= (gethash key counts) 100)))
      (dotimes (_ 12000) (setq rebuilt (aref rebuilt 0)))
      (cl-assert (= rebuilt 42)))
    (cl-assert (= (eliscript-benchmark-score scores) 455649481))
    (list :values values :shuffled shuffled :mod-values mod-values
          :scores scores :nested nested)))

(defconst eliscript-version-comparison-workload-ids
  '("sequence.first10k" "sequence.last10k" "sequence.takeLast10k"
    "value.equalSameRef10k" "order.sort10k" "data.groupBy10k"
    "data.frequencies100k" "tree.zipper12k" "worker.scoreValues"))

(defun eliscript-version-comparison-workload (id inputs)
  "Bind INPUTS once, then return the original zero-argument workload for ID."
  (let ((values (plist-get inputs :values))
        (shuffled (plist-get inputs :shuffled))
        (mod-values (plist-get inputs :mod-values))
        (scores (plist-get inputs :scores))
        (nested (plist-get inputs :nested)))
    (pcase id
      ("sequence.first10k" (lambda () (aref values 0)))
      ("sequence.last10k" (lambda () (aref values (1- (length values)))))
      ("sequence.takeLast10k" (lambda () (cl-subseq values (- (length values) 64))))
      ("value.equalSameRef10k" (lambda () (equal values values)))
      ("order.sort10k" (lambda () (sort (copy-sequence shuffled) #'<)))
      ("data.groupBy10k" (lambda () (eliscript-benchmark-group values)))
      ("data.frequencies100k" (lambda () (eliscript-benchmark-frequencies mod-values)))
      ("tree.zipper12k" (lambda () (eliscript-benchmark-replace-leaf nested)))
      ("worker.scoreValues" (lambda () (eliscript-benchmark-score scores)))
      (_ (error "Unknown benchmark workload id: %s" id)))))

(defun eliscript-version-comparison-measure (id)
  "Measure exactly one workload in this process and return its record."
  (let* ((inputs (eliscript-version-comparison-setup))
         (workload (eliscript-version-comparison-workload id inputs))
         (minimum (eliscript-benchmark-minimum id))
         (measurement (eliscript-benchmark-average
                       minimum workload)))
    (list :id id
          :medianMs (plist-get measurement :median)
          :samplesMs (plist-get measurement :samples)
          :calibration (plist-get measurement :calibration))))

(defun eliscript-version-comparison-report (records)
  "Print the shared report shape for RECORDS."
  (princ (json-encode
          `((metricsMs . ,(mapcar (lambda (record)
                                    (cons (alist-get 'id record)
                                          (alist-get 'medianMs record)))
                                  records))
            (samplesMs . ,(mapcar (lambda (record)
                                    (cons (alist-get 'id record)
                                          (alist-get 'samplesMs record)))
                                  records))
            (calibration . ,(mapcar (lambda (record)
                                      (cons (alist-get 'id record)
                                            (alist-get 'calibration record)))
                                    records))))))

(defconst eliscript-version-comparison-script
  (or load-file-name buffer-file-name)
  "Absolute source path captured while this driver loads.")

(defconst eliscript-version-comparison-workload-variable
  "ELISCRIPT_BENCHMARK_WORKLOAD"
  "Environment variable naming the single workload a child process measures.")

(defun eliscript-version-comparison-child-command ()
  "Return the argv that loads this driver in a fresh Emacs process."
  (unless eliscript-version-comparison-script
    (error "Benchmark driver must be loaded from its source file"))
  (let ((executable (expand-file-name invocation-name invocation-directory)))
    (unless (file-executable-p executable)
      (error "Current Emacs executable is unavailable: %s" executable))
    (list executable "--batch" "-Q" "--load" eliscript-version-comparison-script)))

(defconst eliscript-version-comparison-worker-timeout 10.0
  "Maximum wall-clock seconds for one isolated workload, including startup.")

(defun eliscript-version-comparison-stop-child (child)
  "Reap the owned CHILD, escalating only if it ignores termination."
  (when (processp child)
    (when (process-live-p child)
      (ignore-errors (signal-process child 'SIGTERM))
      (accept-process-output child 0.1)
      (when (process-live-p child) (delete-process child)))
    (delete-process child)))

(defun eliscript-version-comparison-child (id)
  "Run one isolated child with a hard deadline and parse its single record."
  (let* ((command (eliscript-version-comparison-child-command))
         (buffer (generate-new-buffer " *eliscript-benchmark-child*"))
         (errors (generate-new-buffer " *eliscript-benchmark-errors*"))
         (process-environment
          (cons (format "%s=%s" eliscript-version-comparison-workload-variable id)
                process-environment))
         (deadline (+ (float-time) eliscript-version-comparison-worker-timeout))
         (child nil))
    (unwind-protect
        (progn
          (setq child (make-process :name (concat "eliscript-benchmark-" id)
                                    :buffer buffer :stderr errors :command command
                                    :connection-type 'pipe :noquery t :sentinel #'ignore))
          (while (and (process-live-p child) (< (float-time) deadline))
            (accept-process-output child 0.05))
          (when (process-live-p child)
            (eliscript-version-comparison-stop-child child)
            (error "Benchmark worker timed out after %ss for %s"
                   eliscript-version-comparison-worker-timeout id))
          (let ((status (process-exit-status child))
                (text (with-current-buffer buffer (buffer-string)))
                (stderr (with-current-buffer errors (buffer-string))))
            (unless (and (eq (process-status child) 'exit) (= status 0))
              (error "Benchmark worker exited %S for %s: %s"
                     status id (string-trim (concat stderr "\n" text))))
            (let* ((json-object-type 'alist)
                   (json-key-type 'symbol)
                   (json-array-type 'list)
                   (record (json-read-from-string (string-trim text))))
              (unless (equal (alist-get 'id record) id)
                (error "Benchmark worker returned a different workload: %s" id))
              record)))
      (eliscript-version-comparison-stop-child child)
      (eliscript-version-comparison-stop-child (get-buffer-process errors))
      (kill-buffer buffer)
      (kill-buffer errors))))

(defun eliscript-version-comparison-isolated ()
  "Measure every workload in its own process with exactly one callee."
  (let ((records nil)
        (failures nil))
    (dolist (id eliscript-version-comparison-workload-ids)
      (condition-case failure
          (push (eliscript-version-comparison-child id) records)
        (error (push (cons id failure) failures))))
    (when failures
      (error "Benchmark workers failed: %s"
             (mapconcat (lambda (item) (format "%s (%s)" (car item) (cdr item)))
                        (nreverse failures) ", ")))
    (nreverse records)))

(defun eliscript-version-comparison-requested-workload ()
  "Return the single workload requested by the environment, or nil."
  (let ((id (getenv eliscript-version-comparison-workload-variable)))
    (when id
      (unless (member id eliscript-version-comparison-workload-ids)
        (error "Unknown benchmark workload id: %s" id))
      id)))

(defun eliscript-version-comparison-main ()
  "Verify the workload inputs, then print isolated per-workload measurements."
  (let ((id (eliscript-version-comparison-requested-workload)))
    (if id
        (princ (json-encode (eliscript-version-comparison-measure id)))
      (eliscript-version-comparison-report
       (eliscript-version-comparison-isolated)))))

(when noninteractive (eliscript-version-comparison-main))

;;; version-comparison-emacs.el ends here
