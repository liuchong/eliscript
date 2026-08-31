# 0001: Language and Toolchain Boundary

- Status: Draft
- Implementation: In progress
- Date: 2026-08-27

## Summary

Eliscript is a Lisp-family language, hosted by Emacs during compilation, that
produces modern JavaScript modules. It borrows the interactive and macro-driven
spirit of Emacs Lisp without promising runtime compatibility with Emacs.

This specification defines the initial boundary of the language and the
compiler. It deliberately leaves surface syntax details open until a working
vertical slice can validate them.

## Motivation

The project needs a programmable publishing and application toolchain in which
Emacs is more than an editor or task runner. Emacs Lisp should be capable of
implementing the reader, macro system, analyzer, and emitter, while the
generated program should participate naturally in the browser ecosystem.

The practical target is similar in spirit to a Lisp-to-JavaScript compiler:
language semantics remain small and explicit, JavaScript interop is direct,
and React is consumed as a library rather than wrapped in a second framework.

## Design Principles

1. **Emacs is the compiler host.** A clean Emacs installation must be enough to
   compile Eliscript source to JavaScript.
2. **JavaScript is the runtime contract.** Generated code should use standard
   ESM and ordinary JavaScript values whenever possible.
3. **Semantics are specified, not inherited accidentally.** Eliscript may look
   familiar to Emacs Lisp users, but lexical scope and browser behavior are
   defined independently.
4. **Macros run before JavaScript emission.** Compile-time extension is a core
   capability, not a build-plugin afterthought.
5. **The runtime stays small.** Helpers are permitted only where direct output
   would be incorrect, unstable, or excessively repetitive.
6. **Generated code is inspectable.** Stable formatting, source maps, and clear
   symbol names matter from the first usable compiler.
7. **Self-hosting is a destination.** The Emacs Lisp compiler bootstraps an
   Eliscript implementation, which eventually becomes the primary compiler.

## Initial Source Model

The provisional source extension is `.eli`.

The reader should support these forms in the first language slice:

- `nil`, booleans, numbers, strings, symbols, and keywords
- lists for calls and special forms
- vectors for ordered data and destructuring
- maps for JavaScript object-shaped data
- quote and syntax-quote sufficient for macros
- comments and source locations on every parsed form

The analyzer should initially understand:

- lexical bindings
- function definitions and anonymous functions
- `if`, `do`, and `let`
- module imports and exports
- explicit property access and method calls
- JavaScript escape hatches for experiments

Exact spellings are provisional until the first end-to-end example is built.

## Macro Model

Macros execute at compile time through a deterministic interpreter. The seed
represents syntax values with native Emacs Lisp data while the self-hosted
compiler uses explicit syntax nodes; shared conformance fixes their observable
behavior, and expansion results pass through the normal analyzer.

The compiler must distinguish clearly between:

- compiler implementation code written in Emacs Lisp
- user macro code interpreted during compilation
- application code emitted as JavaScript

Arbitrary editor state must not become an implicit build input. Macro APIs
should receive explicit compiler context and declare file dependencies so that
incremental builds can remain deterministic.

## Module and JavaScript Interop

Eliscript modules compile one-to-one to ESM files in the first implementation.
Imports and exports should remain recognizable in generated output.

Interop must eventually cover:

- named, default, and namespace imports
- property reads and writes
- method invocation with correct receiver semantics
- construction with `new`
- async functions and promises
- JavaScript arrays and plain objects
- raw JavaScript as an explicit, narrowly scoped escape hatch

Name conversion between Lisp-style symbols and JavaScript identifiers is not
yet fixed. The emitter must keep a reversible mapping for diagnostics and
source maps regardless of the chosen convention.

## React Target

React support belongs in a library and macro layer above the language core.
Eliscript should emit ordinary React calls or JSX-compatible JavaScript rather
than implement its own reconciler.

The first React slice needs to prove:

- a function component
- props and children
- one hook call
- event handlers
- fragments and conditional children
- importing a third-party component
- browser refresh through an optional Vite adapter

The emitted module must also work without Vite when its imports can be resolved
by a browser import map.

