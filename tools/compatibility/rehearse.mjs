#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTRACT_FILE = "contracts/compatibility-rehearsal.json";
const EXPECTED_STABLE_IDS = ["stable-core-values"];
const EXPECTED_MIGRATIONS = [
  ["framework-neutral-core", "contract-replacement", "0010", "0118"],
  ["native-container-aliases", "source-rewrite", "0073", "0095"],
  ["project-cache-v1-to-v2", "automatic", "0031", "0110"],
];
const EXPECTED_SOURCE_FILES = [
  "contracts/compatibility-baseline.json",
  "contracts/compatibility-rehearsal.json",
  "specs/0010-react-elements.md",
  "specs/0031-incremental-project-builds.md",
  "specs/0073-native-javascript-container-interop.md",
  "specs/0095-stable-persistent-host-container-boundary.md",
  "specs/0110-self-hosted-incremental-project-cache.md",
  "specs/0118-framework-neutral-library-interop.md",
  "specs/0136-local-compatibility-migration-rehearsal.md",
  "specs/index.json",
  "tests/compatibility-rehearsal.test.mjs",
  "tests/fixtures/compatibility/native-containers-v1.eli",
  "tests/fixtures/compatibility/native-containers-v2.eli",
  "tests/fixtures/compatibility/native-containers-v2.stdout",
  "tests/fixtures/compatibility/stable-core-values.eli",
  "tests/fixtures/compatibility/stable-core-values.stdout",
  "tools/compatibility/rehearse.mjs",
];

export class CompatibilityRehearsalError extends Error {
  constructor(errors) {
    super(`compatibility rehearsal failed:\n- ${errors.join("\n- ")}`);
    this.name = "CompatibilityRehearsalError";
    this.errors = errors;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

async function command(root, argv, options = {}) {
  const started = process.hrtime.bigint();
  const child = Bun.spawn(argv, {
    cwd: root,
    env: { ...process.env, ...(options.env ?? {}) },
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
  }, options.timeoutMs ?? 120_000);
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timer);
  clearTimeout(forceKillTimer);
  return {
    argv,
    exitCode,
    timedOut,
    durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e3) / 1e3,
    stdout,
    stderr,
  };
}

async function git(root, args, options = {}) {
  const result = await command(root, ["git", ...args], { timeoutMs: 30_000 });
  if (result.exitCode !== 0 && !options.allowFailure) {
    throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  }
  return result;
}

function isSafeRelativePath(value) {
  return typeof value === "string" && value.length > 0 &&
    !path.isAbsolute(value) && !value.split("/").includes("..") &&
    value === value.replaceAll("\\", "/");
}

async function trackedFile(root, filename, errors) {
  const tracked = await git(root, ["ls-files", "--error-unmatch", "--", filename], {
    allowFailure: true,
  });
  if (tracked.exitCode !== 0) {
    errors.push(`${filename} must be tracked`);
    return;
  }
  try {
    if (!(await stat(path.join(root, filename))).isFile()) {
      errors.push(`${filename} must be a regular file`);
    }
  } catch (error) {
    errors.push(`${filename} cannot be read: ${error.message}`);
  }
}

function validateStablePrograms(programs, errors) {
  if (!Array.isArray(programs) ||
      JSON.stringify(programs.map((entry) => entry?.id)) !==
        JSON.stringify(EXPECTED_STABLE_IDS)) {
    errors.push(`stablePrograms must be exactly ${EXPECTED_STABLE_IDS.join(", ")}`);
    return;
  }
  const entry = programs[0];
  if (!isSafeRelativePath(entry.source) || !isSafeRelativePath(entry.expectedStdout)) {
    errors.push("stable-core-values must use safe source and expectedStdout paths");
  }
  if (JSON.stringify(entry.compilers) !== JSON.stringify(["seed", "self-hosted"]) ||
      JSON.stringify(entry.runtimes) !== JSON.stringify(["bun", "node"])) {
    errors.push("stable-core-values must cover seed/self-hosted and Bun/Node");
  }
}

