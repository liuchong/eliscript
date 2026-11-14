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
The installed-package check keeps npm cache data and logs inside its own
attempt directory, overriding inherited cache paths for its child processes.
It pins npm's installation mode and prefix to each child workspace.
It checks npm's resolved paths before packing and installing, so checkout
cleanup also removes those package blobs and logs without touching user caches.

Tool bootstrapping retains the runtime prerequisites and the maintained batch
launcher on the single-file CLI path, then reuses one JavaScript compiler
process for the remaining inventory. Every source still uses `compileFile`
with its source map; independent errors are collected in inventory order.
The parent validates all result bindings and the exit status before restoring
executable wrappers. Runtime warnings use a separate, disposable stderr file.
Runtime deployment collects each input inode with one following `stat` call;
output paths still use `lstat` to reject symlinks and source aliases. Source,
module and map bytes are reauthenticated on every deployment without caching.

To compare the process strategies from absent outputs, run `make clean-all`
and then `emacs -Q --batch -L compiler -L tools -l
tools/testing/bootstrap-parity.el`. This builds both strategies from the same
current sources and compares generated modules, maps, macro-origin sidecars,
symlink targets and file modes. The measured 2,259-file comparison was identical:
84.991 seconds serial versus 25.034 seconds batched (3.395x). This measures
bootstrap overhead; it does not satisfy a compiler or runtime performance gate.

