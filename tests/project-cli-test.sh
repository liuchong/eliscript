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
      !["cacheReadMs", "workMs", "manifestWriteMs", "totalMs"].every(
        (field) => typeof report.timings[field] === "number" &&
          report.timings[field] >= 0
      ) ||
      report.timings.totalMs < report.timings.cacheReadMs ||
      report.timings.totalMs < report.timings.workMs ||
      report.timings.totalMs < report.timings.manifestWriteMs ||
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

NODE_OUTPUT=$(
  cd "$PROJECT_DIR"
  ELISCRIPT_JS_RUNTIME=node "$PROJECT_DIR/bin/eliscript-build" \
    --no-cache \
    --root "$PROJECT_DIR" \
    --out-dir "$TMP_DIR/node-build" \
    "$PROJECT_DIR/examples/stdlib-cli/main.eli"
)
test "$NODE_OUTPUT" = "$TMP_DIR/node-build/examples/stdlib-cli/main.mjs"
for artifact in \
  examples/stdlib-cli/main.mjs examples/stdlib-cli/main.mjs.map \
  stdlib/sequence.mjs stdlib/sequence.mjs.map \
  stdlib/text.mjs stdlib/text.mjs.map \
  stdlib/object.mjs stdlib/object.mjs.map; do
  cmp "$TMP_DIR/build/$artifact" "$TMP_DIR/node-build/$artifact"
done

SEED_OUTPUT=$(
  cd "$PROJECT_DIR"
  "$PROJECT_DIR/bin/eliscript-seed-build" \
    --no-cache \
    --root "$PROJECT_DIR" \
    --out-dir "$TMP_DIR/seed-build" \
    "$PROJECT_DIR/examples/stdlib-cli/main.eli"
)
test "$SEED_OUTPUT" = "$TMP_DIR/seed-build/examples/stdlib-cli/main.mjs"
for artifact in \
  examples/stdlib-cli/main.mjs examples/stdlib-cli/main.mjs.map \
  stdlib/sequence.mjs stdlib/sequence.mjs.map \
  stdlib/text.mjs stdlib/text.mjs.map \
  stdlib/object.mjs stdlib/object.mjs.map; do
  cmp "$TMP_DIR/node-build/$artifact" "$TMP_DIR/seed-build/$artifact"
done
PUBLIC_MANIFEST="$TMP_DIR/node-build/eliscript-project.json" \
SEED_MANIFEST="$TMP_DIR/seed-build/eliscript-project.json" bun -e '
  const publicManifest = await Bun.file(process.env.PUBLIC_MANIFEST).json();
  const seedManifest = await Bun.file(process.env.SEED_MANIFEST).json();
  const identity = ({ format, version, entry, modules, digest }) =>
    ({ format, version, entry, modules, digest });
  if (JSON.stringify(identity(publicManifest)) !==
      JSON.stringify(identity(seedManifest))) {
    throw new Error("seed and self-hosted public manifests differ");
  }
'

cat >"$TMP_DIR/eliscript.json" <<EOF
{"schemaVersion":1,"sourceRoot":"$PROJECT_DIR","entry":"examples/stdlib-cli/main.eli","outDir":"configured-build","portableEntries":[],"cache":true}
EOF
if "$PROJECT_DIR/bin/eliscript-build" --config "$TMP_DIR/eliscript.json" \
    >"$TMP_DIR/config-stdout" 2>"$TMP_DIR/config-stderr"; then
  printf '%s\n' 'expected absolute sourceRoot configuration to fail' >&2
  exit 1
fi
grep -q 'sourceRoot must be a contained relative path' "$TMP_DIR/config-stderr"

mkdir -p "$TMP_DIR/config-project/src"
printf '%s\n' '(print 42)' >"$TMP_DIR/config-project/src/main.eli"
cat >"$TMP_DIR/config-project/eliscript.json" <<'EOF'
{"schemaVersion":1,"sourceRoot":"src","entry":"main.eli","outDir":"build","portableEntries":[],"cache":false}
EOF
CONFIG_OUTPUT=$(
  "$PROJECT_DIR/bin/eliscript-build" \
    --config "$TMP_DIR/config-project/eliscript.json"
)
test "$CONFIG_OUTPUT" = "$TMP_DIR/config-project/build/main.mjs"
test "$(bun run "$CONFIG_OUTPUT")" = '42'

