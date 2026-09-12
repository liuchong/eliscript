# 0147: Complete Stable Compatibility Corpus

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-08
- Depends on: 0046 M7 Compatibility Baseline,
  0136 Local Compatibility Migration Rehearsal,
  0139 Deterministic Persistent Semantics Corpus,
  0146 Complete Compiler Parity Corpus

## Summary

This specification defines the complete source-bound compatibility corpus for
every currently stable Eliscript core behavior. The corpus derives its scope
from the compatibility baseline and conformance manifest instead of accepting
a hand-maintained subset.

The corpus completes AC-02 when every core feature is stable and one clean
retained acceptance run passes. The maintained JavaScript package interop
fixture is now part of the stable corpus, while application adapters remain
outside core evidence.

## Versioned Contract

`contracts/stable-compatibility-corpus.json` uses format
`eliscript-stable-compatibility-corpus` version 1. It records:

- every stable core feature and its distinct stable specification owner
- every executable conformance locator for those features
- every tracked core fixture except an explicitly deferred provisional fixture
- the complete migration inventory from the local rehearsal contract
- the exact provisional core and excluded application feature boundaries
- direct local execution through `make test-core`
- one SHA-256 identity over the complete derived inventory and bound sources

The checker regenerates all derived arrays and counts. Editing only the JSON
contract cannot omit behavior or preserve a stale identity.

## Core Boundary

Core features are all stable or provisional compatibility-baseline features
except the exact application exclusions declared by the maturity contract.
The exclusions currently contain Org publishing and the Vite adapter. They do
not contribute specifications, evidence, fixtures, or maturity credit to this
corpus.

The JavaScript package interop fixture is stable core evidence. Its package
files are included in the fixture inventory and source-bound identity. The
checker retains generic provisional-fixture rules so a future provisional core
feature cannot enter the stable corpus silently.

## Evidence Closure

Every stable core feature contributes all of its conformance locators. The
existing conformance checker proves that each locator exists and is executed
by `make test-core`. The compatibility checker additionally binds:

- every owning stable specification
- every conformance evidence file
- every non-deferred tracked fixture
- every migration-rehearsal source
- the baseline, manifest, maturity boundary, Makefile, checker, and tests

The identity describes expected behavior rather than compiler implementation.
An implementation change is compatible when this frozen corpus still passes
without changing its observations.

## Migration Closure

The migration inventory is derived from
`contracts/compatibility-rehearsal.json`. Every specification classified as
superseded must appear as a migration source. Source rewrites, automatic data
migrations, and contract replacements retain their dedicated executable
evidence from specification 0136.

## AC-02 Gate

`readyForAc02` is derived and cannot be asserted manually. It becomes true
only when the provisional core feature inventory is empty. AC-02 additionally
requires one clean retained core acceptance run against that ready corpus.

At this revision the provisional core inventory is empty. The corpus is ready
for AC-02, and the final clean retained acceptance run supplies its execution
evidence.

## Acceptance Criteria

- **SCC-01:** Stable core features and distinct specification owners exactly
  match the compatibility baseline and conformance manifest.
- **SCC-02:** Every stable core conformance locator and every maintained core
  fixture is bound by one deterministic identity.
- **SCC-03:** Every superseded specification has an explicit migration record.
- **SCC-04:** Provisional fixtures cannot enter the stable corpus silently and
  cannot remain deferred after their feature becomes stable.
- **SCC-05:** Application adapters contribute no core evidence or completion
  credit.
- **SCC-06:** `make test-core` compiles and executes the complete frozen corpus
  under direct local tools.
- **SCC-07:** AC-02 remains incomplete until no provisional core feature
  remains and one clean retained acceptance run passes the resulting corpus.

## Compatibility Freeze

Format version 1, baseline-derived closure, distinct specification ownership,
fixture deferral semantics, migration closure, local execution, application
exclusion, source-bound identity, and conservative AC-02 readiness are stable.
