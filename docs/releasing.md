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

The version is `0.0.1` and is not bumped by ordinary work.

## What Ships

| Entry | Why it is in the tarball |
| --- | --- |
| `dist/bootstrap/` | The generated compiler. A consumer has no Emacs, so it cannot build this itself. |
| `bin/` | The shell wrappers and the Node entry they and npm both dispatch through. |
| `bootstrap/` | The host layer the entries import. |
| `runtime/` | Host-free runtime semantics linked by generated code. |
| `platform/` | The browser and worker capability packages. |
| `stdlib/` | Standard-library sources that project builds import. |
| `compiler/` | The Emacs Lisp seed compiler, so the package remains rebuildable from source. |
| `editor/` | The Emacs major mode and its evaluation library. |

Development trees stay out: `acceptance/`, `docs/`, `examples/`,
`node_modules/`, `specs/`, `tests/`, and `tools/` are excluded by the `files`
allowlist.

## Prerequisites

Building the compiler needs Emacs, because the seed compiler is Emacs Lisp:

```sh
./bin/eliscript-bootstrap        # writes dist/bootstrap/*.mjs
```

This runs before packing, never on the consumer side. Everything the consumer
executes is plain JavaScript on Node 24 or Bun.

## Verification

Run the whole sequence from a clean checkout:

```sh
./bin/eliscript-bootstrap
bun test tests/package-surface.test.mjs
npm pack --dry-run --json
```

`tests/package-surface.test.mjs` checks the manifest itself: one executable
entry per command with a Node shebang, every exported entry resolving inside
the package, the compiler and runtime present in the `files` allowlist,
development trees absent, and the release latch still set.

The dry run reports the exact artifact. The maintained state is 192 files,
about 570 KB packed and 3.1 MB unpacked, including
`dist/bootstrap/compiler.mjs`.

Then install that artifact and use it the way a consumer would:

```sh
npm pack --pack-destination /tmp
mkdir /tmp/consumer && cd /tmp/consumer && npm init -y
npm install /tmp/eliscript-0.0.1.tgz
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

`exports` defines what a consumer may name. `./compiler` is the compiler, and
the runtime and platform packages are exported with and without their `.mjs`
suffix. The browser playground imports `eliscript/compiler`, so the page and an
npm consumer depend on the same contract rather than on an internal build path.

## Source Obligations

The package is GPL-3.0-or-later. `compiler/` and `stdlib/` ship as source
alongside the generated `dist/bootstrap/`, so the preferred form for
modification accompanies the object code the package distributes.
