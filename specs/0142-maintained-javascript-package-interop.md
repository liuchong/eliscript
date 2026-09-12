# 0142: Maintained JavaScript Package Interop Fixture

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-08
- Depends on: 0041 Host Symbiosis, Persistent Data, and Emacs Acceleration,
  0073 Native JavaScript Container Interop,
  0095 Stable Persistent Value and Explicit Host Container Boundary,
  0123 Stable ECMAScript Module Import Contract

## Summary

Eliscript maintains an independent ECMAScript package fixture that accepts only
ordinary JavaScript containers. A second package imports Eliscript by package
name, constructs persistent values, converts them at the boundary, and passes
the resulting plain Object, Array, Map, and Set to that consumer.

This closes the maintained-package portion of PD-07 without making a particular
framework, package manager, bundler, or application part of the language core.
The fixture passes every cell required by the local acceptance profile in
specification 0179; optional Linux target cells remain future compatibility
evidence rather than a blocker for this stability claim.

## Package Boundary

The fixture consists of two private ESM packages:

- `@eliscript-fixtures/native-container-consumer` represents a normal host
  package. It imports no Eliscript module and validates values only with
  standard JavaScript Object, Array, Map, and Set operations.
- `@eliscript-fixtures/interop-consumer` imports the public
  `eliscript/runtime/literals.mjs` and `eliscript/stdlib/interop/js.mjs`
  package paths, performs one explicit deep conversion, and calls the host
  package.

The test installs both packages into a fresh temporary package graph with
package-name resolution. It does not rely on repository-relative imports from
the consumer and does not invoke a network package registry.

## Value Contract

The Eliscript-facing package constructs a persistent root Map containing a
Vector, Map, and Set. `to-js-object` with `{ deep: true }` must expose:

- one plain root Object
- one native Array for the Vector
- one native Map for the nested persistent Map
- one native Set for the nested persistent Set

The host package reads those containers through standard APIs and then mutates
the converted Array, Map, and Set. The original persistent Vector, Map, and Set
must retain their exact pre-call values. This proves both representation
compatibility and snapshot isolation at a realistic package boundary.

## Compiler and Host Coverage

The fixture builds the complete interop dependency closure with both the Emacs
seed compiler and the self-hosted compiler. Every generated ESM module and
Source Map must be byte-identical between generations.

Each generation is installed as the `eliscript` dependency of a fresh consumer
package and executed under both Bun and Node. All four reports must be deeply
equal. The test runs directly on the selected local toolchain; repetition in
the supported operating-system and Emacs-version cells is owned by the
compatibility matrix rather than simulated inside this test.

## Core Boundary

The fixture is host-library evidence, not application evidence. It has no UI,
framework, bundler, development server, publishing system, browser adapter, or
network dependency. The consumer is deliberately replaceable and cannot add
language semantics; it only observes the public package and conversion
contracts.

## Acceptance Criteria

- **JPI-01:** The host package imports no Eliscript implementation and accepts
  the boundary solely as native Object, Array, Map, and Set values.
- **JPI-02:** The calling package resolves both Eliscript and the host consumer
  by declared package names from a fresh package graph.
- **JPI-03:** The caller constructs persistent Vector, Map, and Set values and
  performs one explicit deep `to-js-object` conversion.
- **JPI-04:** The host package reads and mutates every converted container with
  ordinary JavaScript APIs while the persistent sources remain unchanged.
- **JPI-05:** Seed and self-hosted interop dependency closures produce
  byte-identical ESM and Source Maps.
- **JPI-06:** Bun and Node execute both compiler generations with deeply equal
  reports.
- **JPI-07:** The fixture requires no framework, bundler, package registry,
  network service, container, virtual machine, or hosted validation service.
- **JPI-08:** PD-07 requires this fixture to pass every cell in the explicit
  local acceptance profile; optional target cells remain reported separately.
