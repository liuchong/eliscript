;;; clean.el --- Clean non-Git generated and temporary artifacts -*- lexical-binding: t; -*-

;;; Commentary:

;; Remove all non-Git generated build artifacts and registered temporary
;; outputs inside an Eliscript repository while strictly protecting tracked
;; sources, non-ignored pending work, `node_modules', `_worktree', and any path
;; outside the canonical repository root (never following symlinks).
;;
;; Run via `./bin/eliscript-clean' or:
;;   emacs --batch -Q --script tools/clean.el -- [--check] [--quiet|-q]

;;; Code:

(require 'cl-lib)
(require 'json)

(defconst eliscript-clean--usage
  (concat
   "Usage: eliscript-clean [--check] [--quiet|-q] [--help|-h]\n\n"
   "Remove all non-Git generated build outputs and registered temporary paths\n"
   "inside this Eliscript checkout while protecting tracked sources, pending\n"
   "unignored work, node_modules/, _worktree/, and external symlink targets.\n\n"
   "Options:\n"
   "  --check      Verify no removable generated artifacts exist (exit 1 if any)\n"
   "  --quiet, -q  Suppress summary output\n"
   "  --help, -h   Print this help message\n"))

(defconst eliscript-clean-protected-names
  '(".git" "node_modules" "_worktree")
  "Directory names never descended into or removed by `eliscript-clean'.")

(defconst eliscript-clean-exact-directories
  '("dist"
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
    "examples/dogfood/_demo/_site.staging"
    "examples/dogfood/_demo/_site.backup")
  "Known generated output directories relative to the repository root.")

(defconst eliscript-clean-exact-files
  '("runtime/unicode-case-data.eli")
  "Known generated non-tracked files relative to the repository root.")

(defconst eliscript-clean-root-temp-prefixes
  '(".eliscript-application-test."
    ".eliscript-array-construction-"
    ".eliscript-array-search-"
    ".eliscript-browser-matrix-"
    ".eliscript-browser-playground-"
    ".eliscript-compatibility-"
    ".eliscript-core-project-"
    ".eliscript-core-set-"
    ".eliscript-core-stdlib-"
    ".eliscript-deferred-"
    ".eliscript-docs-"
    ".eliscript-docs-site-"
    ".eliscript-dogfood-a11y-"
    ".eliscript-dogfood-action-"
    ".eliscript-dogfood-browser-"
    ".eliscript-dogfood-comments-"
    ".eliscript-dogfood-config-"
    ".eliscript-dogfood-discussions-"
    ".eliscript-dogfood-events-"
    ".eliscript-dogfood-hybrid-"
    ".eliscript-dogfood-identity-"
    ".eliscript-dogfood-issues-"
    ".eliscript-dogfood-matrix-"
    ".eliscript-dogfood-resilience-"
    ".eliscript-dogfood-site-"
    ".eliscript-dogfood-skip-"
    ".eliscript-dogfood-source-"
    ".eliscript-dogfood-source-negative-"
    ".eliscript-dogfood-specs-"
    ".eliscript-dogfood-workflow-"
    ".eliscript-emitter-"
    ".eliscript-emitter-program-"
    ".eliscript-equality-"
    ".eliscript-exception-browser-"
    ".eliscript-format-test."
    ".eliscript-function-"
    ".eliscript-fuzz-full-emission-"
    ".eliscript-fuzz-semantic-proof-"
    ".eliscript-gensym-"
    ".eliscript-host-completion-"
    ".eliscript-host-values-"
    ".eliscript-literal-nth-"
    ".eliscript-literals-"
    ".eliscript-literals-bad-"
    ".eliscript-macro-files-"
    ".eliscript-macro-project-"
    ".eliscript-object-"
    ".eliscript-object-properties-"
    ".eliscript-pages-"
    ".eliscript-pages-runtime-"
    ".eliscript-portable-values-"
    ".eliscript-queue-"
    ".eliscript-recur-"
    ".eliscript-seed-codec-"
    ".eliscript-sequence-"
    ".eliscript-stdlib-project-"
    ".eliscript-test."
    ".eliscript-text-"
    ".eliscript-utility-project-"
    ".eliscript-value-project-"
    ".eliscript-value-text-project-")
  "Registered root-level temporary `mkdtemp'/`mktemp' prefixes in `.gitignore'.")

(defconst eliscript-clean--generated-file-regexp
  (concat "\\(?:"
          "\\.mjs\\'"
          "\\|\\.mjs\\.map\\'"
          "\\|\\.mjs\\.macro-origins\\.json\\'"
          "\\|\\.elc\\'"
          "\\|\\.tgz\\'"
          "\\)")
  "Regular expression matching generated artifact filenames.")

