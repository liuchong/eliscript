# 0109: Self-hosted Build Decision Reports

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0032 Build Decision Reports,
  0033 Build Phase Timings,
  0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0107 Self-hosted Project Graph Planning

## Summary

The self-hosted compiler now owns construction of the public
`eliscript-build-report` version 1 protocol. The report operation normalizes
module decisions, derives compiled and reused counts, derives the cache status
and reason, rounds phase timings, and returns deeply frozen protocol records.

The standards-based project host supplies paths, completed module decisions,
and measurements from real filesystem work. It does not independently define
the report schema or cache-status policy. Seed, Bun-hosted, and Node-hosted
cache-free project builds therefore expose the same stable report identity.

Application frameworks, bundlers, publishing systems, blog and site
generators, hosting, and development servers are replaceable consumers. They do
not participate in this protocol, its implementation, or its acceptance
evidence.

## Compiler API

The generated compiler exports:

- `project-build-report-format`, equal to `eliscript-build-report`
- `project-build-report-version`, equal to `1`
- `project-build-report`, a synchronous normalization and policy operation

The operation accepts one host-supplied record containing the build mode,
canonical root and output directory, relative artifact paths, graph digest,
portable roots, cache-read outcome, phase timings, and module decisions.

It returns the version 1 schema defined by specification 0032. Module records
are sorted by source path. Dependency paths and portable entry names are sorted
and deduplicated. Report records and arrays are frozen. Timings are finite,
non-negative milliseconds rounded to three decimal places.

## Derived Decisions

The compiler derives counts from module status rather than trusting duplicated
host counters. It derives the top-level cache decision as follows:

| Condition | Status | Reason |
| --- | --- | --- |
| cache disabled | `disabled` | `cache-disabled` |
| no module reused | `miss` | cache lookup reason |
| every module reused | `hit` | `verified` |
| compiled and reused modules both exist | `partial` | `dirty-modules` |
| verified cache read but every module became dirty | `miss` | `all-modules-dirty` |

This policy is written in Eliscript. A host performs effects and reports facts;
it cannot silently reinterpret the public protocol.

## Host Boundary

`bootstrap/host/project.mjs` measures work and manifest-write phases, converts
canonical paths to report-relative paths, and passes the completed module
decisions to the generated compiler. The returned project result exposes the
frozen report as `report`.

The self-hosted host now reads versioned private metadata and reports disabled,
miss, partial, and hit outcomes through the same compiler-owned operation.
Cache identity, migration, artifact verification, and partial reuse are defined
by specification 0110 rather than by this reporting layer.

## Reproducibility

The cache-free seed command and self-hosted project service build the same
ordinary and portable graphs. After excluding the output-directory location and
non-deterministic timing values, their complete report objects must be equal.
The self-hosted report must have that identity under both Bun and Node. Timings
are checked structurally and for non-negative finite values rather than compared
byte-for-byte.

## Acceptance Criteria

- **SBR-01:** The report format, version, normalization, counts, cache status,
  and cache reason are owned by generated Eliscript code.
- **SBR-02:** Module decisions are sorted, dependency and portable-entry lists
  are canonical, and all returned protocol records are frozen.
- **SBR-03:** Report timings are finite, non-negative, and rounded to three
  decimal places without entering deterministic graph identity.
- **SBR-04:** Cache-free ordinary and portable reports match seed semantics
  under both Bun and Node.
- **SBR-05:** The host reports disabled, miss, partial, and hit behavior
  honestly; report normalization remains independent of cache effects and
  default CLI routing.
- **SBR-06:** Application frameworks, UI libraries, bundlers, publishing,
  sites, hosting, and development servers remain outside core implementation,
  evidence, goals, and maturity credit.
