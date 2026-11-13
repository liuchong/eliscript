# Releasing

[Project README](../README.md) | [Core documentation](README.md) |
[Specifications](../specs/README.md)

This page records the maintained release procedure for the `eliscript`
package. It is a procedure, not a decision: the package is prepared and
verifiable, and nothing is published until a release is explicitly authorized.

## Rebuild and workspace lifetime

Git contains the maintained sources, formal inputs and generation rules.
Build and acceptance outputs are disposable: a fresh clone must work without
old `dist/`, test result directories or a local request cache. Run the official
`make bootstrap-release`, `make prepare-release-package` and
`make verify-bootstrap` sequence to reconstruct the final compiler and verify
the stage2/stage3 fixed point before using its output acceptance commands.
Rebuilding produces new measurements; it does not recreate historical timings.

`targets` deletes each successful record's working directory after its real
execution and independent comparison. The run manifest keeps a same-input
checkpoint, bound to the exact compiler, corpus and input, for an interrupted
run; it does not claim to reauthenticate deleted artifacts. The checkpoint
omits listings of deleted source files; exact input digests and the enclosing
corpus binding remain required. `--retain-artifacts` keeps products for active
debugging. Failed records remain available while
investigating that run. Delete these workspaces and the checkpoint when their
purpose ends, using `make clean-all` for checkout-generated products and
removing any explicitly selected external output directory too.

The Make targets expose Node GC at completed graph lifetimes. Disposable
binary projects use the authenticated compiler's existing owned-product
handoff; public producers and retained archives keep their wire snapshots.
Each record reports compilation, archive, execution and independent comparison
times, including a failed phase, so expensive work can be located directly.

The manual compiler workflow defaults to `make compiler-platform-ci`: one
four-stage build and fixed point, bootstrap and acceptance-interface tests,
the actual installed JS/WASM/native package, public package surface and
strict byte compilation on both ARM64 platforms. Its result is platform
acceptance, not a complete corpus or performance acceptance. It has a
45-minute job deadline. The additional bootstrap fault-injection suite, which
constructs its own full four-stage chain, stays in the exhaustive gate instead
of repeating the platform job's real build.
Actual browser and Worker execution stays in Browser compatibility and the
exhaustive artifact suite. The default compiler job does not install browser
engines or repeat those separately available tests.
Successful jobs discard their build workspace without uploading compiler
copies. Failed-job diagnostics expire after one day and are removed after
their investigation is finished.

The complete 861-record corpus for each of the three output targets remains
available locally through `make compiler-release-ci` or `make
check-stage3-targets`. The workflow's explicit `exhaustive` input selects that
full gate with its six-hour ceiling. Use it only when current measurements
fit the selected runner; cancelled and deferred records never count as
passes. The default platform job does not run or claim that exhaustive gate.

## Publication guard

Publication is a separate, explicit action. The manual release workflow calls
`tools/ci/check-release-ready.eli` before any registry publication. It requires
Compatibility, Browser compatibility, Compiler bootstrap and final outputs,
and Pages to have succeeded on the exact signed release commit. An older
successful commit cannot satisfy this guard. The package is publishable in
manifest terms; there is no `private: true` latch to remove.

The working candidate version is `0.1.3`. Preparing its quality does not authorize npm
publication, a GitHub Release or a signed release tag.

### 0.1.3 candidate quality checklist

- [x] Benchmark each version using that version's own source build; reject a
  missing compiler instead of falling back to another checkout.
- [x] Implement real workload checks before timing, use the same Vector and
  reference-identity inputs in GNU Emacs and Eliscript, and enforce PERF-02 on
  unrounded measurements before producing release assets.
- [ ] Complete the current candidate's four-dimension benchmark and resolve
  substantive performance failures. The 14 deferred strict capacity/performance
  items remain unaccepted until independently measured; they are not passed by
  producing a benchmark report.
  The latest normalized local sample has all nine medians below native
  Emacs. The 64-element tail slice measures 0.401 vs 0.738 microseconds/op;
  first and last measure 14.05 and 1.59 nanoseconds/op. Comparisons against
  0.1.2 still reject first, last, the tail slice and reference-identity equality
  (14.05 vs 8.53 ns, 1.59 vs 0.858 ns, 0.401 vs 0.161 microseconds, and
  0.374 vs 0.365 ns respectively). Sorting measures 0.387663 vs 0.531131
  ms/op; grouping, frequencies, deep zipper and numeric scoring pass in this
  sample. Raw sample variation needs diagnosis and does not automatically
  waive a slower median.
- [ ] Prepare the final 0.1.3 candidate and validate its clean source build,
  installed JS/WASM/native package and necessary functional regression.
- [ ] Complete all four required checks on the final candidate commit, obtain
  the final independent acceptance, and clean used generated outputs.

The vector `count`, `from` and `sliceVector` bridges have distinct host call
sites while their Eli algorithms, method signatures, descriptors and public
factory overrides remain unchanged. Counter-helper and native chunk-copy
experiments were rejected after slower measurements. The three emitters now
reduce immediately invoked, closed `(a, b) => a OP b` host primitives only
with two proven operands and a fixed eager-operator whitelist. Private vector
index and instance checks use that path; arbitrary `js*`, spread, extra
arguments and scoped operands keep ordinary calls. Boolean inference retains
Lisp truth for numeric zero, and module initialization guards remain intact.
This improves the retained vector path without closing the four remaining
previous-version performance failures.

