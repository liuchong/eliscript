# 0037: Async Functions and Await

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0001 Language and Toolchain Boundary, 0004 Lexical Analysis,
  0007 Intermediate Representation, 0036 Function Parameters

## Summary

Eliscript supports JavaScript-compatible asynchronous functions and explicit
Promise suspension without requiring raw JavaScript.

```elisp
(defasync load-json (url)
  (let ((response (await (fetch url))))
    (await (js-call response :json))))

(defconst load-later
  (async (url) (await (load-json url))))
```

`defasync` is the named form. `async` is the anonymous form and has the same
parameter grammar as `lambda`, including `&optional` and `&rest`. Calling either
form immediately returns a Promise. The final body value resolves that Promise;
an empty body resolves to `null`.

## Await Context

`await` accepts exactly one expression and is legal only inside the nearest
enclosing asynchronous function. It is rejected at module top level and inside
ordinary `defun`, `defn`, `lambda`, and `fn` bodies.

A normal function nested inside an async function starts a new synchronous
function boundary, so it cannot inherit permission to suspend:

```elisp
(defasync outer (promise)
  (lambda () (await promise))) ; rejected
```

An explicitly nested `async` form establishes a new asynchronous boundary.
This lexical rule catches invalid JavaScript before lowering and preserves an
exact filename, line, and column diagnostic in both compiler generations.

Top-level await remains outside the current module contract. Module
initialization that needs suspension can export or invoke an async function
explicitly.

## Intermediate Representation

Named and anonymous function nodes carry an `async` boolean property. Their
parameter and body layout is unchanged. `await-expression` is a dedicated IR
node with exactly one expression child.

The compatibility round trip reconstructs `defasync`, `async`, and `await`.
The JSON-safe self-hosted representation uses the equivalent `async` field and
the same `await-expression` node kind.

## Generated Expression Wrappers

Eliscript uses generated IIFEs to preserve value-producing semantics for
multi-form sequences, lexical bindings, loops, and short-circuit forms. A
synchronous generated IIFE would create an accidental function boundary around
an `await`.

Both emitters therefore inspect each generated wrapper for suspension in its
current function only. When needed, the wrapper becomes an async IIFE and its
invocation is awaited. The scan does not cross a user-written function node,
and wrappers without suspension remain synchronous. This preserves behavior
without inserting unnecessary Promise turns.

## Portable Boundary

The current `defportable` subset rejects anonymous async functions and await as
explicit asynchronous host capabilities. A portable function also cannot
depend on a `defasync` declaration because that declaration is an ordinary
non-portable function.

The worker already awaits returned thenables, but portable asynchronous
capabilities need a separate contract for cancellation, timers, filesystem,
and network access before they can be admitted safely.

## Acceptance Evidence

- ERT compares the IR backend with the compatibility emitter, checks async IR
  metadata and round trips, and rejects invalid await scopes and arities.
- Shared fixtures compare macro expansion, exact analyzer diagnostics, complete
  IR trees, ESM, and Source Maps across seed and self-hosted compilers.
- The bootstrap compiler still reproduces its next generation byte-for-byte.
- CLI integration executes named and anonymous async functions with Bun and
  verifies Promise resolution through `let`, `progn`, `while`, optional
  callbacks, and short-circuit forms.
