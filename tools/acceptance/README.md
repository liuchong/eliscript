# Core Acceptance Corpus

[Project README](../../README.md) | [Tools](../README.md) |
[Specification 0134](../../specs/0134-versioned-core-acceptance-corpus.md)

The acceptance checker derives the mandatory AC and PD inventory from the
normative specifications, validates criterion-specific evidence, and can run
all declared probes from a clean checkout.

Validate the corpus contract without running the long probes:

```sh
bun tools/acceptance/check.mjs
```

Retain one complete audit:

```sh
bun tools/acceptance/check.mjs --run \
  --json-output acceptance/runs/m13-01.json \
  --markdown-output acceptance/runs/m13-01.md
```

Verify a retained JSON and Markdown pair:

```sh
bun tools/acceptance/check.mjs \
  --verify-run acceptance/runs/m13-01.json \
  --verify-markdown acceptance/runs/m13-01.md
```

The ordinary run command succeeds when all probes execute cleanly and every
criterion receives a result. It does not claim that incomplete criteria pass.
Add `--require-pass` only for the final all-mandatory-criteria gate.