## Compiler Pipeline

1. The reader converts source text into located forms.
2. The macro expander repeatedly expands user and standard macros.
3. The analyzer resolves bindings and validates special forms.
4. The lowering pass produces a small, documented intermediate representation.
5. The emitter writes formatted ESM and a source map.
6. Optional adapters hand the output to a dev server, bundler, or publisher.

Compiler phases should communicate through explicit data structures so each
phase can be tested independently and later replaced without rewriting the
whole compiler.

## Bootstrap and Self-hosting

The compiler will be developed in three generations.

### Generation 0: Emacs Lisp Seed

The seed compiler is implemented in Emacs Lisp and runs in interactive or
batch-mode Emacs. It establishes the reader, language semantics, IR, emitter,
diagnostics, and conformance suite. It compiles ordinary `.eli` programs to
ESM without requiring a JavaScript runtime during compilation.

### Generation 1: Eliscript Compiler

Once the language core is stable enough, the portable compiler phases are
rewritten in Eliscript. The Emacs Lisp seed compiler compiles this source:

```text
seed compiler + compiler.eli -> compiler.js
```

The resulting `compiler.js` runs on a JavaScript host and must compile the same
language subset as the seed compiler. Host-specific filesystem and process
operations live behind explicit adapters.

### Generation 2: Self-hosted Eliscript

The generated compiler compiles its own Eliscript source:

```text
compiler.js + compiler.eli -> next-compiler.js
```

At this point the compiler's implementation and maintenance language is
Eliscript, even though its executable representation is JavaScript. New
compiler behavior should normally be implemented in `.eli`, not handwritten
in the generated `.js` artifact.

Self-hosting is considered complete when:

- the seed and self-hosted compilers pass the same conformance tests
- both compilers produce equivalent output for the supported language subset
- a normalized `compiler.js` can compile `compiler.eli` reproducibly
- the newly generated compiler can repeat the process without semantic drift
- diagnostics and source locations remain useful across the bootstrap chain

The Emacs Lisp seed compiler remains in the repository after self-hosting. It
is the trusted bootstrap path, an independent reference implementation, and a
way to build Eliscript from a clean Emacs installation.

## Repository Boundaries

- `compiler/` owns the reader, expander, analyzer, IR, and emitter.
- `runtime/` owns JavaScript helpers referenced by generated modules.
- `stdlib/` owns portable libraries and macros available to user programs.
- `tools/` owns optional integrations such as Vite and Org publishing.
- `tests/fixtures/` stores source programs and expected diagnostics.
- `tests/snapshots/` stores stable generated JavaScript for review.

The core compiler must not depend on files in `tools/`.

## Roadmap

### M0: Vertical Slice (Complete)

- Read literals, symbols, calls, `if`, `let`, and functions.
- Compile one `.eli` file to readable ESM.
- Run compiler tests entirely in batch-mode Emacs.
- Compare emitted JavaScript with checked-in snapshots.

Completed on 2026-08-27. The generated module is also executed by Bun as part
of the CLI integration test.

### M1: Language Core (Complete)

- Harden the initial module forms and add lexical binding validation, macros,
  and source maps.
- Define the IR and public compiler diagnostics.
- Execute emitted modules in a JavaScript test runner.

Completed on 2026-08-28. Lexical binding validation, deterministic compile-time
macro expansion, recursively located forms, filename/line/column diagnostics,
explicit IR lowering, direct IR emission, output-name collision checks,
external Source Map v3 output, and JavaScript execution are implemented.

### M2: React (Complete)

- Add the React library and component macros.
- Compile and run the counter example.
- Add an optional Vite adapter with fast refresh where feasible.

Completed on 2026-08-28. `defcomponent`, `jsx`, and `fragment` compile through
dedicated IR nodes to the automatic JSX runtime. The counter example exercises
hooks, props, children, events, conditional children, fragments, an imported
React component, server rendering, browser mounting, production bundling, and
state-preserving React Fast Refresh through the optional Vite adapter.

### M3: Publishing (Complete)

- Add an Org publishing adapter.
- Compile article metadata and content into application-consumable modules.
- Build a fully custom static React site without introducing a blog framework.

