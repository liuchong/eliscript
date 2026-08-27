<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/pages/assets/eliscript-logo-light.png">
    <img src="docs/pages/assets/eliscript-logo.png" width="144" alt="Eliscript logo">
  </picture>
</p>

# Eliscript

Eliscript is an Emacs Lisp-flavored language that compiles to modern
JavaScript and React.

Website source: [`docs/index.html`](docs/index.html)

The seed compiler is written in Emacs Lisp and runs with plain Emacs, including
`emacs --batch`. It emits standard ECMAScript modules. Bun is the reference
JavaScript host for development and tests; generated modules do not depend on
Bun-specific syntax or APIs.

## Quick Start

Requirements:

- Emacs 29 or newer for compilation
- Bun 1.4 or newer for executing generated modules and running all tests

Compile and run the basic example:

```sh
./bin/eliscript --output dist/basic.mjs examples/basic/main.eli
bun run dist/basic.mjs
```

Generate an external Source Map v3 file when debugging generated code:

```sh
./bin/eliscript --source-map --output dist/basic.mjs examples/basic/main.eli
```

This writes `dist/basic.mjs.map` and adds its `sourceMappingURL` to the module.

Import portable sequence, text, object, and keyed-data libraries from an
Eliscript module handled by Vite or the project builder:

```elisp
(import "../../stdlib/sequence.eli" map filter reduce range)
(import "../../stdlib/text.eli" contains? strip-prefix trim)
(import "../../stdlib/object.eli" assoc pick)
(import "../../stdlib/data.eli" index-by group-by)

(map (lambda (value) (* value 2)) (range 1 5))
(trim (strip-prefix "#" "# Eliscript "))
(pick (assoc (object :name "Eliscript") :runtime "JavaScript")
      [:name :runtime])
```

The React examples use these source-module paths in production builds. Build
the same kind of local source graph without Vite and run its generated entry:

```sh
bun run build:stdlib-cli
bun run dist/project/examples/stdlib-cli/main.mjs
```

`bin/eliscript-build` recursively discovers relative `.eli` imports after
macro expansion, preserves the source tree, rewrites imports to `.mjs`, and
emits an external source map for every module.

Repeat builds reuse verified modules. Request a stable machine-readable summary
of cache and per-module decisions when integrating the builder with other tools:

```sh
./bin/eliscript-build --json --root . --out-dir dist/project \
  examples/stdlib-cli/main.eli
```

Without `--json`, the command continues to print only the generated entry path.

Portable libraries can compose across local source modules with an explicit,
named-only edge:

```elisp
(import-portable "./object.eli" assoc)
(defportable index-by (key-function values) ...)
```

Only the graph-aware project builder may extract that closure. Repeat
`--portable` to select entry names; every target is verified as `defportable`
and each emitted module is dependency-pruned:

```sh
./bin/eliscript-build --root stdlib --portable group-by \
  --out-dir dist/portable stdlib/data.eli
```

Run the complete test suite:

```sh
bun install --frozen-lockfile
bun run test
```

Compile and render the React counter example:

```sh
bun run compile:react-counter
bun run react-counter
```

Run the same component as an interactive browser application with Vite:

```sh
bun run dev:react-counter
```

Create a source-mapped production bundle with `bun run build:react-counter`.

Export Org articles as a deterministic ESM module or run the complete custom
publishing example:

```sh
bun run org:export
bun run dev:org-site
```

Create its static production bundle with `bun run build:org-site`.

Build the current compiler modules written in Eliscript:

```sh
bun run build:bootstrap
```

Use the generated self-hosted compiler through its Bun filesystem adapter:

```sh
./bin/eliscript-portable --output dist/basic-portable.mjs examples/basic/main.eli
```

Measure the long-lived Emacs-to-Bun worker boundary:

```sh
bun run benchmark:worker
```

Run the representative document-search adapter from Emacs:

```elisp
(require 'eliscript-index)

(let ((session (eliscript-index-start)))
  (unwind-protect
      (eliscript-index-search-sync
       session '(("intro" . "Emacs and JavaScript")) "javascript")
    (eliscript-index-stop session)))
```

Declare and compile one statically checked worker entry with only its
transitive dependencies:

```elisp
(defportable score-values (values)
  (length values))
```

```sh
./bin/eliscript --portable score-values --output dist/score.mjs source.eli
```

## Why

