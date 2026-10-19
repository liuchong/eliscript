;;; eliscript-ir-await-cache-tests.el --- Await traversal reuse -*- lexical-binding: t; -*-

(require 'ert)
(require 'cl-lib)
(require 'eliscript)

(defun eliscript-ir-await-cache-tests--node (kind &rest children)
  "Build a minimal IR node of KIND with CHILDREN for traversal tests."
  (eliscript-ir-make-node kind nil nil children))

(defun eliscript-ir-await-cache-tests--uncached (value)
  "Use the original preorder traversal as an independent VALUE oracle."
  (eliscript-ir-emitter--some-node
   value (lambda (node) (eq (eliscript-ir-node-kind node) 'await-expression))
   '(function-expression)))

(ert-deftest eliscript-ir-await-cache-caches-negative-deep-and-shared-nodes ()
  (let* ((leaf (eliscript-ir-await-cache-tests--node 'literal))
         (tree leaf) (nodes (list leaf))
         (eliscript-ir-emitter--await-cache (make-hash-table :test #'eq))
         (original (symbol-function 'eliscript-ir-emitter--children))
         (visits 0))
    (dotimes (_ 2048)
      (setq tree (eliscript-ir-await-cache-tests--node 'sequence tree))
      (push tree nodes))
    (let ((shared (eliscript-ir-await-cache-tests--node 'sequence tree tree)))
      (cl-letf (((symbol-function 'eliscript-ir-emitter--children)
                 (lambda (node) (cl-incf visits) (funcall original node))))
        (should-not (eliscript-ir-emitter--contains-await-p shared))
        (should (= visits 2050))
        ;; These nil results must be present rather than treated as cache misses.
        (dolist (node nodes)
          (should-not (eliscript-ir-emitter--contains-await-p node)))
        (should-not (eliscript-ir-emitter--contains-await-p (list tree tree leaf)))
        (should (= visits 2050))
        (should (= (hash-table-count eliscript-ir-emitter--await-cache) 2050))))))

(ert-deftest eliscript-ir-await-cache-preserves-function-pruning-and-preorder ()
  (let* ((await (eliscript-ir-await-cache-tests--node 'await-expression))
         (poison (eliscript-ir-await-cache-tests--node 'sequence))
         (nested (eliscript-ir-await-cache-tests--node 'function-expression await poison))
         (before (eliscript-ir-await-cache-tests--node 'sequence await poison))
         (after (eliscript-ir-await-cache-tests--node 'sequence nested poison))
         (original (symbol-function 'eliscript-ir-emitter--children))
         (eliscript-ir-emitter--await-cache (make-hash-table :test #'eq)))
    (cl-letf (((symbol-function 'eliscript-ir-emitter--children)
               (lambda (node)
                 (if (eq node poison) (error "later sibling reached")
                   (funcall original node)))))
      (should (eliscript-ir-await-cache-tests--uncached before))
      (should (eliscript-ir-emitter--contains-await-p before))
      (should (eliscript-ir-emitter--contains-await-p (cons await poison)))
      (should-not (eliscript-ir-await-cache-tests--uncached nested))
      (should-not (eliscript-ir-emitter--contains-await-p nested))
      ;; Neither the pruned nested await nor a structurally later child may
      ;; change which access raises the original error.
      (should (equal (should-error (eliscript-ir-await-cache-tests--uncached after))
                     (should-error (eliscript-ir-emitter--contains-await-p after)))))))

(ert-deftest eliscript-ir-await-cache-matches-original-for-lists-and-identity ()
  (let* ((plain (eliscript-ir-await-cache-tests--node 'literal))
         (same-shape (eliscript-ir-await-cache-tests--node 'literal))
         (await (eliscript-ir-await-cache-tests--node 'await-expression plain))
         (nested (eliscript-ir-await-cache-tests--node 'function-expression await))
         (eliscript-ir-emitter--await-cache (make-hash-table :test #'eq)))
    (dolist (value (list nil 0 'atom [ignored-vector] plain same-shape await nested
                        (list plain nested) (list nested (list same-shape await))
                        (cons nested await)))
      (should (eq (and (eliscript-ir-emitter--contains-await-p value) t)
                  (and (eliscript-ir-await-cache-tests--uncached value) t))))
    (should (eq (gethash plain eliscript-ir-emitter--await-cache 'absent) nil))
    (should (eq (gethash same-shape eliscript-ir-emitter--await-cache 'absent) nil))
    (should-not (eq plain same-shape))
    (should (eq (gethash await eliscript-ir-emitter--await-cache) t))
    (should (eq (gethash nested eliscript-ir-emitter--await-cache 'absent) nil))))

(ert-deftest eliscript-ir-await-cache-preserves-exact-module-output-and-scope ()
  (let* ((source (concat "(defun sync (x) (let ((y x)) (if y (progn y x) nil)))\n"
                         "(defasync async-run (x) (let ((y (await x))) (if y y nil)))\n"
                         "(defun nested (x) (lambda () (let ((y x)) y)))\n"
                         "(export sync async-run nested)"))
         (program (eliscript-compile-ir-string source "await-cache.eli"))
         (outer (make-hash-table :test #'eq))
         (eliscript-ir-emitter--await-cache outer)
         (original (symbol-function 'eliscript-ir-emitter--contains-await-p))
         caches first second uncached)
    (cl-letf (((symbol-function 'eliscript-ir-emitter--contains-await-p)
               (lambda (value)
                 (cl-pushnew eliscript-ir-emitter--await-cache caches :test #'eq)
                 (funcall original value))))
      (setq first (eliscript-emit-ir-module program))
      (should (eq eliscript-ir-emitter--await-cache outer))
      (setq second (eliscript-emit-ir-module program)))
    (should (= (length caches) 2))
    (should-not (memq outer caches))
    (should (= (hash-table-count outer) 0))
    (cl-letf (((symbol-function 'eliscript-ir-emitter--contains-await-p)
               #'eliscript-ir-await-cache-tests--uncached))
      (setq uncached (eliscript-emit-ir-module program)))
    (should (equal first second))
    (should (equal first uncached))
    (should (eq eliscript-ir-emitter--await-cache outer))
    (should-error
     (eliscript-emit-ir-module
      (eliscript-ir-program-create
       :filename "bad.eli" :body (list (eliscript-ir-node-create :kind 'unsupported)))))
    (should (eq eliscript-ir-emitter--await-cache outer))
    (should (equal first (eliscript-emit-ir-module program)))))

(provide 'eliscript-ir-await-cache-tests)
;;; eliscript-ir-await-cache-tests.el ends here
