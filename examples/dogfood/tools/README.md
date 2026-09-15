# dogfood Tools

[dogfood README](../README.md) | [Design specifications](../specs/README.md)

`spec-check.eli` is an Eliscript program that validates the dogfood design
documents for internal consistency. It is the project's first executable
artifact and the maintained defense against design drift: the specification
set, the specification index, and the progress counts in the project README
must agree with each other.

The program is authored in Eliscript and compiled to JavaScript. It imports the
public Eliscript runtime boundary plus explicit Node host interop for files,
arguments, and the process exit status. It has no other dependency and no
handwritten JavaScript.

## Usage

From the Eliscript repository root:

```sh
./bin/eliscript --output dist/dogfood-spec-check.mjs \
  examples/dogfood/tools/spec-check.eli
bun dist/dogfood-spec-check.mjs --root examples/dogfood
```

The same build is available as `bun run check:dogfood`.

| Option | Meaning |
| --- | --- |
| `--root DIR` | Project root to validate. Defaults to the current directory. |
| `--json` | Emit one machine-readable report instead of the human summary. |
| `--help` | Print usage. |

The process exits `0` when every rule passes and `1` when any rule fails. A
`--root` that does not contain `specs/` reports the missing index rather than
scanning an unrelated directory.

## Rule Inventory

Each failure carries a stable code so tests can assert the exact rule.

| Code | Rule |
| --- | --- |
| `DF-HEADING` | Every `specs/NNNN-*.md` opens with a level-one `# NNNN: Title` heading and a non-empty title. |
| `DF-ID` | The heading identifier equals the file-name identifier. |
| `DF-METADATA` | Every specification declares `- Status:` and `- Implementation:` from the allowed vocabularies. |
| `DF-DUPLICATE` | Specification identifiers are unique. |
| `DF-INDEX` | `specs/README.md` exists. |
| `DF-INDEX-MISSING` | Every specification is linked from the index. |
| `DF-INDEX-STALE` | The index links no specification that does not exist. |
| `DF-README` | The project README progress rows agree with the computed design, gate, and acceptance denominators. |
| `DF-CRITERIA` | Acceptance-criterion identifiers in specification 0009 are unique. |
| `DF-CRITERIA-PROSE` | The acceptance standard states its criterion count as an Arabic numeral equal to the table length. |
| `DF-LINK-ESCAPE` | No relative Markdown link escapes the project root, so the directory still works after export as a repository root. |
| `DF-LINK-MISSING` | Every relative Markdown link resolves to a file inside the project. |

## Scope

The checker validates design-document consistency only. It does not evaluate
whether an accepted design is implemented, and a passing run is not
implementation evidence. Executable status remains defined by the
implementation gates and acceptance criteria in
[specification 0009](../specs/0009-delivery-and-acceptance.md).
