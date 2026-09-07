# Emacs Worker Adapter

[Project README](../../README.md) | [Tools](../README.md) |
[Specification 0022](../../specs/0022-emacs-worker-integration.md) |
[Operation service 0104](../../specs/0104-accelerated-emacs-operation-service.md) |
[Performance reinvestment 0105](../../specs/0105-emacs-analysis-performance-reinvestment.md)

`eliscript-service.el` is the package-facing API. It declares generated
modules and dual-path operations, selects reference or accelerated execution
by workload threshold, optionally verifies worker results, and owns buffer
version checks, atomic application, cancellation, timeout, and worker restart:

```elisp
(require 'eliscript-service)

(let* ((operation
        (eliscript-service-operation
         'score-values #'my-emacs-score
         :portable-name "score-values"
         :workload-size (lambda (arguments) (length (car arguments)))
         :threshold 128))
       (service
        (eliscript-service-start
         (eliscript-service-module-declare
          "/absolute/path/to/generated.mjs"
          :project-manifest "/absolute/path/to/project.json")
         (list operation)
         :verify 'always)))
  (unwind-protect
      (eliscript-service-call-sync
       service 'score-values (list [1 2 3]) :timeout-ms 5000)
    (eliscript-service-stop service)))
```

Callers can pass `:path 'reference` or `:path 'accelerated` to force an
implementation. Async calls return a cancellable service request and accept
progress and timing callbacks. A target `:buffer` plus `:apply` callback makes
application conditional on an unchanged buffer and wraps edits in an atomic
change group.

Operations may declare `:worker-arguments` to project complete reference
arguments to a smaller accelerated request. Routing and verification still see
the complete values, and the projection must return a list.

## Worker Transport

`eliscript-worker.el` keeps one Bun process alive and exchanges protocol v1
NDJSON messages with `runtime/worker.mjs`. Load it from Emacs with the compiler
and worker directories on `load-path`. This lower-level API remains available
for transport implementations and diagnostics:

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

## Persistent Value Transport

Pass `:value-codec t` to preserve Eliscript List, Vector, Map, Set, Keyword,
Symbol, metadata, undefined, special Number, native Array, and native Object
categories. Add `:value-chunks t` for incremental bounded transport; chunking
implies the value codec and is available on synchronous, asynchronous, and
portable calls.

`eliscript-value-stream.el` exposes pull-based event and chunk encoders plus an
incremental decoder. Ordinary worker callers should use `:value-chunks t`
instead of constructing protocol frames. The client waits for each argument
acknowledgement, validates every progress and response sequence, and discards
partial values after cancellation or failure.

The value bridge is language and Emacs integration infrastructure. It does not
depend on a UI library, application framework, bundler, development server, or
publishing adapter.

`value-stream-probe.el` runs a complete chunked string round trip while
sampling Emacs and Bun RSS. `bun run probe:worker-values` uses a small default
dataset; specification 0090 provides the intentional 256 MiB acceptance
command and budgets. The JSON report includes exact request/response chunk
counts, SHA-256 correctness, timing, memory peaks, host versions, and measured
source digests.

`lifecycle-soak.el` is the complete long-lived worker acceptance runner. Run
`bun run soak:worker-lifecycle` to execute 100,000 uniquely checked requests in
batches of at most 64 while the same Emacs client crosses cancellation,
explicit restart, module replacement, blocking timeout, in-flight process
death, automatic recovery, and clean shutdown. It records forty fixed RSS
checkpoints plus denser peak observations, enforces absolute and steady-state
growth limits, and verifies all owned PIDs and temporary artifacts are gone.
Smaller `ELISCRIPT_WORKER_SOAK_REQUESTS` values are diagnostic only and cannot
qualify the acceptance report defined by specification 0129.

`eliscript-index.el` is the representative high-level integration. It compiles
the portable kernel in `examples/emacs-index/`, declares the generated module
and scoring operation, and lets the service own its worker while tokenized
documents are scored concurrently:

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

`eliscript-analysis.el` is the maintained performance reinvestment package. It
keeps a revisioned document snapshot in one worker generation, routes small
workloads to exact Emacs Lisp references, and exposes synchronous plus
buffer-safe asynchronous search and statistics. Run its source-bound evidence
with `bun run benchmark:emacs-analysis` and `bun run soak:emacs-analysis`.
