# Standard Library CLI Project

[Examples](../README.md) | [Project README](../../README.md) |
[Specification 0024](../../specs/0024-project-builds.md)

This example imports sequence, text, and object modules directly from `stdlib/`.
The project builder discovers all three dependencies after macro expansion,
emits four modules with source maps, and rewrites generated ESM imports to
`.mjs`.

```sh
bun run build:stdlib-cli
bun run dist/project/examples/stdlib-cli/main.mjs
```
