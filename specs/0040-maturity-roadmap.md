# 0040: Project Maturity Roadmap and 1.0 Acceptance Contract

- Status: Accepted
- Implementation: In progress
- Date: 2026-08-28
- Depends on: 0001 Language and Toolchain Boundary,
  0019 Self-Hosted Compiler Driver, 0022 Emacs Worker Integration,
  0024 Multi-file Project Builds
- Related design: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration

## Summary

This specification defines the long-term plan for turning Eliscript from a
successful language experiment into a mature, dependable project. It combines
four things that must remain aligned:

1. the final product goal
2. the target technical architecture
3. the staged construction plan
4. the mandatory acceptance standard for the 1.0 maturity baseline

The target is not broad Emacs Lisp compatibility and not a new JavaScript
application framework. The target is a stable, self-hosted Lisp-to-ECMAScript
toolchain with first-class Emacs workflows, direct access to the JavaScript
ecosystem, a deliberately small standard library, and enough engineering
quality to build and maintain real applications over time.

The 1.0 maturity baseline is reached only when every mandatory acceptance item
in this document has objective evidence. Milestone completion, feature count,
or elapsed time cannot substitute for the final acceptance gate.

## Current Baseline

Eliscript already has the difficult vertical foundations:

- an Emacs Lisp seed compiler with a located reader, deterministic macro
  expansion, lexical analysis, explicit IR, direct ESM emission, and Source
  Map v3 output
- a compiler written in Eliscript that reaches a byte-identical bootstrap
  fixed point
- direct JavaScript interop, asynchronous functions, exceptions, vector
  binding patterns, React element lowering, and Vite integration
- deterministic Org publishing into a custom React application
- multi-file project builds, project graph manifests, incremental cache
  decisions, and phase timing reports
- statically validated portable functions and a resilient Emacs-to-JavaScript
  worker protocol
- initial portable bit, sequence, text, object, keyed-data, and persistent
  vector modules
- shared seed/self-hosted conformance fixtures and end-to-end execution tests

This proves that the architecture is viable. It does not yet establish a
mature user contract. The main remaining gaps are:

- core collection literal and value semantics remain provisional until M8
- provisional mutable JavaScript arrays and objects still stand in for
  language-level vector and map values
- incomplete module interop and core data semantics
- compiler capabilities still split between the seed and self-hosted paths
- no canonical project configuration file
- no formatter, interactive REPL, or complete Emacs editing mode
- an intentionally small standard library without a documented stability
  classification
- insufficient malformed-input, fuzz, scale, soak, and security evidence
- no multi-project proving period or formal final acceptance report

The roadmap therefore prioritizes contracts, convergence, tools, reliability,
and real-world proof over rapid growth in surface syntax.

## Long-Term Objective

The long-term objective is:

> Eliscript is a stable, self-hosted, Emacs-first functional Lisp language and
> toolchain with persistent immutable values, direct host interop, and
> protocols for producing standard ECMAScript modules, React interfaces,
> programmable publishing systems, and portable high-performance Emacs
> workloads.

A user should be able to start from a clean machine, write a multi-module
Eliscript project, use JavaScript packages directly, receive source-level
diagnostics in Emacs, build deterministic ESM, run it in supported JavaScript
hosts or browsers, and maintain that project without depending on undocumented
compiler behavior.

A compiler contributor should be able to change the primary compiler in
Eliscript, prove behavior against the seed and conformance suites, reproduce
the compiler fixed point, and understand the compatibility impact before the
change is accepted.

## Meaning of Maturity

For this project, maturity has six independent dimensions. All six are
required.

### 1. Stable Language

The supported syntax, values, truthiness, binding, evaluation order, modules,
macros, JavaScript interop, errors, asynchronous behavior, and source mapping
are normative rather than accidental. Programs inside the compatibility
contract do not silently change meaning.

### 2. Authoritative Compiler

The compiler written in Eliscript is the normal implementation path. The
Emacs Lisp seed remains a trusted bootstrap and semantic reference, but users
do not encounter materially different language behavior depending on which
compiler built their program.

### 3. Dependable Toolchain

Single files and projects have documented commands, deterministic output,
machine-readable diagnostics, incremental builds, watch integration, project
configuration, and predictable host boundaries.

### 4. First-Class Emacs Experience

Eliscript is pleasant to edit as a Lisp in Emacs. Indentation, formatting,
navigation, compilation diagnostics, interactive evaluation, and worker
management are coherent parts of the project rather than private setup.

### 5. Proven Runtime Integration

Generated output is ordinary ESM. Browser, React, Org publishing, command-line
programs, and portable Emacs workloads are proven by maintained applications,
not only isolated compiler fixtures.

