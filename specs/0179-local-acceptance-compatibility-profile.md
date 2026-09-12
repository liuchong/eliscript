# 0179: Local Acceptance Compatibility Profile

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-13
- Depends on: 0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0045 Continuous Compatibility Matrix,
  0142 Maintained JavaScript Package Interop Fixture

## Summary

Eliscript separates the environments it intends to support from the environments
required to accept the current core release candidate. Linux x64 remains in the
maintained target matrix, but absence of a Linux host does not block this final
acceptance. The required local acceptance profile is macOS arm64 with Emacs 29.4
and 30.2, Bun 1.4.0, and Node 24.20.0.

This is a support-policy migration, not removal of Linux compatibility. Linux
cells continue to be generated, validated when retained, and reported as
optional missing evidence. They may become acceptance-required again through a
later explicit specification and contract change.

## Contract Extension

`contracts/compatibility-matrix.json` adds the sorted, non-empty
`acceptanceOperatingSystems` field to format version 1. Every identifier must
name an entry in `operatingSystems`.

The two sets have distinct meanings:

- `operatingSystems` declares maintained compatibility targets and continues to
  contain Linux x64 and macOS arm64.
- `acceptanceOperatingSystems` selects which target systems are mandatory for
  the current final acceptance profile.

The Emacs versions, Bun and Node versions, command sequence, report format, and
clean-source binding remain unchanged. The generated workflow therefore retains
all four target jobs even though only the two macOS cells are required by the
local final gate.

## Evidence Aggregation

`expectedMatrixCells` derives all target cells. `requiredMatrixCells` derives
only acceptance-required cells. Every retained report, including an optional
Linux report, must still pass full schema, environment, command, source-tree,
and source-identity validation.

Aggregation reports target count, required count, retained count, missing
required cells, and missing optional cells independently. Completion is true
only when every required cell passes against the current source identity.
Missing optional cells remain visible but cannot lower acceptance completion.

## Migration Rationale

The previous final gate required all four Linux/macOS cells. Current development
and acceptance are performed directly on local machines, without hosted
repository validation, containers, virtual machines, or sandbox runners. No
qualified Linux host is part of this acceptance environment. Treating that
unavailable host as mandatory would measure infrastructure availability rather
than language correctness on the declared acceptance host.

Existing Linux claims are therefore preserved as targets while their evidence
is deferred. No program semantics, public API, compiler output, fixture, or
toolchain command is weakened by this migration.

## Acceptance Criteria

- **ACP-01:** Target operating systems and acceptance-required operating systems
  are explicit, sorted, non-empty, and referentially valid contract data.
- **ACP-02:** Linux x64 remains a target with Emacs 29.4 and 30.2 and continues
  to appear in the generated compatibility workflow.
- **ACP-03:** macOS arm64 with Emacs 29.4 and 30.2 is the complete required local
  acceptance profile.
- **ACP-04:** Every retained required or optional report receives identical
  environment, command, cleanliness, and source-identity validation.
- **ACP-05:** Missing Linux reports are visible as optional gaps and do not
  block completion of the current final acceptance.
- **ACP-06:** A later change to either target support or the required acceptance
  profile requires an explicit contract and specification update.

## Compatibility Freeze

The distinction between target and acceptance-required systems, referential
validation, complete retained-report validation, and explicit optional-gap
reporting are stable. The members of either set may change only through an
intentional support-policy specification.
