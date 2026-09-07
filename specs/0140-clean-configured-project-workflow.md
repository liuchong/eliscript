# 0140: Clean Configured Project Workflow

- Status: Accepted
- Implementation: Implemented
- Date: 2026-09-08
- Depends on: 0106 Versioned Project Request Configuration,
  0111 Self-hosted Project Command and Configuration,
  0114 Deterministic Concrete-syntax Formatter,
  0116 Read-only Project Check and Emacs Diagnostics,
  0121 Host-neutral Project Watch Events,
  0133 Verified Installation and Daily Development Guide,
  0134 Versioned Core Acceptance Corpus and Truthful Audit Run

## Summary

Eliscript maintains one integration test that executes the complete configured
project workflow through public commands. A canonical two-module version 2
project is copied to bounded temporary storage, format-checked, checked without
artifacts, built, executed as standard ESM, watched through a real source
change, and exercised with explicit command-line overrides.

The test is part of `make test-core`. The source-bound acceptance runner rejects
a dirty checkout before starting and records cleanliness again after the core
suite, so a retained passing run proves this workflow from one exact clean
source commit. This specification closes AC-08. It does not claim the separate
cross-operating-system, alternate-version, or final acceptance gates.

No application framework, bundler, publishing system, hosting service,
development server, container, virtual machine, or remote provider contributes
implementation or evidence.

## Canonical Project

The fixture is `examples/getting-started`, the same project embedded in the
maintained onboarding guide. It contains `src/main.eli`, `src/math.eli`, and a
version 2 `eliscript.json` with one configured entry, one contained source
root, one output directory, Source Maps, and cache reuse.

The integration test snapshots the configuration and both source files before
execution. All generated artifacts remain under the temporary project, the
watch mutation is restored, the original bytes are rechecked, and the complete
temporary tree is removed in `finally`.

## Workflow

The maintained sequence is:

1. run `eliscript-format --check` for every source and require no mutation
2. run `eliscript-check --json --config eliscript.json`, require both modules,
   and prove that no configured output directory was created
3. run `eliscript-build --json --config eliscript.json`, require the expected
   graph and output identities, and execute `dist/main.mjs` to obtain `42`
4. run `eliscript-watch --config eliscript.json --json`, validate the ready
   record, modify `math.eli`, validate the normalized change, restore the file,
   signal shutdown, and await a clean exit
5. add one temporary override entry, replace configured source and output paths
   with valid decoys, then prove check and build precedence for explicit
   `ENTRY`, `--root`, `--out-dir`, and `--no-cache`
6. execute the overridden standard ESM and obtain `84`

Every ordinary child has a bounded deadline. The long-lived watcher is owned
by the test, stopped by its exact process handle, force-terminated only after a
bounded grace period, and awaited before cleanup.

## Precedence

With `--config`, explicit command-line `ENTRY`, `--root`, `--out-dir`, and
repeated `--portable` values replace the configured values. `--no-cache` only
disables cache reuse. Relative configuration paths resolve from the
configuration directory; relative command-line paths resolve from the current
working directory. The maintained guide states this rule and the integration
test proves the entry, root, output, and cache cases in one invocation.

## Acceptance Criteria

- **CPW-01:** One version 2 configured multi-module fixture is shared by the
  guide and executable integration test.
- **CPW-02:** Public format-check succeeds for every fixture source without
  changing its bytes.
- **CPW-03:** Public project check reports the complete two-module graph and
  creates no output or cache artifacts.
- **CPW-04:** Public project build emits the expected standard ESM graph and
  executing its configured entry prints `42`.
- **CPW-05:** Public configured watch emits a valid ready record and normalized
  source modification, then exits cleanly through an owned process handle.
- **CPW-06:** Explicit entry, root, output-directory, and cache flags override
  intentionally different valid configured counterparts, and the resulting
  entry prints `84` instead of the configured decoy value.
- **CPW-07:** The maintained guide documents the complete precedence and path
  resolution rule.
- **CPW-08:** The test bounds process lifetime and temporary state, restores
  source bytes, and removes all artifacts in every outcome.
- **CPW-09:** A retained acceptance run binds the default core suite to one
  clean source commit before and after execution.
- **CPW-10:** Application and remote execution infrastructure contributes no
  implementation, evidence, or maturity credit.
