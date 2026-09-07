# Documentation Contracts

[Project README](../../README.md) | [Core documentation](../../docs/README.md) |
[Getting started](../../docs/getting-started.md) | [Specifications](../../specs/README.md)

`check.mjs` validates the complete AC-23 core documentation inventory against
`contracts/documentation.json`. It checks ordered sections, maintained public
text, repository entry points, local Markdown links, and marked executable
snippets.

```sh
bun run check:docs
```

The contract records coverage, not prose wording. Documents remain ordinary
maintained Markdown; the checker prevents inventory substitution, section
drift, broken local links, and stale examples. Eliscript module examples run
through the public compiler under Bun and Node, the project request is parsed,
and the REPL transcript runs through the public terminal command.

Application frameworks, publishing systems, development servers, and hosted
documentation services remain outside this core gate. All checks run directly
in the local checkout.
