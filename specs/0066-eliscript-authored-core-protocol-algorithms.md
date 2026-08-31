# 0066: Eliscript-authored Core Protocol Surface and Algorithms

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0058 Open Protocol Dispatch Core,
  0059 Collection Capability Protocols and Reduction Foundation,
  0061 Composable Transducers and Protocol-driven Into,
  0062 Owner-token Transient Collections,
  0063 Protocol-driven Core Sequence and Data Algorithms

## Summary

This specification moves the maintained core collection API and algorithm
bodies into ordinary Eliscript modules. Applications can import protocols,
collection operations, transducers, transient builders, sequence algorithms,
and keyed-data algorithms from `stdlib/core/` without importing camel-cased
JavaScript APIs directly.

At this specification's original acceptance boundary, protocol objects,
Symbol slots, exact-type tables, host-category tables, and default dispatch
remained an optimized JavaScript runtime substrate. Specification 0079 later
moves that policy into Eliscript while retaining private host-reflection
capabilities. Persistent collection nodes and owner-token mutation remain the
representation-sensitive optimized substrate.

## Standard-library Modules

Four new Eliscript API modules expose the runtime substrate:

- `stdlib/core/protocol.eli` exposes protocol construction, extension,
  operation lookup, host-category inspection, and implementation queries; its
  dispatch implementation is completed by specification 0079.
- `stdlib/core/collection.eli` exports the nine collection capabilities and
  generic count, empty, construction, lookup, membership, indexed access,
  sequence, reduction, and reduced-value operations.
- `stdlib/core/transducer.eli` exports reducer completion, composition,
  mapping, filtering, removing, taking, dropping, transduction, and `into`.
- `stdlib/core/transient.eli` exports editable capabilities and `transient`,
  `conj!`, `assoc!`, `dissoc!`, and `persistent!`.

The collection, transducer, and transient modules remain thin language-level
adapters by design. They centralize Lisp naming, argument conventions, source
maps, and future migration points while retaining measured representation
implementations. The protocol module now additionally owns its policy.

## Eliscript-authored Algorithms

`stdlib/core/seq.eli` now contains the maintained implementations of:

```text
concat drop every? filter find map remove reverse some take
```

`stdlib/core/data.eli` now contains the maintained implementations of:

```text
count-by frequencies group-by index-by
```

The sequence algorithms reduce arbitrary protocol sources, preserve Eliscript
truth semantics, terminate through reduced values, and construct persistent
Vectors. The data algorithms construct value-semantic persistent Maps, retain
source order within grouped persistent Vectors, and use owner-token transient
Map builders for final construction and indexing.

The source modules import lower-level runtime capabilities rather than the
corresponding `runtime/core/sequence.mjs` or `runtime/core/data.mjs` algorithm
modules. Their Source Maps therefore contain the actual maintained Eliscript
function bodies.

## Binding-name Correctness

ECMAScript modules are strict mode. The source names `arguments` and `eval`
are valid Eliscript lexical names but invalid strict JavaScript bindings, so
both declarations and references map to `arguments$` and `eval$`.

This rule applies only to unqualified lexical references. Qualified host paths
such as `globalThis/arguments` retain their member names. The seed and
self-hosted symbol modules implement the same mapping, preventing a rest
parameter named `arguments` from accidentally reading JavaScript's implicit
function `arguments` object.

## Bootstrap and Execution Contract

The seed and self-hosted compilers must emit byte-identical JavaScript and
Source Maps for all six `stdlib/core/` modules in this slice. Generated modules
must execute under both Bun and Node.js.

The executable corpus covers protocol category and default extensions,
operation slots, generic collection access, Vector and Map transients,
post-`persistent!` invalidation, composed transducers, external `IReduce`
sources, exact early termination, and a 50,000-key transient Map build.

## Compatibility and Limits

This M8 surface is provisional. Existing public JavaScript runtime modules
remain supported, and the earlier portable Array/Object-oriented standard
library remains unchanged.

The new modules are Eliscript-authored but are not eligible for `--portable`
closure extraction because they use JavaScript runtime values and host
reflection. Specification 0079 completes protocol dispatch policy without
misclassifying Symbol slots, constructors, WeakMap state, or exceptions as
JSON-portable values. Specification 0081 completes the protocol-driven
text/object algorithm migration. Persistent collection literals, compiler
direct-call specialization, transport-safe protocol representation, and
static transient escape analysis remain later work.

## Acceptance Criteria

- **ECA-01:** Protocol, collection, transducer, and transient APIs compile from
  `.eli` sources and expose their complete registered Lisp-named surfaces.
- **ECA-02:** Sequence and keyed-data algorithm bodies are maintained in
  `.eli` and do not import the corresponding JavaScript algorithm modules.
- **ECA-03:** Generated Source Maps retain the complete Eliscript source of all
  six modules.
- **ECA-04:** External protocol extensions participate in generic reduction
  and stop at the exact reduced value.
- **ECA-05:** Vector and Map transient builders invalidate deterministically
  after `persistent!`.
- **ECA-06:** Composed mapping and filtering produce persistent results through
  the language-level transducer API.
- **ECA-07:** A 50,000-key Eliscript `index-by` build completes one transient
  Map and records no invalid transient calls.
- **ECA-08:** Unqualified `arguments` and `eval` references use the same strict
  binding mapping as their declarations; qualified host paths are unchanged.
- **ECA-09:** Seed and self-hosted compilers emit byte-identical JavaScript and
  Source Maps for every changed core module.
- **ECA-10:** Bun and Node.js execute the generated protocol and algorithm
  corpus with identical observable results.
- **ECA-11:** Existing compiler, bootstrap, persistent-data, protocol,
  transducer, transient, standard-library, contract, CLI, Vite, and strict
  byte-compilation suites remain green.

## Follow-up

Specification
[0079-eliscript-protocol-dispatch-policy.md](0079-eliscript-protocol-dispatch-policy.md)
moves protocol definition and dispatch policy into maintained Eliscript while
preserving direct slots, open external extension, exact host categories, and
measured dispatch work. It deliberately remains outside `defportable` closure
selection because Symbol slots, constructors, WeakMap registries, and host
exceptions do not cross the JSON-compatible worker boundary.