Dense safe-integer collections now use a stable counting sort in both the
JavaScript runtime and the managed WASM/native provider. The path requires at
least 256 elements, a domain of at most 65,536 values, and domain width no more
than four times the input length; other inputs and custom comparators retain
the comparison-sort path. Scattering the original values preserves equal-key
order and signed zero. A separate regression runs the same source in Bun,
Node, zero-import WASM and native code with its own explicit functional budget.
The original sorted-core workload and capacity thresholds are unchanged; its
entry calls now use the compiler's emitted underscore names consistently.
Direct WASM/native `order-cases` replay at the unchanged 8,192-slot budget
still reports capacity exhaustion on both targets. These failures remain
unaccepted; neither the new test's budget nor the explicit functional profile
certifies that original capacity gate.

The primitive-emission batch passes the 338-file stage2/stage3 byte fixed
point, 36 Emacs emitter/bootstrap protections and 29 vector/core/emitter
integration tests. The first platform sweep collected a fixture-registration
failure and the old compressed-size failure without stopping the independent
checks. Isolating the new protection from the original corpus restores all 21
stage3 checks; the unchanged 11 release-integration and 8 package-surface
checks retain their passes. The corrected exact package passes all 7 install
checks under the documented allowance. These local results do not substitute
for the final commit's four required remote workflows.

## What Ships

The compressed size baseline is 5 MB. A small increase for necessary payload
can be accepted after checking duplication, growth proportion and installation
cost, with actual bytes and the reason documented before adjusting the automated
budget. Required source and debug assets take priority over shaving a few bytes.

The current clean-build package measures 5,053,538 bytes (833 entries,
35,029,810 bytes unpacked), after excluding the temporary runtime project's
nested dependency copy and project manifest. Clean installation and installed
JS/WASM/native execution pass. No identical payloads of at least 1 MB occur.
The full Lisp frontend, maintained compiler sources and source maps remain:
removing those formal capabilities to meet the old count would be incorrect.
Compared with the last installed candidate (`6992faaf`: 4,851,866 bytes), the
compressed increase is 4.16%; it is 1.07% above the original 5 MB baseline.
For this candidate, the automatic compressed limit is 5.1 MB, a bounded 2%
allowance above that baseline. Further growth requires a new payload audit;
this allowance does not waive any version-comparison or deferred strict
performance/capacity gate.

The browser loader's unbundled `dist/browser/loader.mjs` is a disposable build
intermediate. `build:browser` removes it after producing `loader.js`, and the
npm file list excludes it even if a prior interrupted build left it behind.
Published entry points and source maps required by the certified compiler
remain in the package. Development-only backend benchmarks and their numeric
runner/kernel stay in Git alongside the corpus/matrix harnesses; the npm
transport excludes them and keeps all formal compiler/native execution modules.

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

The comparison uses each target's own compiler and runtime. Its shared workload
source is compiled with that compiler; it never borrows a compiler from another
version. All versions use one identical timing-driver artifact so compiler
overhead in the measurement loop is not mistaken for workload performance.
Equality measures the public `equalValues` operation; protocol-hook and ordering
checks run outside its timed region. Tail timing measures `take-last` itself;
the returned slice is checked outside timing without adding a collection-count
dispatch to only one language's sample. Each workload verifies its actual result before timing. Vector tail
access and same-reference equality have the same inputs on GNU Emacs and
Eliscript. Both drivers warm each workload for at least 20ms and report the
median and all three samples lasting at least 100ms each; original iteration
counts remain the minimum batch sizes. Every dimension is attempted even if an
earlier measurement fails; failed dimensions do not acquire successful timings.
The release command rejects non-improvements against Emacs and any slower
median against an active prior version using unrounded values. All samples
remain visible for investigating noise; overlapping ranges do not automatically
waive a regression. Sample counts, finite positive values and exact agreement
between the reported median and samples are validated before release assets
are written. These normalized comparisons do not accept the separately
deferred strict performance/capacity gates.

`bun run benchmark:version-comparison -- --release-dir dist/release-report`
executes the four-dimension performance and verification comparison (`Emacs
Lisp` current latest, `previousMajor`, `previousMinor`, and `latest`) and
writes:

- `dist/release-report/release-summary.md` and
  `dist/release-report/release-notes-merged.md` — concise summary and
  idempotently merged release body for the main GitHub Release page
  (`gh release create --notes-file` / `gh release edit --notes-file`).
- `dist/release-report/eliscript-<version>-benchmark-report.md` and
  `dist/release-report/eliscript-<version>-benchmark-report.json` — detailed
  benchmark, artifact-size, and verification report files uploaded as GitHub
  Release assets alongside `eliscript-<version>.tgz`.

When `.github/workflows/release.yml` is dispatched (`gh workflow run release.yml
-f version="$VERSION" -f publish=true`), GitHub Actions automatically verifies the
signed tag and release tarball, runs the four-dimension benchmark against the
full tag history, uploads the versioned benchmark reports to the GitHub Release page, updates the
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
consumer_dir=$(mktemp -d)
trap 'rm -rf "$consumer_dir"' EXIT
npm pack --pack-destination "$consumer_dir"
mkdir "$consumer_dir/app" && cd "$consumer_dir/app" && npm init -y
npm install "$consumer_dir"/eliscript-*.tgz
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
deployment root: `https://eliscript.com/` serves `docs/index.html`.
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
