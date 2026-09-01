# Emacs Editor Integration

[`eliscript-mode.el`](eliscript-mode.el) provides the maintained Emacs major
mode for `.eli` source. Add this directory to `load-path` and require the mode:

```elisp
(add-to-list 'load-path "/path/to/eliscript/editor")
(require 'eliscript-mode)
```

The mode supplies syntax-aware comments and movement, two-space structural
indentation, semantic font locking, Imenu, definition navigation, project
discovery, and `C-c C-f` buffer formatting. The formatter command defaults to
`eliscript-format`; customize `eliscript-mode-format-command` when the public
command is not on `PATH`.

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

`C-c C-e` evaluates the complete form preceding point, `C-c C-l` loads the
current unsaved buffer as the project namespace, and `C-M-x` reloads that
namespace while point is inside a definition. Values and captured standard
output appear in the project-scoped `C-c C-z` result buffer. Located failures
use normal compilation navigation. `C-c C-q` stops and forgets the session.
Customize `eliscript-mode-eval-command` when `eliscript-eval` is not on
`PATH`.

Each project owns one persistent process. If it exits unexpectedly, the mode
fails unacknowledged work, starts one replacement, restores only acknowledged
namespace requests, and then accepts new evaluation.

`M-x eliscript-mode-watch-project` starts or reuses one `eliscript-watch`
process for the project. Versioned change events refresh Flymake for matching
live buffers and run `eliscript-mode-watch-event-hook`.
`M-x eliscript-mode-stop-watch` releases the shared process. Customize
`eliscript-mode-watch-command` when the public command is not on `PATH`.
