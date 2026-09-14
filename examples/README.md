# Examples

[Project README](../README.md) | [Specifications](../specs/README.md)

Examples are executable design probes. Each example should include source,
expected generated JavaScript, and the smallest environment needed to run it.

| Example | What it proves | Entry command |
| --- | --- | --- |
| [`basic/`](basic/) | Core language forms and direct ESM execution | `bun run compile:example` |
| [`getting-started/`](getting-started/README.md) | Documented format, check, build, Bun, Node, REPL, and editor workflow | `eliscript-build --config examples/getting-started/eliscript.json` |
| [`stdlib-cli/`](stdlib-cli/README.md) | Recursive multi-file project builds | `bun run build:stdlib-cli` |
| [`react-counter/`](react-counter/README.md) | React, hooks, browser mounting, Vite, and Fast Refresh | `bun run dev:react-counter` |
| [`org-site/`](org-site/README.md) | Org export, watched content, and a custom React site | `bun run dev:org-site` |
| [`dogfood/`](dogfood/README.md) | Hybrid GitHub-native publishing and comment architecture | Design complete; implementation pending |
| [`emacs-index/`](emacs-index/README.md) | Portable computation called from a long-lived Emacs worker | `bun run benchmark:worker` |
| [`emacs-analysis/`](emacs-analysis/README.md) | Revisioned Emacs text analysis with measured worker acceleration | `bun run benchmark:emacs-analysis` |

Examples are maintained as end-to-end evidence. Generated files belong below
`dist/` and are never hand-edited source.
