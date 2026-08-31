# 0005: Compile-time Macros

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-27
- Depends on: 0001 Language and Toolchain Boundary, 0004 Lexical Analysis

## Summary

Eliscript now expands user-defined macros between reading and lexical analysis.
Both compiler generations interpret one deterministic macro subset. The seed
uses native, location-free Lisp data while Generation 1 evaluates explicit
syntax nodes. Every expanded form passes through the same analyzer and emitter
as handwritten application code.

```text
.eli source -> reader -> macro expander -> lexical analyzer -> ESM emitter
```

## Definition and Expansion

`defmacro` is a module-top-level, compile-time-only declaration:

```elisp
(defmacro twice (value)
  `(+ ,value ,value))

(defun double (value)
  (twice value))
```

Macro definitions are registered in source order and removed from the emitted
module. A definition is available only to forms that follow it. Macro calls
receive their unevaluated argument forms, and their results are recursively
expanded until the call site no longer names a registered macro.

The parameter model supports required parameters, `&optional`, and one trailing
parameter after `&rest` or `&body`. Backquote, comma, and comma-splicing provide
syntax construction in the shared interpreter. The provisional generated-name
extension adds explicit `gensym` and trailing-`$` quasiquote symbols without
changing the stable expansion order.

## Expansion Boundaries

The expander understands language syntax rather than recursively rewriting
every list:

- quoted data is never expanded
- function parameters and binding names are preserved
- object literal keys remain literal unless they are computed expressions
- assignment targets, imports, exports, and module names are preserved
- function bodies, initializers, conditions, values, and call arguments expand
- a macro may produce a top-level declaration, which is processed normally

`defmacro` inside an expression is rejected. Macro environments are fresh for
each call to the public string or file compiler, so definitions cannot leak
between builds.

## Determinism and Capabilities

Macro bodies can call only the syntax, collection, predicate, arithmetic, and
string operations named by the language contract. They cannot call arbitrary
Emacs Lisp or JavaScript functions, inspect editor state, read files or
environment variables, access the network, or start processes. Unsupported
functions fail explicitly in both compiler generations.

Current expansion is therefore a deterministic function of macro source and
arguments. A future compiler context API must make external capabilities and
their dependency evidence explicit before adding any stateful macro operation.

## Diagnostics and Termination

Expansion failures signal `eliscript-expand-error`, a subtype of
`eliscript-compile-error`. Diagnostics include the input filename when one is
available and identify the macro whose execution failed.

Recursive expansion is limited to 100 steps per expansion path. Exceeding the
limit signals an expansion error instead of hanging the compiler. The lexical
analyzer then validates generated names, assignments, exports, and all other
language rules, so macros cannot bypass semantic checks.

## Acceptance Evidence

- ERT tests cover ordinary expansion, `&body`, generated declarations, quoted
  data, generated-name determinism, build isolation, runaway recursion, macro
  failures, and analyzer checks on expanded code.
- The CLI compiles a file containing a macro, verifies that the declaration is
  absent from output, and executes the generated module with Bun.
- Existing M0 snapshots remain byte-for-byte stable.

## Deferred Work

- macro expansion traces in diagnostics
- explicit compiler context and declared file dependencies
- a standard macro library shared by the seed and self-hosted implementations

The portable evaluator and its exact compatibility boundary are specified in
[0016-portable-macro-expander.md](0016-portable-macro-expander.md). The seed
migration is specified in
[0035-deterministic-seed-macros.md](0035-deterministic-seed-macros.md).
Generated symbols and caller-capture rules are specified in
[0065-deterministic-macro-generated-names.md](0065-deterministic-macro-generated-names.md).
