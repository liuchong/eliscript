# 0122: Evidence-derived Maturity Progress

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-07
- Depends on: 0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0042 Specification Registry and Conformance Manifest,
  0046 M7 Compatibility Baseline

## Summary

Eliscript reports long-term project progress from versioned acceptance units
and current repository evidence. Human labor estimates, calendar projections,
elapsed development time, commit counts, file counts, and lines of code are not
progress measures.

The public progress report has three independent percentages:

1. implementation progress over M7-M13 deliverable units
2. verification progress over mandatory AC and PD criteria
3. stabilization progress over core conformance features

The three percentages are never averaged into a synthetic completion score.
Each measures a different condition and all three must reach 100 percent before
the core maturity goal can pass. Application validation is reported outside
all three denominators.

## Versioned Contract

`contracts/maturity-progress.json` uses
`eliscript-maturity-progress` version 1. It contains:

- exactly M7 through M13 in roadmap order
- one explicit unit for every milestone deliverable
- exactly AC-01 through AC-24 and PD-01 through PD-11
- `complete`, `partial`, `open`, or `blocked` state for each unit
- conformance feature identifiers supporting implemented or verified work
- explicit remaining work for every non-complete unit
- explicit blocker text for every blocked unit
- the exact non-core application criteria and features excluded from progress

A complete unit requires executable conformance evidence. Partial work never
contributes fractional completion: it remains in the numerator's complement
until its whole acceptance unit closes.

## Progress Calculations

Implementation progress is:

```text
complete milestone deliverable units / all milestone deliverable units
```

The initial contract contains 42 units: 6 for M7, 7 for M8, 6 for M9, 6 for
M10, 6 for M11, 6 for M12, and 5 for M13.

Verification progress is:

```text
complete mandatory criteria / 35 mandatory criteria
```

The denominator is the 24 AC criteria in 0040 plus the 11 PD criteria in 0041.

Stabilization progress is:

```text
stable core conformance features / all core conformance features
```

The checker derives both values from the current conformance manifest after
removing the explicitly declared application-validation feature identifiers.
It does not trust copied totals in the progress contract.

Percentages are rounded to one decimal place. Reports include numerator,
denominator, completed percentage, remaining percentage, open identifiers,
blocked identifiers, and application exclusions.

## Evidence Rules

Every feature identifier in the progress contract must exist in the current
conformance manifest. A feature excluded as application validation cannot
support a core implementation or verification unit. A complete or partial unit
must identify at least one current core feature. An open unit may have no
feature evidence but must state what remains.

The progress contract is a conservative acceptance inventory, not a place to
record optimism. A unit moves to complete only when the complete wording of its
roadmap deliverable or acceptance criterion is proven. Narrow tests, planned
work, implementation without required matrix evidence, and application output
cannot close broader core criteria.

## Public Check

`bun tools/progress/check.mjs` validates and prints the human progress report.
`--json` emits a machine-readable report. The checker is part of
`make check-contracts` and the default test suite, so stale identifiers,
missing units, invalid states, absent remaining work, and application leakage
fail ordinary repository verification.

## Roadmap Maintenance

0040 expresses milestone size as acceptance-unit counts rather than human
duration. Historical completion dates may remain factual records, but future
delivery estimates and progress reports use this contract only.

When a roadmap deliverable or mandatory criterion changes, the same change
must update this specification, the progress contract, checker expectations,
and tests. Adding a criterion increases the denominator; silently deleting or
merging an open criterion to inflate progress is forbidden.

## Acceptance Criteria

- **EMP-01:** The contract contains exactly M7-M13 and their 42 declared
  deliverable units.
- **EMP-02:** The contract contains exactly AC-01 through AC-24 and PD-01
  through PD-11.
- **EMP-03:** Complete and partial units reference existing core conformance
  features; application-validation features are rejected.
- **EMP-04:** Every partial or open unit states concrete remaining work, and
  every blocked unit additionally states its blocker.
- **EMP-05:** Implementation percentage counts only complete milestone units.
- **EMP-06:** Verification percentage counts only complete mandatory AC and PD
  criteria.
- **EMP-07:** Stabilization percentage is derived from current stable core
  features after explicit application exclusions.
- **EMP-08:** Human and JSON reports expose numerator, denominator, completed,
  remaining, open, and blocked state without a synthetic overall average.
- **EMP-09:** Application criteria and application features contribute zero to
  every core denominator and numerator.
- **EMP-10:** The default contract suite rejects missing units, unsupported
  completion claims, unknown evidence, and application leakage.