### 6. Sustainable Engineering

Specifications, compatibility policy, testing layers, performance baselines,
security boundaries, contribution workflow, and acceptance evidence make
continued development safer than rediscovering the design on every change.

## Product Boundaries

The following boundaries remain fixed through the maturity roadmap:

- Emacs Lisp compatibility is selective and explicit.
- Dynamic scope and arbitrary Emacs object compatibility are not goals.
- The compiler emits standard ESM and does not invent a proprietary runtime
  module system.
- React remains a library target; Eliscript does not own a reconciler or a web
  application framework.
- Org publishing remains an adapter over the compiler, not a mandatory part of
  the language core.
- Portable acceleration handles explicit serializable computation, not
  transparent migration of arbitrary editor state.
- A custom package registry is not required for 1.0. Local `.eli` modules and
  standard JavaScript package imports are sufficient.
- Static typing, native-code emission, and full Emacs package compilation are
  outside the 1.0 acceptance scope.

These exclusions protect the central value of Eliscript: Lisp programmability
with a direct, inspectable JavaScript boundary.

## Hosted Lisp Design Track

The language should improve its hosts rather than merely resemble their
syntax. The project adopts the broad hosted-language strategy demonstrated by
Clojure on the JVM and ClojureScript on JavaScript:

- keep the host platform and its libraries directly reachable
- make immutable persistent collections the default composite values
- define generic algorithms through protocols instead of class hierarchies
- use structural sharing and controlled transient mutation for performance
- separate value, identity, and time-varying state
- preserve an interactive development loop

Eliscript applies these principles to its own constraints. JavaScript ESM,
promises, browsers, React, Bun, and Node remain explicit platform facilities.
Emacs retains editor identity and interaction while delegating coarse-grained
portable computation. The concrete vector trie, HAMT, transient, transducer,
interop, value-codec, and Emacs reinvestment design is specified in
[0041-host-symbiosis-and-persistent-data.md](0041-host-symbiosis-and-persistent-data.md).

## Target Architecture

### Contract Layer

The language specification and executable conformance corpus are the source of
truth. Each normative feature has:

- a numbered specification with status and compatibility notes
- positive and negative source fixtures
- expected diagnostics where invalid input is involved
- seed and self-hosted compiler evidence where both implementations apply
- runtime evidence when the feature has observable JavaScript behavior

Specifications use `Draft`, `Accepted`, `Stable`, or `Superseded` status.
`Stable` behavior belongs to the 1.0 compatibility contract. A stable feature
may be extended compatibly; an incompatible change requires a superseding
specification, a migration note, and a deprecation path when one is possible.

The public contract includes source syntax, diagnostics schema, generated ESM
semantics, project configuration, build reports, worker protocol, and standard
library behavior. Internal IR layout is versioned for tools but may evolve
behind explicit schema versions.

### Compiler Layer

The canonical pipeline remains:

```text
source text
  -> located syntax
  -> deterministic macro expansion
  -> lexical and semantic analysis
  -> versioned canonical IR
  -> ESM fragments and source mappings
  -> JavaScript module plus Source Map v3
```

Each phase has one documented input and output schema and cannot read files,
environment variables, editor state, or process state implicitly. Host access
is supplied through adapters or declared capabilities.

The self-hosted compiler owns normal language development. The seed compiler
has three long-term responsibilities:

1. establish Generation 1 from a clean Emacs installation
2. provide an independent semantic oracle for stable language behavior
3. diagnose bootstrap regressions when the generated compiler cannot build

New stable language behavior must not live indefinitely in only one compiler.
During convergence, a feature slice is incomplete until parity is restored or
the specification explicitly narrows the seed's reference scope.

### Host Adapter Layer

The in-memory compiler has no filesystem or process dependency. Host adapters
own:

- reading source and configuration
- canonical path resolution and containment
- output and cache writes
- package and asset resolution delegated to the selected JavaScript tool
- watch events
- terminal presentation
- process lifecycle

Bun remains the reference JavaScript development host. A Node.js LTS adapter
is added to prove that generated ESM and the self-hosted compiler do not depend
on Bun-only language behavior. Browser execution is verified through Vite and
standards-based ESM output.

### Project and Build Layer

Projects gain one optional `eliscript.json` file. Command-line flags continue
to work and override configuration. The initial schema contains:

- schema version
- source root and one or more entries
- output directory
- source-map policy
- development or production mode
- portable entry selections
- declared macro file dependencies and capabilities
- adapter-specific options in namespaced objects

The builder consumes expanded imports, constructs one canonical graph, and
uses content-addressed private cache metadata. Single-file compilation becomes
a one-module project operation internally so diagnostics, configuration, and
reporting do not diverge.