Emacs Lisp is a productive language for editing, automation, macros, and
content workflows, but the browser does not provide it as an application
runtime. Eliscript explores a smaller, deliberately designed language that
keeps the Lisp programming model while targeting the JavaScript ecosystem.

The project is especially interested in programmable publishing workflows:
Org content, user-defined macros, static site generation, and highly custom
React interfaces should be able to live in one coherent toolchain.

## Goals

- A compiler core implemented in Emacs Lisp with no Node.js dependency.
- A defined path from the Emacs Lisp seed compiler to a self-hosted compiler
  written in Eliscript.
- A portable execution layer that can move suitable Emacs workloads to fast
  JavaScript engines without replacing Emacs as the interactive host.
- Predictable ESM output that is readable and easy to debug.
- Lexical scope, first-class functions, macros, and familiar Lisp data forms.
- Direct interop with JavaScript modules, objects, promises, and browser APIs.
- A small React-oriented layer rather than a separate component runtime.
- First-class source maps and useful compiler diagnostics.
- Optional adapters for Vite and Org publishing, kept outside the core.

## Non-goals

- Full compatibility with Emacs Lisp or its dynamic runtime.
- Compiling arbitrary Emacs packages for the browser.
- Reimplementing Emacs in JavaScript.
- Hiding JavaScript semantics when explicit interop is clearer.

## Current Language

The first compiler accepts an Emacs Lisp-shaped lexical subset:

```elisp
(module example.basic
  (defun factorial (n)
    (if (<= n 1)
        1
      (* n (factorial (1- n)))))

  (print (factorial 5))
  (export factorial))
```

Implemented forms include:

- literals, symbols, keywords, vectors, quoted lists, and object literals
- `defvar`, `defconst`, `defun`, `defportable`, `lambda`, `let`, and `let*`
- `if`, `when`, `unless`, `cond`, `progn`, `while`, `and`, and `or`
- `setq`, arithmetic, comparisons, and basic list/vector operations
- portable `map`, `filter`, `reduce`, ranges, slicing, predicates, and search
  from `stdlib/sequence.eli`
- portable immutable association, merging, value transforms, selection, and
  omission from `stdlib/object.eli`
- portable keyed lookup, grouping, and counting from `stdlib/data.eli`
- ESM `module`, `import`, `import-portable`, `export`, and `export-default`
- compile-time `defmacro` with backquote, `&rest`, and `&body`
- `get`, `put`, `js-call`, `new`, and explicit `js*` interop
- React `defcomponent`, `jsx`, and `fragment` forms using the automatic JSX
  runtime

Eliscript already differs deliberately from Emacs Lisp: it is lexically scoped,
uses ECMAScript numbers and arrays, distinguishes `false` from `nil`, and emits
standard ESM. Full Emacs Lisp compatibility is not a goal.

## Repository Layout

```text
bin/                     Single-file and project command-line entry points
bootstrap/               Compiler modules written in Eliscript
  host/                  Thin runtime-specific filesystem adapters
compiler/                Emacs Lisp compiler implementation
docs/                    GitHub Pages website
runtime/                 Minimal JavaScript runtime helpers
stdlib/                  Portable Eliscript standard library
examples/                End-to-end example applications
  basic/                 Executable language example
  emacs-index/           Portable document scoring workload
  stdlib-cli/            Multi-file standard-library build
  react-counter/         First React compilation target
  org-site/              Org-powered custom React publishing site
specs/                   Numbered language and toolchain decisions
tests/                   Compiler fixtures and output snapshots
tools/                   Optional integrations and developer utilities
  org/                   Pure Emacs Org exporter and Vite adapter
  vite/                  Vite transform adapter for .eli modules
  worker/                Resilient Emacs worker and indexing adapter
```

## Compilation Pipeline

The current seed compiler is intentionally direct:

```text
.eli source -> Emacs reader -> macro expander -> lexical analyzer -> IR lowerer
            -> ESM + source-map emitter -> Bun or browser
```

ECMAScript and optional Source Map v3 files are emitted directly from IR. Every
mapping is driven by the source spans retained on IR nodes.

## Bootstrap Strategy

Eliscript will follow a staged self-hosting path:

```text
Stage 1: Emacs Lisp seed compiler
         compiler.el + program.eli -> program.js

Stage 2: Compiler rewritten in Eliscript
         compiler.el + compiler.eli -> compiler.js

Stage 3: Self-hosted compiler
         compiler.js + compiler.eli -> compiler.js
```

