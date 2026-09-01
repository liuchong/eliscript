#!/usr/bin/env sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TEMP_DIR=$(mktemp -d "$PROJECT_DIR/.eliscript-format-test.XXXXXX")
trap 'rm -rf "$TEMP_DIR"' EXIT INT TERM

SOURCE="$TEMP_DIR/source.eli"
EXPECTED="$TEMP_DIR/expected.eli"
BUN_OUTPUT="$TEMP_DIR/bun.eli"
NODE_OUTPUT="$TEMP_DIR/node.eli"

printf '%s%s\n%s\n%s\n' '; heading' '   ' \
  '(module   test.format' '(defun  answer () 42))' > "$SOURCE"
printf '%s' '; heading
(module test.format (defun answer () 42))
' > "$EXPECTED"

cp "$SOURCE" "$TEMP_DIR/original.eli"
"$PROJECT_DIR/bin/eliscript-format" "$SOURCE" > "$BUN_OUTPUT"
ELISCRIPT_JS_RUNTIME=node \
  "$PROJECT_DIR/bin/eliscript-format" "$SOURCE" > "$NODE_OUTPUT"
cmp "$EXPECTED" "$BUN_OUTPUT"
cmp "$BUN_OUTPUT" "$NODE_OUTPUT"
cmp "$SOURCE" "$TEMP_DIR/original.eli"

if "$PROJECT_DIR/bin/eliscript-format" --check \
  --diagnostic-format json "$SOURCE" \
  > "$TEMP_DIR/check.out" 2> "$TEMP_DIR/check.json"; then
  printf 'expected format check to reject non-canonical source\n' >&2
  exit 1
fi

DIAGNOSTIC_FILE="$TEMP_DIR/check.json" bun --eval '
  const diagnostic = await Bun.file(process.env.DIAGNOSTIC_FILE).json();
  if (diagnostic.format !== "eliscript-diagnostic" ||
      diagnostic.version !== 1 ||
      diagnostic.code !== "ELI-F0002" ||
      diagnostic.phase !== "formatter" ||
      diagnostic.message !== "file is not formatted" ||
      !diagnostic.location.file.endsWith("source.eli")) {
    throw new Error("unexpected format-check diagnostic");
  }
'
cmp "$SOURCE" "$TEMP_DIR/original.eli"

"$PROJECT_DIR/bin/eliscript-format" --write "$SOURCE"
cmp "$SOURCE" "$EXPECTED"
"$PROJECT_DIR/bin/eliscript-format" --check "$SOURCE"
cp "$SOURCE" "$TEMP_DIR/canonical.eli"
"$PROJECT_DIR/bin/eliscript-format" --write "$SOURCE"
cmp "$SOURCE" "$TEMP_DIR/canonical.eli"

printf '%s' '(module broken' > "$TEMP_DIR/broken.eli"
if "$PROJECT_DIR/bin/eliscript-format" --diagnostic-format json \
  "$TEMP_DIR/broken.eli" \
  > "$TEMP_DIR/broken.out" 2> "$TEMP_DIR/broken.json"; then
  printf 'expected formatter to reject invalid source\n' >&2
  exit 1
fi

DIAGNOSTIC_FILE="$TEMP_DIR/broken.json" bun --eval '
  const diagnostic = await Bun.file(process.env.DIAGNOSTIC_FILE).json();
  if (diagnostic.code !== "ELI-R0001" || diagnostic.phase !== "reader" ||
      !diagnostic.location.file.endsWith("broken.eli")) {
    throw new Error("unexpected formatter reader diagnostic");
  }
'

if "$PROJECT_DIR/bin/eliscript-format" --write --check \
  --diagnostic-format json "$SOURCE" \
  > "$TEMP_DIR/options.out" 2> "$TEMP_DIR/options.json"; then
  printf 'expected mutually exclusive formatter options to fail\n' >&2
  exit 1
fi

DIAGNOSTIC_FILE="$TEMP_DIR/options.json" bun --eval '
  const diagnostic = await Bun.file(process.env.DIAGNOSTIC_FILE).json();
  if (diagnostic.code !== "ELI-C0001" || diagnostic.phase !== "cli" ||
      diagnostic.message !== "--write and --check are mutually exclusive") {
    throw new Error("unexpected formatter option diagnostic");
  }
'

printf 'Formatter CLI test passed\n'
