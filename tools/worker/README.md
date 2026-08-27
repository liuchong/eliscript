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
terminated if synchronous JavaScript prevents the worker from responding.

Run the reference measurement probe with:

```sh
bun run benchmark:worker
```

Tune it with `ELISCRIPT_BENCHMARK_SIZE`, `ELISCRIPT_BENCHMARK_ROUNDS`, and
`ELISCRIPT_BENCHMARK_ITERATIONS`. The report is JSON so repeated runs can be
captured and compared without parsing display text.
