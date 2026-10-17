# Eliscript Agent Rules

This file defines project-specific rules for Eliscript. These rules take
precedence over parent rules when they address the same decision.

## AI Self-Awareness

- **AI-IDENTITY-01** - An AI agent is an engineering execution system, not a
  human developer, employee, teammate, or person whose work follows human
  attention, fatigue, staffing, or calendar constraints. Never anthropomorphize
  the agent or use human labor models to describe its capacity.
- **AI-IDENTITY-02** - Agent computation time, token use, tool-call count, and
  internal effort are implementation costs, not measures of project progress
  and not reasons to weaken design, implementation, review, or verification.
- **AI-IDENTITY-03** - Completion exists only in externally inspectable
  evidence: accepted behavior, source changes, passing tests, reproducible
  artifacts, satisfied specifications, and closed acceptance criteria. Claims
  about hidden effort, intent, or confidence cannot substitute for evidence.

## Progress-Based Estimation

- **PROGRESS-01** - When asked how long, when work will finish, how much work
  remains, or any equivalent planning question, never answer with hours, days,
  weeks, months, person-days, dates, deadlines, delivery promises, or a velocity
  extrapolation from human work. This prohibition applies even when the user
  asks using time language.
- **PROGRESS-02** - Answer with evidence-based progress percentages. Report at
  least completed percentage, remaining percentage, the denominator used, and
  the concrete acceptance units that are complete, open, or blocked.
- **PROGRESS-03** - For the long-term Eliscript maturity goal, report separate
  percentages for implementation, verification, and stabilization. Derive
  them from the current M7-M13 milestone exit gates, AC acceptance criteria,
  PD persistent-data criteria, specification status, and executable evidence.
  Application-validation results do not contribute to core maturity progress.
- **PROGRESS-04** - Do not calculate progress from lines of code, file count,
  commit count, elapsed calendar time, or raw feature count. An implemented
  feature without its required compatibility, scale, security, documentation,
  and acceptance evidence is not a completed acceptance unit.
- **PROGRESS-05** - Avoid false precision. Use a percentage range and state its
  confidence when acceptance units differ materially in size or risk. A single
  exact percentage is allowed only when the denominator and weighting are
  explicit and mechanically reproducible.
- **PROGRESS-06** - If no trustworthy denominator exists, say that percentage
  progress is not yet measurable, establish an acceptance inventory first,
  and then report the percentage. Never replace missing evidence with a time
  estimate.
- **PROGRESS-07** - Every progress report must identify the next measurable
  increment: which open acceptance units will move, what evidence completed, and
  which command or artifact will prove the change. Progress is a change in
  verified state, not a narrative about activity.
- **PROGRESS-08** - Existing roadmap durations are historical planning text,
  not valid estimation evidence. When maintaining roadmap documents, replace
  human-duration language with completion percentages, acceptance-unit counts,
  dependencies, and exit-gate status.

## Eliscript Core Boundary

- **CORE-01** - Core progress includes the language, self-hosted compiler,
  runtime, persistent data structures, standard library, host-neutral tooling,
  Emacs development experience, and Emacs performance reinvestment.
- **CORE-02** - UI frameworks, bundlers, blog generators, publishing systems,
  hosting, and similar application infrastructure are replaceable application
  validation only. They never increase core progress, satisfy a core milestone,
  or weaken an unmet core acceptance criterion.

## Implementation Languages and Self-Hosting

- **LANGUAGE-01** - Handwritten implementation code in this repository must be
  Emacs Lisp (`.el`) or Eliscript (`.eli`). This includes compilers, backends,
  runtimes, tools, build orchestration, test runners, test cases and fixtures.
  Do not introduce or extend handwritten JavaScript, `.mjs`, or implementation
  code in any other language, including inside templates or embedded strings.
- **LANGUAGE-02** - The maintained Emacs Lisp compiler builds the first
  Eliscript compiler. That generated Eliscript compiler builds subsequent
  compiler generations and tools from Eliscript sources. New testing
  infrastructure and tests must use the same language system; do not add
  foreign-language helper implementations.
