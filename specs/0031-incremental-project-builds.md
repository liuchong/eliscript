# 0031: Incremental Project Builds

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0024 Project Builds,
  0030 Project Graph Manifest

## Summary

The Emacs project builder now reuses verified modules from the previous
`eliscript-project.json`. Incrementality is conservative: a cache hit must prove
that the build configuration, compiler implementation, source bytes, generated
ESM, Source Map, and dependency metadata still agree.

No cache decision changes the public graph identity. The existing top-level
`digest` remains a hash of entry and module content records only.

## Cache Metadata

The manifest adds a private `cache` object after the graph digest:

```json
{
  "cache": {
    "version": 1,
    "compilerDigest": "<sha256>",
    "mode": "portable",
    "portableEntries": ["score-document"],
    "modules": [
      {
        "source": "examples/emacs-index/index.eli",
        "dependencies": ["stdlib/data.eli"],
        "portableEntries": ["score-document"]
      }
    ],
    "digest": "<sha256>"
  }
}
```

The cache digest covers the ordered metadata fields before its own `digest` is
added. This prevents damaged dependency edges from being trusted while keeping
private build mechanics outside the runtime graph digest.

`compilerDigest` hashes the relative name and exact bytes of every Emacs Lisp
compiler source. A compiler edit therefore invalidates all cached modules even
when project sources are unchanged. Mode, entry, and normalized portable entry
names must also match.

## Standard Builds

An unchanged standard module is reused only when:

- its exact source digest matches
- its expected root-relative output and map paths match
- both generated files exist and match their declared digests
- its cached dependencies still resolve to regular sources below the project
  root
- the complete cache metadata digest is valid

The builder follows verified cached dependency edges without parsing or
lowering that module. A changed dependency recompiles independently; importers
remain reusable because their generated imports depend on stable output paths,
not dependency contents.

## Portable Builds

When every source and generated artifact in a portable graph is unchanged, the
builder returns the complete verified graph without parsing it again.

If any module is dirty, the builder reruns portable selection and transitive
closure validation across the graph. After that proof, modules whose source,
requested portable entries, and generated artifacts still match are reused;
only dirty modules are lowered and emitted. This preserves the language's
static portable boundary while avoiding unnecessary code generation.

## Public Interface

`eliscript-project-build-result` now reports:

- `compiled-count`
- `reused-count`

`eliscript-project-module` records expose `dependencies`, `portable-entries`,
and `reused` for tooling that needs per-module detail.

Caching is enabled by default. Emacs callers may dynamically bind
`eliscript-project-use-cache` to nil. The CLI equivalent is:

```sh
eliscript-build --no-cache --out-dir dist source/main.eli
```

A forced build still writes fresh valid cache metadata for the next invocation.

## Acceptance Evidence

- ERT proves a no-change standard rebuild compiles zero modules and preserves
  generated-file modification times.
- A dependency-only edit recompiles one module while retaining its importer.
- A modified generated file is detected and repaired.
- A compiler digest change and tampered cache metadata both force complete
  recompilation.
- Portable no-change builds reuse the complete graph; a dirty dependency
  recompiles alone after closure validation.
- Changing that dependency from `defportable` to `defun` still produces the
  expected static analysis error rather than reusing stale proof.
- The public CLI accepts `--no-cache` and retains its entry-path output contract.

## Follow-up

The opt-in machine-readable report and stable per-module decision reasons are
implemented in [0032-build-decision-reports.md](0032-build-decision-reports.md).
Default CLI standard output remains unchanged.
