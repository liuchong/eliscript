# 0088: Versioned Emacs Worker Persistent Value Codec

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0020 Emacs Worker Protocol and Measurement Probe,
  0021 Portable Functions and Dependency Closure,
  0022 Emacs Worker Integration,
  0067 First-class Keyword and Symbol Values,
  0068 Immutable Metadata Semantics,
  0082 Persistent Literal Runtime ABI and Explicit Host Containers,
  0087 First-class Quoted Persistent Data

## Summary

The Emacs worker can now carry canonical Eliscript values without erasing
their language categories through ordinary JSON. The new encoding is explicit,
versioned, deterministic, resource-bounded, and negotiated independently of
worker protocol version 1.

This is an editor/worker transport adapter. It does not define List, Vector,
Map, Set, identifier, metadata, equality, or hashing semantics; those remain
owned by the language runtime. Application tooling is not part of this codec
and is not evidence for its correctness.

## Protocol Negotiation

The worker ready message advertises two additive capabilities:

```text
value-codec-v1
runtime-resolution
```

A request opts in with:

```json
{"valueEncoding":"eliscript-value-v1"}
```

Every encoded success response and progress message repeats the same
`valueEncoding`. The Emacs client records the expected encoding per request
and treats missing, unexpected, or mismatched response encodings as protocol
errors.

Requests without `valueEncoding` retain the stable protocol-v1 JSON behavior.
The protocol version therefore remains 1; the new value family is not silently
enabled for existing callers.

## Wire Values

JSON-compatible scalar `null`, Boolean, finite Number, and string values remain
scalars. Every non-scalar or otherwise lossy value is a tagged JSON array:

| Tag | Fields | Decoded value |
| --- | --- | --- |
| `undefined` | none | JavaScript `undefined` |
| `number` | special-number name | NaN, positive/negative infinity, or negative zero |
| `keyword` | namespace, name | interned Keyword |
| `symbol` | namespace, name, metadata | Eliscript Symbol |
| `list` | values, metadata | Persistent List |
| `vector` | values, metadata | Persistent Vector |
| `map` | key/value entries, metadata | Persistent HAMT Map |
| `set` | values, metadata | Persistent HAMT Set |
| `array` | values | native JavaScript Array |
| `object` | string-key entries | native JavaScript Object |

Namespaces and absent metadata use JSON `null`. Non-null metadata must decode
to a Persistent Map before it is applied. The codec rejects arbitrary Symbols,
functions, bigint values, class instances, Atoms, transient collections,
accessor properties, and enumerable native Symbol keys.

Native Arrays and Objects have explicit wire tags, so they cannot be confused
with persistent Vector and Map values. Native container identity is not
preserved across transport; their contents are reconstructed as host values.

## Determinism and Validation

Persistent Map entries and Set values are sorted by their complete encoded
form. Native Object keys are sorted lexically. Equal logical values therefore
produce the same JSON-ready tree independently of insertion order.

The decoder rejects:

- unknown tags or invalid tuple lengths
- invalid or empty identifier names
- metadata that is not a Persistent Map
- duplicate value-equal Map keys and Set members
- duplicate or empty native Object keys
- cyclic host graphs and unsupported object categories
- values exceeding depth, node-count, or collection-length limits

The default limits are depth 64, 100,000 value nodes, and 100,000 members in
one collection. Argument vectors share one budget instead of resetting the
counter for every argument. Failures carry stable `value-encoding-*` or
`value-decoding-*` codes and a logical value path.

## Emacs Representation

`tools/worker/eliscript-value-codec.el` exposes explicit Emacs records for
Keyword, Symbol, List, Vector, Map, Set, and native Object values. Persistent
sequence members, Map entries, Set members, and native Object entries are held
in vectors so an empty collection remains distinguishable from nil.

`eliscript-worker-value-undefined` is an uninterned sentinel and cannot collide
with an ordinary Emacs symbol. JSON false remains `:false`, preserving the
existing protocol convention. Plain Emacs vectors encode as native JavaScript
Arrays; callers use the persistent constructors when they require language
Vector semantics.

The asynchronous and synchronous worker APIs accept `:value-codec t`.
Portable-call variants forward the same option. Callbacks receive decoded
records rather than wire tuples.

## Portable Language Integration

The seed and self-hosted portable analyzers now permit persistent Vector and
Map constructors, source Keyword values, and persistent quoted data. Their
contents still undergo ordinary lexical and dependency validation. Host
mutation, raw JavaScript, arbitrary method calls, constructors, asynchronous
suspension, and exception control flow remain outside the portable subset.

Generated persistent constructors import the explicit
`eliscript/runtime/literals.mjs` package ABI. The Bun worker installs a
path-confined resolver for `eliscript/runtime/` imports before loading request
modules, so generated modules in arbitrary temporary directories resolve the
runtime owned by that worker. The resolver rejects paths escaping the package
runtime directory.

Portable functions can therefore construct and return persistent values when
their caller opts into the codec. Legacy JSON callers remain responsible for
using JSON-compatible values.

## Acceptance Criteria

- **WVC-01:** Worker protocol version remains 1 and legacy requests preserve
  their existing JSON behavior.
- **WVC-02:** Ready messages advertise value codec and runtime resolution
  capabilities.
- **WVC-03:** Requests, success responses, and progress messages negotiate the
  exact `eliscript-value-v1` identifier.
- **WVC-04:** List, Vector, Map, Set, Keyword, Symbol, and metadata categories
  survive JavaScript encode/decode.
- **WVC-05:** `undefined`, NaN, infinities, and negative zero survive without
  coercion.
- **WVC-06:** Native Arrays and Objects remain distinct from persistent values.
- **WVC-07:** Map, Set, and native Object encoding is deterministic.
- **WVC-08:** Cycles, unsupported values, duplicate logical members, malformed
  nodes, and resource-limit violations fail with structured codes and paths.
- **WVC-09:** Emacs constructors and the undefined sentinel round trip all
  supported categories.
- **WVC-10:** Synchronous, asynchronous, portable, progress, and result paths
  use the request's selected encoding.
- **WVC-11:** Seed and self-hosted portable analyzers accept persistent values
  while retaining recursive lexical validation.
- **WVC-12:** Seed and self-hosted generated ESM and Source Maps remain
  byte-identical and the compiler fixed point remains reproducible.
- **WVC-13:** A portable module generated outside the package directory loads
  through the confined worker runtime resolver.
- **WVC-14:** Bun direct tests, Bun worker protocol tests, and real Emacs/Bun
  process tests execute the full boundary.
- **WVC-15:** Public-surface, compatibility, specification, and conformance
  registries track the codec and its executable evidence.

## Next Boundary

Specification
[0089-chunked-emacs-worker-values.md](0089-chunked-emacs-worker-values.md)
adds bounded incremental framing, backpressure, and upload-stage cancellation.
Specification 0091 adds data-only protocol-definition transport, and 0093
closes static transient ownership analysis. The codec does not transport
transient collections, Atoms, functions, executable protocol identity, or
arbitrary host identities. Promotion of the provisional persistent literal and
worker value surfaces requires the complete M8 compatibility audit.
