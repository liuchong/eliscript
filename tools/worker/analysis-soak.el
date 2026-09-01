;;; analysis-soak.el --- Eliscript analysis buffer soak -*- lexical-binding: t; -*-

;;; Commentary:

;; Reuses one worker generation while alternating successful buffer updates
;; and deliberately stale results for both maintained analysis operations.

;;; Code:

(defconst eliscript-analysis-soak--script-directory
  (file-name-directory (or load-file-name buffer-file-name)))

(defconst eliscript-analysis-soak--project-directory
  (expand-file-name "../.." eliscript-analysis-soak--script-directory))

(add-to-list
 'load-path
 (expand-file-name "compiler" eliscript-analysis-soak--project-directory))
(add-to-list 'load-path eliscript-analysis-soak--script-directory)

(require 'json)
(require 'eliscript-analysis)

(defun eliscript-analysis-soak--positive-environment (name default)
  "Return positive integer environment variable NAME or DEFAULT."
  (let ((text (getenv name)))
    (if text
        (let ((value (string-to-number text)))
          (unless (> value 0) (error "%s must be positive" name))
          value)
      default)))

(defun eliscript-analysis-soak--sources ()
  "Return the deterministic maintained soak corpus."
  (let (sources)
    (dotimes (document 50)
      (let (terms)
        (dotimes (index 200)
          (push (format "term%d" (% (+ index (* document 17)) 250)) terms))
        (push
         (cons (format "document-%d" document)
               (string-join (nreverse terms) " "))
         sources)))
    (nreverse sources)))

(defun eliscript-analysis-soak--wait (session predicate timeout)
  "Wait on SESSION until PREDICATE succeeds or TIMEOUT expires."
  (let* ((worker
          (eliscript-service-worker
           (eliscript-analysis-session-service session)))
         (deadline (+ (float-time) timeout)))
    (while (and (not (funcall predicate))
                (eliscript-worker-live-p worker)
                (< (float-time) deadline))
      (accept-process-output (eliscript-worker-process worker) 0.02))
    (funcall predicate)))

(defun eliscript-analysis-soak--file-digest (file)
  "Return SHA-256 for repository-relative FILE."
  (with-temp-buffer
    (set-buffer-multibyte nil)
    (insert-file-contents-literally
     (expand-file-name file eliscript-analysis-soak--project-directory))
    (secure-hash 'sha256 (current-buffer))))

(defun eliscript-analysis-soak--source-contract ()
  "Return the source contract for this soak."
  (let* ((files
          '("examples/emacs-analysis/analysis.eli"
            "tools/worker/eliscript-analysis.el"
            "tools/worker/eliscript-service.el"
            "tools/worker/analysis-soak.el"))
         (entries
          (mapcar
           (lambda (file)
             (cons file (eliscript-analysis-soak--file-digest file)))
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

(defun eliscript-analysis-soak--median (values)
  "Return median of numeric VALUES."
  (let* ((sorted (sort (copy-sequence values) #'<))
         (middle (/ (length sorted) 2)))
    (if (= (% (length sorted) 2) 1)
        (nth middle sorted)
      (/ (+ (nth (1- middle) sorted) (nth middle sorted)) 2.0))))

(defun eliscript-analysis-soak--run ()
  "Run the buffer lifecycle soak and return its report."
  (let* ((iterations
          (eliscript-analysis-soak--positive-environment
           "ELISCRIPT_ANALYSIS_SOAK_ITERATIONS" 200))
         (sources (eliscript-analysis-soak--sources))
         (started (float-time))
         (stable 0)
         (stale 0)
         (applied 0)
         timings
         session)
    (unwind-protect
        (progn
          (setq session (eliscript-analysis-start))
          (eliscript-analysis-search-sync
           session sources "term3 term17" :path 'accelerated
           :timeout-ms 5000)
          (let* ((service (eliscript-analysis-session-service session))
                 (worker (eliscript-service-worker service))
                 (generation (eliscript-worker-generation worker)))
            (dotimes (iteration iterations)
              (let* ((mode (% iteration 4))
                     (search (< mode 2))
                     (expect-stale (= (% mode 2) 1)))
                (with-temp-buffer
                  (insert "current")
                  (let (done result error-object applied-here timing)
                    (if search
                        (eliscript-analysis-search
                         session sources "term3 term17"
                         (lambda (value request-error)
                           (setq result value
                                 error-object request-error
                                 done t))
                         :path 'accelerated
                         :buffer (current-buffer)
                         :apply (lambda (_value)
                                  (setq applied-here t)
                                  (erase-buffer)
                                  (insert "applied"))
                         :metrics (lambda (value) (setq timing value))
                         :timeout-ms 5000)
                      (eliscript-analysis-statistics
                       session sources
                       (lambda (value request-error)
                         (setq result value
                               error-object request-error
                               done t))
                       :path 'accelerated
                       :buffer (current-buffer)
                       :apply (lambda (_value)
                                (setq applied-here t)
                                (erase-buffer)
                                (insert "applied"))
                       :metrics (lambda (value) (setq timing value))
                       :timeout-ms 5000))
                    (when expect-stale (insert " changed"))
                    (unless (eliscript-analysis-soak--wait
                             session (lambda () done) 5.0)
                      (error "iteration %d did not complete" iteration))
                    (push (alist-get 'workerMs timing) timings)
                    (if expect-stale
                        (progn
                          (unless (and (null result)
                                       (null applied-here)
                                       (equal (alist-get 'code error-object)
                                              "stale-buffer")
                                       (equal (buffer-string)
                                              "current changed"))
                            (error "iteration %d accepted stale result"
                                   iteration))
                          (setq stale (1+ stale)))
                      (unless (and result
                                   (null error-object)
                                   applied-here
                                   (equal (buffer-string) "applied"))
                        (error "iteration %d failed stable application"
                               iteration))
                      (setq stable (1+ stable)
                            applied (1+ applied)))))))
            (unless (and (eliscript-worker-live-p worker)
                         (= generation (eliscript-worker-generation worker)))
              (error "worker generation changed during soak"))
            `((schemaVersion . 1)
              (format . "eliscript-emacs-analysis-soak")
              (version . 1)
              (verified . t)
              (iterations . ,iterations)
              (stableApplications . ,stable)
              (staleDiscards . ,stale)
              (applicationCount . ,applied)
              (workerGenerationStable . t)
              (workerMs
               . ((median . ,(eliscript-analysis-soak--median timings))
                  (samples . ,(vconcat (nreverse timings)))))
              (elapsedMs . ,(* 1000.0 (- (float-time) started)))
              (host
               . ((systemType . ,(symbol-name system-type))
                  (systemConfiguration . ,system-configuration)
                  (emacsVersion . ,emacs-version)))
              (source . ,(eliscript-analysis-soak--source-contract)))))
      (when session (eliscript-analysis-stop session)))))

(condition-case error-data
    (let* ((report (eliscript-analysis-soak--run))
           (json
            (concat
             (json-serialize report :null-object nil :false-object :false)
             "\n"))
           (output (getenv "ELISCRIPT_ANALYSIS_SOAK_OUTPUT")))
      (if output
          (with-temp-file output (insert json))
        (princ json)))
  (error
   (message "eliscript analysis soak: %s" (error-message-string error-data))
   (kill-emacs 1)))

;;; analysis-soak.el ends here
