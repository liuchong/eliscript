# 0044: Public Surface Registry and Consistency Matrix

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28
- Depends on: 0040 Project Maturity Roadmap and 1.0 Acceptance Contract, 0042 Specification Registry and Conformance Evidence, 0043 Structured Compiler Diagnostics

## Summary

Eliscript now keeps a versioned, machine-readable inventory of its current
public surface in `contracts/public-surface.json`. A dependency-free checker
compares the inventory with compiler constants, source declarations, CLI
parsers, adapter exports, public and internal runtime modules,
standard-library modules, Emacs APIs, and selected documentation assertions.

The registry records what exists today at `Accepted` maturity. It does not make
every entry a permanent compatibility promise. Promotion to `Stable` still
requires the owning specification and conformance feature to be stable.

## Inventory Domains

Version 1 inventories these domains:

- reader values, reader syntax, binding markers, top-level forms, runtime
  forms, and the deterministic macro evaluator whitelist
- every public IR node kind
- every shipped command and long option
- every versioned project, diagnostic, build-report, and worker schema
- named and default JavaScript adapter exports
- named and default JavaScript runtime-module exports, with public or internal
  visibility
- every exported portable standard-library binding
- every explicitly named Emacs function that does not use the internal `--`
  convention
- every Emacs record type, classified as public or internal
- documentation assertions whose violation would reintroduce a known
  contradiction

Each language group and externally consumed schema names an implemented owning
specification. Commands and APIs remain accepted interfaces until their owner
is promoted to stable.

## Public and Internal Emacs Interfaces

An explicitly named Emacs function beginning with `eliscript-` and not
containing `--` is public at its current maturity level. Adding or removing one
requires an inventory update and review. Functions containing `--` are private
implementation details and are deliberately excluded from compatibility
tracking.

Record names do not consistently predate that convention, so the registry
classifies every `cl-defstruct` explicitly. Constructors, predicates, and
accessors generated from a public record inherit the record's visibility.
Generated functions are not repeated individually in the JSON document.

Visibility and stability are separate. A public accepted function may still
change before 1.0 with its owning specification; an internal function is never
part of the compatibility contract merely because callers can technically
reach it in Emacs.

## Exact Implementation Checks

`tools/surface/check.mjs` performs exact set comparison where the implementation
has an authoritative enumerable source:

- `eliscript-ir-node-kinds` for IR
- quoted long options in each CLI parser
- JavaScript `export` declarations for adapters and runtime modules
- the terminal `export` form in each standard-library module
- non-private `defun` and `cl-defun` declarations under compiler and tool roots
- every `cl-defstruct` declaration under those roots

Language groups also name their implementation files. Forms whose names are
ordinary symbols must occur in those sources. Reader tokens and value classes
use explicit inventory entries because their source representation is not a
one-to-one symbol declaration.

Versioned schemas use exact format/version locators in every implementation
that participates in their compatibility boundary. Documentation assertions
check both required text and known stale text.

## Generated Matrices

The default contract target prints two generated matrices:

1. conformance features and evidence counts grouped by feature domain
2. public-surface counts grouped by language, IR, command, schema, adapter,
   runtime-module, standard-library, and Emacs API domain

The matrices are generated from validated data; they are not checked-in output.
`--json` on either checker returns the same counts for automation.

Run both checks with:

```sh
bun run check:contracts
```

Run only the public-surface checker with:

```sh
bun tools/surface/check.mjs
bun tools/surface/check.mjs --json
```

## Change Workflow

When a tracked interface changes:

1. update its owning language, compiler, adapter, or library specification
2. update `contracts/public-surface.json` in the same change
3. add or update executable conformance evidence for observable behavior
4. run both contract checkers
5. run the complete suite before changing implementation status or stability

An inventory change alone does not justify a public behavior change. It makes
the change visible so specification and compatibility review cannot be
bypassed accidentally.

## Initial Baseline

The first validated surface contains:

- 6 language groups with 149 entries
- 51 IR node kinds
- 5 commands with 20 long options
- 6 versioned schemas
- 4 JavaScript adapters with 17 exports including defaults
- 2 JavaScript runtime modules with 8 exports: one provisional public module
  and one internal test adapter
- 4 standard-library modules with 39 exports
- 91 Emacs public functions
- 22 Emacs records, of which 12 are public and 10 internal

These counts describe the current accepted implementation, not the eventual
1.0 surface. M8 may deliberately supersede array-backed collection semantics
as persistent collections land; those changes must remain visible here.

## Acceptance Evidence

- The checker validates the complete current repository inventory.
- Negative tests remove IR, standard-library, adapter, runtime, and Emacs API
  entries and add an undeclared CLI option; every drift produces a targeted
  failure.
- A documentation negative test proves known contradictions fail the check.
- The default contract target runs the checker before ERT, Bun, bootstrap, and
  CLI integration suites.
