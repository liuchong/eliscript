# 0106: Versioned Project Request Configuration

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0030 Project Graph Manifest,
  0032 Build Decision Reports,
  0040 Project Maturity Roadmap,
  0043 Structured Compiler Diagnostics

## Summary

Eliscript project builds now enter the seed toolchain through one explicit
`ProjectRequest` operation. The request can be assembled by an Emacs caller,
by legacy command-line flags, or from a versioned `eliscript.json` file. Both
ordinary and portable builds pass through `eliscript-project-execute` before
the existing graph compiler is selected.

This specification introduced the first M9 configuration and service
convergence slice. Version 1 intentionally describes one graph root and one
entry because the public build artifact at that slice had one entry identity.
Multi-entry graph identity, source-map policy, build profiles, namespaced host
options, and self-hosted parsing require separate versioned specifications;
they are not accepted as ignored version 1 fields. Specification 0124
subsequently adds optional,
closed macro capability and file-input fields without changing version 1
single-entry meaning.

Application frameworks, bundlers, publishing tools, sites, hosting systems,
and development servers are replaceable consumers. They do not define this
schema, enter the project operation, or contribute core maturity evidence.

## Project Request

The in-memory request contains:

| Field | Meaning |
| --- | --- |
| `entry` | source entry path |
| `root` | source containment root |
| `out-dir` | generated ESM directory |
| `portable-entries` | empty for an ordinary graph, otherwise portable names |
| `macro-capabilities` | explicit compile-time capability names |
| `macro-file-dependencies` | exact project-relative macro input paths |
| `use-cache` | whether verified incremental artifacts may be reused |
| `configuration` | optional source configuration identity |

`eliscript-project-execute` validates the request shape, binds cache policy,
and dispatches ordinary or portable compilation. Normal callers do not select
the two project builders themselves. Lower-level builders remain explicit
seed and compatibility references after M9 moved graph discovery into
Eliscript.

## Configuration Schema Version 1

The conventional filename is `eliscript.json`. Configuration is activated
explicitly with `eliscript-build --config FILE`; automatic upward discovery is
not part of version 1.

```json
{
  "schemaVersion": 1,
  "sourceRoot": "src",
  "entry": "main.eli",
  "outDir": "dist",
  "portableEntries": [],
  "macroCapabilities": [],
  "macroFileDependencies": [],
  "cache": true
}
```

`schemaVersion`, `entry`, and `outDir` are required. `sourceRoot` defaults to
`.` relative to the configuration directory. `portableEntries` defaults to an
empty array and must contain unique non-empty strings. `cache` defaults to
true and must be a JSON boolean. `macroCapabilities` and
`macroFileDependencies` also default to empty arrays. Their closed capability,
path-containment, UTF-8, and digest behavior is specified in 0124.

`sourceRoot`, `entry`, and `outDir` are non-empty relative paths. Absolute
paths and any `..` component reject before filesystem traversal. `sourceRoot`
and `outDir` resolve from the configuration directory; `entry` resolves from
`sourceRoot`. Existing canonical-path and symlink containment checks remain
authoritative when the graph is built.

The top-level schema is closed. Every unknown key rejects with `ELI-B0002`,
phase `project-config`, and a stable key-bearing message. Unsupported schema
versions, malformed JSON, duplicate top-level keys, invalid field types,
duplicate portable entries, and unsafe paths also fail through that structured
diagnostic category. No field is silently ignored.

## Command-line Precedence

Without `--config`, the historical entry and build flags construct the same
request directly. With `--config`, explicit `ENTRY`, `--root`, `--out-dir`,
and repeated `--portable` values replace their configured counterparts.
`--no-cache` always disables reuse. `--json` and `--diagnostic-format` remain
presentation controls and never enter artifact identity.

Relative command-line override paths retain historical current-directory
semantics. Relative paths inside the JSON file retain configuration-directory
semantics. More than one `--config` option is an error.

## M9 Boundary

This specification completed the first usable versioned request contract and
shared seed project operation. At that point, filesystem graph discovery was
still seed-owned, the self-hosted compiler did not execute the request, Node
parity was pending, and single-file compilation had not become a one-module
project internally.

Specifications 0107 through 0111 subsequently moved graph planning, reports,
incremental policy, request normalization, and the public multi-file project
command into the self-hosted service without changing this version 1 external
configuration contract. Specifications 0112 and 0113 subsequently implement
single-file convergence and version 2 multi-entry identity, closing M9 without
changing configuration version 1.

## Compatibility Freeze

The closed version 1 configuration schema, path semantics, defaults,
command-line precedence, structured configuration diagnostics, and shared
project-request entry operation are stable. Compatible additions require a
new schema version or an already-declared extension contract; unknown version
1 fields continue to fail closed, and application tooling cannot extend the
core request implicitly.

## Acceptance Criteria

- **VPR-01:** Direct flags and version 1 configuration both execute through
  `eliscript-project-execute`.
- **VPR-02:** Required fields, defaults, booleans, portable names, and path
  containment are validated before project traversal.
- **VPR-03:** Unknown keys and unsupported versions fail with structured
  project-configuration diagnostics; duplicate top-level keys also fail.
- **VPR-04:** Explicit build flags override configured values while
  `--no-cache` can only disable reuse.
- **VPR-05:** Configuration-driven ordinary output is executable and follows
  the same manifest and Source Map behavior as direct project builds.
- **VPR-06:** No application framework or publishing tool enters the schema,
  implementation dependency, or acceptance evidence.
