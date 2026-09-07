# React Counter

[Examples](../README.md) | [Project README](../../README.md) |
[Specification 0118](../../specs/0118-framework-neutral-library-interop.md)

This application-level probe imports React and `react/jsx-runtime` explicitly.
It uses an ordinary function declaration, app-local element helpers,
`useState`, props and children, an event handler, and a conditional child. No
framework syntax or runtime is supplied by the Eliscript compiler.

```sh
bun run compile:react-counter
bun run react-counter
```

The renderer prints deterministic server markup. Browser mounting and the
optional Vite adapter use the same component:

```sh
bun run dev:react-counter
bun run build:react-counter
```

`browser.eli` is the browser entry point. Vite compiles both `.eli` modules,
preserves their source maps, bundles the existing logo and CSS, and applies
React Fast Refresh during development. The entry imports the framework-neutral
browser platform package and explicitly grants only `document` authority before
mounting; this remains application validation rather than core maturity
evidence.
