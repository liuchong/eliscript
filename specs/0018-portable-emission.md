# 0018: Portable ESM and Source Map Emission

- Status: Implemented
- Date: 2026-08-28
- Depends on: 0008 Direct ECMAScript Emission from IR,
  0009 Source Map v3 Emission, 0017 Portable IR Lowering

## Summary

Generation 1 now emits standard ECMAScript modules and Source Map v3 documents
directly from portable IR. Both backend modules are written in Eliscript and
compiled by the Emacs Lisp seed:

```text
portable IR -> emitter.eli -> ECMAScript
                         +-> explicit marks -> source-map.eli -> Source Map v3
```

Together with the portable reader, expander, analyzer, and lowerer, this
completes the host-neutral pure computation path from source text to generated
artifacts. Filesystem and command-line orchestration remain the responsibility
of the next compiler-driver phase.

## Fragment Contract

The seed backend temporarily stores source locations as Emacs text properties.
Portable JavaScript strings have no equivalent metadata channel, so
`bootstrap/compiler/emitter.eli` uses explicit fragments with two fields:

- `text`: generated JavaScript
- `marks`: ordered `{offset, span}` records relative to that text

Fragment concatenation shifts marks by the preceding text length. Joining and
indentation preserve the same invariant, and locating a node adds a mark only
when the fragment does not already begin with a more specific child mark. Plain
emission and mapped emission therefore share one formatter.

Temporary names are allocated in seed evaluation order. This keeps readable
formatting, React runtime imports, identifier mapping, quoted data, and all
control-flow rewrites byte-identical to the reference backend.

## Portable Source Maps

`bootstrap/compiler/source-map.eli` consumes generated text and fragment marks.
It scans generated columns as UTF-16 code units, scans source offsets as Unicode
code points while recording UTF-16 source columns, groups mappings by generated
line, and emits signed Base64 VLQ deltas.

The resulting JSON uses Source Map v3 with one source, embedded source content,
an empty names array, and optional generated filename. The implementation uses
ordinary arrays, objects, strings, numbers, and `Map`; it does not depend on
Emacs objects, text properties, Bun APIs, or Node.js modules.

## Build Boundary

`bin/eliscript-bootstrap` emits ten compiler modules in dependency order:

```text
symbol -> syntax -> reader -> expander -> analyzer -> ir -> lower
       -> source-map -> emitter -> compiler
```

The generated emitter imports the portable symbol, IR, and Source Map modules.
It exports expression, top-level, plain-module, and source-mapped-module entry
points. A later driver will compose the existing phases and provide filesystem
adapters without moving host concerns into these modules.

## Conformance Evidence

`tests/fixtures/bootstrap-ir.json` is shared by the Emacs seed and generated
backends. The emission oracle compares complete JavaScript strings and parsed
Source Map documents for the full IR surface, quoted literal identity, Unicode
columns, executable programs, macro call-site spans, and all ten bootstrap
compiler sources.

Additional checks verify signed VLQ boundaries, execute a generated module in a
fresh Bun process, and require deterministic source-mapped bootstrap artifacts.
The generated backend matches the seed byte-for-byte for ESM and exactly for
the complete Source Map document.

## Next Phase

The host-neutral driver, thin filesystem adapter, and reproducible compiler
fixed point are implemented in
[0019-self-hosted-compiler.md](0019-self-hosted-compiler.md).