Build outputs remain deterministic with respect to declared inputs. Public
manifests contain portable paths and content identities; machine-local timing
and cache observations remain reports rather than artifact identity.

### Runtime and Worker Layer

Ordinary generated programs use JavaScript values and need no general
Eliscript runtime. Focused helpers are allowed only for semantics that cannot
be emitted clearly or correctly inline.

The worker remains a separate optional product surface. It uses a versioned,
capability-negotiated protocol and immutable module generations. Filesystem,
network, clock, randomness, and process access are denied to portable code
unless granted through a typed host capability. Cancellation and timeout
outcomes are observable and cannot partially mutate Emacs state.

### Library Layer

Libraries are divided into three stability groups:

- `core`: portable value and collection operations required by ordinary
  programs and the compiler
- `platform`: explicit browser, React, worker, or host adapter facilities
- `experimental`: useful APIs that are not yet in the compatibility contract

Compiler intrinsics are added only when a library implementation cannot
preserve semantics, diagnostics, or performance. Every core library operation
documents mutation behavior, equality, indexing units, error behavior, and
portable dependency closure.

### Developer Tool Layer

The mature toolchain contains:

- one canonical command surface for compile, build, check, format, run, and
  interactive evaluation
- a deterministic formatter that is idempotent and preserves comments
- an Emacs major mode with indentation, font locking, navigation, compilation
  integration, and interactive commands
- a long-lived REPL/evaluation session with source-mapped errors
- stable JSON diagnostics for editor and CI integrations
- a documented Vite adapter and public transform contract

An LSP server is optional for 1.0. The diagnostic and project APIs must avoid
blocking one later, but Emacs integration is the required first-class editor
experience.

### Evidence Layer

Tests are organized by the claim they prove:

- unit tests for individual compiler and library behavior
- shared differential fixtures for seed/self-hosted parity
- golden tests for diagnostics, IR schemas, ESM, and source maps
- runtime tests against supported JavaScript hosts
- project tests for graph, cache, path, and configuration behavior
- integration tests for Emacs, Vite, React, Org, and worker workflows
- property and fuzz tests for readers, expanders, analyzers, and configuration
- scale, performance, and soak suites outside the fast development loop

Every acceptance run writes a machine-readable manifest and a human-readable
report under an acceptance-results directory. Generated evidence does not
replace the stable source fixtures used by normal tests.

## Workstreams

The roadmap is executed through six workstreams. Milestones may advance them
in parallel, but each has one owner in the architecture.

| Workstream | Owns | Does not own |
| --- | --- | --- |
| Language | semantics, specifications, compatibility corpus | host I/O |
| Compiler | phase implementations, IR, emission, bootstrap | project policy |
| Toolchain | CLI, config, project graph, cache, watch | language semantics |
| Experience | formatter, Emacs mode, REPL, diagnostics UI | compiler shortcuts |
| Libraries | portable and platform APIs | hidden compiler behavior |
| Quality | matrices, fuzzing, scale, performance, acceptance evidence | feature design |

## Delivery Horizon

The plan is sized for roughly 12 to 24 months of sustained development. The
dates are directional; milestone exit gates, not calendar dates, control
progress. Tooling and documentation work can overlap with compiler convergence
after the relevant contracts are stable.

## Milestone Plan

### M7: Contract Baseline (4-6 weeks)

**Objective:** Convert the current implementation history into an explicit,
testable compatibility baseline.

**Deliverables:**

- a specification status index and feature inventory
- a versioned conformance manifest mapping features to fixtures and tests
- normalized JSON diagnostic schema
- documented public versus internal interfaces
- automated documentation consistency checks
- continuous checks on macOS and Linux with supported Emacs versions

**Construction steps:**

1. Enumerate every reader form, special form, declaration, IR node, CLI, report
   schema, adapter, and standard-library export.
2. Resolve contradictions and stale counts in existing documentation.
3. Mark normative specifications `Stable`; leave incomplete surfaces `Draft`.
4. Add a fixture manifest with stable feature identifiers.
5. Wrap diagnostics as structured code, severity, message, file, and span while
   retaining readable terminal text.
6. Add CI jobs for formatting checks, byte compilation, ERT, Bun tests,
   bootstrap fixed point, and CLI integration.
7. Publish one generated coverage matrix in test output so an untested stable
   feature fails the contract check.

**Exit gate:** Every currently supported public behavior has a specification
owner and executable evidence; the complete existing suite passes on macOS and
Linux without undocumented setup.

