;;; bootstrap-parity.el --- Compare serial and batch bootstrap bytes -*- lexical-binding: t; -*-

;; Run in a source checkout after `make clean-all'. Both arms consume the
;; current maintained inventory and compiler sources. Only the tool-process
;; boundary changes; the reference uses the original per-file CLI entry.

(require 'cl-lib)
(require 'json)

(declare-function eliscript-backend-bootstrap "../backends/bootstrap" (&optional include-tests))
(declare-function eliscript-backend-compile-tool "../backends/bootstrap" (runtime tool))

(defconst eliscript-bootstrap-parity-root
  (expand-file-name "../.." (file-name-directory (or load-file-name buffer-file-name))))

(defun eliscript-bootstrap-parity-files ()
  "Return owned generated module identities without following package links."
  (let (records)
    (dolist (relative '("bootstrap" "browser" "compiler" "editor" "examples"
                        "platform" "runtime" "stdlib" "tests" "tools" "dist"))
      (let ((directory (expand-file-name relative eliscript-bootstrap-parity-root)))
        (when (file-directory-p directory)
          (dolist (path (directory-files-recursively
                         directory "\\.mjs\\(?:\\.map\\|\\.macro-origins\\.json\\)?\\'" nil
                         (lambda (child)
                           (not (equal (file-name-nondirectory (directory-file-name child))
                                       "node_modules")))))
            (push (list (file-relative-name path eliscript-bootstrap-parity-root)
                        (file-modes path)
                        (or (file-symlink-p path)
                            (with-temp-buffer
                              (set-buffer-multibyte nil)
                              (insert-file-contents-literally path)
                              (secure-hash 'sha256 (current-buffer)))))
                  records)))))
    (sort records (lambda (left right) (string< (car left) (car right))))))

(defun eliscript-bootstrap-parity-run ()
  "Build both process strategies and require exact module/map/mode equality."
  (let ((default-directory eliscript-bootstrap-parity-root)
        (noninteractive nil))
    (load (expand-file-name "tools/backends/bootstrap.el") nil t))
  (let ((default-directory eliscript-bootstrap-parity-root)
        (started (float-time)) serial-seconds batch-seconds reference actual)
    (when (eliscript-bootstrap-parity-files)
      (error "bootstrap parity requires absent generated modules; run make clean-all first"))
    (message "Bootstrap parity: serial reference from maintained sources")
    (cl-letf (((symbol-function 'eliscript-backend-compile-tool-batch)
               (lambda (runtime _driver tools)
                 (let (failures)
                   (dolist (tool tools)
                     (let ((failure (eliscript-backend-compile-tool runtime tool)))
                       (when failure (push failure failures))))
                   failures))))
      (eliscript-backend-bootstrap t))
    (setq serial-seconds (- (float-time) started)
          reference (eliscript-bootstrap-parity-files))
    (with-temp-buffer
      (unless (zerop (call-process (expand-file-name "bin/eliscript-clean") nil t nil "--all"))
        (error "cannot clean serial reference outputs: %s" (buffer-string))))
    (message "Bootstrap parity: batch build; serial %.3fs, %d generated files"
             serial-seconds (length reference))
    (setq started (float-time))
    (eliscript-backend-bootstrap t)
    (setq batch-seconds (- (float-time) started)
          actual (eliscript-bootstrap-parity-files))
    (unless (equal reference actual)
      (let ((mismatches
             (cl-loop for record in reference
                      unless (equal record (assoc (car record) actual))
                      collect (car record))))
        (error "bootstrap outputs differ: serial=%d batch=%d; changed/missing=%S; extra=%S"
               (length reference) (length actual) mismatches
               (cl-loop for record in actual unless (assoc (car record) reference)
                        collect (car record)))))
    (princ (concat (json-serialize
                    `((format . "eliscript-bootstrap-process-parity")
                      (version . 1) (verification . "identical")
                      (files . ,(length actual))
                      (serialSeconds . ,serial-seconds)
                      (batchSeconds . ,batch-seconds)
                      (speedup . ,(/ serial-seconds batch-seconds)))) "\n"))))

(when noninteractive
  (condition-case failure
      (eliscript-bootstrap-parity-run)
    (error (message "Bootstrap parity: %s" (error-message-string failure)) (kill-emacs 1))))

;;; bootstrap-parity.el ends here
