;;; eliscript-analysis.el --- Accelerated Emacs text analysis -*- lexical-binding: t; -*-

;;; Commentary:

;; Three coarse-grained text analysis workflows with exact Emacs Lisp
;; references and optional Eliscript worker acceleration.

;;; Code:

(require 'cl-lib)
(require 'subr-x)
(require 'eliscript-project)
(require 'eliscript-service)

(defconst eliscript-analysis--source-file
  (expand-file-name
   "examples/emacs-analysis/analysis.eli"
   eliscript-worker--project-directory)
  "Eliscript source for maintained analysis operations.")

(defconst eliscript-analysis-acceleration-threshold 16000
  "Minimum indexed source characters for automatic worker routing.")

(defconst eliscript-analysis-candidate-only-threshold most-positive-fixnum
  "Threshold that keeps an unselected candidate on its reference path.")

(cl-defstruct (eliscript-analysis-session
               (:constructor eliscript-analysis-session--create))
  service
  build
  module
  directory
  sources
  documents
  revision
  indexed-generation)

(defun eliscript-analysis--tokenize (text)
  "Return lower-case word tokens from TEXT as a vector."
  (let ((case-fold-search nil)
        tokens)
    (with-temp-buffer
      (insert (downcase text))
      (goto-char (point-min))
      (while (re-search-forward "[[:alnum:]_]+" nil t)
        (push (match-string-no-properties 0) tokens)))
    (vconcat (nreverse tokens))))

(defun eliscript-analysis--documents (sources)
  "Convert (ID . TEXT) SOURCES into serializable document objects."
  (vconcat
   (mapcar
    (lambda (source)
      `((id . ,(car source))
        (text . ,(cdr source))))
    sources)))

(defun eliscript-analysis--score-document (document query-terms)
  "Return the reference score for DOCUMENT and QUERY-TERMS."
  (let ((counts (make-hash-table :test #'equal))
        (terms (eliscript-analysis--tokenize (alist-get 'text document)))
        (matches 0))
    (dotimes (index (length terms))
      (let ((term (aref terms index)))
        (puthash term (1+ (gethash term counts 0)) counts)))
    (dotimes (index (length query-terms))
      (setq matches
            (+ matches (gethash (aref query-terms index) counts 0))))
    `((id . ,(alist-get 'id document))
      (matches . ,matches)
      (terms . ,(length terms)))))

(defun eliscript-analysis--search-reference (documents query &optional _revision)
  "Search DOCUMENTS for QUERY in Emacs Lisp."
  (let ((query-terms (eliscript-analysis--tokenize query))
        results)
    (dotimes (index (length documents))
      (let ((result
             (eliscript-analysis--score-document
              (aref documents index) query-terms)))
        (when (> (alist-get 'matches result) 0)
          (push result results))))
    (vconcat (nreverse results))))

(defun eliscript-analysis--statistics-reference (documents &optional _revision)
  "Return per-document statistics for DOCUMENTS in Emacs Lisp."
  (let ((results (make-vector (length documents) nil)))
    (dotimes (index (length documents))
      (let* ((document (aref documents index))
             (terms
              (eliscript-analysis--tokenize (alist-get 'text document)))
             (unique (make-hash-table :test #'equal)))
        (dotimes (term-index (length terms))
          (puthash (aref terms term-index) t unique))
        (aset results index
              `((id . ,(alist-get 'id document))
                (terms . ,(length terms))
                (uniqueTerms . ,(hash-table-count unique))))))
    results))

(defun eliscript-analysis--frequencies-reference (documents &optional _revision)
  "Return a deterministic term-frequency alist for DOCUMENTS."
  (let ((counts (make-hash-table :test #'equal))
        entries)
    (dotimes (document-index (length documents))
      (let ((terms
             (eliscript-analysis--tokenize
              (alist-get 'text (aref documents document-index)))))
        (dotimes (term-index (length terms))
          (let ((term (aref terms term-index)))
            (puthash term (1+ (gethash term counts 0)) counts)))))
    (maphash
     (lambda (term count) (push (cons (intern term) count) entries))
     counts)
    (sort entries
          (lambda (left right)
            (string-lessp (symbol-name (car left))
                          (symbol-name (car right)))))))

(defun eliscript-analysis--frequency-equal (left right)
  "Return non-nil when frequency alists LEFT and RIGHT are equal."
  (and (= (length left) (length right))
       (cl-every
        (lambda (entry)
          (equal (cdr entry) (alist-get (car entry) right)))
        left)))

(defun eliscript-analysis--workload-size (arguments)
  "Return the total source character count in operation ARGUMENTS."
  (let ((documents (car arguments))
        (size 0))
    (dotimes (index (length documents))
      (setq size
            (+ size
               (length (alist-get 'text (aref documents index))))))
    size))

(defconst eliscript-analysis--search-operation
  (eliscript-service-operation
   'search-documents #'eliscript-analysis--search-reference
   :export-name "search_index"
   :workload-size #'eliscript-analysis--workload-size
   :worker-arguments
   (lambda (arguments) (cdr arguments))
   :threshold eliscript-analysis-acceleration-threshold)
  "Dual-path batch search operation.")

(defconst eliscript-analysis--statistics-operation
  (eliscript-service-operation
   'document-statistics #'eliscript-analysis--statistics-reference
   :export-name "statistics_index"
   :workload-size #'eliscript-analysis--workload-size
   :worker-arguments
   (lambda (arguments) (cdr arguments))
   :threshold eliscript-analysis-acceleration-threshold)
  "Dual-path document statistics operation.")

(defconst eliscript-analysis--frequencies-operation
  (eliscript-service-operation
   'term-frequencies #'eliscript-analysis--frequencies-reference
   :export-name "frequencies_index"
   :workload-size #'eliscript-analysis--workload-size
   :worker-arguments
   (lambda (arguments) (cdr arguments))
   :threshold eliscript-analysis-candidate-only-threshold
   :equal #'eliscript-analysis--frequency-equal)
  "Dual-path term frequency operation.")

(defconst eliscript-analysis--index-operation
  (eliscript-service-operation
   'index-documents
   (lambda (documents revision)
     `((revision . ,revision) (documents . ,(length documents))))
   :export-name "cache_documents"
   :threshold 0)
  "Worker document snapshot update operation.")

(cl-defun eliscript-analysis-start (&key command verify)
  "Build the analysis module and start a session.

COMMAND has the same meaning as in `eliscript-worker-start'.  VERIFY may be
nil or `always'."
  (let* ((directory (make-temp-file "eliscript-analysis-" t))
         (project-root eliscript-worker--project-directory)
         build
         module
         service)
    (condition-case error-data
        (progn
          (setq build
                (eliscript-project-build
                 eliscript-analysis--source-file directory project-root)
                module (eliscript-project-build-result-entry-output build)
                service
                (eliscript-service-start
                 (eliscript-service-module-declare
                  module
                  :project-manifest
                  (eliscript-project-build-result-manifest build))
                 (list eliscript-analysis--index-operation
                       eliscript-analysis--search-operation
                       eliscript-analysis--statistics-operation
                       eliscript-analysis--frequencies-operation)
                 :command command
                 :verify verify
                 :value-codec nil
                 :value-chunks nil))
          (eliscript-analysis-session--create
           :service service
           :build build
           :module module
           :directory directory
           :revision 0))
      (error
       (when service (eliscript-service-stop service t))
       (delete-directory directory t)
       (signal (car error-data) (cdr error-data))))))

(defun eliscript-analysis-stop (session)
  "Stop analysis SESSION and remove its generated module tree."
  (when (eliscript-analysis-session-p session)
    (eliscript-service-stop (eliscript-analysis-session-service session))
    (let ((directory (eliscript-analysis-session-directory session)))
      (when (file-directory-p directory)
        (delete-directory directory t)))))

(defun eliscript-analysis--prepare-documents (session sources)
  "Return SESSION documents for SOURCES, advancing its revision if needed."
  (unless (equal sources (eliscript-analysis-session-sources session))
    (setf (eliscript-analysis-session-sources session) (copy-tree sources)
          (eliscript-analysis-session-documents session)
          (eliscript-analysis--documents sources)
          (eliscript-analysis-session-revision session)
          (1+ (eliscript-analysis-session-revision session))
          (eliscript-analysis-session-indexed-generation session) nil))
  (eliscript-analysis-session-documents session))

(defun eliscript-analysis--accelerated-p (operation arguments path)
  "Return non-nil when OPERATION with ARGUMENTS selects acceleration."
  (eq (eliscript-service--path operation arguments path) 'accelerated))

(defun eliscript-analysis--ensure-index (session documents)
  "Synchronize DOCUMENTS into SESSION's current worker generation."
  (let* ((service (eliscript-analysis-session-service session))
         (generation
          (eliscript-worker-generation (eliscript-service-worker service))))
    (unless (equal generation
                   (eliscript-analysis-session-indexed-generation session))
      (eliscript-service-call-sync
       service 'index-documents
       (list documents (eliscript-analysis-session-revision session))
       :path 'accelerated :timeout-ms 30000)
      (setf (eliscript-analysis-session-indexed-generation session)
            generation))))

(cl-defun eliscript-analysis-search-sync
    (session sources query &key path timeout-ms)
  "Search (ID . TEXT) SOURCES for QUERY using SESSION."
  (let* ((documents (eliscript-analysis--prepare-documents session sources))
         (revision (eliscript-analysis-session-revision session))
         (arguments (list documents query revision)))
    (when (eliscript-analysis--accelerated-p
           eliscript-analysis--search-operation arguments path)
      (eliscript-analysis--ensure-index session documents))
    (eliscript-service-call-sync
     (eliscript-analysis-session-service session)
     'search-documents arguments :path path :timeout-ms timeout-ms)))

(cl-defun eliscript-analysis-search
    (session sources query callback
             &key path buffer apply progress metrics timeout-ms)
  "Asynchronously search SOURCES for QUERY and invoke CALLBACK.

BUFFER and APPLY enable stale-result rejection and atomic editor updates."
  (let* ((documents (eliscript-analysis--prepare-documents session sources))
         (revision (eliscript-analysis-session-revision session))
         (arguments (list documents query revision)))
    (when (eliscript-analysis--accelerated-p
           eliscript-analysis--search-operation arguments path)
      (eliscript-analysis--ensure-index session documents))
    (eliscript-service-call
     (eliscript-analysis-session-service session)
     'search-documents arguments callback
     :path path :buffer buffer :apply apply :progress progress
     :metrics metrics :timeout-ms timeout-ms)))

(cl-defun eliscript-analysis-statistics-sync
    (session sources &key path timeout-ms)
  "Return per-document statistics for SOURCES using SESSION."
  (let* ((documents (eliscript-analysis--prepare-documents session sources))
         (arguments
          (list documents (eliscript-analysis-session-revision session))))
    (when (eliscript-analysis--accelerated-p
           eliscript-analysis--statistics-operation arguments path)
      (eliscript-analysis--ensure-index session documents))
    (eliscript-service-call-sync
     (eliscript-analysis-session-service session)
     'document-statistics arguments :path path :timeout-ms timeout-ms)))

(cl-defun eliscript-analysis-statistics
    (session sources callback
             &key path buffer apply progress metrics timeout-ms)
  "Asynchronously compute SOURCES statistics and invoke CALLBACK.

BUFFER and APPLY enable stale-result rejection and atomic editor updates."
  (let* ((documents (eliscript-analysis--prepare-documents session sources))
         (arguments
          (list documents (eliscript-analysis-session-revision session))))
    (when (eliscript-analysis--accelerated-p
           eliscript-analysis--statistics-operation arguments path)
      (eliscript-analysis--ensure-index session documents))
    (eliscript-service-call
     (eliscript-analysis-session-service session)
     'document-statistics arguments callback
     :path path :buffer buffer :apply apply :progress progress
     :metrics metrics :timeout-ms timeout-ms)))

(cl-defun eliscript-analysis-frequencies-sync
    (session sources &key path timeout-ms)
  "Return corpus term frequencies for SOURCES using SESSION."
  (let* ((documents (eliscript-analysis--prepare-documents session sources))
         (arguments
          (list documents (eliscript-analysis-session-revision session))))
    (when (eliscript-analysis--accelerated-p
           eliscript-analysis--frequencies-operation arguments path)
      (eliscript-analysis--ensure-index session documents))
    (eliscript-service-call-sync
     (eliscript-analysis-session-service session)
     'term-frequencies arguments :path path :timeout-ms timeout-ms)))

(provide 'eliscript-analysis)

;;; eliscript-analysis.el ends here
