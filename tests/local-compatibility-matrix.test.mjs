import { createHash } from "node:crypto";
import { readFile, mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "bun:test";

import {
  checkLocalMatrixEvidence,
  commandEnvironment,
  expectedMatrixCells,
  LocalCompatibilityMatrixError,
  requiredMatrixCells,
  validateLocalMatrixReport,
} from "../tools/compatibility/matrix.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EMPTY_SHA256 = createHash("sha256").update("").digest("hex");
const matrixBytes = await readFile(
  path.join(ROOT, "contracts/compatibility-matrix.json"),
);
const makefile = await readFile(path.join(ROOT, "Makefile"), "utf8");
const matrix = JSON.parse(matrixBytes.toString("utf8"));
const matrixSha256 = createHash("sha256").update(matrixBytes).digest("hex");

function report(cell = expectedMatrixCells(matrix)[0]) {
  const commands = matrix.commands.map((command) => ({
    id: command.replaceAll(/[^a-z0-9]+/giu, "-").replaceAll(/^-|-$/gu, ""),
    command,
    timeoutMs: matrix.localEvidence.timeoutsMs[command],
    status: "pass",
    exitCode: 0,
    timedOut: false,
    durationMs: 1,
    stdoutSha256: EMPTY_SHA256,
    stderrSha256: EMPTY_SHA256,
    summary: "passed",
  }));
  return {
    schemaVersion: 1,
    format: "eliscript-local-compatibility-cell",
    version: 1,
    generatedAt: "2026-09-09T00:00:00.000Z",
    matrixSha256,
    source: {
      commit: "1".repeat(40),
      tree: "2".repeat(40),
      cleanBefore: true,
      cleanAfter: true,
    },
    execution: { provider: "local", cell: cell.id },
    cell,
    environment: {
      provider: "local",
      operatingSystem: cell.operatingSystem,
      operatingSystemRelease: "test",
      architecture: cell.architecture,
      emacsVersion: cell.emacsVersion,
      bunVersion: matrix.javascriptHost.version,
      nodeVersion: matrix.localEvidence.nodeHost.version,
    },
    commands,
    summary: {
      required: commands.length,
      passed: commands.length,
      failed: 0,
      notRun: 0,
      complete: true,
    },
  };
}

const validationOptions = {
  root: ROOT,
  matrix,
  matrixSha256,
  resolveTree: async () => "2".repeat(40),
  resolveCodeIdentity: async () => "3".repeat(64),
};

test("matrix command environment breaks retained-evidence recursion", () => {
  const binaries = Object.fromEntries(["bun", "node", "emacs"].map(name => [name, path.resolve(ROOT, "test-binaries", name)]));
  expect(commandEnvironment({
    bun: binaries.bun,
    node: binaries.node,
    emacs: binaries.emacs,
  })).toMatchObject({
    BUN: binaries.bun,
    NODE: binaries.node,
    EMACS: binaries.emacs,
    ELISCRIPT_SKIP_RETAINED_ACCEPTANCE: "1",
  });
  expect(makefile).toContain(
    "ifneq ($(ELISCRIPT_SKIP_RETAINED_ACCEPTANCE),1)\n" +
    "\t$(BUN) tools/acceptance/check.mjs",
  );
  expect(makefile).toMatch(
    /ifneq \(\$\(ELISCRIPT_SKIP_RETAINED_ACCEPTANCE\),1\)[\s\S]*?tools\/compatibility\/matrix\.mjs --verify-all\nendif/u,
  );
  expect(makefile.match(/tools\/compatibility\/matrix\.mjs --verify-all/gu))
    .toHaveLength(1);
});

test("local compatibility evidence derives all real machine cells", () => {
  expect(expectedMatrixCells(matrix)).toEqual([
    {
      id: "linux-x64-emacs-29.4",
      operatingSystem: "linux",
      architecture: "x64",
      emacsVersion: "29.4",
    },
    {
      id: "linux-x64-emacs-30.2",
      operatingSystem: "linux",
      architecture: "x64",
      emacsVersion: "30.2",
    },
    {
      id: "macos-arm64-emacs-29.4",
      operatingSystem: "macos",
      architecture: "arm64",
      emacsVersion: "29.4",
    },
    {
      id: "macos-arm64-emacs-30.2",
      operatingSystem: "macos",
      architecture: "arm64",
      emacsVersion: "30.2",
    },
  ]);
  expect(requiredMatrixCells(matrix)).toEqual([
    {
      id: "macos-arm64-emacs-29.4",
      operatingSystem: "macos",
      architecture: "arm64",
      emacsVersion: "29.4",
    },
    {
      id: "macos-arm64-emacs-30.2",
      operatingSystem: "macos",
      architecture: "arm64",
      emacsVersion: "30.2",
    },
  ]);
});

test("one required local report remains an explicitly incomplete acceptance matrix", async () => {
  const value = report(requiredMatrixCells(matrix)[0]);
  expect(await validateLocalMatrixReport(value, validationOptions)).toEqual({
    cell: value.cell,
    source: value.source,
    commands: 3,
  });
  expect(await checkLocalMatrixEvidence({
    ...validationOptions,
    reports: [value],
    sourceMatches: async () => true,
  })).toEqual({
    schemaVersion: 1,
    targeted: 4,
    required: 2,
    retained: 1,
    completed: 1,
    missing: [
      "macos-arm64-emacs-30.2",
    ],
    optionalMissing: [
      "linux-x64-emacs-29.4",
      "linux-x64-emacs-30.2",
    ],
    stale: [],
    currentSource: true,
    complete: false,
    sourceIdentity: "3".repeat(64),
  });
});

test("historical reports do not count for changed source", async () => {
  const value = report(requiredMatrixCells(matrix)[0]);
  expect(await checkLocalMatrixEvidence({
    ...validationOptions,
    reports: [value],
    sourceMatches: async () => false,
  })).toMatchObject({
    targeted: 4,
    required: 2,
    retained: 1,
    completed: 0,
    stale: [value.cell.id],
    currentSource: false,
    complete: false,
  });
});

test("optional Linux reports are validated but do not block acceptance", async () => {
  const requiredReports = requiredMatrixCells(matrix).map((cell) => report(cell));
  const optionalReport = report(expectedMatrixCells(matrix)[0]);
  expect(await checkLocalMatrixEvidence({
    ...validationOptions,
    reports: [...requiredReports, optionalReport],
    sourceMatches: async () => true,
  })).toMatchObject({
    targeted: 4,
    required: 2,
    retained: 3,
    completed: 2,
    missing: [],
    optionalMissing: ["linux-x64-emacs-30.2"],
    complete: true,
  });
});

test("local matrix evidence rejects host drift and forged completion", async () => {
  const value = report();
  value.environment.nodeVersion = "99.0.0";
  value.commands[1].status = "fail";
  value.commands[1].exitCode = 1;

  try {
    await validateLocalMatrixReport(value, validationOptions);
    throw new Error("expected local matrix validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(LocalCompatibilityMatrixError);
    expect(error.errors).toContain(
      "environment must match the cell and exact Bun/Node hosts",
    );
    expect(error.errors).toContain(
      "summary must be derived from command and checkout results",
    );
    expect(error.errors).toContain(
      `matrix report ${value.cell.id} did not pass`,
    );
  }
});

test("local matrix aggregation rejects duplicate cells", async () => {
  const value = report();
  await expect(checkLocalMatrixEvidence({
    ...validationOptions,
    reports: [value, structuredClone(value)],
    sourceMatches: async () => true,
  })).rejects.toThrow(/duplicate matrix cell/u);
});

test("local matrix aggregation rejects mixed source content", async () => {
  const first = report(expectedMatrixCells(matrix)[0]);
  const second = report(expectedMatrixCells(matrix)[1]);
  second.source.commit = "4".repeat(40);
  await expect(checkLocalMatrixEvidence({
    ...validationOptions,
    reports: [first, second],
    sourceMatches: async () => true,
    resolveCodeIdentity: async (commit) =>
      commit === first.source.commit ? "5".repeat(64) : "6".repeat(64),
  })).rejects.toThrow(/one identical source content identity/u);
});


// Use real retained Git objects without creating or rewriting any commits.
async function historicalFixture(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "eliscript-matrix-history-"));
  const git = (...args) => {
    const child = Bun.spawnSync(["git", ...args], {cwd: ROOT, stdout: "pipe", stderr: "pipe"});
    expect(child.exitCode).toBe(0);
    return Buffer.from(child.stdout);
  };
  try {
    await writeFile(path.join(directory, ".git"), "gitdir: " + git("rev-parse", "--absolute-git-dir").toString().trim() + "\n");
    const filename = "acceptance/matrix/macos-arm64-emacs-29.4.json";
    const bytes = await readFile(path.join(ROOT, filename));
    const value = JSON.parse(bytes);
    const oldBytes = git("show", value.source.commit + ":contracts/compatibility-matrix.json");
    const measured = JSON.parse(oldBytes);
    expect(createHash("sha256").update(oldBytes).digest("hex")).toBe(value.matrixSha256);
    const current = {...measured, performanceAcceptance: "deferred"};
    const save = async (contract = current, reportBytes = bytes) => {
      await mkdir(path.join(directory, "contracts"), {recursive: true});
      await mkdir(path.join(directory, "acceptance/matrix"), {recursive: true});
      await writeFile(path.join(directory, "contracts/compatibility-matrix.json"), JSON.stringify(contract));
      await writeFile(path.join(directory, filename), reportBytes);
    };
    await save();
    await run({directory, filename, bytes, value, measured, current, save, git});
    expect(await readFile(path.join(ROOT, filename))).toEqual(bytes);
  } finally {await rm(directory, {recursive: true, force: true});}
}
const deferredEnvironment = {ELISCRIPT_DEFER_PERFORMANCE_ACCEPTANCE: "1"};

