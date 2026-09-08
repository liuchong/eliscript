# 0120: Interactive Terminal REPL

- Status: Stable
- Implementation: Implemented
- Date: 2026-09-01
- Depends on: 0019 Self-Hosted Compiler Driver,
  0040 Mature Project Roadmap,
  0043 Structured Compiler Diagnostics,
  0069 Canonical Runtime Data Text,
  0119 Self-Hosted Persistent Evaluation

## Summary

Eliscript adds a human-oriented terminal read-evaluate-print loop above the
versioned persistent evaluation session. The generated compiler owns
interactive input classification. The host owns terminal prompts, commands,
filesystem access, and presentation. The existing NDJSON protocol remains a
separate machine interface and its framing does not change.

The terminal REPL supports multiline forms, definitions, macros, ordinary
expressions, complete-source loading, explicit reload, reset, help, and clean
exit. Syntax, compiler, and runtime failures are printed as located Eliscript
diagnostics and do not terminate the session.

Application frameworks, UI libraries, bundlers, publishing systems, sites,
hosting, and development servers are not dependencies, goals, evidence, or
maturity credit for this capability.

## Compiler-owned Input Contract

The generated compiler exports `eliscript-evaluation-input` version 1. Its
descriptor accepts a source string, including an empty string, and a non-empty
logical filename. It returns exactly one of:

- `empty` when the input contains only whitespace or comments
- `incomplete` when the reader reports an unexpected end of input
- `complete` when the input contains exactly one complete top-level form

Malformed input other than an unexpected end retains the original structured
reader diagnostic. More than one top-level form is rejected as an ambiguous
interactive submission. The seed implementation and generated compiler must
agree on descriptors and diagnostics, including strings, comments, reader
prefixes, persistent collection literals, invalid delimiters, and trailing
forms.

This contract is reader-owned language behavior. Prompt text, terminal escape
handling, command names, and filesystem access do not enter the compiler.

## Public Terminal Session

Running `eliscript-eval` without an evaluation mode, or with `--repl`, starts
one persistent terminal session. Prompt visibility defaults to terminal
detection and can be forced or suppressed for deterministic transcripts.
Piped input therefore remains useful without terminal control bytes.

The primary prompt is used for a fresh form and the continuation prompt is
used only while the compiler reports incomplete input. Empty input is ignored.
A complete form is sent through the same versioned evaluate operation used by
Emacs and NDJSON clients. Definitions and macros update the session namespace;
expressions reuse its live values and Atoms.

Terminal commands are recognized only when no form is being accumulated:

- `:help` prints the maintained command summary
- `:load FILE` reads and loads one complete source file
- `:reload` reloads the last successfully loaded file from disk
- `:reset` discards session namespace state
- `:quit` closes the session successfully

Unknown commands, missing arguments, reload without a prior load, invalid
source, compiler failures, and runtime failures are recoverable terminal
errors. A failed load does not replace the prior namespace or the last
successfully loaded file. End of input closes a complete session; end of input
while a form is incomplete prints its reader diagnostic before closing.

## Presentation and Diagnostics

Canonical runtime data text is the only value presentation. Captured standard
output is written before the value or operation summary and never bypasses the
session result envelope. Definitions without runtime values print their
binding name. Complete-source load and reset print explicit summaries.

Located diagnostics use the best available `.eli` file, line, and column.
Loaded files retain their canonical path and Source Map. Interactive forms use
one stable logical `.eli` filename. Human presentation does not alter the
structured diagnostic or NDJSON contracts.

## Compatibility and Lifecycle

Node and Bun run the same terminal implementation and generated compiler. The
default test target executes equivalent multiline, state, load, reload, reset,
error recovery, prompt, and exit transcripts under both hosts. The maintained
operating-system and Emacs compatibility jobs execute that default target.

One terminal process owns one evaluation session and one temporary artifact
directory. Normal exit, `:quit`, stream closure, handled signals, and command
failure paths close the session. No listener, child process, or generated
artifact may remain after the command returns.

## M10 Status

This specification completed the terminal REPL implementation portion of M10.
Specification 0121 subsequently supplied host-neutral watch events, and
specification 0133 completed the installation audit and M10 exit audit. AC-13
remains a separate final supported-matrix criterion; stabilizing this version 1
contract does not claim that final matrix result.

## Compatibility Freeze

The version 1 interactive input classifier, multiline accumulation, persistent
session state, terminal commands, canonical value and output ordering,
recoverable diagnostics, prompt policy, EOF behavior, Bun/Node equivalence,
and cleanup requirements are stable. Terminal presentation cannot change the
machine NDJSON protocol or compiler-owned input classification.

## Acceptance Criteria

- **ITR-01:** Seed and self-hosted `eliscript-evaluation-input` version 1
  descriptors agree on empty, incomplete, complete, and invalid inputs.
- **ITR-02:** No-mode and explicit `--repl` invocations use one persistent
  session without changing `--stdio`, `--eval`, or `--file` behavior.
- **ITR-03:** Multiline definitions, macros, expressions, strings, comments,
  and persistent collection literals are submitted only when complete.
- **ITR-04:** Canonical values and captured standard output are ordered and
  identical under Bun and Node.
- **ITR-05:** `:load` and `:reload` use complete-source project compilation,
  retain live namespace state, and preserve exact loaded-file diagnostics.
- **ITR-06:** `:reset`, `:help`, `:quit`, unknown commands, missing arguments,
  and reload-without-load have deterministic recoverable behavior.
- **ITR-07:** Reader, compiler, and runtime failures leave the next valid form
  executable in the same process.
- **ITR-08:** Primary and continuation prompts follow terminal or explicit
  prompt policy; piped transcripts contain no prompt unless requested.
- **ITR-09:** End of input and handled termination close all owned temporary
  state without a residual process or listener.
- **ITR-10:** Public surface, compatibility, documentation, and default tests
  cover the feature without application dependencies or application evidence.
