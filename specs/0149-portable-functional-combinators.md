# 0149: Portable Functional Combinators

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-09
- Depends on: 0021 Portable Functions and Dependency Closure,
  0053 Eliscript-authored Persistent Vector,
  0057 Portable Value Semantics Core

## Purpose

Eliscript provides a small, composable function layer written in portable
Eliscript itself. The layer covers ordinary higher-order composition,
predicate combination, nil normalization, parallel application, and
stack-safe trampoline execution without adding compiler intrinsics or a host
framework dependency.

The public module is `stdlib/function.eli`. It exports exactly:

```text
comp complement constantly every-pred fnil
identity juxt partial some-fn trampoline
```

## Composition

`identity` returns its argument unchanged. `constantly` returns a function
that accepts any arguments and always returns the captured value.
`complement` calls its predicate with all supplied arguments and returns the
Eliscript logical negation of the result.

`comp` composes functions from right to left. The rightmost function receives
all invocation arguments; every remaining function receives the single result
to its right. With no functions, `comp` returns the exact public `identity`
function. With one function, it returns that function unchanged.

`partial` captures leading arguments and appends invocation arguments without
coercion. With no captured arguments, it returns the original function by
identity. In particular, JavaScript `undefined` remains distinct from `nil`
while arguments cross this boundary.

## Parallel Application And Nil Normalization

`juxt` calls every captured function from left to right with all invocation
arguments. It returns the results in a portable persistent Vector. With no
functions, it returns an empty persistent Vector.

`fnil` associates each supplied default with the same positional argument.
It replaces only an existing argument whose value is `nil` or JavaScript
`null`; it preserves `undefined`, false, zero, and the empty string. It never
synthesizes arguments that the caller omitted, and it accepts any number of
defaults.

## Predicate Combination

`every-pred` evaluates predicates in declaration order. For each predicate it
visits arguments from left to right, stops at the first Lisp-false result, and
returns a Boolean. With no predicates it returns a function that is true for
every argument list.

`some-fn` uses the same predicate-major, argument-left-to-right order. It
returns the first Lisp-truth result itself, including zero or the empty string,
and stops immediately. It returns `nil` when no predicate matches or when no
predicates were supplied.

## Trampoline

`trampoline` calls its initial function with all supplied arguments. While the
result is a function, it invokes that result with zero arguments. The loop is
iterative and returns the first non-function result, so a chain of at least
100,000 thunks does not consume the JavaScript call stack.

## Portability And Complexity

The module is authored with `defportable`. Its only dependency is the portable
persistent Vector implementation used by `juxt`; it imports no runtime-core,
host, UI, publishing, or application package.

`identity`, `constantly`, and wrapper construction are constant time. A
composed or juxtaposed call is linear in the number of functions. `partial`
and `fnil` are linear in the number of forwarded arguments. Predicate
combinators are linear in the evaluated predicate/argument pairs and can stop
early. `trampoline` is linear in produced thunks and uses constant stack space.

## Acceptance Criteria

- **PFC-01:** The module exports exactly the ten documented stable functions.
- **PFC-02:** `comp`, `complement`, `constantly`, and `partial` preserve the
  documented argument order, identity cases, and nullish distinctions.
- **PFC-03:** `juxt` evaluates left to right and returns a portable persistent
  Vector in function order.
- **PFC-04:** `fnil` replaces only existing `nil` or `null` positions and
  preserves `undefined` and all other values.
- **PFC-05:** Predicate combinators use Lisp truth, predicate-major order, and
  observable short-circuit evaluation.
- **PFC-06:** `trampoline` completes a 100,000-thunk chain without recursive
  stack growth.
- **PFC-07:** Seed and self-hosted compilers produce byte-identical output for
  the module at the maintained fixed point.
- **PFC-08:** Generated modules produce identical observable results under the
  local Bun and Node hosts.
