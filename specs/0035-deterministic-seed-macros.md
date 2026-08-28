# 0035: Deterministic Seed Macros

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0005 Compile-time Macros, 0016 Portable Macro Expander,
  0034 Nullish Values

## Summary

The Emacs Lisp seed compiler no longer evaluates macro bodies with host
`eval`. It interprets the same deterministic macro language as the self-hosted
compiler. Macro expansion is now a function of source forms and arguments in
both generations, with no implicit access to the editor, filesystem,
environment, network, or processes.

The expansion walk remains in `eliscript-expander.el`. A dedicated
`eliscript-macro-eval.el` owns parameter parsing, lexical macro scopes,
quasiquotation, local mutation, and the operation whitelist. This keeps syntax
rewriting separate from compile-time execution policy.

## Native Value Model

The seed evaluator uses location-free Lisp values because the seed reader
already strips locations at macro invocation. It distinguishes:

- `nil`, `t`, `false`, and `undefined`
- numbers and strings
- ordinary symbols and keywords
- proper lists and vectors

The evaluator uses private sentinels for absent scope values and absent
operation results. Source `undefined` is therefore a normal macro value rather
than an implementation-level missing marker.

Required and optional arguments are bound lexically. A trailing `&rest` or
`&body` parameter receives a proper list. `let` evaluates initializers in the
parent scope, `let*` evaluates them sequentially in the child scope, and `setq`
can update only an existing macro-local binding.

## Shared Semantics

The whitelist matches the portable evaluator:

- quote, nested backquote, comma, and comma-splicing
- `if`, `when`, `unless`, `cond`, `progn`, `do`, `and`, and `or`
- `let`, `let*`, and local `setq`
- list and vector construction, access, append, and length
- type, identity, structural equality, and nullish predicates
- arithmetic and numeric comparisons
- `symbol-name`, `intern`, `concat`, `str`, and explicit `error`

Eliscript truthiness applies during macro execution: `nil`, `false`, and
`undefined` are false, while zero and empty strings are true. Predicates return
source `t` or `false`, not host `nil`. Division follows JavaScript numeric
behavior for non-integral results, and string length counts UTF-16 code units.

These details prevent host representation from changing generated syntax. For
example, one non-BMP character has length two in both macro evaluators even
though Emacs stores it as one character.

## Host Boundary

An unlisted call fails with `unsupported macro function` before any host
function can run. There is no fallback to an Emacs function cell and no dynamic
evaluation path. Macro failures retain the public macro name and call-site
filename, line, and column.

The evaluator is a deterministic capability boundary, not a general resource
sandbox. Macro expansion still has the existing 100-call recursion limit, and
the language intentionally omits loops, recursion, and host callbacks from the
compile-time subset.

Because current macros have no external capabilities, incremental compilation
does not need undeclared macro dependency evidence. File access, if added later,
must arrive through an explicit compiler context that records every input.

## Acceptance Evidence

- Existing macro expansion, location, recursive expansion, and fixed-point
  tests pass without calling Emacs `eval`.
- Shared conformance checks required, optional, rest, and body parameters;
  quasiquotation; local computation; nullish semantics; JavaScript truthiness;
  fractional division; and UTF-16 string length.
- Both generations reject an attempted `getenv` call with the same located
  diagnostic.
- Arity failures and explicit macro errors remain byte-identical across the
  seed and self-hosted compilers.