Started on 2026-08-28. The first slice separates design and implementation
status across every numbered specification, indexes all specifications in a
versioned registry, maps every implemented specification to named contract
statements and executable evidence, and runs a dependency-free checker before
the default test suite. The checker also has negative tests for metadata drift,
missing evidence, evidence outside the default suite, and uncovered
implementations. See
[0042-specification-registry.md](0042-specification-registry.md).

The second slice defines the version 1 diagnostic object, stable category
codes, public Emacs accessors and serializers, human compatibility rules, and
`--diagnostic-format json` across the seed compiler, project builder, and
self-hosted Bun driver. Analyzer failures now agree across both compiler
generations without changing the reproducible fixed point. See
[0043-structured-diagnostics.md](0043-structured-diagnostics.md).

The third slice inventories language and macro forms, all IR kinds, commands,
schemas, adapters, standard-library exports, and Emacs interfaces in a
versioned public-surface registry. Exact implementation comparisons and known
documentation assertions now fail the default contract target on drift. Both
contract checkers print generated domain matrices. See
[0044-public-surface-registry.md](0044-public-surface-registry.md).

The fourth slice defines a versioned compatibility matrix for Emacs 29.4 and
30.2 across Ubuntu 24.04 x64 and macOS 15 arm64. A deterministic renderer owns
the pinned GitHub Actions workflow, and the shared strict byte-compilation
entry promotes warnings to errors while always removing generated bytecode.
Local contract tests reject missing matrix cells, mutable Action revisions,
weakened commands, and workflow drift. Remote matrix results remain required
before the M7 platform exit gate is satisfied. See
[0045-continuous-compatibility-matrix.md](0045-continuous-compatibility-matrix.md).

The fifth slice freezes Compatibility Baseline 1 without freezing the current
mutable collection representation. Twenty-eight specifications and features
whose semantics survive the planned M8 migration are stable; fifteen
implemented compiler, collection, and standard-library surfaces remain
explicitly provisional; three roadmap specifications remain planning work.
The default checker derives and compares every classification in both
directions. The complete suite and strict byte compilation pass on all four
declared remote matrix cells. These results satisfy the M7 exit gate. See
[0046-m7-compatibility-baseline.md](0046-m7-compatibility-baseline.md).

**M7 status:** Completed on 2026-08-28. M8 work may now change only provisional
surfaces unless it follows the stable compatibility-change process.

### M8: Language Contract Closure (8-12 weeks)

**Objective:** Finish the small language needed for real applications, then
freeze the core surface against accidental changes.

**Deliverables:**

- persistent list, vector, map, and set semantics with explicit native
  JavaScript container interop
- complete binding, function, control-flow, exception, and async contracts
- `loop`/`recur`, integer bit operations, value equality, and stable hashing
- named, default, namespace, and side-effect ESM imports
- explicit property, method, constructor, promise, and raw-JavaScript interop
- deterministic macro dependency declarations, `gensym`, and capture rules
- stable equality, mutation, evaluation-order, and error behavior

**Construction steps:**

1. Implement and measure the persistent vector trie and HAMT prototypes from
   0041 before changing literal behavior.
2. Specify equality, hashing, collection identity, and state independently of
   host accidents.
3. Make vector, map, and set literals persistent values while retaining
   explicit native JavaScript constructors and conversions.
4. Complete import forms and verify receiver-preserving method calls.
5. Add `loop`/`recur`, macro-generated-name support, and declared file
   dependency APIs.
6. Create negative fixtures for every malformed special form, binding edge,
   transient escape, and host conversion.
7. Implement each slice in seed and self-hosted compilers before starting the
   next stable slice.
8. Run all stable fixtures through execution, not emission comparison alone.

**Exit gate:** The stable language reference has no unresolved semantic
question required by the maintained applications, and seed/self-hosted results
match across the complete stable corpus.

