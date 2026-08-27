;;; eliscript-form.el --- Located source forms for Eliscript -*- lexical-binding: t; -*-

;;; Commentary:

;; Located forms carry source spans through the front end while preserving a
;; simple recursive conversion back to ordinary Emacs Lisp data.

;;; Code:

(require 'cl-lib)

(cl-defstruct (eliscript-source-span
               (:constructor eliscript-source-span-create))
  filename
  start
  end
  line
  column
  end-line
  end-column)

(cl-defstruct (eliscript-located-form
               (:constructor eliscript-located-form-create))
  value
  span)

(defun eliscript-form-value (form)
  "Return FORM's immediate value, or FORM itself when it is not located."
  (if (eliscript-located-form-p form)
      (eliscript-located-form-value form)
    form))

(defun eliscript-form-span (form)
  "Return FORM's source span, or nil when FORM is not located."
  (and (eliscript-located-form-p form)
       (eliscript-located-form-span form)))

(defun eliscript-form-wrap (value span)
  "Wrap VALUE in a located form carrying SPAN when SPAN is non-nil."
  (if span
      (eliscript-located-form-create :value value :span span)
    value))

(defun eliscript-form-inherit (value source)
  "Return VALUE carrying the source span from SOURCE."
  (eliscript-form-wrap value (eliscript-form-span source)))

(defun eliscript-form-strip (form)
  "Recursively remove location wrappers from FORM."
  (let ((value (eliscript-form-value form)))
    (cond
     ((consp value)
      (cons (eliscript-form-strip (car value))
            (eliscript-form-strip (cdr value))))
     ((vectorp value)
      (apply #'vector
             (mapcar #'eliscript-form-strip (append value nil))))
     (t value))))

(defun eliscript-form-locate-generated (form span)
  "Recursively assign SPAN to generated FORM and all of its children."
  (let ((value
         (cond
          ((and (consp form) (proper-list-p form))
           (mapcar (lambda (item)
                     (eliscript-form-locate-generated item span))
                   form))
          ((consp form) form)
          ((vectorp form)
           (apply #'vector
                  (mapcar (lambda (item)
                            (eliscript-form-locate-generated item span))
                          (append form nil))))
          (t form))))
    (eliscript-form-wrap value span)))

(provide 'eliscript-form)

;;; eliscript-form.el ends here
