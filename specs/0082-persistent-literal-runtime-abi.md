# 0082: Persistent Literal Runtime ABI and Explicit Host Containers

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0007 Explicit Intermediate Representation,
  0019 Self-hosted Compiler Driver,
  0047 Persistent Vector Trie Prototype,
  0049 Persistent Hash Map Trie Prototype,
  0073 Native JavaScript Container Interop

## Summary

This specification establishes the first P3 language-integration layer. Seed
and self-hosted compilers now represent persistent Vector and Map construction
with dedicated IR nodes and link those nodes through one standard ESM runtime
ABI. Native JavaScript arrays and ordinary objects have explicit source forms
that do not use the persistent runtime.

This slice deliberately did not change square-bracket source literals. That
follow-up is now implemented by specification 0083, which makes `[...]` values
persistent Vectors and annotates host-dependent maintained sources explicitly.

## Runtime ABI

Generated modules import persistent constructors from exactly:

```text
eliscript/runtime/literals.mjs
```

The package export resolves to `runtime/literals.mjs`. Its public surface is:

```text
vector(...values)
hashMap(...keyValues)
keyword(name)
```

`vector` returns the canonical optimized persistent Vector. `hashMap` requires
complete key/value pairs and returns the canonical value-semantic persistent
HAMT Map. Duplicate value-equal keys use ordinary Map association semantics,
so the last supplied value wins. The ABI delegates to the existing persistent
and interned Keyword implementations and does not define another value
representation. Specification 0085 adds `keyword` to this ABI without changing
the Vector or Map contracts.

The compiler inserts one named ESM import only when a module constructs a
persistent literal, identifier value, or persistent quoted datum. Modules
using only scalars, transport-safe scalar quote, or explicit host values do not
acquire a runtime dependency. Specification 0087 extends this ABI with `list`
and `symbol` constructors.

## Source Forms and IR

`(vector value...)` lowers to `persistent-vector-literal` and emits one call to
the ABI `vector` constructor. `(hash-map key value...)` lowers to
`persistent-map-literal` and emits one call to the ABI `hashMap` constructor.
The analyzer rejects an incomplete final Map pair before emission.

`(js-array value...)` constructs a native mutable JavaScript Array.
`(js-object key value...)` constructs a native ordinary JavaScript Object,
retaining literal and computed property-key behavior. The older `array` and
`object` forms remain provisional aliases during source migration; new host
dependent code should use the explicit `js-` names.

At this specification boundary, `array-literal` represented the provisional
square-bracket expression. Specification 0083 reassigns square-bracket values
to `persistent-vector-literal`; `array-literal` now represents only explicit
`js-array`/`array` construction. Binding patterns remain
`array-binding-pattern` and are independent of value construction.

## Bootstrap and Portable Boundaries

The Emacs Lisp seed and Eliscript-authored compiler implement the same IR,
analysis, lowering, import discovery, emission, diagnostics, and Source Map
behavior. Three-generation compiler fixed-point evidence remains mandatory.

Portable worker closures may construct `(vector ...)`, square-bracket Vector
values, `(hash-map ...)`, source Keywords, and persistent quoted data. Calls
that carry those values select the explicit worker value codec from 0088;
legacy JSON calls remain limited to JSON-compatible results. Explicit native
arrays remain portable in either mode.

## Architecture Boundary

The literal ABI is standard ESM runtime infrastructure. It has no dependency
on UI frameworks, bundlers, development servers, publishing systems, or a
particular JavaScript host. Application tools may consume generated modules,
but cannot alter literal semantics or runtime resolution.

## Remaining P3 Migration

This specification completes P3 construction prerequisites, not the P3 exit.
Specifications 0083 and 0084 complete default Vector and Map expression
syntax, maintained-source annotation, protocol collection access, and
compatibility recording. The following work remains explicit:

1. audit legacy list and native-container compatibility forms
2. add static transient escape analysis
3. promote the complete literal boundary after the remaining migration

## Acceptance Criteria

- **PLA-01:** `runtime/literals.mjs` is the only package ABI used by generated
  persistent Vector and Map constructors.
- **PLA-02:** `(vector ...)` and `(hash-map ...)` lower to distinct public IR
  node kinds rather than native array/object nodes or generic calls.
- **PLA-03:** Runtime imports are emitted exactly once and only for modules
  whose IR contains persistent constructor nodes.
- **PLA-04:** Persistent constructors return canonical optimized Vector and Map
  values with ordinary structural and value-semantic behavior.
- **PLA-05:** `hash-map` rejects incomplete pairs with matching seed and
  self-hosted diagnostics.
- **PLA-06:** `js-array` and `js-object` produce native Array and exact ordinary
  Object values without importing the persistent runtime.
- **PLA-07:** A separately reconstructed value-equal Vector key retrieves the
  Map value constructed by a generated literal module.
- **PLA-08:** Seed and self-hosted ESM and Source Maps are byte-identical.
- **PLA-09:** Bun and Node execute generated persistent/native reports
  identically.
- **PLA-10:** The portable compiler reaches the three-generation fixed point
  with both new IR node kinds in its declared surface.
- **PLA-11:** Public-surface and conformance contracts track the ABI, source
  forms, IR nodes, and executable evidence.
- **PLA-12:** Framework and bundler code remains absent from the runtime ABI,
  compiler semantics, and acceptance conditions.
