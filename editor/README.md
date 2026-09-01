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
outputs. Compile commands, interactive evaluation, watching, and REPL sessions
remain separate M10 capabilities.
