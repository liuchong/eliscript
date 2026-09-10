<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/pages/assets/eliscript-logo-light.png">
    <img src="docs/pages/assets/eliscript-logo.png" width="144" alt="Eliscript logo">
  </picture>
</p>

# Eliscript

Eliscript is an Emacs Lisp-flavored language that compiles to modern
JavaScript. The seed compiler runs in plain Emacs, emits standard ECMAScript
modules, and bootstraps a compiler written in Eliscript itself.

[Website](docs/index.html) | [Core documentation](docs/README.md) |
[Specifications](specs/README.md) |
[Getting started](docs/getting-started.md) |
[Library API](docs/pages/api.html) |
[1.0 roadmap](specs/0040-maturity-roadmap.md) |
[Host and persistent-data design](specs/0041-host-symbiosis-and-persistent-data.md) |
[Evidence-derived progress](specs/0122-evidence-derived-maturity-progress.md) |
[Acceptance evidence](acceptance/README.md)

## Project Status

Eliscript has a working Emacs Lisp seed compiler, a reproducible self-hosted
compiler, self-hosted multi-file graph planning and incremental reuse,
persistent values, declarative immutable Record types, low-level `deftype` and
lexical `reify` protocol values, value-dispatching `case` and `condp` forms,
multi-arity named, anonymous, async, and portable functions, mutually recursive
local functions, protocols, and a long-lived
Emacs-to-JavaScript worker. The
repository also carries React, Org, and optional bundler probes as replaceable
application-level evidence. The project has completed all implementation units
in **M8: Language Contract Closure**, **M9: Compiler and Build Convergence**,
**M10: Daily Development Experience**, **M11: Standard and Platform
Libraries**, and **M12: Reliability, Security, and Performance**. Final
stability and acceptance remain open.

M13 has completed all 5 implementation units. The versioned
[core acceptance corpus](specs/0134-versioned-core-acceptance-corpus.md)
derives all 35 mandatory AC/PD criteria from their normative specifications,
runs the complete core suite and strict Emacs byte compilation from a clean
commit, and retains machine-readable and human-readable evidence. The current
audit records 25 passing, 10 incomplete, and zero failed criteria; its final
acceptance flag is therefore false. Application validations are listed
separately and contribute no core result.

The [local onboarding exercise](specs/0135-local-onboarding.md)
runs the documented core workflow directly on the recorded host toolchain. Its
retained report records all six steps passing within the active-step budget.
The [local compatibility migration rehearsal](specs/0136-local-compatibility-migration-rehearsal.md)
rebuilds frozen core source with both compiler generations, executes it under
Bun and Node, and verifies source-rewrite, automatic cache, and contract
replacement transitions. It excludes application evidence and leaves the final
AC-02 corpus closure open. The [complete core documentation set](docs/README.md)
now covers all eleven AC-23 categories, validates every local link, and executes
five marked language, macro, interop, configuration, and REPL examples directly
through maintained local commands. Canonical
[`acceptance/manifest.json`](acceptance/manifest.json) and
[`acceptance/report.md`](acceptance/report.md) now provide the final artifact
shape and preserve the current incomplete result. AC-24 and final 1.0
acceptance remain open until every mandatory criterion passes together.

M9 compiler convergence is complete: it includes canonical project requests,
graph planning, IR serialization, build reports, v1-to-v2 cache migration,
selective recompilation, cross-host Bun/Node cache reuse, and self-hosted public
single-file, single-entry project, and multi-entry project builds through one
versioned operation boundary. Version 2 project identity, reports, cache
validation, and worker loading preserve the version 1 single-entry contract.

