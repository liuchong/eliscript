# 0171: Multi-arity Functions

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-11
- Depends on: 0003 Language and Toolchain, 0028 Extended Function Parameters,
  0044 Async Functions and Exception Control Flow, 0064 Stack-safe Loop and
  Recur, 0065 Capture-safe Generated Names, 0144 Source-level Failure Mapping

## Summary

This specification adds source-level multi-arity functions to named,
anonymous, asynchronous, and portable function forms. A multi-arity function
contains two or more parameter/body clauses and selects exactly one clause from
the number of supplied arguments.

The feature expands into existing lexical functions, `apply`, `cond`, and
capture-safe generated bindings. It adds no public runtime module, mutable
dispatch registry, host API, or application-framework dependency.

## Syntax

Named functions accept clauses after their name:

```elisp
(defun describe
  (() "empty")
  ((value) (str "one:" value))
  ((left right &rest remaining)
    (+ left right (length remaining))))
```

The same clause syntax is supported by `defn`, `defportable`, and `defasync`.
Anonymous `lambda`, `fn`, and `async` forms omit the name:

```elisp
(lambda
  (() :missing)
  ((value) value))
```

The existing single-arity syntax remains unchanged. A multi-arity declaration
must contain at least two clauses, and each clause must contain one parameter
list followed by one or more body forms.

## Clause Selection

A fixed clause is selected when its required parameter count equals the number
of supplied arguments. One clause may end in `&rest`; it is selected when the
argument count is at least its required parameter count. Each fixed parameter
count may appear once, and at most one variadic clause may appear.

A fixed clause whose count is greater than or equal to the variadic minimum is
unreachable and is rejected during expansion. This makes dispatch independent
of source ordering and prevents silently shadowed clauses.

Explicitly supplied `undefined` is an argument and therefore contributes to
the argument count. Dispatch does not inspect argument values or host types.

## Parameters And Bodies

Each clause supports required binding symbols, vector binding patterns, map
binding patterns, and one final `&rest` symbol. `&optional` and `&body` are not
accepted in multi-arity clauses because their call domains overlap neighboring
clauses. They remain available where already specified for single-arity
functions and macros.

Only the selected clause binds parameters and evaluates its body. Every clause
is a separate lexical function body. Consequently, `recur` targets the
selected clause and must supply that clause's parameter shape; it never
redispatches to another arity.

For `defasync` and anonymous `async`, each selected branch is asynchronous and
the outer result follows normal promise-flattening semantics. `defportable`
continues through ordinary portable closure validation after expansion.

## Unsupported Arity

When no clause matches, calling the function throws `TypeError`:

```text
NAME received unsupported arity: COUNT
```

Anonymous functions use `anonymous function` as `NAME`. Named functions use
their source name. The compiler emits this behavior through a private intrinsic
that is unavailable as user source syntax and does not enlarge the public
runtime API.

## Expansion And Source Mapping

The outer function captures its argument array once, computes its length once,
and dispatches through generated fixed and variadic comparisons. The selected
clause is invoked with the original argument array. Generated bindings use the
reserved capture-safe name allocator.

Clause comparisons, parameter bindings, body expressions, and failures retain
their originating source spans. Seed and self-hosted compilers must emit
byte-identical ECMAScript modules and Source Maps for the same valid source and
identical structured diagnostics for invalid declarations.

## Diagnostics

Malformed declarations use expansion diagnostic `ELI-X0001`.

| Condition | Message |
| --- | --- |
| Fewer than two clauses | `multi-arity function requires at least two clauses` |
| Missing parameter list or body | `multi-arity clause requires a parameter list and body` |
| Duplicate fixed count | `multi-arity function declares duplicate fixed arity: COUNT` |
| Multiple variadic clauses | `multi-arity function declares more than one variadic clause` |
| Overlap with variadic clause | `multi-arity fixed arity COUNT is unreachable behind variadic arity MINIMUM` |
| Optional/body marker | `multi-arity clauses do not support MARKER` |
| Invalid rest tail | `multi-arity clause requires one final &rest symbol` |

## Acceptance Criteria

- **MAF-01:** `defun`, `defn`, `defportable`, `defasync`, `lambda`, `fn`, and
  `async` accept two or more parameter/body clauses.
- **MAF-02:** Fixed and variadic clauses select deterministically from the
  supplied argument count without evaluating argument values more than once.
- **MAF-03:** Required, vector-destructured, map-destructured, and final-rest
  parameters bind only inside the selected clause.
- **MAF-04:** Duplicate, overlapping, incomplete, optional, and multiply
  variadic declarations fail with stable `ELI-X0001` diagnostics.
- **MAF-05:** Unsupported calls throw the specified source-named `TypeError`.
- **MAF-06:** `recur` remains stack safe and local to the selected clause.
- **MAF-07:** Async clauses preserve asynchronous behavior, and portable
  clauses pass the normal portable closure analysis.
- **MAF-08:** Seed and self-hosted ESM, Source Maps, diagnostics, Bun execution,
  and Node execution agree under direct local validation.
- **MAF-09:** Formatter, Emacs mode, documentation, conformance, compatibility,
  and core gates maintain the multi-clause syntax.
