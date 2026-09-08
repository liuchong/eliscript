# 0116: Read-only Project Check and Emacs Diagnostics

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0040 Mature Project Roadmap,
  0043 Structured Compiler Diagnostics,
  0106 Versioned Project Request Configuration,
  0107 Self-hosted Project Graph Planning,
  0115 Emacs Major Mode Foundation

## Summary

Eliscript provides one project-aware, read-only check operation and one Emacs
Flymake integration over that operation. Checking validates configured entries,
their complete local module closure, ordinary or portable analysis, import
containment, and project graph convergence without emitting JavaScript or
mutating build state.

The request normalizer and successful report are implemented in self-hosted
Eliscript. The filesystem/process host is limited to canonical path discovery,
source reads, standard input, and command execution. Application frameworks,
bundlers, publishers, and development servers are replaceable validation tools;
none is a dependency, goal, or acceptance prerequisite of this capability.

## Check Operation

`check_operation_request` accepts `entry` or `entries`, an optional `root`, and
an optional `portableEntries` array. It returns a frozen value with:

```json
{
  "format": "eliscript-check-operation",
  "version": 1,
  "mode": "project",
  "entries": ["src/main.eli"],
  "root": "/project",
  "portableEntries": []
}
```

Entries and portable names are non-empty, unique, and lexicographically sorted.
The operation has no output directory, cache switch, artifact path, or
application-tool field. Multi-entry checking requires an explicit root, and
portable checking retains the existing single-entry portable closure rule.

## Read-only Host

`checkProject(options)` canonicalizes the root and entries with the same
containment and local `.eli` import rules as project builds. It then invokes the
self-hosted standard or portable project planner. Each visited module is read,
expanded, analyzed, and lowered to IR in memory so graph discovery cannot hide
compiler failures.

The operation must not create or modify an output directory, manifest, cache,
generated module, Source Map, package file, or source file. A caller may provide
an in-memory source override keyed by an existing project source path. Overrides
must belong to the traversed closure, participate only in the current check,
and never become project or cache identity.

## Check Report

A successful operation returns this versioned, deterministic report on request:

```json
{
  "format": "eliscript-check-report",
  "version": 1,
  "status": "ok",
  "mode": "standard",
  "root": "/project",
  "entries": ["src/main.eli"],
  "portableEntries": [],
  "counts": { "modules": 2 },
  "modules": [
    {
      "source": "src/helper.eli",
      "dependencies": [],
      "portableEntries": []
    },
    {
      "source": "src/main.eli",
      "dependencies": ["src/helper.eli"],
      "portableEntries": []
    }
  ]
}
```

Entries, modules, dependencies, and portable names use canonical sorted order.
Project-relative paths keep the graph portable while `root` identifies the
checked checkout. The report intentionally excludes timing and host fields so
Bun and Node produce identical JSON for the same canonical checkout.

Failures use `eliscript-diagnostic` version 1 on stderr and a nonzero exit
status. Compiler diagnostics preserve their code, phase, file, and exact source
span; host/configuration failures use their existing structured categories.

## Command

`eliscript-check` accepts direct entries or `--config FILE`. The public options
are `--root`, repeatable `--portable`, `--stdin-file`, `--json`,
`--diagnostic-format`, and `--help`.

`--stdin-file FILE` reads standard input and uses it as the current in-memory
contents of that file. This supports unsaved editor buffers without temporary
project files. Exactly one stdin override is accepted. `--json` prints the
successful report; human success prints the checked module count. Bun and Node
must agree on report bytes and structured failures.

## Emacs Integration

`eliscript-mode-flymake-backend` discovers `eliscript.json` through the major
mode's project root contract. Configured projects use that request; an
unconfigured file uses its discovered root and file path directly. The current
widened buffer is sent through `--stdin-file`, so checking does not save or
rewrite the visited file.

Only `eliscript-diagnostic` version 1 JSON is decoded. Zero-based Unicode
offsets map directly to Emacs buffer positions, severity maps to Flymake types,
and diagnostics for other files are not attached to the current buffer. A new
check cancels the buffer's previous process, and stale results are discarded
when the buffer generation changes. Flymake supplies ordinary next/previous
diagnostic navigation; `eliscript-mode-check-buffer` starts the integration on
demand.

## M10 Status

This specification completed project-aware source checking and structured
diagnostic navigation. At that slice it did not claim compile commands,
source-mapped evaluation, interactive evaluation, REPL sessions, watch events,
onboarding, the complete AC-12 editor gate, or the M10 exit gate.
Specifications 0117 through 0121 and 0133 subsequently supplied the remaining
M10 implementation and audit contracts. AC-12 remains independently gated by
the final supported-editor matrix.

## Compatibility Freeze

The version 1 check request and report, read-only graph traversal, virtual
stdin override, Bun/Node report identity, structured diagnostic preservation,
and asynchronous stale-safe Flymake integration are stable. Checking cannot
create build artifacts or cache state, and application tooling cannot enter
the request or its evidence.

## Acceptance Criteria

- **PCD-01:** The self-hosted compiler normalizes a frozen version 1 check
  operation without output, cache, or application fields.
- **PCD-02:** Standard and portable checks traverse the complete deterministic
  project closure and run reader-through-IR validation for every visited source.
- **PCD-03:** A successful self-hosted report has sorted entries, modules,
  dependencies, portable names, and an exact module count.
- **PCD-04:** Bun and Node emit byte-identical successful reports for the same
  project and preserve structured compiler diagnostics on failure.
- **PCD-05:** Success and failure create no output directory, manifest, cache,
  generated module, Source Map, or source mutation.
- **PCD-06:** A stdin source override checks unsaved contents under the original
  canonical filename, rejects files outside the checked closure, and preserves
  exact diagnostic spans.
- **PCD-07:** The Emacs backend invokes the public check command asynchronously,
  cancels replaced work, discards stale results, and reports valid JSON through
  Flymake.
- **PCD-08:** Flymake locations, severities, codes, and messages are covered by
  focused ERT tests under the maintained Emacs matrix.
- **PCD-09:** Public command, host exports, self-hosted schemas, and Emacs
  commands are tracked by the surface and conformance registries.
- **PCD-10:** Core compiler, runtime, standard library, project check, editor
  implementation, dependencies, evidence, and maturity credit remain free of
  application-framework and bundler requirements.
