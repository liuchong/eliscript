# 0071: Canonical Portable Data Text

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0053 Eliscript-authored Persistent Vector Trie,
  0054 Eliscript-authored Persistent List,
  0055 Eliscript-authored Persistent HAMT Map,
  0056 Eliscript-authored Persistent Map-backed Set,
  0057 Portable Value Semantics Core,
  0068 Immutable Metadata Semantics,
  0069 Canonical Runtime Data Text,
  0070 Portable Keyword and Symbol Values

## Summary

This specification implements the canonical Eliscript data-text grammar in
portable `.eli` code. It covers scalar and identifier values, persistent List,
Vector, Map, and Set values, and immutable collection metadata. Printing and
reading are part of a portable dependency closure and produce the same bytes
as the optimized runtime implementation over their common value subset.

List values originally added one grammar form absent from 0069; specification
0086 now implements the same form in the optimized runtime:

```text
(value ...)
```

The compiler source reader remains independent. Data text never evaluates
forms or expands reader macros.

## Portable Intrinsics

The portable subset adds three deterministic ECMAScript conversion
operations:

```text
(string-from-code-unit integer)
(string-to-number text)
(string-to-bigint text)
```

`string-from-code-unit` is the inverse building block for the existing
`string-code-unit-at`. `string-to-number` uses ECMAScript Number conversion;
the data reader validates canonical decimal grammar before calling it.
`string-to-bigint` returns nil rather than exposing a host exception when
conversion fails. These operations are implemented identically by the seed
and self-hosted emitters and are permitted inside `defportable` closures.

No arbitrary host method, raw JavaScript, mutable object write, or host
constructor becomes portable.

## Public Surface and Result Values

`stdlib/data-text.eli` exports:

```text
data-text-result-value print-value read-value read-values
```

Portable functions cannot throw or catch exceptions. Every public operation
therefore returns an explicit result object:

```text
success: { ok: true,  payload: [value], count, index }
failure: { ok: false, error: { code, message, ... }, count, index }
```

The one-element payload is required because a normal property read uses
nullish fallback semantics and would lose a successful `undefined` value.
`data-text-result-value` reads the payload without that fallback. `read-values`
returns a persistent Vector inside the payload, not a native result array.

## Grammar and Canonical Form

All 0069 scalar, Keyword, Symbol, Vector, Map, Set, metadata, tagged identifier,
comment, separator, and ordering rules apply. This specification additionally
defines List text as ordered parentheses.

Map entries sort by printed key and then printed value. Set members sort by
printed value. Sorting is an Eliscript-authored stable merge sort over local
native work arrays and does not mutate source collections. Lists and Vectors
retain logical order.

The portable printer accepts portable identifiers and all four portable
collection families. It also accepts optimized runtime Keyword and Symbol
values through the shared 0070 logical type. Optimized collection classes use
the separate 0069 implementation.

## Reader Construction

The reader creates only portable language values:

- `(...)` becomes a persistent List
- `[...]` becomes a persistent Vector
- `{...}` becomes a value-semantic persistent Map
- `#{...}` becomes a value-semantic persistent Set
- compact and tagged identifiers become portable 0070 values
- `^metadata value` attaches a portable persistent metadata Map

Duplicate equal Map keys and Set members are rejected before insertion.
Current portable collections do not yet expose owner-token transient builders;
the reader therefore uses their persistent construction APIs. This remains
bounded by the documented trie/HAMT complexity and does not fall back to native
containers as returned values.

## Strings, Numbers, and Locations

Strings use canonical JSON quoting implemented over UTF-16 code units. The
reader handles simple escapes and `\uXXXX`, rejects unescaped controls and
malformed escapes, and preserves lone surrogate code units consistently with
JavaScript strings.

Finite Number and BigInt tokens are grammar-validated before conversion.
`##NaN`, `##Inf`, and `##-Inf` retain the 0069 spelling. Negative zero prints
as `0` through ECMAScript string conversion.

Reader errors use `ELI-DATA-TEXT`, UTF-16 offsets, one-based lines, one-based
Unicode code-point columns, and source length. Errors are ordinary immutable
result data suitable for worker transport.

## Resource Limits

The default limits match 0069:

```text
maxDepth  = 256
maxLength = 16 MiB UTF-16 code units
maxValues = 1,000,000
```

Portable overrides are positive signed 32-bit integers. The reader checks
length before parsing and threads depth/value budgets through every recursive
result. The printer checks every completed subtree and returns a failure result
when a limit is exceeded.

## Acceptance Criteria

- **PDT-01:** Scalar, portable identifier, List, Vector, Map, Set, and metadata
  values have documented canonical text.
- **PDT-02:** Reading printed supported data yields a value-equal result and a
  byte-identical reprint.
- **PDT-03:** List text preserves category and order rather than becoming a
  native array or Vector.
- **PDT-04:** Map/Set output is independent of insertion and HAMT traversal
  order and rejects duplicate equal values on input.
- **PDT-05:** Successful `undefined` survives the explicit result payload and
  nested persistent collection construction.
- **PDT-06:** Located malformed-input failures and depth/length/value limits
  are deterministic transportable data.
- **PDT-07:** At least 2,000 generated nested persistent values satisfy value
  equality and canonical fixed-point properties.
- **PDT-08:** The runtime and portable printers emit identical bytes over an
  annotated common List/Vector/Map/Set/identifier subset.
- **PDT-09:** All nine source modules and Source Maps match byte-for-byte under
  seed and self-hosted compilation.
- **PDT-10:** Bun and Node produce identical reports for both compiler
  generations.
- **PDT-11:** The three conversion intrinsics have seed/self-hosted emission
  and arity evidence and remain legal inside portable closures.
- **PDT-12:** Public-surface, compatibility, conformance, full default-test,
  CLI, and strict byte-compilation gates remain green. Application frameworks
  are not prerequisites for portable data text.

## Next Boundary

P1 construction is represented across implementation, value semantics,
metadata, properties, and canonical text, and its exit audit is complete.
Vector and Map source literals have migrated provisionally; optimized List
text now exists through 0086. Quoted persistent-data migration must separately
prove compiler syntax identity, macro behavior, compatibility, and rollback
boundaries.
