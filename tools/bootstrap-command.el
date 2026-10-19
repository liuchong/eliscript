#!/usr/bin/env -S emacs --script
;;; bootstrap-command.el --- Public Emacs seed launcher -*- lexical-binding: t; -*-

(declare-function eliscript-bootstrap-launch-command "bootstrap-runtime" (root))

(let* ((script (file-truename (or load-file-name buffer-file-name)))
       (root (expand-file-name ".." (file-name-directory script))))
  (add-to-list 'load-path (expand-file-name "compiler" root))
  (add-to-list 'load-path (expand-file-name "tools" root))
  (require 'eliscript-bootstrap-runtime "bootstrap-runtime")
  (eliscript-bootstrap-launch-command root))

;;; bootstrap-command.el ends here
