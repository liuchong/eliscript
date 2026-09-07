# 0137: Complete Core Documentation Set

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-08
- Depends on: 0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0044 Public Surface Registry and Consistency Matrix,
  0133 Verified Installation and Daily Development Guide

## Summary

Eliscript maintains one closed, machine-checked core documentation set for the
language, compiler, runtime-facing interoperation, project toolchain, Emacs
development experience, worker acceleration, troubleshooting, and contribution
workflow. The set is indexed from `docs/README.md` and versioned by
`contracts/documentation.json`.

Application frameworks, bundlers, publishing systems, site generators,
development servers, and hosting remain outside this core gate. Their optional
guides may link to the core public surface but cannot satisfy M13-04 or AC-23.

## Required Documents

The version 2 contract requires current documents for:

1. getting started
2. language reference
3. macros
4. JavaScript interoperation
5. project configuration
6. compiler architecture
7. Emacs mode
8. terminal REPL
9. Emacs worker and acceleration
10. troubleshooting
11. contribution workflow

Each document has an exact ordered section inventory and a small set of public
terms that must remain present. The project README links the documentation hub,
and the hub links every required document.

## Link Integrity

The checker parses Markdown links in every required document. Local targets are
resolved relative to the containing document, must remain inside the repository,
and must exist as regular files. External URLs are not fetched and therefore do
not become local acceptance evidence.

## Executable Snippets

Required runnable blocks use an adjacent
`<!-- eliscript-snippet:identifier -->` marker. The identifier, containing
document, fence language, execution kind, runtime set, and expected stdout are
closed by the contract.

Module snippets compile through the public self-hosted command into a temporary
directory inside the package scope and execute under Bun and Node. The project
configuration snippet is parsed and checked against the version 1 request
shape. The REPL transcript runs through the public persistent terminal command
without prompts. Temporary artifacts are removed before the check returns.

## Drift Policy

Documentation does not own public names, schemas, or maturity status. Normative
specifications and machine-readable registries remain authoritative. The
documentation gate catches missing sections, stale required terms, broken local
links, missing or duplicated snippet markers, changed snippet output, invalid
configuration, and application leakage into the required inventory.

## Commands

```sh
bun tools/documentation/check.mjs
bun test tests/onboarding-docs.test.mjs
make test-core
```

All commands run directly in the local checkout. No hosted documentation build,
container, virtual machine, browser server, or application framework is needed.

## Implementation Evidence

`tools/documentation/check.mjs` enforces the closed version 2 contract across
all eleven documents. The maintained test suite checks the positive inventory,
rejects broken links and changed executable behavior, rejects application
substitution, and executes the complete checkout onboarding path through public
commands and the Emacs mode.

## Acceptance Criteria

- **CDS-01:** All eleven AC-23 document categories are present in one closed,
  versioned contract.
- **CDS-02:** Every required document contains its ordered current sections and
  required public terminology.
- **CDS-03:** The project README reaches one core documentation hub and that hub
  reaches every required document.
- **CDS-04:** Every local Markdown link in the required set resolves to a regular
  repository file without escaping the repository root.
- **CDS-05:** Marked module, macro, interop, configuration, and REPL snippets
  execute or validate with exact expected results.
- **CDS-06:** Missing sections, entry points, links, markers, invalid snippets,
  and application evidence fail automated tests.
- **CDS-07:** Optional application and publishing documentation remains outside
  the core contract and contributes no core maturity evidence.