function validateMigrations(migrations, errors) {
  if (!Array.isArray(migrations) || migrations.length !== EXPECTED_MIGRATIONS.length) {
    errors.push("migrations must contain the complete version 1 transition inventory");
    return;
  }
  for (const [index, expected] of EXPECTED_MIGRATIONS.entries()) {
    const migration = migrations[index];
    const actual = [migration?.id, migration?.kind, migration?.fromSpec,
      migration?.toSpec];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      errors.push(`migrations[${index}] must be ${expected.join("/")}`);
    }
  }
  if (migrations[0]?.applicationEvidence !== false) {
    errors.push("framework-neutral-core must exclude application evidence");
  }
  const sourceRewrite = migrations[1];
  for (const field of ["legacySource", "currentSource", "expectedStdout"]) {
    if (!isSafeRelativePath(sourceRewrite?.[field])) {
      errors.push(`native-container-aliases.${field} must be a safe path`);
    }
  }
  if (JSON.stringify(sourceRewrite?.expectedLegacyDiagnostic) !== JSON.stringify({
    code: "ELI-A0001",
    phase: "analysis",
    message: "unbound symbol: array",
  })) {
    errors.push("native-container-aliases must freeze the legacy diagnostic");
  }
  if (migrations[2]?.ertTest !==
      "eliscript-project-migrates-legacy-cache-on-successful-read") {
    errors.push("project-cache-v1-to-v2 must name the maintained ERT migration test");
  }
}

export async function checkCompatibilityRehearsal(options = {}) {
  const root = path.resolve(options.root ?? ROOT);
  const contract = options.contract ?? await readJson(path.join(root, CONTRACT_FILE));
  const errors = [];
  if (!isPlainObject(contract) || contract.schemaVersion !== 1 ||
      contract.format !== "eliscript-compatibility-rehearsal" ||
      contract.version !== 1) {
    errors.push("contract must use eliscript-compatibility-rehearsal version 1");
  }
  if (JSON.stringify(contract.environment) !== JSON.stringify({
    provider: "local",
    requiredCommands: ["bun", "emacs", "git", "node"],
  })) {
    errors.push("environment must use the version 1 local command inventory");
  }
  if (JSON.stringify(contract.scope) !== JSON.stringify({
    kind: "migration-rehearsal",
    completesAc02: false,
    applicationEvidence: false,
  })) {
    errors.push("scope must remain a non-application rehearsal that does not complete AC-02");
  }
  validateStablePrograms(contract.stablePrograms, errors);
  validateMigrations(contract.migrations, errors);
  if (!Array.isArray(contract.sourceFiles) ||
      JSON.stringify(contract.sourceFiles) !== JSON.stringify(EXPECTED_SOURCE_FILES)) {
    errors.push("sourceFiles must match the sorted version 1 inventory");
  } else {
    for (const filename of contract.sourceFiles) {
      await trackedFile(root, filename, errors);
    }
  }

  const index = await readJson(path.join(root, "specs/index.json"));
  const indexed = new Map(index.specifications.map((entry) => [entry.id, entry]));
  if (indexed.get("0010")?.status !== "superseded" ||
      indexed.get("0010")?.implementation !== "superseded") {
    errors.push("specification 0010 must remain superseded");
  }
  if (indexed.get("0118")?.implementation !== "implemented") {
    errors.push("specification 0118 must remain implemented");
  }
  if (errors.length > 0) throw new CompatibilityRehearsalError(errors);
  return {
    schemaVersion: 1,
    format: "eliscript-compatibility-rehearsal-contract-report",
    version: 1,
    stablePrograms: contract.stablePrograms.length,
    migrations: contract.migrations.length,
    sourceFiles: contract.sourceFiles.length,
    scope: contract.scope,
    contract,
  };
}

function recordedCommand(result) {
  return {
    argv: result.argv,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: result.durationMs,
    stdoutSha256: sha256(result.stdout),
    stderrSha256: sha256(result.stderr),
  };
}

function requireSuccess(result) {
  if (result.exitCode !== 0 || result.timedOut) {
    throw new Error(result.stderr.trim() || result.stdout.trim() ||
      `${result.argv.join(" ")} failed`);
  }
}

async function compile(root, compiler, source, output, moduleDirectory) {
  const argv = compiler === "seed"
    ? ["./bin/eliscript-seed", "--output", output, source]
    : ["./bin/eliscript", "--output", output, source];
  const result = await command(root, argv, {
    timeoutMs: 120_000,
    env: compiler === "self-hosted"
      ? { ELISCRIPT_BOOTSTRAP_MODULE_DIR: moduleDirectory }
      : {},
  });
  requireSuccess(result);
  return result;
}