M10's six implementation units are complete. The self-hosted compiler owns a
comment-preserving concrete-syntax formatter with fixed two-space/88-column
layout, byte-idempotence and ESM-semantic corpus evidence, plus one Bun/Node
`eliscript-format` command for stdout, atomic `--write`, and non-mutating
`--check`. The maintained Emacs major mode adds syntax, two-space indentation,
font locking, Imenu, balanced definition navigation, project discovery, and
transactional buffer formatting. A read-only `eliscript-check` operation now
validates complete configured source graphs in memory, accepts unsaved source
through stdin, emits deterministic Bun/Node reports, and feeds structured
diagnostics to Flymake. The public build also accepts one unsaved source through
stdin, and the Emacs mode builds the current buffer, saved file, or configured
project through compilation-mode without saving the buffer. Versioned
seed/self-hosted evaluation descriptors now drive one persistent Bun/Node
session with canonical value printing, source-mapped failures, atomic
namespace revisions, and framed output. The Emacs mode evaluates forms and
unsaved buffers, restores acknowledged project state after a host restart, and
stops sessions explicitly. The same session now powers a terminal REPL with
compiler-owned multiline input classification, persistent definitions and
macros, load/reload/reset commands, recoverable errors, and deterministic
prompt control. A separate `eliscript-watch` stream now reports canonical
content-level project changes under Bun and Node, and Emacs shares one watcher
per project to refresh Flymake diagnostics. The verified
[installation and daily development guide](docs/getting-started.md) now runs a
real framework-neutral project through format, check, build, Bun/Node execution,
diagnostics, terminal REPL, and Emacs mode discovery. The complete M10 matrix,
local onboarding exercise, and exit audit remain formal acceptance work.

M11's six implementation units are complete. Reviewed metadata classifies all
40 standard-library modules by role and owning specification; the generated
[API page](docs/pages/api.html) and machine-readable
[API index](docs/pages/api-index.json) expose all 536 checked exports. The
default contract gate rejects metadata, implementation, stability, or generated
artifact drift. Explicit [browser and worker capability packages](platform/README.md)
now grant only named host authority, inject request-scoped progress and
cancellation into the real worker, and re-export the canonical worker codecs.
The portable library also provides directly callable value-dispatched
multimethods with immutable derivation hierarchies, transitive preferences,
explicit ambiguity, and persistent state snapshots.
Compatibility stabilization and the final M11 exit audit remain open.

M12 reliability work now has all six implementation units complete. The
deterministic reader/program fuzz suite replays 100,000 grammar-aware and
complete-module mutation inputs with seed/self-hosted parity, recursive spans,
formatter round trips, structured diagnostics, and fixed identities. The
1,000-module project suite adds exact chain, diamond, cycle, and 299-importer
fan-out topology; 100 percent no-op reuse; one-module leaf and shared
invalidation; evaluated propagation; resource bounds; and complete clean-build
byte equivalence. See [0127](specs/0127-deterministic-reader-program-fuzz.md)
and [0128](specs/0128-project-scale-invalidation.md). The real Emacs worker now
also completes 100,000 uniquely verified requests across five generations with
cancellation, module replacement, timeout, process-death recovery, bounded peak
and steady-state RSS, clean shutdown, and complete PID reclamation. See
[0129](specs/0129-worker-lifecycle-soak.md). The hostile-boundary security
matrix now rejects direct and symbolic source-root escapes, undeclared macro
and worker authority, closed-schema mismatches, and generated output aliases
across Emacs seed, Bun, and Node paths while preserving protected inputs. See
[0130](specs/0130-hostile-boundary-security.md). The source-bound core
performance corpus now retains three independent compiler, project-build, real
Emacs worker, and persistent-data workload runs with exact correctness
identities and fixed regression budgets. See
[0131](specs/0131-source-bound-core-performance-baseline.md). The closed
repository-integrity contract now pins dependency boundaries, requires zero
third-party packages in core roots, reproduces generated outputs, checks
generator-owned API and workflow files, and validates the exact source-bound
benchmark inventory. See
[0132](specs/0132-repository-integrity-audits.md). The final quantitative M12
exit audit remains separate from implementation completion.

Run `bun run progress` for the current evidence-derived core progress report.
It reports implementation, verification, and stabilization independently;
application examples do not contribute to any core percentage.

The completed M8 language contract provides:

- immutable persistent List, Vector, Map, and Set implementations written in
  portable Eliscript
- an optimized frozen singly linked runtime List with constant-time front
  construction, complete suffix sharing, protocols, metadata, and canonical
  parenthesized data text