**M8 status:** Underway since 2026-08-28. The first provisional slice is the
32-way persistent vector trie in
[0047-persistent-vector-prototype.md](0047-persistent-vector-prototype.md),
including generated reference-model checks and one-million-value structural
bounds. Scalar and vector value semantics now have frozen Bun/Node hashes,
recursive equality, collision evidence, and a private immutable-value cache in
[0048-value-equality-and-hashing.md](0048-value-equality-and-hashing.md).
The HAMT Map prototype now adds bitmap, dense, and full-hash collision nodes,
threshold transitions, structural sharing, and million-key bounds in
[0049-persistent-hash-map-prototype.md](0049-persistent-hash-map-prototype.md).
The Map-backed persistent Set in
[0050-persistent-hash-set-prototype.md](0050-persistent-hash-set-prototype.md)
adds a distinct unordered value category, collection algebra, exact path
sharing, collision coverage, and million-member bounds without duplicating
HAMT nodes. The source-bound Bun/Node/Chrome benchmark in
[0051-hamt-layout-benchmark.md](0051-hamt-layout-benchmark.md) replaces the
initial inherited 16/8 sparse/dense transition with measured 32/24 thresholds.
The seed and self-hosted compiler paths now expose exact portable 32-bit
operations, while `stdlib/bit.eli` proves population count and rotations in
[0052-portable-32-bit-operations.md](0052-portable-32-bit-operations.md).
The complete 32-way trie in `stdlib/persistent-vector.eli` now supplies the
implementation-language proof in
[0053-eliscript-persistent-vector.md](0053-eliscript-persistent-vector.md): seed
and self-hosted artifacts are byte-identical, Bun and Node reports agree, and
generated history plus million-value structural bounds pass. This closes the
0041 P0 semantics-and-prototype phase. P1 is next: converge list, vector, map,
and set into one Eliscript-authored core with shared equality, hashing,
metadata, printing, reading, and property evidence before literal migration.
The first P1 slice is the independent linked List in
[0054-eliscript-persistent-list.md](0054-eliscript-persistent-list.md). It adds
constant-time front operations, complete suffix identity, generated histories,
and million-node iterative evidence. List and Vector now provide concrete,
contrasting capability sets for protocol design; Map/Set migration and shared
value semantics remain open.

### M9: Compiler and Build Convergence (8-12 weeks)

**Objective:** Make the self-hosted compiler the normal complete toolchain
implementation while preserving the seed as a trustworthy bootstrap.

**Deliverables:**

- self-hosted project graph discovery and portable closure selection
- one shared project operation behind single-file and multi-file commands
- versioned `eliscript.json` configuration
- Bun and Node.js LTS host adapters
- canonical phase APIs and versioned IR serialization
- reproducible compiler and project artifacts across supported hosts

**Construction steps:**

1. Extract host-neutral project graph and closure algorithms into `.eli`
   modules.
2. Keep path and filesystem operations behind small host adapters.
3. define and validate `eliscript.json` with unknown-key diagnostics.
4. Route existing CLIs through one project service and preserve compatibility.
5. Implement the Node.js adapter against the same in-memory compiler API.
6. Compare seed, Bun-hosted, and Node-hosted results for the stable corpus.
7. Version IR and build-report schemas; add migration readers where persisted
   cache data requires them.
8. Make clean bootstrap, ordinary builds, and portable builds independently
   reproducible.

**Exit gate:** All normal user builds can use the self-hosted compiler; the
seed is no longer the only implementation of a user-facing build capability.

### M10: Daily Development Experience (10-14 weeks)

**Objective:** Make Eliscript comfortable for sustained daily development,
especially inside Emacs.

**Deliverables:**

- deterministic formatter and format-check command
- Emacs major mode
- project-aware check command with stable JSON diagnostics
- source-mapped interactive evaluation and REPL session
- watch API consumed by the Vite adapter and Emacs mode
- installation and troubleshooting documentation

**Construction steps:**

1. Define formatting from located syntax, including comments and reader forms.
2. Prove formatter idempotence and semantic preservation over the corpus.
3. Add font locking, syntax tables, indentation, imenu, beginning/end-of-defun,
   and comment behavior to the Emacs mode.
4. Connect project diagnostics to `compile-mode` or Flymake without parsing
   human terminal prose.
5. Add compile buffer/file/project and jump-to-source commands.
6. Add a persistent evaluation session with explicit namespace and reload
   behavior.
7. Unify file watching so Vite, Emacs, and command-line watch mode consume the
   same invalidation events.
8. Test unsaved-buffer compilation through virtual source input without making
   it an undeclared filesystem dependency.

**Exit gate:** A developer can create, navigate, format, check, evaluate,
build, and debug a project from Emacs using documented project commands.

### M11: Standard and Platform Libraries (8-12 weeks)

**Objective:** Supply a coherent small library surface sufficient for the
reference applications without turning convenience functions into compiler
intrinsics.

**Deliverables:**

- stable persistent list, vector, map, set, sequence, text, data, numeric,
  result, and JSON modules
- collection protocols, transient builders, and composable transducers
- documented module and export index
- explicit browser and worker capability packages
- a thin React package above the element compiler contract
- dependency-prunable portable closures for all core modules

**Construction steps:**

1. Audit existing operations for naming, mutation, equality, Unicode, and
   error consistency.
2. Implement focused collection protocols with direct and externally
   extensible JavaScript dispatch.
3. Implement owner-token transient builders and transducer-based pipelines.
4. Classify exports as core, platform, or experimental.
5. Add only operations exercised by the compiler or maintained applications.
6. Specify JSON and persistent/native conversion behavior at the JavaScript
   boundary.
