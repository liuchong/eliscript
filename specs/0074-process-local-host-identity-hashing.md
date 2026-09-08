# 0074: Process-local Host Identity Hashing

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0048 Value Equality and Deterministic Hashing,
  0057 Portable Value Semantics Core,
  0067 First-class Keyword and Symbol Values

## Summary

This specification gives opaque JavaScript objects, functions, and native
Symbols efficient identity hashes in portable Eliscript. It replaces the
previous host-type fallback, where every object of one host category shared a
hash and persistent Map/Set operations could degrade to a linear collision
scan.

The compiler adds one narrow mechanism form, `host-identity-token(value)`.
`stdlib/value.eli` remains responsible for value policy: it mixes the token
with the existing host-identity tag and hash finalizer. Equality remains strict
JavaScript identity for opaque host values.

## Compiler Mechanism

`host-identity-token` accepts exactly one argument. A generated module that
uses the form receives one private helper containing:

- a WeakMap for non-null objects and functions
- a Map for native Symbols, which cannot be WeakMap keys
- a positive safe-integer counter beginning at one

The helper is omitted from generated modules that do not use the form. Seed
and self-hosted emitters produce the same helper bytes and Source Map offsets.

For one module instance:

- repeated calls for the same identity return the same token
- distinct live identities receive distinct tokens until the safe-integer
  space is exhausted
- object and function entries do not prevent garbage collection
- native Symbol entries remain strongly held for the module lifetime because
  JavaScript has no weak map for Symbol primitives
- null and scalar string, number, boolean, BigInt, and undefined values throw a
  TypeError when passed directly
- safe-integer exhaustion throws a RangeError rather than reusing an identity

Tokens are process-local mechanism values. They are not deterministic across
module instances, process starts, or encounter orders, and they are not a
serialization format or a public identifier.

## Value Hash Policy

`value-hash` applies identity hashing only to opaque host identities. Scalar,
Keyword, Eliscript Symbol, List, Vector, Map, and Set hashes retain their
existing deterministic contracts. Native JavaScript Symbols use identity
hashing; logical Eliscript Symbols continue to hash their namespace and name.

The host token is reduced to an unsigned 32-bit word and mixed through the
existing host tag and finalizer. Hash collisions remain valid and never imply
equality, but sequentially encountered host objects no longer collapse into a
single type-level collision group.

Host identity hashes are intentionally not stable data. Canonical data text,
worker codecs, cache keys persisted across processes, and reproducible build
artifacts must not serialize or compare their numeric values. A persistent
Map or Set keeps the exact `value-hash` and `value-equal?` policy function
identities it was created with, so all lookups within that collection observe
one module-local token table.

## Complexity and Retention

Expected token lookup and assignment are O(1). Persistent Map/Set operations
with ordinary identity keys return to expected HAMT depth rather than a
type-wide O(n) collision group. Object/function token storage is weak and
proportional only to reachable keys. Native Symbol storage is O(s) for the
number of Symbols hashed during the module lifetime.

The token counter can exceed 32 bits while hashes remain 32-bit values.
Different tokens can therefore eventually share a hash, as allowed by the
general collision contract. Token identity itself is not exposed by the
standard library.

## Acceptance Criteria

- **HIH-01:** `host-identity-token` is available to ordinary and portable
  functions through seed and self-hosted analyzer/lowerer paths.
- **HIH-02:** The form accepts exactly one argument and rejects unsupported
  arities during compilation.
- **HIH-03:** Generated modules inject the private helper only when the form is
  present.
- **HIH-04:** One object or function receives a stable token and distinct
  identities receive distinct tokens.
- **HIH-05:** Native Symbols use stable identity tokens without being confused
  with value-semantic Eliscript Symbols.
- **HIH-06:** `value-equal?` retains strict host identity and every equal host
  value has an equal hash.
- **HIH-07:** At least 20,000 opaque objects produce 20,000 distinct hashes and
  remain independently retrievable as value Map keys and Set members.
- **HIH-08:** Seed/self-hosted JavaScript and Source Maps are byte-identical;
  Bun and Node execute the same host-identity report.
- **HIH-09:** Existing frozen scalar, identifier, and persistent collection
  hashes do not change.
- **HIH-10:** Public-surface, compatibility, conformance, build, and
  documentation contracts track the mechanism and policy.

## Deferred Work

Cross-realm identities already work because WeakMap keys are not realm-bound.
Cross-worker identity, distributed identity, persisted identity hashes,
weakly retained native Symbols, and attacker-resistant keyed hashing are
separate problems and are not implied by this process-local mechanism.
