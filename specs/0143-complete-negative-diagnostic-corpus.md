# 0143: Complete Negative Diagnostic Corpus

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-08
- Depends on: 0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0043 Structured Compiler Diagnostics

## Summary

Eliscript freezes the complete maintained negative language-conformance corpus
as versioned machine-readable data. The corpus contains every invalid reader,
macro-expander, and analyzer case in their canonical fixture order, including
the exact human error and complete structured diagnostic produced by both the
seed and self-hosted compilers.

This contract closes AC-03. It is executed directly by local Emacs, Bun, Node,
and filesystem tools. A sandbox, container, virtual machine, hosted CI service,
application framework, or publishing system is neither required nor accepted
as substitute evidence.

## Versioned Inventory

Version 1 owns these exact suites:

| Suite | Valid control cases | Negative cases | Diagnostic codes |
| --- | ---: | ---: | --- |
| Reader | 21 | 16 | `ELI-R0001` |
| Expander | 40 | 20 | `ELI-X0001` |
| Analyzer | 30 | 57 | `ELI-A0001`, `ELI-P0001` |
| **Total** | **91** | **93** | - |

The valid controls prove that the fixture is not an error-only substitute for
phase conformance. The 93 negative entries are the complete shared stable
language scope described by Specification 0043. CLI option and host fallback
failures remain boundary integration cases; they are not language-conformance
entries and do not replace any reader, expansion, or analysis case.

Each negative entry freezes:

- the suite-qualified case name and canonical order
- the exact default human diagnostic
- format, schema version, code, severity, phase, and message
- source filename and exact start and end offset, line, and column

The complete ordered suite payload has the version 1 SHA-256 identity
`24dd859354796bcd69eb999f0e7be26e64987f731135f26ee5b2e517cd3ebc8b`.

## Completeness Contract

`contracts/diagnostic-corpus.json` is the normative executable inventory. Its
checker rejects a missing, additional, reordered, or renamed case; changed
fixture counts; incomplete schema fields; invalid coordinates; human rendering
drift; phase/code drift; duplicate names; and identity drift.

The three canonical fixture `invalid` arrays are the only source lists for
negative reader, expander, and analyzer conformance. Adding a negative language
case therefore changes its suite count and makes the contract fail until the
new complete diagnostic is reviewed and frozen. Removing or reclassifying a
case requires the same explicit contract and specification revision.

`bun tools/diagnostics/check.mjs --generate` runs the Emacs seed oracles and
rebuilds the snapshot for intentional review. The normal checker never rewrites
the contract. Generated output has no authority until its diff, complete core
suite, and compatibility baseline are accepted together.

## Seed and Self-hosted Equality

The reader, expander, and analyzer bootstrap tests load this contract directly.
For every negative case they require exact object equality over the default
human error and every structured diagnostic field. Each suite also compares
the complete seed result list with the self-hosted result list, so neither side
can drift together away from the frozen corpus.

JSON round trips preserve the complete diagnostic object. Human text must be
exactly the structured location prefix followed by the structured message.
Dedicated CLI integration tests continue to prove that the public human and
JSON switches select those two representations without changing semantics.

## Acceptance Criteria

- **NDC-01:** The contract contains exactly 16 reader, 20 expander, and 57
  analyzer negative cases in canonical fixture order.
- **NDC-02:** Every case freezes exact human text and every required version 1
  structured diagnostic field, including both source positions.
- **NDC-03:** Fixture inventory, valid controls, case identity, rendering, and
  complete payload digest are checked by the default core contract gate.
- **NDC-04:** Seed and self-hosted reader, expander, and analyzer results equal
  the same frozen entries without normalization or partial matching.
- **NDC-05:** Public human and JSON diagnostic modes retain dedicated CLI
  integration evidence.
- **NDC-06:** Intentional diagnostic changes revise the fixture, snapshot,
  specification, and compatibility baseline together.
- **NDC-07:** The complete gate runs locally without network, hosted service,
  isolation runner, application framework, or publishing dependency.

AC-03 is complete only while all seven criteria pass in the default core suite.
