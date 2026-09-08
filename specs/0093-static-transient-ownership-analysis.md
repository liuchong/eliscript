# 0093: Static Transient Ownership Analysis

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0015 Portable Lexical Analyzer, 0037 Async Functions and
  Await, 0038 Exception Control Flow, 0041 Host Symbiosis, Persistent Data,
  and Emacs Acceleration, 0062 Owner-token Transient Collections

## Summary

This specification adds a compiler ownership pass for the canonical transient
Vector, Map, and Set APIs. The pass treats an editable collection as a
function-local resource rather than an ordinary language value. It proves that
the resource is directly owned, that `persistent!` is a one-way transition,
and that no live builder reaches an async suspension, module export, nested
function, unknown call, or persistent value container.

The Emacs Lisp seed compiler and the Eliscript-authored bootstrap compiler run
the same analysis after lexical validation and before portable validation or
IR lowering. They accept the same programs and emit the same structured
diagnostics.

This is a language-core feature. Application frameworks, UI libraries,
bundlers, development servers, site generators, and publishing systems do not
define this analysis, are not compiler dependencies, and provide no acceptance
evidence for it. Such tools may exercise the compiled language only as
application-level validation.

## Canonical API Recognition

Ownership semantics are attached by import provenance, not by spelling alone.
The pass recognizes only imports whose normalized source suffix is:

```text
stdlib/core/transient.mjs
stdlib/core/transient.eli
runtime/core/transient.mjs
runtime/core/transient.eli
```

The standard-library names are `transient`, `conj!`, `assoc!`, `dissoc!`, and
`persistent!`. The runtime names are `transient`, `conjBang`, `assocBang`,
`dissocBang`, and `persistentBang`. Named and namespace imports retain this
provenance. An unrelated function with the same name remains an ordinary
function.

Canonical operations must be invoked directly. Passing one through `funcall`,
`apply`, a container, or another binding is rejected because the compiler can
no longer prove the operation or owner.

## Resource and State Model

`transient` must occur as the initializer of exactly one simple symbol binding.
Destructuring, returning the constructor result, embedding it in data, or
constructing it as an unbound statement is rejected.

Each resource records:

- the binding name used in diagnostics
- the lexical function that owns it
- the constructor source span
- one flow state: `active`, `consumed`, or `maybe`

`conj!`, `assoc!`, and `dissoc!` require the directly named active resource as
their first argument. Their result is statement-like and cannot become an
ordinary value. `persistent!` requires the same direct ownership and changes
`active` to `consumed`. Any later update or completion is rejected statically;
the runtime invalidation from 0062 remains the executable backstop.

Leaving a lexical scope may abandon a local active builder. It does not make
that builder visible after the scope. Returning or otherwise using the builder
as the scope result is still an ordinary reference and is rejected.

## Control-flow Rules

Branches are analyzed independently from a shared entry state. A resource is
`active` or `consumed` after the branch only when every reachable branch agrees;
otherwise it becomes `maybe`, and later transient operations reject it.

The rule applies to `if`, `when`, `unless`, `and`, `or`, and `cond`. A
`persistent!` in every branch is therefore valid, while completion in only one
branch is not.

`try` records conservative prefix states for exceptional exits. Catch entry
merges every point at which control may have left the body, then normal and
catch exits merge before `finally`. This prevents a catch clause from assuming
that a builder is editable when an earlier body prefix may already have
completed it.

Repeated loops may update an outer active builder, but may not complete it.
Otherwise the first iteration would consume a value that a later iteration can
still reach. A builder created inside the loop region is scoped to that region.

## Escape Rejection

An active or uncertain resource is rejected at these boundaries:

- `await`, after evaluating its argument and before suspension
- module `export` and `export-default`
- capture or direct use by a nested function
- an argument to an unknown call, including worker and message APIs
- array, Vector, Map, Set, object, or quoted-value construction
- assignment to another binding or reassignment of the owner binding
- indirect invocation of a canonical transient operation

The unknown-call rule is intentionally conservative. Without an effect or
borrow contract, a callee may retain, publish, serialize, or asynchronously use
its argument. The compiler therefore does not infer safety from a call merely
because its current implementation appears synchronous.

Completing the resource before `await`, then suspending with only the persistent
result in scope, is valid. This is the normal async construction pattern.

## Trusted Core Boundary

Three package-owned implementation sources currently use synchronous higher
order borrows that the language has no effect annotation for:

```text
stdlib/core/data.eli
stdlib/core/seq.eli
stdlib/core/transient.eli
```

Only these exact source suffixes bypass this pass. The exemption is not a
directive, compiler option, module annotation, import flag, or public API, so
application code cannot extend it. Runtime owner tokens, invalidation, codec
rejection, and tests continue to protect these implementations.

A future synchronous-borrow or effect specification may remove the exact
kernel list. Until then, adding another trusted source requires a new
specification revision and matching seed/self-hosted evidence.

## Diagnostics and Self-hosting

Ownership failures use structured analysis diagnostic `ELI-A0001` and preserve
the source span of the unsafe operation, resource argument, export, or
suspension. The seed implementation lives in a separate compiler pass. The
bootstrap implementation is an Eliscript module built before the portable
analyzer and imported by it.

Bootstrap fixtures include accepted ownership regions and every public
rejection category. Generated and seed analyzers must produce identical status
and message text. The bootstrap build also compiles the ownership pass itself,
keeping the implementation inside the self-hosted fixed-point path.

## Limits

This slice does not add general affine types, user-defined ownership classes,
borrow annotations, effect inference, transient parameters, interprocedural
summaries, or async-safe transients. It does not prove the three trusted core
sources. Runtime validation remains mandatory because JavaScript callers may
invoke runtime functions without compiling Eliscript.

The pass deliberately favors a small sound user model over permissive alias
analysis. New legal ownership forms require a specification before compiler
heuristics.

## Compatibility

Canonical import provenance, the direct local-owner model, one-way completion,
conservative control-flow merging, escape rejection boundaries, structured
diagnostic locations, and the closed trusted-kernel list are stable. General
borrowing, affine types, effect inference, and async-safe transients remain
future additions and cannot be introduced by silently weakening this pass.

## Acceptance Criteria

- **STA-01:** Only canonical import provenance activates transient semantics;
  same-named user functions remain ordinary.
- **STA-02:** A constructor result binds directly to one simple symbol and
  update results cannot become ordinary values.
- **STA-03:** `persistent!` performs a one-way `active` to `consumed` transition
  and every later operation is rejected.
- **STA-04:** Conditional paths merge to `active`, `consumed`, or `maybe`, with
  uncertain later use rejected.
- **STA-05:** Live resources cannot cross `await`, module export, nested
  functions, unknown calls, data construction, or assignment.
- **STA-06:** Repeated regions may update but cannot complete an outer resource.
- **STA-07:** Exceptional prefixes, catch exits, and finally execution merge
  conservatively.
- **STA-08:** Exact package-owned trusted sources are closed and cannot be
  extended by user code or compiler flags.
- **STA-09:** Seed and self-hosted analyzers accept and reject the same fixture
  matrix with byte-identical diagnostic messages.
- **STA-10:** Existing compiler, bootstrap, persistent collection, protocol,
  worker, conformance, CLI, and strict byte-compilation suites remain green.
- **STA-11:** No application framework, UI library, bundler, development
  server, site generator, or publishing tool is part of the implementation,
  dependency contract, or acceptance evidence.

## Continuation

This specification closes the static async, message, function, and module
escape item left open by 0041 and 0062. Removing the trusted kernel boundary
requires a later synchronous-borrow and effect contract rather than a larger
filename exemption.
