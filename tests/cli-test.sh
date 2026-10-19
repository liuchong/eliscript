#!/usr/bin/env sh
set -eu

PROJECT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TEMP_DIR=$(mktemp -d "$PROJECT_DIR/.eliscript-test.XXXXXX")
trap 'rm -rf "$TEMP_DIR"' EXIT INT TERM

"$PROJECT_DIR/bin/eliscript" \
  --output "$TEMP_DIR/core.mjs" \
  "$PROJECT_DIR/tests/fixtures/core.eli"

diff -u "$PROJECT_DIR/tests/snapshots/core.mjs" "$TEMP_DIR/core.mjs"

# The real Seed entry must consume every argument. A zero large-file threshold
# makes accidental startup file visits fail without manufacturing huge fixtures.
for CLI_REGRESSION_MAP in no yes; do
  CLI_REGRESSION_MODULE="$PROJECT_DIR/compiler/eliscript-cli.el" \
  CLI_REGRESSION_INPUT="$PROJECT_DIR/tests/fixtures/core.eli" \
  CLI_REGRESSION_OUTPUT="$TEMP_DIR/seed-arguments-$CLI_REGRESSION_MAP.mjs" \
  CLI_REGRESSION_MAP="$CLI_REGRESSION_MAP" \
  "${EMACS:-emacs}" --batch -Q --eval '
    (progn
      (setq large-file-warning-threshold 0)
      (advice-add (quote find-file-noselect) :before
        (lambda (&rest ignored) (error "Seed compilation must not reopen command-line files")))
      (let* ((output (getenv "CLI_REGRESSION_OUTPUT"))
             (mapping (equal (getenv "CLI_REGRESSION_MAP") "yes"))
             (command-line-args-left
              (append (list "--") (when mapping (list "--source-map"))
                      (list "--output" output (getenv "CLI_REGRESSION_INPUT")))))
        (load (getenv "CLI_REGRESSION_MODULE") nil t)
        (unless (null command-line-args-left)
          (error "Seed script left arguments for Emacs startup"))
        (unless (and (file-exists-p output)
                     (or (not mapping) (file-exists-p (concat output ".map"))))
          (error "Seed script did not write the requested artifacts"))))'
done

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
    module.shortcuts({ "profile/name": "Ada", "account/id": 5, label: "text", token: "symbol" }),
    module.shortcuts({ "profile/name": "Ada", label: "text", token: "symbol" }),
    module.persistent_shortcuts(),
    module.lexical_map({ name: "Ada" }),
    module.countdown({ remaining: 10000 }),
    module.catch_map(),
    module.portable_name({ name: "portable" }),
    module.persistent_map_pattern(),
  ]));
')

EXPECTED_MAP_PATTERNS='[["Ada",18,"missing"],["Ada",null,null],"anonymous",["Ada","London"],["Ada",5,"text","symbol"],["Ada",7,"text","symbol"],["persistent",9,"text","symbol"],["Ada",18,{"name":"Ada"}],0,[7,"caught"],"portable",["Eliscript",18]]'
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

