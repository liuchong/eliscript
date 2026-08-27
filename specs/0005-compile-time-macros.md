# 0005: Trusted Compile-time Macros

- Status: Implemented
- Date: 2026-08-27
- Depends on: 0001 Language and Toolchain Boundary, 0004 Lexical Analysis

## Summary

Eliscript now expands user-defined macros between reading and lexical analysis.
The seed implementation evaluates macro bodies as trusted Emacs Lisp and treats
their results as ordinary Eliscript forms. The Generation 1 implementation
interprets the shared deterministic macro subset over explicit syntax nodes.
Every expanded form passes through the same analyzer and emitter as handwritten
application code.

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

The initial parameter model supports ordinary Emacs Lisp macro parameters,
including `&optional`, `&rest`, and `&body`. `&body` is normalized to `&rest`
inside the seed implementation. Native backquote, comma, and comma-splicing
provide syntax construction.

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

## Trust and Reproducibility

Seed macro bodies execute as Emacs Lisp with the compiler process's authority.
They are not sandboxed and may call available Emacs Lisp functions. This is an
intentional bootstrap capability, not a security boundary: projects must treat
macro code with the same trust as build scripts.

Reproducible macros should derive output only from their arguments and explicit
inputs. The current compiler does not track files, environment variables,
network access, buffers, or other editor state read by macro code. A future
compiler context API must make such dependencies explicit before incremental
build caching is considered reliable.

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
  data, build isolation, runaway recursion, macro failures, and analyzer checks
  on expanded code.
- The CLI compiles a file containing a macro, verifies that the declaration is
  absent from output, and executes the generated module with Bun.
- Existing M0 snapshots remain byte-for-byte stable.

## Deferred Work

- macro expansion traces in diagnostics
- explicit compiler context and declared file dependencies
- a standard macro library shared by the seed and self-hosted implementations

The portable evaluator and its exact compatibility boundary are specified in
[0016-portable-macro-expander.md](0016-portable-macro-expander.md).
