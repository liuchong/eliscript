# Troubleshooting

[Core documentation](README.md) | [Getting started](getting-started.md) |
[Project configuration](project-configuration.md)

## Command Not Found

Run commands from the repository root with the `./bin/` prefix, or add the
repository `bin` directory to `PATH`. Confirm Bun, Node, Emacs, Git, and Make
with their respective `--version` commands.

## Bootstrap Failure

Run `bun install --frozen-lockfile`, then `bun run build:bootstrap`. Generated
compiler modules live under `dist/bootstrap` and can be removed and rebuilt;
they are not hand-edited source. Use `EMACS=/path/to/emacs` when the intended
Emacs executable is not first on `PATH`.

## Configuration And Path Errors

Validate with `./bin/eliscript-check --json --config eliscript.json`. Keep every
local import below `sourceRoot`, avoid source/output overlap, and use canonical
entry paths. Unknown configuration keys indicate contract drift rather than an
option that will be ignored.

## Compiler Diagnostics

Add `--diagnostic-format json` when another tool consumes failures. The JSON
record identifies code, severity, phase, message, file, line, and column. Fix
the first source-located error before treating later project failures as
independent causes.

## Formatting

`./bin/eliscript-format --check FILE` is read-only and exits nonzero when the
source is not canonical. Run `./bin/eliscript-format --write FILE` to apply an
atomic rewrite. A formatter failure must leave the original file unchanged.

## Cache And Build Output

Use `--no-cache` to distinguish cache reuse from compilation behavior. A
changed compiler, source, macro dependency, or generated artifact produces a
specific miss or partial-rebuild reason in the JSON build report. Do not edit
`eliscript-project.json` or generated `.mjs` files manually.

## REPL And Watch Recovery

Use `:reset` to clear terminal REPL state and restart the command after a host
failure. Stop Emacs sessions and watchers with their explicit mode commands.
A watch event is advisory until a fresh project check succeeds for the same
buffer revision.

## Worker Failures

Worker errors preserve mapped source locations and generation identity. A
timeout or process death invalidates the generation; the next request starts a
replacement. Always stop a worker or service in cleanup code. For transport and
value-codec details, see the [worker documentation](../tools/worker/README.md).

## Verification

Run `bun run check:contracts`, `make byte-compile`, and `make test-core` from a
clean checkout. Application validation is separate under
`make test-applications` and cannot satisfy a failed core check.
