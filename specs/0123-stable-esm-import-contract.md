# 0123: Stable ECMAScript Module Import Contract

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-07
- Depends on: 0003 Implemented Core Language,
  0004 Lexical Analysis and Binding Diagnostics,
  0007 Explicit Compiler Intermediate Representation,
  0008 Direct ECMAScript Emission from IR,
  0015 Portable Lexical Analyzer,
  0017 Portable IR Lowering,
  0018 Portable ESM and Source Map Emission,
  0019 Self-hosted Compiler Driver

## Summary

Eliscript has a stable, complete source contract for ordinary ECMAScript
module imports. Side-effect, named, default, namespace, default-plus-named,
and default-plus-namespace declarations compile to recognizable ESM without a
runtime wrapper.

The seed and self-hosted compilers accept the same declarations, reject the
same malformed combinations before lowering, and emit byte-identical
JavaScript and Source Maps. Generated modules execute with equivalent results
under Bun and Node.

## Source Grammar

The stable grammar is:

```elisp
(import module-string specifier...)

specifier := local-name
           | :default local-name
           | :as local-name
```

`module-string` is a literal string. A bare symbol is both the imported ESM
name and the Eliscript local binding after normal symbol mapping. `:default`
introduces a default binding and `:as` introduces a namespace binding.

Named import aliases are not part of this stable contract. Adding source-level
renaming requires a later compatibility decision with explicit IR and
diagnostic behavior.

## Valid Forms

| Eliscript form | ESM shape |
| --- | --- |
| `(import "module")` | side-effect import |
| `(import "module" first second)` | named import |
| `(import "module" :default Main)` | default import |
| `(import "module" :as Namespace)` | namespace import |
| `(import "module" :default Main first)` | default plus named |
| `(import "module" :default Main :as Namespace)` | default plus namespace |

Specifier order is preserved within the named import list. Normal Eliscript
symbol mapping determines emitted JavaScript binding names.

An ESM module is still instantiated once according to host ESM semantics when
the generated module contains multiple declarations for the same module
specifier. Eliscript does not add another loading or caching layer.

## Invalid Forms

The following declarations fail lexical analysis:

- a non-string module specifier
- more than one `:default` marker
- more than one `:as` marker
- `:default` or `:as` without a following binding
- a namespace binding combined with one or more named bindings
- an invalid specifier value
- any imported local name that collides with another module binding

Default plus named and default plus namespace are valid. Namespace plus named
is invalid because ECMAScript has no corresponding single import declaration.
The analyzer rejects that combination before IR lowering instead of allowing
an emitter to produce invalid JavaScript.

Emitters retain the same namespace-plus-named rejection as a defensive IR
boundary. Deserialized or externally constructed malformed IR therefore
cannot bypass the source analyzer and produce invalid ESM.

## Portable Imports

`import-portable` remains a separate dependency-closure declaration. It
requires one or more named imports and rejects `:default` and `:as`. Project
planning resolves those imports through Eliscript source graphs rather than
treating them as unrestricted host ESM bindings.

This specification does not broaden portable code's host capabilities.

## Compiler Contract

The analyzer declares every imported local binding before body analysis. The
lowerer represents declarations with `import-declaration`, `import-default`,
`import-namespace`, and `import-named` nodes. The direct and self-hosted
emitters consume those nodes without translating back through source forms.

Side-effect imports have no child specifier nodes. Default and namespace
markers are source syntax only; their following symbols become explicit IR
nodes with source spans. Import declarations do not introduce runtime helper
requirements.

## Compatibility Freeze

The six valid import shapes, their diagnostics, IR kinds, symbol mapping,
source locations, and direct ESM output are stable. Future syntax for aliases,
import attributes, deferred loading, or other module-system extensions must be
introduced by a new specification and compatibility decision.

Application frameworks, bundlers, publishing systems, and development servers
may consume the generated ESM but are not implementation dependencies or
acceptance evidence for this language contract.

## Acceptance Criteria

- **ESM-01:** A string-only import emits one side-effect ESM declaration.
- **ESM-02:** One or more bare symbols emit a named ESM import in source order.
- **ESM-03:** `:default` emits one default binding.
- **ESM-04:** `:as` emits one namespace binding.
- **ESM-05:** Default plus named and default plus namespace emit valid ESM.
- **ESM-06:** Namespace plus named fails analysis with the same located
  diagnostic in seed and self-hosted compilers.
- **ESM-07:** Duplicate or incomplete markers and invalid module/specifier
  values fail before emission.
- **ESM-08:** Import bindings participate in ordinary duplicate-binding and
  output-name-collision analysis.
- **ESM-09:** Seed and self-hosted JavaScript and Source Maps are byte
  identical for the complete valid corpus.
- **ESM-10:** Bun and Node execute both compiler outputs with equal binding
  values and one ESM side effect.
- **ESM-11:** `import-portable` remains restricted to non-empty named imports.
- **ESM-12:** No application framework, bundler, publishing system, or
  development server contributes to this contract's implementation evidence.
