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
OBJECT="$TMP_DIR/build/stdlib/object.mjs"
MANIFEST="$TMP_DIR/build/eliscript-project.json"

test "$OUTPUT" = "$ENTRY"

NO_CACHE_OUTPUT=$(
  cd "$PROJECT_DIR"
  "$PROJECT_DIR/bin/eliscript-build" \
    --no-cache \
    --root "$PROJECT_DIR" \
    --out-dir "$TMP_DIR/build" \
    "$PROJECT_DIR/examples/stdlib-cli/main.eli"
)
test "$NO_CACHE_OUTPUT" = "$ENTRY"

JSON_REPORT=$(
  cd "$PROJECT_DIR"
  "$PROJECT_DIR/bin/eliscript-build" \
    --json \
    --root "$PROJECT_DIR" \
    --out-dir "$TMP_DIR/build" \
    "$PROJECT_DIR/examples/stdlib-cli/main.eli"
)
printf '%s' "$JSON_REPORT" | bun --eval '
  const report = JSON.parse(await Bun.stdin.text());
  if (report.format !== "eliscript-build-report" ||
      report.version !== 1 ||
      report.entryOutput !== "examples/stdlib-cli/main.mjs" ||
      report.cache.status !== "hit" ||
      report.counts.compiled !== 0 ||
      report.counts.reused !== 4 ||
      report.modules.some((module) => module.status !== "reused" ||
        module.reason !== "verified")) {
    throw new Error("unexpected incremental build report");
  }
'

test -f "$ENTRY"
test -f "$ENTRY.map"
test -f "$SEQUENCE"
test -f "$SEQUENCE.map"
test -f "$TEXT"
test -f "$TEXT.map"
test -f "$OBJECT"
test -f "$OBJECT.map"
test -f "$MANIFEST"
grep -q '"entry":"examples/stdlib-cli/main.mjs"' "$MANIFEST"
grep -q '"digest":"[0-9a-f][0-9a-f]*"' "$MANIFEST"
grep -q 'from "../../stdlib/sequence.mjs"' "$ENTRY"
grep -q 'from "../../stdlib/text.mjs"' "$ENTRY"
grep -q 'from "../../stdlib/object.mjs"' "$ENTRY"
! grep -q '\.eli"' "$ENTRY"

RESULT=$(bun run "$ENTRY")
test "$RESULT" = '{"values":[1,2,3,4,5,6,7],"squares":[1,4,9,16,25,36,49],"even":[2,4,6],"sum":28,"summary":"1, 2, 3, 4, 5, 6, 7","slug":"eliscript","title":"Emacs + JavaScript","profile":{"language":"Eliscript","host":"Emacs","runtime":"JavaScript"},"selected":{"language":"Eliscript","runtime":"JavaScript"}}'

if "$PROJECT_DIR/bin/eliscript-build" "$PROJECT_DIR/examples/stdlib-cli/main.eli" \
    >"$TMP_DIR/stdout" 2>"$TMP_DIR/stderr"; then
  printf '%s\n' 'expected missing --out-dir to fail' >&2
  exit 1
fi
grep -q 'missing --out-dir' "$TMP_DIR/stderr"

PORTABLE_OUTPUT=$(
  cd "$PROJECT_DIR"
  "$PROJECT_DIR/bin/eliscript-build" \
    --root "$PROJECT_DIR/stdlib" \
    --portable group-by \
    --out-dir "$TMP_DIR/portable" \
    "$PROJECT_DIR/stdlib/data.eli"
)

PORTABLE_DATA="$TMP_DIR/portable/data.mjs"
PORTABLE_OBJECT="$TMP_DIR/portable/object.mjs"
PORTABLE_MANIFEST="$TMP_DIR/portable/eliscript-project.json"
test "$PORTABLE_OUTPUT" = "$PORTABLE_DATA"
test -f "$PORTABLE_DATA"
test -f "$PORTABLE_OBJECT"
test -f "$PORTABLE_MANIFEST"
grep -q '"entry":"data.mjs"' "$PORTABLE_MANIFEST"
grep -q 'from "./object.mjs"' "$PORTABLE_DATA"
grep -q 'function group_by' "$PORTABLE_DATA"
! grep -q 'function index_by' "$PORTABLE_DATA"
! grep -q 'function count_by' "$PORTABLE_DATA"
grep -q 'function assoc' "$PORTABLE_OBJECT"
grep -q 'function has_QMARK_' "$PORTABLE_OBJECT"
! grep -q 'function keys' "$PORTABLE_OBJECT"

PORTABLE_RESULT=$(bun --eval \
  "const module = await import('$PORTABLE_DATA'); console.log(JSON.stringify(module.__eliscript_portable__['group-by'](x => x.kind, [{kind: 'a'}, {kind: 'b'}, {kind: 'a'}])))")
test "$PORTABLE_RESULT" = '{"a":[{"kind":"a"},{"kind":"a"}],"b":[{"kind":"b"}]}'
