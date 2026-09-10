# 0146: Complete Compiler Parity Corpus

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-08
- Depends on: 0003 Implemented Core Language,
  0019 Self-hosted Compiler Driver,
  0108 Versioned Canonical IR Serialization,
  0134 Versioned Core Acceptance Corpus,
  0143 Complete Negative Diagnostic Corpus

## Summary

This specification closes the local compiler-parity contract required by
AC-05. One versioned, source-bound corpus proves that the Emacs Lisp seed and
self-hosted compilers agree over every required observable compiler boundary:

1. source acceptance
2. complete diagnostics
3. canonical IR
4. emitted ESM
5. Source Map documents
6. portable dependency closures
7. project graphs

The corpus does not replace the underlying differential tests. It makes their
completeness machine-checkable and binds them to the exact stable language,
compiler, bootstrap, macro, portable, and project feature inventory.

## Versioned Contract

`contracts/compiler-parity-corpus.json` uses format
`eliscript-compiler-parity-corpus` version 1. It records:

- the six feature domains whose stable contracts require compiler parity
- the exact ordered stable feature identifiers derived from conformance data
- the four reader, analyzer, expander, and IR shared fixtures and case counts
- all thirteen maintained compiler modules under `bootstrap/compiler`
- all 57 public IR node kinds
- all 93 source-derived negative diagnostic cases
- the seven required parity dimensions and their executable test locators
- one SHA-256 identity over the complete derived inventory and every bound
  source file

The checker derives these inventories independently. Editing only the contract
cannot add coverage or preserve a stale identity.

## Feature Closure

The parity feature set is the exact set of stable conformance features whose
identifier begins with one of:

```text
bootstrap. compiler. language. macro. portable. project.
```

There are currently 64 such features. A newly stable feature in one of these
domains makes the corpus stale until its source behavior is included in the
shared fixtures or an existing bound parity test and the corpus identity is
reviewed again.

Application adapters, publishing, UI frameworks, and bundlers do not
contribute to compiler parity.

## Shared Inputs

The maintained shared fixtures contain:

| Phase | Valid | Invalid |
| --- | ---: | ---: |
| Reader | 21 | 16 |
| Expander | 40 | 20 |
| Analyzer | 30 | 57 |
| IR and emission | 28 | 0 |

The fixtures include every compiler module as a file-backed case. The IR
fixture reaches the complete public node-kind vocabulary, while the negative
reader, expander, and analyzer cases are frozen by specification 0143.

## Evidence Semantics

Every dimension points to a named test in the default core suite. The checker
requires each locator to exist in its declared file and requires that file to
appear in `make test-core`. The source identity covers the Makefile, feature
manifest, specification index, every owning stable specification, every
conformance evidence file, public IR inventory, shared fixtures, compiler
modules, and every dimension evidence file.

A passing corpus check proves inventory and source closure. AC-05 additionally
requires the complete core suite to execute successfully so every bound
differential test actually runs.

## Scope Boundary

This contract closes compiler parity on one local source identity. It does not
claim the multi-operating-system or multi-Emacs evidence required by AC-04,
AC-10, AC-12, AC-13, or AC-21. Those criteria remain independently incomplete
until their full supported matrices are recorded.

## Acceptance Criteria

- **CP-01:** The corpus derives the exact stable feature set from the six
  compiler-relevant conformance domains.
- **CP-02:** Reader, expander, analyzer, IR, ESM, Source Map, closure, and
  project-graph evidence is present through the seven required dimensions.
- **CP-03:** Shared fixture counts, all thirteen bootstrap modules, all 57 IR
  kinds, and all 93 negative diagnostics match their authoritative sources.
- **CP-04:** Every evidence locator exists and runs in the default core suite.
- **CP-05:** One deterministic SHA-256 identity binds the complete inventory
  and every source that defines or proves it.
- **CP-06:** Missing features, modules, IR kinds, fixture cases, dimensions,
  evidence, or source changes are rejected.
- **CP-07:** The full local core suite passes with seed/self-hosted equality at
  every bound differential test.

## Compatibility Freeze

Format version 1, the seven parity dimensions, derivation from stable feature
status, source-bound identity, and conservative local-only claim are stable.
Compatible additions may expand fixtures and evidence. Removing a dimension or
excluding a stable compiler-relevant feature requires a superseding contract.