OVERRIDE_OUTPUT=$(
  "$PROJECT_DIR/bin/eliscript-build" \
    --config "$TMP_DIR/config-project/eliscript.json" \
    --out-dir "$TMP_DIR/config-project/override-build"
)
test "$OVERRIDE_OUTPUT" = "$TMP_DIR/config-project/override-build/main.mjs"
test "$(bun run "$OVERRIDE_OUTPUT")" = '42'

cat >"$TMP_DIR/config-project/invalid.json" <<'EOF'
{"schemaVersion":1,"entry":"main.eli","outDir":"build","undeclaredOption":true}
EOF
if "$PROJECT_DIR/bin/eliscript-build" --diagnostic-format json \
    --config "$TMP_DIR/config-project/invalid.json" \
    >"$TMP_DIR/config-diagnostic-stdout" \
    2>"$TMP_DIR/config-diagnostic-stderr"; then
  printf '%s\n' 'expected unknown configuration key to fail' >&2
  exit 1
fi
CONFIG_DIAGNOSTIC_FILE="$TMP_DIR/config-diagnostic-stderr" bun -e '
  const diagnostic = await Bun.file(process.env.CONFIG_DIAGNOSTIC_FILE).json();
  if (diagnostic.code !== "ELI-B0002" ||
      diagnostic.phase !== "project-config" ||
      diagnostic.message !== "unknown configuration key: undeclaredOption") {
    throw new Error("unexpected project configuration diagnostic");
  }
'

cat >"$TMP_DIR/config-project/duplicate.json" <<'EOF'
{"schemaVersion":1,"entry":"main.eli","\u0065ntry":"other.eli","outDir":"build"}
EOF
if "$PROJECT_DIR/bin/eliscript-build" --diagnostic-format json \
    --config "$TMP_DIR/config-project/duplicate.json" \
    >"$TMP_DIR/duplicate-stdout" 2>"$TMP_DIR/duplicate-stderr"; then
  printf '%s\n' 'expected duplicate configuration key to fail' >&2
  exit 1
fi
DUPLICATE_DIAGNOSTIC_FILE="$TMP_DIR/duplicate-stderr" bun -e '
  const diagnostic = await Bun.file(process.env.DUPLICATE_DIAGNOSTIC_FILE).json();
  if (diagnostic.code !== "ELI-B0002" ||
      diagnostic.phase !== "project-config" ||
      diagnostic.message !== "duplicate configuration key: entry") {
    throw new Error("unexpected duplicate configuration diagnostic");
  }
'

AUTO_OUTPUT=$(
  ELISCRIPT_BOOTSTRAP_MODULE_DIR="$TMP_DIR/auto-compiler" \
    ELISCRIPT_JS_RUNTIME=node \
    "$PROJECT_DIR/bin/eliscript-build" \
      --no-cache \
      --root "$TMP_DIR/config-project/src" \
      --out-dir "$TMP_DIR/auto-build" \
      "$TMP_DIR/config-project/src/main.eli"
)
test -f "$TMP_DIR/auto-compiler/compiler.mjs"
test "$AUTO_OUTPUT" = "$TMP_DIR/auto-build/main.mjs"
test "$(node "$AUTO_OUTPUT")" = '42'

if "$PROJECT_DIR/bin/eliscript-build" "$PROJECT_DIR/examples/stdlib-cli/main.eli" \
    >"$TMP_DIR/stdout" 2>"$TMP_DIR/stderr"; then
  printf '%s\n' 'expected missing --out-dir to fail' >&2
  exit 1
fi
grep -q 'missing --out-dir' "$TMP_DIR/stderr"

if "$PROJECT_DIR/bin/eliscript-build" --diagnostic-format json \
    "$PROJECT_DIR/examples/stdlib-cli/main.eli" \
    >"$TMP_DIR/diagnostic-stdout" 2>"$TMP_DIR/diagnostic-stderr"; then
  printf '%s\n' 'expected JSON missing --out-dir diagnostic' >&2
  exit 1
fi
DIAGNOSTIC_FILE="$TMP_DIR/diagnostic-stderr" bun -e '
  const diagnostic = await Bun.file(process.env.DIAGNOSTIC_FILE).json();
  if (diagnostic.format !== "eliscript-diagnostic" ||
      diagnostic.version !== 1 || diagnostic.code !== "ELI-C0001" ||
      diagnostic.phase !== "cli" ||
      diagnostic.message !== "missing --out-dir") {
    throw new Error("unexpected project CLI diagnostic");
  }
'

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
