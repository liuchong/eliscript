# 0042: Specification Registry and Conformance Evidence

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0040 Project Maturity Roadmap and 1.0 Acceptance Contract

## Summary

Eliscript now keeps a machine-readable registry of every numbered
specification and a conformance manifest that connects each implemented
specification to executable test evidence.

The registry separates design status from implementation status. The checker
compares registry metadata with the Markdown sources, rejects unindexed or
missing specifications, validates evidence locators, and requires every
implemented specification to own at least one conformance feature.

## Motivation

Before this contract, specification headers used `Implemented` as both a design
decision and a delivery state. Documentation could drift from filenames,
headings, or tests without a default build failure. The maturity roadmap
requires stable behavior to have identifiable specifications and evidence, so
that relationship must be data rather than convention.

## Specification Registry

`specs/index.json` is the versioned registry. Version 1 contains an ordered
`specifications` array. Every entry records:

- four-digit specification identifier
- exact title
- repository-relative Markdown path
- design status
- implementation status

Allowed design statuses are:

- `draft`: unresolved design work
- `accepted`: approved behavior that is not yet frozen as a compatibility
  promise
- `stable`: behavior inside the mature compatibility contract
- `superseded`: replaced by a later numbered specification

Allowed implementation statuses are:

- `pending`
- `in-progress`
- `implemented`
- `superseded`

A stable specification must be implemented. The checker requires every
numbered Markdown specification on disk to have exactly one registry entry and
requires the id, title, status, and implementation fields to agree exactly.

## Conformance Manifest

`tests/conformance/manifest.json` is the versioned feature inventory. Every
feature contains:

- a stable dotted feature identifier
- a human-readable title
- `accepted` or `stable` status
- one owning specification identifier
- one or more observable contract statements
- one or more evidence locators

An evidence locator has a kind, repository-relative file, and exact text that
must remain present in that file. Version 1 recognizes ERT, Bun test, shell,
and fixture evidence.

Locators deliberately point to existing executable tests or integration
scripts rather than repeating their assertions in the manifest. Renaming or
removing the evidence breaks the contract check until the manifest is updated
to a valid replacement.

## Checker

`tools/conformance/check.mjs` validates both documents without third-party
dependencies. It checks:

- schema versions
- identifier, status, ordering, uniqueness, and path rules
- registry parity with every specification Markdown file
- feature ownership by an accepted, implemented specification
- existence and exact content of every evidence file
- execution of every non-fixture evidence file by the default test target
- complete feature coverage for every implemented specification

Run it directly with:

```sh
bun run check:contracts
```

Use `bun tools/conformance/check.mjs --json` for a machine-readable summary.
The default `make test` target runs the human-readable check before compiler
tests.

## Current Baseline

The initial registry contains all 42 specifications. Thirty-nine implemented
specifications own 39 conformance features with 67 evidence links. The roadmap
and persistent-data design remain accepted work with independent implementation
states rather than being misreported as completed features.

This first manifest established specification-level coverage. Compatibility
Baseline 1 now promotes the M7 contracts that can remain stable through later
language work while retaining collection, IR, bootstrap-phase, and
standard-library surfaces as provisional. See
[0046-m7-compatibility-baseline.md](0046-m7-compatibility-baseline.md).

## Change Workflow

When adding or changing a public capability:

1. Add or update its numbered specification.
2. Update `specs/index.json` with exact metadata.
3. Add contract statements and executable evidence to the conformance
   manifest.
4. Implement focused tests and run `bun run check:contracts`.
5. Run the complete suite before marking implementation complete.

A specification must not be marked `implemented` without conformance coverage.
A feature must not be marked `stable` while its owning specification remains
only `accepted`.

## Acceptance Evidence

- The repository contract check reports complete implemented-spec coverage.
- Bun tests prove the current registry and manifest pass.
- Negative tests prove title drift, missing evidence locators, evidence outside
  the default suite, and uncovered implemented specifications fail with
  targeted errors.
- The default test target runs the checker before all compiler and integration
  suites.
