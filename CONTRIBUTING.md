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
