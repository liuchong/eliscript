# 0064: Stack-safe Loop and Recur

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0004 Lexical Analysis and Binding Diagnostics,
  0007 Explicit Compiler Intermediate Representation,
  0015 Portable Lexical Analyzer,
  0017 Portable IR Lowering,
  0018 Portable ESM and Source Map Emission,
  0036 Optional and Rest Function Parameters,
  0037 Async Functions and Await,
  0038 Exception Control Flow,
  0039 Vector Binding Patterns

## Summary

This specification adds `loop` and `recur` as compiler-recognized control
forms. They provide constant-stack iteration without exposing mutable loop
state in Eliscript source. `loop` introduces mutable lexical binding slots for
the compiler, while `recur` evaluates replacement values and transfers control
to the nearest eligible target.

The feature is implemented independently by the Emacs Lisp seed compiler, the
self-hosted compiler, and the compatibility form emitter. Seed and self-hosted
compilation produce byte-identical JavaScript and Source Map documents. The
generated JavaScript uses labeled `while (true)` blocks and `continue`; it does
not use JavaScript recursion for a valid `recur` path.

Ordinary self-calls remain ordinary JavaScript calls and are not implicitly
optimized; stack-safe transfer is available only through explicit `recur`.

## Binding Loop

The syntax is:

```elisp
(loop ((binding initializer) ...)
  body ...)
```

The binding list is required. Every entry contains exactly one binding target
and exactly one initializer. A target may be a symbol or any vector binding
pattern accepted by specification 0039. Empty binding and body lists are
valid; an empty body returns `nil`/JavaScript `null` on its first iteration.

Initializers are evaluated exactly once, from left to right, in the lexical
scope outside the new loop. Loop bindings are therefore parallel: an
initializer cannot observe a sibling binding introduced by the same `loop`.
The loop bindings are visible throughout the body and are mutable only as
compiler-owned recurrence slots.

The body is evaluated in order. Its final form is in tail position for the
loop target. Normal completion returns that form's value. A valid `recur`
replaces every loop slot and begins the body again.

## Function Recurrence

Every `defun`, `defn`, `defportable`, `defasync`, `lambda`, `fn`, and `async`
body provides a function recurrence target. If no nearer `loop` exists, a
tail-position `recur` targets that function.

Function recurrence has one slot per parsed parameter. Required, optional,
and rest parameters each count as one slot. A rest slot receives one
collection value on recurrence; it is not expanded as a JavaScript argument
list. Vector and map parameter patterns also count as one slot and destructure their
replacement value after all recurrence arguments have been evaluated.

A nested function always starts a fresh target stack. It cannot recur to an
enclosing function or loop. A nested `loop` shadows the current function or
outer loop as the nearest target.

## Tail Positions

`recur` is valid only in a tail position of its target. The following positions
are tail positions when their containing form is itself in tail position:

- the final form of a function body or `loop` body
- both value branches of `if`; an omitted false branch completes with `nil`
- the body of `when` and `unless`
- every result body of `cond`
- the final form of `progn` and `do`
- the final body form of `let` and `let*`
- the final operand of `and` and `or`, including recursive tail positions
  reached after earlier operands preserve Lisp short-circuit semantics

Tests, binding initializers, call arguments, vector elements, assignment
values, object keys and values, earlier sequence forms, and every other nested
expression are not tail positions. A `recur` argument is also not a tail
position, so recurrence cannot be nested inside recurrence arguments.

The analyzer rejects `recur` outside a target, in a non-tail position, or with
a physical argument count different from the target slot count.

## Evaluation and Rebinding

Every recurrence argument is evaluated exactly once and from left to right in
the current lexical environment. The resulting values are stored in fresh
compiler temporaries. Only after all argument evaluations succeed are the
target slots assigned from those temporaries. Assignment is therefore
simultaneous from the language perspective.

For example, this loop returns `[2 1]`, not `[2 2]`:

```elisp
(loop ((left 1) (right 2) (remaining 1))
  (if (= remaining 0)
      [left right]
    (recur right left (1- remaining))))
```

Vector patterns use JavaScript destructuring after temporary capture. Map
patterns rerun protocol lookup from the captured replacement. A failure while
evaluating or destructuring a replacement
value transfers no control and follows normal JavaScript abrupt-completion
behavior.

## Exceptions and Async Functions

`recur` cannot cross a `try` boundary. A `recur` lexically contained by a
`try`, `catch`, or `finally` clause cannot target a function or loop outside
that `try`. This restriction prevents a generated `continue` from bypassing
native exception and `finally` semantics.

A new `loop` inside a `try` establishes its own target and may recur within
that loop because no exception boundary is crossed.

An `async` or `defasync` recurrence argument may contain `await`. Its value is
fully resolved into the corresponding temporary before later arguments are
evaluated and before any target slot is changed. Recurrence itself introduces
no additional Promise or scheduling behavior beyond those explicit awaits.

## IR Contract

The public IR adds two node kinds:

- `binding-loop`: lexical binding children followed by body children, with a
  `bindingCount` property