test("matrix historical policy mismatch stays strict without the exact explicit environment value", async () => {
  await historicalFixture(async ({directory, value}) => {
    for (const setting of [undefined, "0", "true", "01"]) {
      await expect(validateLocalMatrixReport(value, {root: directory, env: {ELISCRIPT_DEFER_PERFORMANCE_ACCEPTANCE: setting}}))
        .rejects.toThrow(/matrixSha256 must bind the current compatibility contract/u);
    }
  });
});

test("explicit deferral authenticates the original report bytes, measured contract and prior passing judgement", async () => {
  await historicalFixture(async ({directory, value}) => {
    const result = await validateLocalMatrixReport(value, {root: directory, env: deferredEnvironment});
    expect(result.cell).toEqual(value.cell);
    expect(result.historicalContract).toMatchObject({
      matrixSha256: value.matrixSha256, sourceCommit: value.source.commit, sourceTree: value.source.tree,
      historicalResult: "pass", currentPerformanceAcceptance: "deferred", performanceAccepted: false,
    });
    const aggregate = await checkLocalMatrixEvidence({root: directory, env: deferredEnvironment, sourceMatches: async () => false});
    expect(aggregate).toMatchObject({retained: 1, completed: 0, currentSource: false, complete: false});
    expect(aggregate.historicalContracts).toHaveLength(1);
  });
});

