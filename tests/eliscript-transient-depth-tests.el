;;; eliscript-transient-depth-tests.el --- Deep transient ownership tests -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'cl-lib)
(require 'eliscript-analyzer)
(require 'eliscript-reader)

(defun eliscript-transient-depth-tests--nest (leaf depth)
  "Wrap LEAF in DEPTH ordinary conditionals and lexical scopes."
  (dotimes (index depth)
    (setq leaf (if (= (% index 2) 0)
                   (list 'if t leaf nil)
                 (list 'let '((temporary 1)) leaf))))
  leaf)

(defun eliscript-transient-depth-tests--module (body &optional namespace asynchronous)
  "Return real canonical imports and a function containing BODY.
Use NAMESPACE imports and ASYNCHRONOUS function syntax when requested."
  (list
   (if namespace
       '(import "./runtime/core/transient.mjs" :as Runtime)
     '(import "./stdlib/core/transient.eli" transient conj! assoc! persistent!))
   (list (if asynchronous 'defasync 'defun) 'build '(source ready promise) body)))

(defun eliscript-transient-depth-tests--analyze (forms)
  "Run the normal main and ownership analyzers on FORMS unchanged."
  (should (eq forms (eliscript-analyze-module forms "ownership-中😀.eli"))))

(defun eliscript-transient-depth-tests--message (forms)
  "Return FORMS' real first ownership diagnostic message."
  (condition-case condition
      (progn (eliscript-transient-depth-tests--analyze forms)
             (ert-fail "expected an ownership diagnostic"))
    (eliscript-analyze-error
     (let ((diagnostic (eliscript-diagnostic-from-condition condition)))
       (should diagnostic)
       (should (equal (eliscript-diagnostic-code diagnostic) "ELI-A0001"))
       (eliscript-diagnostic-message diagnostic)))))

(ert-deftest eliscript-transient-depth-skips-only-absent-canonical-provenance ()
  (let ((max-lisp-eval-depth 350)
        (visited nil)
        (ordinary
         (list '(defun transient (source) source)
               (list 'defun 'build '(source)
                     (eliscript-transient-depth-tests--nest '(transient source) 5000)))))
    (cl-letf (((symbol-function 'eliscript-transient--analyze-top-level)
               (lambda (&rest _) (setq visited t))))
      (eliscript-transient-depth-tests--analyze ordinary)
      (should-not visited))
    (dolist (source '("ordinary/transient.mjs"
                      "./runtime/core/transient.mjs.extra"
                      "./stdlib/core/other.eli"))
      (setq visited nil)
      (cl-letf (((symbol-function 'eliscript-transient--analyze-top-level)
                 (lambda (&rest _) (setq visited t))))
        (eliscript-transient-depth-tests--analyze
         (list (list 'import source 'ordinary)
               (list 'defun 'build '(source)
                     (eliscript-transient-depth-tests--nest '(ordinary source) 5000))))
        (should-not visited)))))

(ert-deftest eliscript-transient-depth-fast-path-retains-main-lexical-errors ()
  (let ((max-lisp-eval-depth 350))
    (should
     (equal
      (eliscript-transient-depth-tests--message
       (list (list 'defun 'build nil
                   (eliscript-transient-depth-tests--nest 'missing 5000))))
      "unbound symbol: missing"))))

(ert-deftest eliscript-transient-depth-real-named-and-namespace-builders ()
  (let ((max-lisp-eval-depth 350))
    (dolist (namespace '(nil t))
      (let* ((construct (if namespace 'Runtime/transient 'transient))
             (update (if namespace 'Runtime/conjBang 'conj!))
             (complete (if namespace 'Runtime/persistentBang 'persistent!))
             (body
              (list 'let (list (list 'builder (list construct 'source)))
                    (eliscript-transient-depth-tests--nest
                     (list 'progn (list update 'builder 1) nil) 5000)
                    (list complete 'builder))))
        (eliscript-transient-depth-tests--analyze
         (eliscript-transient-depth-tests--module body namespace))))))

(ert-deftest eliscript-transient-depth-retains-consumed-state-and-exact-leaf-span ()
  (let* ((max-lisp-eval-depth 350)
         (span (eliscript-source-span-create
                :filename "ownership-中😀.eli" :start 80 :end 87
                :line 1648 :column 17 :end-line 1648 :end-column 24))
         (leaf (list 'conj! (eliscript-form-wrap 'builder span) 1))
         (forms
          (eliscript-transient-depth-tests--module
           (list 'let '((builder (transient source))) '(persistent! builder)
                 (eliscript-transient-depth-tests--nest leaf 5000) nil))))
    (condition-case condition
        (progn (eliscript-transient-depth-tests--analyze forms)
               (ert-fail "consumed builder was accepted"))
      (eliscript-analyze-error
       (let ((diagnostic (eliscript-diagnostic-from-condition condition)))
         (should (eq (eliscript-diagnostic-span diagnostic) span))
         (should (equal (eliscript-diagnostic-message diagnostic)
                        "transient binding builder is no longer editable after persistent!")))))))

(ert-deftest eliscript-transient-depth-merges-branches-without-reusing-consumed-state ()
  (dolist (body
           '((let ((builder (transient source)))
               (when ready (persistent! builder)) (conj! builder 1) nil)
             (let ((builder (transient source)))
               (if ready (persistent! builder) nil) (conj! builder 1) nil)
             (let ((builder (transient source)))
               (and ready (persistent! builder)) (conj! builder 1) nil)
             (let ((builder (transient source)))
               (cond (ready (persistent! builder))) (conj! builder 1) nil)))
    (should
     (equal (eliscript-transient-depth-tests--message
             (eliscript-transient-depth-tests--module body))
            "transient binding builder may already be persistent after conditional control flow")))
  (eliscript-transient-depth-tests--analyze
   (eliscript-transient-depth-tests--module
    '(let ((builder (transient source)))
       (if ready (persistent! builder) (persistent! builder))))))

(ert-deftest eliscript-transient-depth-preserves-shadowing-and-forbids-operation-aliases ()
  (dolist (body
           '((let* ((transient (transient source))
                    (result (persistent! transient))) result)
             (let ((builder (transient source)))
               (let ((builder 7)) builder) (persistent! builder))))
    (eliscript-transient-depth-tests--analyze
     (eliscript-transient-depth-tests--module body)))
  (eliscript-transient-depth-tests--analyze
   (eliscript-transient-depth-tests--module
    '(let ((Runtime (js-object))) (Runtime/transient source)) t))
  (should
   (equal (eliscript-transient-depth-tests--message
           (eliscript-transient-depth-tests--module
            '(let ((alias transient)) (alias source))))
          "transient operation transient must be called directly"))
  (should
   (equal (eliscript-transient-depth-tests--message
           (eliscript-transient-depth-tests--module
            '(let ((alias Runtime/transient)) (alias source)) t))
          "transient operation Runtime/transient must be called directly")))

(ert-deftest eliscript-transient-depth-forbids-function-and-loop-ownership-escape ()
  (let ((max-lisp-eval-depth 350))
    (should
     (equal (eliscript-transient-depth-tests--message
             (eliscript-transient-depth-tests--module
              (list 'let '((builder (transient source)))
                    (eliscript-transient-depth-tests--nest
                     '(lambda () (conj! builder 1)) 5000))))
            "transient binding builder cannot cross a function boundary"))
    (dolist (loop '(while loop))
      (let ((repeated
             (if (eq loop 'while)
                 (list 'while 'ready
                       (eliscript-transient-depth-tests--nest '(persistent! builder) 5000))
               (list 'loop '((remaining 1))
                     (eliscript-transient-depth-tests--nest '(persistent! builder) 5000)))))
        (should
         (equal (eliscript-transient-depth-tests--message
                 (eliscript-transient-depth-tests--module
                  (list 'let '((builder (transient source))) repeated)))
                "transient binding builder cannot be completed inside a repeated loop"))))))

(ert-deftest eliscript-transient-depth-keeps-local-lifetime-and-await-operand-order ()
  (dolist (body
           '((progn (let ((builder (transient source))) (persistent! builder))
                    (await promise))
             (let ((builder (transient source)))
               (await (progn (persistent! builder) promise)))
             (while ready
               (let ((builder (transient source))) (persistent! builder)))))
    (eliscript-transient-depth-tests--analyze
     (eliscript-transient-depth-tests--module body nil t)))
  (should
   (equal (eliscript-transient-depth-tests--message
           (eliscript-transient-depth-tests--module
            '(let ((builder (transient source))) (await promise) (persistent! builder)) nil t))
          "transient binding builder cannot remain active across await")))

(ert-deftest eliscript-transient-depth-preserves-try-prefix-and-finally-consumption ()
  (should
   (equal (eliscript-transient-depth-tests--message
           (eliscript-transient-depth-tests--module
            '(let ((builder (transient source)))
               (try (persistent! builder) (throw "failed")
                    (catch error (conj! builder error))) nil)))
          "transient binding builder may already be persistent after conditional control flow"))
  (should
   (equal (eliscript-transient-depth-tests--message
           (eliscript-transient-depth-tests--module
            '(let ((builder (transient source)))
               (try 1 (finally (persistent! builder))) (conj! builder 1) nil)))
          "transient binding builder is no longer editable after persistent!")))

(ert-deftest eliscript-transient-depth-rejects-update-in-every-vector-value-slot ()
  (should
   (equal (eliscript-transient-depth-tests--message
           (eliscript-transient-depth-tests--module
            '(let ((builder (transient source))) [(conj! builder 1) 0])))
          "transient update result cannot be used as an ordinary value")))

(provide 'eliscript-transient-depth-tests)

;;; eliscript-transient-depth-tests.el ends here
