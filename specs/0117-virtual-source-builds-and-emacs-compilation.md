# 0117: Virtual-source Builds and Emacs Compilation Commands

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0040 Mature Project Roadmap,
  0043 Structured Compiler Diagnostics,
  0112 Unified Self-hosted Build Operation,
  0113 Versioned Multi-entry Project Identity,
  0115 Emacs Major Mode Foundation,
  0116 Read-only Project Check and Emacs Diagnostics

## Summary

Eliscript project builds accept one existing project source whose current text
is supplied in memory. The virtual text participates in reader, expansion,
analysis, IR, emission, module-graph discovery, source digests, and Source Map
content under the source's original canonical `.eli` identity. The visited
file is neither saved nor rewritten.

The public `eliscript-build` command exposes this host boundary as
`--stdin-file FILE`. The maintained Emacs mode uses the same command for
buffer, file, and configured-project compilation and uses compilation-mode
locations for source navigation.

This is a compiler and editor capability. Application frameworks, UI
libraries, bundlers, publishers, sites, hosting systems, and development
servers are not dependencies, goals, evidence, or maturity credit.

## Virtual-source Boundary

`buildProject(options)` accepts an optional `sourceOverrides` map or object.
Every key is canonicalized with the ordinary project-root containment and
symlink rules. Every value must be source text, and every canonical key must
belong to the source graph reached by the requested entries. Duplicate aliases
and detached sources fail with a structured project diagnostic.

Overrides are host inputs, not fields in `eliscript-build-operation`. They do
not alter configuration, entry identity, module identity, or persisted schema.
This preserves one self-hosted build request contract while allowing an editor
host to supply current text.

The first public command version accepts exactly one stdin source. Supporting
multiple virtual files later requires an explicit framed protocol rather than
ambiguous concatenation on standard input.

## Build and Cache Semantics

When any virtual source exists, the complete build disables cache reuse. Every
module in the reached closure is analyzed from current inputs, and generated
artifacts are written through the normal project pipeline. This conservative
rule prevents an on-disk cache hit from hiding a virtual import or semantic
change.

Each compiled module's `sourceDigest` is computed from the exact source text
used for compilation. For ordinary builds this is the decoded file text; for a
virtual source this is the stdin text. The emitted Source Map uses the original
canonical source path and embeds the exact virtual text in `sourcesContent`.

The manifest written by a virtual build remains a valid snapshot of the
generated artifacts. A later ordinary cached build compares the current disk
source digest, recompiles the changed source and its affected closure, and may
reuse unaffected modules. Virtual input therefore cannot be mistaken for the
subsequent disk state.

## Public Command

`eliscript-build --stdin-file FILE` reads UTF-8 source from standard input and
uses it as the current contents of `FILE`. It composes with `--config`, direct
entries, `--root`, `--out-dir`, portable selection, successful JSON reports,
and structured diagnostics.

The file must already exist, remain inside the canonical project root, and be
reachable from the requested graph. The command rejects a second
`--stdin-file`. A virtual build reports cache status as disabled even when the
configuration enables caching.

Located human diagnostics render as:

```text
eliscript-build: /project/src/main.eli:1:8: unbound symbol: missing
```

JSON failures retain `eliscript-diagnostic` version 1. Human rendering is a
view of that structured location rather than independently parsed compiler
prose.

## Emacs Compilation

The maintained mode exposes:

- `eliscript-mode-compile-buffer`: build the configured graph with the current
  widened buffer supplied through stdin
- `eliscript-mode-compile-file`: build the visited file from disk and reject a
  modified buffer rather than silently ignoring edits
- `eliscript-mode-compile-project`: build the nearest configured project
- `eliscript-mode-next-error` and `eliscript-mode-previous-error`: navigate
  located build failures through the standard next-error interface

Configured buffer compilation keeps the configuration's declared entries so a
changed dependency remains part of its real project closure. Configured file
compilation explicitly selects the visited file as the entry. Without a
configuration, buffer and file compilation use the discovered project root and
the customizable `eliscript-mode-build-directory`.

`eliscript-compilation-mode` derives from `compilation-mode` and recognizes
the public located human diagnostic format. Commands are asynchronous, use the
project root as `default-directory`, and do not save the current buffer.

## M10 Status

This specification completes public virtual-source project builds and Emacs
buffer, file, and project compilation with source navigation. It does not claim
interactive evaluation, persistent REPL sessions, runtime stack remapping,
host-neutral watch events, local onboarding, the complete AC-12 gate,
or the M10 exit gate.

## Acceptance Criteria

- **VBC-01:** A virtual source uses its canonical existing `.eli` path and must
  belong to the reached standard or portable project graph.
- **VBC-02:** Reader-through-emitter processing uses virtual text for graph
  discovery, diagnostics, output, source digest, and Source Map content.
- **VBC-03:** The visited source file is byte-unchanged on successful and
  failed virtual builds.
- **VBC-04:** Any virtual source disables all cache reuse for that build and is
  reported through the existing cache-disabled contract.
- **VBC-05:** A following disk build cannot reuse stale virtual identity and
  produces output equivalent to a clean disk build.
- **VBC-06:** Bun and Node produce byte-identical modules and Source Maps for
  the same virtual source and self-hosted compiler.
- **VBC-07:** `eliscript-build --stdin-file` accepts exactly one UTF-8 stdin
  source and preserves structured diagnostics under the original filename.
- **VBC-08:** Located human build diagnostics include exact file, line, column,
  and message derived from diagnostic version 1.
- **VBC-09:** Emacs buffer compilation sends widened unsaved text to the public
  command without saving or creating a temporary source file.
- **VBC-10:** Emacs file compilation refuses modified buffers, while configured
  project compilation uses the declared project request.
- **VBC-11:** Emacs compilation buffers recognize located diagnostics and
  support next and previous source navigation.
- **VBC-12:** Public surfaces, conformance evidence, maintained Emacs versions,
  and default tests cover the capability without application dependencies.
