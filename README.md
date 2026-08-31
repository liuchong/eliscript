<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/pages/assets/eliscript-logo-light.png">
    <img src="docs/pages/assets/eliscript-logo.png" width="144" alt="Eliscript logo">
  </picture>
</p>

# Eliscript

Eliscript is an Emacs Lisp-flavored language that compiles to modern
JavaScript and React. The seed compiler runs in plain Emacs, emits standard
ECMAScript modules, and bootstraps a compiler written in Eliscript itself.

[Website](docs/index.html) | [Specifications](specs/README.md) |
[1.0 roadmap](specs/0040-maturity-roadmap.md) |
[Host and persistent-data design](specs/0041-host-symbiosis-and-persistent-data.md)

## Project Status

Eliscript has a working Emacs Lisp seed compiler, a reproducible self-hosted
compiler, multi-file builds, React and Vite integration, Org publishing, and a
long-lived Emacs-to-JavaScript worker. The project is now in **M8: Language
Contract Closure**.

The current M8 work provides:

- immutable persistent List, Vector, Map, and Set implementations written in
  portable Eliscript
- deterministic value equality and hashing across persistent collections
- open runtime protocols with direct and externally registered methods
- generic collection lookup, traversal, reduction, construction, association,
  and key-presence operations
- reusable mapping, filtering, removing, taking, and dropping transducers with
  protocol-driven `transduce` and `into`
- owner-token transient Vector, Map, and Set builders with deterministic
  completion invalidation and transient-backed persistent `into`
- protocol-driven sequence and keyed-data algorithms returning persistent
  values, with Lisp-named Eliscript modules under `stdlib/core/`
- structural-sharing and cross-host evidence through million-value workloads

The next language boundary is portable protocol and core-algorithm definitions,
followed by measured object/text migration, literal migration, host conversion,
and the Emacs value bridge.

The authoritative project state lives in the
[specification registry](specs/README.md), not in an accumulating changelog in
this file.

## Quick Start

Requirements:

- Emacs 29 or newer
- Bun 1.4 or newer

Install dependencies, compile a source file, and execute the generated module:

```sh
bun install --frozen-lockfile
./bin/eliscript --output dist/basic.mjs examples/basic/main.eli
bun run dist/basic.mjs
```

Add `--source-map` to emit an external Source Map v3 file:

```sh
./bin/eliscript --source-map \
  --output dist/basic.mjs \
  examples/basic/main.eli
```

Build a complete local module graph without Vite:

```sh
./bin/eliscript-build --root . --out-dir dist/project \
  examples/stdlib-cli/main.eli
bun run dist/project/examples/stdlib-cli/main.mjs
```

Run the default verification suite:

```sh
bun run test
```

## Language Tour

Eliscript uses lexical scope and familiar Lisp forms while preserving an
explicit JavaScript host boundary:

```elisp
(module example.basic
  (defun factorial (n)
    (if (<= n 1)
        1
      (* n (factorial (1- n)))))

  (print (factorial 5))
  (export factorial))
```

Portable source modules can be imported directly:

```elisp
(import "../../stdlib/sequence.eli" map filter range)
(import "../../stdlib/persistent-vector.eli"
        empty-persistent-vector
        persistent-vector-conj
        persistent-vector-nth)

(map (lambda (value) (* value 2)) (range 1 5))

(persistent-vector-nth
 (persistent-vector-conj (empty-persistent-vector) "first")
 0
 nil)
```

The implemented language includes:

- lexical functions, closures, optional and rest parameters, and nested vector
  binding patterns
- compile-time macros with deterministic expansion
- expression-valued control flow, exceptions, async functions, and `await`
- explicit IR lowering, structured diagnostics, and Source Map v3 output
- ESM modules, JavaScript interop, React elements, and fragments
- statically checked portable functions and dependency-pruned builds
- persistent collections, value semantics, and open collection protocols

Eliscript deliberately differs from Emacs Lisp. It uses ECMAScript numbers,
distinguishes `false` from `nil`, has lexical scope, and does not attempt to run
arbitrary Emacs packages in JavaScript.

## Common Workflows

| Task | Command |
| --- | --- |
| Compile one source file | `./bin/eliscript --output dist/program.mjs source.eli` |
| Build a source graph | `./bin/eliscript-build --root . --out-dir dist source.eli` |
| Request JSON diagnostics | `./bin/eliscript --diagnostic-format json source.eli` |
| Inspect build decisions | `./bin/eliscript-build --json --root . --out-dir dist source.eli` |
| Build the self-hosted compiler | `bun run build:bootstrap` |
| Compile with the generated compiler | `./bin/eliscript-portable --output dist/program.mjs source.eli` |
| Build all standard-library modules | `bun run compile:stdlib` |
| Start the React example | `bun run dev:react-counter` |
| Start the Org publishing example | `bun run dev:org-site` |
| Measure the Emacs worker | `bun run benchmark:worker` |
| Measure HAMT layouts | `bun run benchmark:hamt-layout` |

The project builder follows relative `.eli` imports after macro expansion,
preserves the source tree, rewrites generated imports to `.mjs`, and emits a
source map for every module. Repeated builds reuse verified modules. Portable
builds additionally validate `defportable` closure boundaries:

```sh
./bin/eliscript-build --root stdlib --portable group-by \
  --out-dir dist/portable stdlib/data.eli
```

## Architecture

### Compilation Pipeline

```text
.eli source
  -> reader
  -> deterministic macro expansion
  -> lexical analysis
  -> explicit source-located IR
  -> ESM and Source Map emission
  -> Bun, Node.js, or browser
```

