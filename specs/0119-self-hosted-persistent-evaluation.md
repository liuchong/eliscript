# 0119: Self-hosted Persistent Evaluation

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0019 Self-Hosted Compiler Driver,
  0040 Mature Project Roadmap,
  0043 Structured Compiler Diagnostics,
  0069 Canonical Runtime Data Text,
  0115 Emacs Major Mode Foundation,
  0117 Virtual-source Builds and Emacs Compilation Commands

## Summary

Eliscript adds a versioned, self-hosted evaluation boundary for one-form
evaluation, complete-source loading, session reset, and capability discovery.
A long-lived host process owns filesystem and module-loader effects, while the
generated compiler owns request normalization, form classification, namespace
binding discovery, macro-source discovery, compilation, and Source Maps.

Definitions produce immutable namespace revisions. Expressions import the
current revision and therefore retain the live identity of persistent values,
Atoms, functions, and imported modules between requests. Loading a complete
source or replacing a definition is an explicit revision boundary; it may
re-evaluate namespace initialization.

This is a language, compiler, runtime, and Emacs development capability.
Application frameworks, UI libraries, bundlers, publishing systems, sites,
hosting, and development servers are not dependencies, goals, evidence, or
maturity credit.

## Compiler-owned Contracts

The generated compiler exports three version 1 descriptors:

- `eliscript-evaluation-operation` normalizes `describe`, `evaluate`, `load`,
  and `reset` requests
- `eliscript-evaluation-form` classifies exactly one read form as a definition,
  module form, or expression without assigning application-specific meaning to
  ordinary names
- `eliscript-evaluation-module` validates complete source and reports its
  runtime bindings, existing exports, and ordered macro definitions

Request identifiers are null, non-empty strings, or non-negative safe
integers. Evaluation and load requests carry non-empty source, a non-empty
logical filename, an optional project root, and positive one-based origin line
and column. Describe and reset reject source and project fields. Unknown keys
reject rather than silently entering session identity.

The compiler classifies only language declarations. Framework component names,
render functions, and bundler conventions remain ordinary definitions and
calls.

## Session Semantics

One host process owns one session and a monotonically increasing revision.
The session writes generated ESM and adjacent external Source Maps under an
owned temporary directory. Every temporary artifact is removed when the
session closes normally or after an error path handled by the process.

Loading source compiles the complete module, exports otherwise-private runtime
bindings for subsequent expressions, imports the new namespace revision, and
commits the revision only after compilation and module evaluation succeed.
An unsuccessful load leaves the previous namespace usable.

Evaluating a definition updates the session's ordered definition journal and
builds a new namespace revision. Re-evaluating a named definition replaces its
prior journal entry. Macro definitions participate in compilation but are not
manufactured as runtime values. Evaluating an expression compiles a temporary
module that imports current runtime bindings, includes current macro sources,
and exports the expression result as its default value. Expression evaluation
does not rebuild or replay the namespace revision.

Reset discards all definitions, macros, and loaded namespace state and advances
the revision. Describe returns protocol versions and supported operations
without changing state.

## Values and Failures

Successful expression values use the canonical runtime printer. Numbers,
strings, booleans, nil, keywords, symbols, Lists, Vectors, Maps, Sets, and other
supported values therefore have the same textual representation as runtime
data text. The structured result also distinguishes a printed value from the
absence of a runtime binding.

Standard output written while a request is executing is captured in the
structured response. It never shares the NDJSON transport channel as an
unframed byte stream.

Compiler failures retain `eliscript-diagnostic` version 1. Runtime failures are
normalized to the same diagnostic envelope with an evaluation-runtime phase
and a best available `.eli` file, line, and column derived from the generated
Source Map. A failed request never emits a partial success response and never
corrupts subsequent NDJSON framing.

## Public Process and Emacs

The public evaluation command supports a persistent NDJSON mode and bounded
one-shot form or file evaluation. Node and Bun execute the same generated
compiler and host module. Standard output contains protocol records only in
NDJSON mode; diagnostics and human presentation cannot corrupt framing.

The maintained Emacs mode owns project-scoped sessions, evaluates a region or
preceding form, loads the current unsaved buffer, displays canonical values,
and maps located failures back to source buffers. After an unexpected process
exit, the mode fails every unacknowledged request explicitly, starts a fresh
process, and restores only the last acknowledged namespace journal. It never
guesses whether an interrupted state-changing request committed and therefore
never silently executes such a request twice. Stopping a session is explicit
and leaves no process behind.

## M10 Status

This specification delivered the source-mapped persistent evaluation slice.
At that point it did not claim host-neutral file watching, local onboarding,
the complete interactive terminal REPL experience, the complete AC-12 or AC-13
gate, or the M10 exit gate. Specifications 0120, 0121, and 0133 subsequently
completed the remaining M10 implementation and audit contracts. AC-12 and
AC-13 remain separate final matrix criteria.

## Compatibility Freeze

The three version 1 evaluation descriptors, immutable namespace revision
semantics, live expression identity, atomic load and definition replacement,
canonical value printing, captured output framing, source-mapped diagnostics,
acknowledged-state Emacs recovery, and explicit session shutdown are stable.
New evaluation modes require an explicit version rather than ambiguous fields
or replay behavior.

## Acceptance Criteria

- **SPE-01:** Generated compiler code owns and exports all three version 1
  evaluation descriptors and rejects malformed, unknown, and ambiguous input.
- **SPE-02:** Seed and self-hosted classifiers agree on definitions, macros,
  module forms, expressions, malformed input, bindings, exports, and macro
  source order.
- **SPE-03:** Definitions create atomic namespace revisions; a failed revision
  leaves the previous namespace callable and unchanged.
- **SPE-04:** Expressions reuse the current namespace module without replaying
  initialization and preserve Atom identity across requests.
- **SPE-05:** Complete-source load supports imports, macros, declarations,
  existing exports, private bindings, top-level effects, and explicit reload.
- **SPE-06:** Canonical runtime printing covers scalar and persistent value
  categories under both Bun and Node.
- **SPE-07:** Compile-time and runtime failures produce one structured response
  with exact request identity and best available `.eli` location.
- **SPE-08:** NDJSON framing survives malformed JSON, failed compilation,
  failed runtime evaluation, reset, and the next successful request.
- **SPE-09:** Emacs evaluates forms and unsaved buffers asynchronously, displays
  ordinary values, navigates located failures, and never saves source as a
  side effect.
- **SPE-10:** Emacs restores the last acknowledged namespace after an
  unexpected host restart, fails unacknowledged requests explicitly, and does
  not duplicate an interrupted state-changing request.
- **SPE-11:** Session shutdown removes owned temporary artifacts and leaves no
  child process or listener behind.
- **SPE-12:** Public surfaces, compatibility contracts, maintained Emacs
  versions, Bun, Node, fixed-point builds, and default tests cover the feature
  without application dependencies or application evidence.
