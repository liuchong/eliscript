# 0045: Continuous Compatibility Matrix

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0042 Specification Registry and Conformance Evidence,
  0044 Public Surface Registry and Consistency Matrix

## Summary

Eliscript verifies the complete repository against the supported Emacs 29 and
Emacs 30 release lines on Linux and macOS. A versioned JSON contract is the
source of truth for the matrix. Each authoritative result is produced by
running the declared commands directly on a real target machine and is bound
to its clean Git commit, tree, operating system, architecture, Emacs, Bun, and
Node versions.

The checked-in GitHub Actions workflow remains a deterministic optional
projection of the contract, but hosted workflow state is not acceptance
evidence. This keeps private-repository maturity verification local and
reproducible without a container, virtual machine, sandbox, or hosted service.

## Compatibility Contract

`contracts/compatibility-matrix.json` uses format
`eliscript-compatibility-matrix`, version 1. It declares:

- the workflow path
- supported operating-system runners and architectures
- supported Emacs release versions
- the reference JavaScript host and exact CI version
- the exact Node host used by generated ESM package-boundary tests
- the retained local-evidence directory and bounded command timeouts
- immutable revisions and inspected review labels for external Actions
- the ordered command sequence required in every matrix job

The initial M7 matrix is the Cartesian product of:

| System | Runner | Architecture | Emacs |
| --- | --- | --- | --- |
| Linux | `ubuntu-24.04` | x64 | 29.4, 30.2 |
| macOS | `macos-15` | arm64 | 29.4, 30.2 |

Bun 1.4.0 and Node 24.20.0 are used in every retained local cell. Bun runs the
suite and compiler commands; maintained host-boundary tests execute generated
ESM under both Bun and Node.

The M7 support statement is release-line support for Emacs 29 and 30, tested
at the latest selected patch release for each line. Adding an Emacs major,
operating system, architecture, or JavaScript host is a contract change. A
moving runner image or unpinned host version is not a substitute for declaring
that change.

Node support applies to generated ESM, package imports, and public host-neutral
project output. Bun remains the compiler-tooling process host; this contract
does not claim that Bun-specific development tools themselves execute inside
Node.

## Direct Local Evidence

`tools/compatibility/matrix.mjs --run` identifies the current operating system,
architecture, and actual tool versions before running anything. It rejects an
unsupported cell, a dirty checkout, or Bun/Node version drift. The executor
runs the contract's exact command sequence with the selected `EMACS`, `BUN`,
and `NODE` binaries and bounded per-command timeouts. During that sequence,
retained acceptance aggregation is disabled so an older report for the cell
being replaced cannot recursively reject the test run. Compiler, runtime,
standard-library, conformance, and all non-retained validation still run.

For example, a macOS Emacs 30 cell can be recorded with:

```sh
bun tools/compatibility/matrix.mjs --run \
  --emacs /path/to/emacs-30.2 \
  --node /path/to/node-24.20.0
```

Reports live under `acceptance/matrix/`. Each report retains command status,
duration, output digests, exact environment versions, and the source commit and
tree. Reports use format `eliscript-local-compatibility-cell` version 1.
`--verify-all` validates every present report, rejects duplicates or
mixed source-content identities, and marks historical reports stale when
tracked source outside the report directory has changed. Report-only commits
may differ because the comparison excludes the retained report directory.
AC-21 remains incomplete until all four exact cells bind the current source
content identity.

## Deterministic Workflow Projection

`tools/ci/render-workflow.mjs` validates the JSON contract and renders
`.github/workflows/compatibility.yml`. Run:

```sh
bun tools/ci/render-workflow.mjs --write
```

after an intentional matrix change. Normal validation uses:

```sh
bun tools/ci/render-workflow.mjs --check
```

The checker compares the complete generated text, not selected snippets.
Manual changes to triggers, permissions, matrix entries, timeout, setup steps,
or test commands therefore fail until represented by the generator and its
contract.

The optional workflow projection runs on pushes to `master`, pull requests,
and explicit manual dispatches. It uses:

- read-only repository permission
- cancellation of superseded runs on the same ref
- independent matrix failures through `fail-fast: false`
- a 30-minute timeout per job
- exact locked dependency installation
- the complete repository test suite
- strict warning-as-error Emacs byte compilation

## Action Integrity

Every external Action is selected by a full lowercase 40-character commit
SHA. Human-readable release or source-review labels are retained as comments
and metadata, but they are never executable references.

An Action update requires all of the following:

1. identify and review the intended upstream release
2. replace the immutable revision and review label in the matrix contract
3. regenerate the workflow
4. run focused contract tests and the complete local suite
5. collect all four direct local reports before treating support as accepted

The matrix validator rejects branch names, major tags, shortened revisions,
missing required Actions, and duplicate or unsorted Action identifiers.

## Strict Byte Compilation

`tools/ci/strict-byte-compile.sh` is the shared local and CI entry point behind
`make byte-compile`. It:

- starts from a tree without stale `.elc` files
- byte-compiles compiler, Org, worker, and ERT sources with
  `byte-compile-error-on-warn` enabled
- uses the selected `EMACS` executable without depending on user init files
- removes all generated `.elc` files on success or failure through an exit
  trap

This keeps the test checkout clean and prevents one matrix step from observing
bytecode produced by another Emacs release.

## Contract Failures

The default tests reject:

- omission of Linux or macOS
- omission of Emacs 29 or Emacs 30
- malformed or mutable Action revisions
- weakening or reordering the required command sequence
- any difference between the matrix contract and committed workflow

The renderer also validates exact schema and format versions, sorted unique
identifiers, runner declarations, known architectures, an exact Bun version,
and the canonical workflow path.

## Change Policy

Compatibility may be broadened by adding matrix entries with passing direct
local evidence. Removing an operating system, Emacs release line, or
architecture is an incompatible support-policy change and requires a
superseding specification with migration rationale.

Patch-level runner substitutions are allowed only through an explicit contract
change. A temporary upstream outage may be retried, but it does not justify
silently skipping a matrix cell or weakening a required command.

## Acceptance Evidence

- The compatibility contract renders four distinct jobs.
- Focused tests prove the committed workflow is byte-identical to the render.
- Negative tests prove incomplete dimensions, mutable revisions, weakened
  commands, and workflow drift are rejected.
- Direct local report tests reject unsupported cells, host-version drift,
  duplicate cells, mixed source identities, and forged completion.
- `make byte-compile` succeeds with warnings promoted to errors and leaves no
  `.elc` files behind.
- `make test` executes the compatibility checker before the complete local
  test suite.
- Four retained direct local reports on one source identity are the only
  authoritative completion evidence for the environment matrix.
