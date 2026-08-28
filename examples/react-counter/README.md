# React Counter

[Examples](../README.md) | [Project README](../../README.md) |
[Specification 0010](../../specs/0010-react-elements.md)

This is the first executable React slice. It uses a component declaration,
`useState`, props and children, an event handler, a fragment, a conditional
child, and the automatic JSX runtime.

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
React Fast Refresh during development.
