# 0118: Framework-neutral Library Interoperation

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-01
- Supersedes: 0010

## Summary

Eliscript integrates UI frameworks and other host libraries through explicit
ESM imports, ordinary bindings, ordinary calls, and the general JavaScript
interop surface. The language core, compiler IR, runtime, and standard library
do not own framework syntax or inject framework runtimes.

This specification replaces the React-specific language forms defined by 0010.
Application adapters remain useful validation, but they cannot define core
language maturity or become a prerequisite for compiling ordinary programs.

## Core Boundary

The following names are ordinary bindable identifiers:

- `defcomponent`
- `jsx`
- `fragment`

They have no reader, expander, analyzer, lowering, IR, emitter, runtime, or
standard-library privilege. In particular, the core implementation must not:

- reserve framework component or element forms;
- create `react-element`, `react-fragment`, or equivalent framework IR nodes;
- infer or inject `react/jsx-runtime` or another framework package;
- require a bundler, development server, renderer, or UI runtime;
- count application-framework integration as core language evidence.

The same rule applies to future frameworks. A generally useful capability must
first be expressed as a framework-neutral language or interop contract.

## Explicit ESM Interoperation

Applications import the host API they consume and invoke it normally:

```elisp
(module ui-example
  (import "react/jsx-runtime" jsx jsxs Fragment)

  (defun ui-props (props children)
    (if (= (length children) 0)
        (or props (js-object))
      (object-assoc
        (or props (js-object))
        "children"
        (if (= (length children) 1) (js-nth 0 children) children))))

  (defun ui-element (type props &rest children)
    (let ((resolved (ui-props props children)))
      (if (> (length children) 1)
          (js-call jsxs type resolved)
        (js-call jsx type resolved))))

  (defun View (props)
    (js-call jsx "h1" (js-object :children (get props :title "Hello"))))

  (export View))
```

The example is application code. `jsx`, `jsxs`, and `Fragment` are imported
bindings, string host tags are ordinary string values, props are ordinary host
objects, and keys or children follow the imported library's public calling
convention.

Applications may define local functions or macros that improve ergonomics.
Such helpers must compile through public Eliscript forms and must remain
replaceable without changing the compiler.

## Migration From Baseline 1

Compatibility baseline 2 intentionally removes the stable surface from 0010:

- replace `defcomponent` declarations with `defun` or an application macro;
- import the selected UI library or runtime explicitly;
- replace special `jsx` and `fragment` forms with ordinary function calls;
- use string values for host tags and explicit values for component bindings;
- construct props, children, and keys according to the host library API.

This is a deliberate incompatible correction before 1.0. Baseline 1 remains a
historical description, while baseline 2 is the current compatibility target.

## Validation

- Seed and self-hosted compilers expose the same framework-neutral surface.
- Public surface registries contain no framework forms or IR nodes.
- Core source scans reject framework imports and framework-specific compiler
  identifiers.
- A UI example compiles and renders after importing its runtime explicitly.
- `jsx`, `fragment`, and `defcomponent` can be declared and called as ordinary
  user bindings.

Application execution remains separate validation. Core conformance uses
ordinary binding tests and a generic local ESM provider executed across the
seed and self-hosted compilers under Bun and Node.

## Compatibility Freeze

Framework-associated names remain ordinary user bindings. Host libraries are
accessed only through explicit ESM imports, ordinary calls, and the general
JavaScript interop surface; the compiler does not reserve framework syntax,
create framework IR, inject runtimes, or require application tooling. Any
future ergonomic layer must remain replaceable application code or define a
separate framework-neutral language contract.

## Acceptance Criteria

- **FNL-01:** Framework-associated names compile as ordinary definitions and
  calls without privileged reader, analyzer, IR, or emitter behavior.
- **FNL-02:** Generic explicit ESM imports produce equivalent seed and
  self-hosted artifacts and execute identically under Bun and Node.
- **FNL-03:** Core compiler, runtime, and standard-library sources contain no
  application-framework dependency or runtime injection.
- **FNL-04:** Application adapters and framework execution remain outside core
  dependencies, conformance evidence, and maturity credit.
- **FNL-05:** The conformance checker rejects application-only test evidence
  attached to a core feature.
