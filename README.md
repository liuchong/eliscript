<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/pages/assets/eliscript-logo-light.png">
    <img src="docs/pages/assets/eliscript-logo.png" width="144" alt="Eliscript logo">
  </picture>
</p>

# Eliscript

Eliscript is an Emacs Lisp-flavored language that compiles to modern
JavaScript. The seed compiler runs in plain Emacs, emits standard ECMAScript
modules, and bootstraps a compiler written in Eliscript itself.

**[Documentation](https://liuchong.org/eliscript/)** ·
[Core documentation](docs/README.md) ·
[Getting started](docs/getting-started.md) ·
[Language reference](docs/language-reference.md) ·
[Library API](https://liuchong.org/eliscript/pages/api.html) ·
[Playground](https://liuchong.org/eliscript/pages/playground.html) ·
[Roadmap](specs/0040-maturity-roadmap.md) ·
[Acceptance evidence](acceptance/README.md) ·
[Specifications](specs/README.md)

## Quick Start

Building from source needs Emacs 29 or newer and Bun 1.4 or newer. The
compiled compiler ships in the release tarball, so a consumer needs only Node
24 or Bun; the package is prepared and rehearsed, and the first publication is
pending.

```sh
bun install --frozen-lockfile
./bin/eliscript --output dist/basic.mjs examples/basic/main.eli
bun run dist/basic.mjs
```

A whole project compiles as one graph, with `--source-map` for an external
Source Map v3:

```sh
./bin/eliscript-build --root . --out-dir dist/project \
  examples/stdlib-cli/main.eli
bun run dist/project/examples/stdlib-cli/main.mjs
```

The daily commands are `./bin/eliscript-check` for type and protocol checks,
`./bin/eliscript-format` for canonical formatting, `./bin/eliscript-eval` for
evaluation, `./bin/eliscript-watch` for rebuilds, and `./bin/eliscript-org` for
Org sources. Each has a documented page in the
[documentation](docs/getting-started.md).

## What Works Today

| Area | State |
| --- | --- |
| Compiler | Emacs Lisp seed, reproducible self-hosted compiler, deterministic formatter, versioned canonical IR, Source Maps that name `.eli` files |
| Language | Tail calls, macros, modules, protocols, records, `deftype`/`reify`, `case`/`condp`, multi-arity named, anonymous, async, and portable functions |
| Data | Persistent List, Vector, Map, Set, and Queue with value equality; transients; lazy sequences; transducers |
| Runtime | Host-free runtime semantics, frozen regular expressions, a long-lived Emacs-to-JavaScript worker |
| Browser | An in-memory multi-file compile host, a module worker, and a compiler bundled for the browser — the [playground](https://liuchong.org/eliscript/pages/playground.html) compiles and runs Eliscript in the page |
| Editor | [`eliscript-mode`](editor/README.md) and an evaluation REPL |
| Applications | The [proving-ground site](https://liuchong.org/eliscript/examples/dogfood/_site/) and the packaged Action built from it, plus React, Org, and Vite probes as replaceable application evidence |

## Project Status

The retained core acceptance audit records **35 of 35 mandatory criteria
passing, 0 incomplete, 0 failed**, with all five evidence groups complete and no
blocking defects: [`acceptance/report.md`](acceptance/report.md). Implementation
units through **M12: Reliability, Security, and Performance** are complete, and
core stabilization and the retained audit are done. Progress is reported from
acceptance units rather than from elapsed time, in
[Evidence-derived maturity progress](specs/0122-evidence-derived-maturity-progress.md).

Known gaps, stated rather than implied:

- The Linux x64 compatibility cells are optional in the contract and carry no
  retained reports; macOS arm64 is the required acceptance platform.
- The proving-ground specifications are marked `In progress`: the application is
  exercised by its tests and published, and its own acceptance set is not
  complete.
- Publication is prepared and not performed: no tag, no registry release, and no
  Marketplace listing exists yet.

## Contracts

The published surface and the compatibility it must keep are recorded as
machine-checked registries: [`contracts/public-surface.json`](contracts/public-surface.json)
([0044](specs/0044-public-surface-registry.md)),
[`contracts/compatibility-matrix.json`](contracts/compatibility-matrix.json)
([0045](specs/0045-continuous-compatibility-matrix.md)), and the retained
baseline in
[`contracts/compatibility-baseline.json`](contracts/compatibility-baseline.json)
([0046](specs/0046-m7-compatibility-baseline.md)).

## Repository Guide

| Path | Purpose |
| --- | --- |
| [`bin/`](bin/) | Command-line entry points |
| [`compiler/`](compiler/README.md) | Emacs Lisp seed compiler |
| [`bootstrap/`](bootstrap/README.md) | Compiler implementation written in Eliscript |
| [`runtime/`](runtime/README.md) | Value, protocol, collection, and worker runtime |
| [`stdlib/`](stdlib/README.md) | Portable Eliscript standard library |
| [`platform/`](platform/README.md) | Host capability packages for Node, Bun, and the browser |
| [`browser/`](browser/) | In-memory compile host and its module worker |
| [`editor/`](editor/README.md) | Emacs major mode and editor integration |
| [`examples/`](examples/README.md) | Language, project, browser, and application probes |
| [`docs/`](docs/README.md) | Documentation source and the published site |
| [`specs/`](specs/README.md) | Numbered design contracts and the specification catalog |
| [`contracts/`](contracts/) | Public surface, compatibility, and baseline registries |
| [`acceptance/`](acceptance/README.md) | Retained audits, platform records, and the final artifact |
| [`tests/`](tests/README.md) | ERT, Bun, fixtures, and conformance evidence |
| [`benchmarks/`](benchmarks/README.md) | Reviewed performance evidence and host fingerprints |
| [`tools/`](tools/README.md) | Build, verification, and integration tooling |

## Development

```sh
make byte-compile       # Emacs Lisp with warnings as errors
make test-core          # contracts and the framework-neutral suite
make test-applications  # maintained application consumers
make check-browsers     # three engines against the generated site
```

`bun run test` runs both test partitions. Generated output under `dist/` is
never committed; contract checks compare it against its sources instead.

[Contributing](docs/contributing.md) describes the workflow, and
[`docs/README.md`](docs/README.md) is the documentation hub.

## License

GPL-3.0-or-later. The compiler and standard library ship as source alongside
the generated output they produce, which is the preferred form for
modification.