Completed on 2026-08-28. A pure Emacs adapter validates Org metadata, exports
trusted HTML with stable heading IDs, filters drafts, detects duplicate slugs,
and emits deterministic ESM. A Vite virtual module watches article sources and
feeds a responsive React publishing site whose application code is written in
Eliscript. The command-line exporter and production bundle are covered by the
integration suite. See [0012-org-publishing.md](0012-org-publishing.md).

### M4: Bootstrap (Complete)

- Rewrite portable compiler phases in Eliscript.
- Use the Emacs Lisp seed compiler to produce the first `compiler.js`.
- Run one compiler conformance suite against both implementations.
- Reach a reproducible fixed point by compiling the compiler with itself.

Started on 2026-08-28. The first compiler module written in Eliscript owns
identifier mapping and is compiled to ESM by the seed compiler. The seed and
generated implementations consume one shared conformance fixture and agree on
valid names, diagnostics, reserved words, qualified references, and Unicode
code points. See [0013-bootstrap-foundation.md](0013-bootstrap-foundation.md).
The second slice adds serializable syntax nodes and a portable reader whose
complete ASTs and diagnostics match the normalized seed reader. It reads all
current bootstrap sources, including itself. See
[0014-portable-syntax-reader.md](0014-portable-syntax-reader.md).
The third slice adds a lexical analyzer written in Eliscript. It consumes the
portable syntax tree directly, matches seed acceptance and exact diagnostics,
and analyzes all current bootstrap sources including itself. See
[0015-portable-lexical-analyzer.md](0015-portable-lexical-analyzer.md).
The fourth slice adds a host-independent macro expander with a deterministic
syntax-value evaluator. Complete expanded ASTs, call-site spans, diagnostics,
and downstream analysis match the seed over one shared fixture. See
[0016-portable-macro-expander.md](0016-portable-macro-expander.md).
The fifth slice adds a JSON-safe IR model and a complete lowering pass written
in Eliscript. Seed and generated lowerers agree on every node, property,
quoted datum, and source span across all 53 IR kinds and all ten bootstrap
modules. See [0017-portable-ir-lowering.md](0017-portable-ir-lowering.md).
The sixth slice adds direct ESM and Source Map emitters written in Eliscript.
Seed and generated backends agree on complete JavaScript text and Source Map
documents, and the generated backend emits all ten compiler modules. See
[0018-portable-emission.md](0018-portable-emission.md).
The seventh slice adds the host-neutral compiler driver and thin Bun filesystem
adapter. The seed-built compiler produces a byte-identical Generation 2, which
in turn produces the same Generation 3 fixed point. See
[0019-self-hosted-compiler.md](0019-self-hosted-compiler.md).

Completed on 2026-08-28. The Emacs Lisp implementation remains the bootstrap
seed and executable reference, while normal compiler development can proceed in
Eliscript source.

### M5: Emacs Acceleration (Complete)

- Define a portable Eliscript subset for explicit, serializable computations.
- Run compiled modules in a long-lived JavaScript worker controlled by Emacs.
- Benchmark complete workloads, including transport and startup overhead.
- Keep editor-bound behavior in Emacs and apply worker results safely.

The detailed execution boundary is specified in
[0002-emacs-acceleration.md](0002-emacs-acceleration.md).

Started on 2026-08-28. Protocol version 1, the long-lived Bun worker, Emacs
client, cooperative cancellation, hard timeout recovery, and segmented
cold/warm benchmark are implemented. See
[0020-worker-protocol.md](0020-worker-protocol.md). `defportable`, transitive
dependency validation, closure-only compilation, generated manifests, and
source-name worker calls are also implemented in both compilers. See
[0021-portable-functions.md](0021-portable-functions.md).
Automatic worker generations, immutable module caching, portable source maps,
mapped runtime diagnostics, and the representative asynchronous document
indexing adapter complete the milestone. See
[0022-emacs-worker-integration.md](0022-emacs-worker-integration.md).

### M6: Standard Library (In Progress)

