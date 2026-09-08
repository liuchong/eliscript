# 0138: Versioned Final Acceptance Artifacts

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-08
- Depends on: 0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0134 Versioned Core Acceptance Corpus and Truthful Audit Run,
  0137 Complete Core Documentation Set

## Summary

Eliscript maintains canonical machine-readable and human-readable 1.0
acceptance artifacts at `acceptance/manifest.json` and
`acceptance/report.md`. They are deterministic projections of one verified,
source-bound core acceptance run plus a closed unresolved-defect register.

Creating these artifacts completes the M13-05 implementation unit. It does not
complete AC-24 or declare Eliscript 1.0 accepted while any mandatory criterion
is incomplete, a required evidence group is missing, an operational probe
fails, or an unresolved severity-1 or severity-2 defect exists.

## Final Artifact Contract

`contracts/final-acceptance.json` owns the exact source run, source report,
defect register, canonical output paths, blocking severities, and five evidence
groups: test, fuzz, benchmark, scale, and soak. Group criteria and artifacts
must be unique, ordered, tracked by the source run, and complete.

The contract never treats application frameworks, publishing, hosting, or
development servers as core evidence. Application status is copied from the
source run and remains separately labeled and non-contributing.

## Machine-readable Manifest

The manifest records:

- source commit and Git tree identity
- local operating system, architecture, CPU, Bun, Node, and Emacs versions
- exact core commands, outcomes, budgets, durations, and output digests
- all AC and PD results with their evidence and remaining work
- source-bound artifact digests
- test, fuzz, benchmark, scale, and soak evidence summaries
- the unresolved defect register and blocking-severity count
- independently derived corpus, operational, evidence, defect, and final gates

The final `acceptancePass` value is true only when the verified source run
already passes every mandatory criterion, every evidence group is complete,
and the blocking-defect count is zero.

## Human-readable Report

The Markdown report is rendered exclusively from the manifest. It displays the
source identity, environment, gate outcomes, mandatory criteria, evidence
groups, unresolved defects, application status, commands, and artifact
digests. Byte drift between the manifest and report fails verification.

## Defect Register

`acceptance/defects.json` contains only unresolved defects. Each entry requires
a unique identifier, severity from 1 through 4, one of the correctness,
data-loss, security, bootstrap, or compatibility classes, a title, and at least
one safe evidence path. Severity 1 and 2 are blocking.

An empty register records that no unresolved defect has been entered; it does
not override incomplete criteria or failed probes. A forged empty register
cannot turn an incomplete source run into final acceptance.

## Local Commands

```sh
bun tools/acceptance/finalize.mjs --generate
bun tools/acceptance/finalize.mjs --verify
bun tools/acceptance/finalize.mjs --verify --require-pass
```

Generation and verification run directly in the local checkout. The stronger
`--require-pass` command intentionally fails until the complete 1.0 gate is
actually reached.

## Compatibility Freeze

The version 1 final-manifest format, canonical output paths, source-run and
report binding, five evidence groups, unresolved-defect schema, severity 1 and
2 blocking rule, derived gate calculation, byte-exact report, and
non-contributing application projection are stable. Stabilizing this mechanism
does not assert that its current result passes; `acceptancePass` remains wholly
derived and cannot be set independently.

## Acceptance Criteria

- **VFA-01:** One closed contract owns the source, outputs, blocking severities,
  and exact five evidence groups.
- **VFA-02:** The canonical manifest contains complete source, environment,
  command, criterion, artifact, evidence, defect, application, and summary
  records.
- **VFA-03:** The canonical report is a byte-exact deterministic rendering of
  the manifest.
- **VFA-04:** Test, fuzz, benchmark, scale, and soak summaries reference only
  artifacts bound by the verified source run.
- **VFA-05:** The final result is derived from all mandatory criteria,
  operational success, evidence completeness, and blocking defects.
- **VFA-06:** Incomplete criteria, missing evidence, blocking defects, changed
  source reports, and forged final results fail verification.
- **VFA-07:** Applications remain separately reported and cannot satisfy or
  block the core acceptance result.
