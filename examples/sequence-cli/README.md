# Sequence CLI project

This example imports Eliscript source directly from `stdlib/sequence.eli`. The
project builder discovers the dependency after macro expansion, emits both
modules with source maps, and rewrites the generated ESM import to `.mjs`.

```sh
bun run build:sequence-cli
bun run dist/project/examples/sequence-cli/main.mjs
```
