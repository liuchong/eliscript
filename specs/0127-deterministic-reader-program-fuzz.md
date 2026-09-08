# 0127: Deterministic Reader and Program Fuzzing

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-07
- Depends on: 0014 Portable Syntax and Reader, 0040 Project Maturity Roadmap
  and 1.0 Acceptance Contract, 0043 Structured Compiler Diagnostics, 0114
  Deterministic Concrete-syntax Formatter

## Summary

Eliscript owns a deterministic 100,000-input reliability suite for its reader,
formatter, and self-hosted compiler. The default seed generates 50,000
grammar-aware reader inputs and 50,000 complete-module mutations. Every run
replays the corpus, compares the seed and self-hosted reader acceptance domain,
checks self-hosted result determinism, validates source spans and diagnostics,
and preserves accepted programs through formatting and compilation.

The suite is executable evidence for M12-01 and AC-18. It is a core language
and compiler test: application frameworks, UI libraries, bundlers, publishing
systems, sites, and development servers are neither dependencies nor evidence.

## Corpus Contract

Version 1 uses unsigned 32-bit xorshift generation with seed `0x454c4931`.
Inputs are emitted in this fixed order:

1. 50,000 reader cases assembled recursively from literals, symbols,
   keywords, strings, lists, vectors, maps, sets, reader prefixes, comments,
   Unicode, tabs, form feeds, and line breaks
2. 50,000 complete modules selected from valid programs and bounded mutations
   for missing delimiters, unexpected delimiters, malformed dispatch, odd maps,
   duplicate bindings, missing references, and invalid exports

Each source is at most 4,096 Unicode characters. The NDJSON corpus has a 64 MiB
hard limit and is written in bounded blocks. The runner regenerates the same
ordered cases while consuming oracle results and requires the replay digest to
equal the written corpus digest.

For version 1 and the default case count, these identities are normative:

| Evidence | SHA-256 |
| --- | --- |
| Corpus | `4b49f0e21a825e41344fc29387b5298462d17cd1140b2f1f06076a18fe1f8cab` |
| Self-hosted reader results | `31961b6ffb8ce276a67db1b7cce2b723cf512b6c1518f8023985606535c69e7e` |
| Self-hosted compiler results | `af90ba331d5427987ce5420e57304e4361f040fbc78240a191dd0161b5b35295` |

An intentional corpus or semantic change must revise the fuzz contract and its
checked identities together. Host timing and temporary paths never enter an
identity.

## Reader Invariants

One Emacs process evaluates the complete bounded corpus through the seed
reader. Results are emitted as ASCII-only JSON lines so Unicode values survive
batch stdout consistently. One generated compiler instance reads the same
cases under Bun.

The shared input-domain agreement is:

- both readers make the same accept-or-reject decision
- when accepted, normalized recursive syntax nodes and source spans are equal
- seed diagnostic wording is not an equality key because it contains
  host-reader details; an uncontrolled seed exception still terminates the run

The self-hosted result is evaluated twice and must be byte-canonical after
normalization. Every accepted node has an in-bounds, monotonic, recursively
contained span whose offsets and one-based character positions agree with the
source. Tabs and non-BMP characters each count as one source character rather
than an Emacs display column or JavaScript UTF-16 code unit.

Every rejected input must expose `eliscript-diagnostic` version 1 with a reader
error code and an exact valid source location. A repeated rejection must carry
the same message and diagnostic data.

## Round-trip and Compiler Invariants

Accepted reader inputs pass both formatter invariants:

- formatting twice is byte-idempotent
- reading formatted text preserves the recursive semantic value

Every complete-module mutation then enters the self-hosted compiler. Accepted
programs emit a JavaScript string, and compiling their formatted source must
emit the identical JavaScript. Rejected programs must expose a version 1
structured diagnostic with an exact source location. A host `SyntaxError`,
`TypeError`, stack trace without an Eliscript diagnostic, process crash, short
oracle stream, or timeout fails the suite.

The default seed currently yields 46,889 accepted and 53,111 rejected reader
results. Of the 50,000 program inputs, 10,171 compile and 39,829 produce
controlled diagnostics. These counts are checked alongside the digests.

## Resource and Lifecycle Contract

The self-hosted compiler is built once per run in an owned temporary directory.
The seed oracle is one long-lived subprocess with streamed result consumption.
The oracle has a 240-second deadline and the enclosing test has a 300-second
deadline. Signal handlers terminate tracked children, normal and exceptional
paths remove the temporary directory, and the test never starts an HTTP server
or leaves a persistent process.

The public command is:

```sh
bun run fuzz:reader-program
```

`make test` executes the same fixed 100,000-input contract. Smaller case counts
are diagnostic probes only and cannot satisfy this specification.

## Compatibility Freeze

The version 1 generator, seed, 50,000/50,000 case split, corpus order, checked
digests, reader agreement, span and diagnostic invariants, formatter and
compiler round trips, resource ceilings, and child cleanup requirements are
stable. A deliberate grammar-domain or corpus change requires a new corpus
version and reviewed identities rather than silently replacing this baseline.

## Acceptance Criteria

- **FRP-01:** The default run generates exactly 100,000 deterministic inputs,
  split equally between grammar-aware reader cases and complete-module
  mutations.
- **FRP-02:** Corpus replay and the three checked SHA-256 identities match the
  version 1 default baseline.
- **FRP-03:** Every seed and self-hosted reader decision agrees; accepted syntax
  trees agree exactly.
- **FRP-04:** Every self-hosted reader result is deterministic, every rejection
  is a structured diagnostic, and every accepted recursive span is valid.
- **FRP-05:** Every accepted reader input preserves semantic values through a
  byte-idempotent formatter round trip.
- **FRP-06:** Every program either emits identical JavaScript before and after
  formatting or returns a structured compiler diagnostic at a valid location.
- **FRP-07:** Unicode, tabs, comments, reader prefixes, collection delimiters,
  malformed dispatch, and nested malformed input occur in the maintained
  corpus.
- **FRP-08:** Corpus size, source size, subprocess duration, captured stderr,
  temporary storage, and child-process lifetime are bounded.
- **FRP-09:** The default contract suite, complete test suite, and strict Emacs
  byte compilation pass with no uncontrolled host exception or residual child
  process.
- **FRP-10:** Core implementation and evidence contain no application framework,
  bundler, publishing, site, hosting, or development-server dependency.
