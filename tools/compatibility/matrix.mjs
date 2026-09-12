#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateCompatibilityMatrix } from "../ci/render-workflow.mjs";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(moduleDirectory, "../..");
const MATRIX_FILE = "contracts/compatibility-matrix.json";
const REPORT_FORMAT = "eliscript-local-compatibility-cell";
const STATUS_VALUES = new Set(["pass", "fail", "not-run"]);
const PLATFORM_IDS = Object.freeze({ darwin: "macos", linux: "linux" });

export class LocalCompatibilityMatrixError extends Error {
  constructor(errors) {
    super(`local compatibility matrix validation failed:\n- ${errors.join("\n- ")}`);
    this.name = "LocalCompatibilityMatrixError";
    this.errors = errors;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function validDigest(value) {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0 &&
    !path.isAbsolute(value) &&
    !value.split("/").includes("..") &&
    path.posix.normalize(value) === value;
}

async function capture(argv, options = {}) {
  const child = Bun.spawn(argv, {
    cwd: options.cwd ?? DEFAULT_ROOT,
    env: options.env ?? process.env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  let forceKillTimer;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
  }, options.timeoutMs ?? 30_000);
  const started = Bun.nanoseconds();
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return {
      exitCode,
      stdout,
      stderr,
      timedOut,
      durationMs: Math.round((Bun.nanoseconds() - started) / 100_000) / 10,
    };
  } finally {
    clearTimeout(timer);
    clearTimeout(forceKillTimer);
  }
}

async function successfulOutput(argv, options = {}) {
  const result = await capture(argv, options);
  if (result.exitCode !== 0 || result.timedOut) {
    throw new LocalCompatibilityMatrixError([
      `${argv.join(" ")} could not be executed: ` +
        (result.stderr.trim() || result.stdout.trim() || `exit ${result.exitCode}`),
    ]);
  }
  return result.stdout.trim();
}

async function gitOutput(root, ...arguments_) {
  return successfulOutput(["git", ...arguments_], { cwd: root, timeoutMs: 30_000 });
}

function currentCell(matrix, environment) {
  const system = matrix.operatingSystems.find(
    (candidate) => candidate.id === environment.operatingSystem &&
      candidate.architecture === environment.architecture,
  );
  if (!system) {
    throw new LocalCompatibilityMatrixError([
      `${environment.operatingSystem}/${environment.architecture} is not a supported matrix system`,
    ]);
  }
  if (!matrix.emacsVersions.includes(environment.emacsVersion)) {
    throw new LocalCompatibilityMatrixError([
      `Emacs ${environment.emacsVersion} is not a supported matrix version`,
    ]);
  }
  return {
    id: `${system.id}-${system.architecture}-emacs-${environment.emacsVersion}`,
    operatingSystem: system.id,
    architecture: system.architecture,
    emacsVersion: environment.emacsVersion,
  };
}

export function expectedMatrixCells(matrix) {
  const validated = validateCompatibilityMatrix(matrix);
  return matrixCells(validated.systems, validated.emacsVersions);
}

function matrixCells(systems, emacsVersions) {
  return systems.flatMap((system) =>
    emacsVersions.map((emacsVersion) => ({
      id: `${system.id}-${system.architecture}-emacs-${emacsVersion}`,
      operatingSystem: system.id,
      architecture: system.architecture,
      emacsVersion,
    })),
  );
}

export function requiredMatrixCells(matrix) {
  const validated = validateCompatibilityMatrix(matrix);
  return matrixCells(validated.acceptanceSystems, validated.emacsVersions);
}

function commandPlan(matrix, binaries) {
  const argvByCommand = {
    "bun install --frozen-lockfile": [binaries.bun, "install", "--frozen-lockfile"],
    "bun run test": [binaries.bun, "run", "test"],
    "make byte-compile": ["make", "byte-compile"],
  };
  return matrix.commands.map((command) => ({
    id: command.replaceAll(/[^a-z0-9]+/giu, "-").replaceAll(/^-|-$/gu, ""),
    command,
    argv: argvByCommand[command],
    timeoutMs: matrix.localEvidence.timeoutsMs[command],
  }));
}

function outputSummary(stdout, stderr) {
  const lines = `${stdout}\n${stderr}`.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-3).join(" | ").slice(0, 500);
}

