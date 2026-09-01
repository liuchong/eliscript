# Emacs Analysis Workloads

[Examples](../README.md) | [Project README](../../README.md) |
[Operation service](../../specs/0104-accelerated-emacs-operation-service.md) |
[Performance evidence](../../specs/0105-emacs-analysis-performance-reinvestment.md)

This example contains three coarse-grained Emacs acceleration candidates:
batch document search, per-document statistics, and corpus term frequencies.
The Emacs adapter owns text extraction and exact reference implementations;
the generated Eliscript module owns only explicit serializable computation.

Search and statistics construct their result vectors through composed
transducers and owner-token persistent builders. Frequency analysis constructs
a persistent Map before crossing the explicit native-object boundary. These
are language and Emacs integration workloads, independent of UI frameworks,
bundlers, publishing systems, and development servers.

The Emacs package transfers documents once per source revision and worker
generation. Warm search transfers only query plus revision; warm statistics
transfers only revision. Automatic routing keeps workloads below 16,000 source
characters in Emacs Lisp.

Use the package-facing adapter:

```elisp
(require 'eliscript-analysis)

(let ((session (eliscript-analysis-start)))
  (unwind-protect
      (eliscript-analysis-search-sync
       session
       '(("compiler" . "Emacs compiles Eliscript to JavaScript")
         ("runtime" . "Persistent values run in a warm worker"))
       "Emacs worker")
    (eliscript-analysis-stop session)))
```

Use `eliscript-analysis-search` or `eliscript-analysis-statistics` for
asynchronous package integration. Their `:buffer` and `:apply` arguments reject
stale results and apply successful edits atomically.
