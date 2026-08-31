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

The boundary is deliberate. Protocol objects, Symbol slots, exact-type tables,
host-category tables, default dispatch, persistent collection nodes, and
owner-token mutation remain an optimized JavaScript runtime substrate. The
Eliscript modules own the public Lisp spelling and maintained algorithm bodies;
they do not duplicate representation-sensitive dispatch machinery.

## Standard-library Modules

Four new Eliscript API modules expose the runtime substrate:

- `stdlib/core/protocol.eli` defines protocol construction, extension,
  operation lookup, host-category inspection, and implementation queries.
- `stdlib/core/collection.eli` exports the nine collection capabilities and
  generic count, empty, construction, lookup, membership, indexed access,
  sequence, reduction, and reduced-value operations.
- `stdlib/core/transducer.eli` exports reducer completion, composition,
  mapping, filtering, removing, taking, dropping, transduction, and `into`.
- `stdlib/core/transient.eli` exports editable capabilities and `transient`,
  `conj!`, `assoc!`, `dissoc!`, and `persistent!`.

These modules are thin language-level adapters by design. They centralize
Lisp naming, argument conventions, source maps, and future migration points
while retaining the measured runtime implementation.

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

The new modules are Eliscript-authored but are not yet eligible for
`--portable` closure extraction because they import JavaScript runtime modules.
Protocol dispatch internals, persistent literals, keyword and symbol values,
metadata, printing, reading, explicit host conversion, text/object migration,
and static transient escape analysis remain later work.

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

## Next Slice

Move protocol definition and dispatch policy into portable Eliscript only when
the replacement preserves direct slots, open external extension, exact host
categories, and measured dispatch cost. Before persistent literal migration,
complete keyword/symbol values, metadata, deterministic printing and reading,
and explicit native-container conversion.
