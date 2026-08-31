# 0065: Deterministic Macro-generated Names and Capture Rules

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-31
- Depends on: 0005 Compile-time Macros, 0006 Located Forms and Diagnostic
  Positions, 0016 Portable Macro Expander, 0035 Deterministic Seed Macros

## Summary

This specification adds deterministic generated symbols to the compile-time
macro language. A macro may allocate a symbol explicitly with `gensym`, or use
a trailing `$` on a symbol inside an active quasiquote template. Both compiler
generations allocate the same names, avoid every source symbol in the module,
and produce byte-identical JavaScript and Source Maps.

This is a generated-name and capture contract, not a claim of fully hygienic
macros. Ordinary literal symbols in a template still resolve at the macro call
site and may deliberately capture a caller binding. Generated symbols provide
the opt-in mechanism for private macro bindings that must not capture or be
captured accidentally.

The surface is provisional during M8. The source marker, generated spelling,
and explicit capture model must be evaluated in real standard-library macros
before they can become stable.

## Module Name Allocator

Each `expand-module` call creates one generated-name allocator. Its counter
starts at zero and is shared by every macro invocation in source expansion
order. A later compilation starts with a fresh allocator, so no process,
editor, or previous-build state can affect output.

Before expansion begins, the compiler recursively collects every source symbol
spelling in the module, including symbols inside definitions and quoted data.
Those names are reserved. Macro evaluation also reserves every symbol returned
by `intern`, including names assembled from strings that did not occur as
source symbols.

To allocate a symbol with prefix `P`, the compiler increments the module
counter and tests `P$GN`, where `N` is the new counter value. A reserved
candidate is skipped by incrementing again. The accepted candidate is reserved
immediately. The allocator therefore guarantees uniqueness against:

- handwritten source names in the complete module
- earlier explicit or automatic generated names
- symbols dynamically constructed by an earlier `intern`
- alternate source spellings that would otherwise collide only when they are
  the exact generated symbol

Generated symbols pass through the ordinary analyzer and output-name mapping.
The `$G` separator is preserved by ECMAScript identifier emission and is not
introduced by the normal hyphen-to-underscore source-name mapping.

## Explicit `gensym`

The macro evaluator accepts:

```elisp
(gensym)
(gensym "slot")
(gensym 'slot)
```

`gensym` evaluates its optional argument. With no argument, the prefix is
`G`. A string or ordinary symbol supplies a custom prefix. Each call allocates
a fresh symbol, even when two calls use the same prefix.

A valid prefix matches:

```text
^[A-Za-z_$][A-Za-z0-9_$?!*+=<>-]*$
```

It must not begin with the compiler-reserved `__eliscript_` prefix. Invalid
types, argument counts, and spellings fail during macro evaluation.

## Automatic Generated Symbols

Inside an active depth-one quasiquote, an ordinary symbol whose name ends in
`$` requests automatic generation:

```elisp
(defmacro once (form)
  `(let ((value$ ,form))
     value$))
```

The trailing marker is removed and the remaining spelling becomes the prefix.
Every occurrence of the same marked symbol in one quasiquote evaluation maps
to the same generated symbol. A later quasiquote evaluation, including another
call to the same macro, receives a fresh symbol.

The marker is interpreted only for literal template symbols at active
quasiquote depth one. It is not interpreted:

- in ordinary `quote`
- in an unquoted value supplied by the macro caller
- in a nested quasiquote whose depth is greater than one
- outside macro evaluation

The trailing `$` is used because both the Emacs reader and the self-hosted
reader preserve it as part of an ordinary symbol, and because it remains
visually distinct after JavaScript emission.

## Capture Rules

Eliscript macros use the following explicit capture model:

1. Unquoted arguments retain caller syntax and resolve in the caller's lexical
   environment after expansion.
2. Ordinary literal symbols in a macro template also resolve at the call site.
   A macro may use this behavior deliberately, for example to assign a caller
   binding named `target`.
3. Bindings private to a macro expansion use `gensym` or a trailing `$`
   template symbol. Their generated names cannot collide with module source or
   earlier macro-generated names.
4. `quote` remains a data boundary. A quoted symbol ending in `$` is emitted as
   that literal symbol and does not allocate a name.

This contract keeps code-as-data behavior visible rather than adding hidden
lexical scopes to syntax objects. Fully hygienic syntax objects, syntax marks,
and definition-site binding resolution remain outside this slice.

## Source Locations and Diagnostics

Generated symbols receive the macro call's source span through the existing
generated-form location pass. Downstream analyzer diagnostics and Source Map
mappings therefore point to the invocation that produced the binding or
reference. The module allocator itself contributes no machine-local data to
artifacts.

Macro failures retain the existing `ELI-X0001` public expansion wrapper and
the macro name, filename, line, and column. The stable message categories for
this provisional surface are:

- `gensym expects 0..1 arguments`
- `gensym prefix must be a symbol or string`
- `invalid gensym prefix: PREFIX`

An automatic marker with no valid prefix fails through the same invalid-prefix
category.

## Compatibility and Limits

Existing programs without `gensym` or a depth-one quasiquote symbol ending in
`$` are unchanged. A macro that previously intended a literal trailing `$`
inside quasiquote must now produce it through unquote or explicit quote.

The allocator guarantees module-local uniqueness, not identity across modules.
Generated spellings are observable through quoted macro output and emitted
JavaScript, but application code must not depend on a particular counter value.
The counter is a deterministic artifact mechanism rather than a public naming
API.

This slice does not implement namespaces, qualification, reader macros,
metadata, syntax objects, definition-site resolution, or automatic renaming of
every binding introduced by a macro.

## Acceptance Criteria

- **MG-01:** Seed and self-hosted expanders produce identical complete syntax,
  spans, and diagnostics for explicit and automatic generated-name fixtures.
- **MG-02:** The allocator resets for each module compilation and repeated
  compilation produces byte-identical JavaScript and Source Maps.
- **MG-03:** Every source symbol is reserved before expansion, so a generated
  binding skips a caller name that would otherwise match its first candidate.
- **MG-04:** `intern` reserves dynamically assembled names before later
  allocation.
- **MG-05:** Repeated occurrences of one marked symbol in one quasiquote reuse
  one generated symbol, while separate macro calls allocate distinct symbols.
- **MG-06:** `gensym` supports no argument, a string prefix, and a quoted symbol
  prefix, and every invocation returns a fresh symbol.
- **MG-07:** Invalid prefix types, arities, spellings, and reserved prefixes
  produce deterministic located diagnostics in both compiler generations.
- **MG-08:** Quote, unquote, and nested quasiquote boundaries do not rewrite
  symbols outside the active template position.
- **MG-09:** An ordinary template symbol can deliberately capture a caller
  binding, while a generated binding does not accidentally capture it.
- **MG-10:** Generated initializers evaluate exactly once and preserve ordinary
  lexical binding evaluation order.
- **MG-11:** Bun and Node.js execute the generated-name corpus with identical
  values and side effects.
- **MG-12:** The generated self-hosted compiler reaches the same byte-for-byte
  fixed point with the allocator included.
- **MG-13:** Existing language, bootstrap, standard-library, persistent-data,
  protocol, project, adapter, worker, contract, and strict byte-compilation
  suites remain green.

## Next Slice

Use generated names in portable standard-library macros that introduce local
bindings. Remaining language-closure work includes persistent literal
integration, explicit host conversion, metadata and printing, portable
protocol dispatch internals, and declared macro dependency capabilities.
