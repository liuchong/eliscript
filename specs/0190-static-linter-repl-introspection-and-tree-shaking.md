# 0190: Static Linter, REPL Introspection, Export Tree-Shaking, and Editor Integration

- Status: stable
- Implementation: implemented

## Summary

Elevates static analysis, interactive inspection, bundle pruning, and GNU Emacs integration across both compiler generations:

1. **Dual-compiler static linter (`ELI-L0001..L0009`)**: `compiler/eliscript-analyzer.el` (`eliscript-lint-module` / `eliscript-lint-string`) and `bootstrap/compiler/analyzer.eli` (`lint-module` / `lint-string`) emit identical structured warning/error diagnostics: unused local bindings (`L0001`, suppressed for `_`-prefixed names), unused import bindings (`L0002`, suppressed for `_`-prefixed names), binding shadowing (`L0003`), static arity mismatches (`L0004`), constant conditions in `if` expressions (`L0005`), parameter or captured binding mutation with `setq`/`set!` (`L0006`), duplicate literal keys/elements (`L0007`), empty `progn`/`do` or useless literal expressions in sequences (`L0008`), and transient builder escape or missing `persistent!` finalization (`L0009`), configurable via per-rule levels (`"off"`, `"warning"`, `"error"`).
2. **CLI lint flags (`bin/eliscript-check`)**: Supports `--lint` (emits lint diagnostics with exit status 0 for warnings alone) and `--strict` (implies `--lint` and exits non-zero on any lint diagnostic or error).
3. **REPL introspection and hot reload (`bin/eliscript-eval`)**: Supports `(doc ...)`, `(source ...)`, `(apropos ...)`, `(dir ...)`, `(pst)` (restoring original `.eli` frames via Source Map v3), `(load-file ...)`, `(defvar-once ...)`, live `(tap> ...)` broadcast echo, and colon aliases `:doc`, `:source`, `:apropos`, `:dir`, `:pst`.
4. **Export-level barrel tree-shaking (`bin/eliscript-build`)**: Statically analyzes pure barrel modules (such as `stdlib/core.eli`) and rewrites consumer graphs to retain only the transitive export closure of imported names unless `--no-tree-shake` is specified.
5. **Emacs editor parity (`editor/eliscript-mode.el`)**: Enables `--lint` Flymake warning diagnostics by default, integrates `api-index.json` ElDoc signatures (`eliscript-mode-eldoc-function`), and binds `eliscript-mode-run-test-at-point` (`C-c C-t`) and `eliscript-mode-run-tests` (`C-c C-a`).
