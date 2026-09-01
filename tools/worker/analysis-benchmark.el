;;; analysis-benchmark.el --- Eliscript analysis candidate benchmark -*- lexical-binding: t; -*-

;;; Commentary:

;; Run in batch mode. Optional environment variables:
;; ELISCRIPT_ANALYSIS_DOCUMENTS, ELISCRIPT_ANALYSIS_TERMS,
;; ELISCRIPT_ANALYSIS_VOCABULARY, ELISCRIPT_ANALYSIS_ITERATIONS,
;; ELISCRIPT_ANALYSIS_WARMUPS, ELISCRIPT_ANALYSIS_OUTPUT, and BUN.

;;; Code:

(defconst eliscript-analysis-benchmark--script-directory
  (file-name-directory (or load-file-name buffer-file-name))
  "Directory containing the analysis benchmark.")

(defconst eliscript-analysis-benchmark--project-directory
  (expand-file-name "../.." eliscript-analysis-benchmark--script-directory)
  "Repository root used by the analysis benchmark.")

(add-to-list
 'load-path
 (expand-file-name "compiler" eliscript-analysis-benchmark--project-directory))
(add-to-list 'load-path eliscript-analysis-benchmark--script-directory)

(require 'json)
(require 'eliscript-analysis)

(defun eliscript-analysis-benchmark--positive-environment (name default)
  "Return positive integer environment variable NAME or DEFAULT."
  (let ((text (getenv name)))
    (if text
        (let ((value (string-to-number text)))
          (unless (> value 0)
            (error "%s must be a positive integer" name))
          value)
      default)))

(defun eliscript-analysis-benchmark--milliseconds-since (started)
  "Return milliseconds elapsed since float time STARTED."
  (* 1000.0 (- (float-time) started)))

(defun eliscript-analysis-benchmark--file-digest (filename)
  "Return the SHA-256 digest of FILENAME bytes."
  (with-temp-buffer
    (set-buffer-multibyte nil)
    (insert-file-contents-literally filename)
    (secure-hash 'sha256 (current-buffer))))

(defun eliscript-analysis-benchmark--source-contract ()
  "Return source files and aggregate digest for this benchmark."
  (let* ((files
          '("examples/emacs-analysis/analysis.eli"
            "runtime/core/data.mjs"
            "runtime/core/transducer.mjs"
            "runtime/core/vector.mjs"
            "runtime/worker.mjs"
            "tools/worker/eliscript-analysis.el"
            "tools/worker/eliscript-service.el"
            "tools/worker/eliscript-worker.el"
            "tools/worker/analysis-benchmark.el"))
         (entries
          (mapcar
           (lambda (file)
             (cons file
                   (eliscript-analysis-benchmark--file-digest
                    (expand-file-name
                     file eliscript-analysis-benchmark--project-directory))))
           files))
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

(defun eliscript-analysis-benchmark--program-version (program)
  "Return the first version line printed by PROGRAM."
  (with-temp-buffer
    (let ((status (call-process program nil t nil "--version")))
      (unless (and (integerp status) (zerop status))
        (error "%s --version failed" program))
      (car (split-string (string-trim (buffer-string)) "\n" t)))))

(defun eliscript-analysis-benchmark--median (values)
  "Return the median of numeric VALUES."
  (let* ((sorted (sort (copy-sequence values) #'<))
         (count (length sorted))
         (middle (/ count 2)))
    (if (= (% count 2) 1)
        (nth middle sorted)
      (/ (+ (nth (1- middle) sorted) (nth middle sorted)) 2.0))))

(defun eliscript-analysis-benchmark--sources
    (document-count terms-per-document vocabulary-size)
  "Return deterministic sources for the declared corpus dimensions."
  (let (sources)
    (dotimes (document-index document-count)
      (let (terms)
        (dotimes (term-index terms-per-document)
          (push
           (format "term%d"
                   (% (+ (* document-index 17) (* term-index 31))
                      vocabulary-size))
           terms))
        (push
         (cons (format "document-%d" document-index)
               (string-join (nreverse terms) " "))
         sources)))
    (nreverse sources)))

(defun eliscript-analysis-benchmark--canonical-frequency (value)
  "Return frequency alist VALUE in canonical key order."
  (sort
   (copy-tree value)
   (lambda (left right)
     (string-lessp (symbol-name (car left))
                   (symbol-name (car right))))))

(defun eliscript-analysis-benchmark--application-digest (name value)
  "Return client-application digest for operation NAME and VALUE."
  (secure-hash
   'sha256
   (prin1-to-string
    (if (eq name 'term-frequencies)
        (eliscript-analysis-benchmark--canonical-frequency value)
      value))))

(defun eliscript-analysis-benchmark--call
    (service name arguments path)
  "Measure one SERVICE operation NAME with ARGUMENTS on PATH."
  (let ((started (float-time))
        timing)
    (let* ((value
            (eliscript-service-call-sync
             service name arguments
             :path path
             :metrics (lambda (worker-timing) (setq timing worker-timing))
             :timeout-ms 30000))
           (digest
            (eliscript-analysis-benchmark--application-digest name value)))
      `((value . ,value)
        (applicationDigest . ,digest)
        (endToEndMs
         . ,(eliscript-analysis-benchmark--milliseconds-since started))
        (timing . ,timing)))))

(defun eliscript-analysis-benchmark--sample-path
    (service name arguments path count)
  "Return COUNT samples for SERVICE operation NAME on PATH."
  (let (samples)
    (dotimes (_ count)
      (push
       (eliscript-analysis-benchmark--call service name arguments path)
       samples))
    (nreverse samples)))

(defun eliscript-analysis-benchmark--metric-values (samples key)
  "Return worker metric KEY from SAMPLES."
  (mapcar
   (lambda (sample) (alist-get key (alist-get 'timing sample)))
   samples))

(defun eliscript-analysis-benchmark--sample-report (sample)
  "Return the persisted timing subset of SAMPLE."
  `((applicationDigest . ,(alist-get 'applicationDigest sample))
    (endToEndMs . ,(alist-get 'endToEndMs sample))
    (timing . ,(alist-get 'timing sample))))

(defun eliscript-analysis-benchmark--summarize
    (operation reference-samples accelerated-samples cold)
  "Summarize OPERATION samples and COLD accelerated observation."
  (let* ((reference-end-to-end
          (mapcar (lambda (sample) (alist-get 'endToEndMs sample))
                  reference-samples))
         (accelerated-end-to-end
          (mapcar (lambda (sample) (alist-get 'endToEndMs sample))
                  accelerated-samples))
         (worker-values
          (eliscript-analysis-benchmark--metric-values
           accelerated-samples 'workerMs))
         (execution-values
          (eliscript-analysis-benchmark--metric-values
           accelerated-samples 'executionMs))
         (serialization-values
          (eliscript-analysis-benchmark--metric-values
           accelerated-samples 'serializationMs))
         (reference-median
          (eliscript-analysis-benchmark--median reference-end-to-end))
         (accelerated-median
          (eliscript-analysis-benchmark--median accelerated-end-to-end))
         (worker-median
          (eliscript-analysis-benchmark--median worker-values)))
    `((name . ,(symbol-name operation))
      (correct . t)
      (cold
       . ((endToEndMs . ,(alist-get 'endToEndMs cold))
          (worker . ,(alist-get 'timing cold))))
      (mediansMs
       . ((referenceEndToEnd . ,reference-median)
          (acceleratedEndToEnd . ,accelerated-median)
          (worker . ,worker-median)
          (execution
           . ,(eliscript-analysis-benchmark--median execution-values))
          (serialization
           . ,(eliscript-analysis-benchmark--median serialization-values))
          (transportDecodeAndApplication
           . ,(max 0.0 (- accelerated-median worker-median)))))
      (warmEndToEndSpeedup . ,(/ reference-median accelerated-median))
      (samples
       . ((reference
           . ,(vconcat
               (mapcar #'eliscript-analysis-benchmark--sample-report
                       reference-samples)))
          (accelerated
           . ,(vconcat
               (mapcar #'eliscript-analysis-benchmark--sample-report
                       accelerated-samples))))))))

(defun eliscript-analysis-benchmark--operation
    (service operation arguments equality warmups iterations)
  "Measure one candidate OPERATION on SERVICE."
  (let* ((reference
          (eliscript-service-call-sync
           service operation arguments :path 'reference))
         (cold
          (eliscript-analysis-benchmark--call
           service operation arguments 'accelerated))
         (accelerated (alist-get 'value cold)))
    (unless (funcall equality reference accelerated)
      (error "%s accelerated result differs from reference" operation))
    (eliscript-analysis-benchmark--sample-path
     service operation arguments 'reference warmups)
    (eliscript-analysis-benchmark--sample-path
     service operation arguments 'accelerated warmups)
    (let (reference-samples accelerated-samples)
      (dotimes (iteration iterations)
        (if (= (% iteration 2) 0)
            (progn
              (push
               (eliscript-analysis-benchmark--call
                service operation arguments 'reference)
               reference-samples)
              (push
               (eliscript-analysis-benchmark--call
                service operation arguments 'accelerated)
               accelerated-samples))
          (push
           (eliscript-analysis-benchmark--call
            service operation arguments 'accelerated)
           accelerated-samples)
          (push
           (eliscript-analysis-benchmark--call
            service operation arguments 'reference)
           reference-samples)))
      (eliscript-analysis-benchmark--summarize
       operation
       (nreverse reference-samples)
       (nreverse accelerated-samples)
       cold))))

(defun eliscript-analysis-benchmark--corpus
    (service document-count terms-per-document vocabulary-size
             iterations warmups revision)
  "Measure one corpus on SERVICE and return its complete report."
  (let* ((sources
          (eliscript-analysis-benchmark--sources
           document-count terms-per-document vocabulary-size))
         (preparation-started (float-time))
         (documents (eliscript-analysis--documents sources))
         (query "term3 term17 term91 term301")
         (preparation-ms
          (eliscript-analysis-benchmark--milliseconds-since
           preparation-started))
         (total-characters
          (eliscript-analysis--workload-size (list documents)))
         (index-sample
          (eliscript-analysis-benchmark--call
           service 'index-documents
           (list documents revision) 'accelerated)))
    `((corpus
       . ((documents . ,document-count)
          (termsPerDocument . ,terms-per-document)
          (totalTerms . ,(* document-count terms-per-document))
          (totalCharacters . ,total-characters)
          (vocabulary . ,vocabulary-size)
          (iterations . ,iterations)
          (warmups . ,warmups)
          (preparationMs . ,preparation-ms)))
      (index . ,(eliscript-analysis-benchmark--sample-report index-sample))
      (candidates
       . ,(vector
           (eliscript-analysis-benchmark--operation
            service 'search-documents
            (list documents query revision) #'equal warmups iterations)
           (eliscript-analysis-benchmark--operation
            service 'document-statistics
            (list documents revision) #'equal warmups iterations)
           (eliscript-analysis-benchmark--operation
            service 'term-frequencies
            (list documents revision) #'eliscript-analysis--frequency-equal
            warmups iterations))))))

(defun eliscript-analysis-benchmark--candidate-speedup (report name)
  "Return NAME speedup from corpus REPORT."
  (let ((candidate
         (cl-find name (alist-get 'candidates report)
                  :key (lambda (entry) (alist-get 'name entry))
                  :test #'equal)))
    (alist-get 'warmEndToEndSpeedup candidate)))

(defun eliscript-analysis-benchmark--run ()
  "Run primary and crossover analysis candidates."
  (let* ((document-count
          (eliscript-analysis-benchmark--positive-environment
           "ELISCRIPT_ANALYSIS_DOCUMENTS" 500))
         (terms-per-document
          (eliscript-analysis-benchmark--positive-environment
           "ELISCRIPT_ANALYSIS_TERMS" 400))
         (vocabulary-size
          (eliscript-analysis-benchmark--positive-environment
           "ELISCRIPT_ANALYSIS_VOCABULARY" 1000))
         (iterations
          (eliscript-analysis-benchmark--positive-environment
           "ELISCRIPT_ANALYSIS_ITERATIONS" 30))
         (warmups
          (eliscript-analysis-benchmark--positive-environment
           "ELISCRIPT_ANALYSIS_WARMUPS" 3))
         (crossover-dimensions
          '((10 10) (10 50) (10 100) (15 100) (20 100) (25 100)))
         start-ms primary crossover session)
    (unwind-protect
        (progn
          (let ((started (float-time)))
            (setq session (eliscript-analysis-start)
                  start-ms
                  (eliscript-analysis-benchmark--milliseconds-since started)))
          (let ((service (eliscript-analysis-session-service session))
                (revision 1))
            (setq primary
                  (eliscript-analysis-benchmark--corpus
                   service document-count terms-per-document vocabulary-size
                   iterations warmups revision))
            (dolist (dimensions crossover-dimensions)
              (setq revision (1+ revision))
              (push
               (eliscript-analysis-benchmark--corpus
                service (car dimensions) (cadr dimensions) vocabulary-size
                iterations warmups revision)
               crossover))
            (setq crossover (nreverse crossover))
            `((schemaVersion . 1)
              (format . "eliscript-emacs-analysis-benchmark")
              (version . 2)
              (verified . t)
              (protocolVersion . ,eliscript-worker-protocol-version)
              (setup
               . ((serviceStartMs . ,start-ms)))
              (selection
               . ((selected . ["search-documents" "document-statistics"])
                  (requiredWarmSpeedup . 2.0)
                  (thresholdCharacters
                   . ,eliscript-analysis-acceleration-threshold)
                  (primaryQualified
                   . ,(if
                          (and
                           (>=
                            (eliscript-analysis-benchmark--candidate-speedup
                             primary "search-documents")
                            2.0)
                           (>=
                            (eliscript-analysis-benchmark--candidate-speedup
                             primary "document-statistics")
                            2.0))
                          t
                        :false))))
              (primary . ,primary)
              (crossover . ,(vconcat crossover))
              (host
               . ((systemType . ,(symbol-name system-type))
                  (systemConfiguration . ,system-configuration)
                  (emacsVersion . ,emacs-version)
                  (bunVersion
                   . ,(eliscript-analysis-benchmark--program-version
                       eliscript-worker-program))))
              (source . ,(eliscript-analysis-benchmark--source-contract)))))
      (when session (eliscript-analysis-stop session)))))

(condition-case error-data
    (let* ((report (eliscript-analysis-benchmark--run))
           (json
            (concat
             (json-serialize report :null-object nil :false-object :false)
             "\n"))
           (output (getenv "ELISCRIPT_ANALYSIS_OUTPUT")))
      (if output
          (with-temp-file output (insert json))
        (princ json)))
  (error
   (message "eliscript analysis benchmark: %s"
            (error-message-string error-data))
   (kill-emacs 1)))

;;; analysis-benchmark.el ends here
