# Standard library CLI project

This example imports sequence and text modules directly from `stdlib/`. The
project builder discovers both dependencies after macro expansion, emits three
modules with source maps, and rewrites generated ESM imports to `.mjs`.

```sh
bun run build:stdlib-cli
bun run dist/project/examples/stdlib-cli/main.mjs
```
