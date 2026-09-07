# Acceptance Evidence

[Project README](../README.md) | [1.0 roadmap](../specs/0040-maturity-roadmap.md) |
[Corpus specification](../specs/0134-versioned-core-acceptance-corpus.md)

This directory retains source-revision-specific core maturity audits.
`runs/m13-01.json` is the machine-readable initial audit and
`runs/m13-01.md` is its generated human view.

The initial audit proves that every current AC and PD criterion is enumerated
and evaluated through the declared core probes. It is not the final 1.0
`manifest.json` and `report.md`: incomplete criteria remain visible and the
final acceptance flag remains false.

Verify the retained pair with:

```sh
bun tools/acceptance/check.mjs \
  --verify-run acceptance/runs/m13-01.json \
  --verify-markdown acceptance/runs/m13-01.md
```

Application validation status is recorded separately and contributes no core
acceptance result.
