# Terminal REPL

[Core documentation](README.md) | [Getting started](getting-started.md) |
[Emacs mode](../editor/README.md)

## Starting A Session

Run `./bin/eliscript-eval --repl --root /path/to/project`. Interactive terminals
show a banner and prompts automatically; scripts should pass `--no-prompt`.
`--eval SOURCE` and `--file FILE` provide one-shot operation, while `--stdio`
exposes NDJSON requests for editor clients.

<!-- eliscript-snippet:persistent-repl -->
```text
(defconst answer 42)
answer
:quit
```

## Persistent State

A session retains acknowledged definitions, macros, imports, and namespace
revision. Each request compiles and evaluates transactionally. A failed request
does not partially commit bindings or generated module state.

## Input And Commands

Reader-owned classification distinguishes complete, incomplete, and invalid
forms, so multiline input follows language syntax rather than terminal
heuristics. `:load`, `:reload`, `:reset`, and `:quit` manage source and session
state. Prompt presentation is host behavior and does not affect evaluation.

## Output And Diagnostics

Values use canonical data text; captured program output is framed separately.
Compiler and runtime failures preserve `.eli` source locations through Source
Maps. After a recoverable failure the session remains usable.

## Recovery

If the JavaScript process exits, the Emacs integration starts a replacement and
replays only acknowledged namespace operations. Unacknowledged work fails
instead of being guessed or duplicated. Use the explicit stop command when a
project session is no longer needed.


## Introspection, Stack Traces, And Hot Reload

Persistent evaluation sessions expose interactive inspection helpers as both
evaluated forms and colon commands:

- `:doc SYMBOL` / `(doc symbol)` inspects module summaries and signatures from
  `api-index.json` alongside in-session docstrings.
- `:source SYMBOL` / `(source symbol)` extracts the definition form from its
  recorded `.eli` source file or session history.
- `:apropos QUERY` / `(apropos query)` searches matching exported and
  session-defined names.
- `:dir MODULE` / `(dir module)` lists exported bindings for a loaded or
  standard-library module.
- `:pst` / `(pst)` replays the most recent evaluation error stack mapped through
  Source Map v3 back to `.eli` file, line, and column coordinates.
- `(load-file path)` incrementally reloads a module while `(defvar-once name init)`
  preserves existing dynamic values across reloads until `:reset`.
- `(tap> value)` broadcasts values to registered taps and live REPL tap
  observers during evaluation.
