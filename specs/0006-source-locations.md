# 0006: Located Forms and Diagnostic Positions

- Status: Implemented
- Date: 2026-08-28
- Depends on: 0004 Lexical Analysis, 0005 Trusted Compile-time Macros

## Summary

The compiler front end now represents every parsed form with a source span.
Reader, macro expansion, and lexical analysis preserve this metadata so public
compiler errors can identify the filename, line, and column of the relevant
source form.

```text
source -> located forms -> expanded located forms -> analysis -> IR
       -> direct ESM and optional source-map emission
```

Location wrappers are an internal front-end representation. Existing reader
and emitter APIs continue to accept and return ordinary Emacs Lisp data.

## Source Spans

`eliscript-source-span` records:

- optional source filename
- zero-based start and exclusive end character offsets
- one-based start and end line and column values

`eliscript-located-form` pairs a value with its span. Lists and vectors contain
located children recursively, so two occurrences of the same interned symbol
retain distinct positions.

`eliscript-read-located-string` and `eliscript-read-located-file` expose this
representation to compiler phases. The original `eliscript-read-string` and
`eliscript-read-file` functions recursively strip wrappers before returning,
preserving their public behavior.

## Macro Origins

Handwritten forms retain their original spans while the expander walks them.
Macro arguments are stripped to ordinary Emacs Lisp data before trusted macro
code runs. The returned expansion is recursively located at the macro call
span, providing a stable origin even though generated syntax has no direct
character range in the input.

This is intentionally one origin per generated expansion tree. Detailed macro
expansion traces and mixed definition/call-site provenance remain future work.

## Diagnostics

Reader, expansion, and analysis failures use this display format when a span is
available:

```text
path/to/file.eli:line:column: message
```

Examples include incomplete input, failed macro execution, duplicate or invalid
bindings, immutable assignment, invalid exports, and unbound symbols. Macro
generated semantic errors point to the macro call that produced the form.

Conditions remain compatible with the existing hierarchy:

- `eliscript-read-error`
- `eliscript-expand-error` under `eliscript-compile-error`
- `eliscript-analyze-error` under `eliscript-compile-error`

## Emission Boundary

The analyzer returns located forms to the lowering pass. IR nodes retain their
spans, and the direct backend uses those spans for optional Source Map v3
output. Ordinary compilation still preserves the original M0 output
byte-for-byte.

## Acceptance Evidence

- Recursive reader tests verify distinct top-level and nested symbol spans.
- Reader diagnostics report the starting line and column of incomplete input.
- Analyzer diagnostics identify the exact unbound symbol occurrence.
- Macro failures and semantic errors in generated forms identify the call site.
- Source maps point emitted IR nodes back to handwritten or macro-call spans.
- Existing snapshots and Bun execution remain unchanged.

## Deferred Work

- structured diagnostic values in addition to formatted condition messages
- expansion stacks with definition and nested call origins