(defun eliscript-clean--entry-present-p (path)
  "Return non-nil if PATH exists on disk, including broken symbolic links."
  (or (not (null (file-symlink-p path)))
      (file-exists-p path)))

(defun eliscript-clean--real-directory-p (path)
  "Return non-nil if PATH is a real directory and NOT a symbolic link."
  (and (null (file-symlink-p path))
       (file-directory-p path)))

(defun eliscript-clean--path-contained-p (canonical-root target-path)
  "Return non-nil when TARGET-PATH's parent resolves inside CANONICAL-ROOT.
TARGET-PATH itself is not dereferenced, allowing owned symlink entries inside
CANONICAL-ROOT to be unlinked without touching external targets."
  (let* ((clean-root (directory-file-name canonical-root))
         (clean-target (directory-file-name (expand-file-name target-path clean-root))))
    (and (not (equal clean-target clean-root))
         (let* ((parent-dir (file-name-directory clean-target))
                (canonical-parent (and parent-dir
                                       (directory-file-name (file-truename parent-dir)))))
           (and canonical-parent
                (or (equal canonical-parent clean-root)
                    (string-prefix-p (concat clean-root "/") canonical-parent)))))))

(defun eliscript-clean-resolve-root (&optional directory)
  "Resolve and validate the canonical Eliscript repository root for DIRECTORY."
  (let* ((default-root
          (expand-file-name ".."
                            (file-name-directory
                             (file-truename (or load-file-name buffer-file-name default-directory)))))
         (candidate (directory-file-name (file-truename (or directory default-root))))
         (manifest (expand-file-name "package.json" candidate))
         (compiler-dir (expand-file-name "compiler" candidate))
         (bootstrap-dir (expand-file-name "bootstrap" candidate)))
    (unless (and (eliscript-clean--real-directory-p candidate)
                 (null (file-symlink-p manifest))
                 (file-regular-p manifest)
                 (eliscript-clean--real-directory-p compiler-dir)
                 (eliscript-clean--real-directory-p bootstrap-dir))
      (error "Refusing to clean outside a valid Eliscript checkout: %s" candidate))
    (let ((parsed (with-temp-buffer
                    (insert-file-contents manifest)
                    (json-parse-buffer :object-type 'alist))))
      (unless (equal (alist-get 'name parsed) "eliscript")
        (error "Refusing to clean repository with unexpected package name in %s" manifest)))
    candidate))

(defun eliscript-clean--git-checkout-p (canonical-root)
  "Return non-nil when CANONICAL-ROOT has a `.git' directory or worktree file."
  (eliscript-clean--entry-present-p (expand-file-name ".git" canonical-root)))

(defun eliscript-clean--git-tracked-tables (canonical-root)
  "Return `(TRACKED-FILES . TRACKED-ANCESTORS)' hash tables for CANONICAL-ROOT."
  (let ((tracked-files (make-hash-table :test #'equal))
        (tracked-ancestors (make-hash-table :test #'equal)))
    (when (eliscript-clean--git-checkout-p canonical-root)
      (with-temp-buffer
        (set-buffer-multibyte nil)
        (let ((status (call-process "git" nil t nil
                                    "-C" canonical-root "ls-files" "-z")))
          (unless (zerop status)
            (error "git ls-files failed in %s (exit %d)" canonical-root status))
          (dolist (raw (split-string (buffer-string) "\0" t))
            (let ((rel (decode-coding-string raw 'utf-8)))
              (puthash rel t tracked-files)
              (let ((dir (file-name-directory rel)))
                (while (and dir (not (equal dir "")) (not (equal dir "./")))
                  (let ((clean-dir (directory-file-name dir)))
                    (puthash clean-dir t tracked-ancestors)
                    (setq dir (file-name-directory clean-dir))))))))))
    (cons tracked-files tracked-ancestors)))

(defun eliscript-clean--has-symlink-ancestor-p (canonical-root rel)
  "Return non-nil if any ancestor of REL in CANONICAL-ROOT is a symlink."
  (let ((dir (file-name-directory rel))
        found)
    (while (and dir (not found) (not (equal dir "")) (not (equal dir "./")))
      (let* ((clean-dir (directory-file-name dir))
             (abs-dir (expand-file-name clean-dir canonical-root)))
        (if (file-symlink-p abs-dir)
            (setq found t)
          (setq dir (file-name-directory clean-dir)))))
    found))

(defun eliscript-clean--git-filter-ignored (canonical-root candidates)
  "Return the subset of relative CANDIDATES ignored by Git in CANONICAL-ROOT.
When CANONICAL-ROOT is not a Git checkout, return CANDIDATES unchanged."
  (if (or (null candidates)
          (not (eliscript-clean--git-checkout-p canonical-root)))
      candidates
    (let ((ignored-set (make-hash-table :test #'equal))
          (input-file (make-temp-file "eliscript-clean-ignore-")))
      (unwind-protect
          (progn
            (with-temp-file input-file
              (set-buffer-multibyte nil)
              (dolist (rel candidates)
                (let ((abs (expand-file-name rel canonical-root)))
                  ;; Exact generated directory slots occupied by symlinks cannot
                  ;; match trailing-slash `.gitignore' rules (`_site/') via
                  ;; `git check-ignore' because `path/' fails across symlinks.
                  (if (and (file-symlink-p abs)
                           (member rel eliscript-clean-exact-directories))
                      (puthash rel t ignored-set)
                    (insert (encode-coding-string rel 'utf-8) 0)))))
            (when (> (nth 7 (file-attributes input-file)) 0)
              (with-temp-buffer
                (set-buffer-multibyte nil)
                (let ((status (call-process "git" input-file t nil
                                            "-C" canonical-root
                                            "check-ignore" "--no-index" "-z" "--stdin")))
                  (unless (memq status '(0 1))
                    (error "git check-ignore failed in %s (exit %d)" canonical-root status))
                  (dolist (raw (split-string (buffer-string) "\0" t))
                    (puthash (directory-file-name (decode-coding-string raw 'utf-8))
                             t ignored-set))))))
        (when (file-exists-p input-file)
          (delete-file input-file)))
      (cl-loop for rel in candidates
               when (gethash rel ignored-set)
               collect rel))))

(defun eliscript-clean--root-temp-entry-p (name)
  "Return non-nil when root entry NAME matches a registered temp prefix."
  (cl-some (lambda (prefix)
             (and (string-prefix-p prefix name)
                  (> (length name) (length prefix))))
           eliscript-clean-root-temp-prefixes))

(defun eliscript-clean--nested-generated-entry-p (rel name is-dir)
  "Return non-nil if nested entry REL (basename NAME, IS-DIR) is generated."
  (cond
   ((string-prefix-p ".eliscript-esm-loader-" name)
    (> (length name) (length ".eliscript-esm-loader-")))
   ((and (not is-dir)
         (string-match-p "\\`\\.[^/]+\\.eliscript-format-[^/]+\\'" name))
    t)
   ((and (string-prefix-p "examples/dogfood/" rel)
         (or (string-suffix-p ".staging" name)
             (string-suffix-p ".backup" name)))
    t)
   ((and (not is-dir)
         (string-match-p eliscript-clean--generated-file-regexp name))
    t)
   (t nil)))

(defun eliscript-clean-collect-targets (&optional directory)
  "Return sorted list of removable relative artifact paths under DIRECTORY."
  (let* ((root (eliscript-clean-resolve-root directory))
         (git-tables (eliscript-clean--git-tracked-tables root))
         (tracked-files (car git-tables))
         (tracked-ancestors (cdr git-tables))
         (queued (make-hash-table :test #'equal))
         (queued-dirs (make-hash-table :test #'equal))
         candidates)
    (cl-labels
        ((protected-rel-p (rel)
           (or (gethash rel tracked-files)
               (gethash rel tracked-ancestors)
               (member rel eliscript-clean-protected-names)))
         (enqueue (rel as-dir)
           (let ((abs (expand-file-name rel root)))
             (when (and (not (gethash rel queued))
                        (not (protected-rel-p rel))
                        (not (eliscript-clean--has-symlink-ancestor-p root rel))
                        (eliscript-clean--entry-present-p abs)
                        (eliscript-clean--path-contained-p root abs))
               (puthash rel t queued)
               (when as-dir
                 (puthash rel t queued-dirs))
               (push rel candidates))))
         (walk-dir (rel-dir)
           (let ((abs-dir (if (equal rel-dir "")
                              root
                            (expand-file-name rel-dir root))))
             (when (and (eliscript-clean--real-directory-p abs-dir)
                        (or (equal rel-dir "")
                            (eliscript-clean--path-contained-p root abs-dir)))
               (dolist (name (directory-files abs-dir nil directory-files-no-dot-files-regexp t))
                 (unless (member name eliscript-clean-protected-names)
                   (let* ((rel (if (equal rel-dir "")
                                   name
                                 (concat rel-dir "/" name)))
                          (abs (expand-file-name name abs-dir))
                          (symlink (not (null (file-symlink-p abs))))
                          (real-dir (and (not symlink) (file-directory-p abs))))
                     (unless (gethash rel queued-dirs)
                       (cond
                        ((and (equal rel-dir "")
                              (eliscript-clean--root-temp-entry-p name))
                         (enqueue rel t))
                        ((eliscript-clean--nested-generated-entry-p rel name real-dir)
                         (enqueue rel real-dir))
                        (real-dir
                         ;; Never descend into unregistered hidden root directories
                         ;; such as `.eliscript-draft', keeping WIP trees untouched.
                         (unless (and (equal rel-dir "")
                                      (string-prefix-p "." name)
                                      (not (member name '(".github" ".agents"))))
                           (walk-dir rel))))))))))))
      (dolist (rel eliscript-clean-exact-directories)
        (enqueue rel t))
      (dolist (rel eliscript-clean-exact-files)
        (enqueue rel nil))
      (walk-dir "")
      (let* ((ordered (sort (nreverse candidates) #'string<))
             (verified (eliscript-clean--git-filter-ignored root ordered)))
        ;; Drop any nested child whose ancestor directory is also verified for removal.
        (let ((verified-set (make-hash-table :test #'equal))
              pruned)
          (dolist (rel verified)
            (puthash rel t verified-set))
          (dolist (rel verified)
            (let ((dir (file-name-directory rel))
                  covered)
              (while (and dir (not covered) (not (equal dir "")) (not (equal dir "./")))
                (let ((clean-dir (directory-file-name dir)))
                  (if (gethash clean-dir verified-set)
                      (setq covered t)
                    (setq dir (file-name-directory clean-dir)))))
              (unless covered
                (push rel pruned))))
          (nreverse pruned))))))

(defun eliscript-clean--remove-entry (canonical-root target-path)
  "Safely remove TARGET-PATH inside CANONICAL-ROOT without following symlinks."
  (unless (eliscript-clean--path-contained-p canonical-root target-path)
    (error "Refusing to remove path outside repository root: %s" target-path))
  (cond
   ((file-symlink-p target-path)
    (delete-file target-path))
   ((file-directory-p target-path)
    (dolist (child (directory-files target-path t directory-files-no-dot-files-regexp t))
      (eliscript-clean--remove-entry canonical-root child))
    (delete-directory target-path nil))
   ((file-exists-p target-path)
    (delete-file target-path))))

(defun eliscript-clean-run (&optional directory quiet)
  "Clean all removable generated artifacts in DIRECTORY and return removed paths.
When QUIET is non-nil, suppress summary output."
  (let* ((root (eliscript-clean-resolve-root directory))
         (targets (eliscript-clean-collect-targets root)))
    (dolist (rel targets)
      (eliscript-clean--remove-entry root (expand-file-name rel root)))
    (unless quiet
      (princ (format "eliscript-clean: removed %d generated/temporary path%s\n"
                     (length targets)
                     (if (= (length targets) 1) "" "s"))))
    targets))

(defun eliscript-clean--parse-args (arguments)
  "Parse CLI ARGUMENTS into plist `(:check BOOL :quiet BOOL)'."
  (while (member (car arguments) '("--" "--eliscript-clean-cli"))
    (setq arguments (cdr arguments)))
  (let (check quiet)
    (while arguments
      (let ((arg (pop arguments)))
        (cond
         ((member arg '("-h" "--help"))
          (princ eliscript-clean--usage)
          (kill-emacs 0))
         ((equal arg "--check")
          (setq check t))
         ((member arg '("-q" "--quiet"))
          (setq quiet t))
         (t
          (error "unknown option: %s" arg)))))
    (list :check check :quiet quiet)))

(defun eliscript-clean-cli-main (arguments)
  "Run `eliscript-clean' CLI entry point with command-line ARGUMENTS."
  (condition-case err
      (let* ((options (eliscript-clean--parse-args arguments))
             (check (plist-get options :check))
             (quiet (plist-get options :quiet))
             (root (eliscript-clean-resolve-root)))
        (if check
            (let ((remaining (eliscript-clean-collect-targets root)))
              (when remaining
                (unless quiet
                  (message "eliscript-clean: %d removable artifact path%s present:"
                           (length remaining)
                           (if (= (length remaining) 1) "" "s"))
                  (dolist (rel remaining)
                    (message "  %s" rel)))
                (kill-emacs 1))
              (unless quiet
                (princ "eliscript-clean: clean\n")))
          (eliscript-clean-run root quiet)))
    (error
     (message "eliscript-clean: %s" (error-message-string err))
     (kill-emacs 1))))

(defun eliscript-clean--direct-script-invocation-p ()
  "Return non-nil when Emacs was invoked directly for `tools/clean.el'."
  (or (member "--eliscript-clean-cli" command-line-args-left)
      (let ((tail (member "-scriptload" command-line-args))
            (self (and load-file-name (file-truename load-file-name))))
        (and tail (cadr tail) self
             (equal (file-truename (cadr tail)) self)))))

(when (and noninteractive
           (not (bound-and-true-p byte-compile-current-file))
           (eliscript-clean--direct-script-invocation-p))
  (let ((args command-line-args-left))
    (setq command-line-args-left nil)
    (eliscript-clean-cli-main args)))

(provide 'eliscript-clean)

;;; clean.el ends here
