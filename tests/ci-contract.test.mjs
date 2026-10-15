import { describe, expect, spyOn, test } from "bun:test";
import { readFile, mkdtemp, mkdir, writeFile, chmod, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  checkCompatibilityWorkflow,
  CompatibilityMatrixError,
  renderWorkflow,
  validateCompatibilityMatrix,
} from "../tools/ci/render-workflow.mjs";
import {
  checkBrowserCompatibilityWorkflow,
  renderBrowserWorkflow,
  validateBrowserCompatibility,
} from "../tools/ci/render-browser-workflow.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const baseline = JSON.parse(
  await readFile(path.join(root, "contracts/compatibility-matrix.json"), "utf8"),
);
const browserContract = JSON.parse(await readFile(path.join(root, "contracts/browser-compatibility.json"), "utf8"));

function copyBaseline() {
  return structuredClone(baseline);
}

function expectMatrixFailure(matrix, pattern) {
  try {
    validateCompatibilityMatrix(matrix);
    throw new Error("expected compatibility matrix validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(CompatibilityMatrixError);
    expect(error.message).toMatch(pattern);
  }
}

describe("compatibility matrix contract", () => {
  test("CI retains complete commands and original timeouts while isolating two test-file workers", async () => {
    const workflow = renderWorkflow(baseline), makefile = await readFile(path.join(root, 'Makefile'), 'utf8');
    expect(workflow).toContain('timeout-minutes: 30');
    expect(workflow).toContain('BUN_TEST_RUNNER: tools/testing/file-workers.mjs');
    expect(workflow).toContain('run: bun run test');expect(workflow).toContain('run: make byte-compile');
    expect(JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')).scripts.test).toBe('make test');
    expect(makefile.match(/\$\(BUN\) \$\(BUN_TEST_RUNNER\)/g)?.length).toBe(2);
  });

  test("parallel Bun files isolate process state, execute every case and propagate an actual failure", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'eliscript-test-file-workers-'));
    try {
      const a = path.join(directory, 'a.test.mjs'), b = path.join(directory, 'b.test.mjs');
      const body = (name, fail = false) => `import{test}from'bun:test';import assert from'node:assert/strict';import{writeFileSync}from'node:fs';import{join}from'node:path';test('${name}',()=>{assert.equal(process.env.ELISCRIPT_FILE_WORKER_STATE,undefined);process.env.ELISCRIPT_FILE_WORKER_STATE='${name}';writeFileSync(join(process.env.ELISCRIPT_FILE_WORKER_OUTPUT,'${name}'),'executed');${fail ? "assert.fail('intentional isolated failure');" : ''}});`;
      await writeFile(a, body('a'));await writeFile(b, body('b'));
      const env = {...process.env, ELISCRIPT_FILE_WORKER_OUTPUT: directory};delete env.ELISCRIPT_FILE_WORKER_STATE;
      const runner = path.join(root, 'tools/testing/file-workers.mjs');
      const success = spawnSync(process.execPath, [runner, a, b], {cwd: directory, env, encoding: 'utf8', timeout: 30000});
      expect(success.status).toBe(0);expect(await readFile(path.join(directory, 'a'), 'utf8')).toBe('executed');expect(await readFile(path.join(directory, 'b'), 'utf8')).toBe('executed');
      await writeFile(b, body('b', true));
      await rm(path.join(directory, 'a'));await rm(path.join(directory, 'b'));
      const failure = spawnSync(process.execPath, [runner, a, b], {cwd: directory, env, encoding: 'utf8', timeout: 30000});
      expect(failure.status).toBe(1);expect(failure.stderr).toContain('intentional isolated failure');
      expect(await readFile(path.join(directory, 'a'), 'utf8')).toBe('executed');expect(await readFile(path.join(directory, 'b'), 'utf8')).toBe('executed');
    } finally {await rm(directory, {recursive: true, force: true});}
  });

  test("fresh file workers reject invalid inventories and retain spawn failures without skipping other files", async () => {
    const {runTestFiles, FILE_WORKERS} = await import('../tools/testing/file-workers.mjs');expect(FILE_WORKERS).toBe(2);
    for (const files of [null, [], ['a.mjs'], [null], ['a.test.mjs', 'a.test.mjs']]) await expect(runTestFiles(files)).rejects.toThrow('unique test files');
    const spawn = spyOn(Bun, 'spawn').mockImplementation(() => {throw new Error('injected spawn failure');});
    try {
      const result = await runTestFiles(['a.test.mjs', 'b.test.mjs', 'c.test.mjs']);
      expect(result.exitCode).toBe(1);expect(result.results).toEqual(['a', 'b', 'c'].map(name => ({file: name + '.test.mjs', exitCode: 1})));expect(spawn).toHaveBeenCalledTimes(3);
    } finally {spawn.mockRestore();}
  });

  test("each file starts a new process and two workers complete every synchronized pair", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'eliscript-fresh-file-workers-'));
    try {
      const files = Array.from({length: 4}, (_, i) => path.join(directory, i + '.test.mjs'));
      for (let i = 0; i < 4; i++) await writeFile(files[i], `import{test}from'bun:test';import assert from'node:assert/strict';import{writeFileSync,existsSync}from'node:fs';import{join}from'node:path';test('pair ${i}',async()=>{const dir=process.env.ELISCRIPT_FRESH_WORKERS;writeFileSync(join(dir,'start-${i}'),JSON.stringify({pid:process.pid,start:Date.now()}));const limit=Date.now()+3000;while(!existsSync(join(dir,'start-${i ^ 1}'))&&Date.now()<limit)await new Promise(r=>setTimeout(r,10));assert(existsSync(join(dir,'start-${i ^ 1}')),'both workers must start before either test finishes');writeFileSync(join(dir,'end-${i}'),String(Date.now()));});`);
      const child = spawnSync(process.execPath, [path.join(root, 'tools/testing/file-workers.mjs'), ...files], {cwd: directory, env: {...process.env, ELISCRIPT_FRESH_WORKERS: directory}, encoding: 'utf8', timeout: 30000});
      expect(child.status).toBe(0);expect(child.stdout).toContain('4/4 completed; 0 failed');
      const intervals = await Promise.all(files.map(async (_, i) => ({...JSON.parse(await readFile(path.join(directory, 'start-' + i), 'utf8')), end: Number(await readFile(path.join(directory, 'end-' + i), 'utf8'))})));
      expect(new Set(intervals.map(item => item.pid)).size).toBe(4);
      for (let i = 0; i < 4; i += 2) {expect(intervals[i].start).toBeLessThanOrEqual(intervals[i + 1].end);expect(intervals[i + 1].start).toBeLessThanOrEqual(intervals[i].end);}
      expect(Math.max(intervals[0].end, intervals[1].end)).toBeLessThanOrEqual(Math.max(intervals[2].start, intervals[3].start));
    } finally {await rm(directory, {recursive: true, force: true});}
  });

  test("interrupting fresh file workers reaps only their owned children and does not start queued files", async () => {
    for (const [signal, status] of [['SIGINT', 130], ['SIGTERM', 143]]) {
      const directory = await mkdtemp(path.join(tmpdir(), 'eliscript-cancel-file-workers-'));let child;
      try {
        const files = Array.from({length: 4}, (_, i) => path.join(directory, i + '.test.mjs'));
        for (let i = 0; i < 4; i++) await writeFile(files[i], `import{test}from'bun:test';import{writeFileSync}from'node:fs';import{join}from'node:path';test('held ${i}',async()=>{writeFileSync(join(process.env.ELISCRIPT_CANCEL_WORKERS,'pid-${i}'),String(process.pid));await new Promise(r=>setTimeout(r,4000));});`);
        child = Bun.spawn([process.execPath, path.join(root, 'tools/testing/file-workers.mjs'), ...files], {cwd: directory, env: {...process.env, ELISCRIPT_CANCEL_WORKERS: directory}, stdout: 'ignore', stderr: 'ignore'});
        const deadline = Date.now() + 3000;let pids;
        while (Date.now() < deadline) {try {pids = await Promise.all([0, 1].map(i => readFile(path.join(directory, 'pid-' + i), 'utf8')));break;} catch {await new Promise(r => setTimeout(r, 10));}}
        expect(pids?.length).toBe(2);child.kill(signal);expect(await child.exited).toBe(status);
        for (const pid of pids) expect(() => process.kill(Number(pid), 0)).toThrow();
        for (const i of [2, 3]) await expect(access(path.join(directory, 'pid-' + i))).rejects.toThrow();
      } finally {if (child) {child.kill();await child.exited;}await rm(directory, {recursive: true, force: true});}
    }
  });

  test("repository compatibility matrix renders the committed CI workflow", async () => {
    const report = await checkCompatibilityWorkflow({ root });
    expect(report.jobs).toBe(4);
    expect(report.acceptanceJobs).toBe(2);
    expect(report.systems.map((system) => system.id)).toEqual(["linux", "macos"]);
    expect(report.acceptanceSystems.map((system) => system.id)).toEqual(["macos"]);
    expect(report.emacsVersions).toEqual(["29.4", "30.2"]);
    expect(report.javascriptHost).toEqual({ name: "bun", version: "1.4.0" });
    expect(report.nodeHost).toEqual({ name: "node", version: "24.20.0" });
    expect(report.localEvidenceDirectory).toBe("acceptance/matrix");
  });

  test("matrix rejects a missing supported operating system", () => {
    const matrix = copyBaseline();
    matrix.operatingSystems = matrix.operatingSystems.slice(0, 1);
    expectMatrixFailure(matrix, /must include linux and macos/);
  });

  test("matrix rejects a missing supported Emacs major version", () => {
    const matrix = copyBaseline();
    matrix.emacsVersions = ["30.2"];
    expectMatrixFailure(matrix, /cover Emacs 29 and Emacs 30/);
  });

  test("matrix rejects an empty or unknown acceptance operating system", () => {
    const empty = copyBaseline();
    empty.acceptanceOperatingSystems = [];
    expectMatrixFailure(empty, /must be a non-empty string array/);

    const unknown = copyBaseline();
    unknown.acceptanceOperatingSystems = ["windows"];
    expectMatrixFailure(unknown, /must exist in operatingSystems/);
  });

  test("matrix rejects mutable action references", () => {
    const matrix = copyBaseline();
    matrix.actions[0].revision = "v6";
    expectMatrixFailure(matrix, /full lowercase commit SHA/);
  });

  test("matrix rejects a weakened command sequence", () => {
    const matrix = copyBaseline();
    matrix.commands = matrix.commands.filter((command) => command !== "make byte-compile");
    expectMatrixFailure(matrix, /commands must be/);
  });

  test("matrix rejects incomplete local evidence settings", () => {
    const matrix = copyBaseline();
    matrix.localEvidence.nodeHost.version = "current";
    delete matrix.localEvidence.timeoutsMs["make byte-compile"];
    expectMatrixFailure(matrix, /exact Node version/);
    expectMatrixFailure(matrix, /timeoutsMs must cover every command/);
  });

  test("CI installs and verifies the contracted Node host before testing", () => {
    const workflow = renderWorkflow(baseline);
    expect(workflow).toContain(`node_version=${baseline.localEvidence.nodeHost.version}`);
    expect(workflow).toContain("https://nodejs.org/dist/v$node_version/$node_archive");
    expect(workflow).toContain("shasum -a 256 -c node.sha256");
    expect(workflow).toContain(`test "$(node --version)" = "v${baseline.localEvidence.nodeHost.version}"`);
    expect(workflow.indexOf("name: Install Node")).toBeLessThan(
      workflow.indexOf("name: Run complete test suite"),
    );
    const unsupported = copyBaseline();
    unsupported.localEvidence.nodeHost.version = "22.23.2";
    expectMatrixFailure(unsupported, /exact Node version >=24/);
  });

  test("Node installer bounds network waits and rejects bad or missing checksums before extraction", async () => {
    const directory=await mkdtemp(path.join(tmpdir(),"eliscript-node-installer-"));
    try {
      const stub=path.join(directory,"bin"),payload=path.join(directory,"payload");
      const version=baseline.localEvidence.nodeHost.version,platform=process.platform==="darwin"?"darwin":"linux";
      const shellResult=spawnSync('sh',['-c','command -v sh'],{encoding:'utf8'});expect(shellResult.status).toBe(0);
      const shell=shellResult.stdout.trim();expect(path.isAbsolute(shell)).toBe(true);
      const name=`node-v${version}-${platform}-${process.arch}`,archive=path.join(directory,"node.tar.gz");
      await mkdir(stub);await mkdir(path.join(payload,name,"bin"),{recursive:true});
      const executable=path.join(payload,name,"bin/node");await writeFile(executable,`#!${shell}\nprintf 'v${version}\\n'\n`);await chmod(executable,0o755);
      const packed=spawnSync("tar",["-czf",archive,"-C",payload,name],{encoding:"utf8"});expect(packed.status).toBe(0);
      const checksum=createHash("sha256").update(await readFile(archive)).digest("hex");
      const curl=path.join(stub,"curl");await writeFile(curl,`#!${shell}
case " $* " in *" --connect-timeout 10 "*) ;; *) echo 'unbounded connection' >&2; exit 42;; esac
case " $* " in *" --max-time 60 "*) ;; *) echo 'unbounded transfer' >&2; exit 42;; esac
case " $* " in *" --retry 2 "*) ;; *) echo 'missing retry policy' >&2; exit 42;; esac
case " $* " in *" --retry-max-time 60 "*) ;; *) echo 'unbounded retries' >&2; exit 42;; esac
while [ "$#" -gt 0 ]; do case "$1" in --output) shift; output=$1;; https://*) url=$1;; esac; shift; done
case "$url" in */SHASUMS256.txt)
  case "$ELISCRIPT_TEST_CHECKSUM" in missing) printf 'unused row\\n' > "$output";; bad) printf '%064d  %s.tar.gz\\n' 0 "$ELISCRIPT_TEST_NODE_NAME" > "$output";; *) printf '%s  %s.tar.gz\\n' "$ELISCRIPT_TEST_CHECKSUM" "$ELISCRIPT_TEST_NODE_NAME" > "$output";; esac;;
  *) cp "$ELISCRIPT_TEST_ARCHIVE" "$output";; esac
`);await chmod(curl,0o755);
      const script=renderWorkflow(baseline).split("      - name: Install Node\n        run: |\n")[1].split("      - name: Record toolchain\n")[0]
        .split("\n").map(line=>line.slice(10)).join("\n").replaceAll("${{ matrix.architecture }}",process.arch);
      for(const [kind,sha] of [["valid",checksum],["bad","bad"],["missing","missing"]]) {
        const temporary=path.join(directory,kind),githubPath=path.join(temporary,"path");await mkdir(temporary);
        const result=spawnSync("bash",["-e","-c",script],{encoding:"utf8",env:{...process.env,PATH:stub+path.delimiter+process.env.PATH,
          RUNNER_TEMP:temporary,GITHUB_PATH:githubPath,ELISCRIPT_TEST_ARCHIVE:archive,ELISCRIPT_TEST_CHECKSUM:sha,ELISCRIPT_TEST_NODE_NAME:name}});
        if(kind==="valid") {
          expect(result.status,result.stderr).toBe(0);expect(await readFile(githubPath,"utf8")).toBe(path.join(temporary,"eliscript-node",name,"bin")+"\n");
          const node=spawnSync(path.join(temporary,"eliscript-node",name,"bin/node"),[],{encoding:"utf8"});expect(node.stdout.trim()).toBe("v"+version);
        } else {
          expect(result.status).not.toBe(0);await expect(access(path.join(temporary,"eliscript-node",name))).rejects.toThrow();
          await expect(access(githubPath)).rejects.toThrow();
        }
      }
    }finally{await rm(directory,{recursive:true,force:true});}
  });

  test("checker rejects manual workflow drift", async () => {
    const workflow = renderWorkflow(baseline).replace(
      "timeout-minutes: 30",
      "timeout-minutes: 60",
    );
    await expect(checkCompatibilityWorkflow({
      root,
      matrix: baseline,
      workflowText: workflow,
    })).rejects.toThrow(/differs from the compatibility matrix/);
  });

  test("CI provisions the locked Chromium browser before the mandatory browser test", () => {
    const workflow = renderWorkflow(baseline);
    const dependencies = workflow.indexOf("name: Install locked dependencies");
    const browser = workflow.indexOf("name: Install Chromium");
    const tests = workflow.indexOf("name: Run complete test suite");
    expect(browser).toBeGreaterThan(dependencies);
    expect(browser).toBeLessThan(tests);
    expect(workflow).toContain("bun node_modules/playwright-core/cli.js install --with-deps chromium");
  });
});

