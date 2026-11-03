;;; compile-historical-runtime.el --- Reproduce a pinned runtime asset -*- lexical-binding: t; -*-
(declare-function eliscript-compile-file-with-source-map "eliscript" (input output &optional options))
(let* ((args command-line-args-left)
       (root (file-name-as-directory (expand-file-name (nth 0 args))))
       (source (nth 1 args))
       (output (expand-file-name (nth 2 args)))
       (default-directory root))
  (unless (and (= (length args) 3)
               (member source '("stdlib/core/object.eli" "stdlib/core/protocol.eli" "stdlib/core/text.eli"))
               (file-in-directory-p output root))
    (error "Invalid historical runtime compilation arguments"))
  ;; --script is processed before -L actions by Emacs. Load the compiler from
  ;; the authenticated snapshot explicitly, never the current checkout.
  (add-to-list 'load-path (expand-file-name "compiler" root))
  (require 'eliscript)
  (make-directory (file-name-directory output) t)
  (eliscript-compile-file-with-source-map source output))
