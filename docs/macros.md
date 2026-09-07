# Macros

[Core documentation](README.md) | [Language reference](language-reference.md) |
[Compiler architecture](../compiler/README.md)

## Expansion Model

Macros run during compilation before lexical analysis and IR lowering. Each
compilation owns an isolated macro environment. Expansion is deterministic and
bounded; generated forms are analyzed exactly like written source.

`defmacro` declares a macro. Its parameter list supports required parameters,
`&optional`, `&rest`, and `&body`. Macro calls receive source forms as data and
return source forms.

## Quote And Quasiquote

`quote` or `'` prevents evaluation. Backquote constructs a form template;
`,` inserts one evaluated form and `,@` splices a list of forms. The macro
evaluator provides a deliberately bounded Lisp data and control-flow subset,
not arbitrary Emacs Lisp or JavaScript evaluation.

<!-- eliscript-snippet:macro-expansion -->
```elisp
(module docs.macro-expansion
  (defmacro twice (form)
    `(progn ,form ,form))
  (defvar count 0)
  (twice (setq count (1+ count)))
  (print count))
```

## Generated Names

Use `gensym` for temporary bindings introduced by a macro. Generated names are
deterministic for the same source and compiler generation, remain collision
safe, and cannot capture user bindings accidentally.

## Declared File Inputs

A macro that reads project data must declare each file as a macro dependency.
Project requests constrain those files to the source root, and their digests
participate in graph and cache identity. Undeclared reads and path escapes are
rejected instead of becoming hidden build inputs.

## Diagnostics

Macro failures identify the call site and expansion phase. Infinite or runaway
expansion is bounded. Host functions, mutable host containers, ambient file
access, and application framework APIs are unavailable in the macro evaluator.

## Design Boundary

Macros may build language forms and application-specific helper syntax, but
framework syntax does not become compiler privilege. A macro intended for
worker execution must also respect the portable dependency boundary described
by the [worker documentation](../tools/worker/README.md).
