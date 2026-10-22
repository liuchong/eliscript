# Releasing

[Project README](../README.md) | [Core documentation](README.md) |
[Specifications](../specs/README.md)

This page records the maintained release procedure for the `eliscript`
package. It is a procedure, not a decision: the package is prepared and
verifiable, and nothing is published until a release is explicitly authorized.

## Release Latch

`package.json` sets `"private": true`. npm refuses to publish a private
package, so the repository cannot publish by accident. Removing that field is
the release step, and it is the only edit a release requires in the manifest.

The version is `0.1.0` and is not bumped by ordinary work.

## What Ships

| Entry | Why it is in the tarball |
| --- | --- |
| `dist/bootstrap/` | The generated compiler. A consumer has no Emacs, so it cannot build this itself. |
| `bin/` | The shell wrappers used from a checkout. |
| `bootstrap/` | The host layer, including the Node entry that npm links under every command name. |
| `runtime/` | Host-free runtime semantics linked by generated code. |
| `platform/` | The browser and worker capability packages. |
| `browser/` | The in-memory compile host and its module worker. |
| `dist/browser/` | The compiler and standalone hot-reload loader (`compiler.js` and `loader.js`) bundled for a browser. |
| `stdlib/` | Standard-library sources that project builds import. |
| `compiler/` | The Emacs Lisp seed compiler, so the package remains rebuildable from source. |
| `editor/` | The Emacs major mode and its evaluation library. |

Development trees stay out: `acceptance/`, `docs/`, `examples/`,
`node_modules/`, `specs/`, `tests/`, and `tools/` are excluded by the `files`
allowlist.

## Prerequisites

Building the compiler needs Emacs, because the seed compiler is Emacs Lisp.
`prepack` runs that build, so packing or publishing always ships a compiler
derived from the current sources:

```sh
./bin/eliscript-bootstrap        # writes dist/bootstrap/*.mjs; prepack runs this
```

It runs before packing and never on the consumer side. Everything the consumer
executes is plain JavaScript on Node 24 or Bun, so an install from a git
dependency is not supported: the registry tarball is the artifact, because only
it carries the generated compiler.

## Verification

Run the whole sequence from a clean checkout:

```sh
bun test tests/package-surface.test.mjs
bun run benchmark:version-comparison -- --release-dir dist/release-report
npm pack --dry-run --json       # prepack rebuilds the compiler first
```

`bun run benchmark:version-comparison -- --release-dir dist/release-report`
executes the four-dimension performance and verification comparison (`Emacs
Lisp` current latest, `previousMajor`, `previousMinor`, and `latest`) and
writes:

- `dist/release-report/release-summary.md` and
  `dist/release-report/release-notes-merged.md` — concise summary and
  idempotently merged release body for the main GitHub Release page
  (`gh release create --notes-file` / `gh release edit --notes-file`).
- `dist/release-report/eliscript-0.0.4-benchmark-report.md` and
  `dist/release-report/eliscript-0.0.4-benchmark-report.json` — detailed
  benchmark, artifact-size, and verification report files uploaded as GitHub
  Release assets alongside `eliscript-0.0.4.tgz`.

When `.github/workflows/release.yml` is dispatched (`gh workflow run release.yml
-f version=0.0.4 -f publish=true`), GitHub Actions automatically verifies the
signed tag and release tarball, runs the four-dimension benchmark against the
full tag history, uploads `eliscript-0.0.4-benchmark-report.md` and
`eliscript-0.0.4-benchmark-report.json` to the GitHub Release page, updates the
Release main page summary, and publishes (or stages with OIDC provenance) the
package to npm.

See [`.agents/skills/release-benchmark/SKILL.md`](../.agents/skills/release-benchmark/SKILL.md)
for the complete normalized release and Pages version-switching workflow.

`tests/package-surface.test.mjs` checks the manifest itself: one executable
entry per command with a Node shebang, every exported entry resolving inside
the package, the compiler and runtime present in the `files` allowlist,
development trees absent, and the release latch still set.

The dry run reports the exact artifact. The maintained state ships the stage-3
self-hosted compiler, browser compiler and hot-reload loader bundles, runtime,
standard library, and multi-target backend adapters (~4.5 MB packed, ~32 MB
unpacked), including `dist/bootstrap/compiler.mjs` and
`dist/browser/loader.js`.

Then install that artifact and use it the way a consumer would:

```sh
npm pack --pack-destination /tmp
mkdir /tmp/consumer && cd /tmp/consumer && npm init -y
npm install /tmp/eliscript-0.0.4.tgz
./node_modules/.bin/eliscript --help
```

The installed package must be able to compile and run a project, and its
public compiler entry must be importable:

```sh
node --input-type=module -e \
  "import { compile_string } from 'eliscript/compiler'; \
   console.log(compile_string('(module demo (print 1))', 'demo.eli').length)"
```

## Public Entries

`exports` defines what a consumer may name. `./compiler` is the compiler,
`./browser` is the in-memory compile host (`createEliscriptHost`, `runSource`,
and `mountEliscriptScripts`), `./browser/loader` is the standalone hot-reload
browser loader (`dist/browser/loader.js`), `./browser/worker.mjs` is the module
worker, and `./browser/compiler` is the compiler bundled for a browser. The
runtime and platform packages are exported with and without their `.mjs`
suffix.

A browser consumer needs no import map for the code it compiles: the host
rewrites the runtime specifiers of the emitted modules, including the imports
the emitter injects for literals and collection helpers, to served URLs. Only
an application's own module graph needs a map, and that is the application's
choice.

## Documentation Site

The documentation site is published from the assembled tree, and it is the
deployment root: `https://liuchong.org/eliscript/` serves `docs/index.html`.
The browser playground in it loads the compiler, the runtime, and the compile
host from the published root, so publishing only `docs/` would ship a page
whose imports cannot resolve. `tools/pages/assemble.mjs` copies the site's
contents to the artifact root and the trees it loads beside it, rebasing the
references each page used to reach the repository root.

`.github/workflows/pages.yml` builds the compiler, the browser bundle, and the
playground, then calls `tools/pages/assemble.mjs`, which copies the site
together with exactly the trees it needs. `tests/pages-assembly.test.mjs`
assembles that tree and resolves every reference the playground page carries,
so the layout is a verified contract rather than a deployment detail.

Publishing is gated on the repository variable `ELISCRIPT_PAGES`. A repository
without Pages enabled for Actions therefore reports a build rather than a failed
deployment. To publish:

1. Set Settings, Pages, Source to "GitHub Actions".
2. Set the repository variable `ELISCRIPT_PAGES` to `true`.
3. Push to `master`, or run the Pages workflow manually.

The site is then served from the artifact root, so the entry page is at `/`
and the playground at `/pages/playground.html`. HTTPS is enforced on the custom
domain, so the `http` form redirects.

## Source Obligations

The package is GPL-3.0-or-later. `compiler/` and `stdlib/` ship as source
alongside the generated `dist/bootstrap/`, so the preferred form for
modification accompanies the object code the package distributes.
