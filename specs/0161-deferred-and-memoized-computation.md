# 0161: Deferred and Memoized Computation

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-10
- Depends on: 0003 Functions and Lexical Bindings,
  0015 Nullish Value Semantics,
  0053 Eliscript-authored Persistent Vector,
  0055 Eliscript-authored Persistent Map,
  0057 Portable Value Semantics Core

## Summary

Eliscript provides synchronous delayed computation and value-semantic function
memoization as ordinary standard-library behavior. The feature adds no syntax,
compiler intrinsic, asynchronous scheduler, framework dependency, or ambient
I/O capability.

The public module is `stdlib/deferred.eli`. It exports exactly:

```text
delay delay? force memoize realized?
```

## Delay

`delay` accepts a zero-argument producer function and returns a frozen Delay
reference. Construction does not invoke the producer. `delay?` recognizes only
references registered by the defining module; matching properties or a copied
tag cannot forge a Delay.

`force` invokes an unrealized Delay producer synchronously and returns its
result. A successful result is retained exactly once, including `nil`,
JavaScript `undefined`, `false`, zero, and the empty string. Later calls return
the identical retained value without invoking the producer again. Passing a
non-Delay value to `force` returns that value unchanged.

`realized?` reports whether a registered Delay completed successfully. It is
false before the first successful force, after a producer failure, and for a
non-Delay value.

The state machine has `pending`, `running`, and `realized` states. A producer
failure restores `pending` and rethrows the original error, so the next force
retries. Forcing the same Delay recursively while its producer is running
throws `ELI-DEFERRED-REENTRANT-FORCE`; the outer force then restores `pending`.
An invalid producer throws `ELI-DEFERRED-INVALID-PRODUCER` at construction.

`delay` is a function rather than syntax: callers pass an explicit thunk. This
keeps evaluation boundaries visible and reserves future delayed-expression
syntax for a separate language contract.

## Memoization

`memoize` accepts a function and returns a function with the same variadic call
shape. Each argument list is converted to a persistent Vector and used as a key
in a persistent value Map. Keys therefore use Eliscript value equality and
hashing: independently constructed equal persistent values share a cache entry,
while host objects and functions retain identity semantics.

Successful return values are cached even when they are nullish or Lisp-false.
Thrown errors are not cached because association occurs only after the wrapped
call returns. The cache is private to one memoized function, grows with distinct
argument vectors, and exposes no mutation API. An invalid wrapped value throws
`ELI-DEFERRED-INVALID-FUNCTION` at construction.

## Host Boundary And Complexity

Delay and memoization are synchronous. They provide no Promise adaptation,
cross-process sharing, eviction policy, clock access, cancellation, or
thread-safety guarantee. Those concerns require separate explicit host
capabilities.

Delay construction and realized access are constant time. First force costs the
producer plus constant state work; repeated force is constant time. Memoized
lookup and insertion inherit persistent HAMT behavior and additionally hash and
compare the argument Vector and nested persistent values. Storage is linear in
distinct successful argument vectors.

## Acceptance Criteria

- **DMC-01:** The module exports exactly the five documented functions and is
  included in the generated standard-library API index.
- **DMC-02:** Delay construction is lazy, successful force runs once, and every
  nullish or Lisp-false result is retained without sentinel ambiguity.
- **DMC-03:** Delay references are frozen and registered by module-private
  identity so a property-compatible object is not accepted.
- **DMC-04:** Producer failures restore `pending`, preserve the original error,
  and remain retryable; recursive force produces the documented error code.
- **DMC-05:** `force` passes non-Delay values through and `realized?` returns
  false for non-Delay values.
- **DMC-06:** Memoization uses persistent value semantics for complete argument
  vectors and caches nullish and Lisp-false successful values.
- **DMC-07:** Memoized failures are not cached and invalid construction inputs
  produce the documented structured error codes.
- **DMC-08:** Seed and self-hosted compilers produce byte-identical module
  output, and the maintained execution fixture agrees under Bun and Node.
