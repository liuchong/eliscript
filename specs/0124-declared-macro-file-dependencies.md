# 0124: Declared Macro File Dependencies

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-07
- Depends on: 0005 Compile-time Macros,
  0016 Portable Macro Expander,
  0031 Incremental Project Builds,
  0035 Deterministic Seed Macros,
  0065 Deterministic Macro-generated Names and Capture Rules,
  0106 Versioned Project Request Configuration,
  0110 Self-hosted Incremental Project Cache

## Summary

Eliscript macros may read immutable project inputs through one explicit,
deterministic capability. A project opts into `read-file`, declares the exact
relative files that may be observed, and receives their snapshotted UTF-8 text
through the compiler context. Macros have no ambient filesystem access.

The seed and self-hosted compilers consume the same context contract. Project
builds record each declared input by contained path and SHA-256 digest in
manifests, reports, and private cache identity. Changing a declared file
therefore recompiles every module conservatively, even when the host source
files are unchanged.

## Macro API

The compile-time form is:

```elisp
(macro-read-file path-string)
```

It requires exactly one non-empty literal or computed string. Evaluation
fails when `read-file` is not enabled or when the exact string is absent from
the declared file table. The result is the immutable UTF-8 text snapshot
associated with that declaration.

The ordinary compiler API supplies no capabilities and an empty file table by
default. A direct API caller may provide a context with `capabilities` and
`files`, but the evaluator never resolves paths or reads files itself. This
keeps compile-time language policy independent of Emacs, Bun, Node, and host
filesystem APIs.

## Project Configuration

Project configuration versions 1 and 2 accept two optional fields:

```json
{
  "macroCapabilities": ["read-file"],
  "macroFileDependencies": ["build-value.txt"]
}
```

Both default to empty arrays. Capability names and dependency paths are
non-empty, duplicate-free strings. `read-file` is the only supported macro
capability. A non-empty dependency list requires that capability.

Dependency paths are interpreted relative to `sourceRoot`. They must be safe
relative paths without `..`, must resolve to regular files, and must remain
inside the canonical project root after symbolic-link resolution. Different
declared paths that resolve to the same canonical file reject as duplicates.

Every dependency must contain valid UTF-8. Its recorded digest is SHA-256 over
the exact file bytes, while `macro-read-file` receives the corresponding text.
The host reads and validates each file before graph planning, so every module
in one operation sees the same immutable snapshot.

## Build Identity And Invalidation

Declared macro dependencies are project-wide inputs. Each module record in the
public manifest, build report, and private cache carries an ordered
`macroDependencies` array of `{path, digest}` records when the list is
non-empty. Empty declarations preserve the previous serialized shape.

The conservative project-wide model deliberately recompiles every module when
any declared file digest changes and reports `macro-dependencies-changed`.
This is predictable and cannot miss a dependency hidden behind macro control
flow. A future per-module dependency protocol may reduce invalidation only
through a separately versioned contract.

Generated source imports remain ordinary project-graph edges discovered after
macro expansion. Declared macro files are compile-time inputs, not source
modules or emitted runtime imports.

## Capability Boundary

This contract grants no network, environment-variable, process, clock,
randomness, directory-listing, glob, write, or undeclared read capability.
There is no fallback from the macro evaluator to host functions. Project
configuration cannot name an unsupported capability, escape the source root,
or convert an invalid byte sequence into host-dependent replacement text.

The capability is compiler core behavior. Application frameworks, bundlers,
publishing systems, blog generators, hosting, and development servers neither
define it nor contribute implementation or maturity evidence.

## Compatibility

The optional fields extend the accepted project request schemas without
changing existing version 1 or version 2 operations. Projects that omit them
retain empty-capability macro behavior, byte-compatible manifests, and the
existing cache identity. Once present, path and digest records are public,
stable build identity.

Seed, self-hosted Bun, and self-hosted Node builds must emit byte-identical
JavaScript, Source Maps, and public manifest identity for the same declared
inputs.

## Acceptance Criteria

- **MDF-01:** Macro evaluation has no capability unless a caller supplies one.
- **MDF-02:** `macro-read-file` requires exactly one string argument and the
  `read-file` capability.
- **MDF-03:** A read succeeds only for an exact entry in the declared file
  table and returns its snapshotted text.
- **MDF-04:** Project configuration versions 1 and 2 normalize optional,
  duplicate-free capability and dependency arrays.
- **MDF-05:** Only `read-file` is accepted, and declared files require it.
- **MDF-06:** Dependency paths are relative to `sourceRoot`, canonicalized,
  regular, duplicate-free, and contained after symbolic-link resolution.
- **MDF-07:** Invalid UTF-8 input rejects before expansion.
- **MDF-08:** Public manifests, build reports, and cache records contain
  ordered path plus SHA-256 records for non-empty declarations.
- **MDF-09:** A changed declared file recompiles all project modules with
  `macro-dependencies-changed`; unchanged inputs remain reusable.
- **MDF-10:** Macro-generated imports still participate in ordinary graph
  discovery and do not become file-capability declarations.
- **MDF-11:** Seed and self-hosted builds emit identical ESM, Source Maps, and
  public manifest identity for the maintained fixture.
- **MDF-12:** Generated compilers and resulting modules execute equivalently
  under Bun and Node.
- **MDF-13:** No application framework or application tooling contributes to
  this contract's implementation, dependencies, evidence, or maturity credit.
