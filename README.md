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
[Emacs-compatible syntax (0.1.0)](docs/emacs-compatible-syntax.md) ·
[Library API](https://liuchong.org/eliscript/pages/api.html) ·
[Playground](https://liuchong.org/eliscript/pages/playground.html) ·
[Roadmap](specs/0040-maturity-roadmap.md) ·
[Acceptance evidence](acceptance/README.md) ·
[Specifications](specs/README.md)

## Quick Start

Building from source needs Emacs 29 or newer and Bun 1.4 or newer. The
compiled compiler ships in the release tarball, so a consumer needs only Node
24 or Bun; releases are published to GitHub Releases and the npm registry
(`eliscript`).

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

### Pure Browser Live Hot-Reload Compiler

Any website can compile and hot-reload `.eli` source directly in the browser
without a build server or repository files. Include `dist/browser/loader.js`
and use either `data-eliscript` or `<script type="text/eliscript">` tags:

```html
<script defer src="https://unpkg.com/eliscript@0.1.0/dist/browser/loader.js"></script>
<script type="text/eliscript">
(module app.live
  (print "Hello from in-browser Eliscript!"))
</script>
```

Or import the programmatic browser SDK (`eliscript/browser`) to compile single
modules (`compileSource`, `runSource`), multi-file projects (`compileProject`,
`moduleGraphUrls`), or DOM script tags (`mountEliscriptScripts`) in memory, with
built-in IR constant-folding/dead-branch optimization (`optimizeProgramIr`),
optional JavaScript compaction (`optimizeJavaScript` / `{ minify: true }`), and
extensionless package subpath imports (`(import "eliscript/runtime/core/order" sort)`
alongside explicit `.mjs`).

## What Works Today

| Area | State |
| --- | --- |
| Compiler | Emacs Lisp seed, reproducible stage0–stage3 self-hosted compiler, deterministic formatter, versioned canonical IR, Source Maps that name `.eli` files, plus zero-glue WASM and ARM64 Native `:abi` backends |
| Language | 100% Emacs Lisp-compatible core (`eliscript-compat`) + `1+5+2` extension packs (`defun-case`, `let-bind`/`defun-bind`/`pcase-value`, `let-const`, `defmodule`, `defmacro-checked`, `with-async-scope`, `async-channel`), tail-safe `loop`/`recur` (50,000+ depth), protocols, records, `deftype`/`reify`, `case`/`condp`, and portable functions |
| Data | 7 persistent collection types (List, Vector, HAMT Map/Set, Queue, AVL Sorted Map/Set), `cl-defstruct-persistent` with Schema validation and JSON Schema round-trip, `state-cell`, transients, lazy sequences, and transducers |
| Runtime | Host-free runtime semantics, `eliscript/runtime/emacs-compat` dual-host compatibility runtime, lossless JS sentinels (`js-false`/`js-null`/`js-undefined`), cross-engine handle revocation, and a long-lived Emacs-to-JavaScript worker |
| Browser | An in-memory multi-file compile host, a module worker, standalone `dist/browser/loader.js`, and a compiler bundled for the browser — the [playground](https://liuchong.org/eliscript/pages/playground.html) compiles and runs Eliscript in the page |
| Editor | [`eliscript-mode`](editor/README.md), an evaluation REPL, and the `editor/eliscript-{compat,contract,data,bind,module,async,js,abi}.el` Emacs Lisp libraries |
| Applications | The [proving-ground site](https://liuchong.org/eliscript/examples/dogfood/_site/) and the packaged Action built from it, plus React, Org, and Vite probes as replaceable application evidence |

Experimental direct backends and the zero-import managed WASM heap are described
in the [backend runtime reference](tools/backends/README.md). The current delivery
uses a JavaScript-hosted stage0–stage3 compiler chain that emits JavaScript,
WASM and native programs, with 12,000-depth persistent zipper traversal and
edited ascent verified across all three output targets:
[active plan](docs/bootstrap-0.1.0-plan.md).

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
- Releases are published to GitHub Releases and the npm registry (`eliscript`);
  a dedicated editor Marketplace listing is not published yet.

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

Build the JavaScript stage0 → stage1 → stage2 → stage3 chain, then independently
verify its fixed point:

```sh
make bootstrap-release
make verify-bootstrap
```

The second command only reads the existing artifacts. It rechecks the complete
declared products, source and IR identities, maps and other assets, compares every
stage2/stage3 product byte, and authenticates the stored comparison receipt. It
does not compile, rebuild, prepare a package, or update that receipt. Success is
exit code 0 and one JSON report with `scope: "stage2-stage3-complete-products"`,
`verification: "identical"`, the actual `fileCount`, matching stage2/stage3 product
SHA-256 summaries, and the source identity summary. The count follows the complete
product inventory rather than a fixed expected number.

Use the same output directory for both commands when choosing another layout:

```sh
make bootstrap-release BOOTSTRAP_RELEASE_OUT=dist/bootstrap-local
make verify-bootstrap BOOTSTRAP_RELEASE_OUT=dist/bootstrap-local
```

For a manifest elsewhere, run
`node tools/backends/dist/release-cli.mjs verify-bootstrap --bootstrap-manifest PATH/bootstrap.json`.
A missing file, a one-byte change, an extra product file, or a changed receipt
must produce a nonzero exit. Product control metadata can legitimately contain
different producer names and paths, so `diff -r` over entire stage directories is
not the comparison rule. This fixed-point check does not substitute for the final
stage3 JavaScript/WASM/native program acceptance.

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
