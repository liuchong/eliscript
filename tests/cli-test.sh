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

if "$PROJECT_DIR/bin/eliscript" --diagnostic-format json \
  "$PROJECT_DIR/tests/fixtures/diagnostic-unbound.eli" \
  > "$TEMP_DIR/diagnostic.out" \
  2> "$TEMP_DIR/diagnostic.json"; then
  printf 'expected unbound symbol compilation to fail\n' >&2
  exit 1
fi

DIAGNOSTIC_FILE="$TEMP_DIR/diagnostic.json" bun -e '
  const diagnostic = await Bun.file(process.env.DIAGNOSTIC_FILE).json();
  if (diagnostic.format !== "eliscript-diagnostic" ||
      diagnostic.version !== 1 ||
      diagnostic.code !== "ELI-A0001" ||
      diagnostic.severity !== "error" ||
      diagnostic.phase !== "analysis" ||
      diagnostic.message !== "unbound symbol: missing" ||
      !diagnostic.location.file.endsWith("tests/fixtures/diagnostic-unbound.eli") ||
      diagnostic.location.start.offset !== 19 ||
      diagnostic.location.start.line !== 2 ||
      diagnostic.location.start.column !== 3) {
    throw new Error("unexpected seed compiler diagnostic");
  }
'

if "$PROJECT_DIR/bin/eliscript" --diagnostic-format json --unknown \
  > "$TEMP_DIR/option.out" 2> "$TEMP_DIR/option.json"; then
  printf 'expected unknown option to fail\n' >&2
  exit 1
fi

DIAGNOSTIC_FILE="$TEMP_DIR/option.json" bun -e '
  const diagnostic = await Bun.file(process.env.DIAGNOSTIC_FILE).json();
  if (diagnostic.code !== "ELI-C0001" || diagnostic.phase !== "cli" ||
      diagnostic.message !== "unknown option: --unknown" ||
      Object.hasOwn(diagnostic, "location")) {
    throw new Error("unexpected CLI fallback diagnostic");
  }
'

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

EXCEPTIONS_MODULE="$TEMP_DIR/exceptions.mjs"
"$PROJECT_DIR/bin/eliscript" \
  --source-map \
  --output "$EXCEPTIONS_MODULE" \
  "$PROJECT_DIR/tests/fixtures/exceptions.eli"

EXCEPTIONS_OUTPUT=$(ELISCRIPT_EXCEPTIONS_MODULE="$EXCEPTIONS_MODULE" bun --eval '
  const { pathToFileURL } = await import("node:url");
  const module = await import(pathToFileURL(process.env.ELISCRIPT_EXCEPTIONS_MODULE));
  let rethrown = null;
  try { module.rethrow(); } catch (error) { rethrown = error; }
  console.log(JSON.stringify([
    module.recover(3),
    module.recover(0),
    module.finally_only(9),
    await module.settle(Promise.resolve(7)),
    await module.settle(Promise.reject(new Error("bad"))),
    rethrown,
    module.cleanup_count,
  ]));
')

if [ "$EXCEPTIONS_OUTPUT" != '[4,"caught:zero",9,7,"async:bad","inner:outer",3]' ]; then
  printf 'expected exception output: [4,"caught:zero",9,7,"async:bad","inner:outer",3]\nactual exception output:   %s\n' \
    "$EXCEPTIONS_OUTPUT" >&2
  exit 1
fi

PATTERNS_MODULE="$TEMP_DIR/vector-patterns.mjs"
"$PROJECT_DIR/bin/eliscript" \
  --source-map \
  --output "$PATTERNS_MODULE" \
  "$PROJECT_DIR/tests/fixtures/vector-patterns.eli"

PATTERNS_OUTPUT=$(ELISCRIPT_PATTERNS_MODULE="$PATTERNS_MODULE" bun --eval '
  const { pathToFileURL } = await import("node:url");
  const module = await import(pathToFileURL(process.env.ELISCRIPT_PATTERNS_MODULE));
  console.log(JSON.stringify([
    module.unpack([1, [2, 3, 4], 5, 6], [9]),
    module.unpack([1, [2, 3, 4]]),
    module.let_pattern(),
    module.let_star_pattern(),
    module.pair_sum([20, 22]),
    module.catch_pair(),
  ]));
')

EXPECTED_PATTERNS='[[1,2,4,[5,6],9,5,[6],9],[1,2,4,[],null,null,[],null],8,7,42,[7,"caught"]]'
if [ "$PATTERNS_OUTPUT" != "$EXPECTED_PATTERNS" ]; then
  printf 'expected vector pattern output: %s\nactual vector pattern output:   %s\n' \
    "$EXPECTED_PATTERNS" "$PATTERNS_OUTPUT" >&2
  exit 1
fi

MAP_PATTERNS_MODULE="$TEMP_DIR/map-patterns.mjs"
"$PROJECT_DIR/bin/eliscript" \
  --source-map \
  --output "$MAP_PATTERNS_MODULE" \
  "$PROJECT_DIR/tests/fixtures/map-patterns.eli"

MAP_PATTERNS_OUTPUT=$(ELISCRIPT_MAP_PATTERNS_MODULE="$MAP_PATTERNS_MODULE" bun --eval '
  const { pathToFileURL } = await import("node:url");
  const module = await import(pathToFileURL(process.env.ELISCRIPT_MAP_PATTERNS_MODULE));
  console.log(JSON.stringify([
    module.unpack({ name: "Ada" }),
    module.unpack({ name: "Ada", age: null, note: null }),
    module.optional_map(),
    module.explicit_and_nested({ name: "Ada", profile: { city: "London" } }),
    module.lexical_map({ name: "Ada" }),
    module.countdown({ remaining: 10000 }),
    module.catch_map(),
    module.portable_name({ name: "portable" }),
    module.persistent_map_pattern(),
  ]));
')

EXPECTED_MAP_PATTERNS='[["Ada",18,"missing"],["Ada",null,null],"anonymous",["Ada","London"],["Ada",18,{"name":"Ada"}],0,[7,"caught"],"portable",["Eliscript",18]]'
if [ "$MAP_PATTERNS_OUTPUT" != "$EXPECTED_MAP_PATTERNS" ]; then
  printf 'expected map pattern output: %s\nactual map pattern output:   %s\n' \
    "$EXPECTED_MAP_PATTERNS" "$MAP_PATTERNS_OUTPUT" >&2
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
