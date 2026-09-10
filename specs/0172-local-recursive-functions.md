# 0172: Local Recursive Functions

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-11
- Depends on: 0003 Language and Toolchain, 0028 Extended Function Parameters,
  0044 Async Functions and Exception Control Flow, 0064 Stack-safe Loop and
  Recur, 0144 Source-level Failure Mapping, 0171 Multi-arity Functions

## Summary

This specification adds `letfn`, an expression form for lexically scoped local
functions that can call themselves and every other function in the same
binding group. It is a language-level facility with no runtime module, host
API, application framework, or new IR node kind.

## Syntax

A binding contains a name, parameter list, and one or more body forms:

```elisp
(letfn ((even? (value)
          (if (= value 0) t (odd? (1- value))))
        (odd? (value)
          (if (= value 0) false (even? (1- value)))))
  (even? 10000))
```

Local functions accept the multi-arity clauses from specification 0171:

```elisp
(letfn ((choose
          (() :none)
          ((value) value)))
  (choose 42))
```

An `async` marker between the name and parameter syntax creates an asynchronous
local function:

```elisp
(letfn ((load-next async (value)
          (await (load-value value))))
  (await (load-next key)))
```

`letfn` requires one binding list and at least one body form. An empty binding
list is valid and behaves like an ordinary lexical sequence.

## Recursive Scope

Every function name is bound before any function value is installed. Function
bodies close over this shared scope, so forward references, direct recursion,
mutual recursion, and returned local functions remain valid. The enclosing
`letfn` body runs only after every function value has been installed.

Each local function is otherwise an ordinary `lambda` or `async` value.
Parameters, destructuring, closure capture, `recur`, assignment, and portable
closure validation therefore retain their existing semantics. `recur` targets
the current local function or selected multi-arity clause; it does not jump to
another binding.

## Expansion Boundary

The expander lowers `letfn` to one ordinary `let` containing a placeholder for
each name, followed by ordered `set!` installation of the generated function
values and then the source body. Multi-arity local functions first use the
existing argument-count dispatcher. Recursive expansion continues through all
generated function bodies, preserving user macros and source locations.

Seed and self-hosted expanders must produce equivalent syntax, diagnostics,
ECMAScript, and Source Maps. The form adds no backend-specific behavior.

## Diagnostics

Malformed forms use expansion diagnostic `ELI-X0001`.

| Condition | Message |
| --- | --- |
| Missing binding list | `letfn requires a binding list` |
| Missing body | `letfn requires at least one body form` |
| Non-list bindings | `letfn bindings must be a list` |
| Incomplete declaration | `letfn declaration requires a name, parameter list, and body` |
| Non-symbol name | `letfn name must be a symbol: VALUE` |
| Non-list parameters | `letfn declaration requires a parameter list` |

Multi-arity declaration failures use the diagnostics from specification 0171.

## Acceptance Criteria

- **LRF-01:** All names are visible to every local function and to the enclosing
  body after initialization.
- **LRF-02:** Direct recursion, mutual recursion, forward references, outer
  lexical capture, and escaped local closures execute correctly.
- **LRF-03:** Single-arity, multi-arity, async, and portable local functions
  preserve their existing function contracts.
- **LRF-04:** `recur` inside a local function remains stack safe and targets
  only that function or selected clause.
- **LRF-05:** Malformed forms fail with stable source-mapped `ELI-X0001`
  diagnostics.
- **LRF-06:** Seed and self-hosted ESM and Source Maps are byte-identical, and
  Bun and Node execution agree under direct local validation.
- **LRF-07:** Formatter, Emacs mode, public-surface, conformance,
  compatibility, and core gates recognize `letfn`.
