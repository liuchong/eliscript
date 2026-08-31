# 0091: Transport-safe Protocol Definitions

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0058 Open Protocol Dispatch Core,
  0079 Eliscript-authored Protocol Dispatch Policy,
  0088 Versioned Emacs Worker Persistent Value Codec

## Summary

Eliscript protocols contain local executable identity: dispatch functions,
unique Symbol slots, constructor registrations, host-category registrations,
defaults, and private WeakMap state. None of those values can safely cross a
JSON, worker, process, or realm boundary.

This specification introduces a separate declarative protocol-definition
format. `protocol-definition` extracts only the protocol name and ordered
operation names into versioned immutable data. `define-protocol-from-definition`
validates that data and creates a fresh local protocol with fresh operation
slots and an empty extension registry.

The result closes the protocol-definition transport item in 0041 P2 without
serializing code, sharing mutable registries, or introducing a global protocol
namespace.

## Public Surface

`stdlib/core/protocol.eli` exports:

- `protocol-definition`
- `define-protocol-from-definition`

The `runtime/core/protocol.mjs` facade exports the equivalent JavaScript names:

- `protocolDefinition`
- `defineProtocolFromDefinition`

The existing protocol construction, extension, lookup, and implementation
query APIs remain unchanged.

## Definition Format

The v1 definition is an ordinary data object:

```json
{
  "format": "eliscript-protocol-definition",
  "version": 1,
  "name": "Readable",
  "operations": ["read", "close"]
}
```

Fields have these meanings:

- `format` identifies the schema independently of the outer transport.
- `version` freezes the interpretation of every field.
- `name` is the non-empty diagnostic and definition name.
- `operations` is the non-empty ordered list of unique non-empty operation
  names.

`protocol-definition` accepts only a genuine local Eliscript protocol. Its
result object and operation Array are frozen. The object contains no function,
Symbol, constructor, prototype, implementation, metadata hook, or registry
reference. It therefore passes through JSON and the versioned worker value
codec as ordinary data.

## Import Semantics

`define-protocol-from-definition` creates a new local protocol as though
`define-protocol` had received the validated name and operations.

Import preserves:

- schema version
- protocol name
- operation order
- duplicate and name validation

Import deliberately does not preserve:

- JavaScript object identity
- operation dispatch-function identity
- Symbol slot identity
- direct implementations
- exact-type, host-category, or default registrations
- private extension state

Two imports of the same bytes are two independent protocols. A direct method
or external extension installed for one cannot satisfy the other. Callers that
need shared local identity must explicitly retain and reuse one imported
protocol object rather than repeatedly importing its definition.

## Validation and Resource Bounds

The importer accepts only an ordinary object whose prototype is
`Object.prototype` or `null`. It must contain exactly four enumerable own data
properties: `format`, `version`, `name`, and `operations`.

The operation list must be a dense Array containing only enumerable own data
elements. Sparse slots, accessors, Symbol keys, named extra properties, empty
names, duplicate names, and unsupported schema fields fail before a protocol
is created. Validation inspects property descriptors and never invokes an
input getter.

A definition contains at most 1,024 operations. The same dense-array and count
rules now apply to direct `define-protocol` calls, so the imported and local
construction paths cannot disagree or perform unbounded work over hostile
array shapes.

Unknown formats and versions fail closed. Version conversion is not guessed.
A future version requires an explicit importer or a specified upgrade
operation.

## Worker Boundary

The existing worker value codec already transports ordinary Objects and
Arrays after rejecting accessors, Symbol keys, cycles, unsupported prototypes,
and resource-limit violations. A protocol definition therefore needs no new
wire tag and no privileged worker behavior.

Raw protocol objects remain intentionally non-transportable because their
operation table contains functions. Code and implementations continue to
cross the worker boundary only through declared modules and operations, never
inside a value payload.

This separation also applies to future REPL and Emacs acceleration APIs:
definitions may be exchanged as data, while execution capabilities remain
declared and local to the receiving runtime.

## Determinism and Compatibility

Operation order is definition order and remains stable through extraction,
JSON text, the worker value codec, and re-import. Re-extracting an imported
protocol yields the same four-field definition.

The format is provisional during M8. Its format string, version, field set,
operation order, isolation semantics, 1,024-operation limit, and rejection
rules are part of this accepted contract. Runtime Symbol descriptions remain
diagnostic details rather than transport identities.

No application framework, bundler, browser UI, or publishing adapter is part
of this implementation or its acceptance evidence.

## Acceptance Criteria

- **TPD-01:** A genuine protocol extracts to the exact v1 four-field object,
  and both the object and operation Array are frozen.
- **TPD-02:** JSON and worker value-codec round trips preserve the complete
  definition and operation order.
- **TPD-03:** Re-import creates a genuine protocol with the same extracted
  definition.
- **TPD-04:** Imported protocol, dispatch functions, Symbol slots, and
  extension registries are independent from the source protocol.
- **TPD-05:** Raw protocol objects remain rejected by value transport rather
  than silently losing executable state.
- **TPD-06:** Accessor-bearing definitions and operation Arrays fail without
  invoking getters.
- **TPD-07:** Sparse Arrays, extra string or Symbol properties, non-plain
  objects, unsupported formats or versions, duplicate names, and more than
  1,024 operations fail before construction.
- **TPD-08:** Direct protocol construction and imported construction share the
  same operation normalization and resource bound.
- **TPD-09:** Seed and self-hosted compilers emit byte-identical implementation
  modules and Source Maps; Bun and Node produce the same definition/isolation
  report.
- **TPD-10:** Specifications, compatibility baseline, conformance evidence,
  public surface, documentation, default tests, and strict byte compilation
  agree without an application-framework dependency.
