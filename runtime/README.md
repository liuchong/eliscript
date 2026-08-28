# Runtime

This directory contains the minimal JavaScript runtime semantics that cannot be
represented by ordinary host values alone. Ordinary JavaScript values and APIs
should still be emitted directly; helpers need a concrete semantic reason to
exist.

The first compiler emits its small Lisp-truthiness helper directly into each
module. Shared runtime extraction is deferred until more than one semantic
helper justifies a module dependency.

React modules import `react/jsx-runtime` directly. There is no Eliscript wrapper
runtime for element construction.

`core/vector.mjs` is the first provisional M8 persistent-value module. It
implements an immutable 32-way bit-partitioned vector trie with a short tail.
It is tested independently before vector literal behavior changes. Internal
node shape, allocation, visit, and sharing observations are isolated in
`testing/vector.mjs`; applications must not depend on those test adapters.

`core/value.mjs` defines provisional coercion-free value equality and unsigned
32-bit hashing. Portable scalar and persistent-vector hashes are deterministic;
opaque JavaScript objects retain process-local identity semantics. Persistent
hashes are cached privately. `testing/value.mjs` exposes cache and identity
counters only for conformance tests.

`core/map.mjs` builds on that key contract with a provisional persistent HAMT.
Sparse bitmap nodes promote to dense 32-slot nodes, dense nodes compact after
deletion, and complete 32-bit collisions retain distinct keys. Internal node
shape, transition, allocation, visit, and sharing evidence lives in
`testing/map.mjs`. Cross-engine measurements select promotion at 32 occupied
branches and demotion at 24; the versioned methodology and baseline live under
`tools/collections` and `benchmarks`.

`core/set.mjs` is a thin immutable value-semantic view over that HAMT. Members
occupy map keys under one private sentinel, so Set membership, algebra,
collisions, and path sharing cannot drift from Map behavior. Set-specific
shape and sharing evidence is adapted through `testing/set.mjs` without
exposing the backing map to applications.

`worker.mjs` is the reference long-lived compute host. It communicates over
versioned NDJSON, imports local generated modules, correlates concurrent
requests, and supports progress, cooperative cancellation, timeouts, structured
errors, module caching, and shutdown. Protocol stdout is isolated from module
logs, which are redirected to stderr. Requests may address a raw generated ESM
export or resolve a `defportable` source name through the module's frozen
`__eliscript_portable__` manifest.
