# 0087: First-class Quoted Persistent Data

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0005 Compile-time Macros,
  0007 Explicit Intermediate Representation,
  0019 Self-hosted Compiler Driver,
  0067 First-class Keyword and Symbol Values,
  0069 Canonical Runtime Data Text,
  0082 Persistent Literal Runtime ABI and Explicit Host Containers,
  0086 Optimized Runtime Persistent List and Canonical Data Text

## Summary

Quoted Eliscript source now evaluates to canonical language data rather than
mutable JavaScript Arrays and category-erasing strings. Proper Lists become
optimized Persistent Lists, Vectors become Persistent Vectors, Symbols become
Eliscript Symbol values, and Keywords become interned Keyword values.

This is a compiler, runtime, and language-data contract. Application
frameworks, UI libraries, bundlers, publishing adapters, and development
servers are replaceable consumers and are neither dependencies nor core goals.

## Source and Value Semantics

Both reader spellings remain equivalent:

```text
'datum
(quote datum)
```

The quote result follows this category table:

| Source datum | Runtime value |
| --- | --- |
| `()` or `nil` | empty Persistent List |
| proper List | Persistent List of recursively quoted members |
| Vector | Persistent Vector of recursively quoted members |
| Symbol | immutable Eliscript Symbol |
| Keyword | interned immutable Keyword |
| `t` | `true` |
| `undefined` | JavaScript `undefined` scalar |
| Number or string | the same scalar value |
| `false` | Eliscript Symbol named `false` |

`false` remains Symbol syntax inside quote because quoting suppresses its
evaluated false value. `undefined` remains the language's explicit nullish
scalar category. Metadata is not inferred from source positions.

Dotted Lists remain unsupported and fail during emission. This slice does not
introduce cons-cell tail syntax.

## Brace Map Syntax

Specification 0084 defines brace syntax as canonical `(hash-map ...)`
constructor syntax before lowering. Quoting a brace form therefore preserves
syntax rather than evaluating it:

```text
'{:ready t}
=> (hash-map :ready true)
```

The result is a Persistent List whose first member is Symbol `hash-map`; it is
not a Persistent Map. This keeps quote non-evaluating and makes the existing
reader desugaring explicit. Canonical data text remains the format for reading
an already materialized Map value.

## Runtime ABI

`eliscript/runtime/literals.mjs` adds two package-owned constructor exports:

```text
list symbol
```

Generated ESM binds these beside `hashMap`, `keyword`, and `vector` in one
sorted import. A quote links the literal runtime only when its result needs a
persistent collection or identifier value. Quoted Numbers, strings, `t`, and
`undefined` do not add the import by themselves.

Explicit `js-array`, `js-object`, `js-nth`, and `js-length` remain native host
operations. A module using only those forms does not link the literal runtime.

## Compiler Agreement

The seed compiler retains quoted datum in `quoted-literal` IR. The self-hosted
lowerer retains an equivalent category-tagged portable datum. Their emitters
must produce byte-identical constructor calls and Source Maps.

Macro expansion still treats quote as syntax protection. Macro-generated
quoted Symbols become the same runtime Symbol category after expansion, while
macro templates and capture rules remain unchanged. Three-generation compiler
output must remain a byte-identical fixed point.

## Portable Worker Boundary

Quoted data that constructs a List, Vector, Symbol, or Keyword is accepted
inside `defportable`. Seed and self-hosted analyzers produce byte-identical
runtime constructor calls, and callers use the explicit 0088 worker codec when
those values cross the process boundary.

Quoted Number, string, `t`, and `undefined` values remain portable because
their runtime representation is already transport-safe and requires no
literal-runtime import.

## Compatibility Boundary

This is an intentional provisional semantic change. Code that previously used
quote to obtain native Arrays or strings must use explicit host constructors or
string literals. Generic iteration continues to work because Persistent List
and Vector are iterable, but native Array identity, mutation, methods, and JSON
serialization are no longer implied.

Quoted brace forms remain syntax Lists rather than evaluated Maps. Quasiquote
continues to be a macro-construction facility and is not redefined by this
runtime-value migration.

## Acceptance Criteria

- **QPD-01:** Empty and non-empty quoted proper Lists construct frozen optimized
  Persistent Lists in logical order.
- **QPD-02:** Quoted Vectors construct Persistent Vectors and preserve nested
  List/Vector categories recursively.
- **QPD-03:** Quoted Symbols and Keywords construct canonical first-class
  identifier values rather than strings.
- **QPD-04:** Quoted `false`, `undefined`, `t`, Number, and string values follow
  the explicit scalar/category table.
- **QPD-05:** Quoted brace Maps remain persistent constructor syntax Lists and
  do not evaluate into Maps.
- **QPD-06:** Generated quote values print as canonical data text and agree
  under Bun and Node.
- **QPD-07:** Seed and self-hosted readers, macro expansion, IR, ESM, Source
  Maps, diagnostics, and compiler fixed point remain identical.
- **QPD-08:** Literal runtime imports are sorted, emitted once when needed, and
  absent from scalar-quote-only and explicit-host-only modules.
- **QPD-09:** Macro-generated Symbols retain deterministic spelling and capture
  behavior after becoming runtime Symbol values.
- **QPD-10:** Persistent and scalar quoted data are accepted in portable
  closures with matching seed/self-hosted output and codec behavior.
- **QPD-11:** Dotted quoted Lists continue to fail deterministically.
- **QPD-12:** Public-surface, compatibility, and conformance registries track
  both new literal-runtime exports and executable evidence.
- **QPD-13:** The default test target executes quote, bootstrap, macro,
  portable-boundary, Bun, and Node evidence.
- **QPD-14:** Existing explicit host Array/Object behavior and application
  adapters retain their output through the compatibility suite.
- **QPD-15:** No application framework, UI library, bundler, publishing adapter,
  or development server is imported by core quote implementation or required
  for acceptance.

## Next Boundary

The versioned persistent-value codec is implemented by 0088, static transient
ownership analysis by 0093, and ordinary List construction/operations by
0094. Specification 0095 removes the provisional host aliases and completes
the stable P3 value and host-container boundary.