- Implement reusable facilities in Eliscript rather than compiler intrinsics.
- Keep standard modules host-independent and dependency-prunable.
- Prove source imports in browser builds and generated ESM imports in
  command-line builds.
- Grow sequence, object, text, and application-facing libraries from measured
  usage.

Started on 2026-08-28. The first sequence module implements twelve portable
operations, closure-only dependency selection, seed/self-hosted compiler parity,
standalone ESM execution, and import through the React/Vite example. See
[0023-portable-sequence-library.md](0023-portable-sequence-library.md).

The Emacs project builder now walks expanded IR imports, recursively compiles
root-contained `.eli` dependencies, preserves their directory tree as `.mjs`,
and emits a source map for every module. Its command-line example executes the
same sequence source graph without Vite. See
[0024-project-builds.md](0024-project-builds.md).

The second standard module implements thirteen portable text operations with
explicit UTF-16 indexing and no host string methods. It is consumed by the
standard-library CLI example and the Org React production site. See
[0025-portable-text-library.md](0025-portable-text-library.md).

The third standard module implements eleven immutable object operations above
three minimal portable primitives for own keys, own-property checks, and
shallow association. A fourth module adds keyed lookup, grouping, and counting,
then composes with object primitives through graph-verified portable imports.
The Org site prebuilds its slug index instead of scanning articles on every
hash change. See [0026-portable-object-library.md](0026-portable-object-library.md),
[0027-portable-data-indexing.md](0027-portable-data-indexing.md), and
[0028-portable-module-composition.md](0028-portable-module-composition.md).

The Emacs indexing workload is the second real consumer of portable module
composition. It builds term frequencies with `data/count-by`, causing the
project builder to select and execute a three-module `index -> data -> object`
graph in the worker. See
[0029-portable-indexing-composition.md](0029-portable-indexing-composition.md).

Project builds now publish deterministic graph manifests, verified incremental
metadata, stable per-module decision reports, and non-identity phase timings.
These make the same source graphs observable in workers, command-line builds,
CI, and editor integrations without coupling runtime identity to local
performance. See [0030-project-graph-manifest.md](0030-project-graph-manifest.md)
through [0033-build-phase-timings.md](0033-build-phase-timings.md).

### M7-M13: Project Maturity (Planned)

The next horizon turns the working language into a stable and sustainable
toolchain. It covers the compatibility contract, persistent immutable values,
protocols and transducers, compiler/build convergence, project configuration,
formatter and Emacs mode, interactive evaluation, cross-platform reliability,
real applications, and a formal all-or-nothing acceptance audit.

The complete staged construction plan and AC-01-through-AC-26 final gate are in
[0040-maturity-roadmap.md](0040-maturity-roadmap.md). The 32-way persistent
vector trie, HAMT maps and sets, transient builders, collection protocols,
value codec, and measured reinvestment into Emacs are designed in
[0041-host-symbiosis-and-persistent-data.md](0041-host-symbiosis-and-persistent-data.md),
with supplemental PD-01-through-PD-11 acceptance criteria.

## Non-goals for the Initial Implementation

- Emacs byte-code or native-comp compatibility
- dynamic scope compatibility
- transparent support for arbitrary Emacs Lisp packages
- self-hosting before the seed compiler semantics are stable
- package management
- server-side JavaScript runtimes as a compiler requirement

## Open Questions

The seed macro migration is resolved: both compiler generations now interpret
the same host-independent macro subset, and undeclared host functions are
rejected. See
[0035-deterministic-seed-macros.md](0035-deterministic-seed-macros.md).

The distinction between `nil`, JavaScript `null`, and `undefined` is resolved:
`nil` is the source spelling for JavaScript `null`, while strict and combined
predicates expose the boundary explicitly. See
[0034-nullish-values.md](0034-nullish-values.md).

1. Should maps read as `{...}` or use a Lisp-native constructor form?
2. How should Lisp kebab-case symbols map to JavaScript identifiers and object
   keys?
3. What explicit compiler context should declare file dependencies if macros
   eventually gain file access?

These questions should be resolved by small executable examples and follow-up
numbered specifications rather than by expanding this document indefinitely.
