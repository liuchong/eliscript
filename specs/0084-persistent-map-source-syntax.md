# 0084: Persistent Map Source Syntax

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0005 Compile-time Macros,
  0007 Explicit Intermediate Representation,
  0014 Portable Syntax and Reader,
  0019 Self-hosted Compiler Driver,
  0055 Eliscript-authored Persistent HAMT Map,
  0082 Persistent Literal Runtime ABI

## Summary

Brace expressions are the canonical source syntax for immutable persistent
Maps:

```text
{:name "Ada" :ready t}
```

The reader desugars this syntax to the existing `(hash-map ...)` constructor,
which lowers to `persistent-map-literal` and links the canonical
`eliscript/runtime/literals` ABI. This adds no second Map representation and
does not change the optimized HAMT implementation or its value semantics.

This specification is a core language and compiler contract. UI frameworks,
bundlers, development servers, and application adapters may exercise the
generated ESM in separate integration examples, but they are not language
dependencies, design goals, or acceptance evidence for Map syntax.

## Reader Grammar

A Map literal is a brace-delimited sequence containing an even number of
forms:

```text
map = "{" *(key value) "}"
```

Empty, nested, and heterogeneous Maps are valid. Keys and values are ordinary
expressions, so persistent Vectors and Maps may be nested or used as keys.
Braces inside strings or comments are text and have no delimiter meaning.

An odd number of forms is a reader error at the opening brace:

```text
map literal must contain an even number of forms
```

Unexpected end of input, standalone closing braces, and mismatched delimiters
retain the structured reader diagnostic contract. The seed and self-hosted
readers must report the same filename, line, column, code, and message.

## Canonical Desugaring and Spans

The located reader output for:

```text
{:name "Ada"}
```

is canonically equivalent to:

```text
(hash-map :name "Ada")
```

The synthetic `hash-map` operator inherits the opening brace position. The
outer located form spans the complete brace expression, while every key and
value preserves its exact source span. Desugaring is length-preserving in the
seed reader so Emacs offsets remain source offsets rather than transformed
buffer offsets.

`(hash-map ...)` remains a supported explicit constructor and has identical
runtime semantics. The lowerer produces `persistent-map-literal` for both
spellings, and IR round trips use `(hash-map ...)` as the canonical form.

## Runtime Semantics

Evaluation proceeds from left to right in key/value pairs. Construction uses
the canonical immutable HAMT Map and shared value equality and hashing.
Value-equal Vector or Map keys therefore address the same entry. If a literal
contains duplicate value-equal keys, the last value wins, matching
`(hash-map ...)`.

Native JavaScript objects remain explicit through `(js-object ...)`. A brace
literal never constructs a JavaScript object, and a host object never silently
acquires persistent Map semantics.

## Macro and Quoted-data Boundary

Brace expressions participate in macro expansion through their canonical
`hash-map` syntax. Macros may generate a Map expression with quasiquote and
unquote, and seed/self-hosted expansion must agree.

Quoted brace forms remain constructor syntax data in this slice. For example,
`'{:ready t}` is represented as quoted `(hash-map :ready t)` syntax rather
than an evaluated persistent Map. First-class quoted persistent values are
reserved for canonical data-reader integration; this boundary prevents the
reader from conflating executable source with runtime data.

## Portable and Bootstrap Boundary

Portable closures reject brace Map literals and `(hash-map ...)` until the
persistent-value worker codec is specified and implemented. Both spellings
must produce the same persistent-runtime-value diagnostic in seed and
self-hosted compilers.

The self-hosted reader implements braces directly and emits the same located
syntax tree as the seed reader. Reader fixtures, macro fixtures, IR fixtures,
ESM, Source Maps, diagnostics, and the three-generation compiler fixed point
must remain equal.

## Compatibility Boundary

This is an additive provisional syntax contract. Existing `(hash-map ...)`
source remains valid. Brace expressions were previously invalid Eliscript, so
no valid Map expression changes meaning. The feature remains provisional until
the complete persistent literal and quoted-data family is promoted.

## Remaining P3 Work

1. integrate quoted persistent values with the canonical data reader
2. implement transport-safe persistent values in the Emacs worker codec
3. audit legacy List and host-container compatibility forms
4. promote the complete literal and host-container contract after migration

## Acceptance Criteria

- **MSL-01:** Empty, nested, and heterogeneous brace expressions read as
  canonical `hash-map` constructor syntax.
- **MSL-02:** Odd forms, unexpected end of input, standalone braces, and
  mismatched delimiters produce matching seed/self-hosted diagnostics.
- **MSL-03:** Strings and comments containing braces are unchanged.
- **MSL-04:** Located Map forms preserve the complete source span and each
  nested key/value span; the synthetic operator uses the opening brace.
- **MSL-05:** Brace syntax and `(hash-map ...)` lower to the same
  `persistent-map-literal` IR and link one literal runtime import.
- **MSL-06:** Nested Maps and Vector keys use canonical persistent values and
  shared equality and hashing under Bun and Node.
- **MSL-07:** Duplicate value-equal keys retain the last value.
- **MSL-08:** `(js-object ...)` remains an exact native host object and does
  not acquire brace syntax.
- **MSL-09:** Macros can generate brace Map expressions with matching seed and
  self-hosted expansions.
- **MSL-10:** Quoted brace expressions retain canonical constructor syntax
  data rather than evaluating a Map.
- **MSL-11:** Portable closures reject both Map spellings with matching
  diagnostics.
- **MSL-12:** Seed/self-hosted ESM, Source Maps, diagnostics, reader trees,
  macro expansions, and IR trees remain equal.
- **MSL-13:** The three-generation compiler fixed point remains reproducible
  and host-independent.
- **MSL-14:** Compatibility and conformance registries record the feature as
  provisional with executable evidence.
- **MSL-15:** No UI framework, bundler, or application adapter appears in the
  compiler/runtime implementation or acceptance evidence for this behavior.
