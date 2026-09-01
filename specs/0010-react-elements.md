# 0010: React Element Compilation

- Status: Superseded
- Implementation: Superseded
- Date: 2026-08-28

> Superseded by [0118: Framework-neutral Library Interoperation](0118-framework-neutral-library-interop.md).
> This document is retained as the historical contract for compatibility
> baseline 1 and is not part of the current language surface.

## Summary

Eliscript compiles `jsx` and `fragment` forms to React's automatic JSX runtime.
React remains an ordinary library dependency: the compiler does not provide a
component base class, reconciler, hook wrapper, or browser runtime.

## Surface Forms

`defcomponent` is a compile-time convenience form with the same function
semantics as `defun`:

```elisp
(defcomponent Greeting (props)
  (jsx :h1 nil (get props :title "Hello")))
```

It is accepted only at module top level and expands before lexical analysis.
The analyzer therefore sees an ordinary function declaration.

An element has a type, a props expression, and zero or more children:

```elisp
(jsx :button
  (js-object :type "button" :onClick handle-click)
  "Increment")
```

Keyword and string types name host elements. Any other type position is an
ordinary expression, so imported and locally defined components use normal
lexical resolution:

```elisp
(jsx StrictMode nil (jsx Counter nil))
```

`nil` means no explicit props. A non-`nil` props value is spread into a fresh
object. Explicit child forms replace any `children` property supplied by that
object. With no explicit child, a pre-existing `children` property is retained.

A static `key` property in an object-literal props form is removed from the
props object and emitted as the automatic runtime's third argument. This
matches React's runtime contract and avoids spreading `key` into props. When
the same object contains multiple static `key` properties, the final value
wins, consistent with ordinary object-literal property ordering.

`fragment` accepts zero or more children:

```elisp
(fragment
  (jsx :span nil "First")
  (jsx :span nil "Second"))
```

Children are ordinary Eliscript expressions. Conditional children therefore
use existing forms such as `if`, `when`, and `cond`; React receives their
resulting values unchanged.

## Intermediate Representation

The analyzer validates the forms and resolves component expressions before
lowering. The lowering pass produces:

- `react-element`, containing the type, props, children, child count, and span
- `react-fragment`, containing the children, child count, and span

These nodes are target-specific extensions to the explicit IR. They are not
translated back into reader forms for emission.

## JavaScript Emission

If a module contains either React IR node, the direct backend inserts exactly
one namespace import:

```js
import * as __eliscript_react_jsx_runtime from "react/jsx-runtime";
```

The reserved `__eliscript_` prefix prevents source bindings from colliding with
compiler-owned names. Modules without React nodes do not receive this import.

Elements and fragments with at most one child call `jsx`; those with multiple
children call `jsxs`. Fragments use the imported `Fragment` value. This output
is standard ESM and does not require JSX parsing or a compiler-specific runtime.

## Source Locations

React IR nodes retain the source span of their originating form. Existing
Source Map v3 emission therefore maps generated element calls to `.eli` source.
The synthetic runtime import has no source mapping.

## Acceptance Evidence

- IR tests assert dedicated element and fragment nodes and retained spans.
- Emitter tests cover host elements, imported components, props, children,
  events, fragments, React keys, `jsx`/`jsxs` selection, and conditional runtime
  imports.
- Diagnostic tests reject malformed forms, unresolved component names, nested
  `defcomponent`, and source names using the compiler-reserved prefix.
- The React counter compiles through the public CLI with a source map and is
  rendered with `react-dom/server` during the Bun integration test.

## Adapter Boundary

Browser mounting, Vite integration, and fast refresh are adapter concerns and
remain outside this language-level contract. Their implemented contract is
specified in [0011-vite-adapter.md](0011-vite-adapter.md).
