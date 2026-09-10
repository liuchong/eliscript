# 0160: Threading and Conditional Binding Forms

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-10
- Depends on: 0003 Functions and Lexical Bindings, 0005 Compile-time Macros,
  0015 Nullish Value Semantics, 0144 Source-level Failure Mapping

## Summary

This specification adds eleven expression forms for readable data pipelines and
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

## Conditional Threading

`cond->` and `cond->>` accept an initial expression followed by zero or more
test/step pairs. `cond->` inserts the current value after each selected step
operator; `cond->>` inserts it after the existing step arguments:

```elisp
(cond-> request
  authenticated? authorize
  compressed? (encode options))
```

The initial expression is evaluated once. Every test is evaluated once in
source order, including tests after a false test. A truthy test evaluates its
step once and makes that result the value seen by later pairs; a false test
leaves the current value unchanged. With no pairs, the initial value is returned
unchanged.

`some->` and `some->>` accept an initial expression and zero or more steps. They
use the same first- and last-position insertion rules, but stop before the next
step when the current value is `nil`. `false` and `undefined` are not stopping
values. The initializer and every reached step are evaluated once. With no
steps, the initial value is returned unchanged.

All four forms use capture-safe internal bindings. A source symbol that resembles
a generated name cannot capture the accumulated value or be captured by it.

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
| Unpaired conditional thread clause | `FORM expects test and step pairs` |
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
- **TCB-02:** `cond->` and `cond->>` evaluate test/step pairs in source order,
  evaluate the initial value once, and use capture-safe accumulated bindings.
- **TCB-03:** `some->` and `some->>` stop only on `nil`, preserve `false` and
  `undefined`, and never evaluate skipped steps.
- **TCB-04:** Conditional bindings evaluate initializers once and preserve the
  distinct `if-let` truth and `if-some` nil-only predicates.
- **TCB-05:** `when-let` and `when-some` preserve body order, final values, and
  non-matching `nil` results.
- **TCB-06:** Malformed steps, pairs, binding shapes, names, and arities produce the
  documented expansion diagnostic.
- **TCB-07:** Seed and self-hosted compilation produce byte-identical ESM and
  Source Maps for the maintained execution fixture.
- **TCB-08:** Bun and Node produce identical results for threading, all
  conditional variants, nullish boundaries, and initializer call counts.
- **TCB-09:** Formatting, Emacs editing support, language documentation, public
  surface inventory, and local core gates include all eleven forms.