function commandRecord(step, result) {
  return {
    id: step.id,
    command: step.command,
    timeoutMs: step.timeoutMs,
    status: result === null ? "not-run" :
      result.exitCode === 0 && !result.timedOut ? "pass" : "fail",
    exitCode: result?.exitCode ?? null,
    timedOut: result?.timedOut ?? false,
    durationMs: result?.durationMs ?? 0,
    stdoutSha256: sha256(result?.stdout ?? ""),
    stderrSha256: sha256(result?.stderr ?? ""),
    summary: result === null ? "not run after an earlier failure" :
      outputSummary(result.stdout, result.stderr),
  };
}

async function localEnvironment(binaries, root) {
  const platform = PLATFORM_IDS[process.platform];
  if (!platform) {
    throw new LocalCompatibilityMatrixError([
      `unsupported local operating system ${process.platform}`,
    ]);
  }
  const [emacsVersion, bunVersion, nodeVersion] = await Promise.all([
    successfulOutput([
      binaries.emacs,
      "--batch",
      "-Q",
      "--eval",
      "(princ emacs-version)",
    ], { cwd: root }),
    successfulOutput([binaries.bun, "--version"], { cwd: root }),
    successfulOutput([binaries.node, "--version"], { cwd: root }),
  ]);
  return {
    provider: "local",
    operatingSystem: platform,
    operatingSystemRelease: os.release(),
    architecture: process.arch,
    emacsVersion,
    bunVersion,
    nodeVersion: nodeVersion.replace(/^v/u, ""),
  };
}

export function commandEnvironment(binaries) {
  const directories = [...new Set([
    path.dirname(path.resolve(binaries.bun)),
    path.dirname(path.resolve(binaries.node)),
    path.dirname(path.resolve(binaries.emacs)),
  ])];
  return {
    ...process.env,
    PATH: `${directories.join(path.delimiter)}${path.delimiter}${process.env.PATH ?? ""}`,
    BUN: binaries.bun,
    NODE: binaries.node,
    EMACS: binaries.emacs,
    ELISCRIPT_SKIP_RETAINED_ACCEPTANCE: "1",
  };
}

async function readMatrix(root) {
  const bytes = await readFile(path.join(root, MATRIX_FILE));
  const matrix = JSON.parse(bytes.toString("utf8"));
  validateCompatibilityMatrix(matrix);
  return { matrix, matrixSha256: sha256(bytes) };
}

