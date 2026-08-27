# Tests

Compiler behavior is tested from Emacs in batch mode. Source fixtures belong in
`fixtures/`; stable JavaScript output belongs in `snapshots/`.

`make test` runs the ERT suite, invokes the public CLI, compares the generated
ESM with its snapshot, validates and decodes Source Map v3 output, and executes
ordinary, source-mapped, and React server-rendered modules with Bun. It also
tests the Vite transform adapter and builds the browser counter with bundled
Eliscript source maps. Org publishing tests cover metadata, deterministic HTML,
draft and duplicate handling, the watched Vite content module, direct ESM
execution, and the production Org site bundle.

Bootstrap tests use shared JSON conformance fixtures. ERT runs the Emacs Lisp
seed implementation, while Bun compiles the corresponding `.eli` module,
imports its generated ESM, and checks the same cases. This keeps Generation 0
and Generation 1 behavior directly comparable as compiler phases migrate.
The portable reader comparison covers full normalized syntax trees, recursive
character-based spans, diagnostics, deterministic build artifacts, and all
current bootstrap sources. The generated reader must successfully read its own
`.eli` implementation.

The macro fixture compares complete expanded syntax and call-site spans, exact
diagnostics, deterministic macro evaluation, and recursive expansion. Every
valid result is then accepted by the generated lexical analyzer.

The analyzer fixture runs after both readers. It compares success and complete
diagnostic strings for scope resolution, declaration collisions, mutability,
imports, exports, and malformed special forms. Both analyzers must accept all
current bootstrap sources, including `analyzer.eli` itself.

The IR fixture runs the complete generated front end and lowerer, then compares
the resulting program with a normalized seed oracle. It covers every one of
the 43 public IR node kinds, JSON-safe quoted data and literal tags,
kind-specific properties, complete nested source spans, macro call origins,
and all ten bootstrap compiler modules.

The emitter fixture sends the same portable IR through the generated backend
and the Emacs seed backend. It compares complete ESM text and parsed Source Map
documents, checks signed Base64 VLQ boundaries and Unicode columns, and runs a
generated module in a fresh Bun process. The emitter and Source Map modules are
also part of the self-source fixture set.

The compiler-driver test builds Generation 1 with the Emacs Lisp seed,
Generation 2 with Generation 1, and Generation 3 with Generation 2. It compares
all ten ESM and Source Map artifacts byte-for-byte, checks the portable CLI
against seed output, and verifies mapped file output and located diagnostics.
It also compares seed and self-hosted `defportable` closure builds.

Standard-library tests compile `stdlib/sequence.eli` and `stdlib/text.eli` with
the seed and self-hosted compiler, compare complete JavaScript output, execute
importing ESM fixtures, inspect their source maps, and retain library sources
in React production bundle maps. ERT separately proves that selecting portable
`map` or `blank?` includes transitive helpers but excludes unrelated operations.

Project-build tests inspect expanded IR imports, retain non-Eliscript
specifiers, support cycles, enforce canonical root containment, and verify
per-module source maps. The public CLI builds and executes a three-module
source graph that crosses from `examples/` into two `stdlib/` modules without
Vite.

Worker tests compile one pure Eliscript workload, then exercise the Bun runtime
and Emacs client over real pipes. They cover framing, version negotiation,
request correlation, progress, cancellation, timeout, module logging,
serialization failures, immutable module caching, automatic restart,
source-mapped runtime errors, clean shutdown, equivalent results, and segmented
benchmark output. Both generated export names and manifest-backed Eliscript
operation names are exercised. A representative adapter concurrently scores
tokenized documents and preserves input order. Performance ratios are reported
but never asserted in CI.
