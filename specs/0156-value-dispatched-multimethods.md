# 0156: Value-dispatched Multimethods

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-10
- Depends on: 0055 Eliscript-authored Persistent HAMT Map,
  0057 Portable Value Semantics Core,
  0064 Stack-safe Loop and Recur

## Summary

This specification adds first-class multimethod functions to the portable
standard library. A multimethod computes one dispatch value from its complete
argument list, resolves that value through an immutable persistent method
table, and invokes the selected method with the original arguments.

The constructor is `multi-fn`. Its result is an ordinary callable JavaScript
function at the host boundary, so callers do not need a special invocation
form. Method management remains explicit through `add-method!`,
`remove-method!`, and `remove-all-methods!`.

## Identity and Construction

`multi-fn(name, dispatch-function, ...default-options)` accepts a diagnostic
name, one dispatch function, and zero or one default dispatch value. Omitting
the value selects the string `"default"`. Supplying a value preserves it
exactly, including nil or undefined. More than one default value is rejected.

Each result is registered in a module-private `WeakMap`. `multi-fn?` recognizes
only exact registered function identities. Copying properties, creating an
ordinary function, or presenting a hostile object cannot forge a multimethod.
The weak registry does not retain otherwise unreachable functions.

`multi-fn-name`, `dispatch-fn`, and `default-dispatch-value` return the exact
constructor values. Multimethod identity is a host identity and is not part of
canonical persistent data text, value equality, or the Emacs worker value
codec.

## Dispatch

Calling the multimethod performs these steps in order:

1. invoke the dispatch function exactly once with the original arguments
2. look up the resulting value in the current method table
3. if absent, look up the configured default dispatch value
4. invoke the selected method with the original arguments

Method keys use Eliscript value equality and stable hashing. Independently
constructed equal persistent values therefore select the same method. Opaque
host objects and functions retain identity-key behavior through the existing
value model.

`dispatch-value` runs only step 1. `get-method` performs steps 2 and 3 for an
already computed dispatch value and returns nil when neither method exists.
`has-method?` reports whether `get-method` resolves a function.

If no method resolves, the call throws `ELI-MULTI-FN-NO-METHOD` with the
multimethod name and computed dispatch value. Exceptions from dispatch and
method functions retain their original identity and are not wrapped.

## Method State

The method table changes by replacing one immutable Persistent Map root.
`add-method!` requires a function and associates it with a dispatch value.
Adding the same value replaces its method. `remove-method!` removes one exact
value, and `remove-all-methods!` installs a fresh empty table. All three return
the original callable multimethod identity.

`methods` returns the current persistent table root. A previously returned
root remains an immutable snapshot after later additions, replacements,
removals, or clearing. A dispatch observes one current table after its dispatch
function returns; mutation by the selected method affects only later calls.

The implementation does not mutate native prototypes, expose its registry, or
copy the complete method table on reads. Lookup and update inherit the expected
bounded-depth behavior of the persistent HAMT.

## Errors

Multimethod-owned failures are plain inspectable objects with kind
`eliscript/multi-fn-error`, a stable code, message, name, and dispatch value.

| Code | Condition |
| --- | --- |
| `ELI-MULTI-FN-INVALID-REFERENCE` | An operation did not receive a registered multimethod |
| `ELI-MULTI-FN-INVALID-DISPATCH` | The constructor did not receive a dispatch function |
| `ELI-MULTI-FN-INVALID-ARITY` | More than one default dispatch value was supplied |
| `ELI-MULTI-FN-INVALID-METHOD` | A registered method was not a function |
| `ELI-MULTI-FN-NO-METHOD` | Neither an exact nor default method exists |

## Compatibility and Limits

This stable baseline provides exact value dispatch and a default method.
Specification [0157](0157-persistent-dispatch-hierarchies.md) adds derivation
hierarchies, ancestor matching, preferred methods, and explicit ambiguity while
preserving this exact-dispatch behavior. Method combinations, compiler-level
`defmulti` syntax, and metadata on multimethod identities remain outside the
current contract.

## Acceptance Criteria

- **VDM-01:** `multi-fn` creates directly callable, unforgeable identities and
  validates its dispatch function and optional default value arity.
- **VDM-02:** Dispatch functions run exactly once and selected methods receive
  the complete original argument list.
- **VDM-03:** Exact and default lookup work for scalars, nil defaults, and
  independently constructed equal persistent dispatch values.
- **VDM-04:** Add, replace, remove, and clear operations return the original
  identity and publish one new immutable method-table root.
- **VDM-05:** Earlier `methods` results remain unchanged after every later
  method-table mutation.
- **VDM-06:** Invalid references, dispatch functions, arity, methods, and
  missing methods produce deterministic structured codes.
- **VDM-07:** Seed and self-hosted compilers emit byte-identical modules and
  Source Maps, and Bun and Node produce identical reports.
- **VDM-08:** One hundred thousand value-dispatched calls complete with exact
  invocation count and result without stack growth.