export async function runLocalMatrixCell(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const binaries = {
    bun: options.bun ?? process.execPath,
    node: options.node ?? process.env.NODE ?? "node",
    emacs: options.emacs ?? process.env.EMACS ?? "emacs",
  };
  const { matrix, matrixSha256 } = await readMatrix(root);
  const statusBefore = await gitOutput(root, "status", "--porcelain");
  if (statusBefore !== "") {
    throw new LocalCompatibilityMatrixError([
      "local matrix execution requires a clean tracked checkout",
    ]);
  }
  const [commit, tree, environment] = await Promise.all([
    gitOutput(root, "rev-parse", "HEAD"),
    gitOutput(root, "rev-parse", "HEAD^{tree}"),
    localEnvironment(binaries, root),
  ]);
  const cell = currentCell(matrix, environment);
  const errors = [];
  if (environment.bunVersion !== matrix.javascriptHost.version) {
    errors.push(
      `Bun ${environment.bunVersion} does not match ${matrix.javascriptHost.version}`,
    );
  }
  if (environment.nodeVersion !== matrix.localEvidence.nodeHost.version) {
    errors.push(
      `Node ${environment.nodeVersion} does not match ` +
      matrix.localEvidence.nodeHost.version,
    );
  }
  if (errors.length > 0) throw new LocalCompatibilityMatrixError(errors);

  const plan = commandPlan(matrix, binaries);
  const commands = [];
  let failed = false;
  const env = commandEnvironment(binaries);
  for (const step of plan) {
    process.stdout.write(`Running ${cell.id}: ${step.command}\n`);
    const result = failed ? null : await capture(step.argv, {
      cwd: root,
      env,
      timeoutMs: step.timeoutMs,
    });
    const record = commandRecord(step, result);
    commands.push(record);
    if (record.status !== "pass") failed = true;
  }
  const cleanAfter = await gitOutput(root, "status", "--porcelain") === "";
  const passed = commands.filter((command) => command.status === "pass").length;
  const report = {
    schemaVersion: 1,
    format: REPORT_FORMAT,
    version: 1,
    generatedAt: new Date().toISOString(),
    matrixSha256,
    source: {
      commit,
      tree,
      cleanBefore: true,
      cleanAfter,
    },
    execution: {
      provider: "local",
      cell: cell.id,
    },
    cell,
    environment,
    commands,
    summary: {
      required: plan.length,
      passed,
      failed: commands.filter((command) => command.status === "fail").length,
      notRun: commands.filter((command) => command.status === "not-run").length,
      complete: passed === plan.length && cleanAfter,
    },
  };
  const output = options.output ??
    path.join(matrix.localEvidence.directory, `${cell.id}.json`);
  if (!safeRelativePath(output) ||
      !output.startsWith(`${matrix.localEvidence.directory}/`)) {
    throw new LocalCompatibilityMatrixError([
      `output must be inside ${matrix.localEvidence.directory}`,
    ]);
  }
  await mkdir(path.dirname(path.join(root, output)), { recursive: true });
  await writeFile(path.join(root, output), `${JSON.stringify(report, null, 2)}\n`);
  await validateLocalMatrixReport(report, { root, matrix, matrixSha256 });
  return { report, output };
}

async function sourceTree(root, commit) {
  return gitOutput(root, "rev-parse", `${commit}^{tree}`);
}

