# 0166: Persistent Queue

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-10
- Depends on: 0047 Persistent Vector Trie Prototype,
  0059 Collection Capability Protocols and Reduction Foundation,
  0068 Immutable Metadata Semantics,
  0165 Persistent Subvector Views

## Summary

Eliscript provides a first-class immutable FIFO Queue for persistent worklists,
schedulers, breadth-first traversal, and producer/consumer state. The runtime
exports `EMPTY_QUEUE`, `PersistentQueue`, `persistentQueue`, and
`isPersistentQueue` from `runtime/core/queue.mjs`. The maintained language API
is `stdlib/persistent-queue.eli`, and `queue?` joins the core collection
classification predicates.

## Representation

Every non-empty Queue contains:

- a non-empty persistent Vector or subvector view holding values ready to
  leave from the front;
- a persistent Vector holding values appended at the rear;
- a cached total count and immutable metadata.

The empty Queue contains two canonical empty Vectors. Its count is zero.
For every non-empty Queue, `front.count + rear.count` equals the Queue count.
These invariants are validated by the private constructor boundary.

Appending the first value creates a one-value front Vector. Later appends
update the rear Vector and retain the front by identity. Removing a value moves
the front boundary with an O(1) flattened subvector view. When the last front
value leaves, the rear Vector is promoted by identity to become the next front,
and the rear becomes empty. Promotion performs no traversal and allocates no
persistent Vector nodes. Old Queue values remain unchanged throughout.

## Semantics

`conj` appends at the rear. `peek` returns the oldest retained value, or its
optional fallback for an empty Queue. `pop` removes the oldest value and fails
on an empty Queue. Iteration, `seq`, and reduction visit values in FIFO order.

Queue values implement `ICounted`, `IEmptyable`, `IConj`, `IStack`, `ISeqable`,
and `IReduce`. They are collections and sequential values, but they are not
indexed values or sequence nodes. Equality and hashing are ordered and apply
only between Queue values. Metadata does not affect equality or hashing and is
preserved by `conj`, `pop`, and `empty`.

The language module exports constructor, classification, count, empty, append,
front, removal, reduction, array conversion, and metadata operations under the
`persistent-queue-*` namespace. Native JavaScript Arrays are never treated as
Queues.

## Complexity

For Queue size `n`, rear size `r`, and Vector depth `d = O(log32 r)`:

| Operation | Time | Structural behavior |
| --- | --- | --- |
| count, empty?, peek | O(1) | no allocation |
| conj | amortized O(1), worst O(d) | shares front and unmodified Vector nodes |
| pop with remaining front | O(1) | creates a flattened view and shares all nodes |
| pop requiring front promotion | O(1) | promotes rear by identity with no node allocation |
| iteration, seq, reduce | O(n) | no persistent collection allocation |
| with-meta | O(1) | shares front and rear |

Rear promotion is constant-time. Enqueue inherits the persistent Vector's
amortized constant-time tail append and logarithmic trie-boundary worst case;
dequeue remains constant-time in all cases while retaining immutable historical
versions.

## Boundaries

Specification 0167 adds `(queue ...)`, `#queue [...]`, and canonical Queue data
text. Queue still has no implicit host-container conversion. JSON, worker
transport, portable closures, and JavaScript conversion must reject or handle
it through their explicit extension boundaries until separately specified.
The structure has no framework, I/O, publishing, or host-global dependency.

## Acceptance Criteria

- **PQU-01:** Runtime and Eliscript surfaces construct, classify, append, peek,
  pop, count, reduce, convert, and preserve Queue metadata consistently.
- **PQU-02:** Core collection protocols classify Queue as a sequential
  collection but not an indexed collection or sequence node.
- **PQU-03:** Value equality and hashing are deterministic, ordered, metadata
  independent, and restricted to Queue values.
- **PQU-04:** Append and pop retain all unaffected Vector structure; old Queue
  values never mutate.
- **PQU-05:** Front exhaustion promotes the rear by identity without traversal
  or persistent node allocation; following pops use flattened subvector views.
- **PQU-06:** A deterministic randomized model and a one-million-value case
  preserve FIFO order, cached counts, iterative traversal, and bounded stack.
- **PQU-07:** The runtime and compiled language API produce identical local Bun
  and Node results.
