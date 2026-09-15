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

## Compilation runs in a worker

The page never loads the compiler itself. It starts
`browser/worker.mjs`, which imports the compile host, and sends it the editor
contents. A large edit therefore cannot block the editor, and the compiler is
bundled to one file (`dist/browser/compiler.js`) rather than fetched as thirteen
modules.

The worker is imported by a relative path, because a worker realm has no
document and therefore no import map.

## Compiled code needs no import map

Compiled output normally carries a runtime specifier:

```javascript
import { map } from "eliscript/runtime/core/sequence.mjs";
```

A blob module has no directory, so that specifier cannot resolve on its own.
The host therefore rewrites every runtime specifier — including the imports the
emitter injects for literals, collection helpers, list operations, and value
equality — to the URL the package is served from:

```javascript
import { map } from "http://host/runtime/core/sequence.mjs";
```

Only this page's own module graph still needs an import map, and only because
the page itself is written in Eliscript and imports the platform package:

```html
<script type="importmap">
{ "imports": { "eliscript/": "/" } }
</script>
```

An application that compiles Eliscript in the browser needs no map at all.

## Execution

The compiled entry is wrapped in a `Blob` and imported:

```elisp
(let ((url (blob-url-of javascript)))
  (await (funcall dynamic-import url)))
```

A compile failure arrives as a structured `eliscript-diagnostic` from the
worker, and a runtime failure as a rejected import, so neither disappears
silently.

## Projects, not just files

The host also compiles a whole project from a map of sources:

```js
import { compileProject, moduleGraphUrls } from "eliscript/browser";

const { modules } = compileProject({
  files: { "main.eli": mainSource, "lib/text.eli": textSource },
  entry: "main.eli",
  resolveExternal: (specifier) =>
    specifier.startsWith("eliscript/")
      ? new URL(specifier.slice("eliscript/".length), runtimeBase).href
      : undefined,
});
const graph = moduleGraphUrls(modules, "main.eli");
await import(graph.entryUrl);
graph.release();
```

The planner resolves the graph from the sources rather than from the
filesystem, local imports are rewritten to the emitted modules, the modules are
ordered dependency first, and each becomes a blob URL. Macro file dependencies
are unavailable here, because they need a filesystem.

## Value formatting

`print` in the runtime lowers to `console.log`, and JavaScript's `String()`
spells a persistent collection as `[object EliscriptPersistentVector]`. The page
installs a console capture that formats non-primitive values with the runtime's
canonical data text (`runtime/core/data-text.mjs`), so the sample prints
`[4 1 3 2]` rather than an opaque object spelling.

## Limits

- This page edits one module. The host compiles projects, but the interface
  shows a single editor.
- A strict Content-Security-Policy must allow `blob:` module scripts for the
  execution step to run.
- The host reads sources from memory, so a project that declares file-based
  macro dependencies cannot compile in the browser.
