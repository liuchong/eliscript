;;; oracle-driver.el --- Native Emacs side of the differential oracle -*- lexical-binding: t; no-byte-compile: t; -*-

;; Inputs (environment, all JSON):
;;   ELISCRIPT_ORACLE_CASES    array of {"id": ..., "code": ...}
;;   ELISCRIPT_ORACLE_PROVIDE  array of feature names to provide before loading
;;   ELISCRIPT_ORACLE_LOAD     array of absolute .el files loaded once, unmodified
;; Ordinary forms use GNU Emacs directly, without Eliscript preprocessing.
;; Explicit extension cases use the maintained Emacs extension implementation.
;; Output: {"id", "ok", "value"} or {"id", "ok": false, "condition", "error"}.

(require 'cl-lib)
(require 'subr-x)
(require 'seq)
(require 'rx)
(require 'json)

(defun eliscript-oracle--env (name)
  "Return the decoded JSON environment variable NAME, or nil."
  (let ((raw (getenv name)))
    (and raw (not (string-empty-p raw))
         (json-parse-string raw :object-type 'alist :array-type 'list))))

(defun eliscript-oracle--normalize (value)
  "Return VALUE as JSON-serializable data matching `serializeValue'."
  (cond
   ((null value) :null)
   ((eq value t) t)
   ((numberp value) value)
   ((stringp value) value)
   ((symbolp value) (symbol-name value))
   ((and (vectorp value) (not (recordp value)))
    (vconcat (mapcar #'eliscript-oracle--normalize (append value nil))))
   ((consp value)
    (let ((out nil) (cursor value))
      (while (consp cursor)
        (push (eliscript-oracle--normalize (car cursor)) out)
        (setq cursor (cdr cursor)))
      (when cursor (push (eliscript-oracle--normalize cursor) out))
      (vconcat (nreverse out))))
   (t (prin1-to-string value))))

(defun eliscript-oracle--eval-native (code)
  "Evaluate every form of CODE with lexical binding and return the last value."
  (with-temp-buffer
    (emacs-lisp-mode)
    (insert code)
    (goto-char (point-min))
    (let ((value nil))
      ;; Only whitespace/comments end the source. An incomplete form or an
      ;; explicit end-of-file signal from evaluated code is a real error.
      (while (progn (forward-comment (point-max)) (not (eobp)))
        (setq value (eval (read (current-buffer)) t)))
      value)))

(let* ((cases (eliscript-oracle--env "ELISCRIPT_ORACLE_CASES"))
       (results nil))
  (dolist (feature (eliscript-oracle--env "ELISCRIPT_ORACLE_PROVIDE"))
    (provide (intern feature)))
  (dolist (file (eliscript-oracle--env "ELISCRIPT_ORACLE_LOAD"))
    (load file nil t))
  ;; Run the language reference before any extension library can affect its
  ;; function cells. Extension loading must never redefine the reference core.
  (setq cases (append (seq-remove (lambda (case) (eq (alist-get 'extension case) t)) cases)
                      (seq-filter (lambda (case) (eq (alist-get 'extension case) t)) cases)))
  (dolist (case cases)
    (let ((id (alist-get 'id case))
          (code (alist-get 'code case))
          (extension (eq (alist-get 'extension case) t)))
      (condition-case err
          (let ((value (if extension
                           (progn
                             (require 'eliscript-runtime)
                             (eliscript-runtime-reset-state!)
                             (eliscript-runtime-eval-string code))
                         (eliscript-oracle--eval-native code))))
            (push `((id . ,id) (ok . t) (value . ,(eliscript-oracle--normalize value))) results))
        (error
         (push `((id . ,id) (ok . :false) (condition . ,(symbol-name (car err)))
                 (error . ,(format "%S" err))) results)))))
  ;; `json-serialize' returns UTF-8 bytes; print decoded text so the output
  ;; stream encodes it exactly once.
  (let ((coding-system-for-write 'utf-8-unix))
    (princ (decode-coding-string
            (json-serialize (vconcat (nreverse results)) :null-object :null :false-object :false)
            'utf-8-unix))))

;;; oracle-driver.el ends here