- `recur`: replacement-expression children with a `targetKind` property equal
  to `function` or `loop`

The existing `loop` IR kind continues to represent source `while`. Keeping the
two nodes distinct prevents recurrence semantics from leaking into the
ordinary condition-controlled loop.

Lowering tracks the nearest target and records it on every `recur` node. The IR
to form bridge reconstructs canonical `loop` and `recur` forms. Source spans
remain attached to both control nodes and all replacement expressions.

## Emission Contract

A function without function-target recurrence retains its existing emitted
shape. A function containing function-target recurrence wraps its tail body in
one fresh labeled `while (true)` block. Every binding `loop` emits an IIFE whose
parameters hold the initial loop slots and whose body contains its own fresh
labeled loop.

At a recurrence site the emitter:

1. emits one fresh `const` temporary for each argument in source order
2. assigns every target slot from the corresponding temporary
3. emits `continue` to the target label

Tail-aware statement emission preserves conditional, sequence, lexical
binding, and short-circuit result behavior. Labels and temporaries use the
existing deterministic compiler name generator, so fixed-point and source-map
artifacts remain reproducible.

## Diagnostics

Malformed control forms fail during lexical analysis with source-located
`ELI-A0001` diagnostics. The stable message categories are:

- `loop requires a binding list`
- `loop bindings must be a list`
- `loop bindings require exactly one initializer`
- `recur is only valid inside a function or loop`
- `recur is only valid in tail position`
- `recur cannot cross a try boundary`
- `recur expects N arguments for the current TARGET, got M`

Existing binding-pattern diagnostics own invalid targets, duplicate emitted
names, and malformed vector rest markers.

## Compatibility and Limits

This feature changes no existing valid program that does not use `loop` or
`recur`. The source name `while` and its `loop` IR node retain their previous
behavior. The generated labels and temporary identifiers are compiler-private
and are not source-visible bindings.

This slice does not provide general tail-call optimization, mutual tail-call
elimination, recur-to-named-function syntax, cross-function jumps, `break`, or
`continue` source forms. Macro expansion may produce `loop` and `recur`, but
the expanded result must satisfy the same lexical, arity, and tail-position
rules.

## Acceptance Criteria

- **LR-01:** Seed and self-hosted analyzers accept the same valid loop/function
  recurrence corpus and produce identical complete diagnostics for invalid
  placement, arity, binding, nesting, and exception cases.
- **LR-02:** Loop initializers are parallel, evaluate once from left to right,
  and cannot observe sibling loop bindings.
- **LR-03:** Recurrence arguments evaluate once from left to right before any
  target slot changes.
- **LR-04:** Symbol and nested vector slots rebind simultaneously, including
  function parameter patterns and loop binding patterns.
- **LR-05:** The nearest loop or function target wins, and nested functions
  reset the target stack.
- **LR-06:** Every specified conditional, sequence, lexical, and short-circuit
  tail position accepts recurrence; non-tail positions reject it.
- **LR-07:** Recurrence cannot cross `try`, while a loop established inside a
  try may recur to itself.
- **LR-08:** Optional and rest parameters each contribute exactly one physical
  function recurrence slot.
- **LR-09:** Async recurrence arguments preserve explicit await order and
  complete without JavaScript stack growth.
- **LR-10:** Lowering exposes `binding-loop` and `recur`, preserves their spans
  and target properties, and round-trips canonical forms.
- **LR-11:** The compatibility form emitter and production IR emitter produce
  byte-identical JavaScript for the recurrence surface.
- **LR-12:** Seed and self-hosted compilers produce byte-identical JavaScript
  and Source Maps for the shared recurrence fixture.
- **LR-13:** Bun and Node.js both execute one million function recurrences and
  one million binding-loop recurrences without a stack overflow.
- **LR-14:** Bun and Node.js agree on nested targets, simultaneous swaps,
  pattern rebinding, conditional tails, short-circuit tails, and async
  recurrence.
- **LR-15:** The generated self-hosted compiler reaches the same byte-for-byte
  fixed point after the new IR and emitter paths are included.
- **LR-16:** Existing language, bootstrap, standard-library, persistent-data,
  protocol, project, adapter, worker, contract, and strict byte-compilation
  suites remain green.

## Integration

Use stack-safe recurrence when portable Eliscript implementations need
iterative control, while keeping migrations profile- and design-driven.
Deterministic macro-generated names and capture rules are now implemented in
[0065-deterministic-macro-generated-names.md](0065-deterministic-macro-generated-names.md).
Subsequent language-closure specifications implement persistent literal
integration, explicit host conversion, and portable protocol/core definitions.

## Compatibility Freeze

The `loop` and `recur` syntax, nearest-target resolution, tail-position rules,
parallel initialization, evaluate-before-rebind semantics, exception boundary,
async ordering, `binding-loop`/`recur` IR nodes, diagnostics, and stack-safe
emission are stable across seed and self-hosted compilers.

General tail-call optimization, mutual recurrence, named jumps, and implicit
self-call rewriting remain outside this contract. They require separate syntax
and compatibility specifications.
