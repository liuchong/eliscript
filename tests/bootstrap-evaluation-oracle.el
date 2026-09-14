;;; bootstrap-evaluation-oracle.el --- Seed evaluation oracle -*- lexical-binding: t; -*-

(let* ((tests-directory
        (file-name-directory (or load-file-name buffer-file-name)))
       (project-directory
        (file-name-directory (directory-file-name tests-directory))))
  (add-to-list 'load-path tests-directory)
  (add-to-list 'load-path (expand-file-name "compiler" project-directory)))

(require 'json)
(require 'eliscript)

(defun eliscript-bootstrap-evaluation-oracle--case (case)
  "Evaluate one seed descriptor CASE and return a JSON-ready outcome."
  (condition-case error-data
      (let* ((kind (alist-get 'kind case))
             (value
              (cond
               ((string-equal kind "operation")
                (eliscript-evaluation-operation-request
                 (alist-get 'input case)))
               ((string-equal kind "input")
                (eliscript-evaluation-input-description
                 (alist-get 'source case) (alist-get 'filename case)))
               ((string-equal kind "form")
                (eliscript-evaluation-form-description
                 (alist-get 'source case) (alist-get 'filename case)))
               ((string-equal kind "module")
                (eliscript-evaluation-module-description
                 (alist-get 'source case) (alist-get 'filename case)))
               (t (error "unknown evaluation oracle case: %s" kind)))))
        `((status . "ok") (value . ,value)))
    (error
     `((status . "error")
       (diagnostic
        . ,(eliscript-diagnostic-to-alist
            (eliscript-diagnostic-from-error error-data)))))))

(let* ((input-file (getenv "ELISCRIPT_EVALUATION_ORACLE_INPUT"))
       (input
        (with-temp-buffer
          (insert-file-contents-literally input-file)
          (json-parse-buffer
           :object-type 'alist
           :array-type 'list
           :null-object nil
           :false-object :false)))
       (results
        (mapcar #'eliscript-bootstrap-evaluation-oracle--case input)))
  (princ
   (json-serialize
    (vconcat results)
    :null-object nil
    :false-object :false)))

;;; bootstrap-evaluation-oracle.el ends here
