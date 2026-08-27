# Emacs Index Workload

This example is a representative Emacs acceleration workload. Emacs extracts
plain text from buffers or publishing sources, tokenizes it, and sends explicit
document data to a long-lived JavaScript worker. The portable Eliscript kernel
scores documents without accessing editor state.

Use the higher-level adapter from Emacs Lisp:

```elisp
(require 'eliscript-index)

(let ((session (eliscript-index-start)))
  (unwind-protect
      (eliscript-index-search-sync
       session
       '(("compiler" . "Emacs hosts the compiler and JavaScript runs work.")
         ("site" . "Org publishing feeds a custom React site."))
       "compiler JavaScript")
    (eliscript-index-stop session)))
```

The adapter compiles only `score-document`, writes an external source map to a
temporary directory, reuses the module in one worker generation, and removes
all generated files when the session stops.
