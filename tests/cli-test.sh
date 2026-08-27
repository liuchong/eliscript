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
EXPECTED_OUTPUT='{"message":"hello from Eliscript","values":[1,2,3],"factorial":120,"class":"positive","sum":15,"doubled":[2,4,6],"consed":[0,1,2],"empty-car":null,"nil-only":[true,false],"undefined-only":[false,true],"nullish":[true,true,false],"legacy-null":[true,true,false],"parameters":[["required",null,[]],["required",null,[]],["required","optional",[3,4]]]}'

if [ "$ACTUAL_OUTPUT" != "$EXPECTED_OUTPUT" ]; then
  printf 'expected: %s\nactual:   %s\n' "$EXPECTED_OUTPUT" "$ACTUAL_OUTPUT" >&2
  exit 1
fi

if [ "$SOURCE_MAPPED_OUTPUT" != "$EXPECTED_OUTPUT" ]; then
  printf 'source-mapped module output differs: %s\n' "$SOURCE_MAPPED_OUTPUT" >&2
  exit 1
fi

ASYNC_MODULE="$TEMP_DIR/async.mjs"
"$PROJECT_DIR/bin/eliscript" \
  --source-map \
  --output "$ASYNC_MODULE" \
  "$PROJECT_DIR/tests/fixtures/async.eli"

ASYNC_OUTPUT=$(ELISCRIPT_ASYNC_MODULE="$ASYNC_MODULE" bun --eval '
  const { pathToFileURL } = await import("node:url");
  const module = await import(pathToFileURL(process.env.ELISCRIPT_ASYNC_MODULE));
  console.log(JSON.stringify([
    await module.resolve_value(21),
    await module.resolve_value(21, module.delayed_double),
    await module.delayed_double(10),
    await module.await_sequence(),
    await module.count_to(3),
    await module.choose(false),
    await module.choose(true),
    await module.await_function(),
  ]));
')

if [ "$ASYNC_OUTPUT" != '[21,42,20,2,3,false,"yes",5]' ]; then
  printf 'expected async output: [21,42,20,2,3,false,"yes",5]\nactual async output:   %s\n' \
    "$ASYNC_OUTPUT" >&2
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

VITE_OUTPUT="$TEMP_DIR/vite-build"
ELISCRIPT_BUILD_OUT_DIR="$VITE_OUTPUT" \
  bun run --cwd "$PROJECT_DIR" build:react-counter

if [ ! -f "$VITE_OUTPUT/index.html" ]; then
  printf 'expected Vite index output\n' >&2
  exit 1
fi

VITE_SCRIPT=$(find "$VITE_OUTPUT/assets" -name 'index-*.js' -print -quit)
VITE_STYLE=$(find "$VITE_OUTPUT/assets" -name 'index-*.css' -print -quit)
VITE_MAP=$(find "$VITE_OUTPUT/assets" -name 'index-*.js.map' -print -quit)

if [ -z "$VITE_SCRIPT" ] || [ -z "$VITE_STYLE" ] || [ -z "$VITE_MAP" ]; then
  printf 'expected Vite JavaScript, CSS, and source-map assets\n' >&2
  exit 1
fi

if ! grep -F 'Interactive counter' "$VITE_SCRIPT" >/dev/null || \
   ! grep -F 'Portable sequence library' "$VITE_SCRIPT" >/dev/null; then
  printf 'expected compiled browser counter and sequence library in Vite bundle\n' >&2
  exit 1
fi

if ! grep -F 'examples/react-counter/browser.eli' "$VITE_MAP" >/dev/null || \
   ! grep -F 'examples/react-counter/main.eli' "$VITE_MAP" >/dev/null || \
   ! grep -F 'stdlib/sequence.eli' "$VITE_MAP" >/dev/null; then
  printf 'expected Eliscript sources in bundled source map\n' >&2
  exit 1
fi

ORG_MODULE="$TEMP_DIR/articles.mjs"
ORG_MODULE_SECOND="$TEMP_DIR/articles-second.mjs"
ORG_MODULE_WITH_DRAFTS="$TEMP_DIR/articles-with-drafts.mjs"
"$PROJECT_DIR/bin/eliscript-org" \
  --output "$ORG_MODULE" \
  "$PROJECT_DIR/examples/org-site/content"
"$PROJECT_DIR/bin/eliscript-org" \
  --output "$ORG_MODULE_SECOND" \
  "$PROJECT_DIR/examples/org-site/content"
"$PROJECT_DIR/bin/eliscript-org" \
  --include-drafts \
  --output "$ORG_MODULE_WITH_DRAFTS" \
  "$PROJECT_DIR/examples/org-site/content"

if ! cmp -s "$ORG_MODULE" "$ORG_MODULE_SECOND"; then
  printf 'expected deterministic Org module output\n' >&2
  exit 1
fi

cat > "$TEMP_DIR/verify-org.mjs" <<'EOF'
import { articles } from "./articles.mjs";

if (articles.length !== 2) throw new Error("expected two published articles");
if (articles[0].slug !== "emacs-compiler-host") {
  throw new Error("expected articles sorted by date");
}
if (!articles[0].html.includes("emacs-compiler-host-section-1")) {
  throw new Error("expected stable Org heading ids");
}
if (articles.some((article) => article.draft)) {
  throw new Error("expected drafts to be filtered");
}
EOF

bun run "$TEMP_DIR/verify-org.mjs"

ORG_MODULE_WITH_DRAFTS="$ORG_MODULE_WITH_DRAFTS" bun -e '
  const module = await import(process.env.ORG_MODULE_WITH_DRAFTS);
  if (module.articles.length !== 3) throw new Error("expected included draft");
  if (!module.articles.some((article) => article.draft)) {
    throw new Error("expected draft flag to remain visible");
  }
'

ORG_SITE_OUTPUT="$TEMP_DIR/org-site-build"
ELISCRIPT_BUILD_OUT_DIR="$ORG_SITE_OUTPUT" \
  bun run --cwd "$PROJECT_DIR" build:org-site

ORG_SITE_SCRIPT=$(find "$ORG_SITE_OUTPUT/assets" -name 'index-*.js' -print -quit)
ORG_SITE_STYLE=$(find "$ORG_SITE_OUTPUT/assets" -name 'index-*.css' -print -quit)
ORG_SITE_MAP=$(find "$ORG_SITE_OUTPUT/assets" -name 'index-*.js.map' -print -quit)

if [ -z "$ORG_SITE_SCRIPT" ] || [ -z "$ORG_SITE_STYLE" ] || \
   [ -z "$ORG_SITE_MAP" ]; then
  printf 'expected Org site JavaScript, CSS, and source-map assets\n' >&2
  exit 1
fi

if ! grep -F 'stdlib/sequence.eli' "$ORG_SITE_MAP" >/dev/null || \
   ! grep -F 'stdlib/text.eli' "$ORG_SITE_MAP" >/dev/null || \
   ! grep -F 'stdlib/object.eli' "$ORG_SITE_MAP" >/dev/null; then
  printf 'expected standard-library sources in Org site source map\n' >&2
  exit 1
fi

if ! grep -F 'Emacs is the compiler host' "$ORG_SITE_SCRIPT" >/dev/null || \
   ! grep -F 'A Lisp-shaped publishing pipeline' "$ORG_SITE_SCRIPT" >/dev/null;
then
  printf 'expected published Org articles in site bundle\n' >&2
  exit 1
fi

if grep -F 'An unpublished note' "$ORG_SITE_SCRIPT" >/dev/null; then
  printf 'expected draft Org article to stay out of site bundle\n' >&2
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
