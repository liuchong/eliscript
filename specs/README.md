# Specifications

Numbered specifications define Eliscript language, compiler, toolchain, and
integration contracts. Their machine-readable registry is
[`index.json`](index.json).

Each specification has two independent metadata fields:

- `Status` records design maturity: `Draft`, `Accepted`, `Stable`, or
  `Superseded`.
- `Implementation` records delivery: `Pending`, `In progress`, `Implemented`,
  or `Superseded`.

`Accepted` does not mean compatibility-frozen. A public behavior enters the
1.0 compatibility contract only after its specification is marked `Stable` and
its conformance feature is also stable.

## Contract Check

Run:

```sh
bun run check:contracts
```

The checker verifies that:

- every numbered Markdown specification appears exactly once in the registry
- id, title, design status, and implementation status match the source file
- every implemented specification owns at least one conformance feature
- every feature has observable contract statements and executable evidence
- every evidence locator still exists in its declared test or fixture

Use `bun tools/conformance/check.mjs --json` for the versioned summary consumed
by automation.

The feature inventory and evidence links live in
[`tests/conformance/manifest.json`](../tests/conformance/manifest.json). See
[`0042-specification-registry.md`](0042-specification-registry.md) for the
schema and change workflow.

The current public and internal boundary lives in
[`contracts/public-surface.json`](../contracts/public-surface.json). Its checker
compares language forms, IR kinds, commands, schemas, adapters, libraries, and
Emacs APIs with their implementations. See
[`0044-public-surface-registry.md`](0044-public-surface-registry.md).

The supported continuous-test dimensions live in
[`contracts/compatibility-matrix.json`](../contracts/compatibility-matrix.json).
The contract deterministically renders the pinned GitHub Actions workflow and
is checked before local tests. See
[`0045-continuous-compatibility-matrix.md`](0045-continuous-compatibility-matrix.md).

The frozen and provisional boundary lives in
[`contracts/compatibility-baseline.json`](../contracts/compatibility-baseline.json).
Its checker derives every expected classification from specification and
feature statuses, so partial promotions and missing entries fail. See
[`0046-m7-compatibility-baseline.md`](0046-m7-compatibility-baseline.md).

M8 persistent collection work begins with the provisional 32-way vector trie
and its structural evidence in
[`0047-persistent-vector-prototype.md`](0047-persistent-vector-prototype.md).
Its scalar and vector key semantics continue in
[`0048-value-equality-and-hashing.md`](0048-value-equality-and-hashing.md),
including frozen Bun/Node hashes and collision evidence.
The associative runtime continues in
[`0049-persistent-hash-map-prototype.md`](0049-persistent-hash-map-prototype.md),
which defines bitmap, dense, and collision HAMT nodes without changing map
literals. The same HAMT key layer backs the value-semantic Set in
[`0050-persistent-hash-set-prototype.md`](0050-persistent-hash-set-prototype.md),
including collection algebra, structural sharing, and million-member bounds.
The cross-engine layout evidence and measured 32/24 transition decision live
in [`0051-hamt-layout-benchmark.md`](0051-hamt-layout-benchmark.md).
The portable integer foundation continues in
[`0052-portable-32-bit-operations.md`](0052-portable-32-bit-operations.md),
covering seed/self-hosted intrinsics and Eliscript-authored population count
and rotation algorithms. The P0 implementation-language proof is
[`0053-eliscript-persistent-vector.md`](0053-eliscript-persistent-vector.md):
the complete vector trie is written in portable Eliscript and verified across
both compilers, Bun, Node, generated histories, and one million values.
P1 begins with
[`0054-eliscript-persistent-list.md`](0054-eliscript-persistent-list.md), which
adds a second language-authored persistent representation with constant-time
front operations, exact suffix sharing, and stack-safe million-node traversal.

## Adding a Specification

1. Choose the next four-digit id and add `NNNN-short-name.md`.
2. Add exact metadata to `index.json`.
3. When implementation exists, add its feature and evidence to the conformance
   manifest.
4. Run the focused contract tests and then the complete suite.

Do not mark a specification implemented without executable evidence. Do not
mark a feature stable while its specification remains draft or accepted.
