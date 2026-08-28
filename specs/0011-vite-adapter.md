# 0011: Vite Adapter

- Status: Accepted
- Implementation: Implemented
- Date: 2026-08-28

## Summary

The optional Vite adapter compiles `.eli` modules before Vite performs import
analysis. It hands generated ECMAScript and Source Map v3 data back through the
standard transform interface, allowing Eliscript modules to participate in
development, React Fast Refresh, asset loading, and production bundling.

Vite and Node.js remain outside the compiler core. Emacs is still the compiler
host, while Vite is an optional consumer of the public command-line interface.

## Plugin Contract

`tools/vite/index.mjs` exports `eliscript(options)` and the lower-level
`compileEliscript(inputFile, options)` function.

The plugin:

1. runs as a pre-transform for `.eli` module IDs
2. invokes `bin/eliscript --source-map` on the real source path
3. reads the generated module and external source map
4. removes the temporary `sourceMappingURL` comment
5. returns `{ code, map }` to Vite
6. removes its isolated temporary directory in a `finally` block

Source names and `sourcesContent` are normalized to the original `.eli` file so
subsequent Vite transforms and the production bundler can compose their maps.
Concurrent transformations use distinct temporary directories.

The plugin inherits `EMACS` and accepts explicit `compiler`, `emacs`, and
`include` options. The defaults use this repository's public compiler and match
files ending in `.eli`.

## React Refresh

The official React plugin runs after the Eliscript pre-transform:

```js
plugins: [
  eliscript(),
  react({ include: /\.(?:[jt]sx?|eli)$/ }),
]
```

Adding `.eli` to its inclusion rule lets it inspect the generated component
module. In development, it adds component signatures, registration calls, and
an accepted hot-update boundary. Eliscript does not implement a parallel HMR
protocol.

## Browser Example

`examples/react-counter/browser.eli` imports the existing counter, CSS, logo,
React `StrictMode`, and `createRoot`. It mounts a complete browser interface
without a handwritten JavaScript application entry point.

The supported commands are:

```sh
bun run dev:react-counter
bun run build:react-counter
bun run preview:react-counter
```

The default development and preview ports are fixed at 5173 and 4173. The
production output defaults to `dist/react-counter-browser`; tests can override
it with `ELISCRIPT_BUILD_OUT_DIR` so repository artifacts are not disturbed.

## Diagnostics and Trust

Because the adapter invokes the source file by its real path, reader, expander,
analyzer, and emitter failures retain their original filename, line, and
column. Compile-time macros have the same trusted-build-code boundary as direct
CLI compilation.

## Acceptance Evidence

- Bun tests compile a `.eli` component through the transform, inspect its
  source map, verify file filtering, and assert React Refresh instrumentation.
- The CLI integration test creates a production Vite bundle and verifies its
  JavaScript, CSS, and composed maps for both browser and component sources.
- Browser validation covers the desktop and 390-pixel layouts, an incrementing
  hook-driven interaction, and an empty warning/error console.
- A live `.eli` edit changes the rendered button through HMR while preserving
  counter state; restoring the source performs another state-preserving update.

## Future Optimization

The first adapter starts one batch Emacs process per transformed module. A
long-lived compiler process, dependency-aware cache, and macro dependency graph
may reduce latency later without changing this transform contract.