async function runStableProgram(root, entry, directory, moduleDirectory) {
  const started = process.hrtime.bigint();
  const expected = await readFile(path.join(root, entry.expectedStdout), "utf8");
  const artifacts = [];
  const executions = [];
  for (const compiler of entry.compilers) {
    const output = path.join(directory, `${entry.id}-${compiler}.mjs`);
    const compileResult = await compile(root, compiler, entry.source, output, moduleDirectory);
    const bytes = await readFile(output);
    artifacts.push({ compiler, sha256: sha256(bytes), command: recordedCommand(compileResult) });
    for (const runtime of entry.runtimes) {
      const execution = await command(root, [runtime, output], { timeoutMs: 30_000 });
      requireSuccess(execution);
      if (execution.stdout !== expected || execution.stderr !== "") {
        throw new Error(`${entry.id} ${compiler}/${runtime} output changed`);
      }
      executions.push({ compiler, runtime, ...recordedCommand(execution) });
    }
  }
  if (new Set(artifacts.map((artifact) => artifact.sha256)).size !== 1) {
    throw new Error(`${entry.id} compiler artifacts differ`);
  }
  return {
    id: entry.id,
    kind: "stable-program",
    status: "pass",
    durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e3) / 1e3,
    expectedStdoutSha256: sha256(expected),
    artifacts,
    executions,
  };
}

function normalizedDiagnostic(stderr) {
  const diagnostic = JSON.parse(stderr);
  return {
    code: diagnostic.code,
    phase: diagnostic.phase,
    message: diagnostic.message,
  };
}

async function runNativeMigration(root, migration, directory, moduleDirectory) {
  const started = process.hrtime.bigint();
  const diagnostics = [];
  for (const compiler of ["seed", "self-hosted"]) {
    const argv = compiler === "seed"
      ? ["./bin/eliscript-seed", "--diagnostic-format", "json", migration.legacySource]
      : ["./bin/eliscript", "--diagnostic-format", "json", migration.legacySource];
    const result = await command(root, argv, {
      timeoutMs: 120_000,
      env: compiler === "self-hosted"
        ? { ELISCRIPT_BOOTSTRAP_MODULE_DIR: moduleDirectory }
        : {},
    });
    if (result.exitCode !== 1 || result.timedOut || result.stdout !== "") {
      throw new Error(`${migration.id} ${compiler} did not reject legacy source`);
    }
    const diagnostic = normalizedDiagnostic(result.stderr);
    if (JSON.stringify(diagnostic) !==
        JSON.stringify(migration.expectedLegacyDiagnostic)) {
      throw new Error(`${migration.id} ${compiler} diagnostic changed`);
    }
    diagnostics.push({ compiler, diagnostic, command: recordedCommand(result) });
  }

  const expected = await readFile(path.join(root, migration.expectedStdout), "utf8");
  const artifacts = [];
  const executions = [];
  for (const compiler of ["seed", "self-hosted"]) {
    const output = path.join(directory, `${migration.id}-${compiler}.mjs`);
    const compileResult = await compile(
      root,
      compiler,
      migration.currentSource,
      output,
      moduleDirectory,
    );
    const bytes = await readFile(output);
    artifacts.push({ compiler, sha256: sha256(bytes), command: recordedCommand(compileResult) });
    for (const runtime of ["bun", "node"]) {
      const result = await command(root, [runtime, output], { timeoutMs: 30_000 });
      requireSuccess(result);
      if (result.stdout !== expected || result.stderr !== "") {
        throw new Error(`${migration.id} ${compiler}/${runtime} output changed`);
      }
      executions.push({ compiler, runtime, ...recordedCommand(result) });
    }
  }
  if (new Set(artifacts.map((artifact) => artifact.sha256)).size !== 1) {
    throw new Error(`${migration.id} migrated compiler artifacts differ`);
  }
  return {
    id: migration.id,
    kind: migration.kind,
    status: "pass",
    durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e3) / 1e3,
    diagnostics,
    expectedStdoutSha256: sha256(expected),
    artifacts,
    executions,
  };
}