test("historical matrix acceptance rejects every non-policy contract change", async () => {
  await historicalFixture(async ({directory, current, value, save}) => {
    const mutations = [
      m => {m.localEvidence.timeoutsMs["bun run test"] += 1;},
      m => {m.javascriptHost.version = "9.9.9";},
      m => {m.operatingSystems[0].runner = "ubuntu-22.04";},
      m => {m.actions[0].revision = "f".repeat(40);},
      m => {m.acceptanceOperatingSystems = ["linux", "macos"];},
      m => {m.extraPolicy = "invented";},
      m => {delete m.performanceAcceptance;},
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(current); mutate(changed); await save(changed);
      await expect(validateLocalMatrixReport(value, {root: directory, env: deferredEnvironment}))
        .rejects.toThrow(/historical matrix contract differs beyond performanceAcceptance|matrixSha256 must bind the current compatibility contract/u);
    }
  });
});

test("historical matrix acceptance rejects replaced report bytes and fabricated measured source", async () => {
  await historicalFixture(async ({directory, value, bytes, current, save}) => {
    const forged = structuredClone(value); forged.generatedAt = "2026-01-01T00:00:00.000Z";
    await save(current, JSON.stringify(forged));
    await expect(validateLocalMatrixReport(forged, {root: directory, env: deferredEnvironment}))
      .rejects.toThrow(/report bytes differ from their retained Git snapshot/u);
    await save(current, Buffer.concat([bytes, Buffer.from("\n")]));
    await expect(validateLocalMatrixReport(value, {root: directory, env: deferredEnvironment}))
      .rejects.toThrow(/report bytes differ from their retained Git snapshot/u);
    await save();
    const changed = structuredClone(value); changed.source.commit = "0".repeat(40);
    await expect(validateLocalMatrixReport(changed, {root: directory, env: deferredEnvironment}))
      .rejects.toThrow(/report value differs from retained file|source commit cannot be resolved/u);
  });
});

test("both real Emacs cells authenticate while retaining stale-source and incomplete-current acceptance", async () => {
  await historicalFixture(async ({directory, filename, bytes}) => {
    const secondFile = "acceptance/matrix/macos-arm64-emacs-30.2.json";
    const secondBytes = await readFile(path.join(ROOT, secondFile));
    await writeFile(path.join(directory, secondFile), secondBytes);
    const result = await checkLocalMatrixEvidence({root: directory, env: deferredEnvironment, sourceMatches: async () => false});
    expect(result).toMatchObject({retained: 2, completed: 0, missing: [], currentSource: false, complete: false});
    expect(result.historicalContracts.map(item => item.report)).toEqual([filename, secondFile]);
    expect(result.historicalContracts.every(item => item.historicalResult === "pass" && item.performanceAccepted === false)).toBe(true);
    expect(await readFile(path.join(directory, filename))).toEqual(bytes);
    expect(await readFile(path.join(ROOT, secondFile))).toEqual(secondBytes);
  });
});

test("explicit matrix deferral fails closed when retained Git history is absent", async () => {
  await historicalFixture(async ({directory, value}) => {
    await rm(path.join(directory, ".git"));
    const initialized = Bun.spawnSync(["git", "init", "--quiet", directory], {stdout: "pipe", stderr: "pipe"});
    expect(initialized.exitCode).toBe(0);
    await expect(validateLocalMatrixReport(value, {root: directory, env: deferredEnvironment}))
      .rejects.toThrow(/measured Git snapshot is unavailable|source commit cannot be resolved/u);
  });
});
