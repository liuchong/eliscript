# 0145: Language Value Equality

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-08
- Depends on: 0003 Core Language v0,
  0048 Value Equality and Deterministic Hashing,
  0057 Portable Value Semantics Core,
  0096 Profile-guided Compiler Runtime Requirement Scan

## Summary

The language intrinsic `equal` exposes canonical Eliscript value equality.
It compares persistent Lists, Vectors, Maps, Sets, Keywords, and Symbols by
recursive value while preserving identity semantics for opaque JavaScript
objects. `eq` remains the explicit identity predicate.

Seed and self-hosted compilers emit the same runtime call and link its runtime
module only when a live `equal` expression requires it. The contract is
verified directly with local Emacs, Bun, Node, and filesystem commands; no
hosted service, container, virtual machine, sandbox, application framework, or
publishing system contributes acceptance evidence.

## Predicates

`(eq left right)` evaluates both operands once, from left to right, and returns
the result of strict JavaScript identity comparison. Distinct persistent values
therefore remain non-identical even when their contents are equal.

`(equal left right)` evaluates both operands once, from left to right, and calls
the canonical `equalValues(left, right)` runtime operation defined by 0048. Its
observable rules include:

- scalar categories never coerce across type boundaries
- all NaN values compare equal and signed zeroes compare equal
- persistent values compare recursively by their logical values
- Map and Set equality is independent of insertion order
- metadata is excluded from equality
- native arrays, objects, functions, and other opaque host values compare only
  by identity

`=` is not an alias for `equal`; it retains the core language's n-ary strict
comparison behavior. `/=` and `not=` retain their existing distinct-comparison
behavior.

## Generated Runtime Boundary

A generated module containing a live `equal` intrinsic imports exactly:

```javascript
import { equalValues as __eliscript_equal } from "eliscript/runtime/core/value.mjs";
```

The import appears at most once per module. An `eq`-only module does not link
the value runtime. Quoted data containing the symbol `equal` does not link it
either. The compatibility emitter, direct IR emitter, and self-hosted emitter
must agree on these rules and produce byte-identical JavaScript where their
existing parity contract applies.

Portable functions may call `equal`. Their generated closure uses the same
package runtime boundary and has the same value semantics under Bun and Node.

## Acceptance Criteria

- **LVE-01:** `eq` keeps strict identity semantics and does not link the value
  runtime by itself.
- **LVE-02:** `equal` links one value runtime import and emits one canonical
  `equalValues` call per source occurrence.
- **LVE-03:** Independently constructed nested persistent values compare equal,
  including insertion-order-independent Map and Set values.
- **LVE-04:** Distinct native containers compare unequal while repeated
  references to one native container compare equal.
- **LVE-05:** NaN and signed-zero behavior matches 0048.
- **LVE-06:** Seed and self-hosted ESM plus Source Map output are byte-identical
  for the maintained equality fixture.
- **LVE-07:** Bun and Node execute the maintained fixture with identical results.
- **LVE-08:** The default core suite runs all evidence directly on the local
  machine.
