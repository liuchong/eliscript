# Documentation Contracts

[Project README](../../README.md) | [Getting started](../../docs/getting-started.md) |
[Specifications](../../specs/README.md)

`check.mjs` validates required guide sections, maintained command text, and
repository entry points against `contracts/documentation.json`.

```sh
bun run check:docs
```

The contract records coverage, not prose wording. Guides remain ordinary
maintained Markdown; the checker prevents removal or reordering of required
workflow stages and detects broken discovery links. Executable onboarding
tests separately run the documented framework-neutral path through the real
public commands and Emacs mode.
