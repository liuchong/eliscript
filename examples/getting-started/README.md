# Getting Started Project

[Installation and daily development](../../docs/getting-started.md) |
[Examples](../README.md) | [Project README](../../README.md)

This framework-neutral two-module project is the executable source for the
installation guide. From this directory with the project `bin/` directory on
`PATH`:

```sh
eliscript-format --check src/math.eli
eliscript-format --check src/main.eli
eliscript-check --json --config eliscript.json
eliscript-build --config eliscript.json
bun run dist/main.mjs
```

The final command prints `42`. Generated files remain under ignored `dist/`.
