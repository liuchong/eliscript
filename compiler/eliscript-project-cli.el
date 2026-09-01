;;; eliscript-project-cli.el --- Batch project builder -*- lexical-binding: t; -*-

;;; Commentary:

;; Run with:
;;   emacs --batch -Q --script compiler/eliscript-project-cli.el -- ENTRY --out-dir DIR

;;; Code:

(add-to-list 'load-path
             (file-name-directory (or load-file-name buffer-file-name)))
(require 'eliscript-project)

(defconst eliscript-project-cli--usage
  (concat
   "Usage: eliscript-build [--config FILE] [--root DIR] [--portable NAME]\n"
   "                       [--no-cache]\n"
   "                       [--json] [--diagnostic-format human|json]\n"
   "                       --out-dir DIR ENTRY\n\n"
   "Compile ENTRY and its relative .eli imports into an ESM directory tree.\n"
   "Use --config FILE for a versioned project request. Explicit build flags\n"
   "and ENTRY override configured values; --no-cache always disables reuse.\n"
   "Write eliscript-project.json with deterministic graph content digests.\n"
   "Reuse verified modules by default; --no-cache forces complete compilation.\n"
   "Use --json for a machine-readable build decision report on stdout.\n"
   "Use JSON diagnostics for failures on stderr.\n"
   "Repeat --portable to emit a verified, dependency-pruned portable graph.\n"))

(defun eliscript-project-cli--requested-diagnostic-format (arguments)
  "Return a usable diagnostic format requested by raw ARGUMENTS."
  (let ((remaining arguments)
        (format-name "human"))
    (while remaining
      (when (and (equal (car remaining) "--diagnostic-format")
                 (cdr remaining)
                 (equal (cadr remaining) "json"))
        (setq format-name "json"))
      (setq remaining (cdr remaining)))
    format-name))

(defun eliscript-project-cli--parse (arguments)
  "Parse ARGUMENTS into a project request and presentation fields."
  (when (equal (car arguments) "--")
    (setq arguments (cdr arguments)))
  (let ((use-cache t)
        (json-report nil)
        (diagnostic-format "human")
        entry out-dir root portable-entries configuration)
    (while arguments
      (let ((argument (pop arguments)))
        (cond
         ((member argument '("-h" "--help"))
          (princ eliscript-project-cli--usage)
          (kill-emacs 0))
         ((equal argument "--out-dir")
          (unless arguments
            (error "%s requires a directory" argument))
          (setq out-dir (pop arguments)))
         ((equal argument "--config")
          (unless arguments
            (error "%s requires a file" argument))
          (when configuration
            (error "multiple --config files are not supported"))
          (setq configuration (pop arguments)))
         ((equal argument "--root")
          (unless arguments
            (error "%s requires a directory" argument))
          (setq root (pop arguments)))
         ((equal argument "--portable")
          (unless arguments
            (error "%s requires an entry name" argument))
          (push (pop arguments) portable-entries))
         ((equal argument "--no-cache")
          (setq use-cache nil))
         ((equal argument "--json")
          (setq json-report t))
         ((equal argument "--diagnostic-format")
          (unless arguments
            (error "%s requires human or json" argument))
          (setq diagnostic-format (pop arguments))
          (unless (member diagnostic-format '("human" "json"))
            (error "unsupported diagnostic format: %s" diagnostic-format)))
         ((string-prefix-p "-" argument)
          (error "unknown option: %s" argument))
         (entry (error "multiple entry files are not supported"))
         (t (setq entry argument)))))
    (let ((request
           (if configuration
               (let ((configured
                      (eliscript-project-read-configuration configuration)))
                 (when entry
                   (setf (eliscript-project-request-entry configured) entry))
                 (when out-dir
                   (setf (eliscript-project-request-out-dir configured) out-dir))
                 (when root
                   (setf (eliscript-project-request-root configured) root))
                 (when portable-entries
                   (setf (eliscript-project-request-portable-entries configured)
                         (nreverse portable-entries)))
                 (unless use-cache
                   (setf (eliscript-project-request-use-cache configured) nil))
                 configured)
             (progn
               (unless entry
                 (error "missing entry file"))
               (unless out-dir
                 (error "missing --out-dir"))
               (eliscript-project-request-create
                :entry entry
                :out-dir out-dir
                :root root
                :portable-entries (nreverse portable-entries)
                :use-cache use-cache)))))
      (list request json-report diagnostic-format))))

(defun eliscript-project-cli-main (arguments)
  "Build an Eliscript project according to command-line ARGUMENTS."
  (let ((requested-format
         (eliscript-project-cli--requested-diagnostic-format arguments)))
    (condition-case error-data
        (pcase-let ((`(,request ,json-report ,diagnostic-format)
                      (eliscript-project-cli--parse arguments)))
          (setq requested-format diagnostic-format)
          (let ((result (eliscript-project-execute request)))
            (princ
             (if json-report
                 (json-serialize
                  (eliscript-project-build-report result)
                  :false-object :false)
               (eliscript-project-build-result-entry-output result)))
            (princ "\n")))
      (error
       (if (equal requested-format "json")
           (message
            "%s"
            (eliscript-diagnostic-to-json
             (eliscript-diagnostic-from-error error-data)))
         (message
          "eliscript-build: %s"
          (eliscript-diagnostic-condition-message error-data)))
       (kill-emacs 1)))))

(eliscript-project-cli-main command-line-args-left)

;;; eliscript-project-cli.el ends here
