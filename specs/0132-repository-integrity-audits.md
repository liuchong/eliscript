# 0132: Repository Dependency and Generated-artifact Audits

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-08
- Depends on: 0019 Self-Hosted Compiler Driver,
  0045 Continuous Compatibility Matrix,
  0125 Generated Library API Index,
  0131 Source-bound Core Performance Baseline

## Summary

Eliscript maintains one machine-readable repository-integrity contract and one
default audit command for dependency boundaries and generated artifacts. The
contract pins every JavaScript package, declares where it may be imported,
requires zero third-party package imports in the language core, registers every
maintained generated module, and enumerates every retained benchmark report.

The audit uses structured JavaScript import scanning and the freshly
self-hosted compiler IR for Eliscript sources. It recompiles deterministic
artifacts in memory, invokes the owning generators for derived artifacts, and
recomputes every benchmark source binding. A successful audit therefore proves
the current tracked repository rather than trusting a hand-maintained list of
claims.

## Integrity Contract

`contracts/repository-integrity.json` is the authoritative versioned contract.
It contains four independent inventories:

- exact package names, versions, package-manifest sections, and allowed source
  path prefixes
- maintained JavaScript and Eliscript source roots plus constrained host,
  self-package, and virtual-module specifiers
- deterministic compiler outputs and generator-owned derived outputs
- the exact set of retained source-bound benchmark reports

Entries are safe relative paths, unique, and sorted. Package sections are
closed: an undeclared dependency or an extra package in any supported section
fails the audit. The lockfile must accept a frozen, script-free dry run without
modification.

## Dependency Boundaries

All tracked `.mjs` and `.js` files are scanned with Bun's parser-backed import
scanner. All tracked `.eli` files under the declared compiler, standard-library,
and example roots are compiled to IR by a freshly built self-hosted compiler;
import declarations are collected recursively from that IR.

Relative imports remain inside the repository graph. Bare package imports must
match one declared package and one allowed source prefix. Bun host modules,
Node built-ins, `eliscript/` self-imports, and virtual modules have separate
explicit boundaries. Every compiler, runtime, editor, platform, and standard
library source root must retain zero third-party package imports.

The dependency contract covers statically declared module specifiers, including
literal dynamic imports reported by the host scanner. Runtime-computed host
capabilities remain governed by the separate capability and hostile-boundary
contracts.

## Generated Artifacts

Generated Eliscript modules carry the canonical generated-file marker. The
marker inventory must exactly equal the deterministic artifact registry; a
newly generated but undeclared module and a removed registry entry both fail.

The audit recompiles four sources through the self-hosted compiler and compares
seven JavaScript and Source Map outputs byte for byte without rewriting the
working tree. It also runs the compatibility-workflow and library-API generators
in check mode and verifies their three declared outputs.

All 14 tracked benchmark JSON files must exactly match the benchmark registry.
Each report must expose a recognized Eliscript report identity and a non-empty
SHA-256 source binding. The audit verifies every individual digest and the
report's aggregate digest, currently covering 265 source bindings.

## Commands

| Command | Contract |
| --- | --- |
| `bun run check:integrity` | Run the complete repository-integrity audit |
| `bun run audit:dependencies` | Check packages, frozen lockfile, and import boundaries |
| `bun run audit:artifacts` | Check deterministic, derived, and benchmark artifacts |
| `make check-contracts` | Run the integrity audit with all default repository contracts |

The audit prints a machine-derived count summary and exits nonzero with all
available boundary or artifact failures. Child operations have a bounded
lifetime, receive a graceful termination request on timeout, and are forcibly
reclaimed if they do not exit.

## Acceptance Criteria

- **RIA-01:** One versioned contract exactly declares package versions,
  manifest sections, source boundaries, generated outputs, and benchmark
  reports.
- **RIA-02:** A frozen lockfile dry run succeeds without lifecycle scripts or
  repository mutation.
- **RIA-03:** Every tracked JavaScript module and every maintained Eliscript
  source is scanned through a structured parser or compiler IR.
- **RIA-04:** Undeclared packages and imports outside their allowed roots fail,
  while all core roots retain zero third-party package imports.
- **RIA-05:** Generated-file markers exactly match the deterministic artifact
  registry; missing and undeclared entries fail.
- **RIA-06:** Four self-hosted compilation entries reproduce all seven tracked
  JavaScript and Source Map outputs byte for byte in memory.
- **RIA-07:** The compatibility workflow and library API generators validate
  all three declared derived outputs without rewriting them.
- **RIA-08:** The exact 14-report benchmark inventory validates all 265 current
  individual and aggregate source bindings.
- **RIA-09:** Default tests reject an undeclared package, an out-of-boundary
  package, stale benchmark evidence, and incomplete artifact registries.
- **RIA-10:** React, Vite, publishing, sites, hosting, and development servers
  remain application or tool validation only and contribute no core maturity
  implementation or acceptance evidence.
