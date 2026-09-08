# 0115: Emacs Major Mode Foundation

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0040 Mature Project Roadmap,
  0106 Versioned Project Request Configuration,
  0114 Deterministic Concrete-syntax Formatter

## Summary

Eliscript has one maintained Emacs major mode for ordinary `.eli` source. The
mode is an editor integration over language and toolchain contracts; it does
not redefine reader syntax, formatter layout, project identity, or compiler
diagnostics.

The foundation covers syntax-aware editing, deterministic indentation,
semantic font locking, definition navigation, Imenu, project discovery, and a
buffer formatting command backed by the public self-hosted formatter. It is
compatible with Emacs 29 and 30 and has no package dependency outside Emacs.

Application frameworks, UI libraries, bundlers, publishing systems, sites,
hosting, and development servers are outside the implementation, dependencies,
evidence, and maturity credit of the mode.

## File and Syntax Contract

`eliscript-mode` derives from `prog-mode`, associates with `.eli`, and uses
UTF-8-oriented ordinary Emacs buffers. Its syntax table defines:

- `;` through the end of the line as a comment
- `"..."` as a string
- `()`, `[]`, and `{}` as balanced delimiter pairs
- quote, syntax-quote, unquote, dispatch, and reader punctuation as prefix or
  symbol syntax rather than string delimiters
- punctuation used in legal Eliscript identifiers as symbol constituents

The mode sets `comment-start`, `comment-end`, and `comment-start-skip` so
`comment-dwim`, filling, and syntax-aware movement use the language's line
comment contract.

## Indentation Contract

The mode indents structural lines by two columns for every enclosing
collection. A line beginning with a closing delimiter uses the depth outside
that delimiter. Lines continuing a string retain their existing indentation.

This rule intentionally matches formatter version 1's structural layout
instead of inheriting Emacs Lisp's form-specific indentation properties.
Running indentation cannot create a second style dialect; the formatter
remains the canonical whole-source authority.

## Font Lock and Navigation

Font locking distinguishes:

- top-level declaration and module heads
- function, macro, component, and portable function names
- variable and constant definitions
- control, binding, async, exception, collection, interop, and tail-flow forms
- `nil`, booleans, `undefined`, source Keywords, and parameter markers
- reader-managed strings and comments

The maintained patterns are editor metadata only. The language public-surface
registry remains authoritative when forms are added or removed.

Imenu indexes modules, functions, macros, components, and variables. Generic
`beginning-of-defun` and `end-of-defun` commands move across top-level Eliscript
definitions using balanced syntax rather than line counting.

## Project Discovery

`eliscript-mode-project-root` starts from an explicit directory, the current
buffer file, or `default-directory` and applies this order:

1. nearest containing directory with `eliscript.json`
2. Emacs `project.el` root when the buffer belongs to a known project
3. no project

The returned path is absolute and directory-normalized. Discovery performs no
implicit build, configuration migration, or application-tool lookup.

## Formatter Integration

`eliscript-mode-format-command` is a customizable non-empty string list whose
first element names the public formatter executable and whose remaining
elements are fixed arguments. Its default is `("eliscript-format")`.

`eliscript-mode-format-buffer` writes the widened buffer to a private temporary
`.eli` file, invokes the configured command in stdout mode, and replaces buffer
contents only after a zero exit status. The temporary file and diagnostic file
are removed on success and failure. A failed command leaves text, point,
markers, narrowing, and modification state unchanged and raises an editor
error containing command diagnostics.

The temporary file is an explicit editor-host adapter needed by formatter
command version 1. A later virtual-source formatter operation may remove it;
the temporary path is not language input, project identity, cache identity, or
compiler state.

Successful replacement uses Emacs buffer-diff primitives so point and markers
survive localized changes. Identical formatter output is a no-op. The command
does not save the buffer or mutate the visited file.

## M10 Status

This specification completed the foundational major-mode editing behavior and
its formatter integration. At that slice it did not claim project-aware
checking, Flymake or compilation diagnostics, compile buffer/file/project
commands, source-mapped evaluation, REPL sessions, watch events, installation
audit, the complete AC-12 editor gate, or the M10 exit gate. Specifications
0116 through 0121 and 0133 subsequently completed the remaining M10
implementation units and exit audit. AC-12 remains a separate final matrix
criterion and is not implied by this compatibility status.

## Compatibility Freeze

The `.eli` mode association, syntax table, two-space structural indentation,
semantic font locking, Imenu and balanced definition navigation, project-root
discovery order, public formatter invocation, and transactional buffer
replacement are stable. New editor capabilities may compose with these
behaviors but cannot redefine language syntax or formatter version 1.

## Acceptance Criteria

- **EMM-01:** `.eli` activates `eliscript-mode` through `auto-mode-alist`.
- **EMM-02:** Comments, strings, three collection delimiter families, reader
  punctuation, and identifier punctuation have syntax-aware tests.
- **EMM-03:** Whole-buffer indentation follows the fixed two-column structural
  rule and is idempotent.
- **EMM-04:** Declarations, names, special forms, constants, Keywords,
  parameter markers, comments, and strings receive the documented faces.
- **EMM-05:** Imenu reports maintained declaration categories and names.
- **EMM-06:** Generic beginning/end-of-defun commands navigate balanced
  top-level definitions in both directions.
- **EMM-07:** Project discovery prefers the nearest `eliscript.json` and falls
  back to `project.el` without running a build.
- **EMM-08:** Buffer formatting invokes the public self-hosted command and
  produces the same canonical bytes as direct command use.
- **EMM-09:** Formatter failure and invalid formatter configuration leave the
  buffer unchanged and expose a deterministic editor error.
- **EMM-10:** Focused ERT tests run under the maintained Emacs 29/30 matrix and
  strict byte compilation treats warnings as errors.
- **EMM-11:** The public-surface and conformance registries track the mode and
  public editor commands.
- **EMM-12:** No application framework or application tool enters the mode's
  implementation, dependencies, evidence, or maturity credit.
