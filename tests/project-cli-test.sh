#!/usr/bin/env sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/eliscript-project-cli.XXXXXX")
TMP_DIR=$(CDPATH= cd -- "$TMP_DIR" && pwd -P)
trap 'rm -rf "$TMP_DIR"' EXIT HUP INT TERM

OUTPUT=$(
  cd "$PROJECT_DIR"
  "$PROJECT_DIR/bin/eliscript-build" \
    --root "$PROJECT_DIR" \
    --out-dir "$TMP_DIR/build" \
    "$PROJECT_DIR/examples/stdlib-cli/main.eli"
)

ENTRY="$TMP_DIR/build/examples/stdlib-cli/main.mjs"
SEQUENCE="$TMP_DIR/build/stdlib/sequence.mjs"
TEXT="$TMP_DIR/build/stdlib/text.mjs"

test "$OUTPUT" = "$ENTRY"
test -f "$ENTRY"
test -f "$ENTRY.map"
test -f "$SEQUENCE"
test -f "$SEQUENCE.map"
test -f "$TEXT"
test -f "$TEXT.map"
grep -q 'from "../../stdlib/sequence.mjs"' "$ENTRY"
grep -q 'from "../../stdlib/text.mjs"' "$ENTRY"
! grep -q '\.eli"' "$ENTRY"

RESULT=$(bun run "$ENTRY")
test "$RESULT" = '{"values":[1,2,3,4,5,6,7],"squares":[1,4,9,16,25,36,49],"even":[2,4,6],"sum":28,"summary":"1, 2, 3, 4, 5, 6, 7","slug":"eliscript","title":"Emacs + JavaScript"}'

if "$PROJECT_DIR/bin/eliscript-build" "$PROJECT_DIR/examples/stdlib-cli/main.eli" \
    >"$TMP_DIR/stdout" 2>"$TMP_DIR/stderr"; then
  printf '%s\n' 'expected missing --out-dir to fail' >&2
  exit 1
fi
grep -q 'missing --out-dir' "$TMP_DIR/stderr"
