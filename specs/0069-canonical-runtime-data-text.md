# 0069: Canonical Runtime Data Text

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0048 Value Equality and Deterministic Hashing,
  0058 Open Protocol Dispatch Core,
  0067 First-class Keyword and Symbol Values,
  0068 Immutable Metadata Semantics

## Summary

This specification defines a deterministic readable text representation for
the optimized Eliscript runtime value family. `print-value` emits one
canonical spelling; `read-value` reconstructs an equal value; printing the
reconstructed value produces byte-identical text.

The format covers nullish and numeric scalar edges, strings, Keyword and Symbol
values, persistent List/Vector/Map/Set values, and immutable metadata. It is
separate from the compiler source reader, generated JavaScript serialization,
the future versioned Emacs value codec, and the portable collection text
implementation defined by 0071. Specification 0086 extends the original
runtime grammar with the optimized List category.

## Public Surface

`runtime/core/data-text.mjs` exports:

```text
DataTextError IPrint printValue readValue readValues
```

`stdlib/core/data-text.eli` exposes the Lisp-named surface:

```text
DataTextError IPrint print-value read-value read-values
```

`IPrint` is an open single-operation protocol. Core scalar categories use host
category extensions; Keyword, Symbol, List, Vector, Map, and Set use exact runtime
type extensions. External types may implement printing through the existing
protocol extension API, but only the core grammar below is guaranteed to be
readable and round-trippable.

## Canonical Grammar

The canonical spellings are:

| Value | Text |
| --- | --- |
| null | `nil` |
| undefined | `undefined` |
| booleans | `true`, `false` |
| finite Number | ECMAScript shortest decimal, with negative zero normalized to `0` |
| non-finite Number | `##NaN`, `##Inf`, `##-Inf` |
| BigInt | decimal digits followed by `N` |
| string | JSON string syntax |
| Keyword | `:name` or `:namespace/name` |
| Symbol | `name` or `namespace/name` |
| List | `(value ...)` |
| Vector | `[value ...]` |
| Map | `{key value ...}` |
| Set | `#{value ...}` |
| annotated value | `^metadata-map value` |

Whitespace separates adjacent values. The reader also accepts commas as
whitespace and semicolon line comments; the printer emits neither.

## Identifier Escapes

Common delimiter-free identifiers use the compact Keyword and Symbol forms.
An identifier that contains whitespace, delimiters, or a Symbol spelling
reserved for a scalar uses one explicit tagged form:

```text
#eliscript/keyword [namespace-or-nil "name"]
#eliscript/symbol  [namespace-or-nil "name"]
```

The payload must be a two-element persistent Vector. Namespace is `nil` or a
string and name is a string; the ordinary 0067 constructor validation remains
authoritative. The printer chooses the compact form exactly when it is
unambiguous and otherwise chooses the tagged form.

## Deterministic Collection Order

List and Vector order is logical sequence order. Map and Set insertion/trie traversal
order is never observable in canonical text:

- each Map key and value is printed once
- entries sort by printed key, then printed value
- each Set member is printed once and members sort by printed text
- sorting uses deterministic JavaScript string comparison over UTF-16 code
  units and is identical under supported Bun and Node hosts

Duplicate equal Map keys and Set members are rejected by the reader rather
than silently collapsed. A Map with an unmatched key is rejected.

## Metadata

When `meta(value)` is non-null, the printer emits one `^` prefix, the complete
metadata Map, one space, and the value body. Metadata itself may carry metadata
under the same recursive rule. The reader requires the prefix value to be a
runtime persistent Map and the target to implement `IWithMeta`.

Metadata remains excluded from equality and hashing by 0068. Therefore the
round-trip invariant is value equality plus metadata equality at each
annotated root, not JavaScript object identity.

## Reader and Error Contract

`readValue` reads exactly one value and rejects trailing data. `readValues`
reads zero or more values and returns one frozen native result array. Persistent
Vector, Map, and Set values are constructed through owner-token transient
builders, so parsing does not create every intermediate persistent root. List
values use bounded native accumulation followed by iterative linked
construction in reverse order.

Malformed input throws `DataTextError`, a `SyntaxError` subtype with:

```text
code = "ELI-DATA-TEXT"
offset, line, column, sourceLength
```

Offsets use JavaScript UTF-16 code units; line and column are one-based Unicode
code-point positions. Messages identify unexpected input, unmatched
delimiters, malformed strings/tags, duplicate values, invalid metadata, and
trailing data.

## Resource Limits

Both printer and reader accept `nil`/omitted options or an object with positive
safe-integer overrides:

```text
maxDepth  = 256
maxLength = 16 MiB UTF-16 code units
maxValues = 1,000,000
```

The reader checks input length before parsing and checks depth/value count as
it descends. The printer applies the same depth/value accounting and rejects a
result subtree that exceeds the output limit. Invalid options throw
`TypeError`; exceeded limits throw `RangeError` during printing and located
`DataTextError` during reading, except the pre-parse input-length check, which
throws `RangeError`.

## Scope and Compatibility

This provisional M8 module covers the optimized runtime family only. It does
not read portable Eliscript collection representations, native JavaScript
Array/Object/Map/Set values, local JavaScript Symbols, cyclic
host objects, executable forms, reader macros, or arbitrary tagged literals.
The matching portable grammar, including Lists, is implemented separately by
0071.

The compiler source reader remains responsible for `.eli` programs and located
syntax. The future Emacs value codec must add explicit framing, versioning,
size/cancellation policy, and transport safety rather than treating this text
format as an unframed wire protocol.

## Acceptance Criteria

- **CDT-01:** Scalar, Keyword, Symbol, List, Vector, Map, Set, and metadata values
  have one documented canonical text form.
- **CDT-02:** Printing then reading every supported value produces an equal
  value and byte-identical reprinted text.
- **CDT-03:** Map and Set text is independent of insertion and HAMT traversal
  order.
- **CDT-04:** Unsafe and reserved identifier spellings round-trip through
  explicit tags without weakening identifier validation.
- **CDT-05:** Metadata prefixes preserve metadata Maps while equality and hash
  semantics remain unchanged.
- **CDT-06:** Duplicate keys/members, odd Maps, unterminated Lists,
  unsupported tags/values,
  malformed strings, delimiters, and trailing data fail deterministically.
- **CDT-07:** Errors include stable code and UTF-16 offset plus one-based line
  and code-point column.
- **CDT-08:** Depth, input/output length, and value-count limits terminate
  printer and reader work predictably.
- **CDT-09:** Map, Set, and Vector reading uses transient final construction;
  List reading uses bounded iterative construction.
- **CDT-10:** At least 2,000 generated nested values satisfy equality and
  canonical-text fixed-point properties.
- **CDT-11:** Bun and Node produce identical canonical reports.
- **CDT-12:** The Lisp-named core module compiles identically under seed and
  self-hosted compilers and executes from generated Eliscript code.
- **CDT-13:** Public-surface, compatibility, conformance, full default-test,
  CLI, and strict byte-compilation checks remain green. Application frameworks
  are not prerequisites for canonical data text.

## Next Boundary

0070 and 0071 complete the portable identifier and collection side; 0086 adds
runtime List byte parity across the common value subset. The compiler source
reader remains independent. Quoted persistent-data migration must separately
prove compiler syntax identity and compatibility evidence.
