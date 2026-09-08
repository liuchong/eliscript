# 0038: Exception Control Flow

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0001 Language and Toolchain Boundary, 0004 Lexical Analysis,
  0007 Intermediate Representation, 0037 Async Functions and Await

## Summary

Eliscript provides expression-valued JavaScript exception control without a
raw `js*` escape:

```elisp
(defasync load-json (url)
  (try
    (let ((response (await (fetch url))))
      (await (js-call response :json)))
    (catch error
      (js-object :ok false :message (get error :message "unknown")))
    (finally
      (print "request finished"))))
```

`throw` accepts exactly one expression, evaluates it once, and raises that
exact JavaScript value. It is valid in synchronous and asynchronous functions.

## Try Grammar

The form grammar is:

```elisp
(try body...
  (catch binding catch-body...)?
  (finally finally-body...)? )
```

At least one of `catch` or `finally` is required. Each clause may occur at most
once, `catch` must precede `finally`, and all ordinary body forms must precede
the clauses. An empty try, catch, or finally body is valid and has a normal
value of `nil` where that value is observed. `catch` and `finally` are reserved
clauses and are rejected as standalone expressions.

The catch binding may be a symbol, vector pattern, or map pattern. It is mutable,
visible only in the catch body, may shadow outer names, and participates in
normal duplicate and output-name collision validation. The finally body uses
the surrounding scope; catch bindings are not visible there. Vector behavior
is defined by [0039-vector-binding-patterns.md](0039-vector-binding-patterns.md)
and [0148-map-binding-patterns.md](0148-map-binding-patterns.md).

## Value and Completion Semantics

On normal completion, `try` produces the final value of its body. If the body
throws and a catch clause exists, the catch binding receives the thrown value
and the form produces the catch body's final value.

`finally` always runs after either path. Its ordinary value is discarded, so a
normal finally clause preserves the try or catch result. A throw or rejected
await from finally replaces the pending result, following native ECMAScript
completion semantics. A try with only finally propagates any original throw.

## Async Clauses

`await` keeps its lexical function rule and may appear in any try, catch, or
finally body enclosed by an async function. Since JavaScript statements are
needed to express try blocks, the emitters use a generated IIFE. They inspect
the complete exception node within the current function boundary and make that
IIFE async only when one of its clauses suspends; the invocation is then
awaited. Nested user functions are not scanned through.

`throw` evaluates its operand outside its tiny throwing closure. This keeps an
await operand in the enclosing async context and avoids creating an accidental
synchronous boundary.

## Intermediate Representation

Five public IR kinds represent the feature:

- `throw-expression` owns its single value child.
- `try-expression` stores direct body children followed by clauses and records
  `bodyCount`.
- `catch-clause` owns one `catch-binding` child followed by body expressions.
- `catch-binding` retains the narrow source span of its symbol or pattern and
  owns structural pattern IR when needed.
- `finally-clause` owns its body expressions.

The compatibility round trip reconstructs canonical `try`, `catch`, `finally`,
and `throw` forms. The self-hosted JSON representation carries the equivalent
camel-case property and the same node ordering.

## Portable Boundary

The current `defportable` subset rejects both `throw` and `try` as exception
control flow. Worker failures already cross a structured protocol boundary,
but admitting user-thrown values requires a separate serialization contract
that distinguishes language values from host errors and preserves mapped
locations. Catching and throwing can be added to the portable subset after
that boundary is specified.

## Acceptance Evidence

- ERT checks analysis diagnostics, lexical catch scope, all five IR kinds,
  compatibility round trips, async wrapper emission, and byte-identical seed
  backends.
- Shared fixtures compare macro expansion, exact diagnostics, complete IR,
  JavaScript, and Source Maps across seed and self-hosted compilers.
- The bootstrap compiler reproduces its next generation byte-for-byte.
- CLI integration executes synchronous recovery, rejected Promise recovery,
  finally result preservation, cleanup side effects, and rethrowing with Bun.
