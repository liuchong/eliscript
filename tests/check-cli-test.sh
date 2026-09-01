#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
CHECK="$PROJECT_DIR/bin/eliscript-check"
TEMP_DIR=$(mktemp -d "${TMPDIR:-/tmp}/eliscript-check-test.XXXXXX")
trap 'rm -rf "$TEMP_DIR"' EXIT

mkdir -p "$TEMP_DIR/src"
cat > "$TEMP_DIR/src/main.eli" <<'EOF'
(import "./helper.eli" answer)
(print answer)
EOF
cat > "$TEMP_DIR/src/helper.eli" <<'EOF'
(defconst answer 42)
(export answer)
EOF
cat > "$TEMP_DIR/eliscript.json" <<'EOF'
{
  "schemaVersion": 1,
  "sourceRoot": "src",
  "entry": "main.eli",
  "outDir": "dist",
  "portableEntries": [],
  "cache": true
}
EOF

BUN_REPORT=$(ELISCRIPT_JS_RUNTIME=bun "$CHECK" \
  --config "$TEMP_DIR/eliscript.json" --json)
node -e '
const report = JSON.parse(process.argv[1]);
if (report.format !== "eliscript-check-report" || report.version !== 1 ||
    report.status !== "ok" || report.counts.modules !== 2) process.exit(1);
' "$BUN_REPORT"

if [ -e "$TEMP_DIR/dist" ]; then
  printf 'eliscript-check must not create the configured output directory\n' >&2
  exit 1
fi

NODE_REPORT=$(ELISCRIPT_JS_RUNTIME=node "$CHECK" \
  --config "$TEMP_DIR/eliscript.json" --json)
if [ "$NODE_REPORT" != "$BUN_REPORT" ]; then
  printf 'Bun and Node check reports differ\nBun:  %s\nNode: %s\n' \
    "$BUN_REPORT" "$NODE_REPORT" >&2
  exit 1
fi

set +e
DIAGNOSTIC=$(printf '(print missing)\n' | ELISCRIPT_JS_RUNTIME=bun "$CHECK" \
  --config "$TEMP_DIR/eliscript.json" \
  --stdin-file "$TEMP_DIR/src/main.eli" \
  --diagnostic-format json 2>&1 >/dev/null)
STATUS=$?
set -e
if [ "$STATUS" -eq 0 ]; then
  printf 'expected stdin source override to fail checking\n' >&2
  exit 1
fi
node -e '
const { realpathSync } = require("node:fs");
const diagnostic = JSON.parse(process.argv[1]);
if (diagnostic.format !== "eliscript-diagnostic" || diagnostic.version !== 1 ||
    diagnostic.code !== "ELI-A0001" || diagnostic.phase !== "analysis" ||
    diagnostic.location?.file !== realpathSync(process.argv[2]) ||
    diagnostic.location?.start?.line !== 1) process.exit(1);
' "$DIAGNOSTIC" "$TEMP_DIR/src/main.eli"

if [ -e "$TEMP_DIR/dist" ]; then
  printf 'failed checks must not create build outputs\n' >&2
  exit 1
fi

printf 'Check CLI test passed\n'
