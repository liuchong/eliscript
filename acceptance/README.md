# Acceptance Evidence

[Project README](../README.md) | [1.0 roadmap](../specs/0040-maturity-roadmap.md) |
[Corpus specification](../specs/0134-versioned-core-acceptance-corpus.md)

This directory retains source-revision-specific core maturity and onboarding
audits. `runs/m13-01.json` is the machine-readable core audit and
`runs/m13-01.md` is its generated human view. `runs/m13-02.json` and
`runs/m13-02.md` record the six-step local onboarding exercise.
`runs/m13-03.json` and `runs/m13-03.md` record the local compatibility
migration rehearsal.

The core audit proves that every current AC and PD criterion is enumerated
and evaluated through the declared core probes. It is not the final 1.0
`manifest.json` and `report.md`: incomplete criteria remain visible and the
final acceptance flag remains false.

Verify the retained pair with:

```sh
bun tools/acceptance/check.mjs \
  --verify-run acceptance/runs/m13-01.json \
  --verify-markdown acceptance/runs/m13-01.md
bun tools/onboarding/check.mjs \
  --verify-run acceptance/runs/m13-02.json \
  --verify-markdown acceptance/runs/m13-02.md
bun tools/compatibility/rehearse.mjs \
  --verify-run acceptance/runs/m13-03.json \
  --verify-markdown acceptance/runs/m13-03.md
```

Application validation status is recorded separately and contributes no core
acceptance result. The migration rehearsal completes M13-03 but deliberately
does not complete AC-02; the final stable compatibility corpus remains open.
