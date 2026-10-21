;;; eliscript-number-spelling-tests.el --- JavaScript Number literal spelling -*- lexical-binding: t; -*-

(require 'ert)
(require 'cl-lib)
(require 'json)
(require 'eliscript)

(defconst eliscript-number-spelling-tests--root
  (expand-file-name ".." (file-name-directory (or load-file-name buffer-file-name)))
  "Repository containing the original public bootstrap executable.")

(defun eliscript-number-spelling-tests--node (script input &rest arguments)
  "Run Node SCRIPT on JSON INPUT and ARGUMENTS within the enclosing test tree."
  (let ((output (generate-new-buffer " *eliscript-number-spelling*")))
    (unwind-protect
        (progn
          (with-temp-buffer
            (insert (json-encode input))
            (should (= 0 (apply #'call-process-region (point-min) (point-max)
                                (or (getenv "NODE") "node") nil output nil
                                "--input-type=module" "--eval" script arguments))))
          (with-current-buffer output (buffer-string)))
      (kill-buffer output))))

(defun eliscript-number-spelling-tests--token (value)
  "Return the original round-tripping Emacs decimal token for VALUE."
  (let ((float-output-format nil)) (number-to-string value)))

(defun eliscript-number-spelling-tests--values ()
  "Produce fixed IEEE boundaries and a deterministic decimal exponent corpus."
  (let ((values (list 0 -0.0 1 1.0 -1.0 9007199254740991.0
                      9007199254740993 -9007199254740993
                      1000000000000000100 9223372036854775808))
        (state 174763))
    (dolist (text '("5e-324" "-5e-324" "2.225073858507201e-308"
                    "2.2250738585072014e-308" "1.7976931348623157e308"
                    "9.999999999999997e-7" "1e-6" "1.0000000000000002e-6"
                    "9.999999999999999e-7" "1e-7" "-1e-6" "-1e-7"
                    "999999999999999900000" "1e21" "1.0000000000000001e21"
                    "-1e21" "1e22" "1e23" "1.2345678901234567e20"
                    "0.1" "0.10000000000000002" "1.0000000000000002"))
      (push (string-to-number text) values))
    (dotimes (index 128)
      (setq state (% (+ (* state 1664525) 1013904223) 4294967296))
      (let* ((exponent (- (% state 632) 324))
             (digits (format "%d%09d" (1+ (% state 9)) state))
             (token (concat (if (= (% index 2) 0) "-" "")
                            (substring digits 0 1) "." (substring digits 1)
                            "e" (number-to-string exponent)))
             (value (string-to-number token)))
        (unless (string-match-p "INF\\|NaN" (eliscript-number-spelling-tests--token value))
          (push value values))))
    (nreverse values)))

(ert-deftest eliscript-number-spelling-fixed-and-exponent-boundaries ()
  (dolist (entry '((0 . "0") (0.0 . "0") (-0.0 . "-0.0")
                   (1.0 . "1") (-1.0 . "-1")
                   (9007199254740991.0 . "9007199254740991")
                   (9007199254740993 . "9007199254740992")
                   (1e-6 . "0.000001") (1e-7 . "1e-7")
                   (1e20 . "100000000000000000000") (1e21 . "1e+21")))
    (let ((value (car entry)) (expected (cdr entry)))
      (should (equal (eliscript-emitter--number-text value) expected))
      (should (equal (eliscript-emitter-emit-expression value) expected))
      (should (equal (eliscript-emitter--emit-quoted value) expected))
      (should (equal (eliscript-ir-emitter--emit-literal value) expected))))
  ;; A user display preference must not round compiler Number literals.
  (let ((float-output-format "%.2f"))
    (should (equal (eliscript-emitter--number-text 1.2345678901234567)
                   "1.2345678901234567"))))

(ert-deftest eliscript-number-spelling-node-oracle-and-exact-ieee-values ()
  (let ((records
         (mapcar
          (lambda (value)
            (vector (eliscript-number-spelling-tests--token value)
                    (eliscript-emitter-emit-expression value)
                    (eliscript-emitter--emit-quoted value)
                    (eliscript-ir-emitter--emit-literal value)))
          (eliscript-number-spelling-tests--values))))
    (should
     (equal
      (eliscript-number-spelling-tests--node
       (concat "import assert from 'node:assert/strict';import{readFileSync}from'node:fs';"
               "const records=JSON.parse(readFileSync(0,'utf8'));"
               "for(const[token,...outputs]of records){const value=Number(token);assert(Number.isFinite(value));"
               "const expected=Object.is(value,-0)?'-0.0':String(value);"
               "for(const text of outputs){assert.equal(text,expected,token);"
               "assert(Object.is(Function('return ('+text+')')(),value),token);}}"
               "process.stdout.write('number-spelling-verified');")
       (vconcat records))
      "number-spelling-verified"))))

(ert-deftest eliscript-number-spelling-nonfinite-rejections-retain-diagnostics ()
  (dolist (value (list (read "1.0e+INF") (read "-1.0e+INF") (read "0.0e+NaN")))
    (dolist (emit '(eliscript-emitter-emit-expression eliscript-emitter--emit-quoted
                   eliscript-ir-emitter--emit-literal))
      (let ((error (should-error (funcall emit value) :type 'eliscript-compile-error)))
        (should (string-match-p "non-finite numbers are not supported"
                                (eliscript-diagnostic-condition-message error)))))))

(ert-deftest eliscript-number-spelling-selfhost-and-seed-exact-generated-js ()
  (let* ((root eliscript-number-spelling-tests--root)
         (directory (make-temp-file "eliscript-number-selfhost-" t))
         (bootstrap-output (generate-new-buffer " *eliscript-number-bootstrap*"))
         (tokens (mapcar #'eliscript-number-spelling-tests--token
                         (eliscript-number-spelling-tests--values)))
         (sources (list
                   (concat "(defun values () (js-array " (string-join tokens " ") ")) (export values)")
                   (concat "(defun quoted () '(" (string-join tokens " ") ")) (export quoted)")
                   (concat "(defun quoted-vector () '[" (string-join tokens " ") "]) (export quoted-vector)"))))
    (unwind-protect
        (let* ((default-directory root)
               (process-environment (cons (concat "ELISCRIPT_BOOTSTRAP_OUT_DIR=" directory) process-environment))
               (records (vconcat (mapcar (lambda (source)
                                          (vector source (eliscript-compile-string source "number-spelling.eli")))
                                        sources))))
          (should (= 0 (call-process (expand-file-name "bin/eliscript-bootstrap" root)
                                    nil bootstrap-output nil)))
          (should (file-regular-p (expand-file-name "runtime/math.mjs" directory)))
          (should (file-regular-p (expand-file-name "runtime/math.mjs.map" directory)))
          (let* ((package (json-read-file (expand-file-name "package.json" directory)))
                 (driver (expand-file-name "number-spelling-driver.mjs" directory)))
            (should (equal (alist-get 'name package) "eliscript"))
            (should (equal (alist-get './runtime/math.mjs (alist-get 'exports package))
                           "./runtime/math.mjs"))
            ;; Use a real Eliscript driver, retaining all exact JS comparisons.
            (eliscript-compile-file-with-source-map
             (expand-file-name "tools/testing/number-spelling-selfhost-driver.eli" root)
             driver)
            (with-current-buffer bootstrap-output (erase-buffer))
            (with-temp-buffer
              (insert (json-encode records))
              (let ((status (call-process-region
                             (point-min) (point-max) (or (getenv "NODE") "node")
                             nil bootstrap-output nil driver
                             (expand-file-name "compiler.mjs" directory))))
                (unless (equal status 0)
                  (ert-fail (with-current-buffer bootstrap-output (buffer-string))))))
            (should (equal (with-current-buffer bootstrap-output (buffer-string))
                           "selfhost-number-spelling-verified"))))
      (kill-buffer bootstrap-output)
      (delete-directory directory t))))

(provide 'eliscript-number-spelling-tests)
;;; eliscript-number-spelling-tests.el ends here
