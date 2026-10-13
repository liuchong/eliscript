# Contributing

[Core documentation](docs/README.md) | [Specifications](specs/README.md) |
[Acceptance evidence](acceptance/README.md)

## Scope

Language, compiler, runtime, persistent data, standard-library, host-neutral
tooling, Emacs integration, and performance reinvestment are core. UI
frameworks, bundlers, site generation, publishing, and hosting are replaceable
application validation and must remain outside core dependencies and maturity
credit.

## Design First

User-visible semantics begin in a numbered specification. Update the machine
registry, compatibility classification, conformance feature, and executable
evidence in the same change. Do not preserve contradictory behavior through an
undocumented fallback or compatibility shim.

## Change Workflow

1. Read the owning specification and public-surface contract.
2. Add positive, negative, and boundary fixtures.
3. Implement the complete behavior across seed and self-hosted paths where the
   contract requires both.
4. Update current documentation and generated indexes.
5. Run focused tests, then the complete local core checks.
6. Review `git status` and the complete diff before creating a signed commit.

## Required Checks

Run these commands from the repository root:

```sh
bun install --frozen-lockfile
bun run check:contracts
make byte-compile
make test-core
```

Use `make test-applications` separately when changing an application adapter.
Do not use an application result as evidence for a core criterion.

### CI Coverage And Case Inventory

`Compatibility` preserves four complete-suite and strict-byte-compilation jobs:
Linux/macOS crossed with Emacs 29.4/30.2. The toolchain and commands remain
owned by `contracts/compatibility-matrix.json`.

`Browser compatibility` adds six required browser checks: Chromium, Firefox,
and WebKit on each operating system. Its separate contract,
`contracts/browser-compatibility.json`, reuses the exact core toolchain without
changing the retained local matrix contract. Each job runs the entire direct
WASM backend test file, installs its engine through the locked Playwright CLI,
and retains `tests.log` even when a test fails. A failed test piped to the log
must still fail the job.

The browser cases cover identical WASM bytes, no host imports, JS/WASM numeric
parity, signed zero, NaN, infinities, subnormals, integer boundaries, evaluation
order, fractional loop guards, batching, and structured rejection of unsupported
syntax. An unknown engine selection is an error rather than a fallback.
Artifact packaging separately checks credential and path patterns at every
position in Unicode text, Unicode live tokens, empty/unset tokens, and literal
near misses. Scale fixtures retain their original sizes, assertions, and
deadlines; independent immutable-output host runs may execute concurrently.
Their CI logs identify the active command and completed phase timings.
Site viewport checks use isolated contexts in parallel, retaining every wait,
layout threshold, and scriptless check. Missing browsers fail validation;
invalid engine lists are rejected and fingerprint failures release listeners.

Regenerate the browser workflow with
`bun tools/ci/render-browser-workflow.mjs --write`. Locally install all engines
using `bun node_modules/playwright-core/cli.js install --with-deps chromium firefox webkit`,
then run `ELISCRIPT_TEST_BROWSER=ENGINE bun test tests/direct-wasm-backend.test.mjs`
for each engine. Generated workflow drift and omitted engines fail the contract
gate. Acceptance requires all four core jobs and all six browser jobs for the
same commit; these semantic checks do not replace production performance gates
or prove a complete WASM compiler runtime, native backend, or 3×3 implementation.

## Documentation

Add every required core document to `contracts/documentation.json`. Internal
links and marked executable snippets are checked locally. Keep command names,
schema versions, public forms, status counts, and acceptance claims aligned
with their machine-readable owners.

## Compatibility And Evidence

An incompatible stable change requires a superseding specification, migration
instructions, executable old/new boundary evidence, and a new compatibility
baseline. Reports must identify their source revision and distinguish local
checks, supported-environment coverage, application status, and final
acceptance.
