# 0032: Build Decision Reports

- Status: Implemented
- Date: 2026-08-28
- Depends on: 0024 Project Builds,
  0031 Incremental Project Builds

## Summary

Project builds expose a versioned, JSON-compatible report that explains the
result of the current invocation. It describes the graph, cache outcome,
compiled and reused counts, and one stable decision for every module.

The report is opt-in at the command line. Existing shell callers continue to
receive only the generated entry path on standard output unless they pass
`--json`.

## Public Interfaces

Emacs callers build normally and convert the returned result:

```elisp
(eliscript-project-build-report
 (eliscript-project-build entry out-dir root))
```

The returned alist contains vectors for JSON arrays and `:false` for JSON
false. It can be passed directly to `json-serialize` with
`:false-object :false`.

Shell callers request the same schema with:

```sh
eliscript-build --json --out-dir dist source/main.eli
```

Successful JSON mode writes one compact JSON object followed by a newline.
Diagnostics still use standard error and a nonzero exit status. Without
`--json`, successful output remains the absolute generated entry path.

## Report Schema

Version 1 has this shape:

```json
{
  "format": "eliscript-build-report",
  "version": 1,
  "mode": "standard",
  "root": "/absolute/project",
  "outDir": "/absolute/project/dist",
  "entry": "source/main.eli",
  "entryOutput": "source/main.mjs",
  "manifest": "eliscript-project.json",
  "digest": "<sha256>",
  "portableEntries": [],
  "cache": {
    "enabled": true,
    "status": "partial",
    "reason": "dirty-modules"
  },
  "counts": {
    "modules": 2,
    "compiled": 1,
    "reused": 1
  },
  "timings": {
    "cacheReadMs": 0.318,
    "workMs": 2.741,
    "manifestWriteMs": 0.407,
    "totalMs": 3.466
  },
  "modules": [
    {
      "source": "source/main.eli",
      "output": "source/main.mjs",
      "sourceMap": "source/main.mjs.map",
      "status": "reused",
      "reason": "verified",
      "dependencies": ["source/value.eli"],
      "portableEntries": []
    }
  ]
}
```

`root` and `outDir` are absolute canonical build locations. Entry, manifest,
module, artifact, and dependency paths are relative to their corresponding
root so reports remain useful after moving a generated tree.

Modules are sorted by source path. Portable entry names and dependency paths
are sorted and deduplicated by the builder before reporting.

## Cache Status

The top-level cache status is one of:

- `disabled`: the invocation explicitly disabled cache reads
- `miss`: no usable cache existed, or every module was dirty
- `partial`: at least one module was reused and at least one was compiled
- `hit`: every module was reused

The accompanying reason is a stable identifier. Complete misses may report:

- `cache-disabled`
- `manifest-missing`
- `manifest-version-changed`
- `entry-changed`
- `graph-digest-invalid`
- `cache-missing`
- `cache-version-changed`
- `cache-records-invalid`
- `cache-digest-invalid`
- `compiler-changed`
- `mode-changed`
- `portable-roots-changed`
- `manifest-unreadable`

Successful cache reads use `verified` for a complete hit,
`dirty-modules` for partial reuse, and `all-modules-dirty` when every cached
module must be compiled.

## Module Decisions

Each module status is `reused` or `compiled`. Reused modules always report
`verified`. Compiled modules report the first conservative invalidation reason:

- `not-cached`
- `output-path-changed`
- `source-map-path-changed`
- `portable-entries-changed`
- `source-changed`
- `output-missing`
- `source-map-missing`
- `output-digest-changed`
- `source-map-digest-changed`
- `dependencies-invalid`
- `artifact-unreadable`

When no usable cache exists, compiled modules inherit the top-level miss reason
so a consumer can explain the build without reconstructing internal control
flow.

These values are protocol identifiers, not diagnostic prose. Additive reasons
may be introduced within report version 1; field removal, semantic replacement,
or structural changes require a new report version.

## Acceptance Evidence

- ERT verifies first-build miss, complete hit, dependency-only partial reuse,
  and explicitly disabled cache reports.
- ERT verifies portable mode and requested entry reporting.
- The CLI integration test parses `--json` output in Bun and checks the complete
  cache hit and every module decision.
- The existing CLI tests continue to verify the default entry-path output and
  `--no-cache` behavior.

## Follow-up

Non-deterministic phase measurements are implemented in
[0033-build-phase-timings.md](0033-build-phase-timings.md). They remain outside
the project manifest, graph identity, and cache validity.
