# 0004: Lexical Analysis and Binding Diagnostics

- Status: Implemented
- Date: 2026-08-27
- Depends on: 0001 Language and Toolchain Boundary, 0003 Implemented Core Language

## Summary

Eliscript has an explicit analysis phase between expansion and IR lowering. The
first implementation validated lexical bindings while returning expanded forms
unchanged; specifications 0006 through 0009 subsequently carried locations
through IR, direct emission, and source maps without changing this analyzer
contract.

```text
.eli source -> reader -> macro expander -> lexical analyzer -> IR lowerer
```

## Module Scope

The analyzer removes `module` wrappers for analysis without changing the forms
given to the emitter. Imports, variables, constants, and named functions are
predeclared in one module scope before expression analysis. Named functions may
therefore use recursion and mutual forward references.

The following forms introduce module bindings:

- `import` creates immutable bindings.
- `defconst` creates an immutable binding.
- `defvar` creates a mutable binding.
- `defun` and `defn` create immutable function bindings.

Exports must resolve to bindings in the module scope. A default export is
analyzed as an ordinary expression.

## Lexical Scope

Function parameters and local bindings are resolved lexically.

- Required, optional, and rest function parameters share one child scope and
  must be unique. Parameter markers do not introduce bindings.
- `let` initializers are analyzed in the parent scope before its local names
  become visible.
- `let*` initializers are analyzed in declaration order, so each initializer
  can use earlier bindings.
- Nested scopes may shadow outer names.
- Duplicate names in one scope are rejected.

`setq` and `set!` require an existing mutable binding. Imports, constants, and
named functions cannot be assignment targets. Parameters, `let` bindings, and
`defvar` bindings are mutable in the current language slice.

## Identifier Collisions

Every declaration is checked using the same deterministic identifier mapping
as the emitter. Two source names in one scope cannot map to the same ECMAScript
identifier. For example, `foo-bar` and `foo_bar` both map to `foo_bar`, so the
second declaration is rejected before emission.

## JavaScript References

Unqualified symbols must resolve to a lexical or module binding unless they are
language operators or literal values. Qualified symbols containing `/` or `.`
remain explicit JavaScript paths and do not require a lexical declaration:

```elisp
(JSON/stringify value)
```

This rule catches accidental undeclared names without hiding host interop.

## Diagnostics

Analysis failures signal `eliscript-analyze-error`, a subtype of the existing
public `eliscript-compile-error`. The located-form layer added in specification
0006 now lets diagnostics include filename, line, and column. Structured
diagnostic records remain future work.

## Acceptance Evidence

- Existing M0 output snapshots remain byte-for-byte stable.
- ERT tests cover forward references, lexical resolution, `let`/`let*`,
  duplicate bindings, output-name collisions, assignment mutability, exports,
  qualified JavaScript references, and filename-bearing diagnostics.
- The CLI compiles and Bun executes the existing end-to-end module.

## Deferred Work

- structured diagnostic records in addition to formatted conditions
