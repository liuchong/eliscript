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

printf '%s\n' '(defun broken () missing)' > "$TEMP_DIR/broken.eli"
if "$PROJECT_DIR/bin/eliscript" "$TEMP_DIR/broken.eli" \
  > "$TEMP_DIR/broken.out" 2> "$TEMP_DIR/broken.err"; then
  printf 'expected invalid module compilation to fail\n' >&2
  exit 1
fi

if ! grep -F "$TEMP_DIR/broken.eli: unbound symbol: missing" \
  "$TEMP_DIR/broken.err" >/dev/null; then
  printf 'expected filename-bearing analyzer diagnostic, got:\n' >&2
  cat "$TEMP_DIR/broken.err" >&2
  exit 1
fi

cat > "$TEMP_DIR/macro.eli" <<'EOF'
(module macro.example
  (defmacro twice (value) `(+ ,value ,value))
  (print (twice 21)))
EOF

"$PROJECT_DIR/bin/eliscript" \
  --output "$TEMP_DIR/macro.mjs" \
  "$TEMP_DIR/macro.eli"

if grep -F 'defmacro' "$TEMP_DIR/macro.mjs" >/dev/null; then
  printf 'compile-time macro leaked into generated module\n' >&2
  exit 1
fi

MACRO_OUTPUT=$(bun run "$TEMP_DIR/macro.mjs")
if [ "$MACRO_OUTPUT" != '42' ]; then
  printf 'expected macro output 42, got: %s\n' "$MACRO_OUTPUT" >&2
  exit 1
fi

printf 'CLI and Bun execution test passed\n'
