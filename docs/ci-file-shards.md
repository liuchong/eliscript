# Compatibility CI file shards

Each Linux/macOS × Emacs 29.4/30.2 combination has two file shards, for eight
CI jobs. `COMPATIBILITY_FILE_SHARDS` in the workflow renderer fixes this CI
scheduling contract at two; the measured local compatibility JSON, its hashes,
and its four machine/version evidence cells remain unchanged.

The runner requires both `--shard-index INDEX --shard-count COUNT` (one-based
positive safe integers). It selects file positions modulo COUNT and preserves
relative order. Unknown, duplicated, incomplete or invalid options fail before
starting tests. Without these options, the runner executes the full inventory;
local `make test` also retains its original default runner.

Each core/application Bun file runs exactly once across the two shards of a
combination. Logs report the shard, selected count, total inventory and completed
count. Every selected file retains its complete cases, resources and original
time limits. ERT, CLI, contract checks and strict byte compilation remain in
each job. All jobs retain the original 30-minute limit and pinned actions.

Two ordinary files may run concurrently. The four existing exclusive files and
six additional files with observed CI timeouts execute behind barriers within
their shard: analyzer, emitter, independent producers, str, native backend and
native long branches. Failures still execute later files; cancellation reaps
owned children and stops dispatch.

Focused evidence covers actual sharded child processes, exact union/disjoint
inventories, strict rejection, failure propagation, SIGINT/SIGTERM, barriers,
generated eight-job coverage and unchanged historical matrix authentication.
This scheduling change does not establish that individual CI timeouts or the
30-minute job cutoff are resolved; the next real CI run must establish that.
No acceptance limits, performance reports or language versions change.