7. Move higher React conveniences into library macros and functions.
8. Test every core export individually, through source import, through the
   project builder, and through portable closure selection where eligible.
9. Generate API reference data from explicit module metadata rather than
   scraping implementation text.

**Exit gate:** The maintained applications contain no private replacement for
a generally required core operation, and every stable export has behavioral
and portability evidence.

### M12: Reliability, Security, and Performance (8-12 weeks)

**Objective:** Demonstrate that the toolchain remains correct under malformed
input, large projects, long-lived use, and hostile project boundaries.

**Deliverables:**

- grammar-aware and mutation fuzz suites
- project scale and incremental invalidation suite
- worker soak and recovery suite
- explicit macro and worker capability security model
- benchmark corpus with stored methodology and regression thresholds
- dependency and generated-artifact audit commands

**Construction steps:**

1. Fuzz reader termination, span validity, printer round trips, and diagnostic
   determinism.
2. Mutate valid programs and assert controlled diagnostics rather than host
   stack traces.
3. Generate project graphs with chains, diamonds, cycles, wide fan-out, and
   1,000 modules.
4. Measure clean, no-op, leaf-change, and shared-dependency rebuild behavior.
5. Run worker cancellation, restart, module replacement, and timeout scenarios
   for an extended soak period.
6. Enforce root containment and capability denial with symlink and path attack
   cases.
7. Record cold and warm compiler, build, worker, and representative workload
   timings on a declared reference machine.
8. Set regression budgets only after three stable baseline runs.

**Exit gate:** All quantitative reliability and performance requirements in
the final acceptance matrix pass without an unexplained waiver.

### M13: Real-World Proving and Acceptance (6-10 weeks)

**Objective:** Prove the complete system through maintained use, then perform
the formal maturity audit.

**Deliverables:**

- three maintained reference applications
- one clean-machine onboarding exercise
- one compatibility migration rehearsal
- complete architecture, language, tools, library, and troubleshooting docs
- machine-readable and human-readable 1.0 acceptance reports

The three required applications are:

1. a multi-page Org-authored React publishing site with production build,
   source maps, assets, and browser interaction
2. a multi-module command-line or data-processing application using JavaScript
   package interop and the core standard library
3. an Emacs integration that delegates two coarse-grained portable workloads
   to the worker and safely applies results in the editor

**Construction steps:**

1. Build every application only through public commands and documented APIs.
2. Keep them in continuous tests and use them during ordinary development.
3. Record all missing APIs and remove application-local compiler workarounds.
4. Follow the getting-started guide on a clean supported environment and fix
   every undocumented prerequisite.
5. Rebuild a corpus written against the frozen compatibility baseline and
   document any intentional migration.
6. Run the complete acceptance matrix and retain exact environment metadata.
7. Resolve every mandatory failure and rerun the whole matrix from a clean
   checkout.

**Exit gate:** Every mandatory acceptance criterion below passes in one clean,
traceable acceptance run.

## Construction Protocol

Every implementation slice follows this order:

1. Write or update the numbered specification.
2. Add positive, negative, and boundary fixtures.
3. Implement the smallest complete vertical behavior.
4. Restore seed/self-hosted parity where the contract requires both.
5. Add runtime or integration proof for observable behavior.
6. Update public documentation and examples.
7. Run focused tests, the full suite, strict Emacs byte compilation, bootstrap
   fixed-point checks, and repository hygiene checks.
8. Record the milestone evidence before marking the slice implemented.

A slice is not complete when only parsing, only emission, only one compiler,
or only a happy-path example works. Generated files never become the source of
truth.

## Dependency Order

The critical path is:

```text
contract inventory
  -> language closure
  -> compiler/build convergence
  -> formatter + Emacs mode + REPL
  -> library stabilization
  -> scale/security/performance proof
  -> real-world proving
  -> final acceptance audit
```

Safe parallel work is limited to:

- CI and documentation after the contract inventory exists
- Emacs mode font locking/navigation while formatter semantics are designed
- library additions that do not depend on unresolved language semantics
- benchmark harness construction before regression thresholds are selected

## Risk Management

### Dual-Compiler Drift

**Risk:** New features are implemented twice and diverge.

**Control:** Shared fixtures are written first; the self-hosted compiler becomes
primary; seed scope is explicit; parity is a feature exit gate.

### Language Surface Expansion

**Risk:** Familiar Emacs Lisp or JavaScript features are added faster than they
can be specified and supported.

**Control:** New syntax requires a maintained application need, a specification,
and full evidence. Library solutions are preferred.

### Tooling Before Semantics

