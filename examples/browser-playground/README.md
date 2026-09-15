# Browser Playground

[Examples](../README.md) | [Project README](../../README.md) |
[Language reference](../../docs/language-reference.md) |
[Platform packages](../../platform/README.md)

This page compiles and runs Eliscript in the browser. It is itself an Eliscript
program, compiled ahead of time by the maintained compiler, and it imports that
compiler again at run time to compile whatever the editor holds.

Nothing runs on a server: the compiler core, the runtime core, and the freshly
emitted module all execute in the document realm.

```sh
bun run build:browser-playground
bun run preview          # serves the repository root on 127.0.0.1:8787
```

Then open `http://127.0.0.1:8787/dist/browser-playground/`, or the copy on the
documentation site at `/docs/pages/playground.html`.

A static server is required. The `eliscript/` prefix is relative, so any server
root works as long as the repository is below it, but the page must be served
rather than opened from disk: browsers refuse to fetch ES modules from
`file://`, so no arrangement of paths can make that work. The rest of the
documentation loads no modules and does open directly from disk.

## Why this works without a bundler

The compiler is host-free. `dist/bootstrap/*.mjs` imports nothing outside its
own directory: no Node built-ins, no packages, no `eval`, and no `new Function`.
`compile_string_with_source_map(source, filename)` is therefore a pure function
from source text to JavaScript text plus a Source Map, and it runs wherever
JavaScript runs.

The runtime core is host-free in the same way. Only `runtime/worker.mjs` and the
`bootstrap/host/` entry points touch Node, and the playground uses neither.

## Module resolution

Compiled output imports the runtime by package specifier:

```javascript
import { map } from "eliscript/runtime/core/sequence.mjs";
```

The page resolves that with one import-map prefix:

```html
<script type="importmap">
{ "imports": { "eliscript/": "/" } }
</script>
```

The same specifiers resolve in Bun and Node through the package `exports` map,
so one scheme serves the page, the tests, and the command line. The playground
therefore imports the compiler and the platform the same way, and the maintained
test asserts that every emitted specifier names a file below the served root.

## Execution

The page compiles the editor contents, wraps the result in a `Blob`, and
imports it:

```elisp
(let ((url (blob-url-of javascript)))
  (await (funcall dynamic-import url)))
```

Because the import happens in the document realm, the import map applies to the
blob module exactly as it applies to any other module. A compile failure is
reported from the structured `eliscript-diagnostic` value, and a runtime failure
from the rejected import, so neither disappears silently.

## Value formatting

`print` in the runtime lowers to `console.log`, and JavaScript's `String()`
spells a persistent collection as `[object EliscriptPersistentVector]`. The page
installs a console capture that formats non-primitive values with the runtime's
canonical data text (`runtime/core/data-text.mjs`), so the sample prints
`[4 1 3 2]` rather than an opaque object spelling.

## Limits

- The page compiles one module at a time. A multi-file project build needs an
  in-memory module host, because the maintained project planner reads the
  filesystem through `bootstrap/host/`.
- Compilation runs on the main thread. Moving it into a worker needs the
  compiler imported by URL inside the worker, because import maps do not apply
  to worker realms.
- A strict Content-Security-Policy must allow `blob:` module scripts for the
  execution step to run.
