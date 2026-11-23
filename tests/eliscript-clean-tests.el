;;; eliscript-clean-tests.el --- Protective tests for eliscript-clean -*- lexical-binding: t; -*-

;;; Commentary:

;; Verify that `eliscript-clean' and its public `Makefile' / `bin' entry points
;; remove all non-Git generated and registered temporary outputs while strictly
;; protecting tracked files, pending WIP sources, `node_modules/', `_worktree/',
;; and external symlink targets.  All scheduling doubles are maintained purely
;; in `.el' and `.eli' and compiled through `eliscript-compile-file'.

;;; Code:

(require 'cl-lib)
(require 'ert)
(require 'json)
(require 'eliscript-clean "clean")

(defconst eliscript-clean-tests--repo-root
  (directory-file-name
   (expand-file-name ".." (file-name-directory (or load-file-name buffer-file-name))))
  "Canonical root of the Eliscript repository under test.")

(defun eliscript-clean-tests--write-file (root relative content &optional mode)
  "Write CONTENT to RELATIVE under ROOT and optionally set file MODE."
  (let ((full (expand-file-name relative root))
        (coding-system-for-write 'utf-8-unix))
    (make-directory (file-name-directory full) t)
    (with-temp-file full
      (insert content))
    (when mode
      (set-file-modes full mode))
    full))

(defun eliscript-clean-tests--write-sexp-file (root relative form)
  "Serialize S-expression FORM to RELATIVE under ROOT."
  (eliscript-clean-tests--write-file
   root relative
   (concat (let ((print-length nil)
                 (print-level nil))
             (prin1-to-string form))
           "\n")))

(defun eliscript-clean-tests--git (root &rest args)
  "Run git ARGS in ROOT and assert a zero exit code."
  (with-temp-buffer
    (let ((status (apply #'call-process "git" nil t nil "-C" root args)))
      (unless (and (integerp status) (zerop status))
        (ert-fail (format "git %s failed (%s): %s"
                          (mapconcat #'identity args " ")
                          status
                          (buffer-string)))))))

(defun eliscript-clean-tests--init-fixture-repo (root)
  "Initialize a minimal Git-backed Eliscript fixture repository at ROOT."
  (copy-file (expand-file-name ".gitignore" eliscript-clean-tests--repo-root)
             (expand-file-name ".gitignore" root) t)
  (copy-file (expand-file-name "tools/clean.el" eliscript-clean-tests--repo-root)
             (progn
               (make-directory (expand-file-name "tools" root) t)
               (expand-file-name "tools/clean.el" root))
             t)
  (copy-file (expand-file-name "bin/eliscript-clean" eliscript-clean-tests--repo-root)
             (progn
               (make-directory (expand-file-name "bin" root) t)
               (expand-file-name "bin/eliscript-clean" root))
             t)
  (set-file-modes (expand-file-name "bin/eliscript-clean" root) #o755)
  (eliscript-clean-tests--write-file
   root "package.json"
   (concat
    (json-encode
     '((name . "eliscript")
       (version . "0.1.3")
       (exports . (("./runtime/unicode-case.mjs" . "./runtime/unicode-case.mjs")))
       (scripts . ((clean . "./bin/eliscript-clean")
                   (test . "make test")
                   (test:core . "make test-core")
                   (test:applications . "make test-applications")
                   (check:contracts . "make check-contracts")
                   (build:browser . "true")
                   (build:dogfood-browser . "true")))))
    "\n"))
  (eliscript-clean-tests--write-file root "compiler/eliscript.el" ";; compiler\n")
  (eliscript-clean-tests--write-file root "bootstrap/README.md" "# bootstrap\n")
  (eliscript-clean-tests--write-file root "runtime/prelude.eli" "(module runtime.prelude)\n")
  (eliscript-clean-tests--write-file root "examples/dogfood/eliscript.json" "{}\n")
  (copy-file (expand-file-name "examples/dogfood/.gitignore" eliscript-clean-tests--repo-root)
             (expand-file-name "examples/dogfood/.gitignore" root) t)
  (eliscript-clean-tests--git root "init" "-q")
  (eliscript-clean-tests--git root "config" "user.email" "test@example.invalid")
  (eliscript-clean-tests--git root "config" "user.name" "Test")
  (eliscript-clean-tests--git root "add" "."))

(defun eliscript-clean-tests--run-launcher (root &rest args)
  "Invoke `bin/eliscript-clean' in ROOT with ARGS; return `(STATUS . OUTPUT)'."
  (let ((process-environment
         (cons (concat "EMACS=" (expand-file-name invocation-name invocation-directory))
               process-environment))
        (default-directory (file-name-as-directory root)))
    (with-temp-buffer
      (let ((status (apply #'call-process
                           (expand-file-name "bin/eliscript-clean" root)
                           nil t nil args)))
        (cons status (buffer-string))))))

(ert-deftest eliscript-clean-removes-generated-artifacts-and-check-is-idempotent ()
  (let ((repo (make-temp-file "eliscript-clean-fixture-" t)))
    (unwind-protect
        (progn
          (eliscript-clean-tests--init-fixture-repo repo)
          (let ((removable
                 '("dist/bootstrap/compiler.mjs"
                   "dist/stage3-release.json"
                   ".eliscript-cache/test-results/suite.json"
                   "coverage/lcov.info"
                   "tools/backends/dist/release-cli.mjs"
                   "tools/ci/dist/compiler-release.mjs"
                   "examples/dogfood/dist/main.mjs"
                   "examples/dogfood/tmp/scratch.txt"
                   "examples/dogfood/_site/index.html"
                   "examples/dogfood/_site.staging/index.html"
                   "examples/dogfood/_site.backup/index.html"
                   "examples/dogfood/_demo/_site/index.html"
                   "examples/dogfood/preview.staging/item.txt"
                   "examples/dogfood/preview.backup/item.txt"
                   "runtime/unicode-case-data.eli"
                   "runtime/prelude.mjs"
                   "runtime/prelude.mjs.map"
                   "runtime/prelude.mjs.macro-origins.json"
                   "runtime/.eliscript-esm-loader-1234/entry.mjs"
                   "compiler/eliscript.elc"
                   "compiler/.eliscript.el.eliscript-format-42"
                   "eliscript-0.1.3.tgz"
                   ".eliscript-test.abc123/out.mjs"
                   ".eliscript-dogfood-site-xyz/index.html"
                   ".eliscript-format-test.99/formatted.eli")))
            (dolist (rel removable)
              (eliscript-clean-tests--write-file repo rel "generated\n"))
            (let ((dirty-check (eliscript-clean-tests--run-launcher repo "--check")))
              (should (equal (car dirty-check) 1))
              (should (string-match-p "removable artifact" (cdr dirty-check))))
            (let ((clean-run (eliscript-clean-tests--run-launcher repo)))
              (should (equal (car clean-run) 0)))
            (dolist (rel '("dist"
                           ".eliscript-cache"
                           "coverage"
                           "tools/backends/dist"
                           "tools/ci/dist"
                           "examples/dogfood/dist"
                           "examples/dogfood/tmp"
                           "examples/dogfood/_site"
                           "examples/dogfood/_site.staging"
                           "examples/dogfood/_site.backup"
                           "examples/dogfood/_demo/_site"
                           "examples/dogfood/preview.staging"
                           "examples/dogfood/preview.backup"
                           "runtime/unicode-case-data.eli"
                           "runtime/prelude.mjs"
                           "runtime/prelude.mjs.map"
                           "runtime/prelude.mjs.macro-origins.json"
                           "runtime/.eliscript-esm-loader-1234"
                           "compiler/eliscript.elc"
                           "compiler/.eliscript.el.eliscript-format-42"
                           "eliscript-0.1.3.tgz"
                           ".eliscript-test.abc123"
                           ".eliscript-dogfood-site-xyz"
                           ".eliscript-format-test.99"))
              (should-not (eliscript-clean--entry-present-p
                           (expand-file-name rel repo))))
            (dolist (kept '("package.json"
                            "compiler/eliscript.el"
                            "bootstrap/README.md"
                            "runtime/prelude.eli"
                            "examples/dogfood/eliscript.json"))
              (should (file-exists-p (expand-file-name kept repo))))
            (let ((clean-check (eliscript-clean-tests--run-launcher repo "--check")))
              (should (equal (car clean-check) 0))
              (should (string-match-p "eliscript-clean: clean" (cdr clean-check))))
            ;; Idempotent second invocation removes zero paths and stays clean.
            (should (null (eliscript-clean-run repo t)))
            (should (equal (car (eliscript-clean-tests--run-launcher repo "--check" "--quiet")) 0))))
      (when (file-exists-p repo)
        (delete-directory repo t)))))

(ert-deftest eliscript-clean-protects-tracked-wip-unignored-node-modules-and-worktrees ()
  (let ((repo (make-temp-file "eliscript-clean-protect-" t)))
    (unwind-protect
        (progn
          (eliscript-clean-tests--init-fixture-repo repo)
          ;; Force-track an `.mjs' file to verify Git-tracked protection overrides filename rules.
          (eliscript-clean-tests--write-file repo "tests/tracked-fixture.mjs" "tracked-marker\n")
          (eliscript-clean-tests--git repo "add" "-f" "tests/tracked-fixture.mjs")
          ;; Untracked WIP and protected trees that MUST survive untouched.
          (eliscript-clean-tests--write-file repo ".eliscript-draft/source.eli" "(defconst wip 1)\n")
          (eliscript-clean-tests--write-file repo "compiler/new-wip-pass.el" ";; wip\n")
          (eliscript-clean-tests--write-file repo "scratch/experiment.eli" "(+ 1 2)\n")
          (eliscript-clean-tests--write-file repo "notes.org" "* WIP\n")
          (eliscript-clean-tests--write-file repo "node_modules/fake-pkg/index.mjs" "protected-pkg\n")
          (eliscript-clean-tests--write-file repo "_worktree/feature-a/dist/keep.mjs" "protected-worktree\n")
          ;; Ignored artifacts alongside them that MUST be removed.
          (eliscript-clean-tests--write-file repo "dist/stale.mjs" "stale\n")
          (eliscript-clean-tests--write-file repo ".eliscript-test.777/temp.mjs" "temp\n")
          (eliscript-clean-run repo t)
          (should-not (file-exists-p (expand-file-name "dist" repo)))
          (should-not (file-exists-p (expand-file-name ".eliscript-test.777" repo)))
          (dolist (protected '("tests/tracked-fixture.mjs"
                               ".eliscript-draft/source.eli"
                               "compiler/new-wip-pass.el"
                               "scratch/experiment.eli"
                               "notes.org"
                               "node_modules/fake-pkg/index.mjs"
                               "_worktree/feature-a/dist/keep.mjs"
                               ".git/HEAD"))
            (should (file-exists-p (expand-file-name protected repo))))
          (should (null (eliscript-clean-collect-targets repo))))
      (when (file-exists-p repo)
        (delete-directory repo t)))))

(ert-deftest eliscript-clean-unlinks-internal-symlinks-without-touching-external-targets ()
  (let ((repo (make-temp-file "eliscript-clean-symlink-repo-" t))
        (outside (make-temp-file "eliscript-clean-outside-" t)))
    (unwind-protect
        (progn
          (eliscript-clean-tests--init-fixture-repo repo)
          (eliscript-clean-tests--write-file outside "precious.mjs" "external-mjs\n")
          (eliscript-clean-tests--write-file outside "nested/keep.txt" "external-nested\n")
          (make-directory (expand-file-name "dist" repo) t)
          (make-symbolic-link outside (expand-file-name "dist/external-dir-link" repo))
          (make-symbolic-link outside (expand-file-name "examples/dogfood/_site" repo))
          (make-symbolic-link (expand-file-name "precious.mjs" outside)
                              (expand-file-name "runtime/linked.mjs" repo))
          (eliscript-clean-run repo t)
          (should-not (eliscript-clean--entry-present-p (expand-file-name "dist" repo)))
          (should-not (eliscript-clean--entry-present-p
                       (expand-file-name "examples/dogfood/_site" repo)))
          (should-not (eliscript-clean--entry-present-p
                       (expand-file-name "runtime/linked.mjs" repo)))
          ;; External targets MUST remain completely untouched.
          (should (file-exists-p (expand-file-name "precious.mjs" outside)))
          (should (file-exists-p (expand-file-name "nested/keep.txt" outside)))
          ;; Direct removal outside canonical root MUST error immediately.
          (should-error
           (eliscript-clean--remove-entry
            (eliscript-clean-resolve-root repo)
            (expand-file-name "precious.mjs" outside))))
      (when (file-exists-p repo)
        (delete-directory repo t))
      (when (file-exists-p outside)
        (delete-directory outside t)))))

(ert-deftest eliscript-clean-cli-rejects-unknown-options-and-invalid-roots ()
  (let ((repo (make-temp-file "eliscript-clean-cli-" t))
        (bad-dir (make-temp-file "eliscript-clean-invalid-" t))
        (other-pkg (make-temp-file "eliscript-clean-other-" t)))
    (unwind-protect
        (progn
          (eliscript-clean-tests--init-fixture-repo repo)
          (dolist (flag '("--all" "-a" "--bogus"))
            (let ((res (eliscript-clean-tests--run-launcher repo flag)))
              (should (equal (car res) 1))
              (should (string-match-p "unknown option" (cdr res)))))
          (let ((help (eliscript-clean-tests--run-launcher repo "--help")))
            (should (equal (car help) 0))
            (should (string-match-p "Usage: eliscript-clean" (cdr help))))
          (should-error (eliscript-clean-resolve-root bad-dir))
          (eliscript-clean-tests--write-file
           other-pkg "package.json" "{\"name\":\"not-eliscript\"}\n")
          (make-directory (expand-file-name "compiler" other-pkg) t)
          (make-directory (expand-file-name "bootstrap" other-pkg) t)
          (should-error (eliscript-clean-resolve-root other-pkg)))
      (dolist (dir (list repo bad-dir other-pkg))
        (when (file-exists-p dir)
          (delete-directory dir t))))))

(ert-deftest eliscript-clean-makefile-public-entries-clean-once-and-reuse-fresh-batch ()
  (let ((repo (make-temp-file "eliscript-clean-make-" t))
        (trace-dir (make-temp-file "eliscript-clean-trace-" t)))
    (unwind-protect
        (let ((trace-file (expand-file-name "events.log" trace-dir))
              (emacs-bin (expand-file-name invocation-name invocation-directory))
              (compiler-load-dir (expand-file-name "compiler" eliscript-clean-tests--repo-root)))
          (eliscript-clean-tests--init-fixture-repo repo)
          (copy-file (expand-file-name "Makefile" eliscript-clean-tests--repo-root)
                     (expand-file-name "Makefile" repo) t)
          ;; Self-link `node_modules/eliscript' inside the fixture so compiled `.eli'
          ;; modules resolve `eliscript/runtime/unicode-case.mjs' while simultaneously
          ;; verifying `node_modules/' survives automatic pre-batch cleaning.
          (make-directory (expand-file-name "node_modules" repo) t)
          (make-symbolic-link ".." (expand-file-name "node_modules/eliscript" repo))
          ;; Pure `.eli' scheduling doubles compiled by `eliscript-compile-file'.
          (eliscript-clean-tests--write-sexp-file
           repo "runtime/unicode-case.eli"
           '(module eliscript.runtime.unicode-case))
          (eliscript-clean-tests--write-sexp-file
           repo "tools/ci/render-workflow.eli"
           '(module tools.ci.render-workflow))
          (eliscript-clean-tests--write-sexp-file
           repo "tools/testing/file-workers.eli"
           '(module tools.testing.file-workers
              (import "node:fs" existsSync mkdirSync writeFileSync readdirSync appendFileSync)
              (import "node:path" join)
              (defconst argv (get globalThis.process :argv))
              (defconst env (get globalThis.process :env))
              (defconst mode (aref argv 2))
              (defconst suite (aref argv 3))
              (defconst step (or (aref argv 4) "step"))
              (defconst results-dir ".eliscript-cache/test-results")
              (when (and (= (get env :ELISCRIPT_CLEAN_EXPECT_STAGE3) "1")
                         (not (existsSync "dist/fresh-batch-marker.txt")))
                (throw (new globalThis.Error (+ "missing fresh-batch-marker during " step))))
              (mkdirSync results-dir (js-object :recursive t))
              (when (or (= mode "--suite-step") (= mode "--suite-prereq"))
                (writeFileSync (join results-dir (+ (js-call step :replaceAll "/" "__") ".ok")) "ok\n"))
              (when (= mode "--suite-finalize")
                (let ((files (readdirSync results-dir)))
                  (when (= (js-length files) 0)
                    (throw (new globalThis.Error "suite receipts wiped before finalize")))
                  (appendFileSync (get env :ELISCRIPT_CLEAN_TEST_TRACE)
                                  (+ "finalize:" suite ":" (globalThis.String (js-length files)) "\n"))))))
          (eliscript-clean-tests--write-sexp-file
           repo "tools/backends/eliscript/release-cli.eli"
           '(module tools.backends.release-cli
              (import "node:fs" existsSync mkdirSync writeFileSync appendFileSync)
              (import "node:path" join)
              (defconst argv (get globalThis.process :argv))
              (defconst env (get globalThis.process :env))
              (defconst cmd (aref argv 2))
              (cond
               ((= cmd "bootstrap")
                (mkdirSync "dist/bootstrap-release" (js-object :recursive t))
                (writeFileSync "dist/bootstrap-release/bootstrap.json" "{}\n")
                (appendFileSync (get env :ELISCRIPT_CLEAN_TEST_TRACE) "stage3-bootstrap\n"))
               ((= cmd "prepare-release-package")
                (mkdirSync "dist" (js-object :recursive t))
                (writeFileSync "dist/stage3-release.json" "{}\n")
                (writeFileSync "dist/fresh-batch-marker.txt" "fresh\n")
                (appendFileSync (get env :ELISCRIPT_CLEAN_TEST_TRACE) "prepare-release-package\n"))
               ((= cmd "verify-bootstrap")
                (unless (existsSync "dist/bootstrap-release/bootstrap.json")
                  (js-call globalThis.process :exit 1)))
               ((= cmd "verify-prepared-stage3")
                (unless (and (existsSync (join (js-call globalThis.process :cwd) "dist/stage3-release.json"))
                             (existsSync (join (js-call globalThis.process :cwd) "dist/fresh-batch-marker.txt")))
                  (throw (new globalThis.Error "prepared stage3 missing")))
                (appendFileSync (get env :ELISCRIPT_CLEAN_TEST_TRACE) "require-prepared\n"))
               (t
                (throw (new globalThis.Error (+ "unexpected command: " (globalThis.String cmd))))))))
          ;; Pure `.el' scheduling `bootstrap.el' compiling the `.eli' doubles above.
          (eliscript-clean-tests--write-file
           repo "tools/backends/bootstrap.el"
           (concat
            ";;; scheduling bootstrap double -*- lexical-binding: t; -*-\n"
            (let ((print-length nil)
                  (print-level nil))
              (prin1-to-string
               `(progn
                  (add-to-list 'load-path ,compiler-load-dir)
                  (require 'eliscript)
                  (let ((trace (getenv "ELISCRIPT_CLEAN_TEST_TRACE"))
                        (include-tests (member "--tests" command-line-args-left))
                        (stage0 (member "--stage0" command-line-args-left))
                        (out-args (member "--output" command-line-args-left)))
                    (setq command-line-args-left nil)
                    (when (file-exists-p "dist/stale-sentinel.mjs")
                      (error "stale-sentinel survived into bootstrap.el"))
                    (unless (file-exists-p ".eliscript-draft/source.eli")
                      (error "WIP draft was deleted before bootstrap.el"))
                    (unless (file-symlink-p "node_modules/eliscript")
                      (error "node_modules entry was deleted before bootstrap.el"))
                    (when include-tests
                      (with-temp-buffer
                        (insert "bootstrap-tests\n")
                        (append-to-file (point-min) (point-max) trace))
                      (dolist (pair '(("runtime/unicode-case.eli" . "runtime/unicode-case.mjs")
                                      ("tools/ci/render-workflow.eli" . "tools/ci/render-workflow.mjs")
                                      ("tools/testing/file-workers.eli" . "tools/testing/file-workers.mjs")
                                      ("tools/backends/eliscript/release-cli.eli" . "tools/backends/dist/release-cli.mjs")))
                        (make-directory (file-name-directory (cdr pair)) t)
                        (eliscript-compile-file (car pair) (cdr pair))))
                    (when stage0
                      (let ((out (cadr out-args)))
                        (with-temp-buffer
                          (insert "bootstrap-stage0\n")
                          (append-to-file (point-min) (point-max) trace))
                        (make-directory out t)
                        (with-temp-file (expand-file-name "stage0.json" out)
                          (insert "{}\n"))))))))
            "\n"))
          (eliscript-clean-tests--git
           repo "add"
           "Makefile"
           "runtime/unicode-case.eli"
           "tools/ci/render-workflow.eli"
           "tools/testing/file-workers.eli"
           "tools/backends/eliscript/release-cli.eli"
           "tools/backends/bootstrap.el")
          ;; Pending untracked WIP must survive every public Make invocation.
          (eliscript-clean-tests--write-file repo ".eliscript-draft/source.eli" "(defconst keep-me t)\n")
          ;; 1) Public `make check-contracts' cleans stale outputs first, builds fresh Stage 3 once,
          ;;    and preserves `.eliscript-cache/test-results/' across all intra-batch steps.
          (eliscript-clean-tests--write-file repo "dist/stale-sentinel.mjs" "stale-1\n")
          (eliscript-clean-tests--write-file repo ".eliscript-test.old1/junk.mjs" "junk\n")
          (with-temp-file trace-file (insert ""))
          (let ((process-environment
                 (append (list (concat "EMACS=" emacs-bin)
                               (concat "ELISCRIPT_CLEAN_TEST_TRACE=" trace-file)
                               "ELISCRIPT_SKIP_RETAINED_ACCEPTANCE=0"
                               "ELISCRIPT_CLEAN_EXPECT_STAGE3=1")
                         process-environment))
                (default-directory (file-name-as-directory repo)))
            (with-temp-buffer
              (let ((status (call-process "make" nil t nil "check-contracts")))
                (unless (and (integerp status) (zerop status))
                  (ert-fail (format "make check-contracts failed (%s): %s" status (buffer-string)))))))
          (should-not (file-exists-p (expand-file-name "dist/stale-sentinel.mjs" repo)))
          (should-not (file-exists-p (expand-file-name ".eliscript-test.old1" repo)))
          (should (file-exists-p (expand-file-name ".eliscript-draft/source.eli" repo)))
          (should (file-symlink-p (expand-file-name "node_modules/eliscript" repo)))
          (should (file-exists-p (expand-file-name "dist/fresh-batch-marker.txt" repo)))
          (with-temp-buffer
            (insert-file-contents trace-file)
            (should (equal (split-string (buffer-string) "\n" t)
                           '("bootstrap-tests"
                             "bootstrap-stage0"
                             "stage3-bootstrap"
                             "prepare-release-package"
                             "finalize:test:17"))))
          ;; 2) Even when `dist/stage3-release.json' already exists from the previous batch,
          ;;    a new public `make check-contracts' batch STILL cleans stale outputs first!
          (eliscript-clean-tests--write-file repo "dist/stale-sentinel.mjs" "stale-2\n")
          (with-temp-file trace-file (insert ""))
          (let ((process-environment
                 (append (list (concat "EMACS=" emacs-bin)
                               (concat "ELISCRIPT_CLEAN_TEST_TRACE=" trace-file)
                               "ELISCRIPT_SKIP_RETAINED_ACCEPTANCE=0"
                               "ELISCRIPT_CLEAN_EXPECT_STAGE3=1")
                         process-environment))
                (default-directory (file-name-as-directory repo)))
            (with-temp-buffer
              (let ((status (call-process "make" nil t nil "check-contracts")))
                (unless (and (integerp status) (zerop status))
                  (ert-fail (format "second make check-contracts failed (%s): %s" status (buffer-string)))))))
          (should-not (file-exists-p (expand-file-name "dist/stale-sentinel.mjs" repo)))
          (should (file-exists-p (expand-file-name ".eliscript-draft/source.eli" repo)))
          (with-temp-buffer
            (insert-file-contents trace-file)
            (should (equal (split-string (buffer-string) "\n" t)
                           '("bootstrap-tests"
                             "bootstrap-stage0"
                             "stage3-bootstrap"
                             "prepare-release-package"
                             "finalize:test:17"))))
          ;; 3) Explicit `ELISCRIPT_PREPARED_STAGE3=1' intra-batch handoff reuses the prepared
          ;;    Stage 3 via `verify-prepared-stage3' without wiping in-flight outputs.
          (eliscript-clean-tests--write-file repo "dist/in-flight-marker.txt" "keep-intra-batch\n")
          (with-temp-file trace-file (insert ""))
          (let ((process-environment
                 (append (list (concat "EMACS=" emacs-bin)
                               (concat "ELISCRIPT_CLEAN_TEST_TRACE=" trace-file)
                               "ELISCRIPT_SKIP_RETAINED_ACCEPTANCE=0"
                               "ELISCRIPT_CLEAN_EXPECT_STAGE3=1"
                               "ELISCRIPT_PREPARED_STAGE3=1")
                         process-environment))
                (default-directory (file-name-as-directory repo)))
            (with-temp-buffer
              (let ((status (call-process "make" nil t nil "check-contracts")))
                (unless (and (integerp status) (zerop status))
                  (ert-fail (format "prepared make check-contracts failed (%s): %s" status (buffer-string)))))))
          (should (file-exists-p (expand-file-name "dist/in-flight-marker.txt" repo)))
          (with-temp-buffer
            (insert-file-contents trace-file)
            (should (equal (split-string (buffer-string) "\n" t)
                           '("require-prepared"
                             "finalize:test:17"))))
          ;; 4) Verify `make -n' is side-effect-free and routes `test', `test-core',
          ;;    `test-applications', `check-contracts', and standalone `test-bootstrap-artifacts'
          ;;    through `./bin/eliscript-clean' + Stage 3 `bootstrap-release' + `prepare-release-package'.
          (eliscript-clean-tests--write-file repo "dist/dry-run-must-not-delete.mjs" "dry-run\n")
          (dolist (goal '("test" "test-core" "test-applications" "check-contracts" "test-bootstrap-artifacts"))
            (let ((default-directory (file-name-as-directory repo)))
              (with-temp-buffer
                (let ((status (call-process "make" nil t nil "-n" goal))
                      (plan (buffer-string)))
                  (should (equal status 0))
                  (should (string-match-p "./bin/eliscript-clean" plan))
                  (should (string-match-p "release-cli\\.mjs bootstrap" plan))
                  (should (string-match-p "release-cli\\.mjs prepare-release-package" plan))))))
          (should (file-exists-p (expand-file-name "dist/dry-run-must-not-delete.mjs" repo))))
      (dolist (dir (list repo trace-dir))
        (when (file-exists-p dir)
          (delete-directory dir t))))))

(provide 'eliscript-clean-tests)

;;; eliscript-clean-tests.el ends here