- deterministic value equality and hashing across persistent collections
- portable value-semantic Ok/Err records with branch combinators and
  stack-safe persistent-Vector traversal
- process-local weak identity hashing for efficient opaque JavaScript
  object/function keys and explicit native Symbol identity
- immutable persistent-Map metadata with root-only structural sharing,
  propagation through persistent/transient updates, and equality/hash exclusion
- canonical readable data text for both optimized runtime values and portable
  List/Vector/Map/Set values, with deterministic order, metadata, limits, and
  Bun/Node round trips
- synchronous Atom state references with value-semantic compare-and-set,
  old/new transition results, validators, commit-ordered watches, nested
  transition queuing, and explicit reentrancy rejection
- explicit shallow and deep conversion between persistent values and native
  JavaScript Array, plain object, Map, and Set containers
- open runtime protocols with direct and externally registered methods
- versioned transport-safe protocol definitions that rebuild fresh local
  dispatch identities without transferring functions or extension state
- generic collection lookup, traversal, reduction, construction, association,
  and key-presence operations
- direct key/value reduction over persistent and native indexed or associative
  values, with open protocol extension and allocation-light HAMT traversal
- reusable mapping, indexed mapping/keeping, filtering, removing, prefix
  take/drop, nth sampling, interposition, value-semantic deduplication,
  interleaving, stepped persistent-Vector partitioning, stack-safe tree
  traversal, sequential flattening, cat/mapcat, and bounded transducers with
  protocol-driven `transduce` and `into`
- replayable reduction-only views and `eduction` pipelines over finite or
  unbounded sources, with explicit ordered `run!` effectful consumption
- stack-safe one-level, pre-order, and post-order persistent tree rewriting
  across List, Vector, Queue, Map, Record, and Set values while native
  JavaScript containers remain explicit opaque leaves
- immutable zipper locations for stack-safe tree navigation, depth-first
  enumeration, local insertion, replacement, deletion, and persistent root
  reconstruction across generic, Vector, and List hierarchies
- owner-token transient Vector, Map, and Set builders with deterministic
  completion invalidation and transient-backed persistent `into`, with
  source-bound 13.474799x/17.156491x/19.092863x Vector/Map/Set builder evidence
- protocol, collection, transducer, and transient APIs exposed through
  Lisp-named Eliscript modules, with sequence and keyed-data algorithm bodies
  maintained in `stdlib/core/`
- generated protocol-driven text and keyed-object algorithms over String,
  ordinary Object, persistent/native Map, and external capability types
- stack-safe `loop`/`recur` for functions and lexical binding loops, including
  tail-position diagnostics, simultaneous pattern rebinding, and async support
- stable side-effect, named, default, namespace, default-plus-named, and
  default-plus-namespace ESM imports with seed/self-hosted and Bun/Node parity
- deterministic macro-generated symbols through `gensym` and trailing `$`
  template names, with explicit caller-capture and quote boundaries
- declared, root-contained UTF-8 macro file inputs with explicit read
  capability, SHA-256 build identity, deterministic cache invalidation, and
  seed/self-hosted Bun/Node parity
- first-class unqualified and qualified source Keyword values with canonical
  interning, hashing, persistent-Map keys, and explicit host-property syntax
- first-class quoted persistent List/Vector data and Symbol/Keyword values,
  with quoted brace forms retained as non-evaluated constructor syntax
- canonical `#{...}` and `(hash-set ...)` persistent Set expressions with
  value-semantic duplicate collapse and quoted constructor syntax
- structural-sharing and cross-host evidence through million-value workloads
- profile-guided self-hosted compiler improvements with source-bound reports,
  including direct binary comparisons, bounded reader character decisions,
  ordered Source Map cursors, and complete-compiler benchmarks
- a completed P4 transient/hot-path phase with retained semantic references,
  rejected low-impact candidates, and no application-tool maturity credit
- a completed P6 Emacs operation service with per-operation reference paths,
  workload thresholds, accelerated-result verification, cancellation, worker
  lifecycle ownership, stale-buffer guards, and transactional application
