# 0094: Persistent List Language Semantics and Explicit Host Cons

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0007 Explicit Intermediate Representation,
  0019 Self-hosted Compiler Driver,
  0073 Native JavaScript Container Interop,
  0082 Persistent Literal Runtime ABI and Explicit Host Containers,
  0086 Optimized Runtime Persistent List and Canonical Data Text,
  0087 First-class Quoted Persistent Data

## Summary

Ordinary List construction and operations now use the canonical immutable
Persistent List value. `(list ...)` lowers to dedicated
`persistent-list-literal` IR, while `car`, `cdr`, and `cons` dispatch through
the public List runtime rather than compiling to native JavaScript Array
indexing, slicing, or spread syntax.

Native prepend remains available as the explicit `(js-cons value array)` host
operation. Maintained standard-library code uses that spelling whenever it is
building mutable or JSON-compatible work arrays.

This is a language, compiler, runtime, and standard-library contract. React,
Vite, UI libraries, bundlers, site generators, development servers, and
publishing tools may consume compiled modules only as application-level
validation. They are not implementation dependencies, design inputs, core
goals, or acceptance evidence for List semantics.

## Language Semantics

The constructor form:

```elisp
(list value...)
```

evaluates every member exactly once from left to right and constructs an
optimized Persistent List in the same logical order. `(list)` returns the
canonical empty List. The result is frozen, iterable, value-semantic, and
structurally shared according to specification 0086.

The core operations are:

```elisp
(car list-or-nil)
(cdr list-or-nil)
(cons value list-or-nil)
```

- `car` returns the first member, or `nil` for `nil` and an empty List.
- `cdr` returns the complete shared suffix, or the canonical empty List for
  `nil` and an empty List.
- `cons` allocates one front node and shares the complete supplied List; a
  `nil` tail is treated as the empty List.

Native Arrays, strings, Vectors, Maps, Sets, plain objects, and arbitrary
iterables are not Lists for these operations. Passing one produces `TypeError`
instead of silently changing its value category.

## Explicit Host Operation

`(js-cons value array)` preserves the previous native prepend operation. It
returns a new native Array containing `value` followed by the supplied Array.
A nullish tail is treated as an empty host Array.

`js-cons` joins `js-array`, `js-nth`, and `js-length` as an explicitly
host-oriented primitive. It does not link the persistent literal runtime or
the List runtime by itself. Specification 0095 subsequently removes the
provisional `array` and `object` aliases and promotes the complete persistent
value and explicit host-container boundary.

## Compiler and Runtime ABI

The construction path is:

```text
(list value...)
  -> persistent-list-literal IR
  -> __eliscript_list(...)
  -> runtime/literals.mjs list(...)
  -> persistentList(...)
```

`runtime/core/list.mjs` additionally exports `first`, `rest`, and `cons` as
validated language operations. Generated modules import them as
`__eliscript_first`, `__eliscript_rest`, and `__eliscript_cons` only when the
corresponding source operation occurs.

The seed and self-hosted lowerers expose the same IR kind. Their emitters must
produce byte-identical ESM and Source Maps. `persistent-list-literal`
round-trips canonically as `(list ...)`; `array-literal` remains `(js-array
...)`.

## Standard-library Migration

Before this contract, maintained portable algorithms used `cons` as an
accidental native Array prepend. Every such standard-library site now uses
`js-cons`, including argument-vector assembly, reverse buffers, HAMT work
arrays, parser stacks, sequence results, and transient wrappers.

This migration is semantic annotation rather than an algorithm rewrite. The
resulting host arrays retain their previous order and mutability, while future
uses of unqualified `cons` are reviewable as genuine persistent List
construction.

## Portable and Macro Boundaries

`list`, `car`, `cdr`, `cons`, and `js-cons` remain valid in portable closures.
Persistent List results use the versioned worker value codec when they cross a
worker boundary. Native `js-cons` results remain ordinary explicit host arrays.

Compile-time macro Lists are syntax data governed by the macro evaluator.
This runtime-value migration does not change macro expansion representation,
quasiquote behavior, or reader proper-list syntax.

## Compatibility Boundary

This is an intentional provisional semantic change. Source that relied on
`list`, `car`, `cdr`, or `cons` producing or consuming native Arrays must use
`js-array`, `js-nth`, or `js-cons` explicitly. Generic collection algorithms
should use collection protocols rather than List-specific operations.

Specification 0093 closes static transient ownership analysis. This
specification closes the remaining legacy List-operation audit. Specification
0095 then removes the provisional host-container aliases and completes the P3
compatibility promotion.

## Acceptance Criteria

- **PLS-01:** `(list ...)` lowers to `persistent-list-literal` and constructs
  the canonical optimized Persistent List in source order.
- **PLS-02:** Empty construction returns the canonical empty List and links
  the literal runtime exactly once.
- **PLS-03:** `car`, `cdr`, and `cons` accept only Persistent Lists and `nil`,
  with the explicit empty behavior defined above.
- **PLS-04:** `cdr` and `cons` preserve suffix identity and constant-time List
  operations without converting through native Arrays.
- **PLS-05:** Invalid host-container arguments fail with `TypeError` rather
  than silently changing categories.
- **PLS-06:** `js-cons` preserves native Array prepend behavior and does not
  link persistent runtimes when used alone.
- **PLS-07:** Maintained standard-library Array-building sites use `js-cons`
  rather than unqualified `cons`.
- **PLS-08:** Seed and self-hosted compilers agree on IR, ESM, Source Maps,
  diagnostics, and three-generation fixed point.
- **PLS-09:** Bun and Node agree on constructed values, List operations,
  explicit host arrays, and type rejection.
- **PLS-10:** Public-surface, compatibility, and conformance registries own the
  new IR kind, runtime exports, source operator, and executable evidence.
- **PLS-11:** Portable closures retain persistent List values through the
  versioned worker codec.
- **PLS-12:** No application framework, UI library, Vite adapter, bundler,
  publishing adapter, development server, or site generator is imported by
  core implementation or required by this feature's acceptance evidence.
