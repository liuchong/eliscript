# Project Reliability Tools

[Project README](../../README.md) | [Specifications](../../specs/README.md) |
[Tests](../../tests/README.md)

This directory contains host-neutral project-build reliability probes. They
exercise public Eliscript commands and do not depend on an application
framework, bundler, publishing system, or development server.

## Scale and Invalidation

Run the fixed acceptance graph with:

```sh
bun run scale:project
```

`scale-invalidation.mjs` generates 1,000 modules containing a deep chain,
fifty diamonds, ten cycles, and 299 importers of one shared dependency. It
then verifies:

- a clean cached build compiles all 1,000 modules
- a no-op rebuild reuses all 1,000 modules
- a chain-leaf change recompiles exactly that source while changed behavior
  propagates through stable ESM imports
- a shared-dependency change recompiles exactly that source while all 299
  importers retain live dependency semantics
- incremental graph identities, artifacts, and evaluated values equal forced
  clean builds

The report records source and artifact identities, phase timings, wall-clock
durations, and maximum resident memory for every build. Each subprocess,
captured stream, source tree, artifact tree, temporary tree, and build duration
has a hard limit. Owned children and temporary files are removed on every exit
path.
