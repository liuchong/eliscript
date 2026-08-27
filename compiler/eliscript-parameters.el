;;; eliscript-parameters.el --- Function parameter parsing -*- lexical-binding: t; -*-

;;; Commentary:

;; Parse the shared required, optional, and rest parameter grammar while
;; preserving located source forms for diagnostics and IR lowering.

;;; Code:

(require 'cl-lib)
(require 'eliscript-form)

(cl-defstruct (eliscript-parameter
               (:constructor eliscript-parameter-create))
  kind
  form)

(defun eliscript-parameters-parse (parameters fail)
  "Parse located function PARAMETERS, calling FAIL for invalid syntax.

FAIL receives the offending form and a fully formatted diagnostic message."
  (let ((items (eliscript-form-value parameters)))
    (unless (proper-list-p items)
      (funcall fail parameters "function arguments must be a list"))
    (let ((mode 'required)
          parsed)
      (dolist (parameter items)
        (let ((name (eliscript-form-value parameter)))
          (unless (symbolp name)
            (funcall
             fail parameter
             (format "function arguments must be symbols: %S"
                     (eliscript-form-strip parameters))))
          (cond
           ((eq name '&optional)
            (unless (eq mode 'required)
              (funcall fail parameter "invalid function parameter list"))
            (setq mode 'optional))
           ((eq name '&rest)
            (unless (memq mode '(required optional))
              (funcall fail parameter "invalid function parameter list"))
            (setq mode 'rest))
           ((eq name '&body)
            (funcall fail parameter "invalid function parameter list"))
           ((eq mode 'rest)
            (push (eliscript-parameter-create :kind 'rest :form parameter)
                  parsed)
            (setq mode 'done))
           ((eq mode 'done)
            (funcall fail parameter "invalid function parameter list"))
           (t
            (push (eliscript-parameter-create :kind mode :form parameter)
                  parsed)))))
      (when (eq mode 'rest)
        (funcall fail parameters "invalid function parameter list"))
      (nreverse parsed))))

(provide 'eliscript-parameters)

;;; eliscript-parameters.el ends here