async function runCacheMigration(root, migration) {
  const selector = `^${migration.ertTest}$`;
  const result = await command(root, [
    process.env.EMACS ?? "emacs",
    "--batch", "-Q", "-L", "compiler", "-L", "tests",
    "-l", "tests/eliscript-project-tests.el",
    "--eval", `(ert-run-tests-batch-and-exit \"${selector}\")`,
  ], { timeoutMs: 120_000 });
  requireSuccess(result);
  return {
    id: migration.id,
    kind: migration.kind,
    status: "pass",
    durationMs: result.durationMs,
    command: recordedCommand(result),
  };
}

async function commandText(root, argv) {
  const result = await command(root, argv, { timeoutMs: 30_000 });
  requireSuccess(result);
  return result.stdout.trim();
}

async function environmentReport(root) {
  const emacs = await commandText(root, [process.env.EMACS ?? "emacs", "--version"]);
  return {
    provider: "local",
    operatingSystem: `${os.type()} ${os.release()}`,
    architecture: os.arch(),
    cpu: os.cpus()[0]?.model ?? "unknown",
    gitVersion: await commandText(root, ["git", "--version"]),
    bunVersion: Bun.version,
    nodeVersion: (await commandText(root, ["node", "--version"])).replace(/^v/, ""),
    emacsVersion: emacs.split("\n", 1)[0].replace(/^GNU Emacs /, ""),
  };
}

async function cleanTrackedState(root) {
  return (await git(root, ["status", "--porcelain=v1", "--untracked-files=no"]))
    .stdout.trim() === "";
}

async function sourceArtifacts(root, files) {
  return Promise.all(files.map(async (file) => ({
    file,
    sha256: sha256(await readFile(path.join(root, file))),
  })));
}

function failedCase(id, kind, error, started) {
  return {
    id,
    kind,
    status: "fail",
    durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e3) / 1e3,
    error: String(error.message).slice(0, 1000),
  };
}

