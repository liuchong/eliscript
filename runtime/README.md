# Runtime

This directory is reserved for the minimal JavaScript helpers referenced by
generated modules. Ordinary JavaScript values and APIs should be emitted
directly; helpers need a concrete semantic reason to exist.

The first compiler emits its small Lisp-truthiness helper directly into each
module. Shared runtime extraction is deferred until more than one semantic
helper justifies a module dependency.

React modules import `react/jsx-runtime` directly. There is no Eliscript wrapper
runtime for element construction.

`worker.mjs` is the reference long-lived compute host. It communicates over
versioned NDJSON, imports local generated modules, correlates concurrent
requests, and supports progress, cooperative cancellation, timeouts, structured
errors, module caching, and shutdown. Protocol stdout is isolated from module
logs, which are redirected to stderr.
