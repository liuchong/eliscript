# 0189: Structured Async Channels, Declarative Testing, and DevTools Formatters

- Status: stable
- Implementation: implemented

## Summary

Completes structured concurrency channels, cross-host unit testing, and interactive browser object formatting:

1. **CSP async channels (`stdlib/async.eli`)**: Builds on `with-async-scope` and `async-channel` with `chan`, fixed/`dropping-buffer`/`sliding-buffer`, `put!`, `take!`, `>!!`/`<!!`, `offer!`, `poll!`, `close!`, `alts!`, `timeout`, `pipe`, `pipeline`, `pipeline-async`, `merge`, `mix`/`admix`, `mult`/`tap`, and `pub`/`sub`.
2. **Declarative test framework and CLI (`stdlib/test.eli`, `bin/eliscript-test`)**: Exports `deftest`, `testing`, `is`, `are`, `thrown?`, `thrown-with-msg?`, `use-fixtures`, `run-tests`, and `run-all-tests`, formatting structural mismatch failures through `diff` and `pprint`. `bin/eliscript-test` supports `--filter`, `--tag`, `--seed`, `--fail-fast`, `--watch`, and `--json`.
3. **Browser DevTools formatters (`stdlib/devtools.eli`)**: Exports `install-devtools-formatters!` and `formatters` for JsonML expandable rendering of persistent Maps, Vectors, Sets, Lists, Queues, Sorted collections, Records, Keywords, Symbols, MapEntries, Atoms, Volatiles, UUIDs, and Instants on `window.devtoolsFormatters`.
