# Examples

Examples are executable design probes. Each example should include source,
expected generated JavaScript, and the smallest environment needed to run it.

`basic/main.eli` exercises the M1 language core. `react-counter/main.eli`
exercises components, hooks, props, children, events, fragments, conditional
children, automatic JSX runtime emission, server rendering, browser mounting,
Vite production builds, React Fast Refresh, and a direct source import from the
portable sequence standard library.

`org-site/` adds the publishing vertical slice: Org metadata and body export,
draft filtering, a watched ESM content module, and a fully custom React reading
interface written in Eliscript.

`emacs-index/` adds the Emacs acceleration vertical slice: a statically checked
portable scoring kernel compiled with a source map and driven concurrently by a
high-level Emacs adapter.

`stdlib-cli/` exercises ordinary multi-file project builds by importing the
portable sequence, text, and object libraries as Eliscript source, then running
the four-module ESM tree directly with Bun.
