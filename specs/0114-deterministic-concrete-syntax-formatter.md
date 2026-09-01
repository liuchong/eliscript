# 0114: Deterministic Concrete-syntax Formatter

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0006 Located Forms and Diagnostic Positions,
  0014 Portable Syntax and Reader,
  0019 Self-hosted Compiler Driver,
  0043 Structured Compiler Diagnostics

## Summary

Eliscript formatting is a compiler-owned, self-hosted language operation. It
formats concrete source syntax rather than printing semantic forms, so comments,
reader prefixes, literal spelling, collection delimiters, and raw JavaScript
strings remain represented in the output. Bun and Node invoke the same generated
formatter module through a narrow filesystem adapter.

Formatter version 1 fixes two-space indentation, an 88-column preferred width,
LF line endings, no trailing horizontal whitespace, and exactly one final
newline for non-empty source. Empty or whitespace-only source becomes empty.
These values are part of the versioned contract; command options cannot create
host-specific style dialects.

Application frameworks, UI libraries, bundlers, publishing systems, site
generators, hosting, and development servers are outside the implementation,
dependencies, evidence, and maturity credit of this capability.

## Concrete Syntax Model

The formatter tokenizes these source categories without evaluating them:

- atoms and string literals, whose source spelling is retained byte-for-byte
- line comments beginning with `;`, retaining comment text while removing
  trailing horizontal whitespace
- list, Vector, Map, and Set delimiters: `()`, `[]`, `{}`, and `#{}`
- reader prefixes: `'`, `` ` ``, `,`, `,@`, and `#'`

Whitespace is trivia and is reconstructed by the layout operation. Comments are
nodes in the concrete tree rather than discarded reader trivia. A prefix owns
the next non-comment node, including a nested prefix or collection. Delimiter
nesting is validated even though the normal entry first invokes the versioned
reader, making formatter failures deterministic if the two concrete models ever
diverge.

The formatter never changes token text, collection kind, token order, comment
order, or reader-prefix ownership. It may move a trailing comment onto its own
line, which preserves language semantics and comment text while making repeated
formatting deterministic.

## Layout Contract

A collection stays on one line when its complete comment-free representation
fits the preferred width at the current indentation. Otherwise:

- a list keeps its head on the opening line
- declarations keep the declared name on the opening line when it fits
- condition and binding forms keep their first operand on the opening line when
  it is itself flat and fits
- remaining children use two additional spaces
- closing delimiters follow the final non-comment child; after a final comment,
  the delimiter is placed on a line at the collection indentation

Top-level forms are separated by one empty line. Adjacent top-level comments
remain a contiguous comment block with the following form. Non-empty output has
one final LF and no other trailing blank lines.

Formatting success requires that the portable reader accepts the input. The
test corpus additionally compiles original and formatted sources and requires
byte-identical generated ESM. Source Maps are intentionally not byte-identical
because source positions correctly follow the formatted input.

## Compiler API

The generated compiler exports:

- `formatter_format`: `"eliscript-formatter"`
- `formatter_version`: `1`
- `format_source(source, filename)`: return the canonical source string

`source` must be a string. `filename` is used for reader and formatter
diagnostics and may be absent. The operation is pure and performs no filesystem,
process, editor, watcher, or application work.

## Command Contract

`eliscript-format [OPTIONS] INPUT` exposes the generated operation:

- no mutation option: write canonical source to stdout
- `--write`: atomically replace `INPUT` only when bytes changed
- `--check`: write nothing and fail when canonical bytes differ
- `--diagnostic-format human|json`: select human or version 1 structured
  diagnostics
- `--help`: print command usage

`--write` and `--check` are mutually exclusive. Version 1 accepts one input
file so stdout and diagnostics have one unambiguous source identity. Project
enumeration belongs to the later project-aware check operation and cannot be
silently inferred by this command.

An unformatted file fails with diagnostic code `ELI-F0002`, phase `formatter`,
and the canonical absolute input filename. Reader failures retain their reader
diagnostic code and exact source position. Generic command or filesystem errors
retain the shared CLI diagnostic fallback.

## M10 Status

This specification completes only the deterministic formatter and format-check
deliverable of M10. It does not claim the Emacs major mode, project-aware check,
interactive evaluation, REPL, watch API, installation audit, or complete M10
exit gate.

## Acceptance Criteria

- **FMT-01:** The formatter is authored in Eliscript, compiled during bootstrap,
  and exported by the generated compiler.
- **FMT-02:** Atoms, strings, collection delimiters, reader prefixes, token
  order, and comment order are preserved.
- **FMT-03:** Output uses the fixed indentation, width, line-ending, trailing
  whitespace, top-level separation, and final-newline contract.
- **FMT-04:** Formatting is byte-idempotent over every maintained compiler and
  standard-library Eliscript source.
- **FMT-05:** Original and formatted core corpus sources emit byte-identical ESM
  under the self-hosted compiler.
- **FMT-06:** Bun and Node return byte-identical formatter output and
  diagnostics from the same generated module.
- **FMT-07:** `--write` changes only non-canonical input and leaves canonical
  input bytes unchanged.
- **FMT-08:** `--check` succeeds for canonical input, fails with `ELI-F0002` for
  non-canonical input, and never mutates the source.
- **FMT-09:** Human and JSON failures use stable command or structured compiler
  diagnostics without parsing terminal prose.
- **FMT-10:** Public surface and conformance registries track the command,
  formatter schema, exports, and default-suite evidence.
- **FMT-11:** Formatter implementation and evidence contain no application
  framework or application-tool dependency.
- **FMT-12:** M10 remains in progress until all other deliverables and its exit
  gate are independently proven.
