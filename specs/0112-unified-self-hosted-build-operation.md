# 0112: Unified Self-hosted Build Operation

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0019 Self-Hosted Compiler Driver,
  0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0107 Self-hosted Project Graph Planning,
  0111 Self-hosted Project Command and Configuration

## Summary

Single-file and project commands now enter one versioned build-operation
boundary owned by the generated compiler. The operation normalizes mode,
paths, portable roots, Source Map intent, and cache intent before a shared host
dispatcher selects the corresponding effectful service.

The public `eliscript` and `eliscript-build` commands both use the generated
self-hosted compiler under Bun or Node. Explicit Emacs Lisp seed commands remain
available for clean bootstrap and differential verification, but neither normal
public command is implemented by the seed.

Application integrations remain replaceable consumers of the public commands
and generated ESM. They do not define this operation, enter compiler
dependencies, or contribute core maturity evidence.

## Operation Schema

The generated compiler exports `build-operation-format`,
`build-operation-version`, and `build-operation-request`. Version 1 uses the
format `eliscript-build-operation` and supports two explicit modes.

A normalized single-file operation is:

```json
{
  "format": "eliscript-build-operation",
  "version": 1,
  "mode": "single",
  "input": "src/main.eli",
  "output": "dist/main.mjs",
  "sourceMap": true,
  "portableEntries": []
}
```

`output` is null when generated JavaScript is returned to stdout. `sourceMap`
is boolean and requires a non-null output. Portable names are non-empty,
deduplicated, and sorted. Missing optional fields normalize to null, false, and
an empty frozen array rather than leaking JavaScript `undefined` into operation
identity.

A normalized project operation is:

```json
{
  "format": "eliscript-build-operation",
  "version": 1,
  "mode": "project",
  "entry": "src/main.eli",
  "outDir": "dist",
  "root": null,
  "portableEntries": [],
  "useCache": true
}
```

Project fields delegate to the existing version 1 project-request contract.
All normalized operation records and nested portable arrays are frozen.
Malformed or unsupported operations fail with `ELI-B0001` in the
`project-build` phase. Command-line parsing retains `ELI-C0001` for malformed
presentation options detected before an operation exists.

## Shared Host Dispatch

`bootstrap/host/build.mjs` is the shared effect dispatcher. It loads one
generated compiler, normalizes the operation through `.eli`, and routes only on
the normalized mode:

- `single` reads one source, emits ordinary or portable JavaScript, optionally
  writes an arbitrary output path and adjacent external Source Map, or returns
  JavaScript for stdout
- `project` invokes graph discovery, closure validation, cache policy, artifact
  emission, manifest identity, and build-report generation

The modes intentionally retain distinct observable artifacts. A stdout compile
does not manufacture a temporary project or manifest, and a project build does
not bypass graph identity to imitate a single output file. The shared boundary
unifies request authority and command dispatch without weakening either public
contract.

Filesystem, process, environment, path, and output presentation remain host
effects. No generated compiler module depends on a particular JavaScript host.

## Public and Seed Commands

`bin/eliscript` defaults to Bun and accepts `ELISCRIPT_JS_RUNTIME=node`. It loads
the selected generated compiler directory and bootstraps that directory when
`compiler.mjs` is absent. `bin/eliscript-build` follows the same runtime and
bootstrap rules for project mode.

`bin/eliscript-seed` and `bin/eliscript-seed-build` are explicit Emacs Lisp
reference commands. `bin/eliscript-bootstrap` always invokes
`bin/eliscript-seed`, so generation 1 remains a non-circular seed build even
though the normal single-file command is self-hosted.

`bin/eliscript-portable` remains a compatibility name for the generated
single-file host. It does not replace the normal `eliscript` command or the
explicit seed reference.

## Compatibility and Evidence

The public single-file command preserves historical option parsing, stdout
output, arbitrary output filenames, portable selection, external Source Maps,
human diagnostics, and versioned JSON diagnostics. Cache and manifest behavior
remain project-only.

Evidence proves:

- seed, public Bun, public Node, and compatibility-host stdout are byte-identical
- public Node and seed produce byte-identical mapped JavaScript and Source Maps
- public Node and the generated compatibility host return identical structured
  compiler diagnostics
- a missing generated compiler directory bootstraps once and then compiles
  successfully under Node
- generation 1, generation 2, and generation 3 remain byte-identical
- the existing project command continues to pass Bun/Node, cache, configuration,
  report, portable closure, and seed-differential tests through the same
  operation dispatcher

## M9 Boundary

This specification completes normal single-file and project command routing
through the self-hosted compiler and satisfies the narrow M9 exit statement
that the seed is no longer the only implementation of a user-facing build
capability. M9 remains in progress because version 1 project identity still has
one entry and the planned multi-entry identity is not implemented.

## Acceptance Criteria

- **UBO-01:** Single-file and project commands normalize through version 1
  `eliscript-build-operation` logic implemented in `.eli`.
- **UBO-02:** Missing optional single-file fields normalize deterministically;
  all returned operation records and portable arrays are frozen.
- **UBO-03:** One host dispatcher routes only normalized `single` and `project`
  modes while mode-specific effects retain their documented artifacts.
- **UBO-04:** Public `eliscript` and `eliscript-build` execute the generated
  compiler under Bun and Node.
- **UBO-05:** Clean automatic bootstrap is non-circular and uses the explicit
  seed command only to establish generation 1.
- **UBO-06:** Stdout, mapped output, portable output, and structured diagnostics
  preserve seed/self-hosted compatibility for the shared corpus.
- **UBO-07:** The compiler fixed point and project cache/report contracts remain
  reproducible after public command convergence.
- **UBO-08:** Application integrations remain outside core implementation,
  dependencies, goals, evidence, and maturity credit.
- **UBO-09:** This slice does not claim multi-entry project identity or complete
  M9 delivery.
