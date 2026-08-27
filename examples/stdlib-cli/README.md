# Standard library CLI project

This example imports sequence, text, and object modules directly from `stdlib/`.
The project builder discovers all three dependencies after macro expansion,
emits four modules with source maps, and rewrites generated ESM imports to
`.mjs`.

```sh
bun run build:stdlib-cli
bun run dist/project/examples/stdlib-cli/main.mjs
```
