# 0020: Emacs Worker Protocol and Measurement Probe

- Status: Implemented
- Date: 2026-08-28
- Depends on: 0002 Emacs Acceleration Through JavaScript,
  0019 Self-Hosted Compiler Driver

## Summary

Eliscript protocol version 1 connects Emacs to a long-lived Bun compute worker
over newline-delimited JSON. Emacs retains editor state and process lifecycle;
the worker imports generated ESM and executes explicitly named functions over
JSON-compatible arguments.

```text
Emacs client -> NDJSON stdin -> Bun worker -> generated Eliscript module
Emacs client <- NDJSON stdout <- response, progress, or structured error
                             stderr <- module logs
```

The same slice provides a pure workload and an end-to-end benchmark that
separates runtime speed from compilation, startup, transport, and conversion
costs.

## Framing and Versioning

Each protocol message is one UTF-8 JSON object followed by a newline. Blank
lines are ignored and one line may not exceed 16 MiB. Every message contains
`version: 1`; an incompatible version receives a `version-mismatch` protocol
error.

On startup the worker sends:

```json
{"version":1,"type":"ready","capabilities":["request","progress","cancel","timeout","shutdown","module-cache","module-version"],"pid":123}
```

stdout is reserved for protocol frames. The worker redirects module
`console.log`, `console.info`, and `console.debug` output to stderr so ordinary
module logging cannot corrupt framing.

## Requests and Responses

A request carries a unique string id, local module path or file URL, generated
ESM export name, JSON argument array, and optional positive `timeoutMs`:

```json
{"version":1,"type":"request","id":"7","module":"/tmp/work.mjs","export":"score_values","arguments":[[1,2,3],4],"timeoutMs":30000}
```

Requests for statically checked modules may replace `export` with an Eliscript
source-level `operation` name. The worker resolves it only through the frozen
`__eliscript_portable__` manifest; exactly one of `export` and `operation` is
required. A missing operation returns `missing-portable`.

The worker accepts only local `file:` modules and caches import promises by
normalized URL and module version. `moduleVersion` is optional; without it the
worker derives a filesystem fingerprint. One module version is immutable
within a worker generation. A changed version receives
`module-version-changed`, and the Emacs client normally prevents that response
by restarting before it sends the request. Requests may execute concurrently
and responses may arrive out of order; the id is the sole correlation key.

Project requests may also provide `projectManifest`, naming a local
`eliscript-project.json`. Its graph digest becomes the module version, its
generated file digests are verified on cold load, and its complete Source Map
set covers imported-module stack frames. This contract is defined in
[0030-project-graph-manifest.md](0030-project-graph-manifest.md). Requests that
omit it retain single-file fingerprinting and mapping.

Successful responses contain `ok: true` and a JSON value. Failures contain
`ok: false` plus an error object with stable `code` and `message`, and optional
runtime name, stack, structured frames, and mapped Eliscript location. The
worker reads the module's external source map directly, so diagnostics do not
depend on runtime stack-map support. Unsupported return values such as
`undefined`, BigInt, or cyclic objects produce `serialization` rather than
damaging the stream.

## Progress, Cancellation, and Timeout

The worker appends a context object after the declared operation arguments.
JavaScript-backed operations can call `context.progress(value)` and inspect
`context.signal`; ordinary generated functions safely ignore the extra
argument.

```json
{"version":1,"type":"progress","id":"7","value":{"stage":"indexing"}}
{"version":1,"type":"cancel","id":"7"}
```

Cancellation and timeout race the operation promise against an AbortSignal.
They can interrupt cooperative asynchronous operations. Synchronous CPU work
blocks the JavaScript event loop and therefore cannot consume an in-process
cancel message. The Emacs client enforces a 250ms grace period after remote
timeout, then terminates the worker when necessary. The next request
automatically starts a fresh worker generation on the same client object; no
partial result is applied to editor state.

## Emacs Client

`tools/worker/eliscript-worker.el` provides:

- worker start, readiness negotiation, stderr capture, and graceful or forced
  stop
- asynchronous calls with result, error, progress, and timing callbacks
- synchronous calls for batch workflows and measurement
- request cancellation and client-side timeout enforcement
- buffering for arbitrarily split or coalesced process-filter chunks
- structured failure of all pending requests when the worker exits
- automatic restart after crashes, unresponsive timeouts, and module changes
- source-location extraction and human-readable mapped error formatting

JSON arrays cross the Emacs boundary as vectors, objects as alists, JSON false
as `:false`, and JSON null as nil. This is the initial transport representation,
not a promise of transparent Emacs object serialization.

## Timing Contract

Each worker response reports durations in milliseconds:

- `moduleLoadMs`
- `moduleCacheHit`
- `moduleVersion`
- `sourceMapLoaded`
- `sourceMapCount`
- `executionMs`
- `serializationMs`
- `workerMs`

The Emacs benchmark separately measures compiler time, worker startup, and the
send-to-callback duration. `warmTransportAndClientMedian` is the warm
end-to-end median minus worker time, so protocol overhead remains visible.

`bun run benchmark:worker` runs equivalent `score-values` implementations over
the same vector and verifies every checksum before reporting speed ratios. CI
uses a small smoke workload and asserts result and report structure only.

One local reference run with 20,000 values, 20 rounds, and five warm samples
measured an 83.1ms Emacs median, 9.7ms Bun execution median, and 38.1ms worker
end-to-end median. That is about 8.6x for computation and 2.18x end to end, with
about 28.3ms in transport and client work. These values are illustrative and
machine-specific; they prove why acceleration decisions must use coarse,
representative workloads rather than engine-only timings.

## Acceptance Evidence

The Bun integration test covers ready negotiation, malformed JSON, version
rejection, successful execution, timing fields, missing exports, progress,
cancellation, timeout, unserializable values, logging isolation, and shutdown.

The ERT integration test compiles the same Eliscript fixture, starts the real
worker, verifies result equivalence, receives progress, cancels a request,
checks structured failures and mapped runtime locations, and confirms stderr
framing. It also runs a synchronous blocking operation, proves the client
timeout terminates the stuck worker, then reuses the same client object to
execute another request. Additional ERT coverage rewrites an imported module
and verifies a transparent generation restart. Every test stops its own worker
in cleanup.

## Integration

Portable functions are specified in
[0021-portable-functions.md](0021-portable-functions.md). Automatic lifecycle,
source-mapped errors, cache policy, and the representative indexing workload
are specified in
[0022-emacs-worker-integration.md](0022-emacs-worker-integration.md).