export async function validateLocalMatrixReport(report, options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const loaded = options.matrix && options.matrixSha256 ? options : await readMatrix(root);
  const matrix = loaded.matrix;
  const matrixSha256 = loaded.matrixSha256;
  const errors = [];
  if (!isPlainObject(report) || report.schemaVersion !== 1 ||
      report.format !== REPORT_FORMAT || report.version !== 1) {
    throw new LocalCompatibilityMatrixError([
      `report must use ${REPORT_FORMAT} version 1`,
    ]);
  }
  const cells = new Map(expectedMatrixCells(matrix).map((cell) => [cell.id, cell]));
  const expectedCell = cells.get(report.cell?.id);
  if (!expectedCell || !equal(report.cell, expectedCell)) {
    errors.push("report cell must match one exact supported matrix cell");
  }
  if (report.execution?.provider !== "local" ||
      report.execution?.cell !== report.cell?.id) {
    errors.push("execution must identify the direct local matrix cell");
  }
  if (report.matrixSha256 !== matrixSha256) {
    errors.push("matrixSha256 must bind the current compatibility contract");
  }
  if (!Number.isFinite(Date.parse(report.generatedAt ?? ""))) {
    errors.push("generatedAt must be an ISO timestamp");
  }
  if (!isPlainObject(report.source) ||
      !/^[0-9a-f]{40}$/u.test(report.source.commit ?? "") ||
      !/^[0-9a-f]{40}$/u.test(report.source.tree ?? "") ||
      report.source.cleanBefore !== true || report.source.cleanAfter !== true) {
    errors.push("source must identify one clean commit and tree");
  } else {
    try {
      const resolveTree = options.resolveTree ?? ((commit) => sourceTree(root, commit));
      if (await resolveTree(report.source.commit) !== report.source.tree) {
        errors.push("source tree must belong to source commit");
      }
    } catch (error) {
      errors.push(`source commit cannot be resolved: ${error.message}`);
    }
  }
  const environment = report.environment;
  if (!isPlainObject(environment) || environment.provider !== "local" ||
      environment.operatingSystem !== report.cell?.operatingSystem ||
      environment.architecture !== report.cell?.architecture ||
      environment.emacsVersion !== report.cell?.emacsVersion ||
      environment.bunVersion !== matrix.javascriptHost.version ||
      environment.nodeVersion !== matrix.localEvidence.nodeHost.version) {
    errors.push("environment must match the cell and exact Bun/Node hosts");
  }

  const plan = commandPlan(matrix, { bun: "bun", node: "node", emacs: "emacs" });
  const commands = Array.isArray(report.commands) ? report.commands : [];
  if (commands.length !== plan.length) {
    errors.push("commands must contain every local matrix command");
  }
  for (const [index, step] of plan.entries()) {
    const command = commands[index];
    if (!isPlainObject(command) || command.id !== step.id ||
        command.command !== step.command || command.timeoutMs !== step.timeoutMs) {
      errors.push(`command ${index} must match the compatibility contract`);
      continue;
    }
    if (!STATUS_VALUES.has(command.status) ||
        !Number.isFinite(command.durationMs) || command.durationMs < 0 ||
        !validDigest(command.stdoutSha256) || !validDigest(command.stderrSha256)) {
      errors.push(`command ${command.id} has invalid execution evidence`);
    }
  }
  const passed = commands.filter((command) => command?.status === "pass").length;
  const failed = commands.filter((command) => command?.status === "fail").length;
  const notRun = commands.filter((command) => command?.status === "not-run").length;
  const expectedSummary = {
    required: plan.length,
    passed,
    failed,
    notRun,
    complete: passed === plan.length && report.source?.cleanAfter === true,
  };
  if (!equal(report.summary, expectedSummary)) {
    errors.push("summary must be derived from command and checkout results");
  }
  if (expectedSummary.complete !== true) {
    errors.push(`matrix report ${report.cell?.id ?? "unknown"} did not pass`);
  }
  if (errors.length > 0) throw new LocalCompatibilityMatrixError(errors);
  return { cell: expectedCell, source: report.source, commands: plan.length };
}

