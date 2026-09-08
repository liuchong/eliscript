# 0086: Optimized Runtime Persistent List and Canonical Data Text

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0054 Eliscript-authored Persistent List,
  0057 Portable Value Semantics Core,
  0059 Collection Capability Protocols and Reduction Foundation,
  0068 Immutable Metadata Semantics,
  0069 Canonical Runtime Data Text,
  0071 Canonical Portable Data Text

## Summary

The optimized JavaScript runtime now provides a canonical immutable Persistent
List. It is a singly linked, structurally shared value with constant-time front
construction, iterative traversal, collection protocols, deterministic value
semantics, immutable metadata, and canonical parenthesized data text.

This is a language runtime and standard data-model contract. Application
frameworks, UI libraries, bundlers, development servers, and publishing tools
are replaceable validation clients. They are not dependencies, design inputs,
or goals of the List implementation.

## Public Surface

`runtime/core/list.mjs` exports:

- `PersistentList`
- `EMPTY_LIST`
- `persistentList(...values)`
- `isPersistentList(value)`

`PersistentList.from(iterable)` preserves the iterable's logical order. Direct
construction is guarded so callers cannot create malformed nodes. Every public
List value and every internal node is frozen.

## Representation and Operations

A non-empty List stores a first value, a reference to the complete remaining
List, a cached count, and immutable metadata. The empty singleton has count
zero and refers to no node.

- `conj(value)` and `cons(value)` allocate one new front node and share the
  complete previous List as their suffix.
- `first(fallback = null)` returns the front value or the fallback for an empty
  List.
- `rest()` returns the shared suffix; the empty List returns itself.
- `peek(fallback = null)` has the same observable value behavior as `first`.
- `pop()` returns the shared suffix and throws `RangeError` on an empty List.
- `nth(index, fallback)` walks iteratively and uses the fallback only when it is
  explicitly supplied; otherwise an invalid index throws `RangeError`.
- `reduce(reducer, initial)` and iteration are iterative and do not consume the
  JavaScript call stack per element.

The maximum count is `0x7fffffff`. Construction beyond that bound fails before
producing an invalid value.

## Protocol Semantics

Persistent List directly implements `ICounted`, `IEmptyable`, `IConj`,
`ISeqable`, and `IReduce`. `seq` returns a replayable `SequenceView`, preserving
the protocol rule that an arbitrary iterable is not automatically its own
sequence view.

List deliberately does not implement `IIndexed`. Its convenience `nth` method
is linear-time and does not advertise indexed collection capability through
generic protocol dispatch.

## Equality and Hashing

Two Persistent Lists are value-equal when they have equal counts and
pairwise-equal members in order. A List is not value-equal to a Vector or a
native Array with the same members.

List hashing is ordered, deterministic for deterministic members, ignores
metadata, and uses collection tag `0x2f4a6d19`. This is the same tag and folding
contract used by the Eliscript-authored portable List, so equivalent optimized
and portable Lists have equal unsigned 32-bit hashes without sharing a
representation.

Persistent Lists are valid value-semantic persistent Map keys. Equal rebuilt
Lists retrieve the same entry.

## Metadata and Sharing

`withMeta` returns the original List when the metadata reference is unchanged.
Otherwise it replaces only the root wrapper and shares the complete previous
suffix. Metadata never participates in equality or hashing. The empty List may
have a distinct metadata-bearing empty value without changing the canonical
`EMPTY_LIST` singleton.

Internal allocation and sharing evidence is isolated in
`runtime/testing/list.mjs`; representation inspection is not public runtime
API.

## Canonical Data Text

The optimized runtime data reader and printer extend the common data grammar
with Lists:

```text
list = "(" value* ")"
```

Printing preserves logical order and nested canonical forms. Reading constructs
a Persistent List, not a native Array. Empty and nested Lists round-trip through
`printValue` and `readValue` with value equality and equal hashes.

The reader applies the existing depth, value-count, token-length, and input
length limits. It reports located `DataTextError` values for unterminated Lists
and malformed nested data. Construction uses a bounded temporary native buffer
whose size cannot exceed the reader value limit, then creates the immutable
chain iteratively.

## Complexity Contract

| Operation | Complexity | Allocation |
| --- | --- | --- |
| `count`, `first`, `peek`, `rest` | O(1) | none |
| `conj`, `cons` | O(1) | one List node |
| `pop` | O(1) | none |
| `nth` | O(n) | none |
| iteration, `reduce`, hash | O(n) | bounded traversal state |
| `PersistentList.from` | O(n) | n nodes plus bounded input buffer |
| `withMeta` | O(1) | at most one root wrapper |

A transient List API is intentionally absent. Front construction already has
constant-time allocation and complete suffix sharing, so an owner-token builder
would add lifecycle complexity without improving the core operation.

## Compatibility Boundary

The optimized Persistent List representation, public operations, protocol
capabilities, value/hash semantics, metadata behavior, iterative traversal,
and constant-time front sharing are stable. Existing portable List APIs and
optimized Vector, Map, and Set representations keep their contracts.
Specification 0087 uses this representation for source quote; worker transport
encoding is provided by 0088.

The persistent literal ABI now uses this runtime value for quoted List data
through 0087, and 0088 transports the value without changing its category.

## Acceptance Criteria

- **OPL-01:** Public constructors produce frozen, guarded Persistent Lists in
  logical source order.
- **OPL-02:** Empty, front, rest, peek, pop, count, and nth behavior matches this
  specification, including fallback and error cases.
- **OPL-03:** List implements counted, emptyable, conj, seq, and reduce protocols
  without claiming indexed capability.
- **OPL-04:** `conj` and `cons` allocate exactly one front node and share the
  complete old List as their suffix.
- **OPL-05:** One million nodes can be constructed, iterated, indexed, and
  reduced without recursive stack growth.
- **OPL-06:** Equality is order-sensitive, metadata-independent, and restricted
  to the List value category.
- **OPL-07:** Equal Lists have equal deterministic hashes and work as persistent
  Map keys; Lists remain unequal to equal-member Vectors.
- **OPL-08:** Optimized and Eliscript-authored portable Lists use the same hash
  contract for equivalent deterministic values.
- **OPL-09:** Metadata replacement allocates at most one root wrapper and shares
  the prior suffix.
- **OPL-10:** Canonical data text reads and prints empty, nested, and mixed Lists
  with parenthesized syntax.
- **OPL-11:** Malformed List text and resource-limit violations produce located
  structured errors.
- **OPL-12:** Bun and Node produce identical List value, hash, metadata, Map-key,
  and data-text reports.
- **OPL-13:** Public-surface, compatibility, and conformance registries own the
  optimized List modules and executable evidence.
- **OPL-14:** The default repository test target executes the complete List test
  suite and existing collection/data-text regressions.
- **OPL-15:** No application framework, UI library, bundler, publishing adapter,
  or development server is imported by core code or required for acceptance.