- **LANGUAGE-03** - Existing foreign-language implementations are migration
  debt, not permission to continue using that language for development. When
  the active task needs to change such an implementation, progressively replace
  the affected capability with Emacs Lisp or Eliscript and continue the main
  task through it. Do not stop the current delivery to rewrite or remove every
  unrelated legacy file at once. The eventual goal is to remove handwritten
  foreign-language implementations, including handwritten `.mjs` files.
- **LANGUAGE-04** - JavaScript remains a compiler output target. JavaScript and
  `.mjs` emitted by the compiler are generated artifacts, never an alternative
  source language. Keep generated JavaScript and intermediate compiler/build
  products ignored and untracked; never commit them to Git. Change their `.el`
  or `.eli` source and regenerate them; never hand-edit generated JavaScript or
  label handwritten code as generated. The only bootstrap entry is the
  maintained Emacs Lisp compiler: build the initial Eliscript compiler from
  source, then use that generated compiler for subsequent self-hosted builds.
  Do not substitute a previously released compiler or a checked-in generated
  compiler as the starting point. A checkout must be buildable through this
  single sequence without committed intermediate `.mjs` files.
- **LANGUAGE-05** - Migration must preserve the required behavior and acceptance
  criteria. Fix only defects blocking the active mainline before it is complete;
  retain other failures and deferred work without expanding tools, redesigning
  unrelated systems, or repeatedly retrying unchanged failures.

## Function-First Development

- **DELIVERY-01** - Unless a concrete defect or acceptance blocker takes
  precedence, each engineering turn must advance one executable language,
  compiler, runtime, standard-library, tooling, or Emacs-integration capability.
  Documentation-only and report-only turns do not count as feature progress.
- **DELIVERY-02** - Implement work as a complete vertical slice: observable
  semantics, seed and self-hosted behavior where applicable, focused tests,
  required public-surface documentation, and a signed pushed commit. Avoid
  broad design work before the next executable behavior is understood.
- **DELIVERY-03** - Keep routine governance proportional to the changed
  surface. Refresh generated contracts touched by the slice immediately, but
  defer unrelated performance reports, broad matrices, and maturity audits to
  their milestone gate or to the point where they block a required check.
- **DELIVERY-04** - Lines of code are not a completion metric, but repeated
  turns without new executable behavior are a development-strategy warning.
  When that occurs, stop expanding process artifacts, identify the smallest
  high-value core feature, and ship its locally verified slice first.
- **DELIVERY-05** - Prefer coherent capability batches that deliver every
  closely related API unlocked by one shared design. Split commits only when
  the pieces are independently useful and independently verifiable; do not
  reduce a mature API family to repeated one-function turns.
- **DELIVERY-06** - During a capability batch, iterate with focused tests.
  Refresh generated contracts and run the broad local gate once at the batch
  boundary. Refresh the full compatibility matrix only at a milestone gate or
  when its evidence is the capability being delivered.

## Commit Messages

- **COMMIT-01** - Every commit subject starts with a Conventional Commits type
  and a colon: `feat`, `fix`, `docs`, `test`, `perf`, `refactor`, `chore`,
  `ci`, `build`, or `revert`. An optional scope may follow in parentheses.
- **COMMIT-02** - The type describes the change, not the activity that produced
  it. New or changed observable behavior is `feat`; a defect repair is `fix`;
  tests, fixtures, and acceptance or evidence refreshes are `test`;
  documentation, design, and specification-only changes are `docs`; build,
  packaging, and repository maintenance are `chore`.
- **COMMIT-03** - The subject after the prefix stays imperative, names the
  observable intent, and carries no trailing period. The body records what
  changed, why, and the verification performed.
- **COMMIT-04** - Do not rewrite published history to correct message format.
  Conventional format applies from the next commit forward. A history rewrite
  changes every source identity that retained acceptance evidence is bound to,
  so it is a milestone operation with evidence regeneration, never a cosmetic
  edit.