In the self-hosted stage, JavaScript is the executable form of the compiler,
not its maintenance language. Compiler development moves to `.eli` source,
while the Emacs Lisp implementation remains the readable bootstrap seed and a
reference implementation.

Self-hosting is accepted only when the seed compiler and the generated compiler
agree on language behavior, pass the same conformance suite, and reproduce a
stable normalized compiler artifact.

## Emacs Acceleration

Self-hosting creates a useful path back into Emacs. Portable Eliscript code can
be compiled to JavaScript and executed by a long-lived JavaScript worker, while
Emacs remains responsible for buffers, windows, commands, and editor state.

```text
Emacs
  -> editor-bound work stays in Emacs Lisp
  -> portable compute is compiled from Eliscript to JavaScript
  -> structured results return to Emacs
```

Likely candidates include parsers, syntax-tree transformations, content builds,
code indexing, data processing, and other mostly pure computations. The goal is
measured end-to-end improvement, including startup and communication overhead,
not an assumption that every function becomes faster outside Emacs.

See [specs/0001-language-and-toolchain.md](specs/0001-language-and-toolchain.md)
for the language and bootstrap boundary, and
[specs/0002-emacs-acceleration.md](specs/0002-emacs-acceleration.md) for the
portable execution model. The exact implemented subset is recorded in
[specs/0003-core-language-v0.md](specs/0003-core-language-v0.md).

## Status

The first Emacs Lisp seed compiler is implemented and usable from the command
line. M0 through M5 are complete. M6 includes portable sequence, text, object,
and keyed-data libraries plus graph-verified portable composition driven
entirely by Emacs.

Current evidence:

- `.eli` files compile to deterministic, readable `.mjs` modules.
- The compiler itself has no JavaScript runtime dependency.
- A lexical analyzer resolves module, function, and local bindings before
  emission; it rejects undeclared names, immutable assignment, duplicate
  declarations, invalid exports, and output identifier collisions.
- Trusted compile-time macros expand sequentially before analysis, support
  backquote and body parameters, and never appear in generated modules.
- Located forms preserve source spans through macro expansion and lexical
  analysis; compiler errors report filename, line, and column.
- An explicit IR separates declarations, bindings, control flow, calls, data,
  and JavaScript interop while retaining a span on every node.
- A dedicated IR backend emits ESM without reconstructing reader forms; a
  compatibility test keeps its output byte-identical to the seed formatter.
- Optional external Source Map v3 output maps generated expressions and
  structural names back to `.eli` source with UTF-16 columns; macro-generated
  code maps to its call site.
- React elements and fragments lower to explicit IR and emit through
  `react/jsx-runtime`; React-free modules receive no React import.
- The executable counter proves components, props and children, a hook, an
  event handler, conditional children, fragments, and an imported component.
- A pure `.eli` browser entry mounts the counter with `react-dom/client`; the
  Vite adapter preserves compiler source maps and composes with React Fast
  Refresh while keeping Vite outside the compiler core.
- A pure Emacs Org adapter validates article metadata, exports trusted HTML,
  assigns stable heading IDs, filters drafts, detects duplicate slugs, and
  emits deterministic ESM sorted by publication date.
- The Org Vite adapter exposes content as `virtual:eliscript-org`, watches
  nested `.org` sources, and invalidates the module during development.
- The custom Org site is written in Eliscript and proves React hooks, article
  navigation, responsive rendering, content HMR, and production bundling.
- The first portable compiler module is written in Eliscript, compiled by the
  seed to ESM, and matches seed identifier semantics over one shared
  conformance fixture, including Unicode and diagnostic cases.
- Portable syntax nodes replace Emacs runtime objects at the Generation 1
  reader boundary. The generated Eliscript reader matches normalized seed ASTs
  and diagnostics, then reads all bootstrap sources including itself.
- A lexical analyzer written in Eliscript consumes portable syntax directly,
  matches seed acceptance and exact diagnostics, and analyzes every bootstrap
  module including itself.
- A macro expander written in Eliscript interprets a deterministic macro
  language without host `eval`, matches seed syntax and spans, and feeds the
  portable analyzer directly.
- Portable IR and lowering modules written in Eliscript convert analyzed
  syntax into JSON-safe programs. Complete trees, properties, quoted data, and
  source spans match the seed across every one of the 43 IR node kinds.
