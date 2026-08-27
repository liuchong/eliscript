#!/usr/bin/env sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TEMP_DIR=$(mktemp -d "$PROJECT_DIR/.eliscript-test.XXXXXX")
trap 'rm -rf "$TEMP_DIR"' EXIT INT TERM

"$PROJECT_DIR/bin/eliscript" \
  --output "$TEMP_DIR/core.mjs" \
  "$PROJECT_DIR/tests/fixtures/core.eli"

diff -u "$PROJECT_DIR/tests/snapshots/core.mjs" "$TEMP_DIR/core.mjs"

"$PROJECT_DIR/bin/eliscript" \
  --source-map \
  --output "$TEMP_DIR/core-with-map.mjs" \
  "$PROJECT_DIR/tests/fixtures/core.eli"

if [ ! -f "$TEMP_DIR/core-with-map.mjs.map" ]; then
  printf 'expected external source map to be written\n' >&2
  exit 1
fi

if ! grep -F '//# sourceMappingURL=core-with-map.mjs.map' \
  "$TEMP_DIR/core-with-map.mjs" >/dev/null; then
  printf 'expected generated module to reference its source map\n' >&2
  exit 1
fi

SOURCE_MAP_FILE="$TEMP_DIR/core-with-map.mjs.map" bun -e '
  const map = await Bun.file(process.env.SOURCE_MAP_FILE).json();
  if (map.version !== 3 || map.file !== "core-with-map.mjs") process.exit(1);
  if (map.sources.length !== 1 || map.sourcesContent.length !== 1) process.exit(1);
  if (!map.sourcesContent[0].includes("(module test.core")) process.exit(1);
  if (typeof map.mappings !== "string" || map.mappings.length === 0) process.exit(1);
'

if "$PROJECT_DIR/bin/eliscript" --source-map \
  "$PROJECT_DIR/tests/fixtures/core.eli" \
  > "$TEMP_DIR/map-without-output.out" \
  2> "$TEMP_DIR/map-without-output.err"; then
  printf 'expected --source-map without --output to fail\n' >&2
  exit 1
fi

if ! grep -F -- '--source-map requires --output' \
  "$TEMP_DIR/map-without-output.err" >/dev/null; then
  printf 'expected source-map option diagnostic\n' >&2
  exit 1
fi

ACTUAL_OUTPUT=$(bun run "$TEMP_DIR/core.mjs")
SOURCE_MAPPED_OUTPUT=$(bun run "$TEMP_DIR/core-with-map.mjs")
EXPECTED_OUTPUT='{"message":"hello from Eliscript","values":[1,2,3],"factorial":120,"class":"positive","sum":15,"doubled":[2,4,6],"consed":[0,1,2],"empty-car":null}'

if [ "$ACTUAL_OUTPUT" != "$EXPECTED_OUTPUT" ]; then
  printf 'expected: %s\nactual:   %s\n' "$EXPECTED_OUTPUT" "$ACTUAL_OUTPUT" >&2
  exit 1
fi

if [ "$SOURCE_MAPPED_OUTPUT" != "$EXPECTED_OUTPUT" ]; then
  printf 'source-mapped module output differs: %s\n' "$SOURCE_MAPPED_OUTPUT" >&2
  exit 1
fi

"$PROJECT_DIR/bin/eliscript" \
  --source-map \
  --output "$TEMP_DIR/react-counter.mjs" \
  "$PROJECT_DIR/examples/react-counter/main.eli"

if ! grep -F 'react/jsx-runtime' "$TEMP_DIR/react-counter.mjs" >/dev/null; then
  printf 'expected automatic React JSX runtime import\n' >&2
  exit 1
fi

if ! grep -F '"onClick"' "$TEMP_DIR/react-counter.mjs" >/dev/null; then
  printf 'expected React event handler prop\n' >&2
  exit 1
fi

cat > "$TEMP_DIR/render-react.mjs" <<'EOF'
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Counter from "./react-counter.mjs";

console.log(renderToStaticMarkup(
  React.createElement(
    Counter,
    { title: "Eliscript counter" },
    React.createElement("span", { className: "status" }, "Ready"),
  ),
));
EOF

REACT_OUTPUT=$(bun run "$TEMP_DIR/render-react.mjs")
EXPECTED_REACT_OUTPUT='<section class="counter" data-count="0"><h1>Eliscript counter</h1><button type="button">Increment</button><span class="status">Ready</span></section>'

if [ "$REACT_OUTPUT" != "$EXPECTED_REACT_OUTPUT" ]; then
  printf 'expected React markup: %s\nactual React markup:   %s\n' \
    "$EXPECTED_REACT_OUTPUT" "$REACT_OUTPUT" >&2
  exit 1
fi

printf '%s\n' '(defun broken () missing)' > "$TEMP_DIR/broken.eli"
if "$PROJECT_DIR/bin/eliscript" "$TEMP_DIR/broken.eli" \
  > "$TEMP_DIR/broken.out" 2> "$TEMP_DIR/broken.err"; then
  printf 'expected invalid module compilation to fail\n' >&2
  exit 1
fi

if ! grep -F "$TEMP_DIR/broken.eli:1:18: unbound symbol: missing" \
  "$TEMP_DIR/broken.err" >/dev/null; then
  printf 'expected located analyzer diagnostic, got:\n' >&2
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
