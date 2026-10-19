;;; eliscript-cli.el --- Batch command for Eliscript -*- lexical-binding: t; -*-

;;; Commentary:

;; Run with:
;;   emacs --batch -Q -L compiler --script compiler/eliscript-cli.el -- FILE

;;; Code:

(add-to-list 'load-path
             (file-name-directory (or load-file-name buffer-file-name)))
(require 'eliscript)

(defconst eliscript-cli--compiler-directory
  (file-name-as-directory
   (file-truename
    (file-name-directory (or load-file-name buffer-file-name))))
  "Physical directory owning the compiler loaded by this standalone CLI.")

(defconst eliscript-cli--ram-bytecompile-minimum-bytes (* 128 1024)
  "Minimum readable input size for the standalone CLI's RAM bytecode pass.")

(defvar eliscript-cli--compiler-bytecompiled nil
  "Non-nil after this CLI has prepared its compiler bytecode in RAM once.")

(defun eliscript-cli--large-readable-input-p (input)
  "Return non-nil for readable INPUT above the RAM bytecode threshold.
An inaccessible input must retain the ordinary compiler's file diagnostic."
  (condition-case nil
      (when (file-readable-p input)
        (let* ((attributes (file-attributes (file-truename input)))
               (size (file-attribute-size attributes)))
          (and (null (file-attribute-type attributes))
               (integerp size)
               (>= size eliscript-cli--ram-bytecompile-minimum-bytes))))
    (file-error nil)))

(defun eliscript-cli--bytecode-definition-p (definition)
  "Return non-nil for bytecode DEFINITION, including its macro wrapper."
  (or (byte-code-function-p definition)
      (and (eq (car-safe definition) 'macro)
           (byte-code-function-p (cdr definition)))))

(defun eliscript-cli--byte-compile-loaded-compiler ()
  "Byte-compile owned loaded compiler definitions once, entirely in RAM.
Only actual function entries in this compiler directory's `load-history'
participate.  Symbol aliases remain aliases, and shared original function
values share the same compiled replacement.  No library file is written."
  (unless eliscript-cli--compiler-bytecompiled
    (require 'bytecomp)
    (let ((seen (make-hash-table :test #'eq))
          (compiled (make-hash-table :test #'eq))
          (byte-compile-warnings nil)
          (byte-compile-verbose nil)
          (inhibit-message t)
          (message-log-max nil))
      (dolist (entry load-history)
        (let ((filename (car-safe entry)))
          (when (and (stringp filename)
                     (file-name-absolute-p filename)
                     (file-in-directory-p filename eliscript-cli--compiler-directory))
            (dolist (item (cdr entry))
              (when (and (eq (car-safe item) 'defun)
                         (symbolp (cdr item))
                         (not (gethash (cdr item) seen)))
                (let* ((name (cdr item))
                       (owner (symbol-file name 'defun)))
                  (when (and owner
                             (equal (file-truename owner) (file-truename filename)))
                    (puthash name t seen)
                    (when (fboundp name)
                      (let ((definition (symbol-function name)))
                        (when (and (not (symbolp definition))
                                   (not (subrp definition))
                                   (not (autoloadp definition))
                                   (not (eliscript-cli--bytecode-definition-p definition))
                                   (or (functionp definition)
                                       (and (eq (car-safe definition) 'macro)
                                            (not (subrp (cdr definition))))))
                          (let ((replacement (gethash definition compiled)))
                            (unless replacement
                              ;; The public symbol API preserves lexical closure
                              ;; environments and (macro . FUNCTION) wrappers.
                              (setq replacement (byte-compile name))
                              (unless (eliscript-cli--bytecode-definition-p replacement)
                                (error "cannot prepare Seed bytecode for %s" name))
                              (puthash definition replacement compiled))
                            (fset name replacement))))))))))))
      (setq eliscript-cli--compiler-bytecompiled t))))

(defconst eliscript-cli--usage
  (concat
   "Usage: eliscript [--output FILE] [--source-map] [--portable NAME]\n"
   "                  [--diagnostic-format human|json] INPUT\n\n"
   "Compile INPUT to an ECMAScript module. Write to stdout when --output "
   "is absent.\n--source-map writes FILE.map and requires --output.\n"
   "Repeat --portable to emit only those worker entries and dependencies.\n"
   "Use JSON diagnostics for editor and CI integrations.\n"))

(defun eliscript-cli--requested-diagnostic-format (arguments)
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

(defun eliscript-cli--parse (arguments)
  "Parse ARGUMENTS into input, output, maps, portable, and diagnostic fields."
  (when (equal (car arguments) "--")
    (setq arguments (cdr arguments)))
  (let ((diagnostic-format "human")
        input output source-map portable-entries)
    (while arguments
      (let ((argument (pop arguments)))
        (cond
         ((member argument '("-h" "--help"))
          (princ eliscript-cli--usage)
          (kill-emacs 0))
         ((member argument '("-o" "--output"))
          (unless arguments
            (error "%s requires a file" argument))
          (setq output (pop arguments)))
         ((equal argument "--source-map")
          (setq source-map t))
         ((equal argument "--portable")
          (unless arguments
            (error "%s requires a function name" argument))
          (push (pop arguments) portable-entries))
         ((equal argument "--diagnostic-format")
          (unless arguments
            (error "%s requires human or json" argument))
          (setq diagnostic-format (pop arguments))
          (unless (member diagnostic-format '("human" "json"))
            (error "unsupported diagnostic format: %s" diagnostic-format)))
         ((string-prefix-p "-" argument)
          (error "unknown option: %s" argument))
         (input (error "multiple input files are not supported yet"))
         (t (setq input argument)))))
    (unless input
      (error "missing input file"))
    (when (and source-map (null output))
      (error "--source-map requires --output"))
    (list input output source-map (nreverse portable-entries)
          diagnostic-format)))

(defun eliscript-cli-main (arguments)
  "Compile according to command-line ARGUMENTS."
  (let ((requested-format
         (eliscript-cli--requested-diagnostic-format arguments)))
    (condition-case error-data
        (pcase-let ((`(,input ,output ,source-map ,portable-entries
                              ,diagnostic-format)
                      (eliscript-cli--parse arguments)))
          (setq requested-format diagnostic-format)
          (when (eliscript-cli--large-readable-input-p input)
            (eliscript-cli--byte-compile-loaded-compiler))
          (if source-map
              (if portable-entries
                  (eliscript-compile-portable-file-with-source-map
                   input portable-entries output)
                (eliscript-compile-file-with-source-map input output))
            (let ((generated
                   (if portable-entries
                       (eliscript-compile-portable-file
                        input portable-entries output)
                     (eliscript-compile-file input output))))
              (unless output
                (princ generated)))))
      (error
       (if (equal requested-format "json")
           (message
            "%s"
            (eliscript-diagnostic-to-json
             (eliscript-diagnostic-from-error error-data)))
         (message
          "eliscript: %s"
          (eliscript-diagnostic-condition-message error-data)))
       (kill-emacs 1)))))

;; The script owns these arguments. Leaving them for Emacs makes its normal
;; startup reopen output paths after compilation and prompt for large files.
(let ((arguments command-line-args-left))
  (setq command-line-args-left nil)
  (eliscript-cli-main arguments))

;;; eliscript-cli.el ends here
