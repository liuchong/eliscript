# 0180: General Tail-Call Optimization

- Status: Draft
- Implementation: Pending
- Depends on: 0004 Lexical Analysis and Binding Diagnostics,
  0007 Explicit Compiler Intermediate Representation,
  0015 Portable Lexical Analyzer,
  0017 Portable IR Lowering,
  0018 Portable ESM and Source Map Emission,
  0064 Stack-safe Loop and Recur,
  0149 Portable Functional Combinators,
  0171 Multi-arity Functions,
  0172 Local Recursive Functions

## Purpose

Eliscript already provides two explicit constant-stack mechanisms:

- `recur` lowers a transfer to the nearest function or lexical loop into a
  labeled JavaScript loop;
- `trampoline` iteratively executes a chain of zero-argument thunks and can
  express mutual recursion.

Ordinary function calls retain ordinary JavaScript call semantics, even in tail
position. This draft records future compiler work for eliminating eligible
ordinary tail calls without relying on JavaScript-engine tail-call support.

Nothing in this draft changes the stable `recur` or `trampoline` contracts, and
the draft contributes no implementation, verification, stabilization, or final
acceptance progress.

## Candidate Scope

The design investigation has two separable candidates:

1. **Direct self-tail-call elimination.** A lexically resolved call to the
   current function in a proven tail position may reuse the existing
   recurrence-loop lowering.
2. **Mutual tail-call elimination.** A closed strongly connected set of
   functions may lower to one generated dispatch loop whose state identifies
   the next function and complete argument vector.

The first candidate is smaller and may be accepted independently. The second
must not be inferred merely because functions refer to one another; it requires
closed call-target identity and a complete cross-function control-flow proof.

## Required Semantic Boundaries

Any accepted design must preserve:

- exactly-once, left-to-right evaluation of the callee and arguments;
- lexical function identity, arity dispatch, optional/rest parameters, and
  destructuring behavior;
- ordinary return values, thrown values, `finally` execution, and async/await
  ordering;
- source-located diagnostics and useful generated Source Maps;
- exported function identity and JavaScript interoperability;
- byte-identical Seed and self-hosted compiler output;
- identical observable behavior under maintained Bun and Node hosts.

Calls through mutable values, unknown imports, object properties, computed
callees, host callbacks, reflective application, or dynamically escaping
function values are not automatically eligible. A proof failure must retain an
ordinary call rather than guess.

## Interaction With Existing Mechanisms

Explicit `recur` remains the predictable, allocation-free source construct for
self recurrence and lexical binding loops. The compiler must not silently
weaken its placement, arity, or exception-boundary diagnostics.

`trampoline` remains the portable user-controlled mechanism for dynamic or
open-ended thunk chains. A future mutual-call optimizer may use a compiler-owned
dispatch representation, but it must not change the public meaning of returning
an ordinary function value.

Tail-call analysis occurs after macro expansion and lexical resolution. It must
be represented explicitly in IR rather than hidden in string emission. The
compatibility emitter and production IR emitter remain independent oracles
until any new representation reaches the normal compatibility freeze.

## Open Design Decisions

Before implementation, a follow-up revision must decide:

- whether optimization is always enabled, compiler-configurable, or exposed by
  an explicit source annotation;
- whether direct self calls become semantically guaranteed stack-safe behavior
  or remain an implementation optimization;
- whether mutual optimization is limited to local `letfn` groups, module-local
  declarations, or another statically closed boundary;
- how multi-arity dispatch selects the next recurrence state;
- whether async tail calls are transformed or deliberately excluded;
- how stack traces and debugger stepping represent eliminated calls;
- which code-size and dispatch costs prevent an otherwise valid transform.

These decisions require measured generated-code and runtime evidence. Host
support for proper tail calls cannot be assumed.

## Planned Acceptance Inventory

Implementation may begin only after the open decisions are resolved. A complete
slice must then prove:

1. eligible direct self-tail calls execute at least one million transfers with
   constant JavaScript stack usage;
2. non-tail self calls remain ordinary calls;
3. eligible mutual tail calls execute at least one million cross-function
   transfers with constant JavaScript stack usage;
4. open, computed, mutable, imported, and escaping call targets are not
   unsafely transformed;
5. argument evaluation, arity selection, destructuring, exceptions, and async
   behavior match the unoptimized reference corpus;
6. nested functions and shadowed names resolve to the correct call target;
7. generated IR, ESM, Source Maps, and diagnostics match between Seed and
   self-hosted compilers;
8. Bun and Node execute identical positive and negative corpora;
9. generated size and execution measurements satisfy explicit source-bound
   budgets;
10. existing `recur`, `trampoline`, recursion, interop, and bootstrap suites
    remain green.

Until all applicable items pass on one source identity, Eliscript must continue
to document ordinary tail calls as ordinary JavaScript calls.
