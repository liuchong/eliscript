# 0072: Atomic State References

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0038 Exception Control Flow, 0041 Host Symbiosis,
  Persistent Data, and Emacs Acceleration, 0057 Portable Value Semantics Core

## Summary

This specification defines Eliscript's first explicit time-varying identity:
the Atom. An Atom holds one current value while persistent collections remain
immutable facts. It supports synchronous reads and transitions, transition
validators, and post-commit watches on the single-threaded JavaScript event
loop.

The implementation is authored in Eliscript at `stdlib/state/atom.eli`. It
uses closure-owned state, a persistent value Map for watch registrations, and
a persistent Vector for queued notifications. A module-private host `WeakSet`
authenticates Atom identities without retaining unreachable references. There
is no custom JavaScript Atom class, and the source compiles byte-identically
with the seed and self-hosted compilers.

## Public Surface

The module exports:

```text
atom atom? deref reset! swap!
add-watch remove-watch
get-validator set-validator!
```

`atom` accepts an initial value and an optional object with one supported
own property, `validator`. Unknown own properties and non-function validators
are rejected. Inherited properties are ignored. A validator may be nil.

An Atom is an opaque host identity. `atom?` checks exact membership in the
module-private `WeakSet`. Copying visible Atom properties, supplying a forged
identity callback, or wrapping a similar object does not create another Atom.

## State Operations

`deref` returns the current value without copying it.

`reset!` validates and commits one candidate value, then returns that value.
`swap!` calls a function once with the current value followed by any supplied
arguments, validates the result, commits it, and returns it. A failed function
or validator leaves the current value unchanged.

Eliscript runs these operations synchronously. There is no implicit Promise
waiting, retry loop, compare-and-set operation, or cross-worker synchronization
in this contract.

## Validators

A non-nil validator is called before the initial value is accepted and before
every later commit. Eliscript truth semantics apply to its result. A false
result throws an Atom error with code `ELI-ATOM-VALIDATION`; an exception from
the validator is propagated unchanged. Both paths leave the state untouched
and emit no watch notification.

`set-validator!` first checks the current value with the candidate validator.
The candidate is installed only after that check succeeds. A rejected or
throwing candidate leaves the previous validator installed. `get-validator`
returns the installed validator or nil.

The implementation marks validator and swap-function execution as transition
phases. A `reset!`, `swap!`, watch registration change, or validator change on
the same Atom during either phase is rejected with
`ELI-ATOM-REENTRANT`. `deref` remains valid, so a callback may inspect the
current pre-transition value. This rule prevents stale outer writes and
partially installed validator changes.

## Watches and Nested Transitions

`add-watch` associates a key with a callback. An equal key replaces its prior
callback. `remove-watch` removes the equal key. Both return the Atom. A watch
receives:

```text
key, atom, old-value, new-value
```

Watches run only after the new value is committed. Each committed transition
captures the persistent watch Map that existed at commit time. Registration
changes during one notification therefore affect later transitions, not the
current transition.

A watch may synchronously change the same Atom. The nested value is committed
immediately, but its notification is appended to the Atom's queue. Every watch
for the outer transition finishes before any watch for the nested transition
runs. This produces one total commit order without recursive notification
stack growth.

Watch failures are isolated while the queue drains. All watches and already
queued transitions still receive their committed notifications. After the
queue is restored to its idle state, the first watch error is rethrown
unchanged. The committed value is never rolled back, and a later transition
can use the Atom normally.

## Errors

Atom-owned failures throw an object with:

```text
{ kind: "eliscript/atom-error", code: string, message: string }
```

The implemented codes are:

| Code | Meaning |
| --- | --- |
| `ELI-ATOM-INVALID-REFERENCE` | An operation did not receive an Atom |
| `ELI-ATOM-INVALID-OPTIONS` | Options are not an object/nil or contain an unknown key |
| `ELI-ATOM-INVALID-VALIDATOR` | A validator is neither a function nor nil |
| `ELI-ATOM-INVALID-TRANSFORM` | `swap!` did not receive a function |
| `ELI-ATOM-INVALID-WATCH` | `add-watch` did not receive a function |
| `ELI-ATOM-VALIDATION` | A validator returned false |
| `ELI-ATOM-REENTRANT` | A callback attempted a conflicting same-Atom transition |

Exceptions originating in user validators, swap functions, or watches retain
their original identity. Callers can therefore distinguish library contract
failures from application failures.

## Value Boundary

Atom state should ordinarily be an immutable scalar, identifier, persistent
collection, or an immutable graph composed from them. The Atom does not clone
or freeze opaque JavaScript values. Storing a mutable host object makes later
host mutation observable and lies outside the immutable-state guarantee.

An Atom itself is not a persistent value. It uses host identity equality, is
not canonically hashable or printable, cannot cross the worker value codec,
and must not appear in portable function input or output. Applications send a
snapshot obtained through `deref` when a supported immutable value needs to
cross a host boundary.

## Complexity

| Operation | Cost |
| --- | --- |
| `atom`, `deref`, validation without user work | O(1) |
| `reset!`, `swap!` without watches | O(1) plus user function/validator |
| `add-watch`, `remove-watch` | expected O(log32 w) |
| notify one transition | O(w) plus callback work |
| nested notification queue append/read | O(log32 q) worst case |

`w` is the number of registered watches and `q` is the number of queued nested
transitions. Updates with no watches do not allocate notification nodes.

## Acceptance Criteria

- **ASR-01:** The complete public API is authored in `.eli`, uses only a host
  `WeakSet` for identity registration, and has no runtime Atom class dependency.
- **ASR-02:** `reset!` and variadic `swap!` make exactly one validated commit
  and return the committed value.
- **ASR-03:** Failed and throwing validators preserve the old state, install no
  replacement validator, and emit no watch event.
- **ASR-04:** Swap and validation reentrancy on the same Atom is rejected
  without a stale outer commit.
- **ASR-05:** Watches observe committed old/new pairs, use commit-time
  registration snapshots, and replace equal keys.
- **ASR-06:** Nested watch transitions notify in commit order without recursive
  notification interleaving.
- **ASR-07:** Watch exceptions preserve their identity, do not skip other
  registered watches, and leave the notification queue reusable.
- **ASR-08:** Forged and hostile objects are not accepted as Atoms.
- **ASR-09:** Generated operation histories agree with a simple reference
  state model, and 100,000 sequential swaps remain stack safe.
- **ASR-10:** Seed/self-hosted artifacts and source maps are byte-identical;
  Bun and Node reports agree for both generations.
- **ASR-11:** Public-surface, compatibility, conformance, standard-library
  build, and default test contracts track the module.

## Deferred Work

This specification does not add asynchronous swaps, compare-and-set,
software transactional memory, agents, history retention, worker-shared
state, or serialization. Any such facility needs a separate ordering and
failure contract. Final PD-11 acceptance still requires the unified 1.0
acceptance manifest; this implementation supplies its core executable state
evidence but does not by itself complete the project-wide gate.