- Portable ESM and Source Map emitters consume that IR without Emacs text
  properties. Their output is byte-identical to the seed across examples and
  all ten bootstrap modules, including Unicode mapping columns.
- A host-neutral compiler driver composes the complete in-memory pipeline. Its
  thin Bun adapter provides file and CLI operations without adding host APIs to
  the compiler core.
- The seed-built Generation 1 compiler reproduces all ten compiler modules and
  Source Maps byte-for-byte; that output compiles them again to the same fixed
  point.
- A versioned NDJSON worker keeps Bun alive behind an Emacs client, with
  correlated requests, progress, cancellation, timeouts, module caching,
  structured failures, mapped `.eli` runtime locations, automatic generation
  restart, and clean shutdown.
- The worker benchmark separates compile, startup, module load, execution,
  serialization, transport, and client costs. Its reference workload verifies
  equal results without treating a machine-specific speed ratio as a test gate.
- `defportable` entries are checked across their transitive immutable closure,
  compiled without unrelated declarations, exported through a source-name
  manifest, source-mapped by both compilers, and callable from Emacs without
  exposing generated JS identifiers.
- The Emacs indexing adapter tokenizes editor-owned text, builds a pruned
  `index -> data -> object` portable graph, dispatches scoring calls
  concurrently, preserves document order, and cleans up the generated tree and
  worker session.
- Every project build emits a deterministic `eliscript-project.json` with
  root-relative graph paths and SHA-256 source, ESM, Source Map, and whole-graph
  identities. The worker verifies the generated graph, restarts for
  dependency-only changes, and maps errors from imported modules.
- Verified manifest metadata now drives incremental builds. Standard projects
  skip unchanged modules entirely; portable projects reuse a clean graph or
  revalidate its closure before emitting only dirty modules. `--no-cache`
  remains available for forced builds.
- `eliscript-project-build-report` and `eliscript-build --json` expose a
  versioned graph summary with stable cache statuses, invalidation reasons, and
  per-module compiled or reused decisions without changing default CLI output.
- `stdlib/sequence.eli` supplies twelve non-mutating, higher-order sequence
  operations as dependency-prunable `defportable` declarations. The React
  browser entry imports it as source through Vite.
- `stdlib/text.eli` supplies thirteen literal, UTF-16-indexed string operations
  without regular expressions or host calls. The Org React site uses it with
  sequence `map` in its production source graph.
- `stdlib/object.eli` supplies eleven immutable own-property operations above
  three minimal portable primitives.
- `stdlib/data.eli` composes with the object module through verified portable
  imports and supplies keyed lookup, grouping, and counting. The Org React site
  prebuilds its slug lookup from this source module.
- `bin/eliscript-build` walks expanded IR imports, compiles each local `.eli`
  dependency once, preserves its root-relative path as `.mjs`, and emits a
  source map for every module without requiring Vite.
- Repeated `--portable NAME` options make the same builder verify every local
  `import-portable` target, reject bare or escaping source edges, and emit only
  each module's requested transitive closure.
- Eighty-six ERT tests cover reading, locations, macro expansion, analysis, IR
  lowering, direct emission, source maps, React, Org publishing, modules,
  bootstrap conformance, worker integration, errors, and interop.
- Eighteen Bun tests cover the compiler and Org Vite adapters, source-map
  handoff, file filtering, React Refresh, Org module invalidation, generated
  bootstrap behavior, the worker protocol, standard library, and benchmark
  reporting.
- CLI integration tests compare generated output with a checked-in snapshot
  and execute a recursively built standard-library project.
- Bun 1.4 executes generated modules and verifies recursion, mutation, loops,
  higher-order functions, objects, arrays, exports, React server rendering, and
  production Vite bundles, and deterministic Org publishing.

M5 is complete: the measured worker boundary, portable-function path, immutable
module cache, automatic restart policy, mapped runtime diagnostics, and
representative asynchronous indexing workload are integrated across Emacs,
Bun, and both compiler generations.

M6 is underway. Sequence, text, immutable object, and keyed-data libraries now
live in Eliscript source, remain statically portable, compile identically
through the seed and self-hosted compilers, and participate in Vite and
source-mapped module graphs. `import-portable` extends closure proof across
root-contained local modules; object behavior still rests on three minimal
portable primitives while indexing policy remains library code.
The Emacs indexing workload is the second production composition case: its
portable entry reuses `data/count-by`, and the long-lived worker executes the
resulting three-module closure rather than a copied single-file helper.
That project closure now carries an explicit build manifest, so module cache
identity and mapped diagnostics cover all three modules rather than only the
entry file.
The same manifest carries separately hashed incremental metadata, allowing
repeat builds to avoid compiler work without weakening runtime graph identity.

