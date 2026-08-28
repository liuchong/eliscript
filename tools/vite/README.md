# Vite Adapter

[Project README](../../README.md) | [Tools](../README.md) |
[Specification 0011](../../specs/0011-vite-adapter.md)

The adapter compiles `.eli` modules through the public Emacs-hosted compiler
before Vite performs import analysis and bundling. It returns generated
JavaScript and Source Map v3 data directly to Vite and leaves the compiler core
independent from Node.js.

```js
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { eliscript } from "./tools/vite/index.mjs";

export default defineConfig({
  plugins: [
    eliscript(),
    react({ include: /\.(?:[jt]sx?|eli)$/ }),
  ],
});
```

The Eliscript plugin must run before plugins that consume JavaScript. Adding
`.eli` to the React plugin's include expression enables React Fast Refresh for
component modules during development.

`eliscript({ compiler, emacs, include })` accepts an alternate compiler path,
Emacs executable, or inclusion predicate. Defaults point to this repository's
`bin/eliscript`, inherit `EMACS`, and compile files ending in `.eli`.
