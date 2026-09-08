# 0125: Generated Library API Index

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-07
- Depends on: 0040 Project Maturity Roadmap and 1.0 Acceptance Contract, 0042 Specification Registry and Conformance Evidence, 0044 Public Surface Registry and Consistency Matrix

## Summary

Eliscript maintains explicit metadata for every standard-library module and
generates both a user-facing API page and a machine-readable API index from
that metadata. The generated index joins reviewed module descriptions and
stability classifications with the exact export inventory already enforced by
the public-surface contract.

This completes M11-03 without scraping implementation text for documentation,
duplicating export declarations, or introducing an application framework into
the language, compiler, runtime, or standard-library boundary.

## Authoritative Inputs

`contracts/library-api.json` is the human-authored module metadata contract. It
uses `eliscript-library-api-metadata` version 1 and records, for every module:

- the public module name
- the owning specification
- the canonical Eliscript source path
- the explicit stability classification inherited from the owning
  specification
- one role: `portable`, `runtime-core`, `host-interop`, or `state`
- a concise user-facing summary

`contracts/public-surface.json` remains the only explicit export inventory.
The generator joins records by module name and rejects a missing, duplicate,
stale, or reordered module. It also rejects source/specification disagreement,
unknown roles, empty summaries, non-implemented owning specifications, and a
stability value that differs from the owning specification's status.

The public-surface checker independently compares each declared export list
with the terminal `export` form in its Eliscript source. The generator does not
parse implementation source and cannot silently create documentation for an
undeclared export.

## Generated Artifacts

`tools/surface/generate-api.mjs` emits two deterministic artifacts:

- `docs/pages/api-index.json`, using `eliscript-library-api-index` version 1
- `docs/pages/api.html`, the searchable user-facing module and export index

The machine-readable index records exact module/export counts and normalized
module records. The HTML groups modules by explicit role, displays inherited
stability, links to source and owning specifications, and exposes the exact
ordered export list. Neither artifact includes timestamps, host paths, runtime
versions, or other nondeterministic input.

`bun run generate:api` rewrites both artifacts. The default contract gate runs
the same generator with `--check` and fails when either committed artifact
differs by one byte.

## Stability Meaning

Module stability is not inferred from age, test count, or current usage. It is
exactly the lifecycle status of the owning normative specification:

- `accepted` means implemented and reviewed but still provisional before 1.0
- `stable` means part of the compatibility-frozen contract

An individual exported name inherits its module's declared stability until a
future specification introduces finer-grained export metadata. The generator
must never promote a module beyond its owning specification.

## Scope Boundary

This index covers the 29 maintained modules under `stdlib/` that are already
tracked by the public-surface contract. Runtime JavaScript facades, compiler
internals, commands, editor APIs, optional integrations, and application
frameworks are outside this index. Host capability packages are specified
separately by [0126](0126-explicit-host-capability-packages.md).

The static documentation page is an output consumer. It contributes no new
language forms, runtime semantics, library dependencies, or maturity evidence
beyond proving that the explicit core metadata is complete and reproducible.

## Compatibility Freeze

The version 1 metadata and generated-index formats, closed role vocabulary,
source/specification/stability joins, lexical ordering, exact export
projection, deterministic HTML hooks, and byte-exact `--check` behavior are
stable. The recorded module and export counts are source-derived baseline
facts, not permanent upper limits; compatible library additions must update
the authoritative inventories and regenerated artifacts together.

## Acceptance Criteria

- **API-01:** Metadata covers exactly every standard-library module in the
  public-surface contract, in lexical order.
- **API-02:** Every metadata record names the same source and specification as
  its public-surface record.
- **API-03:** Every module's stability equals its owning specification status.
- **API-04:** Every role belongs to the closed version 1 role set and every
  summary is non-empty and trimmed.
- **API-05:** The generated JSON contains exactly 29 modules and 304 exports.
- **API-06:** The generated JSON export lists equal the checked public-surface
  lists exactly.
- **API-07:** The generated HTML exposes every module and export, role groups,
  stability, source links, specification links, and deterministic search hooks.
- **API-08:** `--check` rejects missing or byte-stale generated artifacts.
- **API-09:** Negative tests reject incomplete inventory and overstated
  stability.
- **API-10:** Default contract checks, the complete test suite, and strict
  Emacs byte compilation pass without application-framework evidence.
