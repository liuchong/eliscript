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

This slice deliberately does not change square-bracket source literals yet.
Existing `[...]` expressions remain provisional native arrays until compiler,
standard-library, and application internals are annotated with explicit host
constructors. The next migration slice changes that default and freezes the
result in the compatibility corpus.

## Runtime ABI

Generated modules import persistent constructors from exactly:

```text
eliscript/runtime/literals
```

The package export resolves to `runtime/literals.mjs`. Its public surface is:

```text
vector(...values)
hashMap(...keyValues)
```

`vector` returns the canonical optimized persistent Vector. `hashMap` requires
complete key/value pairs and returns the canonical value-semantic persistent
HAMT Map. Duplicate value-equal keys use ordinary Map association semantics,
so the last supplied value wins. The ABI delegates to the existing persistent
implementations and does not define another collection representation.

The compiler inserts one named ESM import only when a module contains a
persistent constructor node. Modules using only scalar or explicit host
values do not acquire a runtime dependency.

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

The existing `array-literal` IR kind continues to represent the provisional
square-bracket expression. Binding patterns remain `array-binding-pattern` and
are independent of value construction.

## Bootstrap and Portable Boundaries

The Emacs Lisp seed and Eliscript-authored compiler implement the same IR,
analysis, lowering, import discovery, emission, diagnostics, and Source Map
behavior. Three-generation compiler fixed-point evidence remains mandatory.

Portable worker closures reject `(vector ...)` and `(hash-map ...)` for now.
Their optimized runtime values are not JSON-compatible, and transport-safe
protocol/value encoding remains a separate requirement. Square-bracket values
retain their provisional portable behavior until the default-literal and
worker-codec migrations are specified together.

## Architecture Boundary

The literal ABI is standard ESM runtime infrastructure. It has no dependency
on UI frameworks, bundlers, development servers, publishing systems, or a
particular JavaScript host. Application tools may consume generated modules,
but cannot alter literal semantics or runtime resolution.

## Remaining P3 Migration

This specification completes P3 construction prerequisites, not the P3 exit.
The following work remains explicit:

1. change `[...]` expressions to `persistent-vector-literal`
2. add final persistent Map source syntax and first-class Keyword emission
3. migrate compiler and library work buffers to `js-array`/`js-object`
4. migrate collection access away from accidental native properties
5. freeze default literal behavior in the compatibility corpus
6. integrate persistent values with the Emacs transport codec

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
