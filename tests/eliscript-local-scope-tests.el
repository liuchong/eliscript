;;; eliscript-local-scope-tests.el --- ERT tests for JS-free modern .eli scope -*- lexical-binding: t; -*-

;;; Commentary:
;; Verifies supported modern `.eli' local interpretation subset and explicit
;; out-of-scope rejections without any external JavaScript runtime.

;;; Code:

(require 'ert)
(require 'cl-lib)

(eval-and-compile
  (let* ((here (file-name-directory (or load-file-name buffer-file-name
                                        default-directory)))
         (editor-dir (expand-file-name "../editor" here)))
    (add-to-list 'load-path editor-dir)))

(require 'eliscript-runtime)

(defvar eliscript-local-scope-tests--dyn 7
  "Dynamic variable used by local scope interpretation tests.")

(defun eliscript-local-scope-tests--isolated (thunk)
  "Execute THUNK with reset runtime extension state."
  (eliscript-runtime-reset-state!)
  (unwind-protect
      (funcall thunk)
    (eliscript-runtime-reset-state!)))

(ert-deftest eliscript-local-scope-supported-subset ()
  "Verify Lisp-2, nil truthiness, bindings, unwinding, macros, persistent values, and defmodule."
  (eliscript-local-scope-tests--isolated
   (lambda ()
     (let ((eval-res
            (eliscript-runtime-eval-string
             "(require 'eliscript)
              (defvar eliscript-local-scope-tests--val 10)
              (defun eliscript-local-scope-tests--val (x) (+ x 5))
              (defmodule mod.alpha
                (defvar-lexical mod-counter 41)
                (defun get-counter () (1+ mod-counter))
                (export-functions get-counter)
                (export-values mod-counter))
              (import-functions mod.alpha :only (get-counter) :as \"alpha-\")
              (import-values mod.alpha :only (mod-counter) :as \"alpha-\")
              (let ((eliscript-local-scope-tests--dyn 20)
                    (trace nil))
                (push 'enter trace)
                (unwind-protect
                    (condition-case err
                        (progn
                          (push 'try trace)
                          (signal 'error '(\"boom\")))
                      (error
                       (push (cadr err) trace)))
                  (push 'cleanup trace))
                (let* ((vec (persistent-vector 1 2 3))
                       (vec2 (value-conj vec 4))
                       (mp (persistent-map :k 'v :num 42))
                       (false-truth (if js-false 'truthy 'falsy))
                       (nil-truth (if nil 'truthy 'falsy)))
                  (list
                   (+ eliscript-local-scope-tests--val
                      (eliscript-local-scope-tests--val 3))
                   eliscript-local-scope-tests--dyn
                   (nreverse trace)
                   (value-count vec)
                   (value-count vec2)
                   (value-get mp :k)
                   false-truth
                   nil-truth
                   (alpha-get-counter)
                   alpha-mod-counter)))")))
       (should (equal eval-res
                      '(18 20 (enter try "boom" cleanup) 3 4 v truthy falsy 42 41))))
     ;; Verify `eliscript-runtime-eval-file' and host identity inspectability.
     (let ((tmp (make-temp-file "eliscript-local-eval-" nil ".eli")))
       (unwind-protect
           (progn
             (with-temp-file tmp
               (insert "(require 'eliscript)\n"
                       "(defmacro-checked local-double (x) (list '+ x x))\n"
                       "(local-double 21)\n"))
             (should (eql (eliscript-runtime-eval-file tmp) 42)))
         (delete-file tmp)))
     (should (stringp emacs-version))
     (should (stringp system-configuration)))))

(ert-deftest eliscript-local-scope-out-of-scope-rejections ()
  "Verify explicit rejections for remote engine-call, JS host calls, AOT without JS, and contract errors."
  (eliscript-local-scope-tests--isolated
   (lambda ()
     ;; 1. Remote engine-call is explicitly rejected in local-only mode.
     (let ((err (should-error
                 (eliscript-runtime-eval-string
                  "(require 'eliscript)
                   (eliscript-async-wait
                    (engine-call 'remote-js (engine-bind (lambda (x) x)) 1))")
                 :type 'eliscript-engine-handle-error)))
       (should (string-match-p "unavailable" (error-message-string err))))
     ;; 2. Calling imported JS module stub errors deterministically.
     (should-error
      (eliscript-runtime-eval-string
       "(require 'eliscript)
        (js-import \"node:fs\" :as fs-stub)
        (js-call fs-stub :readFileSync \"nope\")")
      :type 'error)
     ;; 3. Static contract / forbidden await diagnostics remain active locally.
     (should-error
      (eliscript-runtime-eval-string
       "(require 'eliscript)
        (defun bad-sync (fut) (await fut))")
      :type 'eliscript-compile-error)
     ;; 4. AOT module compilation fails cleanly when neither bun nor node is in PATH.
     (let* ((tmp-dir (make-temp-file "eliscript-nojs-" t))
            (tmp-el (expand-file-name "src.el" tmp-dir))
            (out-mjs (expand-file-name "out.mjs" tmp-dir)))
       (unwind-protect
           (progn
             (with-temp-file tmp-el
               (insert "(defun nojs-fn (x) (1+ x))\n"))
             (let ((exec-path nil)
                   (process-environment
                    (cons "PATH=/nonexistent/no-js" process-environment)))
               (should-error
                (eliscript-runtime-compile-elisp-module tmp-el out-mjs)
                :type 'error)))
         (delete-directory tmp-dir t))))))

(provide 'eliscript-local-scope-tests)
;;; eliscript-local-scope-tests.el ends here
