# 0016: Portable Macro Expander

- Status: Stable
- Implementation: Implemented
- Date: 2026-08-28

## Summary

Generation 1 now has a macro expander written in Eliscript. It consumes the
portable syntax nodes produced by the generated reader, removes `defmacro`
forms, recursively expands macro calls, and passes explicit syntax directly to
the portable lexical analyzer.

The portable expander does not call JavaScript `eval` and does not require an
Emacs runtime. Macro bodies execute in a deterministic interpreter over syntax
values. The Emacs Lisp seed now interprets the same subset over native data;
neither generation exposes arbitrary host evaluation.

## Macro Values

The evaluator operates on syntax nodes rather than converting through host
symbols, cons cells, or arrays. A macro argument is its unevaluated syntax
node. List-producing operations return list nodes, rest parameters receive a
list node, and predicates and arithmetic return literal nodes.

The supported parameter model is:

- required symbol parameters
- symbol parameters after `&optional`, defaulting to `nil`
- one trailing symbol after `&rest` or `&body`

Definitions are registered in source order and scoped to one `expand-module`
call. A macro can therefore use earlier definitions but cannot leak into a
later compilation.

## Portable Evaluation

The interpreter supports the syntax-building and computation needed by the
current macro contract:

- `quote`, backquote, comma, and comma-splicing
- `if`, `when`, `unless`, `cond`, `progn`, `and`, and `or`
- `let`, `let*`, and local `setq`
- `list`, `vector`, `cons`, `car`, `cdr`, `nth`, `append`, and `length`
- type, null, identity, and structural equality predicates
- basic arithmetic and numeric comparisons
- `symbol-name`, `intern`, `gensym`, `concat`, and explicit `error`

Backquote handles nested quotation depth and collection splicing. Unsupported
host functions fail explicitly instead of escaping into JavaScript or Emacs.
This makes macros reproducible from their arguments and source in both
generations.

The expander owns one deterministic generated-name allocator per module.
Explicit `gensym`, trailing-`$` symbols in active quasiquote templates, source
collision avoidance, and caller-capture rules are specified in
[0065-deterministic-macro-generated-names.md](0065-deterministic-macro-generated-names.md).

The portable subset is intentionally smaller than Emacs Lisp. A macro cannot
depend on buffers, environment variables, process state, or an unlisted host
function. Specification 0124 adds one explicit compiler-context capability for
exactly declared file snapshots; it does not grant ambient filesystem access.

## Expansion Walk

The expander understands Eliscript syntax boundaries:

- quoted data is opaque
- function parameters, binding names, assignment targets, and module names are
  preserved
- object and property keys remain literal where the language defines them as
  keys
- bodies, initializers, tests, values, computed keys, and call arguments are
  recursively expanded
- a macro result at module scope is processed again as a top-level form

Macro definitions disappear from the result. Expansion recurses until the
operator is no longer a registered macro, with a limit of 100 calls along one
path.

## Source Spans

The seed expander strips locations before invoking a macro and assigns the
macro call's span to every node in the result. The portable expander preserves
that contract: templates and substituted arguments are recursively copied onto
the call span before further expansion.

Handwritten structure retains its original nested spans. Rebuilt vectors,
bindings, clauses, and calls retain their parent spans while unchanged names
and literal keys retain their own spans. Downstream diagnostics and source maps
therefore behave identically across the two front ends.

## Host Boundary

Standard JavaScript `Map` objects store macro and local environments. Two tiny
raw JavaScript functions throw and catch `Error` so macro failures can be
wrapped with the public filename, line, column, and macro name. There is no
dynamic code evaluation in the generated expander.

The syntax accessor for literal values reads the property directly. This is
required to preserve the distinction between a present `null` value and an
absent field whose value is `undefined`.

## Shared Conformance

`tests/fixtures/bootstrap-expander.json` drives both implementations. The
Emacs oracle reads and expands every case, normalizes complete syntax trees,
and emits exact diagnostics. Bun builds and imports the generated reader,
expander, and analyzer, then compares:

- recursively expanded syntax and source spans
- required, optional, rest, and body parameter behavior
- quotation, splicing, list construction, local computation, and conditions
- recursive macro calls and generated top-level declarations
- explicit and automatic generated symbols, collision avoidance, and capture
  boundaries
- quoted and syntax-specific expansion boundaries
- definition, nesting, execution, and depth-limit diagnostics
- all thirteen bootstrap compiler modules, including `formatter.eli`,
  `emitter.eli`, and `compiler.eli`
- acceptance of every valid expanded result by the portable analyzer

The position oracle now indexes each source once, keeping normalization linear
as portable compiler sources grow.

## Downstream Integration

The portable front end covers symbol mapping, syntax, reading, macro expansion,
and lexical analysis. Portable IR lowering is specified in
[0017-portable-ir-lowering.md](0017-portable-ir-lowering.md); direct ESM and
Source Map emission is implemented in
[0018-portable-emission.md](0018-portable-emission.md). The host-neutral
compiler driver and fixed point are implemented in
[0019-self-hosted-compiler.md](0019-self-hosted-compiler.md).

## Compatibility Freeze

Macro expansion remains a deterministic interpreter over explicit syntax. The
supported evaluator subset, source-order definition scope, quotation behavior,
call-site spans, generated-name allocator, explicit compiler-context
capabilities, and recursion limit are stable across both compiler generations.

The expander must not use ambient host state or dynamic evaluation. New macro
operations require an explicit deterministic contract and shared seed/self-host
conformance evidence.
