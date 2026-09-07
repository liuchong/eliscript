# 0136: Local Compatibility Migration Rehearsal

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-08
- Depends on: 0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0046 M7 Compatibility Baseline,
  0095 Stable Persistent Value and Explicit Host Container Boundary,
  0110 Self-hosted Incremental Project Cache,
  0118 Framework-neutral Library Interoperation

## Summary

M13-03 requires a repeatable rehearsal of the compatibility boundary and every
intentional transition represented by the current baseline. Eliscript performs
that rehearsal directly in a clean local checkout. It rebuilds a frozen core
program with the seed and self-hosted compilers, executes the artifacts with
Bun and Node, exercises both supported migration mechanisms, and checks the
one superseded framework-specific contract without using application evidence.

The retained report is source-bound and machine verifiable. This rehearsal is
deliberately narrower than AC-02: it proves that the migration machinery and
current transition inventory work, but it does not claim that every final 1.0
stable behavior has already been frozen.

## Transition Inventory

The version 1 contract owns three intentional transitions:

1. Specification 0010 is superseded by the framework-neutral contract in
   0118. The rehearsal checks registry and specification metadata only. React,
   Vite, bundlers, and rendering do not execute and contribute no core evidence.
2. The provisional `array` constructor is rejected with the stable lexical
   diagnostic, while the migrated `js-array` and `js-object` source compiles to
   byte-identical seed/self-hosted ESM and produces identical Bun/Node output.
3. A version 1 incremental cache is read and automatically rewritten as the
   version 2 `eliscript-project-cache` family by the maintained Emacs project
   implementation.

Adding a transition requires updating the closed contract, executable checks,
and this specification together. Removing a transition silently is invalid.

## Local Execution

`tools/compatibility/rehearse.mjs` requires the local `git`, `bun`, `node`, and
`emacs` commands. It starts only from a clean tracked checkout, builds a fresh
self-hosted compiler in a temporary directory, and removes that directory when
the run finishes. It does not start a server, container, sandbox, virtual
machine, or hosted job.

The stable fixture and migrated host-container fixture compile through both
compiler generations. Their generated modules must be byte-identical, and
every generated module must produce the frozen stdout under both JavaScript
runtimes. Legacy source must fail under both compilers with matching normalized
diagnostics. The cache migration runs as one named ERT test.

## Evidence Contract

The JSON report records the exact commit and tree, local host and tool versions,
case outcomes and durations, stdout/stderr digests, generated-module identities,
and the SHA-256 of every contract, fixture, implementation, and migration
specification. The Markdown report is generated from JSON and verified byte for
byte.

The report distinguishes `validationPass` from `completesAc02`. A passing
rehearsal completes M13-03 while `completesAc02` remains false until the final
stable corpus is closed and executed.

## Commands

```sh
bun tools/compatibility/rehearse.mjs
bun tools/compatibility/rehearse.mjs --run \
  --json-output acceptance/runs/m13-03.json \
  --markdown-output acceptance/runs/m13-03.md
bun tools/compatibility/rehearse.mjs \
  --verify-run acceptance/runs/m13-03.json \
  --verify-markdown acceptance/runs/m13-03.md
```

## Acceptance Criteria

- **CMR-01:** The transition inventory is closed, ordered, and bound to the
  exact originating and replacement specifications.
- **CMR-02:** Frozen stable source produces byte-identical seed/self-hosted ESM
  and identical expected output under Bun and Node.
- **CMR-03:** Retired native-container aliases fail consistently, while the
  documented explicit-host rewrite preserves intended runtime behavior.
- **CMR-04:** The maintained project implementation reads a legacy cache hit
  and rewrites it to the current cache family and version.
- **CMR-05:** The framework-specific contract transition is verified without
  importing or executing application frameworks.
- **CMR-06:** The run starts and ends with a clean tracked checkout and binds
  all results and source artifacts to one exact local revision.
- **CMR-07:** Machine and human reports are mutually verified and cannot claim
  completion of AC-02.

## Retained Run

`acceptance/runs/m13-03.json` and `acceptance/runs/m13-03.md` retain the passing
local rehearsal from commit `f1f6ec1a7b5a2c86b4ca91517c689ae69cfbef23`.
Both compiler generations produced identical artifacts for the frozen program
and migrated host-container source, all eight Bun/Node executions matched their
expected stdout, both legacy compiler paths returned the frozen diagnostic, and
the named cache migration ERT test passed. The checkout was clean before and
after the run; application evidence was excluded and AC-02 remains incomplete.
