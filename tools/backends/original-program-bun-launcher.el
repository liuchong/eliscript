#!/usr/bin/env -S emacs --script
;;; original-program-bun-launcher.el --- Original Bun argv transport -*- lexical-binding: t; -*-

(require 'json)

(let* ((launcher (or load-file-name (car command-line-args)))
       (configuration-file (concat launcher ".json"))
       (configuration
        (with-temp-buffer
          (insert-file-contents configuration-file)
          (json-parse-buffer :object-type 'alist :array-type 'list
                             :null-object nil :false-object :json-false)))
       (field (lambda (name)
                (let ((value (alist-get name configuration)))
                  (unless (and (stringp value) (> (length value) 0))
                    (error "Invalid original Bun launcher field: %s" name))
                  value)))
       (bun (funcall field 'bun))
       (preload (funcall field 'preload))
       (arguments command-line-args-left)
       (coding-system-for-read 'no-conversion)
       (coding-system-for-write 'no-conversion))
  (setenv "NODE_OPTIONS" (or (alist-get 'nodeOptions configuration) ""))
  (when (or (null (getenv "ELISCRIPT_ORIGINAL_PROGRAM_CONTEXT"))
            (equal (getenv "ELISCRIPT_ORIGINAL_PROGRAM_CONTEXT") ""))
    (setenv "ELISCRIPT_ORIGINAL_PROGRAM_CONTEXT" (funcall field 'configuration)))
  (setenv "ELISCRIPT_ORIGINAL_SOURCE_ROOT" (funcall field 'sourceRoot))
  (when (equal (car arguments) "--") (setq arguments (cdr arguments)))
  ;; Preserve the real executable, argument vector and stdin. This file is
  ;; copied byte-for-byte; only the adjacent JSON supplies per-case data.
  (with-temp-buffer
    (let ((status (apply #'call-process bun "/dev/stdin" (list t "/dev/stderr")
                         nil "--preload" preload arguments)))
      (princ (buffer-string))
      (kill-emacs (if (integerp status) status 1)))))