Compiler microbenchmark fingerprints include both maintained and generated tool
files, all nine runtime capsule sources and outputs, and the Unicode generator
inputs. Changing or removing a required runtime input invalidates a current
report even when the compiler source text itself is unchanged.
Formal release measurements must use the authenticated, prepared Stage3
compiler and runtime byte tree. `make bootstrap-backends` supplies the seed
and development tools; its runtime bytes cannot stand in for the prepared
release runtime. A measurement must reject a missing or different prepared
product rather than rebuild seed in place. The controlled comparison must
compile both arms with that same final compiler. This requirement and the
remaining report acceptance are tracked as PERF13-08 in the
[active release checklist](bootstrap-0.1.0-plan.md#013-当前性能收口固定分母-14-份报告).
The four Emacs report bridges keep process status notifications out of their
JSON stream. The artifact-stage package test exercises their real prepared
gates and resource cleanup without running the report workloads; full reports
are still measured separately with their original datasets and budgets.

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
  substantive performance failures. Of the 14 retained performance/capacity
  reports, nine now have passing measurements authenticated against the final
  Stage3: compiler runtime scanning, IR-kind decisions, binary comparison
  emission, HAMT layout, core performance, Emacs analysis, analysis soak,
  worker lifecycle soak and the full 256 MiB value-stream probe. The probe
  retains its original 2048/1024/2560 MiB budgets; HAMT retains the measured
  32/24 thresholds across Bun, Node 24 and Chrome. The four Emacs workloads
  were measured again after the process-sentinel fix; their real gates and
  cleanup also pass the artifact-stage regression.
  Five report units failed numerically under that same final Stage3:
  Reader complete-compiler speedup 1.030099 against 1.08; SourceMap
  pipeline/compiler 1.028734/0.982600 against 1.5/1.08; indentation 4.446816
  against 10; transient Vector 0.772851 against 1.5; mark location 1.091314
  against 1.75. Transient allocation 0.269549 passes its separate 1/3 bound.
  Removing redundant loop-control work from the shared indentation and
  location checksums preserves their checksum values and original parameters.
  One full measurement per changed harness still fails: indentation 5.374567
  against 10 and location 1.039105 against 1.75. These are harness-cost
  reductions, with no production emitter speedup or passing decision claimed.
  Core now passes all 11 original budgets across three independent processes
  and seven samples per path; clean-build median/maximum/spread are
  19.187 ms/22.817 ms/1.223. The previous failures remain in the active plan.
  The five historical passing reports retain their accepted Git bytes and do
  not establish current acceptance. Their current-source checks still reject
  the stale evidence; failed fresh measurements are recorded in the checklist.
  Failed measurements retain their original thresholds; no unchanged failure
  is rerun to obtain a favorable sample.
  The latest local comparison isolates every workload in its own process in
  both languages, retaining the original timed expressions, calibration and
  sample counts. Each worker has a ten-second deadline; independent failures
  are collected before the run fails without printing a partial report.
  The final-Stage3 comparison has all nine medians below native Emacs, and six
  also pass against 0.1.2. It rejects take-last (0.179785 vs 0.148862
  microseconds/op), zipper (1.095898 vs 1.057777 ms/op), and numeric scoring
  (1.506457 vs 1.504721 ms/op), using the unrounded values. Last-element access
  and reference equality pass this run; their earlier failures remain in the
  checklist and are not claimed as permanently resolved JIT behavior.
  The prior major dimension is absent in 0.x. This completed comparison is not
  final candidate acceptance. Sample variation, clock calibration and process
  isolation do not waive a slower unrounded median or close the performance gate.
- [ ] Prepare the final 0.1.3 candidate and validate its clean source build,
  installed JS/WASM/native package and necessary functional regression.
- [ ] Complete all four required checks on the final candidate commit, obtain
  the final independent acceptance, and clean used generated outputs.

Already-cased ASCII now returns the identical primitive text; changed ASCII
and every non-ASCII value still use the selected Unicode 15.1/16/17 tables
and final-sigma rules. Full scalar and sigma checks plus receiver/prototype
protections pass. The SourceMap iterator expansion now keeps mutable cursor
state local to each loop and preserves cached-next, dynamic character-method
reads and IteratorClose error priority. Its pipeline improves on the preceding
candidate, but both original SourceMap gates remain unaccepted. Earlier newline
and numeric-comparison variants, the Vector unary-factory experiment and the
indentation micro-optimization were withdrawn without sufficient benefit.
Protocol test fixtures now establish their runtime package scope explicitly,
so Bun and Node execution also works from the system temporary directory.

The current compact installation check passes all eight checks, including the
prepared Emacs bridges, installed public CLI and JS/WASM/native outputs, at
4,967,449 bytes. Seed-only
`dist/bootstrap/runtime` and its private self-named package scope are excluded;
they must not duplicate or shadow the final installed runtime. The original
5 MB guard remains unchanged.
Emacs byte-code files are excluded independently of local build leftovers.
The installation gate places a disposable `.elc` probe inside the included
compiler tree before packing and rejects any byte-code payload in the tarball.

The vector `count`, `from` and `sliceVector` bridges have distinct host call
sites while their Eli algorithms, method signatures, descriptors and public
factory overrides remain unchanged. Counter-helper and native chunk-copy
experiments were rejected after slower measurements. The three emitters now
reduce immediately invoked, closed `(a, b) => a OP b` host primitives only
with two proven operands and a fixed eager-operator whitelist. Private vector
index and instance checks use that path; arbitrary `js*`, spread, extra
arguments and scoped operands keep ordinary calls. Boolean inference retains
Lisp truth for numeric zero, and module initialization guards remain intact.
Closed method/getter wrappers around direct synchronous Eli lambdas can
also fuse into native concise methods, preserving their name, length,
undefined defaults, non-constructibility and dynamic receiver. Qualified
`arguments.*`/`arguments/*`, opaque JS, declarations, async callbacks and
non-simple parameters keep the ordinary wrapper. Literal object keys and
quoted symbols do not count as implicit `arguments` reads; malformed lambda
forms retain their original errors. Conditional `and`/`or`/`not` emit direct
logical tests with Lisp truth conversion at every leaf, including through the
seed emitters' deep-tree continuation path. Value-context short circuits keep
their original returned values. These changes improve hot sequence dispatch
without closing the previous-version performance gate. Vector leaf iteration,
reduction and copying read chunk lengths directly: a missing internal chunk
raises `TypeError` rather than becoming zero-length work that cannot advance.
Vector copy allocation has a separate Eli helper while continuing to read
the live host Array constructor and call the public `PersistentVector.from`.
Private numeric relation bridges use closed comparison primitives and direct
Number type checks; mixed operands retain the original conversion path.

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

The current emitter batch passes 55 Emacs protections and 35 runtime/emitter
integration tests. The related Node checks pass 69 cases, and the source
archive checks pass all 32 cases through the retained unaffected results plus
the corrected recipe's focused replay. The dense ordering fixture is registered
in the official build and bound to its actual Bun/Node/WASM/native consumer;
source authentication alone never asserts that consumer passed. All four
consumer cases also pass. The complete 861-record corpus authenticates without
missing adapters. A build from absent generated outputs passes the 338-file
stage2/stage3 fixed point and all six platform steps in 372.6 seconds, with a
4.51 GB accounted process-tree peak. These local results do not substitute
for the final commit's four required remote workflows.

## What Ships

The compressed size baseline is 5 MB. A small increase for necessary payload
can be accepted after checking duplication, growth proportion and installation
cost, with actual bytes and the reason documented before adjusting the automated
budget. Required source and debug assets take priority over shaving a few bytes.

The current clean-build package measures 4,758,372 bytes (706 entries,
32,041,705 bytes unpacked). Clean installation and installed JS/WASM/native
execution pass all seven checks. No identical payloads of at least 1 MB occur.
The full Lisp frontend, maintained compiler sources and source maps remain.
Building from absent generated outputs excludes incremental bootstrap and
diagnostic leftovers, reducing the package below the original 5 MB baseline;
the automatic limit is therefore restored to 5 MB. Compared with the last
installed candidate (`6992faaf`: 4,851,866 bytes), the package is 1.93% smaller.
Any future increase still requires a payload audit and does not waive version
comparison or deferred strict performance/capacity gates.

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
Eliscript. Both drivers warm each workload for at least 20ms, then increase
batch sizes until three consecutive calibration batches each span at least
1ms. Both drivers and report validation use the original minimum call counts
in `tools/performance/version-comparison-minima.json`; a report cannot replace
these minima. The 16,777,216-call cap
fails explicitly if a sufficiently long batch cannot be measured. The report
records actual calls per batch and all three calibration times. This avoids
summing hundreds of thousands of sub-microsecond stopwatches for tiny cases;
it does not remove JIT or loop overhead or waive a slower median.
Both drivers then report the median and all three samples lasting at least
100ms each. Every dimension is attempted even if an
earlier measurement fails; failed dimensions do not acquire successful timings.
The release command rejects non-improvements against Emacs and any slower
median against an active prior version using unrounded values. All samples
remain visible for investigating noise; overlapping ranges do not automatically
waive a regression. Sample counts, finite positive values and exact agreement
between the reported median and samples are validated before release assets
are written. Every active dimension requires raw samples and calibration;
deduplicated versions copy both from their measured source dimension.
These normalized comparisons do not accept the separately
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
npm --cache "$consumer_dir/npm-cache" --logs-dir "$consumer_dir/npm-cache/_logs" pack --pack-destination "$consumer_dir"
mkdir "$consumer_dir/app" && cd "$consumer_dir/app"
npm --cache "$consumer_dir/npm-cache" --logs-dir "$consumer_dir/npm-cache/_logs" init -y
npm --cache "$consumer_dir/npm-cache" --logs-dir "$consumer_dir/npm-cache/_logs" install "$consumer_dir"/eliscript-*.tgz
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
