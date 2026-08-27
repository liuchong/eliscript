# Emacs Worker Adapter

`eliscript-worker.el` keeps one Bun process alive and exchanges protocol v1
NDJSON messages with `runtime/worker.mjs`. Load it from Emacs with the compiler
and worker directories on `load-path`:

```elisp
(require 'eliscript-worker)

(let ((worker (eliscript-worker-start)))
  (unwind-protect
      (eliscript-worker-call-sync
       worker "/absolute/path/to/module.mjs" "export_name" (list [1 2 3])
       :timeout-ms 5000)
    (eliscript-worker-stop worker)))
```

Generated `defportable` modules can be called by their Eliscript source name:

```elisp
(eliscript-worker-call-portable-sync
 worker "/absolute/path/to/module.mjs" "score-values" (list [1 2 3])
 :timeout-ms 5000)
```

`eliscript-worker-call` and `eliscript-worker-call-portable` are asynchronous
and accept result/error, progress, and timing callbacks.
`eliscript-worker-cancel` requests cooperative cancellation.
Remote timeouts are followed by a short client grace period; the process is
terminated if synchronous JavaScript prevents the worker from responding. The
same client object automatically starts a new generation on its next request.
Local module changes also trigger a generation restart, while unchanged
modules remain cached. Runtime errors expose mapped `.eli` locations through
`eliscript-worker-error-location` and `eliscript-worker-format-error`.

`eliscript-index.el` is the representative high-level integration. It compiles
the portable kernel in `examples/emacs-index/`, owns its temporary module and
worker, and scores tokenized documents concurrently:

```elisp
(require 'eliscript-index)

(let ((session (eliscript-index-start)))
  (unwind-protect
      (eliscript-index-search-sync
       session
       '(("compiler" . "Emacs compiler JavaScript")
         ("publishing" . "Org React publishing"))
       "emacs javascript")
    (eliscript-index-stop session)))
```

Run the reference measurement probe with:

```sh
bun run benchmark:worker
```

Tune it with `ELISCRIPT_BENCHMARK_SIZE`, `ELISCRIPT_BENCHMARK_ROUNDS`, and
`ELISCRIPT_BENCHMARK_ITERATIONS`. The report is JSON so repeated runs can be
captured and compared without parsing display text.
