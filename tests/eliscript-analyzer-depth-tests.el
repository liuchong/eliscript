;;; eliscript-analyzer-depth-tests.el --- Analyzer task stack regressions -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'cl-lib)
(require 'eliscript-analyzer)
(require 'eliscript-reader)

(defconst eliscript-analyzer-depth-tests--root
  (expand-file-name ".." (file-name-directory (or load-file-name buffer-file-name))))

(defun eliscript-analyzer-depth-tests--nest (leaf depth &optional initializer)
  "Wrap LEAF in DEPTH ordinary if/let levels, optionally in INITIALIZER slots."
  (dotimes (index depth)
    (setq leaf
          (if initializer
              (list 'let (list (list 'temporary leaf)) 'temporary)
            (if (= (% index 2) 0)
                (list 'if t leaf 0)
              (list 'let '((temporary 1)) leaf)))))
  leaf)

(defun eliscript-analyzer-depth-tests--analyze (form &optional bindings)
  "Analyze FORM with BINDINGS as (NAME KIND MUTABLE) declarations."
  (let ((scope (eliscript-analyzer--make-scope))
        (eliscript-analyzer--filename "分析😀.eli")
        (eliscript-analyzer--current-span nil)
        (eliscript-analyzer--tail-position nil)
        (eliscript-analyzer--recur-targets nil)
        (eliscript-analyzer--recur-barrier nil))
    (dolist (binding bindings)
      (eliscript-analyzer--declare
       scope (nth 0 binding) (nth 1 binding) (nth 2 binding)))
    (eliscript-analyzer--analyze-expression form scope)))

(defun eliscript-analyzer-depth-tests--diagnostic (form &optional bindings)
  "Return FORM's real analysis diagnostic under BINDINGS, failing on success."
  (condition-case condition
      (progn
        (eliscript-analyzer-depth-tests--analyze form bindings)
        (ert-fail "expected an analysis error"))
    (eliscript-analyze-error
     (or (eliscript-diagnostic-from-condition condition)
         (ert-fail "analysis error lost its structured diagnostic")))))

(defun eliscript-analyzer-depth-tests--message (form &optional bindings)
  "Return FORM's actual diagnostic message using BINDINGS."
  (eliscript-diagnostic-message
   (eliscript-analyzer-depth-tests--diagnostic form bindings)))

(ert-deftest eliscript-analyzer-depth-ordinary-if-let-and-initializers ()
  ;; Deliberately use a lower budget than the normal process; no limit increase
  ;; may hide recursive descent through ordinary expression syntax.
  (let ((max-lisp-eval-depth 350))
    (dolist (initializer '(nil t))
      (should
       (progn
         (eliscript-analyzer-depth-tests--analyze
          (eliscript-analyzer-depth-tests--nest 7 5000 initializer)) t)))
    (should
     (progn
       (eliscript-analyzer-depth-tests--analyze
        (eliscript-analyzer-depth-tests--nest
         '(get (js-object :value 1) :value) 5000)) t))))

(ert-deftest eliscript-analyzer-depth-preserves-leaf-unicode-source-location ()
  (let* ((max-lisp-eval-depth 350)
         (span (eliscript-source-span-create
                :filename "分析😀.eli" :start 420 :end 427
                :line 1648 :column 17 :end-line 1648 :end-column 24))
         (leaf (eliscript-form-wrap 'missing span))
         (diagnostic
          (eliscript-analyzer-depth-tests--diagnostic
           (eliscript-analyzer-depth-tests--nest leaf 5000))))
    (should (equal (eliscript-diagnostic-code diagnostic) "ELI-A0001"))
    (should (equal (eliscript-diagnostic-message diagnostic)
                   "unbound symbol: missing"))
    (should (eq (eliscript-diagnostic-span diagnostic) span))
    (should (equal (eliscript-diagnostic-file diagnostic) "分析😀.eli"))))

(ert-deftest eliscript-analyzer-depth-validates-unreachable-branches-in-source-order ()
  (let ((max-lisp-eval-depth 350))
    (should
     (equal
      (eliscript-analyzer-depth-tests--message
       (eliscript-analyzer-depth-tests--nest '(if t first second) 5000))
      "unbound symbol: first"))
    (should
     (equal
      (eliscript-analyzer-depth-tests--message '(if t 1 missing))
      "unbound symbol: missing"))))

(ert-deftest eliscript-analyzer-depth-retains-parallel-and-sequential-let-visibility ()
  (dolist (form '((let* ((a 1) (b a) (c b)) (+ a b c))
                  (let ((a 1)) (let ((a a)) (setq a 2) a))
                  (let* ((a 1)) (let* ((b a) (c b)) c))))
    (should (progn (eliscript-analyzer-depth-tests--analyze form) t)))
  (should
   (equal (eliscript-analyzer-depth-tests--message
           '(let ((a 1) (b a)) b)) "unbound symbol: a"))
  (should
   (equal (eliscript-analyzer-depth-tests--message
           '(let* ((a first) (b 1 2)) b)) "unbound symbol: first"))
  (should
   (string-prefix-p
    "invalid let binding:"
    (eliscript-analyzer-depth-tests--message
     '(let ((a first) (b 1 2)) b)))))

(ert-deftest eliscript-analyzer-depth-preserves-assignment-validation-order ()
  (should
   (equal (eliscript-analyzer-depth-tests--message
           '(setq mutable first (js-object) second)
           '((mutable variable t))) "unbound symbol: first"))
  (should
   (equal (eliscript-analyzer-depth-tests--message
           '(setq stable first) '((stable constant nil)))
          "cannot assign to immutable binding: stable"))
  (should
   (progn (eliscript-analyzer-depth-tests--analyze
           '(let ((stable 1)) (setq stable 2) stable)
           '((stable constant nil))) t)))

(ert-deftest eliscript-analyzer-depth-retains-function-and-loop-tail-targets ()
  (let ((max-lisp-eval-depth 350))
    (should
     (progn
       (eliscript-analyzer-depth-tests--analyze
        (list 'lambda '(n)
              (eliscript-analyzer-depth-tests--nest '(recur n) 5000))) t))
    (should
     (progn
       (eliscript-analyzer-depth-tests--analyze
        (list 'lambda '(n)
              (list 'loop '((a 0) (b n))
                    (eliscript-analyzer-depth-tests--nest '(recur a b) 5000))
              '(recur n))) t))
    (should
     (equal
      (eliscript-analyzer-depth-tests--message
       (list 'lambda '(n)
             (list '+ (eliscript-analyzer-depth-tests--nest '(recur n) 5000) 1)))
      "recur is only valid in tail position"))
    (should
     (equal
      (eliscript-analyzer-depth-tests--message
       (list 'lambda '(n)
             (eliscript-analyzer-depth-tests--nest '(recur n) 5000 t)))
      "recur is only valid in tail position"))
    (should
     (string-match-p
      "recur expects 2 arguments for the current loop, got 1"
      (eliscript-analyzer-depth-tests--message
       '(lambda (n) (loop ((a 0) (b n)) (recur n))))))))

(ert-deftest eliscript-analyzer-depth-retains-try-barriers-and-new-function-reset ()
  (should
   (equal (eliscript-analyzer-depth-tests--message
           '(lambda (n) (try (recur n) (catch failure 0))))
          "recur cannot cross a try boundary"))
  (should
   (progn (eliscript-analyzer-depth-tests--analyze
           '(lambda (n) (try (lambda (m) (recur m))
                         (catch failure failure)))) t))
  (should
   (equal (eliscript-analyzer-depth-tests--message
           '(try first (catch failure 1) (catch other 2)))
          "unbound symbol: first"))
  (should
   (equal (eliscript-analyzer-depth-tests--message '(cond (t first) 9))
          "unbound symbol: first"))
  (should
   (equal (eliscript-analyzer-depth-tests--message '(try 1 (finally 2) 3))
          "try body forms must precede catch and finally clauses")))

(ert-deftest eliscript-analyzer-depth-preserves-nearest-async-function-context ()
  (let ((max-lisp-eval-depth 350))
    (should
     (progn
       (eliscript-analyzer-depth-tests--analyze
        (list 'async '(promise)
              (eliscript-analyzer-depth-tests--nest '(await promise) 5000))) t))
    (should
     (equal
      (eliscript-analyzer-depth-tests--message
       (list 'async '(promise)
             (list 'lambda nil
                   (eliscript-analyzer-depth-tests--nest '(await promise) 5000))))
      "await is only valid inside an async function"))))

(ert-deftest eliscript-analyzer-depth-retains-destructuring-default-scope-and-order ()
  (dolist (source
           '("(let ((outer 7)) (let* (({:keys [x] :or {x outer}} (js-object)) (y x)) y))"
             "(let ((outer 7)) (lambda ({:keys [x] :or {x outer}}) x))"
             "(let ((outer 7)) (try 1 (catch {:keys [x] :or {x outer}} x)))"))
    (should
     (progn (eliscript-analyzer-depth-tests--analyze
             (car (eliscript-read-located-string source "分析😀.eli"))) t)))
  (let ((form (car (eliscript-read-located-string
                    "(let (({:keys [x] :or {x first}} (js-object)) (y second)) x)"
                    "分析😀.eli"))))
    (should (equal (eliscript-analyzer-depth-tests--message form)
                   "unbound symbol: first"))))

(ert-deftest eliscript-analyzer-depth-analyzes-original-regexp-property-tree ()
  (let* ((filename (expand-file-name "bootstrap/backends/regexp.eli"
                                     eliscript-analyzer-depth-tests--root))
         (source (with-temp-buffer (insert-file-contents filename) (buffer-string)))
         (forms (eliscript-read-located-string source filename))
         (eliscript-analyzer--filename filename)
         (eliscript-analyzer--current-span nil)
         (flattened (eliscript-analyzer--flatten-modules forms))
         (scope (eliscript-analyzer--make-scope))
         (target
          (cl-find-if
           (lambda (form)
             (let ((value (eliscript-form-value form)))
               (and (consp value)
                    (eq (eliscript-form-value (car value)) 'defun)
                    (eq (eliscript-form-value (cadr value)) 'regexp-property-id-base))))
           flattened)))
    (should target)
    (eliscript-analyzer--predeclare-top-level flattened scope)
    (should
     (progn (eliscript-analyzer--analyze-top-level target scope) t))))

(provide 'eliscript-analyzer-depth-tests)

;;; eliscript-analyzer-depth-tests.el ends here
