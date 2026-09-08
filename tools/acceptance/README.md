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

## Repeated determinism

AC-07 requires twenty direct local executions from one clean commit. Each
iteration builds the self-hosted compiler into a fresh temporary directory and
runs the complete core acceptance corpus:

```sh
bun tools/acceptance/repeat.mjs --run \
  --json-output acceptance/runs/m13-04.json \
  --markdown-output acceptance/runs/m13-04.md
```

Verify the retained machine-readable and human-readable pair without rerunning
the twenty iterations:

```sh
bun tools/acceptance/repeat.mjs --verify \
  --json-report acceptance/runs/m13-04.json \
  --markdown-report acceptance/runs/m13-04.md
```

`--iterations N` is available for local diagnostics. A run with any value
other than twenty is explicitly non-qualifying.