# Exercise the public Seed script itself, rather than replacing its compiler.
# The test-only Emacs launcher observes the live function cells at process
# shutdown; compilation, arguments, diagnostics and all products remain real.
SEED_RAM_PROJECT_DIR="$PROJECT_DIR" \
SEED_RAM_TEMP_DIR="$TEMP_DIR" \
SEED_RAM_REAL_EMACS="${EMACS:-emacs}" bun --eval '
  const {default: assert} = await import("node:assert/strict");
  const {spawnSync} = await import("node:child_process");
  const {readFileSync,writeFileSync,chmodSync,existsSync} = await import("node:fs");
  const {join} = await import("node:path");
  const root=process.env.SEED_RAM_PROJECT_DIR,temporary=process.env.SEED_RAM_TEMP_DIR;
  const compiler=join(root,"compiler"),realEmacs=process.env.SEED_RAM_REAL_EMACS;
  const realScript=join(compiler,"eliscript-cli.el"),observerScript=join(temporary,"seed-ram-observer.el");
  writeFileSync(observerScript,";;; -*- lexical-binding: t; -*-\n(eval (read (getenv \"SEED_RAM_OBSERVER\")))\n(load (getenv \"SEED_RAM_REAL_SCRIPT\") nil t)\n");
  const wrapper=join(temporary,"seed-ram-emacs");
  writeFileSync(wrapper,"#!/bin/sh\nset -eu\n[ \"$#\" -ge 4 ] && [ \"$1\" = --batch ] && [ \"$2\" = -Q ] && [ \"$3\" = --script ] && [ \"$4\" = \"$SEED_RAM_REAL_SCRIPT\" ] || exit 97\nseed_batch=$1\nseed_quick=$2\nseed_script=$3\nshift 4\nexec \"$SEED_RAM_REAL_EMACS\" \"$seed_batch\" \"$seed_quick\" \"$seed_script\" \"$SEED_RAM_OBSERVER_SCRIPT\" \"$@\"\n");
  chmodSync(wrapper,0o700);
  const observer=`(progn
    (setq seed-ram-original-car (symbol-function (quote car)))
    (fset (quote eliscript-cli-regression-foreign) (lambda (value) value))
    (setq seed-ram-foreign (symbol-function (quote eliscript-cli-regression-foreign)))
    (setq seed-ram-elc-before (directory-files-recursively (getenv "SEED_RAM_COMPILER") "[.]elc$"))
    (with-eval-after-load (quote eliscript)
      (setq seed-ram-reader-before (symbol-function (quote eliscript-reader--emacs-source))))
    (add-hook (quote kill-emacs-hook)
      (lambda ()
        (let ((expected (equal (getenv "SEED_RAM_EXPECT_COMPILED") "yes")))
          (unless (eq (not (null eliscript-cli--compiler-bytecompiled)) expected)
            (error "Seed RAM threshold was not honored"))
          (unless (and (eq seed-ram-original-car (symbol-function (quote car)))
                       (eq seed-ram-foreign (symbol-function (quote eliscript-cli-regression-foreign)))
                       (eq (symbol-function (quote eliscript-emitter--binding-name)) (quote eliscript-symbol-binding-name)))
            (error "Seed RAM compilation changed foreign definitions or symbolic aliases"))
          (if expected
              (progn
                (dolist (name (quote (eliscript-read-located-string eliscript-reader--emacs-source
                                     eliscript-expand-module eliscript-analyze-module
                                     eliscript-lower-module eliscript-emit-ir-module)))
                  (unless (byte-code-function-p (symbol-function name))
                    (error "Seed compiler function is still interpreted: %s" name)))
                (let ((reader (symbol-function (quote eliscript-reader--emacs-source))))
                  (eliscript-cli--byte-compile-loaded-compiler)
                  (unless (eq reader (symbol-function (quote eliscript-reader--emacs-source)))
                    (error "Seed repeated the RAM bytecode pass"))))
            (unless (eq seed-ram-reader-before (symbol-function (quote eliscript-reader--emacs-source)))
              (error "small Seed input changed its compiler function cells")))
          (unless (equal (funcall seed-ram-reader-before "#queue [1 {2 3}]")
                         (eliscript-reader--emacs-source "#queue [1 {2 3}]"))
            (error "Seed lost the behavior of an original function reference"))
          (unless (equal seed-ram-elc-before
                         (directory-files-recursively (getenv "SEED_RAM_COMPILER") "[.]elc$"))
            (error "Seed RAM compilation created a disk bytecode cache"))
          (with-temp-file (getenv "SEED_RAM_MARKER") (insert "ok\\n"))))))`;
  const seed=(name,input,compiled,options=[])=>{
    const marker=join(temporary,"seed-ram-"+name+".checked");
    const result=spawnSync(join(root,"bin/eliscript-seed"),[...options,input],{
      encoding:"utf8",timeout:30000,
      env:{...process.env,EMACS:wrapper,SEED_RAM_REAL_EMACS:realEmacs,SEED_RAM_OBSERVER:observer,
        SEED_RAM_REAL_SCRIPT:realScript,SEED_RAM_OBSERVER_SCRIPT:observerScript,
        SEED_RAM_COMPILER:compiler,SEED_RAM_MARKER:marker,SEED_RAM_EXPECT_COMPILED:compiled?"yes":"no"},
    });
    assert.equal(result.error,undefined);assert.equal(result.signal,null);
    assert(existsSync(marker),"public Seed shutdown checks did not complete: "+result.stderr);
    assert.equal(readFileSync(marker,"utf8"),"ok\n");
    return result;
  };
  const core=join(root,"tests/fixtures/core.eli");
  const smallOutput=join(temporary,"seed-ram-small.mjs");
  const small=seed("small",core,false,["--output",smallOutput]);
  assert.equal(small.status,0,small.stderr);assert.equal(small.stderr,"");
  assert.equal(readFileSync(smallOutput,"utf8"),readFileSync(join(temporary,"core.mjs"),"utf8"));
  const padding=";"+"x".repeat(128*1024)+"\n";
  const largeInput=join(temporary,"seed-ram-large.eli"),largeOutput=join(temporary,"seed-ram-large.mjs");
  writeFileSync(largeInput,padding+readFileSync(core,"utf8"));
  const large=seed("large",largeInput,true,["--source-map","--output",largeOutput]);
  assert.equal(large.status,0,large.stderr);assert.equal(large.stderr,"");
  const reference=join(temporary,"seed-ram-reference.mjs");
  const oracle=`(progn (add-to-list (quote load-path) ${JSON.stringify(compiler)})
    (require (quote eliscript))
    (when (bound-and-true-p eliscript-cli--compiler-bytecompiled) (error "library require prepared CLI bytecode"))
    (eliscript-compile-file-with-source-map ${JSON.stringify(largeInput)} ${JSON.stringify(reference)}))`;
  const raw=spawnSync(realEmacs,["--batch","-Q","--eval",oracle],{encoding:"utf8",timeout:30000});
  assert.equal(raw.error,undefined);assert.equal(raw.signal,null);assert.equal(raw.status,0,raw.stderr);
  assert.equal(readFileSync(largeOutput,"utf8"),readFileSync(reference,"utf8").replaceAll("seed-ram-reference.mjs.map","seed-ram-large.mjs.map"));
  const largeMap=JSON.parse(readFileSync(largeOutput+".map","utf8")),referenceMap=JSON.parse(readFileSync(reference+".map","utf8"));
  assert.deepEqual({...largeMap,file:referenceMap.file},referenceMap);
  const broken=join(temporary,"seed-ram-broken.eli");writeFileSync(broken,padding+"(defun broken () missing)\n");
  const invalid=seed("broken",broken,true,["--diagnostic-format","json"]);
  assert.equal(invalid.status,1);assert.equal(invalid.stdout,"");
  const diagnostic=JSON.parse(invalid.stderr);
  assert.equal(diagnostic.code,"ELI-A0001");assert.equal(diagnostic.phase,"analysis");
  assert.equal(diagnostic.message,"unbound symbol: missing");assert.equal(diagnostic.location.file,broken);
  assert.deepEqual(diagnostic.location.start,{offset:padding.length+17,line:2,column:18});
  const absent=join(temporary,"seed-ram-absent.eli");
  const missing=seed("absent",absent,false,["--diagnostic-format","json"]);
  assert.equal(missing.status,1);assert.equal(missing.stdout,"");
  assert.equal(JSON.parse(missing.stderr).code,"ELI-C0001");
  console.log("Public Seed RAM bytecode and unchanged small-input path passed");
'
