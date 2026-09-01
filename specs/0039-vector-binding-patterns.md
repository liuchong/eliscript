# 0039: Vector Binding Patterns

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0001 Language and Toolchain Boundary, 0004 Lexical Analysis,
  0007 Intermediate Representation, 0036 Function Parameters,
  0038 Exception Control Flow

## Summary

Eliscript fulfills the original vector-destructuring language boundary with
native JavaScript array binding patterns:

```elisp
(defun summarize ([first [second nil fourth] &rest tail]
                  &optional [fallback])
  (let* (([head &rest rest] tail)
         ([resolved] [(or fallback head)]))
    [first second fourth resolved rest]))
```

Patterns are accepted in required and optional function parameters, anonymous
functions, `let` and `let*` targets, and catch bindings. `defportable` inherits
function parameter support.

## Grammar

```text
binding        := symbol | vector-pattern
vector-pattern := [element* [&rest symbol]]
element        := binding | nil
```

Vector patterns may nest to any reader-supported depth. A `nil` element is a
hole: it consumes one input position and introduces no binding. One `&rest`
marker may appear at the end of each vector level and must be followed by one
symbol. The rest name receives a newly allocated array of remaining values.

`&optional` and `&body` are not valid inside a vector pattern. Function-level
`&rest` continues to require a symbol because it already receives the complete
remaining argument array; a vector may be used as an ordinary required or
optional parameter instead.

Every symbol contained in a pattern is declared independently. Duplicate
source names and names that map to the same JavaScript identifier are rejected
across the complete containing scope, including names outside the pattern.

## Runtime Semantics

Patterns emit directly as JavaScript destructuring syntax and therefore
preserve iterable evaluation order, nested destructuring, holes, and rest-array
allocation. The source value is evaluated exactly once.

An omitted `let` pattern initializer defaults to `[]`; an omitted optional
pattern parameter also defaults to `[]`. This makes empty binding forms and
omitted optional arguments well-defined. Explicit values are not coerced:
`nil` remains JavaScript `null` and raises the native non-iterable error when
destructured, while missing array positions bind JavaScript `undefined`.

Parallel `let` initializers use the outer scope before any pattern names are
introduced. `let*` declares every name from one pattern before analyzing the
next initializer. Catch patterns destructure the exact thrown value and remain
visible only in their catch body.

## Expansion and Portable Code

The macro expander preserves binding targets verbatim while recursively
expanding parameter bodies, let initializers, and catch bodies. A generated
pattern passes through the same reader, analyzer, and lowering validation as
handwritten syntax.

Vector patterns are allowed in `defportable` functions because they add no host
capability. Portable closure analysis flattens every pattern to its lexical
names while preserving the existing mutation and dependency restrictions.

## Intermediate Representation

Three public structural kinds extend the IR:

- `array-binding-pattern` owns ordered nested targets and records whether its
  final target is a rest binding.
- `binding-name` retains one bound symbol and its narrow source span.
- `binding-hole` retains a consumed nil position without introducing a name.

`parameter-binding`, `lexical-binding`, and `catch-binding` keep their existing
context-specific roles. Pattern instances carry `pattern: true` and own one
`array-binding-pattern` child before any initializer. Scalar bindings retain
their compact value representation, preserving compatibility for existing IR
consumers.

The compatibility round trip reconstructs vectors, nil holes, nested patterns,
and `&rest` markers exactly. The self-hosted representation uses equivalent
camel-case properties and child ordering.

## Acceptance Evidence

- ERT checks nested parameters, holes, rest capture, optional defaults,
  lexical and catch patterns, portable compilation, all new IR kinds, canonical
  round trips, duplicate names, output collisions, and invalid marker order.
- Shared fixtures compare macro expansion, exact diagnostics, complete IR,
  JavaScript, and Source Maps across seed and self-hosted compilers.
- The bootstrap compiler reproduces its next generation byte-for-byte.
- CLI integration executes required and omitted optional patterns, parallel and
  sequential lexical patterns, portable parameters, and catch destructuring
  with Bun.
