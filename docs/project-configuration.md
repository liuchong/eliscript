# Project Configuration

[Core documentation](README.md) | [Getting started](getting-started.md) |
[Compiler architecture](../compiler/README.md)

## Configuration File

`eliscript.json` describes one versioned project request. Paths are resolved
relative to the configuration file. Unknown fields and unsupported versions
are rejected.

<!-- eliscript-snippet:project-config -->
```json
{
  "schemaVersion": 1,
  "sourceRoot": "src",
  "entry": "main.eli",
  "outDir": "dist"
}
```

Version 2 replaces `entry` with a non-empty `entries` array for multi-entry
builds. The normalized entry set is ordered, duplicate physical sources are
rejected, and the union graph owns one versioned manifest identity.

## Paths And Containment

All local source imports must resolve to regular files below `sourceRoot`.
Direct traversal, symlink escape, output aliasing, and duplicate source aliases
are rejected before writes. Output directories must not overwrite source files.

## Check And Build

Use `./bin/eliscript-check --json --config eliscript.json` for a read-only graph
check. Use `./bin/eliscript-build --json --config eliscript.json` to emit the
complete graph, source maps, manifest, cache identity, and decision report.
`--stdin-file FILE` substitutes unsaved contents for one existing source without
changing its canonical path.

## Overrides

Explicit CLI entry, root, output, portable-entry, and cache flags override
configured values. `ELISCRIPT_JS_RUNTIME=node` selects Node for the self-hosted
host; Bun remains the default. Configuration never contains UI framework,
bundler, publishing, server, or hosting options.

## Incremental Cache

The build manifest owns a private version 2 cache family. Verified unchanged
modules are reused; dirty modules are rebuilt independently. A readable version
1 cache can migrate automatically after a successful hit. `--no-cache` disables
reads without changing generated module semantics.

## Watch

`./bin/eliscript-watch --config eliscript.json --json` emits versioned,
content-level project events. It reports canonical source identities and stops
cleanly on termination. The Emacs mode shares one watcher per project.
