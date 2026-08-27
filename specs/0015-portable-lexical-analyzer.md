# 0015: Portable Lexical Analyzer

- Status: Implemented
- Date: 2026-08-28

## Summary

Generation 1 now includes a lexical analyzer written in Eliscript. The Emacs
Lisp seed compiler builds it to an ordinary ESM module, and the generated
analyzer consumes the explicit syntax nodes produced by the portable reader.
It neither converts nodes back to Emacs values nor mutates the input tree.

This establishes a portable front-end path from source text through reading and
lexical validation. Macro expansion, IR lowering, emission, and the compiler
driver still use the seed implementation.

## Scope Model

Each lexical scope contains two JavaScript maps:

- source names to binding records
- emitted ECMAScript names to binding records

A binding records its source name, output name, declaration kind, and
mutability. Scopes point to their parent, so lookup follows ordinary lexical
nesting. The second map detects different Eliscript names such as `foo-bar` and
`foo_bar` that would emit the same JavaScript identifier.

Top-level analysis uses two passes. Imports, variables, constants, and named
functions are declared first; expressions and bodies are validated second.
This permits forward function references while still diagnosing duplicate
declarations and invalid exports deterministically.

`let` initializers run in the parent scope. `let*` initializers run in the new
scope in declaration order. Function parameters and local bindings receive
their own child scopes, and assignment checks the resolved binding's mutable
flag.

## Syntax Contract

`bootstrap/compiler/analyzer.eli` handles the seed analyzer's current surface:

- module wrappers, imports, declarations, and exports
- functions, lambdas, `let`, and `let*`
- assignment and mutability
- conditionals, sequences, built-in operators, and calls
- vectors, objects, property operations, raw JavaScript, and React forms
- qualified JavaScript references and identifier validation

Quoted forms and raw `js*` payloads are intentionally opaque to lexical
resolution. The analyzer returns the original forms unchanged so later phases
retain every source span.

## Diagnostics and Host Boundary

Analysis failures retain the seed format:

```text
filename:line:column: message
```

The portable implementation reports unbound names, invalid declarations,
output-name collisions, immutable assignment, malformed special forms,
invalid imports and exports, and nested top-level-only forms at the same
locations as the seed analyzer.

The implementation uses standard `Map` objects for scope storage and a small
raw JavaScript function to throw `Error`. Another narrow bridge catches errors
from portable symbol mapping and reattaches syntax locations. Compiler logic,
scope traversal, and form validation remain in Eliscript.

ECMAScript modules are strict mode. `arguments` and `eval` therefore receive a
trailing `$` only when used as emitted binding names. Qualified property
references retain their original segments.

## Build Boundary

The stable bootstrap build now emits five portable modules and source maps:

```text
symbol.eli   -> symbol.mjs
syntax.eli   -> syntax.mjs
reader.eli   -> reader.mjs
expander.eli -> expander.mjs
analyzer.eli -> analyzer.mjs
```

The generated analyzer imports only the portable symbol and syntax modules.
Together with the generated reader, it can read and analyze every current
bootstrap source file, including its own implementation.

## Shared Conformance

`tests/fixtures/bootstrap-analyzer.json` is consumed by both implementations.
The Emacs oracle reads each source with the seed reader and runs the seed
analyzer. Bun reads the same source with the generated reader and runs the
generated analyzer, then compares acceptance and complete diagnostic strings.

Coverage includes forward declarations, lexical scope, mutable state, imports,
exports, special forms, lambdas, JavaScript references, duplicate bindings,
identifier collisions, invalid arities, malformed clauses, and all ten
bootstrap modules. Repeated bootstrap builds remain byte-identical, including
the new analyzer and its source map.

## Next Phase

The portable macro expander that feeds this analyzer is specified in
[0016-portable-macro-expander.md](0016-portable-macro-expander.md), and the
implemented lowering stage in
[0017-portable-ir-lowering.md](0017-portable-ir-lowering.md). Generation 1 can
now emit direct ESM and Source Map output as specified in
[0018-portable-emission.md](0018-portable-emission.md); the compiler driver is
implemented in [0019-self-hosted-compiler.md](0019-self-hosted-compiler.md).