The Emacs Lisp compiler performs the seed build. The generated compiler uses
the same portable syntax, analysis, IR, and emission contracts without
depending on Emacs runtime objects.

### Bootstrap Path

```text
Generation 0: Emacs Lisp seed + compiler.eli -> compiler.js
Generation 1: compiler.js + compiler.eli     -> compiler.js
Generation 2: generated compiler repeats the same fixed point
```

JavaScript is the executable compiler artifact, while `.eli` remains the
maintenance source. The Emacs Lisp implementation stays as a readable
bootstrap and independent semantic oracle.

### Emacs Feedback Loop

```text
Emacs owns buffers, windows, commands, and editor state
  -> portable computation is compiled to JavaScript
  -> a long-lived worker executes explicit serializable workloads
  -> structured results return to Emacs
```

This boundary targets parsers, indexing, transformations, content builds, and
other coarse-grained computation. Performance claims include compilation,
startup, transport, and serialization costs; moving a function to JavaScript
is not automatically considered an improvement.

## Repository Guide

| Path | Purpose |
| --- | --- |
| [`bin/`](bin/) | Single-file, project, portable, and Org command-line entry points |
| [`compiler/`](compiler/README.md) | Emacs Lisp seed compiler |
| [`bootstrap/`](bootstrap/README.md) | Compiler implementation written in Eliscript |
| [`runtime/`](runtime/README.md) | JavaScript value, protocol, collection, and worker runtime |
| [`stdlib/`](stdlib/README.md) | Portable Eliscript standard library |
| [`examples/`](examples/README.md) | Executable language, React, Org, project, and Emacs probes |
| [`tools/`](tools/README.md) | Vite, Org, worker, conformance, and benchmark integrations |
| [`tests/`](tests/README.md) | ERT, Bun, fixtures, snapshots, and conformance evidence |
| [`benchmarks/`](benchmarks/README.md) | Reviewed performance evidence and host fingerprints |
| [`specs/`](specs/README.md) | Numbered design contracts and complete specification catalog |
| [`contracts/`](contracts/) | Public surface, compatibility matrix, and baseline registries |
| [`docs/`](docs/index.html) | Project website and GitHub Pages source |

## Documentation

Start with the document that matches the question:

| Question | Document |
| --- | --- |
| What is the final project goal? | [Project Maturity Roadmap](specs/0040-maturity-roadmap.md) |
| How do persistent values and Emacs acceleration fit together? | [Host Symbiosis and Persistent Data](specs/0041-host-symbiosis-and-persistent-data.md) |
| Which behavior is implemented or stable? | [Specification Catalog](specs/README.md#specification-catalog) |
| How does the seed compiler work? | [Compiler Guide](compiler/README.md) |
| How does self-hosting work? | [Bootstrap Compiler Guide](bootstrap/README.md) |
| What runtime APIs exist? | [Runtime Guide](runtime/README.md) |
| Which portable libraries exist? | [Standard Library Guide](stdlib/README.md) |
| What does the test suite prove? | [Test Guide](tests/README.md) |
| How are benchmark claims reviewed? | [Benchmark Guide](benchmarks/README.md) |

Every normative behavior belongs in a numbered specification. Directory
READMEs explain how to use or develop one subsystem; they do not replace the
specification contract.

## Development

Run the complete local gate:

```sh
bun install --frozen-lockfile
bun run test
```

Run contract checks alone:

```sh
bun run check:contracts
```

The contract checker validates:

- specification metadata and executable conformance ownership
- evidence locators in the default test target
- the public and internal surface inventory
- the stable, provisional, and planning compatibility baseline
- the generated GitHub Actions compatibility matrix

The versioned project contracts are:

| Contract | Design specification |
| --- | --- |
| [`contracts/public-surface.json`](contracts/public-surface.json) | [0044: Public Surface Registry](specs/0044-public-surface-registry.md) |
| [`contracts/compatibility-matrix.json`](contracts/compatibility-matrix.json) | [0045: Continuous Compatibility Matrix](specs/0045-continuous-compatibility-matrix.md) |
| [`contracts/compatibility-baseline.json`](contracts/compatibility-baseline.json) | [0046: M7 Compatibility Baseline 1](specs/0046-m7-compatibility-baseline.md) |

Run warning-as-error Emacs byte compilation with:

```sh
make byte-compile
```

Continuous integration covers Emacs 29.4 and 30.2 on Ubuntu x64 and macOS
arm64 with the pinned minimum Bun version in every matrix cell.

## Project Direction

### Goals

- A compiler core implemented in Emacs Lisp with no Node.js dependency.
- A self-hosted compiler maintained in Eliscript.
- Deterministic, readable, source-mapped ESM output.
- Persistent immutable values and protocol-oriented collection algorithms.
- Direct JavaScript, browser, React, and package ecosystem interoperation.
- First-class Emacs editing and measurable JavaScript acceleration.
- Optional Vite and Org adapters outside the language core.

### Non-goals

- Full compatibility with Emacs Lisp or its dynamic runtime.
- Compiling arbitrary Emacs packages for the browser.
- Reimplementing Emacs in JavaScript.
- Replacing React, ESM, or host package systems with proprietary equivalents.
- Hiding JavaScript semantics where explicit interoperation is clearer.

The mandatory 1.0 acceptance criteria are defined in
[specification 0040](specs/0040-maturity-roadmap.md#final-10-acceptance-standard).

## License

Eliscript is free software licensed under the
[GNU General Public License, version 3 or later](LICENSE).
