# 0058: Open Protocol Dispatch Core

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0048 Value Equality and Deterministic Hashing,
  0057 Portable Value Semantics Core

## Summary

This specification implements the first reusable open-polymorphism mechanism
for Eliscript's JavaScript runtime. A protocol owns immutable operation
identities and private extension tables. Operations dispatch on their first
argument through a direct Symbol slot, an externally registered exact type, a
stable host category, or an explicit default implementation.

The value runtime migrates its existing persistent collection hooks onto two
real protocol objects, `IEquiv` and `IHash`. Existing Vector, Map, and Set
classes keep direct Symbol methods, while an external immutable type can now
join value equality, hashing, and persistent Map key semantics without
changing its prototype.

This completes the dispatch-mechanism step of 0041 P2. It does not yet define
all collection protocols, protocol declaration syntax, sequence views,
transducers, or compiler direct-call specialization.

## Public Runtime Surface

`runtime/core/protocol.mjs` exports:

- `ProtocolDispatchError`
- `defineProtocol(name, operations)`
- `protocolMethod(protocol, operation)`
- `protocolSlot(protocol, operation)`
- `extendProtocolType(protocol, constructor, implementations)`
- `extendProtocolCategory(protocol, category, implementations)`
- `extendProtocolDefault(protocol, implementations)`
- `implementsProtocolOperation(protocol, operation, value)`
- `implementsProtocol(protocol, value)`
- `protocolHostCategory(value)`

`runtime/core/value.mjs` additionally exports:

- `IEquiv`
- `IHash`
- `extendValueType(constructor, { equal, hash })`

The existing `equalValues` and `hashValue` exports retain their behavior.

## Protocol Definition

`defineProtocol` requires a non-empty protocol name and a non-empty array of
unique non-empty operation names. It returns a frozen object:

```text
Protocol {
  name,
  operations: { operation-name -> dispatch-function }
}
```

Each operation receives one unique Symbol slot. The dispatch function is
frozen and exposes read-only `protocol`, `operation`, and `slot` metadata.
`protocolMethod` and `protocolSlot` provide checked lookup without exposing
the mutable extension tables.

Protocol metadata is immutable. Extension state belongs to the protocol and
lives in a private WeakMap. Freezing a protocol therefore prevents accidental
surface mutation while preserving intentional open extension through the
declared API.

## Dispatch Order

An operation dispatches on its first argument in this exact order:

1. **Direct slot:** a callable method at the operation's Symbol on the value or
   its prototype chain
2. **Exact type:** an external implementation registered for the value's exact
   JavaScript prototype
3. **Host category:** an implementation registered for `null` or one exact
   JavaScript `typeof` result
4. **Default:** an explicit protocol-owned fallback implementation
5. **Missing:** a `ProtocolDispatchError`

A direct method is called with the receiver as JavaScript `this` and receives
only arguments after the dispatch value. External and default methods receive
the dispatch value as their first ordinary argument.

A present but non-callable direct slot is an error. Dispatch never silently
falls through from a malformed direct claim to an external implementation.

## Exact Types and Host Categories

`extendProtocolType` stores implementations by `constructor.prototype` and
matches with `Object.getPrototypeOf(value)`. The match is exact: registering a
base class does not implicitly extend subclasses. A subclass can install a
direct slot, receive its own exact registration, or use a host category.

This avoids accidental inheritance of semantic contracts and avoids
`instanceof` failures across realms. Cross-realm adaptation uses an explicit
stable host category when constructor identity is not shared.

Supported categories are:

- `null`
- `undefined`
- `boolean`
- `number`
- `bigint`
- `string`
- `symbol`
- `function`
- `object`

There is deliberately no guessed `array`, `iterable`, DOM, or promise
category. Such behaviors require an exact type, direct method, or future named
adapter protocol.

## Extension Discipline

An extension may implement one or more operations. Repeated extension of the
same exact type, category, or default merges operation implementations and
replaces only explicitly named methods.

Before changing a table, the runtime validates the complete extension:

- the protocol is genuine
- every operation is declared by that protocol
- every implementation is an own data property containing a function
- at least one operation is present
- an exact type is a constructor with an object prototype
- a category is one of the fixed categories