**Risk:** Formatter, editor, and build tools encode unstable syntax.

**Control:** M7 and M8 stabilize contracts before M10 freezes tool behavior.

### Host Leakage

**Risk:** Bun, Emacs, filesystem, or process behavior leaks into the portable
compiler and generated modules.

**Control:** Pure phase APIs, explicit adapters, Node parity, capability tests,
and browser execution evidence.

### Performance Claims Without Product Value

**Risk:** Engine benchmarks look impressive while transport dominates real
Emacs use.

**Control:** Acceptance uses warm end-to-end workloads, declared datasets, and
complete timing segments.

### Solo-Maintainer Load

**Risk:** Too many supported surfaces make the project difficult to sustain.

**Control:** One primary editor, one reference build host, one secondary
portability host, a small standard library, and no required custom registry or
LSP for 1.0.

## Final 1.0 Acceptance Standard

This section is normative. The maturity goal is achieved only when every
criterion marked **MUST** passes in one clean acceptance run. There is no
weighted score, partial credit, or milestone-based substitute. A failed MUST
criterion means the final goal has not been reached. The supplemental
PD-01-through-PD-11 criteria in 0041 are part of the same mandatory gate.

### A. Language and Compatibility

**AC-01 MUST - Stable specification coverage**

Every public source form, value rule, module form, macro API, interop form,
diagnostic schema, and stable standard-library export is owned by a `Stable`
specification and a conformance feature identifier. The generated coverage
matrix reports zero stable features without tests. Persistent collection,
protocol, transient, transducer, and state semantics are included in this
coverage rather than treated as library implementation details.

**AC-02 MUST - Stable corpus compatibility**

The complete frozen compatibility corpus compiles and executes with unchanged
observable results. Intentional incompatible changes have a superseding
specification and migration fixture; there are no undocumented semantic
changes.

**AC-03 MUST - Deterministic diagnostics**

All negative conformance cases produce the documented diagnostic code,
severity, file, line, column, and message in both human and JSON modes. Seed and
self-hosted diagnostics match for their shared stable scope.

### B. Bootstrap and Compiler

**AC-04 MUST - Reproducible fixed point**

On every required operating-system and Emacs-version job, the seed builds
Generation 1, Generation 1 builds Generation 2, and Generation 2 builds
Generation 3. Generations 1, 2, and 3 contain byte-identical normalized ESM and
Source Map artifacts.

**AC-05 MUST - Compiler parity**

The seed and self-hosted compilers agree on acceptance, diagnostics, canonical
IR, emitted ESM, source maps, portable closures, and project graphs for the
complete shared conformance corpus.

**AC-06 MUST - Self-hosted authority**

Single-file builds, project builds, portable builds, project reports, and the
three reference applications can all use the self-hosted compiler. No normal
user workflow requires a compiler feature available only in the seed.

**AC-07 MUST - Repeated determinism**

Twenty clean builds of the compiler and each reference application from the
same declared inputs produce identical identity-bearing artifacts. Timing,
temporary paths, and cache observations are excluded from artifact identity by
schema rather than text filtering.

### C. Project Toolchain

**AC-08 MUST - Clean project workflow**

Public commands can check, format-check, build, run, and watch a configured
multi-module project from a clean checkout. CLI flags and `eliscript.json`
precedence are documented and covered by integration tests.

**AC-09 MUST - Correct incremental builds**

For the 1,000-module acceptance graph, a no-op rebuild reuses 100 percent of
modules. A leaf change rebuilds only the leaf and semantically affected closure;
a shared dependency change rebuilds every and only affected module. Output is
equivalent to a clean rebuild.

**AC-10 MUST - Host portability**

The stable conformance corpus and command-line reference application execute on
the supported Bun version and Node.js LTS. The browser applications build and
run through the supported Vite version without Bun-specific emitted syntax.

### D. Developer Experience

**AC-11 MUST - Formatter**

Formatting the entire maintained corpus twice produces no second diff. Comments
and reader forms are preserved, malformed input receives a located diagnostic,
and formatted programs produce the same canonical IR as their inputs.

**AC-12 MUST - Emacs mode**

On Emacs 29 and 30, the maintained mode passes automated tests for syntax,
indentation, font locking, comments, definition navigation, project discovery,
diagnostic navigation, and buffer/project commands.

**AC-13 MUST - Interactive evaluation**

A documented REPL session evaluates forms and files, reloads changed modules,
prints ordinary values, maps runtime failures to Eliscript source, and recovers
after a worker restart without losing protocol integrity.

**AC-14 MUST - Source-level debugging evidence**

Compiler, runtime, React event, async rejection, and worker failures in the
acceptance fixtures all identify the correct `.eli` file and source span. No
required workflow exposes only a generated `.mjs` stack location.