- a completed P7 performance reinvestment proof with three maintained Emacs
  analysis candidates, two selected transducer-backed workflows above 8x,
  source-bound crossover evidence, and a 200-request real-buffer soak

First-class immutable Keyword and Symbol values now have optimized and
portable representations that share equality, hashing, Map keys, and Set
membership. Symbols and persistent collections can carry immutable
persistent-Map metadata without changing their value identity or copying
collection internals. Optimized runtime List/Vector/Map/Set values and portable
List/Vector/Map/Set values now have matching canonical data-text
implementations, including cross-family byte parity over their common subset.
Atom state references now
separate changing application identity from immutable values while preserving
deterministic transition and watch behavior. Explicit native-container interop
now provides shallow-by-default conversion, deep graph conversion with sharing
preservation, structured cycle diagnostics, and a focused UI/JavaScript object
adapter.
Portable Result values now provide explicit success/failure data without a new
host class or identity boundary. Portable JSON now parses strict text directly
into persistent values and emits deterministic string-key order with Result
errors, cycle detection, and resource bounds. Portable numeric functions now
make Number, NaN, infinity, safe-integer, signed division, and checked-overflow
semantics explicit without host Math calls. The persistent collection core now
passes its complete cross-host million-value exit audit. Its deterministic
semantics corpus additionally executes 100,000 independently replayable
operation sequences for each of List, Vector, Map, and Set under Bun and Node,
checks 3,200,000 updates against reference models, and rechecks 14,400,000
retained histories. Protocol dispatch and
text/object algorithms are now maintained in Eliscript and checked against
generated production artifacts. Persistent `(vector ...)`, square-bracket
Vector literals, `(hash-map ...)`, brace Map literals, `(hash-set ...)`, and
`#{...}` Set literals now link through a standard ESM literal ABI. `js-array`,
`js-object`, `js-nth`, and `js-length`
make host-container construction and access explicit, while language-level
`nth` and `length` use collection protocols. Generic `dissoc` and `disj`
remove persistent or copied native values, while `peek` and `pop` expose
representation-appropriate List, Vector, and Array stack behavior. First-class source Keyword
expressions now construct canonical immutable runtime values while
Keyword-shaped host property keys retain explicit string-key behavior. Quote
now constructs canonical persistent List/Vector and identifier values instead
of mutable Arrays and strings. The first Emacs value-bridge slice now adds an
opt-in versioned worker codec for persistent values, metadata, exact nullish
and numeric categories, deterministic native containers, and portable
closures generated outside the package tree. The worker bridge now also
supports bounded value-event chunks, one-chunk request backpressure,
incremental progress and result streams, and cancellation during upload and
codec traversal. A source-bound 256 MiB real-process round trip now verifies
1,058 chunks in each direction within explicit Emacs, Bun, and combined RSS
budgets, completing the P5 value-bridge gate. Protocol-definition transport
now uses a strict versioned data descriptor with fresh local identities,
completing P2. A high-level operation service now makes reference and
accelerated paths explicit, verifies results before editor mutation, and owns
buffer versions, transactional application, cancellation, timeout, and worker
restart. The maintained Emacs index workflow uses this boundary, completing P6
and PD-09 without adding an application-framework dependency. The persistent
analysis package now keeps revisioned documents in one worker generation,
selects search and statistics at 9.679x and 8.267x median warm end-to-end
speedup over 30 runs, and discards intentionally stale buffer results. This
completes P7 and PD-10 without application-framework evidence. The persistent
Vector/Map/Set literal family is now complete;
static transient ownership analysis is enforced, and the P3 compatibility
freeze now removes the provisional `array`/`object` aliases in favor of the
stable explicit `js-array`/`js-object` boundary.

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

Build a complete local module graph directly:

```sh
./bin/eliscript-build --root . --out-dir dist/project \
  examples/stdlib-cli/main.eli
bun run dist/project/examples/stdlib-cli/main.mjs
```

Format one source file in place or check canonical formatting without writing:

```sh
./bin/eliscript-format --write examples/basic/main.eli
./bin/eliscript-format --check examples/basic/main.eli
```

