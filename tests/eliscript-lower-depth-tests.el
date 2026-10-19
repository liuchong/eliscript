;;; eliscript-lower-depth-tests.el --- Ordinary lowering depth -*- lexical-binding: t; -*-

(require 'ert)
(require 'cl-lib)
(require 'eliscript)

(defconst eliscript-lower-depth-tests--root
  (expand-file-name ".." (file-name-directory (or load-file-name buffer-file-name))))

(defun eliscript-lower-depth-tests--value (value)
  "Retain IEEE signs when recording the immediate VALUE."
  (if (floatp value) (list 'float (format "%s" value)) value))

(defun eliscript-lower-depth-tests--ir (node)
  "Record every IR field in preorder without recursively comparing children."
  (let ((pending (list node)) records)
    (while pending
      (let* ((next (pop pending))
             (children (eliscript-ir-node-children next)))
        (push (list (eliscript-ir-node-kind next)
                    (eliscript-ir-node-span next)
                    (eliscript-lower-depth-tests--value
                     (eliscript-ir-node-value next))
                    (eliscript-ir-node-properties next) (length children))
              records)
        (setq pending (append children pending))))
    (nreverse records)))

(defun eliscript-lower-depth-tests--forms (form)
  "Record FORM's complete source tree without using recursive stripping."
  (let ((pending (list form)) records)
    (while pending
      (let* ((next (pop pending)) (value (eliscript-form-value next)))
        (push (list (eliscript-form-span next)
                    (cond ((consp value) (cons 'list (length value)))
                          ((vectorp value) (cons 'vector (length value)))
                          (t (eliscript-lower-depth-tests--value value))))
              records)
        (when (or (consp value) (vectorp value))
          (setq pending (append (append value nil) pending)))))
    (nreverse records)))

(defun eliscript-lower-depth-tests--located (value index)
  "Locate VALUE at one stable generated origin INDEX."
  (eliscript-form-wrap
   value (eliscript-source-span-create
          :filename "generated-origin.eli" :start index :end (1+ index)
          :line (1+ index) :column 1 :end-line (1+ index) :end-column 2)))

(defun eliscript-lower-depth-tests--ordinary-tree (depth)
  "Build independent source and expected IR trees with DEPTH ordinary layers."
  (let* ((leaf (eliscript-lower-depth-tests--located -0.0 0))
         (source leaf) (expected (eliscript-lower--node 'literal leaf -0.0)))
    (dotimes (index depth)
      (let* ((origin (1+ index))
             (head (eliscript-lower-depth-tests--located
                    (nth (% index 3) '(if invoke-me let*)) origin))
             (argument (eliscript-lower-depth-tests--located
                        (if (= (% index 3) 0) t 'slot) origin)))
        (pcase (% index 3)
          (0
           (let* ((otherwise (eliscript-lower-depth-tests--located nil origin))
                  (parent (eliscript-lower-depth-tests--located
                           (list head argument source otherwise) origin)))
             (setq expected
                   (eliscript-lower--node
                    'conditional parent 'if
                    (list (eliscript-lower--node 'literal argument t) expected
                          (eliscript-lower--node 'literal otherwise nil)))
                   source parent)))
          (1
           (let ((parent (eliscript-lower-depth-tests--located
                          (list head source argument) origin)))
             (setq expected
                   (eliscript-lower--node
                    'call parent nil
                    (list (eliscript-lower--node 'reference head 'invoke-me)
                          expected (eliscript-lower--node 'reference argument 'slot)))
                   source parent)))
          (2
           (let* ((binding (eliscript-lower-depth-tests--located
                            (list argument source) origin))
                  (bindings (eliscript-lower-depth-tests--located (list binding) origin))
                  (parent (eliscript-lower-depth-tests--located
                           (list head bindings argument) origin)))
             (setq expected
                   (eliscript-lower--node
                    'lexical-bindings parent nil
                    (list (eliscript-lower--node
                           'lexical-binding binding 'slot (list expected) '(:style list))
                          (eliscript-lower--node 'reference argument 'slot))
                    '(:sequential t :binding-count 1))
                   source parent))))))
    (cons source expected)))

(ert-deftest eliscript-lower-depth-ordinary-tree-preserves-every-field ()
  (let* ((trees (eliscript-lower-depth-tests--ordinary-tree 2048))
         (source (car trees))
         (before (eliscript-lower-depth-tests--forms source))
         (limit max-lisp-eval-depth)
         (binding-limit (symbol-value 'max-specpdl-size))
         (actual (eliscript-lower-expression source)))
    (should (equal (eliscript-lower-depth-tests--ir actual)
                   (eliscript-lower-depth-tests--ir (cdr trees))))
    (should (equal before (eliscript-lower-depth-tests--forms source)))
    (should (= max-lisp-eval-depth limit))
    (should (= (symbol-value 'max-specpdl-size) binding-limit))
    (should (member '(float "-0.0")
                    (mapcar (lambda (record) (nth 2 record))
                            (eliscript-lower-depth-tests--ir actual))))))

(ert-deftest eliscript-lower-depth-matches-original-recursive-ir ()
  (dolist (source
           '("(if t (call -0.0) (let* ((x 4) (y (+ x 1))) (get (js-object :x y) :x)))"
             "(cond ((f) (do (set! x 1) x)) (t (try (throw 2) (catch e (if e e 0)) (finally (print 3)))))"
             "(lambda (x &optional y) (loop ((i x)) (if y (recur (1- i)) ((lambda (z) (recur z)) i))))"
             "(js-array (vector 1 undefined) [nil false -0.0] (hash-map :x 1) (hash-set 2) (queue 3) (list 4))"
             "(let (([first &rest tail] (call 1))) (when first (unless tail (while first (and first (or tail 2))))))"
             "(await (funcall ((lambda (x) x) f) (apply f (js-array 1))))"))
    (let* ((form (car (eliscript-read-located-string source "shallow.eli")))
           (before (eliscript-lower-depth-tests--forms form))
           (expected
            (cl-letf (((symbol-function 'eliscript-lower-expression)
                       (symbol-function 'eliscript-lower--expression-recursive)))
              (eliscript-lower-expression form)))
           (actual (eliscript-lower-expression form)))
      (should (equal (eliscript-lower-depth-tests--ir actual)
                     (eliscript-lower-depth-tests--ir expected)))
      (should (equal before (eliscript-lower-depth-tests--forms form))))))

(ert-deftest eliscript-lower-depth-preserves-first-rejection ()
  (let* ((unsupported (make-hash-table))
         (form (list 'if t unsupported (list 'let (list (list [42] 1)) 0)))
         (expected
          (cl-letf (((symbol-function 'eliscript-lower-expression)
                     (symbol-function 'eliscript-lower--expression-recursive)))
            (should-error (eliscript-lower-expression form))))
         (actual (should-error (eliscript-lower-expression form))))
    (should (equal actual expected)))
  (should-error (eliscript-lower-expression '(let (([42] 1)) 0))
                :type 'error))

(ert-deftest eliscript-lower-depth-preserves-immediate-ieee-values ()
  (dolist (value (list -0.0 0.0 (read "0.0e+NaN")
                      (read "1.0e+INF") (read "-1.0e+INF")))
    (let* ((form (eliscript-lower-depth-tests--located value 7))
           (node (eliscript-lower-expression form)))
      (should (eq (eliscript-ir-node-kind node) 'literal))
      (should (equal (format "%s" (eliscript-ir-node-value node))
                     (format "%s" value)))
      (should (eq (eliscript-ir-node-span node) (eliscript-form-span form)))
      (should-not (eliscript-ir-node-properties node)))))

(ert-deftest eliscript-lower-depth-preserves-macro-call-source ()
  (let* ((forms (eliscript--analyzed-string
                 "(defmacro choose (x) `(if ,x (let ((y ,x)) y) nil))\n(choose 7)"
                 "macro-origin.eli"))
         (form (car forms))
         (before (eliscript-lower-depth-tests--forms form))
         (expected
          (cl-letf (((symbol-function 'eliscript-lower-expression)
                     (symbol-function 'eliscript-lower--expression-recursive)))
            (eliscript-lower-expression form)))
         (actual (eliscript-lower-expression form)))
    (should (equal (eliscript-lower-depth-tests--ir actual)
                   (eliscript-lower-depth-tests--ir expected)))
    (should (equal before (eliscript-lower-depth-tests--forms form)))
    (should (= (eliscript-source-span-line (eliscript-ir-node-span actual)) 2))))

(ert-deftest eliscript-lower-depth-original-regexp-property-tree ()
  ;; Keep the original deep input after production lookup moves to packed data.
  ;; The full immutable trie is also authenticated by the JS outlining suite.
  (let* ((filename (expand-file-name "tests/fixtures/regexp-property-original-trie.eli"
                                     eliscript-lower-depth-tests--root))
         (forms (eliscript-read-located-file filename))
         (pending forms) target)
    (while pending
      (let* ((form (pop pending)) (value (eliscript-form-value form)))
        (when (consp value)
          (pcase (eliscript-form-value (car value))
            ('module (setq pending (append (cddr value) pending)))
            ('defun
             (when (eq (eliscript-form-value (cadr value)) 'regexp-property-id-base)
               (setq target form)))))))
    (should target)
    (let* ((before (eliscript-lower-depth-tests--forms target))
           (node (eliscript-lower-top-level target))
           (records (eliscript-lower-depth-tests--ir node)))
      (should (eq (eliscript-ir-node-kind node) 'function-declaration))
      (should (eq (eliscript-ir-node-value node) 'regexp-property-id-base))
      (should (> (length records) 1000))
      (dolist (record records)
        (should (equal (eliscript-source-span-filename (nth 1 record)) filename)))
      (should (equal before (eliscript-lower-depth-tests--forms target))))))

(provide 'eliscript-lower-depth-tests)
;;; eliscript-lower-depth-tests.el ends here
