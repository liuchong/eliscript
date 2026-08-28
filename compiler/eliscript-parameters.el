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

(defconst eliscript-binding--markers '(&optional &rest &body))

(defun eliscript-binding-pattern-p (form)
  "Return non-nil when FORM can represent a binding pattern."
  (let ((value (eliscript-form-value form)))
    (or (and value
             (symbolp value)
             (not (memq value eliscript-binding--markers)))
        (vectorp value))))

(defun eliscript-binding-names (pattern fail)
  "Validate binding PATTERN and return its bound symbol forms.

FAIL receives the offending form and a diagnostic message.  Vector patterns
support nested vectors, nil holes, and one final `&rest' symbol."
  (let ((value (eliscript-form-value pattern)))
    (cond
     ((null value) nil)
     ((symbolp value)
      (if (memq value eliscript-binding--markers)
          (progn
            (funcall fail pattern "invalid binding pattern marker")
            nil)
        (list pattern)))
     ((vectorp value)
      (let ((elements (append value nil))
            names
            rest-seen
            rest-done)
        (dolist (element elements)
          (let ((element-value (eliscript-form-value element)))
            (cond
             ((eq element-value '&rest)
              (when (or rest-seen rest-done)
                (funcall fail element "invalid vector binding pattern"))
              (setq rest-seen t))
             (rest-seen
              (unless (and element-value
                           (symbolp element-value)
                           (not (memq element-value
                                      eliscript-binding--markers)))
                (funcall fail element
                         "vector &rest binding must be a symbol"))
              (push element names)
              (setq rest-seen nil
                    rest-done t))
             (rest-done
              (funcall fail element
                       "vector &rest binding must be final"))
             ((null element-value) nil)
             (t
              (setq names
                    (nconc
                     (nreverse (eliscript-binding-names element fail))
                     names))))))
        (when rest-seen
          (funcall fail pattern "vector &rest requires a binding"))
        (nreverse names)))
     (t
      (funcall
       fail pattern
       (format "binding pattern must be a symbol or vector: %S"
               (eliscript-form-strip pattern)))
      nil))))

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
            (unless (and name
                         (symbolp name)
                         (not (memq name eliscript-binding--markers)))
              (funcall fail parameter
                       "function &rest parameter must be a symbol"))
            (push (eliscript-parameter-create :kind 'rest :form parameter)
                  parsed)
            (setq mode 'done))
           ((eq mode 'done)
            (funcall fail parameter "invalid function parameter list"))
           (t
            (unless (eliscript-binding-pattern-p parameter)
              (funcall
               fail parameter
               (format "function arguments must be symbols or vectors: %S"
                       (eliscript-form-strip parameters))))
            (eliscript-binding-names parameter fail)
            (push (eliscript-parameter-create :kind mode :form parameter)
                  parsed)))))
      (when (eq mode 'rest)
        (funcall fail parameters "invalid function parameter list"))
      (nreverse parsed))))

(provide 'eliscript-parameters)

;;; eliscript-parameters.el ends here
