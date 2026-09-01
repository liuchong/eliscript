;;; eliscript-index.el --- Portable document indexing workload -*- lexical-binding: t; -*-

;;; Commentary:

;; Keep text extraction and editor state in Emacs while a portable Eliscript
;; module graph scores explicit document data in a long-lived JavaScript
;; worker.

;;; Code:

(require 'cl-lib)
(require 'subr-x)
(require 'eliscript-project)
(require 'eliscript-service)

(defconst eliscript-index--source-file
  (expand-file-name
   "examples/emacs-index/index.eli"
   eliscript-worker--project-directory)
  "Portable Eliscript source used by the indexing adapter.")

(cl-defstruct (eliscript-index-session
               (:constructor eliscript-index-session--create))
  worker
  service
  build
  module
  directory)

(defun eliscript-index--score-document-reference (id terms query-terms)
  "Return the reference score for ID, TERMS, and QUERY-TERMS."
  (let ((frequencies (make-hash-table :test #'equal))
        (matches 0))
    (dotimes (index (length terms))
      (let ((term (elt terms index)))
        (puthash term (1+ (gethash term frequencies 0)) frequencies)))
    (dotimes (index (length query-terms))
      (setq matches
            (+ matches (gethash (elt query-terms index) frequencies 0))))
    `((id . ,id) (matches . ,matches) (terms . ,(length terms)))))

(defconst eliscript-index--score-operation
  (eliscript-service-operation
   'score-document #'eliscript-index--score-document-reference
   :portable-name "score-document"
   :workload-size
   (lambda (arguments)
     (* (length (nth 1 arguments)) (length (nth 2 arguments))))
   :threshold 0)
  "Dual-path declaration for document scoring.")

(defun eliscript-index-tokenize (text)
  "Return normalized word tokens from TEXT as a vector."
  (let ((case-fold-search nil)
        (start 0)
        tokens)
    (while (string-match "[[:alnum:]_]+" text start)
      (push (downcase (match-string 0 text)) tokens)
      (setq start (match-end 0)))
    (vconcat (nreverse tokens))))

(defun eliscript-index-document (id text)
  "Create a serializable indexing document for ID and TEXT."
  `((id . ,id) (terms . ,(eliscript-index-tokenize text))))

(defun eliscript-index-start (&optional command)
  "Compile the indexing module graph and start a worker session.

COMMAND has the same meaning as in `eliscript-worker-start'."
  (let* ((directory (make-temp-file "eliscript-index-" t))
         (project-root eliscript-worker--project-directory)
         build
         module
         service)
    (condition-case error-data
        (progn
          (setq build
                (eliscript-project-build-portable
                 eliscript-index--source-file
                 '(score-document)
                 directory
                 project-root)
                module (eliscript-project-build-result-entry-output build))
          (setq service
                (eliscript-service-start
                 (eliscript-service-module-declare
                  module
                  :project-manifest
                  (eliscript-project-build-result-manifest build))
                 (list eliscript-index--score-operation)
                 :command command
                 :verify 'always
                 :value-codec nil
                 :value-chunks nil))
          (eliscript-index-session--create
           :worker (eliscript-service-worker service)
           :service service
           :build build
           :module module
           :directory directory))
      (error
       (when service (eliscript-service-stop service t))
       (delete-directory directory t)
       (signal (car error-data) (cdr error-data))))))

(defun eliscript-index-stop (session)
  "Stop SESSION and remove its generated module tree and source maps."
  (when (eliscript-index-session-p session)
    (eliscript-service-stop (eliscript-index-session-service session))
    (let ((directory (eliscript-index-session-directory session)))
      (when (file-directory-p directory)
        (delete-directory directory t)))))

(defun eliscript-index--field (field document)
  "Return FIELD from serializable DOCUMENT or signal an input error."
  (let ((value (alist-get field document :eliscript-index--missing)))
    (when (eq value :eliscript-index--missing)
      (signal 'wrong-type-argument (list (list 'document-field field) document)))
    value))

(cl-defun eliscript-index-score-documents
    (session documents query-terms callback &key metrics timeout-ms)
  "Asynchronously score DOCUMENTS for QUERY-TERMS in SESSION.

Each document is an alist with `id' and `terms' fields. CALLBACK receives
(RESULT ERROR), where RESULT is a vector preserving document order. METRICS,
when non-nil, receives the vector of worker timing objects after success.
Return cancellable service request handles."
  (let* ((service (eliscript-index-session-service session))
         (items (vconcat documents))
         (count (length items))
         (payloads
          (apply
           #'vector
           (mapcar
            (lambda (document)
              (list (eliscript-index--field 'id document)
                    (eliscript-index--field 'terms document)
                    query-terms))
            (append items nil))))
         (results (make-vector count nil))
         (timings (make-vector count nil))
         (remaining count)
         (finished nil)
         requests)
    (cl-labels
         ((cancel-pending ()
           (dolist (request requests)
             (eliscript-service-cancel request)))
         (complete (index value error-object)
           (unless finished
             (if error-object
                 (progn
                   (setq finished t)
                   (cancel-pending)
                   (funcall callback nil error-object))
               (aset results index value)
               (setq remaining (1- remaining))
               (when (= remaining 0)
                 (setq finished t)
                 (when metrics (funcall metrics timings))
                 (funcall callback results nil))))))
      (if (= count 0)
          (progn
            (when metrics (funcall metrics timings))
            (funcall callback results nil))
        (dotimes (index count)
          (let ((result-index index))
            (push
             (eliscript-service-call
              service 'score-document (aref payloads result-index)
              (lambda (value error-object)
                (complete result-index value error-object))
              :metrics (lambda (value) (aset timings result-index value))
              :timeout-ms timeout-ms)
             requests))))
      (nreverse requests))))

(cl-defun eliscript-index-score-documents-sync
    (session documents query-terms &key metrics timeout-ms)
  "Synchronously score DOCUMENTS for QUERY-TERMS in SESSION."
  (let ((worker (eliscript-index-session-worker session))
        done result error-object timing-values)
    (eliscript-index-score-documents
     session documents query-terms
     (lambda (value request-error)
       (setq result value
             error-object request-error
             done t))
     :metrics (lambda (values) (setq timing-values values))
     :timeout-ms timeout-ms)
    (while (and (not done) (eliscript-worker-live-p worker))
      (accept-process-output (eliscript-worker-process worker) 0.05))
    (unless done
      (signal 'eliscript-worker-error
              (list "index worker exited without a response")))
    (when error-object
      (signal 'eliscript-worker-request-error
              (list (eliscript-worker-format-error error-object) error-object)))
    (when metrics (funcall metrics timing-values))
    result))

(cl-defun eliscript-index-search-sync
    (session documents query &key metrics timeout-ms)
  "Tokenize text DOCUMENTS and QUERY, then synchronously score them.

DOCUMENTS is an alist of (ID . TEXT) pairs."
  (eliscript-index-score-documents-sync
   session
   (mapcar (lambda (document)
             (eliscript-index-document (car document) (cdr document)))
           documents)
   (eliscript-index-tokenize query)
   :metrics metrics
   :timeout-ms timeout-ms))

(provide 'eliscript-index)

;;; eliscript-index.el ends here
