;;; oracle-driver.el --- Native Emacs side of the emacs-compat differential oracle -*- lexical-binding: t; no-byte-compile: t; -*-

;; Inputs (environment, all JSON):
;;   ELISCRIPT_ORACLE_CASES    array of {"id": ..., "code": ...}
;;   ELISCRIPT_ORACLE_MODE     "compat" evaluates through `eliscript-compat-eval-string';
;;                             "native" evaluates the forms with plain `eval'
;;   ELISCRIPT_ORACLE_PROVIDE  array of feature names to provide before loading
;;   ELISCRIPT_ORACLE_LOAD     array of absolute .el files loaded once, unmodified
;; Output (stdout): JSON array of {"id", "ok", "value"} or {"id", "ok": false, "error"}.

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
  "Return VALUE as JSON-serializable data matching `serializeCompatValue'."
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
  (let ((position 0) (value nil) (length (length code)))
    (condition-case nil
        (while (< position length)
          (let ((read (read-from-string code position)))
            (setq position (cdr read)
                  value (eval (car read) t))))
      (end-of-file nil))
    value))

(let* ((mode (or (getenv "ELISCRIPT_ORACLE_MODE") "compat"))
       (cases (eliscript-oracle--env "ELISCRIPT_ORACLE_CASES"))
       (results nil))
  (dolist (feature (eliscript-oracle--env "ELISCRIPT_ORACLE_PROVIDE"))
    (provide (intern feature)))
  (dolist (file (eliscript-oracle--env "ELISCRIPT_ORACLE_LOAD"))
    (load file nil t))
  (when (equal mode "compat")
    (require 'eliscript-compat))
  (dolist (case cases)
    (let ((id (alist-get 'id case))
          (code (alist-get 'code case)))
      (when (and (equal mode "compat") (fboundp 'eliscript-compat-reset-state!))
        (eliscript-compat-reset-state!))
      (condition-case err
          (let ((value (if (equal mode "compat")
                           (eliscript-compat-eval-string code)
                         (eliscript-oracle--eval-native code))))
            (push `((id . ,id) (ok . t) (value . ,(eliscript-oracle--normalize value))) results))
        (error
         (push `((id . ,id) (ok . :false) (error . ,(format "%S" err))) results)))))
  ;; `json-serialize' returns UTF-8 bytes; print decoded text so the output
  ;; stream encodes it exactly once.
  (let ((coding-system-for-write 'utf-8-unix))
    (princ (decode-coding-string
            (json-serialize (vconcat (nreverse results)) :null-object :null :false-object :false)
            'utf-8-unix))))

;;; oracle-driver.el ends here
