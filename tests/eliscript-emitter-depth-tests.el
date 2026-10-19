;;; eliscript-emitter-depth-tests.el --- Ordinary tree emission depth -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'cl-lib)
(require 'eliscript)

(ert-deftest eliscript-emitter-depth-conditional-expressions-retain-exact-bytes ()
  "192 ordinary conditional levels use continuations in both emitters."
  (let ((form 'value)
        (node (eliscript-ir-make-node 'reference nil 'value))
        (expected "value") (marked "value")
        (reference (eliscript-ir-make-node 'reference nil 'value))
        (eliscript-ir-emitter--record-source-spans t))
    (dotimes (index 192)
      (let ((span (eliscript-source-span-create :filename "deep-if.eli"
                                               :start index :end (1+ index)
                                               :line 1 :column (1+ index)
                                               :end-line 1 :end-column (+ index 2))))
        (setq form (list 'if 'value index form)
              node (eliscript-ir-make-node 'conditional span nil
                                          (list reference (eliscript-ir-make-node 'literal nil index) node))
              expected (format "(__eliscript_truthy(value) ? %d : %s)" index expected)
              marked (eliscript-source-map-mark
                      (format "(__eliscript_truthy(value) ? %d : %s)" index marked) span))))
    (should (equal (eliscript-emitter-emit-expression form) expected))
    (should (equal (substring-no-properties (eliscript-ir-emitter-emit-expression node)) expected))
    (should (equal-including-properties (eliscript-ir-emitter-emit-expression node) marked))))

(ert-deftest eliscript-emitter-depth-conditional-binding-contexts-retain-exact-bytes ()
  "96 if/let pairs preserve fresh names, scopes and discarded/returned values."
  (dolist (returning '(nil t))
    (let ((form 'value)
          (node (eliscript-ir-make-node 'reference nil 'value))
          (expected (if returning "return value;" "value;"))
          (width 96))
      (dotimes (index width)
        (setq form (list 'let '((unit value)) (list 'if 'unit index form))
              node (eliscript-ir-make-node
                    'lexical-bindings nil nil
                    (list (eliscript-ir-make-node 'lexical-binding nil 'unit
                                                 (list (eliscript-ir-make-node 'reference nil 'value)))
                          (eliscript-ir-make-node 'conditional nil nil
                                                 (list (eliscript-ir-make-node 'reference nil 'unit)
                                                       (eliscript-ir-make-node 'literal nil index) node)))
                    '(:binding-count 1 :sequential nil))))
      ;; The tree was assembled inside-out: index zero is its deepest branch,
      ;; whose temporary is allocated last by source-order emission.
      (dotimes (index width)
        (let* ((temporary (format "__eliscript_value_%d" (- width index)))
               (conditional (format "if (__eliscript_truthy(unit)) {\n  %s%d;\n} else {\n%s\n}"
                                    (if returning "return " "") index
                                    (eliscript-emitter--indent expected)))
               (declarations (concat "let unit = " temporary ";\n" conditional)))
          (setq expected
                (concat "{\n" (eliscript-emitter--indent
                                (concat "const " temporary " = value;\n{\n"
                                        (eliscript-emitter--indent declarations) "\n}")) "\n}"))))
      (let ((eliscript-emitter--temporary-counter 0))
        (should (equal (eliscript-emitter--emit-context form returning) expected))
        (should (= eliscript-emitter--temporary-counter width)))
      (let ((eliscript-emitter--temporary-counter 0))
        (should (equal (eliscript-ir-emitter--emit-context node returning) expected))
        (should (= eliscript-emitter--temporary-counter width))))))

(defun eliscript-emitter-depth-tests--legacy (source filename)
  "Emit SOURCE through the independent form representation."
  (eliscript-emit-module
   (mapcar #'eliscript-form-strip
           (eliscript-analyze-module
            (eliscript-expand-module (eliscript-read-located-string source filename) filename)
            filename))))

(ert-deftest eliscript-emitter-depth-plans-preserve-recursive-reference-products ()
  "Shallow original algorithms remain an exact byte and Source Map oracle."
  (dolist (source
           '("(defun f (x) (let ((a (or x 1)) (b (and x 2))) (if a (let* ((a b) (b a)) (if b a x)) b)))"
             "(defun f (x) (progn (if x 1 nil) (let* ((a x) (b a)) (if b a nil))))"
             "(defun f (x) (js-array (if x (let ((a x)) a) (if x 2 3))))"
             "(defasync f (x) (if x (await x) (let ((a x)) (if a (await a) nil))))"
             "(defun f (x) (loop ((n x)) (if n (let ((a n)) (recur false)) n)))"
             "(defun f (x) (let (([a &rest b] x)) (if a b x)))"))
    (let* ((filename "depth-equivalence.eli")
           (actual (eliscript-compile-string-with-source-map source filename "depth.mjs" filename))
           (actual-form (eliscript-emitter-depth-tests--legacy source filename))
           reference reference-form)
      ;; These saved implementations are used only for shallow oracle input;
      ;; the production entry points keep their explicit continuation engine.
      (cl-letf (((symbol-function 'eliscript-ir-emitter-emit-expression)
                 (symbol-function 'eliscript-ir-emitter--emit-expression-recursive))
                ((symbol-function 'eliscript-ir-emitter--emit-context)
                 (symbol-function 'eliscript-ir-emitter--emit-context-recursive))
                ((symbol-function 'eliscript-emitter-emit-expression)
                 (symbol-function 'eliscript-emitter--emit-expression-recursive))
                ((symbol-function 'eliscript-emitter--emit-context)
                 (symbol-function 'eliscript-emitter--emit-context-recursive)))
        (setq reference (eliscript-compile-string-with-source-map source filename "depth.mjs" filename)
              reference-form (eliscript-emitter-depth-tests--legacy source filename)))
      (should (equal (eliscript-emission-javascript actual) (eliscript-emission-javascript reference)))
      (should (equal (eliscript-emission-source-map actual) (eliscript-emission-source-map reference)))
      ;; Each emitter preserves its own complete historical product. The
      ;; legacy form scanner already includes a literal import for binding
      ;; vectors, whereas the IR scanner distinguishes those from literals.
      (should (equal actual-form reference-form)))))

(ert-deftest eliscript-emitter-depth-rejection-retains-the-first-invalid-child ()
  "A deferred child fails before its later sibling and never runs source code."
  (let ((form '(if value (recur) (js* 1)))
        (node (eliscript-ir-make-node
               'conditional nil nil
               (list (eliscript-ir-make-node 'reference nil 'value)
                     (eliscript-ir-make-node 'recur nil nil)
                     (eliscript-ir-make-node 'binding-name nil 'invalid)))))
    (let ((error-data (should-error (eliscript-emitter-emit-expression form)
                                    :type 'eliscript-compile-error)))
      (should (string-match-p "recur" (error-message-string error-data))))
    (let ((error-data (should-error (eliscript-ir-emitter-emit-expression node)
                                    :type 'eliscript-compile-error)))
      (should (string-match-p "recur" (error-message-string error-data))))))

(ert-deftest eliscript-emitter-depth-public-modules-traverse-scopes-and-preambles ()
  "Public entry points walk the whole deep tree, including tracked globals."
  (dolist (leaf '(tracked value))
    (let* ((filename "deep-public.eli")
           (span (eliscript-source-span-create :filename filename :start 0 :end 1
                                               :line 1 :column 1 :end-line 1 :end-column 2))
           (form leaf)
           (node (eliscript-ir-make-node 'reference span leaf)))
      (dotimes (index 96)
        (setq form (list 'let '((unit value)) (list 'if 'unit index form))
              node (eliscript-ir-make-node
                    'lexical-bindings span nil
                    (list (eliscript-ir-make-node 'lexical-binding span 'unit
                                                 (list (eliscript-ir-make-node 'reference span 'value)))
                          (eliscript-ir-make-node 'conditional span nil
                                                 (list (eliscript-ir-make-node 'reference span 'unit)
                                                       (eliscript-ir-make-node 'literal span index) node)))
                    '(:binding-count 1 :sequential nil))))
      (let* ((forms (list '(defvar tracked 0) (list 'defun 'walk '(value) form)))
             (program (eliscript-ir-make-program
                       filename
                       (list (eliscript-ir-make-node 'variable-declaration span 'tracked
                                                    (list (eliscript-ir-make-node 'literal span 0))
                                                    '(:mutable t :source-operator defvar))
                             (eliscript-ir-make-node 'function-declaration span 'walk
                                                    (list (eliscript-ir-make-node 'parameter-binding span 'value nil
                                                                                 '(:parameter-kind required)) node)
                                                    '(:parameter-count 1)))))
             (compatibility (eliscript-emit-module forms))
             (direct (eliscript-emit-ir-module program))
             (mapped (eliscript-emit-ir-module-with-source-map program "x" "deep-public.mjs" filename)))
        (should (equal compatibility direct))
        (should (equal direct (eliscript-emission-javascript mapped)))
        (should (string-match-p (regexp-quote "deep-public.eli") (eliscript-emission-source-map mapped)))
        (should (string-match-p (regexp-quote "__eliscript_tdz_ready_0 = true;") direct))
        (should (string-match-p
                 (regexp-quote (if (eq leaf 'tracked) "return (__eliscript_tdz_read_0());" "return value;")) direct))
        (should-not (string-match-p (regexp-quote "eliscript/runtime/literals.mjs") direct))
        (should-not (string-match-p (regexp-quote "const __eliscript_host_identity_token") direct))))))

(ert-deftest eliscript-emitter-depth-scanners-retain-pruning-and-helper-discovery ()
  "Helper discovery reaches deep leaves while function/quote pruning survives."
  (let ((plain '(progn (string-to-number "1") (imul32 1 2) (nth 0 value)
                       (cons 1 nil) (equal 1 1) (host-identity-token value)
                       (js-call value :join) :keyword globalThis))
        (await-form '(await value))
        (await-node (eliscript-ir-make-node 'await-expression nil nil
                                            (list (eliscript-ir-make-node 'reference nil 'value)))))
    (dotimes (_ 192)
      (setq plain (list 'if t 0 plain)
            await-form (list 'if t 0 await-form)
            await-node (eliscript-ir-make-node 'conditional nil nil
                                              (list (eliscript-ir-make-node 'literal nil t)
                                                    (eliscript-ir-make-node 'literal nil 0) await-node))))
    (dolist (scanner '(eliscript-emitter--uses-number-conversion-p
                       eliscript-emitter--uses-numeric-coercion-p
                       eliscript-emitter--uses-imul-p eliscript-emitter--uses-collection-runtime-p
                       eliscript-emitter--uses-list-runtime-p eliscript-emitter--uses-value-runtime-p
                       eliscript-emitter--uses-host-identity-token-p eliscript-emitter--uses-array-text-p
                       eliscript-emitter--uses-literal-runtime-p eliscript-emitter--forms-name-global-root-p))
      (should (funcall scanner (list plain))))
    (should (eliscript-emitter--contains-await-p await-form))
    (should (eliscript-ir-emitter--contains-await-p await-node))
    (should-not (eliscript-emitter--contains-await-p (list 'lambda nil await-form)))
    (should-not (eliscript-ir-emitter--contains-await-p
                 (eliscript-ir-make-node 'function-expression nil nil (list await-node) '(:parameter-count 0))))
    (should-not (eliscript-emitter--uses-number-conversion-p (list (list 'quote plain))))
    (should-not (eliscript-emitter--forms-name-global-root-p (list (list 'quote plain))))
    ;; The host-token prepass historically visits quoted forms too.
    (should (eliscript-emitter--uses-host-identity-token-p (list (list 'quote plain))))
    (should-not (eliscript-emitter--uses-literal-runtime-p '((get value :key))))
    (should-not (eliscript-ir-emitter--node-uses-literal-runtime-p
                 (eliscript-ir-make-node 'property-read nil nil
                                         (list (eliscript-ir-make-node 'reference nil 'value)
                                               (eliscript-ir-make-node 'literal nil :key)))))))

(provide 'eliscript-emitter-depth-tests)

;;; eliscript-emitter-depth-tests.el ends here