See [specs/0004-lexical-analysis.md](specs/0004-lexical-analysis.md) for the
implemented analyzer contract and
[specs/0005-compile-time-macros.md](specs/0005-compile-time-macros.md) for the
seed macro model, and
[specs/0006-source-locations.md](specs/0006-source-locations.md) for located
forms and diagnostic positions, and
[specs/0007-intermediate-representation.md](specs/0007-intermediate-representation.md)
for the explicit IR contract, and
[specs/0008-direct-ir-emission.md](specs/0008-direct-ir-emission.md) for the
direct ECMAScript backend, and
[specs/0009-source-maps.md](specs/0009-source-maps.md) for Source Map v3 output,
and [specs/0010-react-elements.md](specs/0010-react-elements.md) for React
element compilation, and
[specs/0011-vite-adapter.md](specs/0011-vite-adapter.md) for browser development
and production builds, and
[specs/0012-org-publishing.md](specs/0012-org-publishing.md) for deterministic
Org content modules and the custom React publishing site, and
[specs/0013-bootstrap-foundation.md](specs/0013-bootstrap-foundation.md) for
the first shared seed/portable compiler contract, and
[specs/0014-portable-syntax-reader.md](specs/0014-portable-syntax-reader.md) for
the serializable syntax model and self-reading Generation 1 reader, and
[specs/0015-portable-lexical-analyzer.md](specs/0015-portable-lexical-analyzer.md)
for direct portable syntax analysis and dual-implementation diagnostics, and
[specs/0016-portable-macro-expander.md](specs/0016-portable-macro-expander.md)
for deterministic host-independent macro evaluation, and
[specs/0017-portable-ir-lowering.md](specs/0017-portable-ir-lowering.md) for
JSON-safe IR construction and full seed/portable tree equivalence, and
[specs/0018-portable-emission.md](specs/0018-portable-emission.md) for direct
portable ESM and Source Map generation, and
[specs/0019-self-hosted-compiler.md](specs/0019-self-hosted-compiler.md) for the
portable driver, Bun adapter, and reproducible compiler fixed point, and
[specs/0020-worker-protocol.md](specs/0020-worker-protocol.md) for the long-lived
execution protocol and measurement boundary, and
[specs/0021-portable-functions.md](specs/0021-portable-functions.md) for
`defportable`, closure validation, generated manifests, and source-name worker
calls, and
[specs/0022-emacs-worker-integration.md](specs/0022-emacs-worker-integration.md)
for automatic worker generations, mapped diagnostics, cache policy, and the
document indexing adapter, and
[specs/0023-portable-sequence-library.md](specs/0023-portable-sequence-library.md)
for the first portable standard-library module and its sequence semantics, and
[specs/0024-project-builds.md](specs/0024-project-builds.md) for recursive local
source imports and generated ESM directory trees, and
[specs/0025-portable-text-library.md](specs/0025-portable-text-library.md) for
literal text operations and their indexing semantics, and
[specs/0026-portable-object-library.md](specs/0026-portable-object-library.md)
for immutable object operations and their primitive boundary, and
[specs/0027-portable-data-indexing.md](specs/0027-portable-data-indexing.md) for
keyed lookup, grouping, and counting, and
[specs/0028-portable-module-composition.md](specs/0028-portable-module-composition.md)
for graph-verified `import-portable` composition and project-level closure
builds, and
[specs/0029-portable-indexing-composition.md](specs/0029-portable-indexing-composition.md)
for the first multi-module portable graph executed by the Emacs worker, and
[specs/0030-project-graph-manifest.md](specs/0030-project-graph-manifest.md)
for deterministic graph identity, integrity checks, and dependency Source Maps,
and
[specs/0031-incremental-project-builds.md](specs/0031-incremental-project-builds.md)
for verified module reuse and conservative cache invalidation, and
[specs/0032-build-decision-reports.md](specs/0032-build-decision-reports.md)
for machine-readable build summaries and stable per-module decision reasons.

## License

Eliscript is free software licensed under the
[GNU General Public License, version 3 or later](LICENSE).
