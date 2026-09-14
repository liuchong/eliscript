# Linux Platform Validation

[Platform records](README.md) |
[Compatibility contract](../../contracts/compatibility-matrix.json) |
[Acceptance profile](../../specs/0179-local-acceptance-compatibility-profile.md)

The compatibility contract targets Linux x64. A separate Linux arm64 run was
completed in a temporary local Lima instance to exercise the compiler, runtime,
standard library, Emacs integration, command-line tools, and application
validation on a native Linux architecture.

## Linux x64 Matrix Status

The two formal Linux x64 cells are optional and currently have no retained
reports:

- `linux-x64-emacs-29.4`
- `linux-x64-emacs-30.2`

A software-emulated x64 trial did not complete the full suite within the fixed
30-minute command budget, so no x64 report was retained and no Linux x64 pass is
claimed. This remains a visible compatibility coverage gap, not a blocker for
the current macOS-required acceptance profile.

## Linux arm64 Lima Validation

The supplemental run used a fresh Ubuntu 24.04 LTS arm64 instance and source
commit `71c6949ef5b3f52e7296f708695728d09818a48b`. The instance was removed after
the run.

| Property | Value |
| --- | --- |
| Virtualization | Lima with native arm64 virtualization |
| Kernel | Linux 6.8.0-134-generic |
| Architecture | aarch64 |
| Capacity | 12 vCPU, 12 GiB memory, 32 GiB disk |
| Bun | 1.4.0, arm64 |
| Node.js | 24.20.0, arm64 |
| Emacs | 29.4 and 30.2, built for arm64 |

## Results

| Check | Emacs 29.4 | Emacs 30.2 |
| --- | --- | --- |
| Full `bun run test` | pass | pass |
| Emacs ERT suite | 167/167 pass | 167/167 pass |
| Main Bun suite | 429 pass, 7 skip, 0 fail | 429 pass, 7 skip, 0 fail |
| Org ERT suite | 3/3 pass | 3/3 pass |
| Application Bun suite | 7/7 pass | 7/7 pass |
| Compiler, project, check, and formatter CLIs | pass | pass |
| React and Org application builds | pass | pass |
| Warning-as-error byte compilation | pass | pass |

The full test commands completed in approximately 740 seconds on Emacs 29.4
and 726 seconds on Emacs 30.2. The seven skipped Bun tests are recursive checks
of already-retained acceptance artifacts. They were disabled with
`ELISCRIPT_SKIP_RETAINED_ACCEPTANCE=1` so a supplemental host run would not
attempt to validate or regenerate formal source-bound reports. Language,
compiler, runtime, standard-library, editor, CLI, and application tests were not
skipped.

## Reproduction Shape

Run each Emacs version from a clean checkout with the contracted Bun and Node.js
versions selected on `PATH`:

```sh
ELISCRIPT_SKIP_RETAINED_ACCEPTANCE=1 \
EMACS=/path/to/emacs \
bun run test

ELISCRIPT_SKIP_RETAINED_ACCEPTANCE=1 \
EMACS=/path/to/emacs \
make byte-compile
```

This record demonstrates native Linux arm64 portability for the exercised
revision. It does not change the declared Linux architecture, create a formal
matrix report, or contribute to the final core acceptance result.
