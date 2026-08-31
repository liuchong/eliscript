# 0053: Eliscript-authored Persistent Vector Trie

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0021 Portable Functions and Dependency Closure,
  0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0047 Persistent Vector Trie Prototype,
  0052 Portable 32-bit Integer Operations

## Summary

This specification moves the 32-way persistent vector algorithm across the
implementation-language boundary. `stdlib/persistent-vector.eli` implements
the trie, short tail, path copying, root growth and collapse, indexed lookup,
updates, reduction, and explicit array conversion entirely in portable
Eliscript.

The module does not import or wrap `runtime/core/vector.mjs`. It uses no
`js*`, `js-call`, `new`, `put`, mutation helper, or host-specific API. The
Emacs Lisp seed compiler and the self-hosted Eliscript compiler produce
byte-identical ESM and Source Maps from the same source. The generated module
then behaves identically under Bun and Node.js.

This is the P0 implementation-language proof required by 0041. It does not
change vector literal behavior, replace the provisional JavaScript runtime,
or freeze the eventual collection protocol API.

## Public Surface

The provisional module exports:

- `empty-persistent-vector()`
- `persistent-vector?(value)`
- `persistent-vector-count(vector)`
- `persistent-vector-meta(vector)`
- `persistent-vector-with-meta(vector, metadata)`
- `persistent-vector-nth(vector, index, not-found)`
- `persistent-vector-conj(vector, value)`
- `persistent-vector-assoc(vector, index, value)`
- `persistent-vector-pop(vector)`
- `persistent-vector-peek(vector, not-found)`
- `persistent-vector-reduce(function, initial, vector)`
- `persistent-vector-to-array(vector)`
- `persistent-vector-from-array(values)`

The explicit fallback parameters keep lookup and peek total inside portable
code. Invalid `nth` indices return `not-found`. Invalid `assoc` indices and
`pop` on an empty vector return `nil`; association at `count` appends. These
provisional failure values may be replaced by diagnosed errors when the stable
collection protocol and literal migration land.

The module accepts non-negative signed 31-bit integer indices and caps count
at 2,147,483,647. Appending at the cap returns `nil`.

## Representation

Each vector is an ordinary generated object with:

```text
kind, count, shift, root, tail, metadata
```

Each internal node is an object containing a `slots` array. Five index bits
select one of 32 slots per level. `shift` begins at five, grows by five when a
root overflows, and shrinks after removal makes the upper level unnecessary.
The tail contains zero to 32 final values.

Arrays and objects are treated as private immutable implementation values.
Every operation constructs replacements and never applies host mutation. The
prototype does not freeze generated objects because host freezing is not a
portable Eliscript primitive; callers must use the exported operations rather
than mutate the provisional representation.

## Algorithm

`conj` copies the bounded tail while it has room. When full, the old tail
becomes a leaf and `vector-push-tail` copies only its insertion path. Root
overflow creates one new root and one path to the previous tail.

`assoc` copies the tail for a tail index or recursively copies exactly one
root-to-leaf path. `pop` shortens a multi-value tail directly; at a leaf
boundary it obtains the preceding leaf as the next tail, removes one path,
and collapses an empty upper root.

`nth` selects the tail in constant time or consumes five index bits at each
trie level. `reduce` walks one leaf chunk at a time instead of performing a
root lookup for every value. `to-array` and `from-array` are explicit shallow
boundary operations; no conversion occurs implicitly at JavaScript calls.

The portable source uses the exact 32-bit operations from 0052 for shift and
mask addressing. Its only array construction primitives are immutable vector
literals, `cons`, `nth`, and `length`. Node and tail copies therefore have a
fixed upper bound of 32 values.

## Complexity and Sharing

For `n` values and depth `d = O(log32 n)`:

| Operation | Time | New trie nodes |
| --- | --- | --- |
| count, peek | O(1) | 0 |
| tail nth | O(1) | 0 |
| trie nth | O(d) | 0 |
| tail assoc/conj | O(32) bounded copy | 0 |
| trie assoc | O(d) | exactly one selected path |
| tail-boundary conj/pop | O(d) | one selected path plus bounded root work |
| reduce | O(n) | 0 trie nodes |

Tests count actual node identities recursively. Updating an internal value in
a one-million-value vector replaces exactly `d` nodes and shares
`node-count - d` nodes. The old and new versions retain their distinct values.

## Bootstrap Role

The module establishes a three-stage implementation path analogous to the
project's compiler bootstrap:

1. Emacs Lisp compiles the portable Eliscript source.
2. The self-hosted Eliscript compiler compiles the same source.
3. Both generated modules execute the same data-structure algorithm under
   independent JavaScript hosts.

The readable portable implementation becomes the semantic oracle for future
optimized runtime nodes, transients, literal construction, and compiler data
structures. Host specialization is allowed only with equivalent conformance
and structural evidence.

## Compatibility

This module and specification are provisional during M8. Existing vector
literals still emit native JavaScript arrays, and `runtime/core/vector.mjs`
continues to own the richer provisional JavaScript-facing API from 0047.

P0 in 0041 is complete after this slice: equality and hashing are frozen,
vector and HAMT layouts are implemented and measured, portable bit operations
exist, and a real trie is authored in Eliscript. P1 remains open for printing,
reading, and complete property evidence across all collection families. Root
metadata and its equality/hash exclusion are now defined by
[0068-immutable-metadata-semantics.md](0068-immutable-metadata-semantics.md).

## Acceptance Criteria

- **EPV-01:** The trie and tail algorithms are authored in one `.eli` module
  without a JavaScript runtime import or host mutation form.
- **EPV-02:** Seed and self-hosted compilers emit byte-identical ESM and Source
  Maps from the module.
- **EPV-03:** Bun and Node.js produce identical reports from both compiler
  outputs.
- **EPV-04:** Construction, lookup, association, append, pop, peek, reduction,
  and conversion cross tail and root-depth boundaries correctly.
- **EPV-05:** Twenty thousand generated updates agree with a mutable reference
  model while retained previous versions remain unchanged.
- **EPV-06:** A one-million-value vector has the documented four-node lookup
  depth, preserves exact values, and copies only the selected association path.
- **EPV-07:** Public-surface, conformance, compatibility, build, and test
  registries include the module and its evidence.
