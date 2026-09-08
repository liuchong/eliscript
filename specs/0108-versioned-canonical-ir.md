# 0108: Versioned Canonical IR Serialization

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0007 Explicit Compiler Intermediate Representation,
  0019 Self-Hosted Compiler Driver,
  0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0043 Structured Compiler Diagnostics

## Summary

The self-hosted compiler now owns a lossless, versioned serialization boundary
for source-located compiler IR. It exports `serialize-ir-program` and
`deserialize-ir-program` from the generated in-memory compiler, with
`ir-format` and `ir-version` identifying the schema.

This boundary makes IR suitable for reproducible compiler artifacts, future
incremental cache records, cross-process phase composition, and compiler tools.
It does not expose host objects or reader-specific Emacs Lisp values.

## Version 1 Document

Canonical IR uses the `eliscript-ir` version 1 envelope:

```json
{
  "format": "eliscript-ir",
  "program": {
    "body": [],
    "filename": "src/main.eli"
  },
  "version": 1
}
```

The top-level, program, span, and node records are closed schemas. A program
contains exactly `filename` and `body`. Every node contains exactly `kind`,
`span`, `value`, and `children`, plus `properties` only when that node has
kind-specific data. Every span contains:

- `filename`, `start`, `end`
- one-based `line`, `column`, `endLine`, and `endColumn`

Node kinds are limited to the public IR registry. Source offsets are
non-negative safe integers, position fields are positive safe integers, and a
span start cannot exceed its end.

Literal categories that JavaScript JSON cannot otherwise distinguish remain
explicit in IR. Source `undefined` and Keyword literals have a JSON `null` or
string value plus `properties.literalKind`. Quoted data is already lowered to
JSON-safe tagged data before serialization.

## Canonical Encoding

Serialization recursively sorts object keys by ECMAScript string order and
emits compact UTF-8 JSON without insignificant whitespace or a trailing
newline. Arrays retain source order. Scalars use ECMAScript JSON spelling, so
all supported hosts produce the same bytes for the same IR tree. Negative zero
uses the valid JSON spelling `-0` so deserialization preserves `Object.is`
semantics instead of silently converting it to positive zero.

The encoder rejects values that ordinary `JSON.stringify` could lose or
rewrite silently:

- `undefined`, functions, symbols, big integers, and non-finite numbers
- sparse arrays, arrays with extra properties, and non-plain records
- symbol-keyed, non-enumerable, or accessor-backed properties
- cyclic data and IR child cycles
- nesting beyond 512 levels

Deserialization accepts canonical bytes only. It parses and validates the
closed versioned schema, re-encodes the document, and requires byte identity.
This rejects duplicate object keys, unknown fields, reordered fields,
alternative number spellings, and otherwise valid JSON containing whitespace.
Callers that need to ingest general JSON must canonicalize it through a
separate data boundary rather than weakening persisted IR identity.

## Diagnostics

Every serialization, parse, schema, and canonicality failure carries
`ELI-I0001` in phase `ir-schema` using diagnostic schema version 1. Error text
identifies the violated boundary without exposing a host stack trace.

An unsupported format or version fails closed. Version migration belongs in an
explicit reader selected by the format and version; it must not silently treat
future layouts as version 1.

## Compiler Boundary

`bootstrap/compiler/ir.eli` owns schema validation and canonical encoding.
`bootstrap/compiler/compiler.eli` only composes and exports the phase API. No
filesystem, path, cache, command-line, UI, or publishing policy participates
in the serialization algorithm.

The Emacs Lisp seed remains the bootstrap and independent structural oracle.
The complete seed-normalized IR corpus is compared with the self-hosted
lowerer before serialization, and the resulting canonical trees cover every
public node kind. A future seed-side persisted cache reader must target this
same envelope or declare a new version; test-only normalization is not a
second public schema.

Application frameworks, UI libraries, bundlers, blog and site generators,
publishing systems, hosting, and development servers may consume emitted ESM
or compiler tools built on this API. They are replaceable application
validation and do not define this protocol, contribute core dependencies, or
receive language maturity credit.

## Compatibility Freeze

The `eliscript-ir` version 1 envelope, closed record schemas, public node-kind
coverage, source-span rules, canonical JSON bytes, negative-zero preservation,
and `ELI-I0001` failure boundary are stable. New node or record layouts require
an explicit versioned contract; readers must continue rejecting unknown or
non-canonical version 1 data.

## Acceptance Criteria

- **CIR-01:** The generated compiler exports `eliscript-ir` version 1 identity
  and public serialize/deserialize operations.
- **CIR-02:** Every valid seed-normalized IR tree across all 57 public node
  kinds round-trips without structural loss.
- **CIR-03:** Serialization is byte-identical under Bun and Node, and a
  serialize-deserialize-serialize cycle is a byte fixed point.
- **CIR-04:** Unknown fields, formats, versions, node kinds, malformed spans,
  unsupported JSON values, sparse arrays, accessors, cycles, and non-canonical
  input fail closed with `ELI-I0001`.
- **CIR-05:** The complete self-hosted compiler remains a reproducible
  Generation 1 to Generation 3 fixed point after adding the API.
- **CIR-06:** Application frameworks and publishing infrastructure remain
  outside implementation, dependencies, evidence, and core maturity credit.
