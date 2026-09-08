# 0066: Eliscript-authored Core Protocol Surface and Algorithms

- Status: Stable
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
  mapping, indexed mapping/keeping, filtering, removing, bounded and
  predicate-controlled take/drop, nth sampling, interposition, adjacent
  deduplication, persistent-Vector partitioning, cat/mapcat, transduction, and
  `into`.
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
sources, exact early termination, persistent partition flushing, and a
50,000-key transient Map build.

## Compatibility and Limits

This language-level core surface is stable in Compatibility Baseline 2.
Existing public JavaScript runtime modules remain supported, and the earlier
portable Array/Object-oriented standard library remains unchanged. Public
module names, exports, argument conventions, and observable failure semantics
cannot change incompatibly without a superseding specification and migration
fixture.

The new modules are Eliscript-authored but are not eligible for `--portable`
closure extraction because they use JavaScript runtime values and host
reflection. Specification 0079 completes protocol dispatch policy without
misclassifying Symbol slots, constructors, WeakMap state, or exceptions as
JSON-portable values. Specification 0081 completes the protocol-driven
text/object algorithm migration. Persistent collection literals and the first
worker value codec now land through 0088. Compiler direct-call specialization
remains later work. Specification 0091 adds the versioned data-only protocol
definition and isolated local import path, while 0093 closes static transient
ownership analysis; executable protocol state remains deliberately
non-transportable.

## Stabilization Evidence

The default core suite verifies every lower-level protocol, collection,
transducer, and transient contract directly. It also compiles these six
Eliscript modules as one version 2 multi-entry project through the public
`eliscript-build` command, executes the generated modules under Bun and Node,
and checks representative behavior across all six module boundaries.

The generated library API index owns the exact public export inventory. The
project-level test complements the existing source-import fixture, direct
runtime suites, seed/self-hosted byte-parity checks, Source Map checks,
million-value traversal, HAMT collision, transient invalidation, and
allocation-bound evidence. These modules are runtime-core modules and are
therefore deliberately ineligible for portable closure extraction; that
ineligibility is an explicit host-capability boundary, not missing evidence.

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
  transducer, transient, standard-library, contract, CLI, default-test, and
  strict byte-compilation suites remain green. No application framework is a
  core dependency or acceptance prerequisite.
- **ECA-12:** The six language-level core modules build together through the
  public multi-entry project command and execute with identical representative
  results under Bun and Node.

## Follow-up

Specification
[0079-eliscript-protocol-dispatch-policy.md](0079-eliscript-protocol-dispatch-policy.md)
moves protocol definition and dispatch policy into maintained Eliscript while
preserving direct slots, open external extension, exact host categories, and
measured dispatch work. It deliberately remains outside `defportable` closure
selection because Symbol slots, constructors, WeakMap registries, and host
exceptions do not cross the JSON-compatible worker boundary.
Specification
[0091-transport-safe-protocol-definitions.md](0091-transport-safe-protocol-definitions.md)
later adds a strict data-only definition format without changing that runtime
identity boundary.
