# macOS arm64 Acceptance

[Platform records](README.md) |
[Emacs 29.4 report](../matrix/macos-arm64-emacs-29.4.json) |
[Emacs 30.2 report](../matrix/macos-arm64-emacs-30.2.json)

macOS arm64 is the required local acceptance platform. Both contracted Emacs
versions have retained machine-readable reports generated from clean tracked
checkouts.

## Environment

| Property | Value |
| --- | --- |
| Provider | Local machine |
| Operating system | macOS 25.6.0 |
| Architecture | arm64 |
| Bun | 1.4.0 |
| Node.js | 24.20.0 |
| Emacs | 29.4 and 30.2 |

## Results

| Cell | Install | Full test command | Byte compilation | Result |
| --- | --- | --- | --- | --- |
| `macos-arm64-emacs-29.4` | pass | pass | pass | 3/3 pass |
| `macos-arm64-emacs-30.2` | pass | pass | pass | 3/3 pass |

Each full test command completed within the 30-minute contract timeout. Both
reports record exit code zero, no timeout, and clean tracked state before and
after execution. The report files contain the source commit, tree, output
digests, command durations, and generated timestamps.

## Command Sequence

Each cell executes the contract-owned sequence:

```sh
bun install --frozen-lockfile
bun run test
make byte-compile
```

To regenerate one report, provide the matching Emacs and Node.js executables:

```sh
bun tools/compatibility/matrix.mjs --run \
  --emacs /path/to/emacs \
  --node /path/to/node \
  --output acceptance/matrix/macos-arm64-emacs-29.4.json
```

Use the corresponding Emacs 30.2 executable and output filename for the second
cell. A report is retained only after its generated environment matches the
contract and all commands pass.

## Acceptance Meaning

The two reports satisfy the complete required local compatibility profile.
Linux x64 remains a maintained optional target and stays visible as missing;
its absence does not weaken or silently redefine the macOS result.
