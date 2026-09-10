# 0158: Declarative Multimethod Definitions

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-10
- Depends on: 0036 Compile-time Macros, 0144 Source-level Failure Mapping,
  0156 Value-dispatched Multimethods, 0157 Persistent Dispatch Hierarchies and
  Preferred Multimethods

## Summary

This specification adds `defmulti` and `defmethod` as declarative top-level
language forms. They expose the existing multimethod library through concise
Lisp syntax without creating a second dispatch engine or embedding standard
library implementation in the compiler.

Programs explicitly import `multi-fn` and `add-method!` from the multimethod
module. Expansion therefore preserves normal lexical dependency checking,
project graph construction, and user control over the runtime module.

## Forms

`defmulti` accepts a symbol name, a dispatch function, and an optional default
dispatch value:

```elisp
(defmulti render (lambda (kind value) kind))
(defmulti classify (lambda (value) (get value :kind)) :fallback)
```

It expands before analysis to the equivalent immutable binding:

```elisp
(defconst render (multi-fn "render" (lambda (kind value) kind)))
```

The generated runtime name is exactly the source symbol name. The optional
default value is forwarded unchanged, including explicit `nil` or `undefined`.

`defmethod` accepts a multimethod symbol, a dispatch value, a parameter list,
and zero or more body forms:

```elisp
(defmethod render :text (kind value)
  (str "text:" value))
```

It expands before analysis to an ordinary method registration:

```elisp
(add-method! render :text
  (lambda (kind value)
    (str "text:" value)))
```

Declarations execute in source order. A later `defmethod` for the same
dispatch value replaces the earlier method through the standard library's
existing mutation contract.

## Compilation Boundary

Both forms are valid only at module top level, including the body of a
top-level `module` form. Their dispatch expressions, default expressions, and
method bodies continue through normal recursive macro expansion and lexical
analysis after desugaring.

Generated operators and the generated runtime name map to the complete source
declaration. Reused name, dispatch, parameter, default, and body nodes retain
their original source spans. Diagnostics from generated code therefore point
to user-authored declarations rather than compiler internals.

The forms do not implicitly import or link the multimethod library. Missing
`multi-fn` or `add-method!` bindings remain ordinary deterministic unbound
symbol errors. This keeps the compiler host-neutral and leaves the complete
dispatch implementation in `stdlib/multimethod.eli`.

## Interactive Evaluation

`defmulti` is classified as a named runtime definition because it creates one
module binding. `defmethod` is classified as an expression because it mutates
an existing multimethod without creating a new binding. Persistent evaluation
therefore replaces a repeated `defmulti` definition by name while replaying
method registrations in committed source order.

## Diagnostics

Malformed declarations use expansion diagnostic `ELI-X0001`.

| Condition | Message |
| --- | --- |
| `defmulti` has fewer than two or more than three arguments | `defmulti expects a name, dispatch function, and optional default value` |
| `defmulti` name is not a symbol | `defmulti name must be a symbol: VALUE` |
| `defmethod` has fewer than three arguments | `defmethod expects a multimethod, dispatch value, and parameter list` |
| `defmethod` target is not a symbol | `defmethod target must be a symbol: VALUE` |
| Either form appears in expression position | `FORM is only valid at module top level` |

Parameter-list shape and body semantics are validated by the ordinary lambda
analyzer after expansion, so the declarations cannot diverge from function
semantics.

## Acceptance Criteria

- **DMD-01:** `defmulti` expands to one immutable `multi-fn` binding with the
  exact source name and optional default value.
- **DMD-02:** `defmethod` expands to one `add-method!` call containing a normal
  lambda with the declared parameters and body.
- **DMD-03:** Both forms reject malformed shape, non-symbol ownership, and
  expression-position use with deterministic expansion diagnostics.
- **DMD-04:** Explicit imports remain mandatory and no multimethod runtime code
  is duplicated in either compiler.
- **DMD-05:** Seed and self-hosted expanders produce identical syntax trees,
  spans, and diagnostics for maintained declaration cases.
- **DMD-06:** Seed and self-hosted compilation produces byte-identical modules
  and Source Maps for a declarative fixture.
- **DMD-07:** The fixture dispatches exact and default methods identically under
  Bun and Node while retaining authenticated multimethod identity.
- **DMD-08:** Evaluation descriptors, formatting, font locking, Imenu, public
  surface, compatibility corpus, documentation, and local core gates pass.
