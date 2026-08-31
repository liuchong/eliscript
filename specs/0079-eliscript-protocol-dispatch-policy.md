# 0079: Eliscript-authored Protocol Dispatch Policy

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0058 Open Protocol Dispatch Core,
  0066 Eliscript-authored Core Protocol Surface and Algorithms

## Summary

This specification moves protocol definition, extension, and dispatch policy
from a JavaScript API wrapper into maintained Eliscript source. The public
module `stdlib/core/protocol.eli` now owns operation validation, unique method
slots, private extension registries, direct and external lookup order, atomic
registration, implementation queries, and immutable protocol metadata.

The JavaScript runtime compatibility surface for existing consumers now
re-exports the generated implementation specified by
[0080](0080-canonical-generated-protocol-runtime.md). The only maintained
hand-written host behavior is the `ProtocolDispatchError` type. The standard
library does not forward `define-protocol`, extension, or dispatch operations
to a second camel-cased runtime implementation.

## Architecture Boundary

Protocol policy is language and standard-library work. Application bundlers,
UI frameworks, publishing tools, and development servers are outside this
contract. They may execute a compiled application as integration evidence,
but they must not become compiler, runtime, or standard-library dependencies
and are not conditions for protocol maturity.

The module isolates unavoidable JavaScript reflection behind private
capabilities for `WeakMap`, `Map`, `Symbol`, own-property descriptors,
prototype identity, property presence, immutable metadata, and object
freezing. These capabilities contain no dispatch priority or registration
policy. All decisions that make a protocol a protocol remain visible in
ordinary Eliscript functions.

This module is intentionally not a `defportable` closure. Unique Symbol slots,
function values, constructors, prototypes, WeakMap state, and host exceptions
cannot cross the current JSON-compatible worker boundary. Treating them as
portable would weaken that boundary rather than advance self-hosting.

## Protocol State

Each protocol owns:

- a frozen public name and frozen operation table
- one unique Symbol slot and one frozen dispatch function per operation
- a private exact-prototype Map
- a private host-category Map
- a frozen default implementation table

The private state is held by a module-local WeakMap keyed by the frozen
protocol object. External code can inspect operation functions and their
frozen `protocol`, `operation`, and `slot` metadata, but cannot acquire or
replace an extension registry.

## Dispatch Order

Every operation applies exactly this order:

1. an inherited or own direct Symbol slot on the dispatch value
2. an extension for the value's exact prototype
3. an extension for the explicit host category
4. an explicit default implementation
5. `ProtocolDispatchError` with a missing reason

A present direct slot that is not callable raises
`ProtocolDispatchError` with `invalid-direct-slot`; lower-priority paths are
not consulted. Direct methods receive the dispatch value as JavaScript
`this`. External methods receive it as their first positional argument.

Exact type extensions do not apply to subclasses. Category extensions remain
the explicit cross-realm adaptation path. Supported categories are `null`,
`undefined`, `boolean`, `number`, `bigint`, `string`, `symbol`, `function`,
and `object`.

## Atomic Extension

An extension object is validated completely before any registry mutation.
It must contain at least one own data property, every property key must be a
known string operation, and every value must be a function. Symbol keys,
accessors, unknown operations, empty objects, and non-functions fail without
installing a partial implementation or invoking user accessors.

Repeated extension merges replace only named operations. Extension never
writes a constructor prototype or a dispatch value. Existing native prototype
keys therefore remain byte-for-byte unchanged by registration.

## Compiler and Host Agreement

The seed and self-hosted compilers emit byte-identical ESM and Source Maps for
the protocol module. Bun and Node execute the same protocol report, including
direct, exact, category, default, invalid-slot, atomic failure, accessor
rejection, exact-subclass exclusion, and native prototype preservation cases.

The execution corpus also performs one million direct dispatches. This is a
bounded semantic stability gate rather than a wall-clock benchmark; hardware
timing remains benchmark evidence and must not redefine correctness.

## Acceptance Criteria

- **EPD-01:** `stdlib/core/protocol.eli` contains protocol definition,
  extension, lookup, and implementation-query algorithms instead of forwarding
  them to JavaScript runtime functions.
- **EPD-02:** Protocol objects, operation tables, dispatch functions, and
  operation metadata are immutable while extension registries remain private.
- **EPD-03:** Dispatch follows direct, exact prototype, host category, default,
  and missing priority with receiver-preserving direct calls.
- **EPD-04:** A non-callable direct slot fails immediately with the established
  structured reason.
- **EPD-05:** Exact extensions exclude subclasses and category extensions
  adapt cross-realm values explicitly.
- **EPD-06:** Extension validation is atomic, ignores no unknown properties,
  invokes no accessors, and accepts no Symbol keys or non-functions.
- **EPD-07:** Extension does not modify host prototypes or dispatch values.
- **EPD-08:** Seed and self-hosted ESM and Source Maps are byte-identical.
- **EPD-09:** Bun and Node produce identical observable reports and complete
  one million direct dispatches.
- **EPD-10:** Compiler, runtime, and standard-library dependencies remain free
  of application frameworks and build adapters; those integrations remain
  optional application-level evidence only.
