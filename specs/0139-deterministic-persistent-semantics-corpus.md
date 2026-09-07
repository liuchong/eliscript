# 0139: Deterministic Persistent Semantics Corpus

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-08
- Depends on: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0048 Value Equality and Hashing, 0078 Persistent Collection Core Exit Audit

## Summary

Eliscript owns a deterministic model-based corpus for the complete persistent
List, Vector, Map, and Set family. The acceptance run executes 100,000
independently replayable operation sequences for each family, compares every
current value with a simple mutable reference model, and verifies every retained
older version after each update.

The corpus closes PD-01. It supplements the million-value structural bounds,
collision fixtures, transient safety, and value equality gates; it does not
replace them. No application framework, bundler, publishing system, site,
hosting service, or development server contributes evidence.

## Deterministic Corpus

Version 1 uses unsigned 32-bit xorshift generation with seed `0x50443031`.
Each sequence derives an independent nonzero seed from the global seed, family
tag, and zero-based sequence number. A failure can therefore be replayed without
executing any preceding sequence:

```sh
bun tools/collections/persistent-semantics.mjs \
  --family map --sequence 731 --sequences 1000
```

The canonical acceptance corpus executes, in fixed family order:

| Family | Sequences | Updates per sequence | Total updates | History checks |
| --- | ---: | ---: | ---: | ---: |
| List | 100,000 | 8 | 800,000 | 3,600,000 |
| Vector | 100,000 | 8 | 800,000 | 3,600,000 |
| Map | 100,000 | 8 | 800,000 | 3,600,000 |
| Set | 100,000 | 8 | 800,000 | 3,600,000 |
| **Total** | **400,000** | - | **3,200,000** | **14,400,000** |

Every sequence starts from the canonical empty value. It retains the value and
canonical model snapshot before every update, applies one generated operation,
checks all retained snapshots again, and validates the resulting value through
all maintained observers. Sequence state is bounded by its eight updates, and
SHA-256 summaries are accumulated incrementally rather than retaining corpus
events in memory.

## Operation Coverage

List sequences generate `conj`, `cons`, `rest`, and `pop`, including rejected
empty `pop`. Every result validates count, size, emptiness, first, peek, indexed
fallback, every valid index, reduction, iteration, and array conversion.

Vector sequences generate `conj`, indexed `assoc`, append-position `assoc`, and
`pop`, including rejected empty `pop`. Every result validates count, size, peek,
indexed fallback, every valid index, reduction, iteration, and array conversion.

Map sequences generate `assoc` and `dissoc` over nullish values, NaN, signed
zero, integers, strings, and a maintained pair of full-hash-collision strings.
Every result validates count, size, lookup, membership, entries, keys, values,
reduction, iteration, and native Map conversion. The reference model explicitly
uses Eliscript scalar equality, including equal NaN and equal signed zero.

Set sequences generate `conj`, `disj`, `union`, `intersection`, and `difference`
over the same key domain. Every result validates count, size, membership,
entries, keys, values, reduction, iteration, native Set conversion, subset,
superset, and disjoint predicates.

Static constructors, metadata, protocol dispatch, equality, hashing, transient
ownership, and structural complexity remain covered by their dedicated gates.

## Frozen Identity

The default corpus has these normative version 1 summaries:

| Scope | SHA-256 |
| --- | --- |
| List | `d91f9122800b989707dfd75edabb2a7b69a2061d4af61d44ba33bf23aa0b7185` |
| Vector | `a6907f86489049e5430d4cd3f738db0a25236f81a251385d0d01c56251d5e26b` |
| Map | `db555364b6f8e7af72d0cb951498e189e729a273fb4224fc134e4f97b40ab911` |
| Set | `7e72dc7c20e73f85daa236da70ead86f417fd7530158ce71418a70b3557e7572` |
| Complete report | `7399e57850b30051c93216d1ad85390de1ead7d86853a5c97d929f6006991bb9` |

The maintained test freezes the exact per-operation invocation counts as well
as these summaries. An intentional generator or semantic change must revise the
specification and expected identity together. Bun and Node must produce equal
reports for the complete corpus.

## Resource and Failure Contract

The runner uses no subprocess, network, temporary file, or background service.
The enclosing test owns one Bun and one Node process, waits for both, applies a
300-second deadline to each, and captures only their bounded JSON summaries.
Failures name the family, sequence, step, operation, and complete bounded update
trace. The public command is:

```sh
bun run fuzz:persistent-semantics
```

Reduced sequence counts and single-sequence replay are diagnostic modes. They
set `acceptanceEligible` to false and cannot satisfy PD-01.

## Acceptance Criteria

- **PSC-01:** The default run executes exactly 100,000 independent sequences
  for each of List, Vector, Map, and Set.
- **PSC-02:** Every sequence performs exactly eight generated updates and all
  maintained update and observer operations receive nonzero coverage.
- **PSC-03:** Every current value agrees with its simple reference model after
  each update.
- **PSC-04:** Every retained previous version still equals its pre-update
  snapshot after every later update, producing exactly 3,600,000 checks per
  family.
- **PSC-05:** Nullish, NaN, signed-zero, scalar, string, and full-hash-collision
  cases obey Eliscript value semantics.
- **PSC-06:** Exact family summaries, complete summary, and operation counts
  match the frozen version 1 identity under Bun and Node.
- **PSC-07:** A family and sequence number reproduce one failure independently,
  with a bounded diagnostic trace.
- **PSC-08:** Full and replay modes have bounded state, output, process lifetime,
  and no persistent side effect.
- **PSC-09:** The corpus is part of the default core suite and passes together
  with conformance checks and strict Emacs byte compilation.
- **PSC-10:** Application infrastructure remains outside implementation and
  evidence.