Check a complete source graph without writing build outputs:

```sh
./bin/eliscript-check --json --root . examples/stdlib-cli/main.eli
```

Build a configured project with current unsaved source on standard input:

```sh
printf '(print 42)\n' | ./bin/eliscript-build \
  --config eliscript.json --stdin-file src/main.eli
```

Enable the maintained Emacs mode from this checkout:

```elisp
(add-to-list 'load-path "/path/to/eliscript/editor")
(require 'eliscript-mode)
```

Evaluate one form or load a complete source file through the generated
compiler:

```sh
./bin/eliscript-eval --eval '(+ 20 22)'
./bin/eliscript-eval --file examples/basic/main.eli --json
./bin/eliscript-eval --repl
```

The terminal REPL is also the default when no evaluation mode is supplied.
Use `:load FILE`, `:reload`, `:reset`, `:help`, and `:quit` while no multiline
form is pending. `--prompt` and `--no-prompt` make transcript presentation
explicit.

Observe source invalidations without a framework or development server:

```sh
./bin/eliscript-watch --config eliscript.json --json
./bin/eliscript-watch --root src
```

Pass multiple entries with an explicit root to emit one versioned union graph:

```sh
./bin/eliscript-build --root src --out-dir dist \
  src/main.eli src/admin.eli
```

`eliscript-build` uses the generated self-hosted compiler and bootstraps it when
absent. Set `ELISCRIPT_JS_RUNTIME=node` to run the same project service under
Node. Version 2 `eliscript.json` files use an `entries` array for the same
multi-entry operation; version 1 `entry` configurations remain compatible.

Run the default verification suite:

```sh
bun run test
```

Run the fixed 100,000-input reliability corpus directly with:

```sh
bun run fuzz:reader-program
```

Run the fixed persistent semantics corpus with 100,000 operation sequences per
collection family:

```sh
bun run fuzz:persistent-semantics
```

Run the fixed 1,000-module scale and invalidation suite with:

```sh
bun run scale:project
```

## Language Tour

Eliscript uses lexical scope and familiar Lisp forms while preserving an
explicit JavaScript host boundary:

```elisp
(module example.basic
  (defun factorial (n accumulator)
    (if (<= n 1)
        accumulator
      (recur (1- n) (* accumulator n))))

  (print (factorial 5 1))
  (export factorial))
```

Functions can select a fixed or variadic clause from the supplied argument
count while keeping `recur` local to the selected clause:

```elisp
(defun describe
  (() "empty")
  ((value) (str "one:" value))
  ((left right &rest remaining)
    (+ left right (length remaining))))
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

Portable identifiers and data text stay inside the same selected closure:

```elisp
(import "../../stdlib/identifier.eli" keyword)
(import "../../stdlib/data-text.eli" data-text-result-value print-value)
(import "../../stdlib/persistent-list.eli" persistent-list-from-array)

(data-text-result-value
 (print-value
  (persistent-list-from-array [(keyword "article/title") 1 2])))
```

Changing identity is explicit through Atom rather than collection mutation:

```elisp
(import "../../stdlib/state/atom.eli" atom deref swap-vals!)

(let ((counter (atom 0)))
  (swap-vals! counter (lambda (value) (1+ value))))
```

Persistent values cross into ordinary JavaScript only through explicit
adapters:

```elisp
(import "../../stdlib/interop/js.eli" from-js to-js to-js-object)

(let* ((state (from-js (js* "({items: ['left', 'right']})")
                       (js* "({deep: true})")))
       (props (to-js-object state (js* "({deep: true})"))))
  props)
```

Runtime-backed core values use the same Lisp-facing module style:

```elisp
(import "../../stdlib/core/identifier.eli"
        keyword symbol qualified-name)
(import "../../stdlib/core/metadata.eli"
        meta with-meta)
(import "../../stdlib/core/data-text.eli"
        print-value read-value)
(import "../../runtime/core/map.mjs" persistentHashMap)

(let* ((name (symbol "article" "title"))
       (annotated (with-meta name (persistentHashMap ["source" "tour"]))))
  [(keyword "article/title")
   (qualified-name name)
   (meta annotated)
   (read-value (print-value annotated))])