Consequently, an invalid multi-operation registration installs nothing.
Extension never writes to a constructor prototype, a built-in prototype, or a
receiver. Protocol registries have no removal operation in this contract;
tests and isolated applications create fresh protocol objects when lifecycle
isolation is needed.

## Missing Diagnostics

Missing and malformed direct implementations throw `ProtocolDispatchError`, a
`TypeError` subclass with these stable fields:

- `code`: `ELI-RUNTIME-PROTOCOL`
- `protocol`
- `operation`
- `observedType`
- `reason`: `missing` or `invalid-direct-slot`

The human message includes the protocol, operation, and observed host type.
Object and function observations include a best-effort exact constructor name,
such as `object:Date`, without using it as the dispatch key.

## Value Protocol Migration

`IEquiv/equal` and `IHash/hash` now own the Symbol slots previously dedicated
only to the value runtime. Persistent Vector, Map, and Set methods continue to
implement those direct slots, so their fast path requires no external registry
lookup.

`equalValues` retains coercion-free scalar handling and NaN semantics. For
object/function values it requires `IEquiv` support on both sides, then invokes
the left direct or external implementation. `hashValue` retains all scalar,
global Symbol, identity-hash, and immutable-root cache behavior, invoking
`IHash` only when implemented.

`extendValueType` registers both protocols together. Its `equal` function
receives `(left, right, equalValues)`. Its `hash` function receives
`(value, hashValue)`. A hash-key-eligible extension must satisfy:

- equal values always produce equal hashes
- equality is reflexive, symmetric, and transitive
- values are immutable after their hash is observed
- equal/hash callbacks terminate over their supported value graph

The runtime cannot prove these user contracts dynamically. Violating them is
an invalid extension and can break Map/Set key behavior.

## Complexity

Direct dispatch performs one Symbol property lookup and one call. External
dispatch performs a bounded sequence of Map lookups: exact prototype,
category, then default. Registration validates O(p) supplied operations, where
`p` is bounded by the protocol's declared operation count.

No dispatch scans registered types or categories. No dispatch mutates the
receiver or allocates a new protocol object. JavaScript rest-argument and call
mechanics remain observable host costs; later compiler specialization may
remove generic call overhead only when equivalence is proven.

The million-dispatch fixture is a semantic and stack-safety gate, not a fixed
timing threshold. End-to-end protocol performance remains subject to the real
application and Emacs acceleration acceptance work in 0040 and 0041.

## Compatibility and Limits

The protocol module, dispatch order, public exports, diagnostic fields, and
`IEquiv`/`IHash` extension API are provisional during M8. Existing frozen
equality and hash outputs do not change.

Open items include:

- `IEmptyable`, `IConj`, `IAssociative`, and transient protocols; the first
  collection capability set continues in
  [0059-collection-capability-protocols.md](0059-collection-capability-protocols.md)
- Eliscript declaration syntax and compile-time protocol checking
- direct-call specialization from proven receiver types
- additional sequence views and named host adapters beyond the Array, Map,
  and Set support in 0059
- metadata and user-defined record ergonomics
- lifecycle policy for long-lived plugin extension and hot reload

## Acceptance Criteria

- **EPD-01:** Protocol and operation metadata are immutable, operation Symbol
  identities are stable, and private registries are inaccessible.
- **EPD-02:** Direct, exact-type, category, default, and missing paths execute
  in the specified priority order.
- **EPD-03:** Exact registrations do not leak to subclasses or cross-realm
  constructors; explicit category adaptation works across realms.
- **EPD-04:** Invalid multi-operation extensions install nothing, and no
  extension changes built-in or user prototypes.
- **EPD-05:** Missing and malformed direct implementations expose the exact
  structured diagnostic fields and observed type.
- **EPD-06:** Existing persistent Vector, Map, and Set equality, hash caching,
  collision, and million-scale suites pass unchanged through IEquiv/IHash.
- **EPD-07:** An externally extended immutable value type compares and hashes
  by value and works as a persistent Map key.
- **EPD-08:** Bun and Node.js produce identical reports for every dispatch
  path and missing diagnostic.
- **EPD-09:** One million direct protocol calls complete with the exact
  expected result and no stack growth.
- **EPD-10:** Public-surface, compatibility, conformance, documentation, and
  default-test registries contain the protocol runtime and all evidence.
