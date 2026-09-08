# 0075: Portable Result Values

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0021 Portable Functions and Dependency Closure,
  0053 Eliscript Persistent Vector,
  0057 Portable Value Semantics Core

## Summary

This specification adds immutable success/failure data to the Eliscript core
library. A Result is ordinary persistent data rather than a JavaScript class or
an identity-bearing exception. It composes with recursive value equality,
hashing, Map/Set keys, metadata, canonical data text, portable closure
selection, and worker transport without a new runtime representation.

`stdlib/result.eli` owns constructors, predicates, branch transforms,
sequencing, fallback extraction, and stack-safe persistent-Vector traversal.
Every implementation function is `defportable`; the module has no raw
JavaScript, host method, exception, asynchronous, or mutable-container
dependency.

## Data Representation

One Result is a value-semantic persistent Map with exactly three string keys:

```text
{"kind" "eliscript/result", "status" "ok",    "payload" value}
{"kind" "eliscript/result", "status" "error", "payload" error}
```

The representation is deliberately inspectable and reconstructible. It is not
an unforgeable nominal brand. `result?` accepts only a persistent Map with the
exact field count, kind, supported status, and explicit payload key. Metadata
does not change the field count or value identity.

The payload is always present. `false`, `nil`, and `undefined` are valid and
remain distinguishable under the existing value contract. `result-payload`
returns the payload of a valid Result and `nil` for a non-Result.

`ok`, `err`, `result?`, `ok?`, and `err?` establish this data boundary. Result
constructors allocate persistent Maps through `value-map-from-entries`, so two
independently reconstructed Results with equal payloads are equal, have equal
hashes, and are interchangeable as persistent Map keys.

## Branch Operations

The module exports these branch operations:

- `map-ok(function, result)` transforms only an Ok payload and wraps it in Ok
- `map-err(function, result)` transforms only an Err payload and wraps it in Err
- `and-then(function, result)` invokes the function only for Ok and returns its
  Result directly
- `or-else(function, result)` invokes the function only for Err and returns its
  Result directly
- `fold(ok-function, error-function, result)` reduces one valid Result to an
  arbitrary value
- `unwrap-or(fallback, result)` returns the Ok payload or the eager fallback
- `unwrap-or-else(function, result)` computes a fallback only for Err

Inactive `map-ok`, `map-err`, `and-then`, and `or-else` branches return the
exact input Result by identity and never call their function. Active callbacks
execute exactly once. Callback exceptions are not caught or converted; a
Result represents explicit domain failure and does not hide programming or
host failures.

For a non-Result, predicates return false, `result-payload` and `fold` return
nil, transforms and sequencing return the input unchanged, `unwrap-or` returns
its fallback, and `unwrap-or-else` calls its fallback function with nil. This
total behavior is a defensive boundary, not an alternative way to construct a
Result.

## Persistent Vector Operations

`collect-results(results)` accepts a persistent Vector of Results. It returns
Ok containing a persistent Vector of payloads when every item is Ok. At the
first non-Ok item it returns that exact item by identity and inspects no later
item.

`traverse-results(function, values)` invokes the function once per persistent
Vector item in source order. Successful payloads accumulate into a persistent
Vector. The first non-Ok callback result is returned by identity and no later
callback runs.

Both functions are iterative and use persistent Vector operations. They do not
recurse with input size. A non-Vector source returns nil. This keeps the first
portable surface representation-specific and leaves protocol-generic traversal
for the portable-dispatch continuation.

## Portability and Dependency Closure

The dependency graph is:

```text
result -> persistent-vector
       -> persistent-map -> bit
       -> value -> identifier/list/vector/map/set/bit
```

Ordinary project builds emit the complete graph. Portable selection starts at
one exported Result operation and keeps only its transitive declarations and
imported names. Selecting `unwrap-or`, for example, excludes mapping, batch
collection, and traversal bodies.

Seed and self-hosted compilers emit byte-identical JavaScript and Source Maps
for the complete graph. Bun and Node execute the same report. A 50,000-item
traversal proves stack safety and complete execution; a second traversal proves
exact first-error termination.

## Compatibility and Limits

The representation, 15 exports, branch behavior, and traversal failure policy
are stable. Incompatible changes require the compatibility process rather than
an in-place naming, representation, or error-policy revision.

This slice does not add exception capture, Promise composition, cancellation,
protocol-generic sources, an error hierarchy, a JavaScript class, or Result
literal syntax. JSON codecs may represent this value as an ordinary Map only
through an explicit persistent/native conversion policy.

## Acceptance Criteria

- **RSL-01:** Ok and Err are exact three-field persistent Maps with explicit
  payload presence and no host identity.
- **RSL-02:** Predicates distinguish Ok, Err, ordinary Maps, and malformed
  records while preserving false, nil, and undefined payloads.
- **RSL-03:** Reconstructed equal Results have equal hashes and are
  interchangeable persistent Map keys.
- **RSL-04:** `map-ok` and `map-err` execute only the selected callback once and
  preserve inactive-branch identity.
- **RSL-05:** `and-then` and `or-else` flatten exactly one selected Result layer
  and preserve inactive-branch identity.
- **RSL-06:** `fold`, `unwrap-or`, and `unwrap-or-else` select exactly one
  branch without truthiness loss.
- **RSL-07:** `collect-results` preserves order and returns the first non-Ok
  item by identity.
- **RSL-08:** `traverse-results` completes 50,000 items without stack growth and
  stops at the exact first non-Ok callback result.
- **RSL-09:** Seed/self-hosted ESM and Source Maps are byte-identical, and Bun
  and Node produce the same report.
- **RSL-10:** A portable project build prunes unselected Result operations, and
  public-surface, compatibility, conformance, documentation, build, and full
  repository contracts include the module.