```

The implemented language includes:

- lexical functions, closures, optional and rest parameters, and nested vector
  binding patterns
- compile-time macros with deterministic expansion, generated symbols, and
  explicit capture rules
- expression-valued control flow, exceptions, async functions, and `await`
- stack-safe function and binding iteration through tail-position `recur`
- explicit IR lowering, structured diagnostics, and Source Map v3 output
- versioned canonical IR serialization with strict lossless validation
- ESM modules and framework-neutral JavaScript library interoperation
- statically checked portable functions and dependency-pruned builds
- persistent collections, value semantics, and open collection protocols
- persistent List, Vector, Map, and Set construction with explicit native
  container forms
- first-class immutable Keyword and Symbol values with qualified names
- immutable metadata on Symbols and persistent collections
- canonical readable text for optimized and portable persistent values
- synchronous Atom state with validators and ordered watch notifications
- native JavaScript container conversion with shallow/deep graph semantics

Eliscript deliberately differs from Emacs Lisp. It uses ECMAScript numbers,
distinguishes `false` from `nil`, has lexical scope, and does not attempt to run
arbitrary Emacs packages in JavaScript.

## Common Workflows

| Task | Command |
| --- | --- |
| Compile one source file | `./bin/eliscript --output dist/program.mjs source.eli` |
| Build a source graph | `./bin/eliscript-build --root . --out-dir dist source.eli` |
| Build current stdin source | `./bin/eliscript-build --config eliscript.json --stdin-file source.eli` |
| Format a source file | `./bin/eliscript-format --write source.eli` |
| Check source formatting | `./bin/eliscript-format --check source.eli` |
| Check a source graph | `./bin/eliscript-check --json --root . source.eli` |
| Evaluate one form | `./bin/eliscript-eval --eval '(+ 20 22)'` |
| Load one source namespace | `./bin/eliscript-eval --file source.eli --json` |
| Start a persistent terminal REPL | `./bin/eliscript-eval --repl` |
| Watch canonical project source changes | `./bin/eliscript-watch --config eliscript.json --json` |
| Request JSON diagnostics | `./bin/eliscript --diagnostic-format json source.eli` |
| Inspect build decisions | `./bin/eliscript-build --json --root . --out-dir dist source.eli` |
| Build the self-hosted compiler | `bun run build:bootstrap` |
| Compile with the generated compiler | `./bin/eliscript-portable --output dist/program.mjs source.eli` |
| Build all standard-library modules | `bun run compile:stdlib` |
| Start the React example | `bun run dev:react-counter` |
| Start the Org publishing example | `bun run dev:org-site` |
| Measure the Emacs worker | `bun run benchmark:worker` |
| Measure the core performance baseline | `bun run benchmark:core -- --output benchmarks/core-performance-macos-arm64.json` |
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
| [`editor/`](editor/README.md) | Maintained Emacs major mode and editor integration |
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
| How do I install Eliscript and complete the daily workflow? | [Installation and Daily Development](docs/getting-started.md) |
| What is the final project goal? | [Project Maturity Roadmap](specs/0040-maturity-roadmap.md) |
| How do persistent values and Emacs acceleration fit together? | [Host Symbiosis and Persistent Data](specs/0041-host-symbiosis-and-persistent-data.md) |
| Where is measured Emacs performance reinvestment specified? | [Emacs Analysis Performance Reinvestment](specs/0105-emacs-analysis-performance-reinvestment.md) |
| How is a versioned project build configured? | [Versioned Project Request Configuration](specs/0106-versioned-project-request.md) |
| How does the self-hosted compiler plan projects? | [Self-hosted Project Graph Planning](specs/0107-self-hosted-project-graph-planning.md) |
| How is compiler IR serialized reproducibly? | [Versioned Canonical IR Serialization](specs/0108-versioned-canonical-ir.md) |
| How are self-hosted build decisions reported? | [Self-hosted Build Decision Reports](specs/0109-self-hosted-build-decision-reports.md) |
| How does self-hosted incremental reuse work? | [Self-hosted Incremental Project Cache](specs/0110-self-hosted-incremental-project-cache.md) |
| How is the public project command self-hosted? | [Self-hosted Project Command and Configuration](specs/0111-self-hosted-project-command.md) |
| How do single-file and project commands share one operation? | [Unified Self-hosted Build Operation](specs/0112-unified-self-hosted-build-operation.md) |
| How are multi-entry project graphs identified? | [Versioned Multi-entry Project Identity](specs/0113-versioned-multi-entry-project-identity.md) |
| How is Eliscript edited in Emacs? | [Emacs Editor Integration](editor/README.md) |
| Which behavior is implemented or stable? | [Specification Catalog](specs/README.md#specification-catalog) |
| How does the seed compiler work? | [Compiler Guide](compiler/README.md) |
| How does self-hosting work? | [Bootstrap Compiler Guide](bootstrap/README.md) |
| What runtime APIs exist? | [Runtime Guide](runtime/README.md) |
| Which portable libraries exist? | [Standard Library Guide](stdlib/README.md) |
| How is browser or worker authority granted? | [Platform Package Guide](platform/README.md) |
| What are the exact current library exports? | [Generated Library API](docs/pages/api.html) |
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
- required onboarding sections, commands, and documentation entry points
- dependency boundaries and deterministic generated-artifact integrity

The versioned project contracts are:

| Contract | Design specification |
| --- | --- |
| [`contracts/public-surface.json`](contracts/public-surface.json) | [0044: Public Surface Registry](specs/0044-public-surface-registry.md) |
| [`contracts/library-api.json`](contracts/library-api.json) | [0125: Generated Library API Index](specs/0125-generated-library-api-index.md) |
| [`contracts/compatibility-matrix.json`](contracts/compatibility-matrix.json) | [0045: Continuous Compatibility Matrix](specs/0045-continuous-compatibility-matrix.md) |
| [`contracts/compatibility-baseline.json`](contracts/compatibility-baseline.json) | [0046: M7 Compatibility Baseline](specs/0046-m7-compatibility-baseline.md) |
| [`contracts/compatibility-rehearsal.json`](contracts/compatibility-rehearsal.json) | [0136: Local Compatibility Migration Rehearsal](specs/0136-local-compatibility-migration-rehearsal.md) |
| [`contracts/documentation.json`](contracts/documentation.json) | [0137: Complete Core Documentation Set](specs/0137-complete-core-documentation.md) |
| [`contracts/final-acceptance.json`](contracts/final-acceptance.json) | [0138: Versioned Final Acceptance Artifacts](specs/0138-versioned-final-acceptance-artifacts.md) |
| [`contracts/repository-integrity.json`](contracts/repository-integrity.json) | [0132: Repository Integrity Audits](specs/0132-repository-integrity-audits.md) |

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
- Direct JavaScript, browser, and package ecosystem interoperation.
- First-class Emacs editing and measurable JavaScript acceleration.

### Application Evidence

React, Org publishing, and optional bundler adapters are maintained only as
replaceable application-level proving grounds. They consume public compiler
and ESM boundaries; they do not define language semantics, compiler
architecture, runtime behavior, standard-library dependencies, core goals, or
1.0 language maturity.

In particular, Vite, React, blog and site generators, Pages hosting, and
development servers cannot appear in core acceptance evidence. Their removal
or replacement must leave the compiler, runtime, standard library, bootstrap
fixed point, and language conformance results unchanged.

### Non-goals

- Full compatibility with Emacs Lisp or its dynamic runtime.
- Compiling arbitrary Emacs packages for the browser.
- Reimplementing Emacs in JavaScript.
- Replacing ESM, UI libraries, or host package systems with proprietary
  equivalents.
- Hiding JavaScript semantics where explicit interoperation is clearer.

The mandatory 1.0 acceptance criteria are defined in
[specification 0040](specs/0040-maturity-roadmap.md#final-10-acceptance-standard).

## License

Eliscript is free software licensed under the
[GNU General Public License, version 3 or later](LICENSE).
