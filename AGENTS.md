# Eliscript Agent Rules

## Working Directory

- Perform normal development in the primary project checkout.
- Create parallel Git worktrees only below `_worktree/` in that checkout,
  using task and scope subdirectories as needed. Keep `_worktree/` ignored.
- Do not start new development in temporary directories or separate source
  copies. Run builds and acceptance from the checkout that owns the changes.
- Never store persistent source, uncommitted changes, plans, recovery data,
  long-lived logs or acceptance evidence in system temporary directories.
  Temporary locations are only for disposable, reproducible intermediates.
  Store retained evidence under the project's durable ignored directories.
- Preserve unrelated changes. Commit with a verified signature and deliver
  completed work to the primary branch using fast-forward merges and pushes.

## Current Delivery Target

- The active delivery plan is `docs/bootstrap-0.1.0-plan.md`.
- The maintained Emacs Lisp compiler emits JavaScript stage0. The same frozen
  Eliscript compiler sources then produce JavaScript stage1, stage2 and stage3.
  Require exact stage2/stage3 compiler-product equality.
- Only final stage3 must pass the shared-source JavaScript, WASM and native
  output acceptance. Do not add binary-output acceptance for stage1 or stage2.
- WASM/native compiler hosts and the previous 3-by-3 bootstrap goal are
  cancelled for this delivery. Preserve their historical evidence; do not
  restart that work or require it for 0.0.4. The WASM/native output backends
  and actual generated-program execution remain required.
- `docs/native-wasm-feasibility.md` is historical context, not the active
  construction checklist. The new plan controls scope and acceptance.
- For this delivery, finish all design, then write all required tests without
  running them, then finish all implementation, and only then perform unified
  integration and acceptance. This order supersedes focused-test iteration
  and vertical-slice guidance below. Preserve existing useful work.

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
- **PROGRESS-09** - Report acceptance by fixed denominator with only passed
  and failed counts and percentages for each required output; every required
  unit without valid passing evidence fails acceptance, including skipped,
  cancelled, deferred and unverified units. Preserve their actual execution
  reasons in the evidence; do not fabricate assertion failures. Keep candidates
  separate, and do not present an ongoing run as final acceptance. Track
  repeated problems by stable issue ID in the
  active plan: count actual validation failures and failed behavioral repair
  attempts separately, including repair compilation failures. Record diagnostic
  reruns, launcher failures and cancellations separately. Preserve counts after
  closure; use explicit lower bounds when historical evidence is incomplete.
  Do not rerun an unchanged failure without a concrete new diagnostic reason.
- **PROGRESS-10** - Finish all authorized implementation before starting
  unified acceptance. After acceptance exposes defects, collect them into one
  corrective batch and finish all related code before starting its unified
  verification. Do not run focused tests while other known implementation in
  that batch remains unwritten. Preserve already running useful work and its
  evidence; do not cancel and restart it merely to change reporting categories.

## Eliscript Core Boundary

- **PLATFORMS-01** - Establish a passing baseline on a current stable or latest
  long-term-support platform, JavaScript runtime and browser release. Choose
  the simplest route to that complete working release. Retain compatibility
  that already works; neither adding compatibility nor removing it is a goal.
  Historical platform evidence does not create a current support obligation.
- **PLATFORMS-02** - Update this project's outdated test pages and tools
  directly when they block the current delivery. Preserve valid language
  assertions and independently checkable evidence, but do not preserve obsolete
  implementation constraints or add unrelated modernization work. Prefer the
  smallest complete change that passes the active bootstrap and output gates.

- **SEMANTICS-01** - Eliscript semantics are authoritative across JavaScript,
  WASM and native outputs and supported hosts. Missing host methods, incorrect
  native implementations and differing Unicode versions must be handled by
  Eliscript compiler/runtime compatibility implementations, rather than by
  weakening expected results or accepting host-dependent Eliscript behavior.
- **SEMANTICS-02** - Preserve intentional user overrides and observable
  evaluation, conversion, exception and identity behavior while adapting host
  operations. Keep the same source and independent expected results across
  targets; a compatibility helper alone is not proof of generated-program
  correctness.
- **SEMANTICS-03** - Access to host-specific JavaScript behavior belongs in
  explicitly named/documented JavaScript interoperation APIs, separate from
  portable Eliscript semantics. Add such APIs when required; they are not a
  prerequisite for this release and must not expand the current mainline.

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

## Performance Optimization

- **PERF-01** - **Development Goal**: Design and implement the compiler,
  runtime, persistent data structures, and standard library for ClojureScript-level
  algorithmic optimality and JavaScript engine (V8/JavaScriptCore) specialization.
  Prefer $O(1)$ tail/chunk/indexed fast-paths, transient collection builders
  (`transient` / `conj!` / `assoc!` / `persistent!`), monomorphic protocol and
  symbol-property dispatch, reference-identity (`===`) short-circuits in value
  equality and ordering, compact $O(1)$-step zipper path chains, and structural
  sharing without redundant array or metadata cloning in hot loops.
- **PERF-02** - **Acceptance Gate**: Every release and every performance-sensitive
  change to `compiler/`, `runtime/`, or `stdlib/` must execute the normalized
  four-dimension version and native Emacs Lisp benchmark
  (`tools/performance/version-comparison.eli`, invoked via
  `bun run benchmark:version-comparison`) across all four canonical dimensions:
  1. `emacsLisp` (current latest host Emacs Lisp only),
  2. `previousMajor` (highest release of the prior major version, or `absent` in `0.x`),
  3. `previousMinor` (immediately preceding release `< latest`, deduplicating execution when identical to `previousMajor`),
  4. `latest` (current workspace version).
  Generated JavaScript runtime and standard-library workloads must outperform
  native Emacs Lisp across core collection, sequence, ordering, aggregation, and
  deep zipper workloads, and must not introduce unexplained regressions against
  `previousMajor` or `previousMinor`.
- **PERF-03** - **Long-Term Continuous Optimization**: Treat algorithmic time
  and space complexity, JavaScript JIT friendliness, allocation density, and
  compiled artifact sizes (`.mjs`, browser bundles, WASM, and native binaries)
  as a standing long-term optimization objective across all future deliveries.
  Every release must publish the concise four-dimension benchmark summary on the
  main GitHub Release page (`release-summary.md`) and attach the full detailed
  benchmark reports (`eliscript-<version>-benchmark-report.md` and
  `eliscript-<version>-benchmark-report.json`) as release assets.

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
