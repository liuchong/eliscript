# 0030: Project Graph Manifest

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0024 Project Builds,
  0029 Portable Indexing Composition

## Summary

Every ordinary and portable project build now writes
`eliscript-project.json` at the output root. The manifest gives a generated ESM
graph one deterministic identity instead of treating its entry module as the
whole program.

This build manifest is separate from a generated module's
`__eliscript_portable__` export table. The former describes files and content;
the latter maps Eliscript operation names to callable JavaScript functions.

## Format

Version 1 has this shape:

```json
{
  "format": "eliscript-project",
  "version": 1,
  "entry": "examples/emacs-index/index.mjs",
  "modules": [
    {
      "source": "examples/emacs-index/index.eli",
      "output": "examples/emacs-index/index.mjs",
      "sourceMap": "examples/emacs-index/index.mjs.map",
      "sourceDigest": "<sha256>",
      "outputDigest": "<sha256>",
      "sourceMapDigest": "<sha256>"
    }
  ],
  "digest": "<sha256>"
}
```

Source paths are relative to the selected project root. Generated module and
map paths are relative to the output root. Modules are sorted by source path.
Every content digest is lowercase hexadecimal SHA-256 over the exact file
bytes.

The graph digest is SHA-256 over the compact JSON serialization of `format`,
`version`, `entry`, and the ordered module records, before the top-level
`digest` field is added. The manifest therefore remains byte-identical when an
unchanged graph is rebuilt with the same paths and toolchain.

The returned `eliscript-project-build-result` exposes both `manifest` and
`digest`. Module records also expose their three content digests.

## Worker Contract

Protocol v1 requests may include `projectManifest`:

```json
{
  "version": 1,
  "type": "request",
  "id": "7",
  "module": "/tmp/build/main.mjs",
  "projectManifest": "/tmp/build/eliscript-project.json",
  "moduleVersion": "<graph-digest>",
  "operation": "run",
  "arguments": []
}
```

The worker requires a local manifest whose entry resolves to the requested
module. It verifies every generated module and Source Map against the declared
digest on cold load. The graph digest becomes the immutable module version,
and all graph maps are loaded into a generated-file lookup used for stack-frame
translation.

The Emacs client reads the manifest digest before each project request. A
changed dependency therefore starts a fresh worker generation even when the
entry module bytes did not change. Single-file callers that omit
`projectManifest` retain the previous file-fingerprint behavior.

Timing data keeps `sourceMapLoaded` for compatibility and adds
`sourceMapCount` so callers can observe whole-graph map loading.

## Acceptance Evidence

- ERT verifies stable manifest bytes, relative sorted records, and digests that
  match generated files.
- A real Emacs/Bun test raises an exception in an imported portable module and
  maps its location to that dependency's `.eli` line.
- The same test changes only the dependency, proves the entry JavaScript is
  unchanged, observes a different graph digest, and verifies automatic worker
  restart with the new behavior.
- Existing single-file worker protocol tests continue to pass unchanged.

## Follow-up

Verified module reuse, compiler invalidation, portable closure revalidation,
and the private cache metadata contract are implemented in
[0031-incremental-project-builds.md](0031-incremental-project-builds.md).