async function reportFiles(root, directory) {
  try {
    return (await readdir(path.join(root, directory), { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.join(directory, entry.name))
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function sourceMatchesCurrentCheckout(root, commit, directory) {
  const excludedReports = `:(exclude)${directory}/*.json`;
  const committed = await capture(
    ["git", "diff", "--quiet", `${commit}..HEAD`, "--", ".", excludedReports],
    { cwd: root, timeoutMs: 30_000 },
  );
  if (committed.exitCode > 1 || committed.timedOut) {
    throw new LocalCompatibilityMatrixError([
      `could not compare retained source ${commit} with the current checkout`,
    ]);
  }
  const working = await successfulOutput(
    ["git", "status", "--porcelain", "--untracked-files=all", "--", ".", excludedReports],
    { cwd: root, timeoutMs: 30_000 },
  );
  return committed.exitCode === 0 && working === "";
}

async function sourceCodeIdentity(root, commit, directory) {
  const tree = await gitOutput(root, "ls-tree", "-r", "--full-tree", commit);
  const prefix = `${directory}/`;
  const entries = tree.split("\n").filter((entry) => {
    const separator = entry.indexOf("\t");
    return separator < 0 || !entry.slice(separator + 1).startsWith(prefix);
  });
  return sha256(`${entries.join("\n")}\n`);
}

export async function checkLocalMatrixEvidence(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const { matrix, matrixSha256 } = await readMatrix(root);
  const expected = expectedMatrixCells(matrix);
  const required = requiredMatrixCells(matrix);
  const reports = options.reports ?? await Promise.all(
    (await reportFiles(root, matrix.localEvidence.directory)).map(async (filename) => ({
      filename,
      value: JSON.parse(await readFile(path.join(root, filename), "utf8")),
    })),
  );
  const errors = [];
  const seen = new Set();
  const sourceCommits = new Set();
  const codeIdentities = new Set();
  for (const item of reports) {
    const report = item.value ?? item;
    try {
      const result = await validateLocalMatrixReport(report, {
        root,
        matrix,
        matrixSha256,
        resolveTree: options.resolveTree,
      });
      if (seen.has(result.cell.id)) errors.push(`duplicate matrix cell ${result.cell.id}`);
      seen.add(result.cell.id);
      sourceCommits.add(result.source.commit);
      const resolveCodeIdentity = options.resolveCodeIdentity ??
        ((commit) => sourceCodeIdentity(
          root,
          commit,
          matrix.localEvidence.directory,
        ));
      codeIdentities.add(await resolveCodeIdentity(result.source.commit));
      const expectedFilename = path.join(
        matrix.localEvidence.directory,
        `${result.cell.id}.json`,
      );
      if (item.filename && item.filename !== expectedFilename) {
        errors.push(`${item.filename} must be named ${expectedFilename}`);
      }
    } catch (error) {
      errors.push(...(error.errors ?? [error.message]));
    }
  }
  if (codeIdentities.size > 1) {
    errors.push("all matrix reports must bind one identical source content identity");
  }
  if (errors.length > 0) throw new LocalCompatibilityMatrixError(errors);
  let currentSource = reports.length === 0;
  if (sourceCommits.size > 0) {
    const sourceMatches = options.sourceMatches ??
      ((candidate) => sourceMatchesCurrentCheckout(
        root,
        candidate,
        matrix.localEvidence.directory,
      ));
    currentSource = (await Promise.all(
      [...sourceCommits].map((commit) => sourceMatches(commit)),
    )).every(Boolean);
  }
  const requiredIds = new Set(required.map((cell) => cell.id));
  const missing = [...requiredIds].filter((id) => !seen.has(id));
  const optionalMissing = expected.map((cell) => cell.id)
    .filter((id) => !requiredIds.has(id) && !seen.has(id));
  const stale = currentSource ? [] : [...seen];
  return {
    schemaVersion: 1,
    targeted: expected.length,
    required: required.length,
    retained: seen.size,
    completed: currentSource
      ? [...requiredIds].filter((id) => seen.has(id)).length
      : 0,
    missing,
    optionalMissing,
    stale,
    currentSource,
    complete: currentSource && missing.length === 0,
    sourceIdentity: [...codeIdentities][0] ?? null,
  };
}

function printReport(report) {
  process.stdout.write(
    `Local acceptance matrix: ${report.completed}/${report.required} required cells\n` +
    `Target cells: ${report.targeted}; retained reports: ${report.retained}; current source: ` +
    `${report.currentSource ? "yes" : "no"}\n` +
    `Missing required: ${report.missing.join(", ") || "none"}\n` +
    `Missing optional: ${report.optionalMissing.join(", ") || "none"}\n` +
    `Stale: ${report.stale.join(", ") || "none"}\n` +
    `Complete: ${report.complete ? "yes" : "no"}\n`,
  );
}

function parseArguments(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--run" || argument === "--verify-all") {
      if (result.mode) throw new Error("choose exactly one mode");
      result.mode = argument.slice(2);
    } else if (["--bun", "--node", "--emacs", "--output"].includes(argument)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a value`);
      result[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`unknown argument ${argument}`);
    }
  }
  if (!result.mode) result.mode = "verify-all";
  return result;
}

if (import.meta.main) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.mode === "run") {
      const { report, output } = await runLocalMatrixCell(options);
      process.stdout.write(
        `Recorded ${report.cell.id}: ${report.summary.passed}/` +
        `${report.summary.required} commands in ${output}\n`,
      );
    } else {
      printReport(await checkLocalMatrixEvidence(options));
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
