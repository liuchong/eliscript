# 0135: Traceable Local Onboarding Exercise

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-08
- Depends on: 0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0133 Verified Installation and Daily Development Guide,
  0134 Versioned Core Acceptance Corpus and Truthful Audit Run

## Summary

M13 requires executable evidence that the documented onboarding path works as
written. Eliscript therefore runs that path directly in the current local
checkout: it installs locked dependencies, discovers the public command, builds
the bootstrap compiler, executes the documented two-module project,
byte-compiles maintained Emacs Lisp, and runs the framework-neutral core suite.

The exercise emits machine-readable and generated human-readable evidence
bound to one Git commit, tree, local environment, ordered command set,
and complete source digest inventory. Dependency installation is measured but
excluded from the 15-minute active-step budget defined by AC-22. Application
tests remain outside the exercise and cannot satisfy or block it.

The exercise deliberately makes no claim that the host is newly provisioned or
isolated. It proves the supported workflow on the recorded local toolchain;
cross-platform coverage remains AC-21. The retained passing report lives under
`acceptance/runs/`.

## Environment Contract

The run uses the local host and requires `git`, `bun`, `emacs`, and `make`.
Their actual versions, operating system, architecture, and CPU are recorded in
the report instead of being hidden behind a provider-specific runner label.

`tools/onboarding/check.mjs` owns every project step. It rejects a dirty tracked
checkout, altered command sequence, application test leakage, incomplete tool
metadata, or active duration above 900,000 milliseconds. No cloud token,
hosted runner, container, or virtual machine is part of this contract.

## Ordered Exercise

The versioned contract runs these steps exactly once and in order:

1. install the frozen Bun lockfile dependencies
2. discover the public `eliscript` command
3. build the bootstrap compiler through its public package command
4. execute the documented two-module project and Emacs mode setup
5. byte-compile all maintained Emacs Lisp with warnings as errors
6. run `make test-core`

The dependency step records its own duration but does not contribute to the
active-step total. Every other step contributes. The exercise stops after the
first failed step and records later steps as `not-run`; it still writes a
failure report when possible so the result is diagnosable.

## Test Partition

`make test-core` is the only test target accepted by this exercise. React,
Vite, Org publishing, browser builds, and their CLI validation live under
`make test-applications`. `make test` remains the aggregate developer command
and invokes both explicit partitions, so separating acceptance does not hide
application regressions.

The onboarding checker validates the partition structurally before a run. No
application test filename or application target may occur in the core target
or onboarding command sequence.

## Evidence

The JSON report records:

- source commit and Git tree
- local execution marker and source commit
- operating-system release, architecture, CPU, Git, Bun, Node, and Emacs
  versions
- argument vector, timeout, exit status, duration, bounded summary, and
  separate stdout/stderr SHA-256 for every step
- clean tracked state before and after the ordered exercise
- install duration, active duration, fixed budget, and derived final result
- SHA-256 for every source file as it existed in the audited commit

Verification reads source bytes from the recorded commit instead of silently
substituting the current checkout. The Markdown report must be byte-identical
to a fresh rendering of the JSON report.

## Commands

```sh
bun tools/onboarding/check.mjs
bun tools/onboarding/check.mjs --run \
  --json-output acceptance/runs/m13-02.json \
  --markdown-output acceptance/runs/m13-02.md
bun tools/onboarding/check.mjs \
  --verify-run acceptance/runs/m13-02.json \
  --verify-markdown acceptance/runs/m13-02.md
```

## Acceptance Criteria

- **CMO-01:** The exercise runs directly on the local host and records its
  operating system, architecture, Git, Bun, Node, and Emacs versions.
- **CMO-02:** The ordered run begins from a clean tracked checkout and performs
  frozen dependency installation itself.
- **CMO-03:** Public command discovery, compiler build, documented project,
  strict byte compilation, and the complete core suite all pass.
- **CMO-04:** Dependency download time is separate; all active steps complete
  within 900,000 milliseconds.
- **CMO-05:** Core and application test targets are mechanically disjoint,
  while the aggregate developer target still runs both.
- **CMO-06:** Every command result and source artifact is bound by SHA-256 to
  the exact audited commit.
- **CMO-07:** Machine and human reports are deterministic, mutually verified,
  and identify the exact local source revision.
- **CMO-08:** Failed, incomplete, dirty, over-budget, or
  application-contaminated evidence cannot complete M13-02 or AC-22.

## Retained Run

`acceptance/runs/m13-02.json` and `acceptance/runs/m13-02.md` record the passing
local run from commit `ca5bee07526be8b08e5e2fbb80d6417ae7c44a0a` on Darwin
ARM64 with Bun 1.4.0 and Emacs 31.1. All six steps passed, the tracked checkout
was clean before and after execution, application validation was not executed,
and 449,739.619 milliseconds of active work stayed within the 900,000
millisecond budget.
