# 0083: Default Persistent Vector Literals and Explicit Host Access

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0007 Explicit Intermediate Representation,
  0019 Self-hosted Compiler Driver,
  0047 Persistent Vector Trie Prototype,
  0059 Collection Capability Protocols,
  0073 Native JavaScript Container Interop,
  0082 Persistent Literal Runtime ABI

## Summary

Square-bracket value expressions now construct canonical immutable persistent
Vectors. Native JavaScript arrays remain available through explicit host
forms. Indexed access and collection length no longer rely on accidental
JavaScript properties when the language-level operations are used.

This specification is the P3 default-Vector migration. It does not make a UI
framework, bundler, development server, or application adapter part of the
language. Those systems may consume generated ESM only through public
compiler, runtime, and interop contracts.

## Value and Pattern Semantics

In expression position:

```text
[first second nested]
```

lowers to `persistent-vector-literal` and links the constructor from
`eliscript/runtime/literals`. Nested square-bracket expressions are persistent
Vectors independently. The explicit `(vector ...)` form remains an equivalent
constructor.

Square brackets in binding position remain structural patterns:

```text
(defun head-and-tail ([head &rest tail]) ...)
```

They lower to `array-binding-pattern` and emit JavaScript destructuring. A
binding pattern is not a value constructor and must not cause a persistent
runtime import by itself.

Quoted vectors remain syntax data in this slice. Their existing JSON-safe
representation is retained for deterministic macro expansion, diagnostics,
and bootstrap transport. First-class quoted persistent data is part of the
later reader/data-literal integration together with Keyword emission. Map
expression syntax is specified separately by 0084.

## Explicit Host Containers

`(js-array value...)` constructs a native mutable JavaScript Array and lowers
to `array-literal`. The provisional `array` alias has the same behavior.
`array-literal` round-trips canonically as `(js-array ...)`; it no longer
represents square-bracket value syntax.

Host array or string access is explicit:

```text
(js-nth index host-value)
(js-length host-value)
```

`js-nth` preserves the previous null-on-missing indexed behavior. `js-length`
reads the native `length` property with nullish values treated as empty. These
forms are valid in portable closures because worker transport values are
native JSON-compatible values.

Maintained compiler, standard-library, worker, and application sources must
use `js-array`, `js-nth`, and `js-length` whenever their algorithm requires a
mutable work buffer, JavaScript API result, string code unit, or JSON array.
This annotation makes host dependence reviewable instead of implicit.

## Protocol-Driven Language Operations

The language-level operations retain their existing source spelling:

```text
(nth index collection)
(length collection)
```

They emit calls to the public `nth` and `count` operations from
`eliscript/runtime/core/collection.mjs`. The compiler inserts one named import
only when either intrinsic occurs. `nth` supplies `nil` as its not-found value,
preserving the language's prior missing-index result while allowing protocol
dispatch over persistent Vectors, native arrays, strings, and externally
extended indexed values. `length` is the compatibility spelling for generic
collection count.

The explicit `js-` forms never link this module. `aref`, `get`, `js-call`, and
raw JavaScript retain their documented host-oriented behavior and are not
silently redirected through collection protocols.

## Portable and Bootstrap Boundary

Portable closures reject square-bracket value expressions, `(vector ...)`,
and `(hash-map ...)` until the persistent-value worker codec is specified and
implemented. The diagnostic identifies persistent runtime values. Binding
patterns and explicit host arrays remain portable.

All maintained self-hosted compiler sources use explicit host containers and
access operations for syntax trees, IR nodes, source-map segments, emission
fragments, and mutable work queues. Consequently the generated compiler
remains executable from an arbitrary temporary directory without importing
the persistent runtime. Seed and self-hosted compilers must still produce
byte-identical ESM, Source Maps, diagnostics, and complete IR trees.

## Compatibility Boundary

This is an intentional provisional semantic change. Source that depended on
square brackets being a native Array must replace the value expression with
`js-array` and replace direct host access with explicit `js-` operations.
Binding syntax is unchanged. The compatibility corpus freezes the new
distinction before the persistent literal family is promoted to stable.

## Remaining P3 Work

The following integration work remains after this slice:

1. emit source keywords as first-class runtime Keyword values
2. integrate quoted collection values with the canonical data reader
3. implement transport-safe persistent values in the Emacs worker codec
4. audit legacy `car`, `cdr`, `cons`, `list`, and `array` compatibility forms
5. promote the complete literal and host-container contract after migration

## Acceptance Criteria

- **PVL-01:** Every square-bracket expression lowers to
  `persistent-vector-literal`, including nested expressions.
- **PVL-02:** Every generated square-bracket value is a canonical optimized
  persistent Vector under Bun and Node.
- **PVL-03:** `(js-array ...)` lowers to `array-literal` and produces an exact
  native Array without linking persistent runtime code.
- **PVL-04:** `array-literal` and `persistent-vector-literal` round-trip to
  distinct canonical source forms.
- **PVL-05:** Vector binding patterns remain `array-binding-pattern` nodes and
  do not acquire value-construction semantics.
- **PVL-06:** `nth` and `length` dispatch through the public collection
  runtime and work for both persistent Vectors and native arrays.
- **PVL-07:** `js-nth` and `js-length` preserve explicit host behavior and do
  not import the collection runtime.
- **PVL-08:** Portable analysis rejects square-bracket value expressions with
  matching seed and self-hosted diagnostics while accepting host forms.
- **PVL-09:** Maintained bootstrap and portable standard-library sources
  contain no implicit square-bracket work-buffer values.
- **PVL-10:** Seed and self-hosted ESM, Source Maps, diagnostics, and complete
  IR fixtures remain byte- or value-identical.
- **PVL-11:** The three-generation compiler fixed point remains reproducible
  from an arbitrary system temporary directory.
- **PVL-12:** Bun and Node produce identical nested Vector and protocol-access
  reports.
- **PVL-13:** Public-surface, compatibility, and conformance contracts record
  the changed default and explicit host operations.
- **PVL-14:** No UI framework, bundler, or application adapter appears in the
  compiler/runtime implementation or acceptance evidence for this behavior.
