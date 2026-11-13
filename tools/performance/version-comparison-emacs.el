;;; version-comparison-emacs.el --- Raw GNU Emacs benchmark reference -*- lexical-binding: t; -*-

(require 'cl-lib)
(require 'json)

(defun eliscript-benchmark-batch (iterations function)
  "Measure a batch of ITERATIONS calls to FUNCTION in milliseconds."
  (let ((started (float-time)))
    (dotimes (_ iterations) (funcall function))
    (* 1000.0 (- (float-time) started))))

(defun eliscript-benchmark-average (iterations function)
  "Return the median and all three warmed, at least 100ms samples."
  (let ((warmup 0.0) (samples nil))
    (while (< warmup 20.0)
      (setq warmup (+ warmup (eliscript-benchmark-batch iterations function))))
    (dotimes (_ 3)
      (garbage-collect)
      (let ((elapsed 0.0) (calls 0))
        (while (< elapsed 100.0)
          (setq elapsed (+ elapsed (eliscript-benchmark-batch iterations function))
                calls (+ calls iterations)))
        (push (/ elapsed calls) samples)))
    (list :median (nth 1 (sort (copy-sequence samples) #'<))
          :samples (vconcat (nreverse samples)))))

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

(defun eliscript-version-comparison-main ()
  "Verify the normalized workload results, then print actual measurements."
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
    (let ((measurements
      `((sequence.first10k . ,(eliscript-benchmark-average 20000 (lambda () (aref values 0))))
        (sequence.last10k . ,(eliscript-benchmark-average 200 (lambda () (aref values (1- (length values))))))
        (sequence.takeLast10k . ,(eliscript-benchmark-average 200 (lambda () (cl-subseq values (- (length values) 64)))))
        (value.equalSameRef10k . ,(eliscript-benchmark-average 1000 (lambda () (equal values values))))
        (order.sort10k . ,(eliscript-benchmark-average 30 (lambda () (sort (copy-sequence shuffled) #'<))))
        (data.groupBy10k . ,(eliscript-benchmark-average 30 (lambda () (eliscript-benchmark-group values))))
        (data.frequencies100k . ,(eliscript-benchmark-average 7 (lambda () (eliscript-benchmark-frequencies mod-values))))
        (tree.zipper12k . ,(eliscript-benchmark-average 3 (lambda () (eliscript-benchmark-replace-leaf nested))))
        (worker.scoreValues . ,(eliscript-benchmark-average 7 (lambda () (eliscript-benchmark-score scores)))))))
      (princ (json-encode
              `((metricsMs . ,(mapcar (lambda (item) (cons (car item) (plist-get (cdr item) :median))) measurements))
                (samplesMs . ,(mapcar (lambda (item) (cons (car item) (plist-get (cdr item) :samples))) measurements))))))))

(when noninteractive (eliscript-version-comparison-main))

;;; version-comparison-emacs.el ends here