describe("browser compatibility matrix", () => {
  test("all three real engines run on both supported operating systems", async () => {
    const report = await checkBrowserCompatibilityWorkflow({ root });
    expect(report.jobs).toBe(6);
    expect(report.browserEngines).toEqual(["chromium", "firefox", "webkit"]);
    const workflow = renderBrowserWorkflow(browserContract, baseline);
    for (const system of baseline.operatingSystems) for (const browser of report.browserEngines) {
      expect(workflow).toContain(`name: ${system.id}-${browser}`);
    }
    expect(workflow).toContain('install --with-deps "${{ matrix.browser }}"');
    expect(workflow).toContain("ELISCRIPT_TEST_BROWSER: ${{ matrix.browser }}");
    expect(workflow).toContain("bun test tests/direct-wasm-backend.test.mjs tests/wasm-managed-array-search.test.mjs tests/wasm-managed-array-construction.test.mjs tests/wasm-managed-object-properties.test.mjs 2>&1 | tee");
    expect(workflow).toContain("set -o pipefail");
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain(`actions/upload-artifact@${browserContract.artifactAction.revision}`);
  });

  test("browser coverage cannot omit, duplicate or silently rename an engine", () => {
    for (const browserEngines of [[], ["chromium"], ["chromium", "chromium", "webkit"], ["chromium", "safari", "webkit"], ["webkit", "firefox", "chromium"]]) {
      expect(() => validateBrowserCompatibility({ ...browserContract, browserEngines }, baseline)).toThrow(/browserEngines/);
    }
  });

  test("browser gate rejects filtering, skipped execution and mutable artifact actions", () => {
    for (const testCommand of ["true", `${browserContract.testCommand} || true`, `${browserContract.testCommand} --test-name-pattern browser`,
      "bun test tests/direct-wasm-backend.test.mjs",
      browserContract.testCommand.replace(" tests/wasm-managed-array-search.test.mjs", ""),
      browserContract.testCommand.replace(" tests/wasm-managed-array-construction.test.mjs", ""),
      browserContract.testCommand.replace(" tests/wasm-managed-object-properties.test.mjs", "")]) {
      expect(() => validateBrowserCompatibility({ ...browserContract, testCommand }, baseline)).toThrow(/complete direct WASM/);
    }
    expect(() => validateBrowserCompatibility({ ...browserContract,
      artifactAction: { ...browserContract.artifactAction, revision: "v4" } }, baseline)).toThrow(/full commit SHA/);
  });

  test("browser checker rejects a swallowed failure or removed evidence step", async () => {
    const workflow = renderBrowserWorkflow(browserContract, baseline);
    for (const drift of [workflow.replace("set -o pipefail", "true"), workflow.replace("if: always()", "if: success()")]) {
      await expect(checkBrowserCompatibilityWorkflow({ contract: browserContract, matrix: baseline, workflowText: drift })).rejects.toThrow(/differs/);
    }
  });
});
