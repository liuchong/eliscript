# 0103: Transient Bulk Builder Performance

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0062 Owner-token Transient Collections,
  0063 Protocol-driven Core Algorithms,
  0093 Static Transient Ownership Analysis,
  0102 Profile-guided Ordered Source Map Cursors

## Summary

Eliscript now has source-bound performance evidence that `into` selects the
owner-token transient construction path for persistent Vector, Map, and Set
targets and materially outperforms equivalent repeated persistent updates.
The benchmark compares public core APIs in the same process over identical
preconstructed inputs. It does not compare against mutable JavaScript
containers or an application framework.

The existing persistent loops remain the readable semantic and performance
references. Production continues to use the protocol-selected transient path
implemented by 0062 and 0063; this specification adds no new collection
semantics or public runtime function.

## Compared Paths

For each collection category, the reference starts from the canonical empty
persistent value and applies one persistent operation per input:

- Vector calls persistent `conj` for every value.
- Map calls persistent `assoc` for every key/value pair.
- Set calls persistent `conj` for every member.

The production path calls `into` with the same canonical empty target and the
same input array. Protocol dispatch selects `transient`, applies `conj!`, and
calls `persistent!` exactly once after reduction. Input generation and complete
value comparison are outside the timed region.

## Correctness and Structure

Before timing, each persistent/transient pair must satisfy the complete value
equality protocol and produce the same collection hash. Count plus first/last
lookup or membership observations are recorded for both paths.

Allocation counters then run each path independently. Production must call
`persistent!` exactly once and allocate at most one third as many persistent
trie nodes as the reference. Transient mutation and clone counters remain in
the report so a future implementation cannot satisfy the timing gate by
silently bypassing the owner-token structure.

## Measurement Protocol

`tools/collections/transient-builder-benchmark.mjs` digests every maintained
`runtime/core/*.mjs` module, the three collection inspection modules, and the
benchmark itself. It preconstructs 200,000 Vector values, 100,000 Map entries,
and 100,000 Set values; runs two warmup rounds; then records eleven alternating
samples for each reference/production pair.

The reviewed macOS arm64 report is
`benchmarks/transient-builder-macos-arm64.json`. The predeclared acceptance
floor is 1.5x median speedup for every collection and a maximum persistent-node
allocation ratio of one third.

| Builder | Persistent median | Transient median | Speedup | Allocation ratio |
| --- | ---: | ---: | ---: | ---: |
| Vector | 215.505125 ms | 17.478208 ms | 12.329933x | 0.269549 |
| Map | 625.335666 ms | 35.760667 ms | 17.486689x | 0.087107 |
| Set | 617.454334 ms | 34.422417 ms | 17.937565x | 0.087107 |

Default tests validate source identity, raw sample completeness, equality,
hashes, observations, allocation bounds, completion counts, thresholds, and
the committed decision without making wall-clock timing part of every test
run.

## Compiler Review and P4 Exit

A fresh post-0102 whole-compiler profile over eighteen compilations of all
eleven self-hosted modules recorded 799 samples. Source Map VLQ and segment
encoding became the largest residual cluster after the prior seven compiler
optimizations. A retained-reference native encoding experiment improved the
local mapping step by 4.815632x but improved the complete compiler by only
1.042127x, below the 1.08 complete-compiler review floor used for the preceding
Source Map slice. The experiment was rejected and is not part of production.

P4 is complete because:

1. Vector, Map, and Set have owner-token transient nodes and one-way
   invalidation.
2. Runtime and static analysis reject use after completion and unsafe escape.
3. `into`, grouping, and indexing use transients where their profiles justify
   them.
4. Protocol dispatch, literal construction, and seven compiler hot paths have
   reviewed specializations.
5. Readable persistent and compiler implementations remain executable
   references.
6. This report proves the P4 exit requirement that bulk builders improve
   measured runtime while preserving persistent value semantics.

Application frameworks, UI libraries, bundlers, publishing systems, site
generators, and hosting do not participate in this implementation, corpus,
measurement, decision, or P4 credit.

## Acceptance Criteria

- **TBP-01:** Vector, Map, and Set references use repeated public persistent
  operations over the exact production inputs.
- **TBP-02:** Production uses public `into` and protocol-selected owner-token
  transient construction without a benchmark-only fast path.
- **TBP-03:** Reference and production values satisfy complete equality,
  identical hashing, count, lookup, and membership observations.
- **TBP-04:** Every production build calls `persistent!` exactly once.
- **TBP-05:** Every production build allocates no more than one third of the
  persistent trie nodes allocated by its reference.
- **TBP-06:** Vector covers 200,000 values; Map and Set each cover 100,000
  entries or members.
- **TBP-07:** Eleven timed samples alternate path order after two warmups, with
  input generation and complete equality checks outside the timed region.
- **TBP-08:** Every transient median is at least 1.5x faster than its persistent
  reference median on the declared host.
- **TBP-09:** The report is bound to all core runtime sources, inspection
  modules, benchmark source, parameters, host, raw samples, and decision.
- **TBP-10:** Default tests reject source drift, incomplete samples, semantic
  disagreement, allocation regression, missing completion, or failed gates.
- **TBP-11:** P4 receives no application-framework, publishing, site, or
  hosting evidence or maturity credit.
