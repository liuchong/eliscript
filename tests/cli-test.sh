#!/usr/bin/env sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT INT TERM

"$PROJECT_DIR/bin/eliscript" \
  --output "$TEMP_DIR/core.mjs" \
  "$PROJECT_DIR/tests/fixtures/core.eli"

diff -u "$PROJECT_DIR/tests/snapshots/core.mjs" "$TEMP_DIR/core.mjs"

ACTUAL_OUTPUT=$(bun run "$TEMP_DIR/core.mjs")
EXPECTED_OUTPUT='{"message":"hello from Eliscript","values":[1,2,3],"factorial":120,"class":"positive","sum":15,"doubled":[2,4,6],"consed":[0,1,2],"empty-car":null}'

if [ "$ACTUAL_OUTPUT" != "$EXPECTED_OUTPUT" ]; then
  printf 'expected: %s\nactual:   %s\n' "$EXPECTED_OUTPUT" "$ACTUAL_OUTPUT" >&2
  exit 1
fi

printf 'CLI and Bun execution test passed\n'
