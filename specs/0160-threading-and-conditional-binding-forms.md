# 0160: Threading and Conditional Binding Forms

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-10
- Depends on: 0003 Functions and Lexical Bindings, 0005 Compile-time Macros,
  0015 Nullish Value Semantics, 0144 Source-level Failure Mapping

## Summary

This specification adds seven expression forms for readable data pipelines and
single-evaluation conditional bindings. They are compiler-owned syntax
expansions over existing calls, `let`, `if`, `progn`, `not`, and `nil?`. They
add no runtime helper, host capability, framework policy, or mutable state.

## Threading

`->` inserts an initial expression after the operator of each following list.
A symbol step becomes a one-argument call:

```elisp
(-> value (normalize options) validate)
```

is equivalent to:

```elisp
(validate (normalize value options))
```

`->>` inserts the accumulated expression at the end of each list:

```elisp
(->> values (map transform) (reduce combine initial))
```

is equivalent to:

```elisp
(reduce combine initial (map transform values))
```

Both forms require an initial expression. With no steps they return that
expression unchanged. Every step must be an ordinary symbol or a non-empty
proper list. Existing source forms are reused in the generated call, while the
generated call inherits the step location.

`as->` uses an explicit ordinary symbol as the insertion point:

```elisp
(as-> value item
  (normalize item options)
  (get item :result)
  (or item fallback))
```

The initial expression is evaluated once. Each non-final form is evaluated in
source order and rebound to the same lexical name before the next form. The
final form is the result. At least one form is required.

## Conditional Bindings

`if-let` and `if-some` accept a two-item binding list, a then form, and an
optional else form:

```elisp
(if-let (item (lookup key))
  (render item)
  (render-missing key))

(if-some (item (lookup key))
  (render item)
  (render-missing key))
```

The initializer is evaluated exactly once. `if-let` selects the then form when
the bound value is true under Eliscript truth semantics. `if-some` selects it
for every value except `nil`; in particular, `false` and `undefined` are
present values. Omitting the else form produces `nil`.

`when-let` and `when-some` accept the same binding followed by one or more body
forms. A matching value evaluates the body in order and returns its final
value. A non-matching value returns `nil` without evaluating the body.

Conditional binding names are ordinary symbols. Destructuring belongs to
ordinary `let` and is not accepted by these forms because the predicate applies
to the complete initializer value before any decomposition.

## Expansion and Diagnostics

User macros may produce or consume these forms. Expansion recursively processes
generated expressions, so macros inside initializers, steps, branches, and
bodies retain normal behavior. Seed and self-hosted compilers must produce
identical syntax nodes, spans, diagnostics, ESM, and Source Maps.

Malformed forms use expansion diagnostic `ELI-X0001`:

| Condition | Message |
| --- | --- |
| Missing thread initial expression | `FORM expects an initial expression` |
| Invalid thread step | `thread step must be a symbol or non-empty list: VALUE` |
| Incomplete `as->` | `as-> expects an initial expression, binding name, and at least one form` |
| Invalid `as->` name | `as-> binding name must be a symbol: VALUE` |
| Invalid binding shape | `FORM binding must contain a name and initializer: VALUE` |
| Invalid binding name | `FORM binding name must be a symbol: VALUE` |
| Invalid `if-*` arity | `FORM expects a binding, then form, and optional else form` |
| Missing `when-*` body | `FORM expects a binding and at least one body form` |

## Acceptance Criteria

- **TCB-01:** `->`, `->>`, and `as->` preserve documented insertion order and
  evaluate the initial expression once.
- **TCB-02:** Conditional bindings evaluate initializers once and preserve the
  distinct `if-let` truth and `if-some` nil-only predicates.
- **TCB-03:** `when-let` and `when-some` preserve body order, final values, and
  non-matching `nil` results.
- **TCB-04:** Malformed steps, binding shapes, names, and arities produce the
  documented expansion diagnostic.
- **TCB-05:** Seed and self-hosted compilation produce byte-identical ESM and
  Source Maps for the maintained execution fixture.
- **TCB-06:** Bun and Node produce identical results for threading, all
  conditional variants, nullish boundaries, and initializer call counts.
- **TCB-07:** Formatting, Emacs editing support, language documentation, public
  surface inventory, and local core gates include all seven forms.
