# 0113: Versioned Multi-entry Project Identity

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0030 Project Graph Manifest,
  0032 Build Decision Reports,
  0106 Versioned Project Request Configuration,
  0110 Self-hosted Incremental Project Cache,
  0112 Unified Self-hosted Build Operation

## Summary

Eliscript project builds may now declare more than one source entry while
retaining one deterministic module graph, manifest digest, incremental cache,
and build report. Multi-entry identity is owned by the compiler and project
toolchain. The Emacs Lisp seed and generated compiler implement the same
contract, and the public project command executes it under Bun or Node.

Version 1 single-entry requests, manifests, reports, command output, and worker
behavior remain unchanged. Version 2 is selected explicitly by an `entries`
array and never changes the meaning of a version 1 `entry` field.

Application frameworks, UI libraries, bundlers, publishing systems, blog and
site generators, hosting, and development servers are replaceable consumers.
They are not dependencies, design inputs, core goals, acceptance evidence, or
maturity credit for this capability.

## Request And Configuration Version 2

The normalized multi-entry project request has this shape:

```json
{
  "format": "eliscript-project-request",
  "version": 2,
  "entries": ["src/admin.eli", "src/main.eli"],
  "outDir": "dist",
  "root": "src",
  "portableEntries": [],
  "useCache": true
}
```

The corresponding configuration is:

```json
{
  "schemaVersion": 2,
  "sourceRoot": "src",
  "entries": ["admin.eli", "main.eli"],
  "outDir": "dist",
  "portableEntries": [],
  "cache": true
}
```

`entries` is required, non-empty, duplicate-free, and contains only non-empty
contained relative paths in configuration files. Normalized requests sort
entry paths lexically and freeze the array. Version 2 rejects `entry`; version
1 rejects `entries` as an unknown key. Direct multi-entry command invocations
require an explicit project root so containment and output identity are not
derived from an arbitrary first argument. Distinct path spellings that resolve
to the same canonical source reject instead of silently changing entry count or
manifest version.

The version 2 build-operation record carries the same frozen `entries` array
and has version 2. Single-entry project and single-file operations retain
version 1.

Portable selection currently names functions relative to one source entry.
Therefore a request with more than one source entry and non-empty
`portableEntries` rejects before graph traversal. A future per-entry portable
root model requires its own versioned contract and cannot reinterpret this
schema.

## Manifest Version 2

A multi-entry build writes:

```json
{
  "format": "eliscript-project",
  "version": 2,
  "entries": ["admin.mjs", "main.mjs"],
  "modules": [],
  "digest": "<sha256>"
}
```

Entry outputs are sorted, unique, relative to the output root, and all appear
in the module graph. The graph digest is SHA-256 over compact JSON containing
`format`, `version`, `entries`, and the ordered module records. A single-entry
build continues to write the byte-compatible version 1 identity with `entry`.

The private cache remains `eliscript-project-cache` version 2. Cache lookup
validates the complete public v1 or v2 entry identity before trusting private
module metadata. Changing the entry set produces `entries-changed`; unchanged
multi-entry graphs may fully reuse artifacts written by Bun, Node, or the seed
when compiler identity also matches.

## Report And Public Results

Multi-entry builds return `eliscript-project-build` version 2 with frozen
`entries` and `entryOutputs` arrays. The legacy singular `entry` and
`entryOutput` fields remain available only for a one-entry result.

The build report similarly uses version 2 and replaces the singular fields:

```json
{
  "format": "eliscript-build-report",
  "version": 2,
  "entries": ["admin.eli", "main.eli"],
  "entryOutputs": ["admin.mjs", "main.mjs"]
}
```

All cache, count, timing, module, diagnostic, and Source Map semantics remain
those of report version 1. Without `--json`, the public and seed project
commands print one absolute generated entry path per line in identity order.

## Worker Contract

The worker accepts manifest version 1 and version 2. For version 2 it verifies
that entries are sorted and unique, requires the requested module to match one
declared entry, verifies the graph digest and every artifact, and then uses the
shared graph digest as module generation identity. Either declared entry can
therefore start the same verified project generation.

## M9 Completion

This specification closes the remaining M9 multi-entry identity item. Normal
single-file, single-entry project, and multi-entry project builds now use the
self-hosted compiler operation under supported JavaScript hosts. The seed is a
non-circular bootstrap and differential reference rather than the only
implementation of any normal build mode.

M9 completion does not claim formatter, REPL, editor-mode, standard-library,
reliability, security, or final 1.0 acceptance work assigned to later
milestones.

## Acceptance Criteria

- **MEI-01:** Version 1 single-entry requests, manifests, reports, and command
  output remain compatible.
- **MEI-02:** Version 2 requests and configurations require a closed,
  validated, sorted, unique, frozen `entries` array.
- **MEI-03:** One graph traversal compiles the union of all entry closures and
  emits every shared module once.
- **MEI-04:** Manifest version 2 digests `entries` and ordered module records;
  cache lookup rejects a changed entry set and fully reuses an unchanged one.
- **MEI-05:** Build result and report version 2 expose corresponding `entries`
  and `entryOutputs`; default CLI output prints each output exactly once.
- **MEI-06:** The worker accepts either declared version 2 entry and rejects a
  requested module outside the declared set.
- **MEI-07:** Seed, Bun, and Node emit byte-identical ESM, Source Maps, and
  public manifest identity for the shared multi-entry corpus.
- **MEI-08:** Multi-entry portable selection rejects until a later contract
  defines unambiguous per-entry portable roots.
- **MEI-09:** Application frameworks and application tooling remain outside
  core implementation, dependencies, goals, evidence, and maturity credit.
