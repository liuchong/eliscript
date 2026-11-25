# Emacs Editor Integration

[Getting started](../docs/getting-started.md) | [Project README](../README.md) |
[Specifications](../specs/README.md)

[`eliscript-mode.el`](eliscript-mode.el) provides the maintained Emacs major
mode for `.eli` source. Add this directory to `load-path` and require the mode:

## Installation

The mode, its evaluation library, and the `0.1.0`/`0.1.2` `1+5+2`
extension libraries (`eliscript-runtime.el`, `eliscript-contract.el`,
`eliscript-data.el`, `eliscript-bind.el`, `eliscript-module.el`,
`eliscript-async.el`, `eliscript-js.el`, and `eliscript-abi.el`) are ordinary
Emacs packages. All carry `Version: 0.1.2`, `Package-Requires: ((emacs "29.1"))`,
and the standard `Author`, `Keywords`, and `URL` fields, so
`package-buffer-info` reads them and an archive or a source checkout can
install them.

From a checkout, without installing anything:

```elisp
(add-to-list 'load-path "/path/to/eliscript/editor")
(require 'eliscript-mode)
(require 'eliscript-runtime) ; loads the 0.1.0 1+5+2 extension packs in Emacs
```

From the repository itself, using Emacs 29 or newer, which fetches the sources
and builds them into `package-user-dir`:

```elisp
(package-vc-install
 '(eliscript-mode
   :url "https://github.com/liuchong/eliscript"
   :lisp-dir "editor"))
```

An archive install needs a recipe that lists both `editor/eliscript-mode.el`
and `editor/eliscript-repl.el`; the mode requires the evaluation library, so
they are installed together.

## Editing

The mode supplies syntax-aware comments and movement, two-space structural
indentation, semantic font locking, Imenu, definition navigation, project
discovery, and `C-c C-f` buffer formatting. The formatter command defaults to
`eliscript-format`; customize `eliscript-mode-format-command` when the public
command is not on `PATH`.

## Project Diagnostics And Builds

Project discovery prefers the nearest `eliscript.json` and then falls back to
the current `project.el` project. `C-c C-k` starts the asynchronous
`eliscript-check` Flymake backend, sends the current unsaved buffer through
stdin, and exposes normal Flymake diagnostic navigation. Customize
`eliscript-mode-check-command` when the public command is not on `PATH`.

Project checking is read-only: it does not save the buffer or create build
outputs. `C-c C-b` builds the current unsaved buffer, `C-c C-c` builds the
saved file, and `C-c C-p` builds the configured project. These commands use the
public `eliscript-build` process and `eliscript-compilation-mode`; `C-c C-n`
and `C-c C-r` navigate located build failures. Customize
`eliscript-mode-build-command` or the unconfigured
`eliscript-mode-build-directory` when needed.

## Evaluation And REPL

`C-c C-e` evaluates the complete form preceding point, `C-c C-l` loads the
current unsaved buffer as the project namespace, and `C-M-x` reloads that
namespace while point is inside a definition. Values and captured standard
output appear in the project-scoped `C-c C-z` result buffer. Located failures
use normal compilation navigation. `C-c C-q` stops and forgets the session.
Customize `eliscript-mode-eval-command` when `eliscript-eval` is not on
`PATH`.

## Session Recovery

Each project owns one persistent process. If it exits unexpectedly, the mode
fails unacknowledged work, starts one replacement, restores only acknowledged
namespace requests, and then accepts new evaluation.

## Project Watch

`M-x eliscript-mode-watch-project` starts or reuses one `eliscript-watch`
process for the project. Structured change events refresh Flymake for matching
live buffers and run `eliscript-mode-watch-event-hook`.
`M-x eliscript-mode-stop-watch` releases the shared process. Customize
`eliscript-mode-watch-command` when the public command is not on `PATH`.


## Linting, ElDoc, And Native Test Runner

- Flymake passes `--lint` to `eliscript-check` by default when
  `eliscript-mode-lint-enabled` is non-nil, surfacing `ELI-L0001..L0009`
  warnings alongside compiler errors.
- ElDoc integrates `eliscript-mode-eldoc-function` using `docs/pages/api-index.json`
  for interactive signature and docstring hints at point.
- `C-c C-t` (`eliscript-mode-run-test-at-point`) and `C-c C-a`
  (`eliscript-mode-run-tests`) invoke `eliscript-test` in a compilation buffer
  to run declarative `deftest` suites.
- `editor/eliscript-runtime.el` mirrors standalone runtime additions including
  `entry-key`, `entry-val`, `chunked-seq-p`, `volatile!`, `volatile-p`,
  `vderef`, `vreset!`, and `vswap!`.

## Local Runtime Scope And Host Cache

`editor/eliscript-runtime.el` interprets modern `.eli` extension forms directly
in Emacs via `eliscript-runtime-eval-string` and `eliscript-runtime-eval-file`
without invoking a JavaScript engine.

- **Supported local subset**: Lisp-2 symbol/function namespaces, unique `nil`
  falsiness (including non-nil `js-false` / `js-null` / `js-undefined` sentinels),
  lexical and dynamic bindings, `condition-case`/`unwind-protect` unwinding and
  side-effect order, `defmacro-checked`/`macro-gensym`, persistent collections
  (`persistent-vector`, `persistent-map`, `persistent-set`, `persistent-queue`,
  transients, protocols), and `defmodule` lexical encapsulation with live
  `import-functions`/`import-values`.
- **Explicit out-of-scope rejections**: Calling non-local engines via
  `engine-call` fails with `eliscript-engine-handle-error`; invoking imported JS
  host stubs (`js-import`, non-callable `js-object` methods) with `js-call` or
  `js-call-raw` errors instead of contacting an external JS engine;
  `eliscript-runtime-compile-elisp-module` fails clearly when no JS runtime
  (`bun`/`node`) is on `PATH`; static `:pure`/`:portable`/`:abi` and invalid
  `await` violations fail with `eliscript-compile-error`.

For JS-free Seed bootstrap caching against a standalone FEmacs Lisp package,
`tools/femacs-host-cache.el` verifies `manifest.json`, binaries, resource tree
digests, and `package_sha256` before returning a cached `femacs-lisp` executable.
