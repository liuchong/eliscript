;;; eliscript-index.el --- Portable document indexing workload -*- lexical-binding: t; -*-

;;; Commentary:

;; Keep text extraction and editor state in Emacs while a portable Eliscript
;; kernel scores explicit document data in a long-lived JavaScript worker.

;;; Code:

(require 'cl-lib)
(require 'eliscript)
(require 'eliscript-worker)

(defconst eliscript-index--source-file
  (expand-file-name
   "examples/emacs-index/index.eli"
   eliscript-worker--project-directory)
  "Portable Eliscript source used by the indexing adapter.")

(cl-defstruct (eliscript-index-session
               (:constructor eliscript-index-session--create))
  worker
  module
  directory)

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
  "Compile the indexing kernel and start a worker session.

COMMAND has the same meaning as in `eliscript-worker-start'."
  (let* ((directory (make-temp-file "eliscript-index-" t))
         (module (expand-file-name "index.mjs" directory))
         worker)
    (condition-case error-data
        (progn
          (eliscript-compile-portable-file-with-source-map
           eliscript-index--source-file '(score-document) module)
          (setq worker (eliscript-worker-start command))
          (eliscript-index-session--create
           :worker worker :module module :directory directory))
      (error
       (when worker (eliscript-worker-stop worker t))
       (delete-directory directory t)
       (signal (car error-data) (cdr error-data))))))

(defun eliscript-index-stop (session)
  "Stop SESSION and remove its generated module and source map."
  (when (eliscript-index-session-p session)
    (eliscript-worker-stop (eliscript-index-session-worker session))
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
Return the worker request ids."
  (let* ((worker (eliscript-index-session-worker session))
         (module (eliscript-index-session-module session))
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
         request-ids)
    (cl-labels
        ((cancel-pending ()
           (dolist (id request-ids)
             (eliscript-worker-cancel worker id)))
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
             (eliscript-worker-call-portable
              worker module "score-document" (aref payloads result-index)
              (lambda (value error-object)
                (complete result-index value error-object))
              :metrics (lambda (value) (aset timings result-index value))
              :timeout-ms timeout-ms)
             request-ids))))
      (nreverse request-ids))))

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
