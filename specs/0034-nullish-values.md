# 0034: Nullish Values

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0003 Core Language v0

## Summary

Eliscript exposes the JavaScript nullish boundary without collapsing it into
truthiness. Source `nil` emits JavaScript `null`; source `undefined` remains a
separate value. Three predicates make strict and combined checks readable in
ordinary functions, portable functions, and compile-time macros.

## Value Contract

| Form | JavaScript test | `nil` | `undefined` | `false` |
| --- | --- | --- | --- | --- |
| `(nil? value)` | `value === null` | true | false | false |
| `(undefined? value)` | `value === undefined` | false | true | false |
| `(nullish? value)` | `value == null` | true | true | false |
| `(null value)` | `value == null` | true | true | false |

`null` is retained as a compatibility alias of `nullish?`. New code should use
the more descriptive spelling. The loose equality in the combined test is
deliberate: JavaScript's `value == null` is true only for `null` and
`undefined`.

`eq` and `equal` continue to emit strict identity equality, so `(eq nil
undefined)` is false. No new source spelling for JavaScript `null` is needed
because `nil` already owns that representation.

## Truthiness and Interop

Truthiness is unchanged: `false`, `nil`/`null`, and `undefined` are false; all
other values are true. The predicates are value tests rather than truthiness
tests, so `(nil? false)`, `(undefined? false)`, and `(nullish? false)` are all
false.

A two-argument property read preserves a missing JavaScript property as
`undefined`, allowing `undefined?` to detect it. A three-argument `(get object
key fallback)` keeps its nullish fallback behavior and therefore replaces both
`null` and `undefined`.

## Compiler Agreement

The predicates are built-in intrinsics in both the Emacs Lisp seed compiler and
the Eliscript bootstrap compiler. Analyzer recognition, portable closure
validation, IR lowering, JavaScript emission, and compile-time macro evaluation
share the same contract. The compatibility form emitter remains covered so it
cannot drift from the primary IR backend.

The bootstrap macro evaluator also treats `undefined` as false for control-flow
truthiness. Its `null` predicate now follows the runtime nullish contract rather
than acting as an alias for `not`.

## Acceptance Evidence

- Runtime execution checks strict and combined results for `nil`, `undefined`,
  and `false`.
- ERT verifies IR and compatibility emitter parity, exact JavaScript operators,
  portable acceptance, and arity diagnostics.
- Shared analyzer, expander, and IR fixtures verify seed/self-hosted compiler
  agreement.
- Fixed-point bootstrap tests recompile the updated compiler through itself.
