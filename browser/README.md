# Browser Compiler Host & Worker

[Project README](../README.md) | [Getting started](../docs/getting-started.md) |
[Platform packages](../platform/README.md)

This directory contains the in-memory browser compiler SDK (`host.eli`) and its
Web Worker transport (`worker.eli`). During `make bootstrap-backends` and
`bun run build:browser`, these `.eli` sources are materialized and bundled into
`dist/browser/` (`compiler.js`, `loader.js`, `host.mjs`, and `worker.mjs`).

## Live Browser `<script type="text/eliscript">` Loader

Include `dist/browser/loader.js` on any static page to compile, execute, and
hot-reload `<script type="text/eliscript">` tags (inline or `src="..."`) or
`data-eliscript` entry points directly in the browser without a backend server:

```html
<script defer src="https://unpkg.com/eliscript@0.1.1/dist/browser/loader.js"></script>
<script type="text/eliscript">
(module app.live
  (import "eliscript/runtime/core/order" sort)
  (print "Sorted:" (sort [4 1 3 2])))
</script>
```

## Programmatic Browser SDK (`eliscript/browser`)

Import `eliscript/browser` to compile single modules (`compileSource`,
`runSource`), multi-file in-memory projects (`compileProject`,
`moduleGraphUrls`), or DOM script tags (`mountEliscriptScripts`), with built-in
Closure-style IR optimization (`optimizeProgramIr`), optional JavaScript
compaction (`optimizeJavaScript` / `{ minify: true }`), and extensionless
`eliscript/*` package subpath resolution.