export async function runCompatibilityRehearsal(options = {}) {
  const root = path.resolve(options.root ?? ROOT);
  const checked = await checkCompatibilityRehearsal({ root });
  const cleanBefore = await cleanTrackedState(root);
  if (!cleanBefore) {
    throw new CompatibilityRehearsalError(["tracked checkout must be clean before the run"]);
  }
  const source = {
    commit: (await git(root, ["rev-parse", "HEAD"])).stdout.trim(),
    tree: (await git(root, ["rev-parse", "HEAD^{tree}"])).stdout.trim(),
  };
  const environment = await environmentReport(root);
  const directory = await mkdtemp(path.join(tmpdir(), "eliscript-compatibility-"));
  const cases = [];
  let compilerBuild;
  try {
    const moduleDirectory = path.join(directory, "compiler");
    compilerBuild = await command(root, ["./bin/eliscript-bootstrap"], {
      timeoutMs: 120_000,
      env: { ELISCRIPT_BOOTSTRAP_OUT_DIR: moduleDirectory },
    });
    requireSuccess(compilerBuild);

    for (const entry of checked.contract.stablePrograms) {
      const started = process.hrtime.bigint();
      try {
        cases.push(await runStableProgram(root, entry, directory, moduleDirectory));
      } catch (error) {
        cases.push(failedCase(entry.id, "stable-program", error, started));
      }
    }

    const [framework, nativeContainers, cache] = checked.contract.migrations;
    cases.push({
      id: framework.id,
      kind: framework.kind,
      status: "pass",
      durationMs: 0,
      fromSpec: framework.fromSpec,
      fromStatus: "superseded",
      toSpec: framework.toSpec,
      toImplementation: "implemented",
      applicationEvidence: false,
    });

    let started = process.hrtime.bigint();
    try {
      cases.push(await runNativeMigration(
        root,
        nativeContainers,
        directory,
        moduleDirectory,
      ));
    } catch (error) {
      cases.push(failedCase(nativeContainers.id, nativeContainers.kind, error, started));
    }

    started = process.hrtime.bigint();
    try {
      cases.push(await runCacheMigration(root, cache));
    } catch (error) {
      cases.push(failedCase(cache.id, cache.kind, error, started));
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }

  const cleanAfter = await cleanTrackedState(root);
  const passed = cases.filter((entry) => entry.status === "pass").length;
  const validationPass = cleanBefore && cleanAfter &&
    compilerBuild?.exitCode === 0 && !compilerBuild?.timedOut &&
    passed === cases.length;
  return {
    schemaVersion: 1,
    format: "eliscript-compatibility-rehearsal-run",
    version: 1,
    generatedAt: new Date().toISOString(),
    contractSha256: sha256(await readFile(path.join(root, CONTRACT_FILE))),
    source,
    execution: { provider: "local", sourceCommit: source.commit },
    environment,
    compilerBuild: recordedCommand(compilerBuild),
    cases,
    artifacts: await sourceArtifacts(root, checked.contract.sourceFiles),
    summary: {
      stablePrograms: checked.stablePrograms,
      migrations: checked.migrations,
      required: cases.length,
      passed,
      failed: cases.length - passed,
      cleanBefore,
      cleanAfter,
      applicationEvidence: false,
      completesAc02: false,
      validationPass,
    },
  };
}

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function humanCompatibilityReport(report) {
  const lines = [
    "# Local Compatibility Migration Rehearsal",
    "",
    `- Source commit: \`${report.source.commit}\``,
    `- Source tree: \`${report.source.tree}\``,
    `- Generated: ${report.generatedAt}`,
    `- Environment: ${report.environment.operatingSystem}; ${report.environment.architecture}; Bun ${report.environment.bunVersion}; Node ${report.environment.nodeVersion}; Emacs ${report.environment.emacsVersion}`,
    `- Tracked checkout clean: ${report.summary.cleanBefore && report.summary.cleanAfter ? "yes" : "no"}`,
    `- Application evidence: ${report.summary.applicationEvidence ? "yes" : "no"}`,
    `- Completes AC-02: ${report.summary.completesAc02 ? "yes" : "no"}`,
    `- Local rehearsal: ${report.summary.validationPass ? "pass" : "fail"}`,
    "",
    "A passing rehearsal completes M13-03. It does not complete AC-02 or make",
    "application framework validation part of the language core.",
    "",
    "## Cases",
    "",
    "| Case | Kind | Result | Duration (ms) | Detail |",
    "| --- | --- | --- | ---: | --- |",
    ...report.cases.map((entry) => {
      const detail = entry.error ??
        (entry.kind === "stable-program"
          ? `${entry.artifacts.length} compiler artifacts; ${entry.executions.length} executions`
          : entry.kind === "source-rewrite"
            ? `${entry.diagnostics.length} legacy diagnostics; ${entry.executions.length} migrated executions`
            : entry.kind === "automatic"
              ? entry.command.argv.join(" ")
              : `${entry.fromSpec} -> ${entry.toSpec}; application evidence excluded`);
      return `| ${entry.id} | ${entry.kind} | ${entry.status} | ${entry.durationMs} | ${markdownCell(detail)} |`;
    }),
    "",
    "## Source Artifacts",
    "",
    "| File | SHA-256 |",
    "| --- | --- |",
    ...report.artifacts.map((artifact) =>
      `| \`${artifact.file}\` | \`${artifact.sha256}\` |`),
  ];
  return `${lines.join("\n")}\n`;
}

async function sourceAtCommit(root, commit, filename) {
  return (await git(root, ["show", `${commit}:${filename}`])).stdout;
}

export async function verifyCompatibilityRun(options) {
  const root = path.resolve(options.root ?? ROOT);
  const checked = await checkCompatibilityRehearsal({ root });
  const report = options.report ?? await readJson(path.resolve(root, options.runFile));
  const errors = [];
  if (!isPlainObject(report) || report.schemaVersion !== 1 ||
      report.format !== "eliscript-compatibility-rehearsal-run" ||
      report.version !== 1) {
    errors.push("run must use eliscript-compatibility-rehearsal-run version 1");
  }
  if (!/^[0-9a-f]{40}$/.test(report.source?.commit ?? "") ||
      !/^[0-9a-f]{40}$/.test(report.source?.tree ?? "")) {
    errors.push("run source must contain full commit and tree identities");
  }
  const ancestor = await git(root, ["merge-base", "--is-ancestor",
    report.source?.commit ?? "missing", "HEAD"], { allowFailure: true });
  if (ancestor.exitCode !== 0) errors.push("run source commit must be an ancestor of HEAD");
  const tree = await git(root, ["rev-parse", `${report.source?.commit}^{tree}`], {
    allowFailure: true,
  });
  if (tree.exitCode !== 0 || tree.stdout.trim() !== report.source?.tree) {
    errors.push("run source tree does not match its commit");
  }
  if (JSON.stringify(report.execution) !== JSON.stringify({
    provider: "local",
    sourceCommit: report.source?.commit,
  }) || report.environment?.provider !== "local") {
    errors.push("run must identify direct local execution at its source commit");
  }
  const expectedCaseIds = [
    ...checked.contract.stablePrograms.map((entry) => entry.id),
    ...checked.contract.migrations.map((entry) => entry.id),
  ];
  if (JSON.stringify(report.cases?.map((entry) => entry.id)) !==
      JSON.stringify(expectedCaseIds)) {
    errors.push("run case inventory does not match the contract");
  }
  if (report.cases?.some((entry) => entry.status !== "pass") ||
      report.compilerBuild?.exitCode !== 0 || report.compilerBuild?.timedOut !== false) {
    errors.push("every compiler build and rehearsal case must pass");
  }
  const expectedSummary = {
    stablePrograms: checked.stablePrograms,
    migrations: checked.migrations,
    required: expectedCaseIds.length,
    passed: expectedCaseIds.length,
    failed: 0,
    cleanBefore: true,
    cleanAfter: true,
    applicationEvidence: false,
    completesAc02: false,
    validationPass: true,
  };
  if (JSON.stringify(report.summary) !== JSON.stringify(expectedSummary)) {
    errors.push("run summary must be a passing non-application rehearsal without AC-02 completion");
  }
  const artifactFiles = report.artifacts?.map((artifact) => artifact.file) ?? [];
  if (JSON.stringify(artifactFiles) !== JSON.stringify(checked.contract.sourceFiles)) {
    errors.push("run artifact inventory does not match sourceFiles");
  } else {
    for (const artifact of report.artifacts) {
      try {
        if (sha256(await sourceAtCommit(root, report.source.commit, artifact.file)) !==
            artifact.sha256) {
          errors.push(`run artifact digest differs from source commit: ${artifact.file}`);
        }
      } catch (error) {
        errors.push(`cannot verify run artifact ${artifact.file}: ${error.message}`);
      }
    }
  }
  try {
    if (sha256(await sourceAtCommit(root, report.source.commit, CONTRACT_FILE)) !==
        report.contractSha256) {
      errors.push("run contract digest differs from source commit");
    }
  } catch (error) {
    errors.push(`cannot verify run contract: ${error.message}`);
  }
  if (options.markdownFile) {
    const markdown = await readFile(path.resolve(root, options.markdownFile), "utf8");
    if (markdown !== humanCompatibilityReport(report)) {
      errors.push("run Markdown does not match generated report");
    }
  }
  if (errors.length > 0) throw new CompatibilityRehearsalError(errors);
  return report;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--run") options.run = true;
    else if (argument === "--json-output") options.jsonOutput = argv[++index];
    else if (argument === "--markdown-output") options.markdownOutput = argv[++index];
    else if (argument === "--verify-run") options.verifyRun = argv[++index];
    else if (argument === "--verify-markdown") options.verifyMarkdown = argv[++index];
    else throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

async function main(argv) {
  const options = parseArguments(argv);
  if (options.run) {
    if (!options.jsonOutput || !options.markdownOutput) {
      throw new Error("--run requires --json-output and --markdown-output");
    }
    const report = await runCompatibilityRehearsal({ root: ROOT });
    await writeFile(path.resolve(ROOT, options.jsonOutput),
      `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(path.resolve(ROOT, options.markdownOutput),
      humanCompatibilityReport(report));
    console.log(humanCompatibilityReport(report).trimEnd());
    if (!report.summary.validationPass) process.exitCode = 1;
    return;
  }
  if (options.verifyRun) {
    const report = await verifyCompatibilityRun({
      root: ROOT,
      runFile: options.verifyRun,
      markdownFile: options.verifyMarkdown,
    });
    console.log(`Compatibility rehearsal verified: ${report.summary.passed}/${report.summary.required} cases passed locally; AC-02 remains open.`);
    return;
  }
  const report = await checkCompatibilityRehearsal({ root: ROOT });
  console.log(JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
