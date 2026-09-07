# Terminal REPL

[Core documentation](README.md) | [Getting started](getting-started.md) |
[Emacs mode](../editor/README.md)

## Starting A Session

Run `./bin/eliscript-eval --repl --root /path/to/project`. Interactive terminals
show a banner and prompts automatically; scripts should pass `--no-prompt`.
`--eval SOURCE` and `--file FILE` provide one-shot operation, while `--stdio`
exposes versioned NDJSON requests for editor clients.

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
