# 0076: Portable JSON Values

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0021 Portable Functions and Dependency Closure,
  0053 Eliscript Persistent Vector,
  0055 Eliscript Persistent HAMT Map,
  0057 Portable Value Semantics Core,
  0075 Portable Result Values

## Summary

This specification defines a strict JSON boundary implemented in portable
Eliscript. `stdlib/json.eli` parses JSON text directly into immutable
persistent Vector and value-semantic Map values and encodes that same portable
value family into deterministic JSON text. It does not delegate grammar,
container construction, key handling, or serialization to `JSON.parse`,
`JSON.stringify`, native Array, or native plain-object conversion.

Both public operations return Result values. Invalid text, unsupported values,
cycles, invalid options, and resource-limit violations are ordinary immutable
errors rather than JavaScript exceptions. Programming defects and impossible
host failures are not hidden by a catch-all boundary.

This is a JSON interchange codec, not the complete Eliscript value codec.
Keyword, Symbol, List, Set, metadata, undefined, Atom, functions, native
containers, and opaque host identities remain outside the accepted JSON value
domain.

## Public Surface

The module exports seven portable functions:

- `parse-json(source, options?)`
- `stringify-json(value, options?)`
- `json-error?(value)`
- `json-error-code(error)`
- `json-error-message(error)`
- `json-error-offset(error)`
- `json-error-path(error)`

`parse-json` returns Ok containing one portable JSON value or Err containing a
JSON error. `stringify-json` returns Ok containing text or Err containing a
JSON error. The accessors return nil for a non-error value.

Options are a host configuration object because they control execution rather
than enter the encoded value graph. Omitted or nullish options select all
defaults. Unknown enumerable keys, explicitly nullish fields, non-integer
values, and values outside the declared hard bounds reject the complete
operation with `ELI-JSON-OPTIONS`.

## Portable JSON Value Domain

The accepted value mapping is exact:

| JSON | Eliscript parse result | Stringify input |
| --- | --- | --- |
| `null` | `nil` | `nil` |
| boolean | boolean | boolean |
| finite number | number | finite number |
| string | string | string |
| array | persistent Vector | persistent Vector |
| object | value-semantic persistent Map | persistent Map with string keys |

Native JavaScript Array, Object, Map, and Set values are not accepted by
`stringify-json`, even when their contents look JSON-compatible. Applications
must cross that boundary explicitly through `interop/js`. This prevents an
implicit deep conversion policy from becoming part of the codec.

Non-finite numbers reject with `ELI-JSON-NUMBER`. All other out-of-domain
values reject with `ELI-JSON-UNSUPPORTED`; a persistent Map containing any
non-string key rejects with `ELI-JSON-KEY`. No unsupported value is silently
omitted, replaced by null, or converted through a host coercion.

## Strict Parsing

The parser consumes exactly one RFC 8259-shaped JSON value plus the four JSON
whitespace code units: space, tab, line feed, and carriage return. It uses a
portable recursive-descent grammar and iterative array/object member loops.

The following are rejected:

- empty or whitespace-only input
- leading-zero numbers other than zero itself
- a decimal point without a following digit
- an exponent marker and optional sign without a following digit
- numeric text that converts outside the finite IEEE-754 range
- single-quoted strings, unknown escapes, incomplete Unicode escapes, and
  unescaped control code units
- unquoted object keys, missing colons, missing separators, and trailing
  commas
- trailing non-whitespace data after the first value
- duplicate object keys

Duplicate keys reject with `ELI-JSON-DUPLICATE` before the duplicate value is
read. The parser never implements last-key-wins behavior. Object keys are not
included in `maxValues`; each scalar, array, and object value is included.

Arrays are accumulated directly with persistent Vector operations. Objects
are accumulated directly through value-semantic persistent Map association.
There is no native-container intermediate representation.

## Strings and Unicode

Parsing and encoding use JavaScript-compatible UTF-16 code-unit indexing,
which is also the unit used by source offsets and `maxLength`. The parser
recognizes the eight JSON escapes and decodes each `\uXXXX` sequence to its
exact code unit. A valid surrogate pair therefore reconstructs the original
two-code-unit string; lone surrogate code units remain representable.

The encoder uses the short escapes for quotation mark, reverse solidus,
backspace, tab, line feed, form feed, and carriage return. Other controls and
all surrogate code units use lowercase four-digit `\uXXXX` escapes. Escaping
every surrogate makes output independent of source-file and terminal Unicode
handling while preserving exact UTF-16 content.

Object paths use bracketed JSON string keys, such as `$["user"]["name"]`.
Array paths use decimal indices, such as `$[3]`.

## Deterministic Encoding

Persistent Map entries are sorted by string-key UTF-16 order before encoding.
Two equal Maps produce identical output regardless of insertion order. Arrays
retain source order. The encoder emits no insignificant whitespace.

