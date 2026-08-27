# 0009: Source Map v3 Emission

- Status: Implemented
- Date: 2026-08-28
- Depends on: 0006 Located Forms, 0007 Explicit Compiler IR, 0008 Direct IR Emission

## Summary

Eliscript can emit an external Source Map v3 document alongside generated ESM.
Mappings come directly from source spans retained on IR nodes, so the backend
does not reconstruct reader forms or infer locations from formatted code.

```text
.eli source -> located forms -> expansion -> analysis -> IR
                                                  |       |
                                                  |       +-> ESM
                                                  +----------> .mjs.map
```

Source maps are optional. Ordinary compilation remains byte-for-byte identical
to the M0 output contract.

## Public Interface

The CLI enables source maps explicitly:

```sh
eliscript --source-map --output dist/program.mjs src/program.eli
```

This writes `dist/program.mjs`, `dist/program.mjs.map`, and an external
`sourceMappingURL` comment. `--source-map` requires `--output`; stdout builds do
not silently create files.

Emacs callers can use:

- `eliscript-compile-string-with-source-map`
- `eliscript-compile-file-with-source-map`
- `eliscript-emit-ir-module-with-source-map`

These APIs return an `eliscript-emission` containing plain JavaScript and the
serialized source-map document.

## Mapping Model

During direct IR emission, generated strings temporarily carry Emacs text
properties at the first character produced by each mapped node. Nested
expression markers survive normal string formatting and concatenation. A final
linear scan turns the markers into generated line and column segments and then
removes all text properties from the public JavaScript result.

Mappings cover expressions and emitted structural nodes, including function
parameters, lexical bindings, import and export names, assignment pairs,
conditional clauses, object properties, and property keys. Compiler-generated
preamble text is intentionally unmapped.

Source Map v3 positions are zero-based. Generated and original columns count
UTF-16 code units, including non-BMP characters. Original positions are
reconstructed from each span's zero-based character offset by scanning the
source once, which avoids display-column differences caused by tabs.

Macro expansions retain the call-site span established by specification 0006.
Generated macro code therefore maps to the invocation that produced it.

## Document Shape

The emitted JSON contains:

- `version: 3`
- an optional generated `file`
- one original entry in `sources`
- the complete source in `sourcesContent`
- an empty `names` array
- Base64 VLQ `mappings`

One compiler invocation currently emits one JavaScript module from one source
file, so indexed sections and multiple source entries are unnecessary.

## Acceptance Evidence

- ERT tests decode signed Base64 VLQ values and complete mapping strings rather
  than checking only for non-empty output.
- Decoded segments verify top-level, nested, and UTF-16 source columns.
- Macro-generated operations map to the macro call site.
- The CLI writes parseable Source Map v3 JSON, embeds source content, links the
  map from ESM, and rejects `--source-map` without `--output`.
- Default CLI output still matches the checked-in snapshot byte-for-byte.
- Bun executes both ordinary and source-mapped generated modules.

## Deferred Work

- multiple source files in one emitted module
- expansion stacks with both macro definition and call-site provenance
- optional inline data-URL maps
- populated `names` entries for debugger symbol displays
