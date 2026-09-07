#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CONTRACT_FILE = "contracts/clean-machine-onboarding.json";
const WORKFLOW_FILE = ".github/workflows/clean-machine-onboarding.yml";
const GUIDE_FILE = "docs/getting-started.md";
const EXPECTED_STEPS = [
  ["locked-dependencies", ["bun", "install", "--frozen-lockfile"], 300_000, false],
  ["command-discovery", ["./bin/eliscript", "--help"], 60_000, true],
  ["compiler-build", ["bun", "run", "build:bootstrap"], 300_000, true],
  ["documented-project", ["bun", "test", "tests/onboarding-docs.test.mjs"], 120_000, true],
  ["strict-byte-compile", ["make", "byte-compile"], 300_000, true],
  ["core-suite", ["make", "test-core"], 900_000, true],
];
const EXPECTED_DOCUMENTATION = [
  "sudo apt-get install -y git emacs unzip curl",
  "brew install git emacs",
  "curl -fsSL https://bun.com/install | bash",
  "bun install --frozen-lockfile",
  "./bin/eliscript --help",
  "bun run build:bootstrap",
  "bun test tests/onboarding-docs.test.mjs",
  "make byte-compile",
  "make test-core",
];
const EXPECTED_SOURCE_FILES = [
  ".github/workflows/clean-machine-onboarding.yml",
  "Makefile",
  "bun.lock",
  "contracts/clean-machine-onboarding.json",
  "docs/getting-started.md",
  "examples/getting-started/eliscript.json",
  "examples/getting-started/src/main.eli",
  "examples/getting-started/src/math.eli",
  "package.json",
  "specs/0135-clean-machine-onboarding.md",
  "tests/onboarding-docs.test.mjs",
  "tests/test-partition.test.mjs",
  "tools/onboarding/check.mjs",
];
const APPLICATION_TESTS = [
  "tests/eliscript-org-tests.el",
  "tests/vite-plugin.test.mjs",
  "tests/org-vite-plugin.test.mjs",
  "tests/application-cli-test.sh",
];

