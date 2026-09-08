# 0014: Portable Syntax and Reader

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28

## Summary

Generation 1 now has an explicit, serializable syntax representation and a
reader written in Eliscript. The Emacs Lisp seed compiler builds both modules
to ordinary ESM; the generated reader then parses fixture programs and all
current bootstrap compiler sources, including its own source.

This stage replaces dependency on native Emacs symbols, cons cells, vectors,
and located-form structs at the portable reader boundary. The later portable
phases now consume this representation through the self-hosted compiler driver.

## Syntax Nodes

Every parsed value is an object with a `kind` and `span`:

| Kind | Payload |
| --- | --- |
| `literal` | `value` containing null, boolean, number, or string |
| `undefined` | no value field |
| `symbol` | `name` without host symbol identity |
| `keyword` | `name` without the leading colon |
| `list` | ordered `items` |
| `vector` | ordered `items` |

An empty list has the same value semantics as `nil` and is represented as a
null literal, matching the seed compiler. An empty vector remains a vector.
Brace Map expressions are normalized during reading to a `list` node whose
synthetic first item is the symbol `hash-map`; this preserves one canonical
constructor-shaped syntax tree across both compilers.

`bootstrap/compiler/syntax.eli` owns constructors and accessors for these
objects. The representation is JSON-compatible except for the explicit
`undefined` kind, which avoids losing that distinction during serialization.

## Source Spans

A span contains:

- `filename`
- zero-based, end-exclusive `start` and `end` character offsets
- one-based `line`, `column`, `endLine`, and `endColumn`

Offsets and columns count Unicode code points, not bytes, UTF-16 code units, or
display-cell widths. The reader separately keeps a UTF-16 code-unit cursor for
JavaScript `slice` and `codePointAt`. Supplementary characters therefore
advance the slicing cursor by two but the source offset and column by one.

The seed reader uses Emacs display columns, where wide characters may occupy
two cells. The conformance oracle normalizes its spans to character columns
before comparison. Source Map generation will perform its own conversion to
the UTF-16 columns required by Source Map v3.

## Reader Grammar

`bootstrap/compiler/reader.eli` currently reads the stable grammar needed by
Eliscript and its bootstrap compiler sources:

- whitespace and semicolon line comments
- lists, vectors, and even-paired brace Maps
- null, true, false, and undefined literals
- decimal integers and floats, including exponent notation
- JSON-compatible quoted strings
- validated unqualified and single-namespace keywords, plus Lisp-style symbols
- quote, backquote, comma, comma-at, and function-quote prefixes

Reader prefixes become explicit list nodes. The synthetic prefix symbol owns
the prefix span, while the list owns the complete prefix-plus-value span.

The reader rejects empty Keyword names, leading or trailing namespace
separators, multiple separators, odd Map forms, unexpected or mismatched
closing delimiters, unknown `#` dispatch syntax, missing prefixed values, and
unterminated collections or strings with filename, line, and column
diagnostics.

The seed's underlying Emacs reader accepts additional host syntax. That extra
surface is not automatically part of the portable language contract. Any
additional numeric, string, character, dispatch, or dotted-pair syntax must be
specified and added to shared conformance before the portable compiler relies
on it.

## Build Boundary

`bin/eliscript-bootstrap` compiles the current Generation 1 modules in a stable
layout:

```text
bootstrap/compiler/symbol.eli -> dist/bootstrap/symbol.mjs
bootstrap/compiler/syntax.eli -> dist/bootstrap/syntax.mjs
bootstrap/compiler/reader.eli -> dist/bootstrap/reader.mjs
bootstrap/compiler/formatter.eli -> dist/bootstrap/formatter.mjs
bootstrap/compiler/expander.eli -> dist/bootstrap/expander.mjs
bootstrap/compiler/transient-analysis.eli -> dist/bootstrap/transient-analysis.mjs
bootstrap/compiler/analyzer.eli -> dist/bootstrap/analyzer.mjs
bootstrap/compiler/ir.eli -> dist/bootstrap/ir.mjs
bootstrap/compiler/lower.eli -> dist/bootstrap/lower.mjs
bootstrap/compiler/source-map.eli -> dist/bootstrap/source-map.mjs
bootstrap/compiler/emitter.eli -> dist/bootstrap/emitter.mjs
bootstrap/compiler/project.eli -> dist/bootstrap/project.mjs
bootstrap/compiler/compiler.eli -> dist/bootstrap/compiler.mjs
```

Each module receives an external Source Map v3 file. The generated reader uses
a standard relative ESM import for `syntax.mjs`; it has no handwritten
JavaScript module wrapper.

## Shared Conformance

`tests/fixtures/bootstrap-reader.json` contains valid source cases, expected
diagnostics, and file-backed self-reader cases. The Emacs oracle normalizes
seed located forms to the portable object shape. The Bun test compares the
generated reader's complete nested output against that oracle.

Acceptance covers:

- every node kind and recursive source span
- literals, collections, comments, Unicode, and reader prefixes
- exact supported diagnostics
- byte-identical repeated builds of all generated ESM and source maps
- reading every current bootstrap module with both readers

The generated reader reading its own source proves reader-level closure. The
Generation 1 pipeline can now expand, analyze, lower, and emit that syntax tree,
and the portable host adapter drives complete filesystem compilation.

## Downstream Integration

The portable lexical analyzer that consumes these nodes is specified in
[0015-portable-lexical-analyzer.md](0015-portable-lexical-analyzer.md). Macro
expansion preserves spans through generated forms and feeds explicit syntax
directly to that analyzer as specified by 0016.

## Compatibility Freeze

The six syntax-node kinds, JSON-compatible payloads, Unicode code-point source
spans, supported reader grammar, prefix normalization, and source-located
diagnostic categories are stable. All thirteen bootstrap modules must remain
readable by both compiler generations with equivalent complete syntax trees.

Additional reader syntax may be added only through shared conformance cases.
Host-specific reader behavior, object identity, and implicit Emacs syntax do
not enter the portable syntax contract.