### E. Libraries and Applications

**AC-15 MUST - Stable library contract**

Every core export has direct tests, source-import tests, project-build tests,
documented mutation/equality/error semantics, and portable closure evidence
where eligible. The API index and actual exports match exactly. The persistent
collection implementation also passes PD-01 through PD-07 from 0041, including
structural bounds, collision behavior, transient safety, and allocation-free
composed transformation evidence.

**AC-16 MUST - Maintained application proof**

All three required reference applications build from public interfaces, pass
behavioral tests, retain source maps, and contain no private compiler patches,
copied generated compiler source, or undocumented build step.

**AC-17 MUST - React and publishing proof**

The publishing application renders multiple Org articles, navigation, assets,
interactive React state, production output, deterministic content metadata,
and mapped failures. A no-content change produces identical output.

### F. Emacs Acceleration

**AC-18 MUST - Worker correctness and recovery**

Protocol negotiation, concurrent requests, progress, cancellation, timeout,
module replacement, source-mapped errors, process death, restart, and clean
shutdown pass in real-process tests without applying a failed result to Emacs
state.

**AC-19 MUST - End-to-end performance value**

On the declared reference machine and datasets, two maintained coarse-grained
Emacs workloads each achieve at least a 2.0x median warm end-to-end speedup over
equivalent Emacs Lisp implementations across 30 measured runs. Reports include
serialization, transport, execution, and client application time. Results are
correct before timings are compared. At least one workload uses persistent
collections and transducers, and the Emacs value bridge passes PD-08 through
PD-11 from 0041.

### G. Reliability and Security

**AC-20 MUST - Fuzz robustness**

At least 100,000 deterministic generated or mutated inputs complete without a
compiler crash, hang, uncontrolled host exception, or invalid source span.
Accepted programs satisfy round-trip invariants; rejected programs return
structured diagnostics. The seed and self-hosted readers agree on the shared
input domain.

**AC-21 MUST - Scale and soak**

The 1,000-module graph completes clean and incremental builds within documented
resource limits. The worker completes an eight-hour or 100,000-request soak,
whichever is reached first, with no lost response, deadlock, orphan process,
or unbounded memory trend. Peak and steady-state memory are recorded.

**AC-22 MUST - Boundary security**

Automated cases prove project-root containment across direct paths and
symlinks, deny undeclared macro and worker capabilities, reject protocol and
configuration schema mismatches, and prevent generated output from overwriting
source inputs.

**AC-23 MUST - Supported environment matrix**

The full required suite passes on macOS and Linux, Emacs 29 and 30, the declared
Bun version, and Node.js LTS where applicable. Exact versions are recorded in
the acceptance manifest.

### H. Documentation and Sustainability

**AC-24 MUST - Clean-machine onboarding**

A new user following only repository documentation can install prerequisites,
build the compiler, compile and run a basic program, build the React example,
and run the full test suite in 15 minutes of active steps, excluding dependency
download time. Every prerequisite and command is documented.

**AC-25 MUST - Complete documentation set**

The repository contains current getting-started, language reference, macro,
interop, project configuration, compiler architecture, Emacs mode, REPL,
React, Org publishing, worker, troubleshooting, and contribution documents.
Links and executable snippets pass automated checks.

**AC-26 MUST - Acceptance audit**

The acceptance directory contains:

- `manifest.json` with commit identity, platform, tool versions, criterion
  results, artifact digests, and test commands
- `report.md` explaining the evidence for AC-01 through AC-26 and PD-01
  through PD-11
- machine-readable test, fuzz, benchmark, scale, and soak summaries
- zero unresolved severity-1 or severity-2 correctness, data-loss, security,
  bootstrap, or compatibility defects

The final goal is reached only when AC-01 through AC-26 and PD-01 through
PD-11 all read `pass` in the same manifest and the repository is clean after
reproducing that result.

## Definition of Final Success

The long-term objective is achieved when Eliscript can credibly be used to
maintain itself and the three required real applications under the stable
contract, with efficient persistent values, reproducible builds, first-class
Emacs tools, standard JavaScript output, measurable acceleration returned to
real Emacs workflows, and a complete passing AC-01-through-AC-26 and
PD-01-through-PD-11 acceptance report.

Anything less remains progress toward maturity, even when individual
milestones are complete.

## Change Control

This roadmap may be refined as implementation evidence appears, but changes to
the final acceptance standard require a numbered superseding specification.
Acceptance criteria may be strengthened directly. Removing or weakening a MUST
criterion requires an explicit rationale showing that the criterion no longer
measures the stated long-term objective.
