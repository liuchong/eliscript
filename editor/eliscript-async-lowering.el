;;; eliscript-async-lowering.el --- Continuations for async bodies -*- lexical-binding: t; -*-
;;; Commentary:
;; Suspend once, preserving the continuation and source binding mode.  Only
;; expressions containing await are split; ordinary Elisp uses ordinary eval.
;;; Code:
(require 'cl-lib)

(defun eliscript-async--suspends-p (form)
  (and (consp form)
       (not (memq (car form) '(quote function lambda defun lambda-async defun-async)))
       (or (eq (car form) 'await)
           (cl-some #'eliscript-async--suspends-p (if (symbolp (car form)) (cdr form) form)))))

(defun eliscript-async--lower-body (body dynamic-variables &optional dynamic-mode)
  "Lower BODY, retaining DYNAMIC-VARIABLES in DYNAMIC-MODE at suspension points."
  (cl-labels
      ((box (value) `(cons 'eliscript-async-value ,value))
       (unbox (scoped k)
         (let ((tmp (make-symbol "async-scope-value")))
           `(eliscript-async--await
             ,scoped
             (lambda (,tmp)
               (setq ,tmp (cdr ,tmp))
               ,(funcall k tmp))
             (eliscript-async--capture))))
       (finish (scoped k)
         (unbox `(eliscript-async--protect (lambda () ,scoped) nil nil) k))
       (sequence (forms vars k)
         (cond ((null forms) (funcall k nil))
               ((null (cdr forms)) (lower (car forms) vars k))
               (t (lower (car forms) vars
                         (lambda (value) `(progn ,value ,(sequence (cdr forms) vars k)))))))
       (arguments (forms vars k)
         (if (null forms) (funcall k nil)
           (lower (car forms) vars
                  (lambda (value)
                    (let ((tmp (make-symbol "async-argument")))
                      `(let ((,tmp ,value))
                         ,(arguments (cdr forms) vars
                                     (lambda (tail) (funcall k (cons tmp tail))))))))))
       (lower (raw vars k)
         (let ((form (macroexpand raw)))
           (if (not (eliscript-async--suspends-p form)) (funcall k form)
             (pcase (car form)
               ('await
                (unless (= (length form) 2) (error "ELI-A0001: await expects one Future"))
                (lower (cadr form) vars
                       (lambda (value)
                         (let ((tmp (make-symbol "async-value")))
                           `(eliscript-async--await ,value
                              (lambda (,tmp) ,(funcall k tmp))
                              (eliscript-async--capture))))))
               ('progn (sequence (cdr form) vars k))
               ('if (lower (cadr form) vars
                           (lambda (test) `(if ,test ,(lower (caddr form) vars k)
                                            ,(sequence (cdddr form) vars k)))))
               ('cond
                (let ((clauses (cdr form)))
                  (if (null clauses) (funcall k nil)
                    (let ((clause (car clauses)) (tmp (make-symbol "async-cond")))
                      (lower (car clause) vars
                             (lambda (test)
                               `(let ((,tmp ,test))
                                  (if ,tmp
                                      ,(if (null (cdr clause)) (funcall k tmp)
                                         (sequence (cdr clause) vars k))
                                    ,(lower `(cond ,@(cdr clauses)) vars k)))))))))
               ((or 'let 'let*)
                (let ((bindings (cadr form)) (rest (cddr form)))
                  (if (eq (car form) 'let*)
                      (if (null bindings) (sequence rest vars k)
                        (let* ((binding (car bindings))
                               (var (if (consp binding) (car binding) binding))
                               (init (and (consp binding) (cadr binding))))
                          (arguments (list init) vars (lambda (values)
                            (finish `(eliscript-async--binding-scope
                              (lambda () (let ((,var ,(car values)))
                                (eliscript-async--with-bindings '(,var) ,dynamic-mode
                                  (lambda () ,(lower `(let* ,(cdr bindings) ,@rest) vars #'box)))))) k)))))
                    (arguments (mapcar (lambda (b) (and (consp b) (cadr b))) bindings) vars
                      (lambda (values)
                        (let ((names (mapcar (lambda (b) (if (consp b) (car b) b)) bindings)))
                          (finish `(eliscript-async--binding-scope
                            (lambda () (let ,(cl-mapcar #'list names values)
                              (eliscript-async--with-bindings ',names ,dynamic-mode
                                (lambda () ,(sequence rest vars #'box)))))) k)))))))
               ('setq
                (unless (and (cdr form) (= (% (length (cdr form)) 2) 0)) (error "Malformed async setq"))
                (lower (caddr form) vars (lambda (value)
                  (let ((assignment `(setq ,(cadr form) ,value)))
                    (if (null (cdddr form)) (funcall k assignment)
                      `(progn ,assignment ,(lower `(setq ,@(cdddr form)) vars k)))))))
               ('while
                (let ((tmp (make-symbol "async-loop")))
                  `(eliscript-async--await
                    (eliscript-async--loop
                     (lambda () ,(lower (cadr form) vars
                       (lambda (test) `(if ,test
                         ,(sequence (cddr form) vars (lambda (value) `(progn ,value eliscript-async--next)))
                         nil)))))
                    (lambda (,tmp) (ignore ,tmp) ,(funcall k nil))
                    (eliscript-async--capture))))
               ('condition-case
                (let ((err (make-symbol "async-error"))
                      (caught (make-symbol "async-caught")) (variable (cadr form)))
                  (unbox
                   `(eliscript-async--protect
                     (lambda () ,(lower (caddr form) vars #'box))
                     (lambda (,err)
                       (condition-case ,caught (signal (car ,err) (cdr ,err))
                         ,@(mapcar (lambda (h)
                           (list (car h)
                             `(eliscript-async--binding-scope
                               (lambda () (let ,(if variable (list (list variable caught)) nil)
                                 (eliscript-async--with-bindings ',(if variable (list variable) nil) ,dynamic-mode
                                   (lambda () ,(sequence (cdr h) vars #'box))))))))
                           (cdddr form)))) nil)
                   k)))
               ('unwind-protect
                (unbox
                 `(eliscript-async--protect (lambda () ,(lower (cadr form) vars #'box)) nil
                    (lambda () ,(sequence (cddr form) vars #'box)))
                 k))
               ((or 'and 'or)
                (if (null (cdr form)) (funcall k (eq (car form) 'and))
                  (lower (cadr form) vars (lambda (value)
                    (let ((tmp (make-symbol "async-test")))
                      `(let ((,tmp ,value))
                         ,(if (null (cddr form)) (funcall k tmp)
                            `(if ,tmp
                                 ,(if (eq (car form) 'and) (lower `(and ,@(cddr form)) vars k) (funcall k tmp))
                               ,(if (eq (car form) 'or) (lower `(or ,@(cddr form)) vars k) (funcall k tmp))))))))))
               ('prog1
                (lower (cadr form) vars (lambda (first)
                  (let ((tmp (make-symbol "async-first")))
                    `(let ((,tmp ,first)) ,(sequence (cddr form) vars
                      (lambda (value) `(progn ,value ,(funcall k tmp)))))))))
               (_
                (when (special-form-p (car form)) (error "ELI-A0001: unsupported suspension boundary %s" (car form)))
                (arguments (cdr form) vars (lambda (values) (funcall k (cons (car form) values))))))))))
    (sequence body dynamic-variables #'identity)))

(provide 'eliscript-async-lowering)
;;; eliscript-async-lowering.el ends here