Finite numbers use the portable host number-to-string primitive after the
finite check. Negative zero therefore emits as `0`. This is the Eliscript JSON
determinism contract; it does not claim byte compatibility with RFC 8785 or a
lossless arbitrary-precision numeric format.

Sorting is a bottom-up stable merge sort implemented over persistent Vectors.
It does not rely on native Array sorting or a host comparator. Recursive value
encoding carries only the active ancestor identities. Reusing one immutable
Vector or Map in separate branches is valid and emits it twice; reaching an
active ancestor rejects with `ELI-JSON-CYCLE` and identifies both paths.

## Error Values

A JSON error is an exact five-field value-semantic persistent Map:

```text
{"kind" "eliscript/json-error",
 "code" code,
 "message" message,
 "offset" integer-or-nil,
 "path" path}
```

Parse errors carry a zero-based UTF-16 source offset. Encode errors carry nil
because no input source position exists. Every error carries a root-relative
path beginning with `$`. Error messages are stable explanatory text, while
the code is the programmatic category.

The initial code set is:

| Code | Meaning |
| --- | --- |
| `ELI-JSON-TYPE` | parse input is not a string |
| `ELI-JSON-SYNTAX` | input violates the JSON grammar |
| `ELI-JSON-DUPLICATE` | an object key occurs more than once |
| `ELI-JSON-NUMBER` | a parsed or encoded number is not finite |
| `ELI-JSON-UNSUPPORTED` | a value is outside the portable JSON domain |
| `ELI-JSON-KEY` | a persistent Map key is not a string |
| `ELI-JSON-CYCLE` | an encoded value reaches an active ancestor |
| `ELI-JSON-OPTIONS` | the options object is invalid |
| `ELI-JSON-LENGTH` | source or output exceeds `maxLength` |
| `ELI-JSON-DEPTH` | the value graph exceeds `maxDepth` |
| `ELI-JSON-VALUES` | the value graph exceeds `maxValues` |

## Resource Limits

Both operations enforce the same three named limits:

| Option | Default | Hard maximum | Unit |
| --- | ---: | ---: | --- |
| `maxDepth` | 256 | 512 | root is depth zero |
| `maxLength` | 16,777,216 | 67,108,864 | UTF-16 code units |
| `maxValues` | 1,000,000 | 10,000,000 | scalar and container values |

`maxDepth` may be zero; the other limits must be positive. Parsing rejects an
oversized source before grammar work begins. Encoding checks accumulated text
during construction and after the final delimiter. Depth and value checks run
before descending into a node, so the error path identifies the first value
that would exceed the configured bound.

The recursive nesting bound is lower than the hard maximum to keep the normal
default inside supported host stack budgets. Array and object breadth is
iterative and does not consume call stack with element count.

## Portability and Dependency Closure

The implementation consists only of `defportable` declarations plus portable
imports. The host identity token primitive is used solely to detect active
ancestor identity while encoding persistent containers; it does not affect
serialized bytes, parsed value equality, or hashes.

Seed and self-hosted compilers emit byte-identical ESM and Source Maps for the
complete dependency graph. Bun and Node execute identical behavior reports.
Portable selection from `parse-json` excludes the stringify entry point,
encoder traversal, and entry sorting.

This module is provisional during M11. Error names, limits, and the seven
exports are tracked in compatibility and public-surface contracts but become
stable only through the complete core-library naming and error audit.

## Acceptance Criteria

- **JSL-01:** Strict valid JSON parses directly to the declared scalar,
  persistent Vector, and value-semantic persistent Map family.
- **JSL-02:** The malformed corpus rejects leading zeros, incomplete numeric
  parts, invalid string escapes, invalid object syntax, trailing commas, and
  trailing data without a host exception.
- **JSL-03:** Duplicate object keys reject with the stable code, duplicate-key
  offset, and exact key path.
- **JSL-04:** Strings round trip exact controls, escapes, BMP code units,
  surrogate pairs, and lone surrogate code units under the UTF-16 contract.
- **JSL-05:** Persistent Map output is insertion-order independent, sorted by
  string key, compact, and stable across supported hosts.
- **JSL-06:** Undefined, BigInt, Keyword, Symbol, List, Set, native containers,
  opaque host values, non-string Map keys, and non-finite numbers reject with
  their declared categories.
- **JSL-07:** Shared persistent subgraphs encode normally while an active
  ancestor cycle rejects with both the current and referenced paths.
- **JSL-08:** Invalid options and each configured length, depth, and value
  boundary reject through a valid five-field JSON error Result.
- **JSL-09:** Two thousand generated portable values survive
  stringify/parse with recursive value equality.
- **JSL-10:** A 20,000-item array parses and re-encodes without stack growth or
  ordering loss.
- **JSL-11:** Seed/self-hosted ESM and Source Maps are byte-identical, and Bun
  and Node produce the same complete behavior report.
- **JSL-12:** Portable selection keeps `parse-json` and its transitive grammar
  while pruning stringify traversal and entry sorting; registries, build,
  documentation, and full repository checks include the module.
