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

(defun eliscript-binding-map-pattern-p (form)
  "Return non-nil when FORM is a reader map in binding position."
  (let ((value (eliscript-form-value form)))
    (and (proper-list-p value)
         value
         (eq (eliscript-form-value (car value)) 'hash-map))))

(defun eliscript-binding-pattern-p (form)
  "Return non-nil when FORM can represent a binding pattern."
  (let ((value (eliscript-form-value form)))
    (or (and value
             (symbolp value)
             (not (memq value eliscript-binding--markers)))
        (vectorp value)
        (eliscript-binding-map-pattern-p form))))

(defun eliscript-binding--keyword-name (form name)
  "Create a located keyword FORM from binding NAME."
  (eliscript-form-inherit
   (intern (concat ":" (symbol-name name))) form))

(defun eliscript-binding-map-spec (pattern fail)
  "Validate map binding PATTERN and return its normalized specification.

The result contains `:entries', each with `:target', `:key', and optional
`:default', plus an optional `:as' binding.  FAIL receives the offending form
and a diagnostic message."
  (let* ((items (cdr (eliscript-form-value pattern)))
         entries defaults as
         keys-seen or-seen as-seen)
    (unless (= (% (length items) 2) 0)
      (funcall fail pattern "map binding pattern requires key/value pairs"))
    (while items
      (let* ((left (pop items))
             (right (pop items))
             (directive (eliscript-form-value left)))
        (cond
         ((eq directive :keys)
          (when keys-seen
            (funcall fail left "map binding pattern accepts :keys once"))
          (setq keys-seen t)
          (let ((names (eliscript-form-value right)))
            (unless (vectorp names)
              (funcall fail right "map binding :keys value must be a vector"))
            (dolist (name-form (append names nil))
              (let ((name (eliscript-form-value name-form)))
                (unless (and name
                             (symbolp name)
                             (not (keywordp name))
                             (not (memq name eliscript-binding--markers))
                             (not (string-match-p "/" (symbol-name name))))
                  (funcall fail name-form
                           "map binding :keys entries must be unqualified symbols"))
                (push (list :target name-form
                            :key (eliscript-binding--keyword-name name-form name))
                      entries)))))
         ((eq directive :or)
          (when or-seen
            (funcall fail left "map binding pattern accepts :or once"))
          (setq or-seen t)
          (unless (eliscript-binding-map-pattern-p right)
            (funcall fail right "map binding :or value must be a map"))
          (let ((pairs (cdr (eliscript-form-value right))))
            (while pairs
              (let* ((name-form (pop pairs))
                     (default (pop pairs))
                     (name (eliscript-form-value name-form)))
                (unless (and name
                             (symbolp name)
                             (not (keywordp name))
                             (not (memq name eliscript-binding--markers)))
                  (funcall fail name-form
                           "map binding :or keys must be binding symbols"))
                (when (assq name defaults)
                  (funcall fail name-form
                           "duplicate map binding :or default"))
                (push (cons name default) defaults)))))
         ((eq directive :as)
          (when as-seen
            (funcall fail left "map binding pattern accepts :as once"))
          (setq as-seen t)
          (let ((name (eliscript-form-value right)))
            (unless (and name
                         (symbolp name)
                         (not (keywordp name))
                         (not (memq name eliscript-binding--markers)))
              (funcall fail right "map binding :as value must be a symbol"))
            (setq as right)))
         ((keywordp directive)
          (funcall fail left
                   (format "unknown map binding directive: %s" directive)))
         (t
          (unless (eliscript-binding-pattern-p left)
            (funcall fail left "map binding entry target must be a binding pattern"))
          (let ((key (eliscript-form-value right)))
            (unless (or (keywordp key) (stringp key) (numberp key))
              (funcall fail right
                       "map binding entry key must be a keyword, string, or number")))
          (push (list :target left :key right) entries)))))
    (setq entries (nreverse entries))
    (dolist (default defaults)
      (let ((entry
             (cl-find-if
              (lambda (candidate)
                (eq (eliscript-form-value (plist-get candidate :target))
                    (car default)))
              entries)))
        (unless entry
          (funcall fail (cdr default)
                   (format "map binding :or has no scalar target: %s"
                           (car default))))
        (plist-put entry :default (cdr default))))
    (list :entries entries :as as)))

(defun eliscript-binding-defaults (pattern fail)
  "Return every default expression nested in binding PATTERN."
  (let ((value (eliscript-form-value pattern)))
    (cond
     ((or (null value) (symbolp value)) nil)
     ((vectorp value)
      (apply #'append
             (mapcar
              (lambda (element)
                (let ((element-value (eliscript-form-value element)))
                  (if (or (null element-value)
                          (eq element-value '&rest))
                      nil
                    (eliscript-binding-defaults element fail))))
              (append value nil))))
     ((eliscript-binding-map-pattern-p pattern)
      (let ((spec (eliscript-binding-map-spec pattern fail)) defaults)
        (dolist (entry (plist-get spec :entries))
          (when (plist-member entry :default)
            (push (plist-get entry :default) defaults))
          (setq defaults
                (nconc
                 (nreverse
                  (eliscript-binding-defaults
                   (plist-get entry :target) fail))
                 defaults)))
        (nreverse defaults)))
     (t nil))))

(defun eliscript-binding-names (pattern fail)
  "Validate binding PATTERN and return its bound symbol forms.

FAIL receives the offending form and a diagnostic message.  Vector patterns
support nested vectors, nil holes, and one final `&rest' symbol.  Map patterns
support explicit entries plus `:keys', `:or', and `:as'."
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
     ((eliscript-binding-map-pattern-p pattern)
      (let* ((spec (eliscript-binding-map-spec pattern fail))
             (entries (plist-get spec :entries))
             (as (plist-get spec :as))
             names)
        (dolist (entry entries)
          (setq names
                (nconc names
                       (eliscript-binding-names
                        (plist-get entry :target) fail))))
        (if as (append names (list as)) names)))
     (t
      (funcall
       fail pattern
       (format "binding pattern must be a symbol, vector, or map: %S"
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
               (format "function arguments must be symbols, vectors, or maps: %S"
                       (eliscript-form-strip parameters))))
            (eliscript-binding-names parameter fail)
            (push (eliscript-parameter-create :kind mode :form parameter)
                  parsed)))))
      (when (eq mode 'rest)
        (funcall fail parameters "invalid function parameter list"))
      (nreverse parsed))))

(provide 'eliscript-parameters)

;;; eliscript-parameters.el ends here
