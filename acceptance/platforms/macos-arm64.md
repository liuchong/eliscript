# macOS arm64 Acceptance

[Platform records](README.md) |
[Emacs 32.0.50 report](../matrix/macos-arm64-emacs-32.0.50.json)

macOS arm64 is the required local acceptance platform. The contracted Emacs
32.0.50 cell has a retained machine-readable report generated from a clean
tracked checkout.

## Environment

| Property | Value |
| --- | --- |
| Provider | Local machine |
| Operating system | Darwin 27.2.0 |
| Architecture | arm64 |
| Bun | 1.4.5 |
| Node.js | 24.22.3 |
| Emacs | 32.0.50 |

## Results

| Cell | Install | Full test command | Byte compilation | Result |
| --- | --- | --- | --- | --- |
| `macos-arm64-emacs-32.0.50` | pass | pass | pass | 3/3 pass |

The full test command completed within the 30-minute contract timeout. The report
records exit code zero, no timeout, and clean tracked state before and after
execution. The report file contains the source commit, tree, output digests,
command durations, and generated timestamps.

## Command Sequence

The cell executes the contract-owned sequence:

```sh
bun install --frozen-lockfile
bun run test
make byte-compile
```

To regenerate the report, provide the matching Emacs and Node.js executables:

```sh
bun tools/compatibility/matrix.mjs --run \
  --emacs /path/to/emacs \
  --node /path/to/node \
  --output acceptance/matrix/macos-arm64-emacs-32.0.50.json
```

The report is retained only after its generated environment matches the contract
and all commands pass.

## Acceptance Meaning

The report satisfies the complete required local compatibility profile. Linux
x64 and Linux arm64 remain maintained optional targets and stay visible as
missing; their absence does not weaken or silently redefine the macOS result.
