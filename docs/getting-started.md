# Eliscript Installation and Daily Development

[Project README](../README.md) | [Editor guide](../editor/README.md) |
[Language specifications](../specs/README.md) |
[Troubleshooting](#troubleshooting)

This guide starts from a source checkout and follows one framework-neutral
project through formatting, checking, building, execution, interactive
evaluation, Emacs editing, and source watching. All paths below are local; no
global package installation is required.

## Supported Environment

The maintained development baseline requires:

- Git
- Emacs 29 or newer for the seed compiler and editor integration
- Bun 1.4 or newer for the default JavaScript host and development commands

On Ubuntu 24.04, install the host prerequisites and Bun with:

```sh
sudo apt-get update
sudo apt-get install -y git emacs unzip curl
curl -fsSL https://bun.com/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

On macOS with Homebrew, use:

```sh
brew install git emacs
curl -fsSL https://bun.com/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

Confirm the active tools before cloning:

```sh
git --version
emacs --version
bun --version
```

Node.js is a maintained alternate host for generated compiler and project
operations. Bun remains the default host and is required for dependency setup
and the repository test command. The final operating-system and host acceptance
matrix is tracked separately from this onboarding path.

## Install from a Checkout

Clone the repository and install the exact locked development dependencies:

```sh
git clone git@github.com:liuchong/eliscript.git
cd eliscript
bun install --frozen-lockfile
./bin/eliscript --help
bun run build:bootstrap
```

Keep the checkout as the command home. The public scripts locate the compiler
relative to their own `bin/` directory, so do not symlink individual scripts
away from the checkout. Add that directory to `PATH` instead:

```sh
export ELISCRIPT_HOME="$PWD"
export PATH="$ELISCRIPT_HOME/bin:$PATH"
eliscript --help
```

Persist both exports in the shell startup file used to launch terminal Emacs.
For a GUI Emacs that does not inherit the shell environment, configure absolute
command paths as shown below.

## Create a Project

Create a project outside the compiler checkout:

```sh
mkdir -p hello-eliscript/src
cd hello-eliscript
```

Use a version 2 project request so the source root, entry set, output directory,
and cache policy are explicit:

```json
{
  "schemaVersion": 2,
  "sourceRoot": "src",
  "entries": ["main.eli"],
  "outDir": "dist",
  "portableEntries": [],
  "cache": true
}
```

Save that document as `eliscript.json`. Add `src/math.eli`:

```elisp
(module hello.math (defconst answer (+ 20 22)) (export answer))
```

Add `src/main.eli`:

```elisp
(module hello.main (import "./math.eli" answer) (print answer))
```

Local `.eli` imports are resolved below `sourceRoot`; generated imports become
`.mjs` while preserving the source tree and Source Maps.

## Check Format Build and Run

From the project root, verify canonical source formatting and the complete
configured graph without writing build output:

```sh
eliscript-format --check src/math.eli
eliscript-format --check src/main.eli
eliscript-check --json --config eliscript.json
```

Build the configured entry and execute the emitted standard ESM:

```sh
eliscript-build --config eliscript.json
bun run dist/main.mjs
```

The program prints `42`. Repeating the build reuses verified artifacts. Use a
fresh alternate-host build when checking Node behavior:

```sh
ELISCRIPT_JS_RUNTIME=node eliscript-build --no-cache \
  --config eliscript.json --out-dir dist-node
node dist-node/main.mjs
```

Run `eliscript-format --write FILE` to apply canonical formatting atomically.
Run `eliscript-build --json --config eliscript.json` to inspect exact compiled
and reused module decisions.

With `--config`, an explicit `ENTRY`, `--root`, `--out-dir`, or repeated
`--portable` values replace their configured counterparts; `--no-cache` only
disables reuse. Relative paths written in `eliscript.json` resolve from the
configuration directory, while relative command-line paths resolve from the
current working directory.

## Unsaved Source and Diagnostics

Editor integrations can check the current contents of an existing source path
without saving it or changing build artifacts:

```sh
printf '(module hello.main (print missing))\n' | \
  eliscript-check --json --config eliscript.json \
  --stdin-file "$PWD/src/main.eli" --diagnostic-format json
```

That command intentionally fails with a structured `ELI-A0001` unbound-symbol
diagnostic located in `src/main.eli`. A virtual source must name an existing
file inside the configured source graph. The same `--stdin-file` boundary is
used by unsaved-buffer builds and Emacs Flymake.

## Terminal REPL

Start one persistent project-scoped session:

```sh
eliscript-eval --repl --root "$PWD"
```

Definitions, macros, and loaded namespaces remain available until reset or
exit. Enter complete forms normally; multiline forms continue until balanced.
Use these commands while no form is pending:

| Command | Effect |
| --- | --- |
| `:load src/main.eli` | Load and commit the file namespace |
| `:reload` | Reload the most recently loaded file |
| `:reset` | Clear committed session state |
| `:help` | Show terminal commands |
| `:quit` | Shut down the session cleanly |

For scripts and tests, `--no-prompt` suppresses presentation text. One-shot
evaluation uses the same compiler and source-mapped runtime boundary:

```sh
eliscript-eval --eval '(+ 20 22)' --root "$PWD" --json
```

## Emacs Setup

Load the maintained mode directly from the checkout:

```elisp
(let ((root (file-name-as-directory (getenv "ELISCRIPT_HOME"))))
  (add-to-list 'load-path (expand-file-name "editor" root))
  (require 'eliscript-mode)
  (setq eliscript-mode-format-command
        (list (expand-file-name "bin/eliscript-format" root))
        eliscript-mode-check-command
        (list (expand-file-name "bin/eliscript-check" root))
        eliscript-mode-build-command
        (list (expand-file-name "bin/eliscript-build" root))
        eliscript-mode-eval-command
        (list (expand-file-name "bin/eliscript-eval" root) "--stdio")
        eliscript-mode-watch-command
        (list (expand-file-name "bin/eliscript-watch" root) "--json")))
```

The absolute command configuration works for terminal and GUI Emacs. Opening a
`.eli` file activates `eliscript-mode`. Project discovery uses the nearest
`eliscript.json`, then falls back to `project.el`.

| Command | Default key | Result |
| --- | --- | --- |
| `eliscript-mode-format-buffer` | `C-c C-f` | Format the buffer without saving it |
| `eliscript-mode-check-buffer` | `C-c C-k` | Refresh Flymake diagnostics from unsaved contents |
| `eliscript-mode-compile-buffer` | `C-c C-b` | Build with the unsaved current buffer |
| `eliscript-mode-compile-file` | `C-c C-c` | Build the saved file |
| `eliscript-mode-compile-project` | `C-c C-p` | Build `eliscript.json` |
| `eliscript-mode-eval-last-form` | `C-c C-e` | Evaluate the preceding complete form |
| `eliscript-mode-eval-defun` | `C-M-x` | Reload the containing definition |
| `eliscript-mode-eval-buffer` | `C-c C-l` | Load the unsaved buffer namespace |
| `eliscript-mode-show-repl` | `C-c C-z` | Show the project result buffer |
| `eliscript-mode-stop-repl` | `C-c C-q` | Stop and forget the project session |

Build diagnostics use compilation-mode; `C-c C-n` and `C-c C-r` navigate their
source locations. Evaluation failures are source mapped to `.eli` locations.

## Project Watch

Observe canonical content changes independently of native watcher details:

```sh
eliscript-watch --config eliscript.json --json
```

The first record is `ready`; later records contain sorted created, modified,
and deleted `.eli` paths. Stop the terminal watcher with `C-c`.

Inside Emacs, `M-x eliscript-mode-watch-project` shares one watcher per project
and refreshes matching Flymake buffers after validated changes. Use
`M-x eliscript-mode-stop-watch` when the project no longer needs observation.

## Troubleshooting

| Symptom | Check and recovery |
| --- | --- |
| `eliscript: command not found` | Confirm `ELISCRIPT_HOME` names the checkout and `$ELISCRIPT_HOME/bin` is on `PATH`. Do not symlink an individual command. |
| Emacs reports an executable is missing | Use the absolute command configuration above, especially when GUI Emacs does not inherit the login shell environment. |
| Bootstrap compiler files are absent or stale | Public commands bootstrap missing files automatically. Run `bun run build:bootstrap`, then retry; inspect Emacs diagnostics if the seed build fails. |
| Configuration rejects `sourceRoot`, `entry`, or `outDir` | Keep configuration paths relative to the directory containing `eliscript.json`; inputs and outputs must remain inside their declared roots. |
| `eliscript-format --check` exits nonzero | Run `eliscript-format --write FILE`, inspect the diff, and rerun the check. |
| Check reports `ELI-A0001` | Import or define the named binding. Add `--diagnostic-format json` when a tool needs the structured location and phase. |
| A build appears to reuse the wrong artifact | Run `eliscript-build --no-cache --json --config eliscript.json` and inspect module reasons. The normal cache verifies source, compiler, request, dependency, and macro-file identities. |
| `--stdin-file` is rejected | Name an existing regular `.eli` file inside the selected graph and pass its current contents on standard input. |
| Bun succeeds but the alternate host fails | Retry with `ELISCRIPT_JS_RUNTIME=node` and `--no-cache`; preserve the diagnostic and host version when reporting a mismatch. |
| A watcher or evaluation session is still running | Exit the terminal REPL with `:quit`, stop a watcher with `C-c`, or use the two explicit Emacs stop commands. |

Do not delete source or hand-edit generated `.mjs`, `.map`, manifests, or API
files to recover from a failure. Generated compiler files live under `dist/`
and can be rebuilt; tracked generated artifacts are protected by the repository
integrity audit.

## Verification Boundaries

Verify a checkout in increasing scope:

```sh
make byte-compile
bun run check:contracts
bun run check:integrity
make test-core
make test-applications
```

`make byte-compile` checks maintained Emacs Lisp with warnings as errors.
`check:contracts` validates specification, API, compatibility, documentation,
and repository-integrity contracts. `check:integrity` can be run separately to
diagnose dependency or artifact drift. `make test-core` executes the complete
framework-neutral ERT, Bun, host-equivalence, scale, security, and CLI suite.
`make test-applications` separately verifies maintained Vite, React, and Org
consumers. The aggregate `bun run test` command runs both partitions.

The documented project path has its own bounded executable check:

```sh
bun test tests/onboarding-docs.test.mjs
```

Passing this documented workflow proves the current checkout and local tool
chain. It does not by itself prove the final recorded onboarding exercise, every
supported CI matrix cell, stable public compatibility, or the complete 1.0
acceptance report; those remain separate acceptance artifacts.
