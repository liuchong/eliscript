;;; eliscript-portable-depth-tests.el --- Portable traversal depth -*- lexical-binding: t; -*-

(require 'ert)
(require 'cl-lib)
(require 'eliscript)

(defun eliscript-portable-depth-tests--snapshot (forms)
  "Record every source field without recursive source-tree comparison."
  (let ((pending (copy-sequence forms)) output)
    (while pending
      (let* ((form (pop pending)) (value (eliscript-form-value form)))
        (push (list (eliscript-form-span form)
                    (cond ((consp value) (cons 'list (length value)))
                          ((vectorp value) (cons 'vector (length value)))
                          ((floatp value) (format "%s" value)) (t value))) output)
        (when (or (consp value) (vectorp value))
          (setq pending (append (append value nil) pending)))))
    (nreverse output)))

(defun eliscript-portable-depth-tests--tree (depth)
  "Build DEPTH ordinary expression layers around an exact signed zero."
  (let ((form -0.0))
    (dotimes (index depth)
      (setq form
            (pcase (% index 3)
              (0 (list 'if t form nil))
              (1 (list '+ form 1))
              (2 (list 'let* (list (list 'value form)) 'value)))))
    form))

(defun eliscript-portable-depth-tests--outcome (source recursive)
  "Record SOURCE dependencies or its original portable error using RECURSIVE."
  (let ((forms (eliscript-read-located-string source "portable-origins.eli")))
    (condition-case error
        (if recursive
            (cl-letf (((symbol-function 'eliscript-portable--expression)
                       (symbol-function 'eliscript-portable--expression-recursive)))
              (eliscript-portable--closure forms '(run) "portable-origins.eli" t))
          (eliscript-portable--closure forms '(run) "portable-origins.eli" t))
      (eliscript-analyze-error error))))

(ert-deftest eliscript-portable-depth-ordinary-portable-body ()
  (let* ((body (eliscript-portable-depth-tests--tree 2048))
         (forms (list (list 'defportable 'run nil body)))
         (before (eliscript-portable-depth-tests--snapshot forms))
         (limit max-lisp-eval-depth) (binding-limit (symbol-value 'max-specpdl-size)))
    (should (eq (eliscript-portable-validate-module forms "deep-portable.eli") forms))
    (should (equal (eliscript-portable--closure forms '(run) "deep-portable.eli") '(run)))
    (should (equal before (eliscript-portable-depth-tests--snapshot forms)))
    (should (= limit max-lisp-eval-depth))
    (should (= binding-limit (symbol-value 'max-specpdl-size)))))

(ert-deftest eliscript-portable-depth-ordinary-module-has-no-portable-closure ()
  (let* ((forms (list (list 'defun 'ordinary nil
                            (eliscript-portable-depth-tests--tree 2048))))
         (before (eliscript-portable-depth-tests--snapshot forms)))
    (cl-letf (((symbol-function 'eliscript-portable--closure)
               (lambda (&rest _arguments)
                 (ert-fail "a module without defportable must not enter the portable closure"))))
      (should (eq (eliscript-portable-validate-module forms "ordinary.eli") forms)))
    (should (equal before (eliscript-portable-depth-tests--snapshot forms)))))

(ert-deftest eliscript-portable-depth-nested-modules-retain-source-order ()
  (let ((forms '((defconst first 1) (defportable run () first))))
    (dotimes (index 2048)
      (setq forms (list (cons 'module (cons (intern (format "module-%d" index)) forms)))))
    (should (equal (eliscript-portable--flatten forms)
                   '((defconst first 1) (defportable run () first))))
    (should (equal (eliscript-portable--closure forms '(run) "nested-modules.eli")
                   '(run first)))))

(ert-deftest eliscript-portable-depth-transitive-constants-retain-dfs-order ()
  (let (forms names previous)
    (dotimes (index 2048)
      (let ((name (intern (format "portable-depth-value-%d" index))))
        (push (list 'defconst name (or previous -0.0)) forms)
        (push name names)
        (setq previous name)))
    (setq forms (append (nreverse forms) (list (list 'defportable 'run nil previous))))
    (should (equal (eliscript-portable--closure forms '(run) "dependencies.eli")
                   (cons 'run names)))
    (should (equal (eliscript-portable-select-module forms '(run) "dependencies.eli")
                   forms))))

(ert-deftest eliscript-portable-depth-shallow-rules-and-errors-match-original ()
  (dolist (source
           '("(defconst constant 7) (defportable run (x) (let* ((a constant) (b a)) ((lambda (y) (+ b y)) x)))"
             "(defvar secret 7) (defportable run () (let* ((secret 0) (first secret)) first))"
             "(defvar secret 7) (defportable run () (let ((first secret) (secret 0)) first))"
             "(defconst constant 7) (defportable run () (let ((seed constant)) (lambda ({:keys [seed] :or {seed (lambda () seed)}}) seed)))"
             "(defportable run () (lambda ({:keys [value] :or {value (js* \"window\")}}) value))"
             "(defportable run () (js-object qualified/key 1 (+ 1 2) 4 :value (get (js-array) :field)))"
             "(defportable run () (let ((x 1)) (setq x (+ x 1)) (set! x 4) x))"
             "(defvar x 1) (defportable run () (setq x (print 4)))"
             "(defportable run () (if t (new Host) (js* \"window\")))"
             "(defportable run () (let ((host/name 1)) host/name))"
             "(defportable run () (js-array host/name (print 1)))"
             "(defportable run () '(js-call window :fetch))"
             "(defportable run () (vector (hash-map :ready t) (hash-set 1) [nil false undefined -0.0]))"))
    (should (equal (eliscript-portable-depth-tests--outcome source nil)
                   (eliscript-portable-depth-tests--outcome source t)))))

(ert-deftest eliscript-portable-depth-deep-forbidden-leaf-keeps-its-origin ()
  (let* ((span (eliscript-source-span-create
                :filename "forbidden-origin.eli" :start 17 :end 23
                :line 4 :column 3 :end-line 4 :end-column 9))
         (body (eliscript-form-wrap '(js* "window") span)))
    (dotimes (_index 2048) (setq body (list 'if t body nil)))
    (let ((forms (list (list 'defportable 'run nil body))))
      (let ((error (should-error
                    (eliscript-portable-validate-module forms "forbidden-origin.eli")
                    :type 'eliscript-analyze-error)))
        (should (string-match-p (regexp-quote "cannot use js*") (error-message-string error)))
        (should (string-match-p "forbidden-origin.eli:4:3" (error-message-string error)))))))

(ert-deftest eliscript-portable-depth-closure-cycles-and-project-import-boundary ()
  (let ((forms '((defportable run () (other)) (defportable other () (run)))))
    (should (equal (eliscript-portable--closure forms '(run other) "cycles.eli")
                   '(run other))))
  (let ((forms '((import-portable "./dependency.eli" helper)
                 (defportable run () (helper)))))
    (should-error (eliscript-portable-select-module forms '(run) "imports.eli")
                  :type 'eliscript-analyze-error)
    (should (equal (eliscript-portable--closure forms '(run) "imports.eli" t)
                   '(run helper)))))

(provide 'eliscript-portable-depth-tests)
;;; eliscript-portable-depth-tests.el ends here
