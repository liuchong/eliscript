# 0141: Repeated Core Determinism Evidence

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-08
- Depends on: 0019 Self-Hosted Compiler Driver,
  0040 Project Maturity Roadmap and 1.0 Acceptance Contract,
  0134 Versioned Core Acceptance Corpus and Truthful Audit Run

## Summary

This specification defines the retained local evidence required by AC-07. A
qualifying run builds the self-hosted compiler and executes the complete core
acceptance corpus twenty times from one clean source commit and tree. Every
iteration must produce the same versioned identity.

The runner executes directly on the developer's local Emacs, Bun, Node, and
filesystem. Sandboxes, containers, virtual machines, hosted CI systems, and
application frameworks are neither required nor accepted as substitutes for
this evidence.

## Scope

Each iteration performs two independent operations:

1. invoke the bootstrap compiler into a newly created temporary output
   directory and hash the exact declared compiler module and source-map
   inventory
2. run the complete core acceptance corpus, including its declared core suite
   and strict Emacs byte-compilation probes

The temporary compiler directory is removed after its artifact bytes have
been measured. The source checkout must be clean before and after every core
acceptance execution. All iterations must identify the same source commit and
tree.

Application tests, bundlers, browser frameworks, publishing adapters, site
generators, and deployment systems remain outside this contract. They cannot
complete AC-07.

## Versioned Identity Projection

The machine-readable report identifies its schema, format, and version. Its
combined identity is computed from:

- the canonical ordered compiler artifact inventory, byte sizes, and SHA-256
  digests
- the stable identity projection of the complete core acceptance report

The core acceptance projection includes source identity, environment
identity, corpus definition, command declarations and outcomes, retained
artifacts, criterion results, application exclusions, and summary state.

The following observations are outside identity by an explicit versioned
schema field:

- report generation timestamps
- command durations
- command-output digests and presentation summaries
- temporary compiler directory names

The runner must construct identity from an allow-listed data structure. It
must not serialize the complete report and remove volatile text afterward.
Adding, removing, or reclassifying an identity field requires a new projection
version.

## Retained Evidence

A qualifying report contains exactly twenty ordered run records. Each record
retains source cleanliness, compiler and acceptance digests, the combined
identity, and non-identity observations useful for diagnosis. A human-readable
Markdown report is generated deterministically from the JSON report and must
verify byte-for-byte against it.

Runs with fewer than twenty iterations are valid diagnostic runs, but their
`acceptanceQualified` field must be false. A failed command, dirty source
state, changed artifact inventory, changed stable identity, or unverifiable
summary makes the report non-qualifying.

## Acceptance Criteria

- RCD-01: exactly twenty iterations identify one source commit and tree
- RCD-02: every iteration starts and ends with a clean source checkout
- RCD-03: every compiler build uses a fresh temporary output directory
- RCD-04: every compiler build contains the exact declared artifact inventory
- RCD-05: every iteration executes the complete core acceptance corpus
- RCD-06: all compiler, acceptance, and combined identity digests match
- RCD-07: volatile observations are excluded structurally by the versioned
  projection schema
- RCD-08: retained JSON and Markdown reports verify locally from repository
  tools without network or hosted-service evidence

AC-07 is complete only when one retained report satisfies all eight criteria.
