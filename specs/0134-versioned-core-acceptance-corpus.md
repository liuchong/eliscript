# 0134: Versioned Core Acceptance Corpus and Truthful Audit Run

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-08
- Depends on: 0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0122 Evidence-derived Maturity Progress,
  0132 Repository Dependency and Generated-artifact Audits

## Summary

Eliscript owns one versioned, executable corpus for every mandatory AC and PD
criterion. The corpus takes criterion identifiers and titles directly from the
normative headings in 0040 and 0041, associates each criterion with executable
core probes and tracked evidence, runs every distinct probe once, and retains
both machine-readable and human-readable results.

The audit distinguishes three facts that must not be collapsed:

1. `corpusComplete` means every currently normative AC and PD criterion was
   enumerated and evaluated.
2. `operationalSuccess` means every declared probe passed without dirtying the
   source checkout.
3. `acceptancePass` means the first two conditions hold and every complete
   normative criterion is recorded as `pass` in the same run.

An incomplete criterion remains `incomplete` even when the currently available
tests pass. A failed probe is `fail`. Consequently, an initial complete audit
may succeed operationally while truthfully showing that 1.0 has not been
reached.

This specification completes the M13 core acceptance corpus implementation
unit only after one clean run is retained. It does not complete the clean
machine, migration, documentation, supported matrix, or final 1.0 audit units.

## Normative Criterion Source

`contracts/core-acceptance-corpus.json` is the executable mapping, but it does
not own criterion names or order. The checker extracts:

- `AC-NN` MUST headings from 0040
- `PD-NN` headings from 0041
- optional `AV-NN` headings from 0040

The contract must match those headings exactly and must also match the
criterion identifiers in `contracts/maturity-progress.json`. Added, removed,
renumbered, reordered, or renamed criteria therefore fail the ordinary corpus
check until every dependent contract is updated deliberately.

The current normative gate contains AC-01 through AC-24 and PD-01 through
PD-11. Earlier references to AC-25 and AC-26 described two application MUST
criteria that were later moved to the non-blocking AV namespace; those stale
counts do not define the current gate.

## Corpus Contract

Each mandatory criterion declares:

- the exact normative identifier, title, and source specification
- one or more bounded command probes
- one or more safe, tracked evidence files

Probe identifiers and evidence paths are unique and sorted. Evidence must be a
tracked regular file. Every probe must be referenced, and every mandatory
criterion must have both executable and file evidence. Optional applications
are listed separately with `contributesToCore: false` and cannot be used by an
AC or PD criterion.

The initial command set uses the complete framework-neutral core suite plus
strict Emacs byte compilation. Criterion-specific evidence points to the relevant
specification, contract, test, or source-bound benchmark. A later matrix run
may add environment-specific probe records without changing language
semantics.

## Run Record

`bun tools/acceptance/check.mjs --run` requires a clean checkout before any
probe starts. It records:

- source commit and Git tree identity
- clean state before and after all probes
- operating system, architecture, CPU, Bun, Node, and Emacs versions
- exact argument vector, timeout, exit status, duration, output digest, and a
  bounded summary for every probe
- SHA-256 for every contract, normative source, and evidence file
- every criterion's declared maturity state and derived run result
- separately labeled, non-contributing application status

The JSON and Markdown outputs are written only after the clean-state check, so
the retained output itself does not invalidate the audited source revision.
The verifier checks report shape, complete criterion and artifact inventory,
derived totals, corpus identity, application isolation, and byte-exact Markdown
rendering.

`--run` exits successfully when the complete corpus ran without probe or
repository-integrity failures. `--require-pass` is the stronger final gate and
fails until every mandatory criterion reads `pass`. This distinction lets M13
retain honest intermediate audits without weakening the final standard.

## Commands

```sh
bun tools/acceptance/check.mjs
bun tools/acceptance/check.mjs --run \
  --json-output acceptance/runs/m13-01.json \
  --markdown-output acceptance/runs/m13-01.md
bun tools/acceptance/check.mjs --verify-run acceptance/runs/m13-01.json \
  --verify-markdown acceptance/runs/m13-01.md
```

## Retained Run Contract

The retained JSON and Markdown pair records its exact source commit, Git tree,
environment, criterion totals, commands, and artifact digests. Those values
belong to the generated run and are deliberately not duplicated as normative
constants in this specification. The default contract gate verifies the
current pair under `acceptance/runs/` and preserves incomplete criteria and
non-contributing application results exactly as recorded.

## Compatibility Freeze

The version 1 corpus and run formats, normative-heading derivation, complete
criterion inventory, bounded probe mapping, source and environment provenance,
three-way separation of corpus completeness, operational success, and final
acceptance, byte-exact Markdown rendering, and stronger `--require-pass` gate
are stable. New mandatory criteria or probes require an explicit contract
revision; no compatible change may reinterpret `incomplete` as `pass` or admit
application evidence into a core result.

## Acceptance Criteria

- **VAC-01:** The corpus derives the exact ordered AC, PD, and AV headings from
  their normative specifications instead of trusting a copied count.
- **VAC-02:** All mandatory criteria have bounded command probes and tracked,
  criterion-specific evidence files.
- **VAC-03:** Corpus, progress, and specification identifiers and titles must
  agree exactly; drift fails validation.
- **VAC-04:** A run records source identity, exact environment metadata,
  command outcomes, and complete artifact digests.
- **VAC-05:** Criterion results are derived conservatively: probe failure is
  `fail`, proven complete criteria are `pass`, and all other criteria remain
  `incomplete`.
- **VAC-06:** Corpus completeness, operational success, and final acceptance
  are independent machine-readable results.
- **VAC-07:** A dirty source checkout cannot start a retained audit, and probe
  side effects make operational success false.
- **VAC-08:** Human output is generated from and byte-verified against the
  machine-readable run.
- **VAC-09:** Optional applications are present only as non-contributing,
  separately reported validations.
- **VAC-10:** Contract rejection tests cover missing criteria, title drift,
  unknown probes, untracked evidence, and application leakage.
