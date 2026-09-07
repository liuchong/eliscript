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
