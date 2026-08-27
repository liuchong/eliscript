# 0002: Emacs Acceleration Through JavaScript

- Status: In Progress
- Date: 2026-08-27
- Depends on: 0001 Language and Toolchain Boundary

## Summary

Eliscript may act as a portable execution layer for Emacs. Code written in a
well-defined Eliscript subset can run inside Emacs during development or be
compiled to JavaScript and executed by a faster JavaScript engine for suitable
workloads.

This is a long-term consequence of self-hosting, not a requirement for the seed
compiler. Emacs remains the interactive host; JavaScript acts as an optional
compute runtime.

## Motivation

Emacs Lisp is exceptionally effective for editor integration and interactive
programming, but some compute-heavy workloads are a better fit for modern
JavaScript engines. A self-hosted Eliscript compiler already produces portable
JavaScript, so the same toolchain can allow Emacs applications to move selected
work outside the Emacs Lisp runtime.

Promising workloads include:

- Org, Markdown, and source document parsing
- syntax-tree and intermediate-representation transformations
- static site and asset metadata generation
- code indexing, dependency analysis, and search preparation
- large JSON-like data transformations
- concurrent network and background tasks
- compiler analysis and emission

## Boundaries

Eliscript does not attempt to replace the Emacs runtime or transparently
compile arbitrary Emacs Lisp.

The following behavior remains owned by Emacs:

- buffers, markers, overlays, text properties, and syntax tables
- windows, frames, minibuffers, keymaps, and interactive commands
- buffer-local variables and dynamically scoped editor state
- advice, hooks, process filters, and other identity-sensitive objects

Code sent to a JavaScript runtime should operate on explicit, serializable data
and return explicit results. Editor mutations happen after those results return
to Emacs.

## Execution Model

The initial model uses a long-lived worker rather than launching a JavaScript
process for every function call.

```text
Emacs command
  -> capture explicit input data
  -> send request to JavaScript worker
  -> execute compiled Eliscript module
  -> return value, diagnostic, or progress event
  -> apply result to Emacs state
```

The transport and JavaScript host are adapters. The latest stable Bun runtime
is the reference worker host because it combines a fast JavaScriptCore runtime,
ESM execution, package management, testing, and bundling in one tool. A browser
or embedded engine may later implement the same protocol. Bun does not become
a dependency of the core compiler.

Requests need:

- operation and module identity
- serializable arguments
- cancellation and timeout support
- structured diagnostics with source locations
- progress events for long-running work
- protocol version and capability negotiation

Protocol version 1 uses newline-delimited JSON with one object per line. It
defines ready, request, response, progress, cancel, protocol-error, and shutdown
messages. The wire contract contains only explicit JSON values and does not
expose JavaScript object identity. See
[0020-worker-protocol.md](0020-worker-protocol.md).

## Portable Subset

A function is eligible for remote execution only when all of its runtime
dependencies are available in the portable Eliscript standard library or are
passed through an explicit host capability.

Portable code should avoid:

- implicit access to mutable editor state
- dependence on Emacs object identity
- unrestricted evaluation of Emacs Lisp
- synchronous callbacks into the editor during a computation
- values that cannot cross the runtime boundary predictably

The top-level `defportable` declaration marks worker entries. The compiler
statically validates their transitive `defconst` and `defportable` dependency
closure, rejects mutable module state and host interop, emits a source-name
manifest, and can build a module containing only selected entries. See
[0021-portable-functions.md](0021-portable-functions.md).

## Performance Contract

JavaScript execution is not automatically considered an optimization. Every
accelerated workload must be measured end to end, including:

- worker startup and warm-up
- module loading and compilation cache hits
- serialization and transport
- JavaScript execution
- conversion and application of results in Emacs

Small editor operations should normally stay in Emacs Lisp. The worker is most
valuable for coarse-grained tasks whose computation dominates communication
cost. Benchmarks must compare equivalent behavior and representative data.

## Failure Model

Worker failure must not corrupt editor state. Emacs applies results only after
a request completes successfully or through an explicitly transactional update
path.

The host adapter must surface:

- compiler diagnostics
- runtime exceptions with Eliscript source locations
- cancellation and timeout outcomes
- worker termination and restart
- protocol incompatibility

Where practical, an operation may fall back to an Emacs implementation, but
fallback behavior must be explicit and covered by conformance tests.

## Relationship to Self-hosting

The bootstrap compiler and the acceleration worker share generated JavaScript,
source maps, portable data semantics, and host adapters. They remain separate
product capabilities:

- self-hosting means Eliscript is the compiler's maintenance language
- acceleration means Emacs delegates selected Eliscript computations to a
  JavaScript runtime

Self-hosting is complete. Acceleration now reuses generated modules while the
worker protocol and portable-function boundary mature independently.

## Roadmap

### A0: Measurement Probe (Complete)

- Select one pure, compute-heavy transformation.
- Implement equivalent Emacs Lisp and generated JavaScript paths.
- Measure cold, warm, transport, and execution costs independently.

The `score-values` workload now has equivalent Emacs Lisp and generated
Eliscript paths. Its benchmark reports compilation, worker startup, module
loading, execution, serialization, transport, client parsing, cold calls, and
warm calls separately.

### A1: Worker Protocol (Complete)

- Define request, response, progress, cancellation, and diagnostic messages.
- Maintain one long-lived local JavaScript worker.
- Add lifecycle handling and deterministic integration tests.

Protocol version 1 is implemented by `runtime/worker.mjs` and
`tools/worker/eliscript-worker.el`. Real-process tests cover framing, version
negotiation, progress, cancellation, timeouts, errors, logging isolation, and
shutdown.

### A2: Portable Functions (Complete)

- Define and statically validate the portable subset.
- Compile portable functions and their transitive dependencies as modules.
- Share conformance tests between Emacs and JavaScript execution.

The seed and self-hosted compilers now implement `defportable`, matching static
diagnostics, closure-only builds, IR metadata, and a generated ESM manifest.
Worker and Emacs clients can invoke manifest entries by Eliscript source name.

### A3: Emacs Integration

- Add ergonomic asynchronous calls from Emacs Lisp.
- Add module caching, source-mapped diagnostics, and worker restart.
- Validate the design with publishing, parsing, or indexing workloads.

## Open Questions

1. Should portable functions also have a directly executable Emacs backend?
2. Which parts of the worker protocol must also run unchanged in browsers?
3. Which data types cross the host boundary without explicit conversion?
4. How should capabilities such as filesystem and network access be granted?
5. Can source maps preserve useful Emacs buffer positions for unsaved code?
6. What speedup threshold justifies moving a workload out of Emacs?