export class OnboardingValidationError extends Error {
  constructor(errors) {
    super(`clean-machine onboarding validation failed:\n- ${errors.join("\n- ")}`);
    this.name = "OnboardingValidationError";
    this.errors = errors;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeRelativePath(value) {
  return typeof value === "string" && value.length > 0 &&
    !path.isAbsolute(value) && !value.split("/").includes("..") &&
    value === value.replaceAll("\\", "/");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

async function git(root, args, options = {}) {
  const child = Bun.spawn(["git", ...args], {
    cwd: root,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0 && !options.allowFailure) {
    throw new Error(stderr.trim() || `git ${args.join(" ")} exited with ${exitCode}`);
  }
  return { exitCode, stdout, stderr };
}

function targetSource(makefile, name) {
  const lines = makefile.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`${name}:`));
  if (start === -1) return null;
  const body = [];
  for (const line of lines.slice(start + 1)) {
    if (/^[A-Za-z0-9_.-]+:/.test(line)) break;
    body.push(line);
  }
  return `${lines[start]}\n${body.join("\n")}`;
}

function validateEnvironmentContract(environment, errors) {
  const expected = {
    provider: "github-actions",
    runnerOs: "Linux",
    runnerArchitecture: "X64",
    ubuntuVersion: "24.04",
    bunVersion: "1.4.0",
    emacsVersion: "30.2",
    maximumActiveDurationMs: 900_000,
  };
  if (!isPlainObject(environment)) {
    errors.push("environment must be an object");
    return;
  }
  for (const [key, value] of Object.entries(expected)) {
    if (environment[key] !== value) {
      errors.push(`environment.${key} must be ${JSON.stringify(value)}`);
    }
  }
  const unknown = Object.keys(environment).filter((key) => !(key in expected));
  if (unknown.length > 0) {
    errors.push(`environment has unknown fields: ${unknown.join(", ")}`);
  }
}

function validateSteps(steps, errors) {
  if (!Array.isArray(steps)) {
    errors.push("steps must be an array");
    return;
  }
  const ids = steps.map((step) => step?.id);
  const expectedIds = EXPECTED_STEPS.map(([id]) => id);
  if (JSON.stringify(ids) !== JSON.stringify(expectedIds)) {
    errors.push(`step ids must be exactly: ${expectedIds.join(", ")}`);
  }
  for (const [index, step] of steps.entries()) {
    const label = `steps[${index}]`;
    if (!isPlainObject(step)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (!Array.isArray(step.argv) || step.argv.length === 0 ||
        step.argv.some((argument) => typeof argument !== "string" || argument.length === 0)) {
      errors.push(`${label}.argv must be a non-empty string array`);
    }
    if (!Number.isInteger(step.timeoutMs) || step.timeoutMs < 1_000 ||
        step.timeoutMs > 900_000) {
      errors.push(`${label}.timeoutMs must be between 1000 and 900000`);
    }
    if (typeof step.countsTowardActiveDuration !== "boolean") {
      errors.push(`${label}.countsTowardActiveDuration must be boolean`);
    }
    const expected = EXPECTED_STEPS[index];
    if (expected && (step.id !== expected[0] ||
        JSON.stringify(step.argv) !== JSON.stringify(expected[1]) ||
        step.timeoutMs !== expected[2] ||
        step.countsTowardActiveDuration !== expected[3])) {
      errors.push(`${label} must match the version 1 ${expected[0]} step`);
    }
    const command = Array.isArray(step.argv) ? step.argv.join(" ") : "";
    if (APPLICATION_TESTS.some((filename) => command.includes(filename)) ||
        command.includes("test-applications")) {
      errors.push(`${label} leaks application validation into onboarding`);
    }
  }
  if (steps[0]?.countsTowardActiveDuration !== false) {
    errors.push("locked-dependencies must be excluded from active duration");
  }
  for (const step of steps.slice(1)) {
    if (step?.countsTowardActiveDuration !== true) {
      errors.push(`${step?.id ?? "unknown step"} must count toward active duration`);
    }
  }
  const core = steps.find((step) => step?.id === "core-suite");
  if (JSON.stringify(core?.argv) !== JSON.stringify(["make", "test-core"])) {
    errors.push("core-suite must execute make test-core");
  }
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

export async function checkOnboarding(options = {}) {
  const root = path.resolve(options.root ?? ROOT);
  const contract = options.contract ?? await readJson(path.join(root, CONTRACT_FILE));
  const errors = [];
  if (!isPlainObject(contract) || contract.schemaVersion !== 1 ||
      contract.format !== "eliscript-clean-machine-onboarding" ||
      contract.version !== 1) {
    errors.push("contract must use eliscript-clean-machine-onboarding version 1");
  }
  validateEnvironmentContract(contract.environment, errors);
  validateSteps(contract.steps, errors);

  if (!Array.isArray(contract.requiredDocumentation) ||
      contract.requiredDocumentation.length === 0 ||
      contract.requiredDocumentation.some((value) =>
        typeof value !== "string" || value.length === 0)) {
    errors.push("requiredDocumentation must be a non-empty string array");
  }
  if (JSON.stringify(contract.requiredDocumentation) !==
      JSON.stringify(EXPECTED_DOCUMENTATION)) {
    errors.push("requiredDocumentation must match the version 1 inventory");
  }
  if (!Array.isArray(contract.sourceFiles) || contract.sourceFiles.length === 0 ||
      contract.sourceFiles.some((filename) => !isSafeRelativePath(filename))) {
    errors.push("sourceFiles must be non-empty safe relative paths");
  } else {
    const sorted = [...contract.sourceFiles].sort();
    if (new Set(contract.sourceFiles).size !== contract.sourceFiles.length ||
        JSON.stringify(sorted) !== JSON.stringify(contract.sourceFiles)) {
      errors.push("sourceFiles must be unique and sorted");
    }
    for (const filename of contract.sourceFiles) {
      await trackedFile(root, filename, errors);
    }
  }
  if (JSON.stringify(contract.sourceFiles) !== JSON.stringify(EXPECTED_SOURCE_FILES)) {
    errors.push("sourceFiles must match the version 1 inventory");
  }

  const [guide, makefile, workflow] = await Promise.all([
    readFile(path.join(root, GUIDE_FILE), "utf8"),
    readFile(path.join(root, "Makefile"), "utf8"),
    readFile(path.join(root, WORKFLOW_FILE), "utf8"),
  ]);
  for (const literal of contract.requiredDocumentation ?? []) {
    if (!guide.includes(literal)) {
      errors.push(`${GUIDE_FILE} is missing required text: ${literal}`);
    }
  }

  const aggregateTarget = targetSource(makefile, "test");
  const coreTarget = targetSource(makefile, "test-core");
  const applicationTarget = targetSource(makefile, "test-applications");
  if (!aggregateTarget?.startsWith("test: test-core test-applications")) {
    errors.push("test target must aggregate test-core and test-applications");
  }
  if (!coreTarget || !applicationTarget) {
    errors.push("Makefile must define test-core and test-applications");
  } else {
    for (const filename of APPLICATION_TESTS) {
      if (coreTarget.includes(filename)) {
        errors.push(`test-core contains application evidence: ${filename}`);
      }
      if (!applicationTarget.includes(filename)) {
        errors.push(`test-applications is missing: ${filename}`);
      }
    }
  }

  const workflowLiterals = [
    "runs-on: ubuntu-24.04",
    "version: \"30.2\"",
    "bun-version: 1.4.0",
    "bun tools/onboarding/check.mjs --run",
    "actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd",
    "purcell/setup-emacs@34c6ded44899fd1bf74d2889558befd1750e61a7",
    "oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6",
    "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
  ];
  for (const literal of workflowLiterals) {
    if (!workflow.includes(literal)) {
      errors.push(`${WORKFLOW_FILE} is missing required text: ${literal}`);
    }
  }

  if (errors.length > 0) throw new OnboardingValidationError(errors);
  return {
    schemaVersion: 1,
    format: "eliscript-clean-machine-onboarding-contract-report",
    version: 1,
    steps: contract.steps.length,
    activeSteps: contract.steps.filter((step) =>
      step.countsTowardActiveDuration).length,
    sourceFiles: contract.sourceFiles.length,
    maximumActiveDurationMs: contract.environment.maximumActiveDurationMs,
    environment: contract.environment,
    contract,
  };
}

function boundedSummary(stdout, stderr) {
  const lines = `${stdout}\n${stderr}`.split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-3).join(" | ").slice(0, 600);
}

async function runStep(root, step) {
  const started = process.hrtime.bigint();
  let timedOut = false;
  let forceKillTimer;
  let child;
  try {
    child = Bun.spawn(step.argv, {
      cwd: root,
      env: process.env,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch (error) {
    return {
      id: step.id,
      argv: step.argv,
      timeoutMs: step.timeoutMs,
      countsTowardActiveDuration: step.countsTowardActiveDuration,
      status: "fail",
      exitCode: null,
      timedOut: false,
      durationMs: Number(process.hrtime.bigint() - started) / 1e6,
      stdoutSha256: sha256(""),
      stderrSha256: sha256(String(error.message)),
      summary: String(error.message).slice(0, 600),
    };
  }
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
  }, step.timeoutMs);
  const stdoutPromise = new Response(child.stdout).text();
  const stderrPromise = new Response(child.stderr).text();
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    stdoutPromise,
    stderrPromise,
  ]);
  clearTimeout(timer);
  clearTimeout(forceKillTimer);
  if (stdout.length > 0) process.stdout.write(stdout);
  if (stderr.length > 0) process.stderr.write(stderr);
  return {
    id: step.id,
    argv: step.argv,
    timeoutMs: step.timeoutMs,
    countsTowardActiveDuration: step.countsTowardActiveDuration,
    status: exitCode === 0 && !timedOut ? "pass" : "fail",
    exitCode,
    timedOut,
    durationMs: Math.round(Number(process.hrtime.bigint() - started) / 1e3) / 1e3,
    stdoutSha256: sha256(stdout),
    stderrSha256: sha256(stderr),
    summary: boundedSummary(stdout, stderr),
  };
}

async function commandText(root, argv) {
  const child = Bun.spawn(argv, {
    cwd: root,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  let forceKillTimer;
  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
  }, 30_000);
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timer);
  clearTimeout(forceKillTimer);
  if (exitCode !== 0) throw new Error(stderr.trim() || argv.join(" "));
  return stdout.trim();
}

function ubuntuVersion() {
  return readFile("/etc/os-release", "utf8").then((source) => {
    const line = source.split("\n").find((entry) => entry.startsWith("VERSION_ID="));
    return line?.slice("VERSION_ID=".length).replaceAll('"', "") ?? "unknown";
  });
}

async function environmentReport(root) {
  const emacs = await commandText(root, ["emacs", "--version"]);
  return {
    provider: "github-actions",
    runnerOs: process.env.RUNNER_OS ?? "",
    runnerArchitecture: process.env.RUNNER_ARCH ?? "",
    ubuntuVersion: await ubuntuVersion(),
    operatingSystem: `${os.type()} ${os.release()}`,
    architecture: os.arch(),
    cpu: os.cpus()[0]?.model ?? "unknown",
    gitVersion: await commandText(root, ["git", "--version"]),
    bunVersion: Bun.version,
    nodeVersion: process.version,
    emacsVersion: emacs.split("\n", 1)[0].replace(/^GNU Emacs /, ""),
  };
}

function validateLiveEnvironment(environment, contract, errors) {
  if (process.env.GITHUB_ACTIONS !== "true") {
    errors.push("run requires GITHUB_ACTIONS=true");
  }
  for (const key of ["GITHUB_RUN_ID", "GITHUB_RUN_ATTEMPT", "GITHUB_SHA",
    "GITHUB_REPOSITORY", "GITHUB_SERVER_URL"]) {
    if (!process.env[key]) errors.push(`run requires ${key}`);
  }
  for (const key of ["runnerOs", "runnerArchitecture", "ubuntuVersion",
    "bunVersion", "emacsVersion"]) {
    if (environment[key] !== contract.environment[key]) {
      errors.push(`live ${key} ${JSON.stringify(environment[key])} does not match ` +
        JSON.stringify(contract.environment[key]));
    }
  }
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

export async function runOnboarding(options = {}) {
  const root = path.resolve(options.root ?? ROOT);
  const checked = await checkOnboarding({ root });
  const errors = [];
  if (process.env.GITHUB_ACTIONS !== "true") {
    throw new OnboardingValidationError([
      "run requires a fresh GitHub Actions environment",
    ]);
  }
  const cleanBefore = await cleanTrackedState(root);
  if (!cleanBefore) errors.push("tracked checkout must be clean before the run");
  const source = {
    commit: (await git(root, ["rev-parse", "HEAD"])).stdout.trim(),
    tree: (await git(root, ["rev-parse", "HEAD^{tree}"])).stdout.trim(),
  };
  const environment = await environmentReport(root);
  validateLiveEnvironment(environment, checked.contract, errors);
  if (process.env.GITHUB_SHA && source.commit !== process.env.GITHUB_SHA) {
    errors.push("GITHUB_SHA does not match the checked out commit");
  }
  if (errors.length > 0) throw new OnboardingValidationError(errors);

  const steps = [];
  let stopped = false;
  for (const step of checked.contract.steps) {
    if (stopped) {
      steps.push({
        id: step.id,
        argv: step.argv,
        timeoutMs: step.timeoutMs,
        countsTowardActiveDuration: step.countsTowardActiveDuration,
        status: "not-run",
        exitCode: null,
        timedOut: false,
        durationMs: 0,
        stdoutSha256: sha256(""),
        stderrSha256: sha256(""),
        summary: "stopped after an earlier failure",
      });
      continue;
    }
    const result = await runStep(root, step);
    steps.push(result);
    if (result.status !== "pass") stopped = true;
  }
  const cleanAfter = await cleanTrackedState(root);
  const activeDurationMs = Math.round(steps
    .filter((step) => step.countsTowardActiveDuration)
    .reduce((sum, step) => sum + step.durationMs, 0) * 1_000) / 1_000;
  const installDurationMs = steps.find((step) =>
    step.id === "locked-dependencies")?.durationMs ?? 0;
  const passed = steps.filter((step) => step.status === "pass").length;
  const failed = steps.filter((step) => step.status === "fail").length;
  const notRun = steps.filter((step) => step.status === "not-run").length;
  const withinActiveBudget = activeDurationMs <=
    checked.contract.environment.maximumActiveDurationMs;
  const acceptancePass = passed === steps.length && failed === 0 && notRun === 0 &&
    cleanBefore && cleanAfter && withinActiveBudget;
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  const report = {
    schemaVersion: 1,
    format: "eliscript-clean-machine-onboarding-run",
    version: 1,
    generatedAt: new Date().toISOString(),
    contractSha256: sha256(await readFile(path.join(root, CONTRACT_FILE))),
    source,
    ci: {
      provider: "github-actions",
      repository,
      runId,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
      sha: process.env.GITHUB_SHA,
      runUrl: `${process.env.GITHUB_SERVER_URL}/${repository}/actions/runs/${runId}`,
    },
    environment,
    steps,
    artifacts: await sourceArtifacts(root, checked.contract.sourceFiles),
    summary: {
      required: steps.length,
      passed,
      failed,
      notRun,
      installDurationMs,
      activeDurationMs,
      maximumActiveDurationMs: checked.contract.environment.maximumActiveDurationMs,
      withinActiveBudget,
      cleanBefore,
      cleanAfter,
      applicationsExecuted: false,
      acceptancePass,
    },
  };
  return report;
}

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function humanRunReport(report) {
  const lines = [
    "# Clean-machine Onboarding Run",
    "",
    `- Source commit: \`${report.source.commit}\``,
    `- Source tree: \`${report.source.tree}\``,
    `- GitHub Actions run: [${report.ci.runId}](${report.ci.runUrl})`,
    `- Generated: ${report.generatedAt}`,
    `- Environment: Ubuntu ${report.environment.ubuntuVersion}; ${report.environment.architecture}; Bun ${report.environment.bunVersion}; Node ${report.environment.nodeVersion}; Emacs ${report.environment.emacsVersion}`,
    `- Tracked checkout clean: ${report.summary.cleanBefore && report.summary.cleanAfter ? "yes" : "no"}`,
    `- Active duration: ${report.summary.activeDurationMs} / ${report.summary.maximumActiveDurationMs} ms`,
    `- Application validation executed: ${report.summary.applicationsExecuted ? "yes" : "no"}`,
    `- Clean-machine acceptance: ${report.summary.acceptancePass ? "pass" : "fail"}`,
    "",
    "Dependency installation is measured separately and excluded from the active",
    "duration. Application validations cannot contribute to this result.",
    "",
    "## Steps",
    "",
    "| Step | Command | Result | Exit | Active | Duration (ms) | stdout SHA-256 | stderr SHA-256 | Summary |",
    "| --- | --- | --- | ---: | --- | ---: | --- | --- | --- |",
    ...report.steps.map((step) =>
      `| ${step.id} | \`${markdownCell(step.argv.join(" "))}\` | ${step.status} | ${step.exitCode ?? "-"} | ${step.countsTowardActiveDuration ? "yes" : "no"} | ${step.durationMs} | \`${step.stdoutSha256}\` | \`${step.stderrSha256}\` | ${markdownCell(step.summary || "-")} |`),
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
  const result = await git(root, ["show", `${commit}:${filename}`]);
  return result.stdout;
}

export async function verifyRun(options) {
  const root = path.resolve(options.root ?? ROOT);
  const checked = await checkOnboarding({ root });
  const report = options.report ?? await readJson(path.resolve(root, options.runFile));
  const errors = [];
  if (!isPlainObject(report) || report.schemaVersion !== 1 ||
      report.format !== "eliscript-clean-machine-onboarding-run" ||
      report.version !== 1) {
    errors.push("run must use eliscript-clean-machine-onboarding-run version 1");
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
  if (report.ci?.provider !== checked.environment.provider ||
      !/^\d+$/.test(report.ci?.runId ?? "") ||
      report.ci?.sha !== report.source?.commit ||
      report.ci?.runUrl !== `https://github.com/${report.ci?.repository}/actions/runs/${report.ci?.runId}`) {
    errors.push("run must contain coherent GitHub Actions identity");
  }
  for (const key of ["runnerOs", "runnerArchitecture", "ubuntuVersion",
    "bunVersion", "emacsVersion"]) {
    if (report.environment?.[key] !== checked.environment[key]) {
      errors.push(`run environment.${key} does not match the contract`);
    }
  }
  if (!Array.isArray(report.steps) || report.steps.length !== checked.steps) {
    errors.push("run must contain every contracted step");
  } else {
    for (const [index, expected] of checked.contract.steps.entries()) {
      const actual = report.steps[index];
      if (actual?.id !== expected.id ||
          JSON.stringify(actual?.argv) !== JSON.stringify(expected.argv) ||
          actual?.timeoutMs !== expected.timeoutMs ||
          actual?.countsTowardActiveDuration !== expected.countsTowardActiveDuration) {
        errors.push(`run step ${index} does not match ${expected.id}`);
      }
      if (actual?.status !== "pass" || actual?.exitCode !== 0 || actual?.timedOut !== false) {
        errors.push(`run step ${expected.id} did not pass`);
      }
      for (const field of ["stdoutSha256", "stderrSha256"]) {
        if (!/^[0-9a-f]{64}$/.test(actual?.[field] ?? "")) {
          errors.push(`run step ${expected.id} has invalid ${field}`);
        }
      }
      if (typeof actual?.durationMs !== "number" || actual.durationMs < 0) {
        errors.push(`run step ${expected.id} has invalid durationMs`);
      }
    }
  }

  const artifactFiles = report.artifacts?.map((artifact) => artifact.file) ?? [];
  if (JSON.stringify(artifactFiles) !== JSON.stringify(checked.contract.sourceFiles)) {
    errors.push("run artifact inventory does not match sourceFiles");
  } else {
    for (const artifact of report.artifacts) {
      try {
        const source = await sourceAtCommit(root, report.source.commit, artifact.file);
        if (sha256(source) !== artifact.sha256) {
          errors.push(`run artifact digest differs from source commit: ${artifact.file}`);
        }
      } catch (error) {
        errors.push(`cannot verify run artifact ${artifact.file}: ${error.message}`);
      }
    }
  }
  try {
    const sourceContract = await sourceAtCommit(root, report.source.commit, CONTRACT_FILE);
    if (sha256(sourceContract) !== report.contractSha256) {
      errors.push("run contract digest differs from source commit");
    }
  } catch (error) {
    errors.push(`cannot verify run contract: ${error.message}`);
  }

  const steps = Array.isArray(report.steps) ? report.steps : [];
  const activeDurationMs = Math.round(steps
    .filter((step) => step.countsTowardActiveDuration)
    .reduce((sum, step) => sum + step.durationMs, 0) * 1_000) / 1_000;
  const expectedSummary = {
    required: checked.steps,
    passed: steps.filter((step) => step.status === "pass").length,
    failed: steps.filter((step) => step.status === "fail").length,
    notRun: steps.filter((step) => step.status === "not-run").length,
    installDurationMs: steps.find((step) =>
      step.id === "locked-dependencies")?.durationMs ?? 0,
    activeDurationMs,
    maximumActiveDurationMs: checked.maximumActiveDurationMs,
    withinActiveBudget: activeDurationMs <= checked.maximumActiveDurationMs,
    cleanBefore: true,
    cleanAfter: true,
    applicationsExecuted: false,
    acceptancePass: true,
  };
  if (JSON.stringify(report.summary) !== JSON.stringify(expectedSummary)) {
    errors.push("run summary is not the derived passing result");
  }
  if (errors.length > 0) throw new OnboardingValidationError(errors);

  if (options.markdownFile) {
    const markdown = await readFile(path.resolve(root, options.markdownFile), "utf8");
    if (markdown !== humanRunReport(report)) {
      throw new OnboardingValidationError([
        `${options.markdownFile} is not the exact generated report`,
      ]);
    }
  }
  return report;
}

function contractSummary(checked) {
  return [
    "Clean-machine onboarding contract:",
    `  Environment  Ubuntu ${checked.environment.ubuntuVersion} ${checked.environment.runnerArchitecture}`,
    `  Toolchain    Bun ${checked.environment.bunVersion}, Emacs ${checked.environment.emacsVersion}`,
    `  Steps        ${checked.steps} total, ${checked.activeSteps} active`,
    `  Active limit ${checked.maximumActiveDurationMs} ms`,
    `  Sources      ${checked.sourceFiles}`,
  ].join("\n");
}

function runSummary(report) {
  return [
    `Clean-machine onboarding run: ${report.source.commit}`,
    `Steps: ${report.summary.passed}/${report.summary.required} pass`,
    `Active duration: ${report.summary.activeDurationMs}/${report.summary.maximumActiveDurationMs} ms`,
    `Tracked checkout clean: ${report.summary.cleanBefore && report.summary.cleanAfter ? "yes" : "no"}`,
    `Application validation executed: ${report.summary.applicationsExecuted ? "yes" : "no"}`,
    `Acceptance: ${report.summary.acceptancePass ? "pass" : "fail"}`,
  ].join("\n");
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--run") options.run = true;
    else if (["--json-output", "--markdown-output", "--verify-run",
      "--verify-markdown"].includes(argument)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`${argument} requires a path`);
      index += 1;
      options[{
        "--json-output": "jsonOutput",
        "--markdown-output": "markdownOutput",
        "--verify-run": "verifyRun",
        "--verify-markdown": "verifyMarkdown",
      }[argument]] = value;
    } else throw new Error(`unknown option: ${argument}`);
  }
  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.run) {
    if (!options.jsonOutput || !options.markdownOutput || options.verifyRun) {
      throw new Error("--run requires --json-output and --markdown-output only");
    }
    const report = await runOnboarding({ root: ROOT });
    await writeFile(path.resolve(ROOT, options.jsonOutput),
      `${JSON.stringify(report, null, 2)}\n`);
    await writeFile(path.resolve(ROOT, options.markdownOutput), humanRunReport(report));
    process.stdout.write(`${runSummary(report)}\n`);
    if (!report.summary.acceptancePass) process.exitCode = 1;
    return report;
  }
  if (options.verifyRun) {
    const report = await verifyRun({
      root: ROOT,
      runFile: options.verifyRun,
      markdownFile: options.verifyMarkdown,
    });
    process.stdout.write(`${runSummary(report)}\n`);
    return report;
  }
  if (options.verifyMarkdown) {
    throw new Error("--verify-markdown requires --verify-run");
  }
  const checked = await checkOnboarding({ root: ROOT });
  process.stdout.write(`${contractSummary(checked)}\n`);
  return checked;
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
