# 0095: Stable Persistent Value and Explicit Host Container Boundary

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0073 Native JavaScript Container Interop,
  0082 Persistent Literal Runtime ABI and Explicit Host Containers,
  0083 Default Persistent Vector Literals and Explicit Host Access,
  0084 Persistent Map Source Syntax,
  0085 First-class Source Keyword Values,
  0087 First-class Quoted Persistent Data,
  0092 Persistent Set Source Syntax,
  0094 Persistent List Language Semantics and Explicit Host Cons

## Summary

The language-level persistent value model and the native JavaScript container
boundary are now stable. Lists, Vectors, Maps, and Sets have canonical
persistent construction and value categories. Native Arrays and plain Objects
remain directly available, but their construction is always spelled with an
explicit `js-` form.

The provisional `array` and `object` constructor aliases are removed. They are
ordinary unbound symbols unless a program declares lexical or module bindings
with those names. No compatibility shim, warning-only transition, or dual
spelling remains.

This specification closes the P3 language-integration and migration milestone.
It does not make application frameworks, UI libraries, bundlers, site
generators, development servers, or publishing adapters part of the language
core or its acceptance evidence.

## Stable Value Construction

The stable language constructors are:

```elisp
(list value...)
(vector value...)
(hash-map key value...)
(hash-set value...)
```

Parenthesized List construction, square-bracket Vector expressions, brace Map
expressions, and Set expressions all produce their canonical immutable runtime
values. Quoted Lists and Vectors preserve those value categories through the
literal runtime. None of these forms produces a native JavaScript container.

## Explicit Host Construction

Native container construction is:

```elisp
(js-array value...)
(js-object key value...)
(js-cons value host-array)
```

Native indexed operations remain explicit through `js-nth` and `js-length`.
Plain-object operations remain visible through `get`, `put`, `object-keys`,
`object-has?`, and `object-assoc`. Structured conversion between persistent and
native families remains explicit through the interop standard library.

`js-array` lowers to `array-literal`, and `js-object` lowers to
`object-literal`. Canonical IR-to-source reconstruction always returns the
explicit spellings. These IR names describe host representation and do not
reintroduce source aliases.

## Retired Aliases

`array` and `object` are no longer builtin operators, special forms, portable
operators, lowerer aliases, or direct-emitter aliases. An undeclared call such
as `(array 1)` or `(object :ready t)` fails lexical analysis as an unbound
symbol in both the seed and self-hosted compiler.

The names are not reserved. A program may declare a normal function or value
named `array` or `object`, and normal lexical resolution applies. This keeps the
language namespace small while preventing accidental native-container
construction.

## Maintained Source Contract

Every maintained compiler, standard-library, example, and conformance fixture
uses `js-array` or `js-object` when it requires a native container. This rule is
machine checked by scanning source constructor positions. Negative fixtures
are the only maintained text that invokes the retired spellings without a
binding.

Source migration is behavior preserving for the generated JavaScript. Adding
the `js-` prefix records host dependence and may shift Source Map columns, but
does not change evaluation order, object-key behavior, native identity, or
mutability.

## Compatibility Freeze

This stable specification is the compatibility promotion point for the P3
value and host-container boundary. Future changes to the persistent value
categories, source constructors, explicit native forms, or canonical IR
round-trip spellings require a new compatibility decision and corresponding
executable evidence.

Earlier accepted specifications remain implementation records for individual
parts of this boundary. This specification owns the consolidated stable
contract and the P3 exit claim.

## Architecture Boundary

The compiler, persistent literal ABI, collection runtimes, and native interop
standard library are host-neutral ESM infrastructure. React, Vite, UI
libraries, bundlers, site generators, development servers, and publishing
tools may consume generated modules only as application-level utility
validation. They are not implementation dependencies, design inputs, core
goals, or acceptance evidence for this stable boundary.

## Acceptance Criteria

- **PHB-01:** List, Vector, Map, and Set source construction produces the
  canonical persistent runtime categories.
- **PHB-02:** `js-array`, `js-object`, and `js-cons` produce native JavaScript
  containers without importing a persistent runtime by themselves.
- **PHB-03:** `array` and `object` are absent from every builtin, special-form,
  portable-operator, lowering, and emission registry.
- **PHB-04:** Unbound calls to the retired names fail with matching source
  diagnostics in the seed and self-hosted compilers.
- **PHB-05:** User declarations may still bind `array` and `object` as ordinary
  names.
- **PHB-06:** `array-literal` and `object-literal` reconstruct canonically as
  `js-array` and `js-object`.
- **PHB-07:** Maintained compiler, standard-library, example, and fixture
  sources contain no accidental retired constructor invocation.
- **PHB-08:** Native-container migration preserves emitted ESM behavior and
  Bun/Node execution results.
- **PHB-09:** Seed and self-hosted ESM, diagnostics, IR, Source Maps, and the
  three-generation fixed point agree.
- **PHB-10:** Public-surface, compatibility, specification, and conformance
  registries record the stable boundary.
- **PHB-11:** The P3 exit condition is satisfied: no maintained source depends
  accidentally on mutable vector or map literals, and JavaScript interop is
  explicit and ergonomic.
- **PHB-12:** No application framework, UI library, Vite adapter, bundler,
  publishing adapter, development server, or site generator is imported by
  core implementation or required by this feature's acceptance evidence.
