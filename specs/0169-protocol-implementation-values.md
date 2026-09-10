# 0169: Protocol Implementation Values

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-11
- Depends on: 0036 Compile-time Macros, 0058 Open Protocol Dispatch,
  0079 Eliscript Protocol Dispatch Policy, 0159 Declarative Protocol
  Definitions, 0168 Immutable Record Types

## Summary

This specification adds low-level named types and anonymous protocol values.
`deftype` defines an exact positional type with immutable fields and direct
protocol slots. `reify` constructs one frozen identity value whose method
bodies capture the surrounding lexical environment.

These forms fill the layer below value-semantic Records. They allow runtime
and library abstractions to be implemented in Eliscript without registering a
host-wide extension or forcing every implementation into persistent Map
semantics.

## Named Types

`deftype` is valid at module top level:

```elisp
(deftype Box [value]
  IDescribe
  (describe (box prefix) (str prefix ":" (get box :value))))
```

It creates three immutable bindings:

- `Box`, the exact type definition
- `->Box`, the positional constructor
- `Box?`, the exact instance predicate

Fields are distinct unqualified symbols. Instances expose each field as a
read-only enumerable property and reject direct construction, missing values,
and extra values. Both the type definition and each instance are frozen.

Defined type values use host identity equality and hashing. Equal-looking
instances are not equal unless they are the same value. Persistent Map
semantics, structural equality, metadata, and map construction remain the
responsibility of `defrecord`.

## Anonymous Implementations

`reify` is valid in expression position and requires at least one protocol:

```elisp
(let ((prefix "value"))
  (reify
    IDescribe
    (describe (_self suffix) (str prefix ":" suffix))))
```

The result is a frozen null-prototype identity object. Method lambdas are
ordinary lexical closures. Every method receives the constructed value as its
first receiver argument, followed by the protocol invocation arguments.

A single form may implement multiple distinct protocols. Each protocol must
appear once and every operation declared by that protocol must have exactly one
function implementation. This completeness rule makes protocol capability
inspection truthful immediately after construction.

## Direct Dispatch

Named and anonymous values install methods under the public Symbol slot carried
by each protocol operation. Existing dispatch therefore selects these methods
before exact-type, host-category, or default extension tables. Construction
does not mutate the protocol, its extension tables, a host prototype, or any
global registry.

The type runtime validates the protocol's frozen public operation identities
rather than depending on one module instance's private state. A protocol
created by a clean Seed or self-hosted build is consequently accepted by a
type runtime loaded from another output root while retaining exact Symbol-slot
identity.

## Runtime API

`stdlib/core/type.eli` exposes:

- `define-type`
- `reify-protocols`
- `type-definition?`
- `type-value?`
- `type-of`
- `defined-type-name`
- `defined-type-fields`

The first two functions are the expansion targets. The remaining functions
provide exact introspection without host constructor inference.

## Diagnostics

Expansion rejects malformed names, field vectors, duplicate fields, missing or
duplicate protocols, malformed method clauses, and methods without an explicit
receiver. `deftype` in expression position is rejected. Runtime validation
rejects malformed protocol identities, sparse or extended plan arrays,
incomplete methods, unknown operations, non-function methods, field/member
conflicts, and invalid constructor arity.

## Boundaries

Defined and reified values have no reader literal, canonical data-text tag,
JSON encoding, worker encoding, portable closure encoding, or implicit
metadata. They may cross those boundaries only after a separately versioned
representation is specified. This feature has no UI, bundler, publishing, or
application dependency.

## Acceptance Criteria

- **PIV-01:** `deftype` generates exact type, positional constructor, and
  predicate bindings from validated names and fields.
- **PIV-02:** Type fields are immutable and directly readable while instances
  preserve host identity semantics.
- **PIV-03:** Named types install complete direct implementations for one or
  more protocols without changing extension tables.
- **PIV-04:** `reify` creates a frozen null-prototype value implementing one or
  more complete protocols.
- **PIV-05:** Reified method bodies capture lexical bindings and receive the
  constructed value as their explicit first argument.
- **PIV-06:** Direct methods retain priority over exact-type, category, and
  default extensions.
- **PIV-07:** Public protocol operation identities work across independent
  compiler output roots without access to private protocol state.
- **PIV-08:** Seed and self-hosted expansion, ESM, and Source Maps agree, and
  generated modules execute identically under local Bun and Node.
- **PIV-09:** Malformed declarations, protocol plans, implementations, and
  constructor calls fail deterministically.
