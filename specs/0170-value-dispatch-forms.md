# 0170: Value Dispatch Forms

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-11
- Depends on: 0003 Language and Toolchain, 0036 Compile-time Macros,
  0057 Portable Value Inspection, 0065 Capture-safe Generated Names,
  0144 Source-level Failure Mapping

## Summary

This specification adds `case` and `condp` as expression-position dispatch
forms. Both forms bind their dispatch inputs once, preserve left-to-right
short-circuiting, and expand entirely into existing language forms. They add no
runtime module, host API, mutable registry, or application dependency.

## `case`

`case` compares one dispatch value against constant clauses:

```elisp
(case value
  :ready "ready"
  (:waiting :blocked) "pending"
  "unknown")
```

The dispatch expression is evaluated exactly once. A parenthesized match
position groups one or more constants; every other match position represents
one constant. Constants are source data and are never evaluated. Matching uses
Eliscript value equality, so identifiers and persistent values follow their
normal immutable value semantics rather than host reference identity.

The final unpaired form is the optional default. Without a default, no match
returns `nil`. Result expressions are evaluated only for the selected clause.
Duplicate constants, including duplicates spread across groups, are rejected
during expansion.

## `condp`

`condp` calls one predicate against each test and a single dispatch value:

```elisp
(condp matches? value
  expected direct-result
  pattern :>> result-function
  default-result)
```

The predicate expression and dispatch expression are each evaluated exactly
once. Tests execute from left to right until the predicate returns an
Eliscript-truthy value. A normal clause evaluates and returns its result. A
`:>>` clause evaluates its result function only after a match and calls it with
the exact predicate result. The optional unpaired final form is the default.

When no clause matches and no default exists, evaluation throws `TypeError`
with message `condp found no matching clause`. Tests and results after a match
are not evaluated.

## Expansion Boundary

Both forms are valid wherever an expression is valid. They expand through
capture-safe generated bindings and the existing `let`, `cond`, `if`, `equal`,
`funcall`, `quote`, `new`, and `throw` forms. Generated nodes retain the source
span of the dispatch, test, constant, or result that they represent. User
macros inside evaluated input and result expressions continue through normal
recursive expansion.

## Diagnostics

Malformed forms use expansion diagnostic `ELI-X0001`.

| Condition | Message |
| --- | --- |
| Missing `case` pairs | `case expects a dispatch expression and at least one match/result pair` |
| Duplicate `case` constant | `case declares duplicate match constant: VALUE` |
| Missing `condp` clause | `condp expects a predicate, dispatch expression, and at least one clause` |
| Missing `:>>` result function | `condp :>> clause requires a result function` |

## Acceptance Criteria

- **VDF-01:** `case` evaluates its dispatch once and matches atomic, grouped,
  identifier, and persistent constants with Eliscript value equality.
- **VDF-02:** `case` evaluates only its selected result, returns its default
  when present, and returns `nil` when no default exists.
- **VDF-03:** Duplicate constants and incomplete forms fail deterministically
  during expansion.
- **VDF-04:** `condp` evaluates its predicate and dispatch expressions once,
  then evaluates tests in left-to-right short-circuit order.
- **VDF-05:** `condp :>>` passes the exact truthy predicate result to a lazily
  evaluated result function.
- **VDF-06:** Unmatched `condp` selects its default or throws the documented
  source-mapped `TypeError` when no default exists.
- **VDF-07:** Seed and self-hosted expansion, ESM, and Source Maps agree, and
  generated modules execute identically under local Bun and Node.
- **VDF-08:** Formatter, Emacs mode, public-surface, conformance, documentation,
  and local core gates recognize both forms.
