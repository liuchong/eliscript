import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const TOOL_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(TOOL_DIRECTORY, "../..");
const CONTRACT_FILE = "contracts/core-acceptance-corpus.json";
const RUN_RESULTS = new Set(["pass", "incomplete", "fail"]);

export class AcceptanceCorpusError extends Error {
  constructor(errors) {
    super(`core acceptance corpus validation failed:\n- ${errors.join("\n- ")}`);
    this.name = "AcceptanceCorpusError";
    this.errors = errors;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0 &&
    !path.isAbsolute(value) &&
    !value.split("/").includes("..") &&
    path.posix.normalize(value) === value;
}

function sortedUnique(values) {
  return [...new Set(values)].sort();
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function readJson(filename) {
  return JSON.parse(await readFile(filename, "utf8"));
}

function extractCriteria(source, expression) {
  return [...source.matchAll(expression)].map((match) => ({
    id: match[1],
    title: match[2].trim(),
  }));
}

async function trackedFiles(root) {
  const result = await capture(["git", "ls-files", "-z"], root, 30_000);
  if (result.exitCode !== 0 || result.timedOut) {
    throw new AcceptanceCorpusError([
      "git ls-files could not enumerate corpus evidence",
    ]);
  }
  return new Set(result.stdout.split("\0").filter(Boolean));
}

async function capture(argv, root, timeoutMs) {
  const child = Bun.spawn(argv, {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  let timedOut = false;
  let forceKillTimer;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    forceKillTimer = setTimeout(() => child.kill("SIGKILL"), 2_000);
  }, timeoutMs);
  try {
    const [exitCode, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    return { exitCode, stdout, stderr, timedOut };
  } finally {
    clearTimeout(timer);
    clearTimeout(forceKillTimer);
  }
}

function validateStringArray(values, label, errors) {
  if (!Array.isArray(values) || values.length === 0 ||
      values.some((value) => typeof value !== "string" || value.length === 0)) {
    errors.push(`${label} must be a non-empty string array`);
    return [];
  }
  if (!equal(values, sortedUnique(values))) {
    errors.push(`${label} must be unique and lexicographically sorted`);
  }
  return values;
}

export async function validateAcceptanceCorpus(contract, options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const errors = [];
  if (!isPlainObject(contract) || contract.schemaVersion !== 1 ||
      contract.format !== "eliscript-core-acceptance-corpus" ||
      contract.version !== 1) {
    throw new AcceptanceCorpusError([
      "contract must use eliscript-core-acceptance-corpus version 1",
    ]);
  }

  const expectedSources = {
    acceptance: "specs/0040-maturity-roadmap.md",
    persistentData: "specs/0041-host-symbiosis-and-persistent-data.md",
    progress: "contracts/maturity-progress.json",
  };
  if (!equal(contract.sources, expectedSources)) {
    errors.push("sources must identify the normative acceptance and progress files");
  }

  const commands = Array.isArray(contract.commands) ? contract.commands : [];
  const commandIds = commands.map((command) => command?.id);
  if (commands.length === 0 || !equal(commandIds, sortedUnique(commandIds))) {
    errors.push("command ids must be non-empty, unique, and sorted");
  }
  for (const [index, command] of commands.entries()) {
    const label = `command ${index}`;
    if (!isPlainObject(command) || typeof command.id !== "string" ||
        !Array.isArray(command.argv) || command.argv.length === 0 ||
        command.argv.some((part) => typeof part !== "string" || part.length === 0) ||
        !Number.isInteger(command.timeoutMs) || command.timeoutMs < 1_000) {
      errors.push(`${label} must declare id, argv, and a bounded timeout`);
    }
  }

  let acceptanceSource = "";
  let persistentDataSource = "";
  let progress = {};
  try {
    [acceptanceSource, persistentDataSource, progress] = await Promise.all([
      readFile(path.join(root, expectedSources.acceptance), "utf8"),
      readFile(path.join(root, expectedSources.persistentData), "utf8"),
      readJson(path.join(root, expectedSources.progress)),
    ]);
  } catch (error) {
    errors.push(`normative source could not be read: ${error.message}`);
  }

  const acceptanceCriteria = extractCriteria(
    acceptanceSource,
    /^\*\*(AC-\d{2}) MUST - ([^*]+)\*\*$/gmu,
  );
  const persistentCriteria = extractCriteria(
    persistentDataSource,
    /^### (PD-\d{2}): (.+)$/gmu,
  );
  const expectedCriteria = [...acceptanceCriteria, ...persistentCriteria];
  const criteria = Array.isArray(contract.criteria) ? contract.criteria : [];
  const actualCriteria = criteria.map(({ id, title }) => ({ id, title }));
  if (acceptanceCriteria.length === 0 || persistentCriteria.length === 0 ||
      !equal(actualCriteria, expectedCriteria)) {
    errors.push(
      "criteria must exactly match the ordered AC and PD headings in the normative specifications",
    );
  }

  const progressCriteria = Array.isArray(progress?.verification?.criteria)
    ? progress.verification.criteria
    : [];
  if (!equal(
    criteria.map((criterion) => criterion?.id),
    progressCriteria.map((criterion) => criterion?.id),
  )) {
    errors.push("corpus and maturity progress criteria must have identical ids and order");
  }

  let files = new Set();
  try {
    files = await trackedFiles(root);
  } catch (error) {
    errors.push(...error.errors);
  }
  const referencedCommands = new Set();
  for (const [index, criterion] of criteria.entries()) {
    const expected = expectedCriteria[index];
    const label = expected?.id ?? `criterion ${index}`;
    if (!isPlainObject(criterion)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    const expectedSpec = criterion.id?.startsWith("AC-") ? "0040" : "0041";
    if (criterion.sourceSpec !== expectedSpec) {
      errors.push(`${label} sourceSpec must be ${expectedSpec}`);
    }
    const probes = validateStringArray(criterion.probes, `${label} probes`, errors);
    for (const probe of probes) {
      referencedCommands.add(probe);
      if (!commandIds.includes(probe)) {
        errors.push(`${label} references unknown command ${probe}`);
      }
    }
    const evidence = validateStringArray(
      criterion.evidence,
      `${label} evidence`,
      errors,
    );
    for (const filename of evidence) {
      if (!safeRelativePath(filename)) {
        errors.push(`${label} has unsafe evidence path ${JSON.stringify(filename)}`);
        continue;
      }
      if (!files.has(filename)) {
        errors.push(`${label} evidence is not tracked: ${filename}`);
        continue;
      }
      try {
        const details = await stat(path.join(root, filename));
        if (!details.isFile()) errors.push(`${label} evidence is not a file: ${filename}`);
      } catch {
        errors.push(`${label} evidence is missing: ${filename}`);
      }
    }
  }
  for (const id of commandIds) {
    if (!referencedCommands.has(id)) errors.push(`command ${id} is not used by any criterion`);
  }

  const applications = extractCriteria(
    acceptanceSource,
    /^\*\*(AV-\d{2}) - ([^*]+)\*\*$/gmu,
  );
  const actualApplications = Array.isArray(contract.applications)
    ? contract.applications.map(({ id, title }) => ({ id, title }))
    : [];
  if (!equal(actualApplications, applications) ||
      contract.applications?.some((entry) => entry.contributesToCore !== false)) {
    errors.push("applications must match AV headings and contribute no core evidence");
  }

  if (errors.length > 0) throw new AcceptanceCorpusError(errors);
  return {
    contract,
    progress,
    criteria: expectedCriteria,
    applications,
  };
}

export async function checkAcceptanceCorpus(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const contract = options.contract ??
    await readJson(path.join(root, CONTRACT_FILE));
  return validateAcceptanceCorpus(contract, { root });
}

function outputSummary(stdout, stderr) {
  const lines = `${stdout}\n${stderr}`.split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(-3).join(" | ").slice(0, 600);
}

async function runProbe(command, root) {
  const started = performance.now();
  const result = await capture(command.argv, root, command.timeoutMs);
  const output = `${result.stdout}\n${result.stderr}`;
  return {
    id: command.id,
    argv: command.argv,
    timeoutMs: command.timeoutMs,
    status: !result.timedOut && result.exitCode === 0 ? "pass" : "fail",
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    durationMs: Math.round((performance.now() - started) * 1_000) / 1_000,
    outputSha256: sha256(output),
    summary: outputSummary(result.stdout, result.stderr),
  };
}

async function commandText(argv, root) {
  const result = await capture(argv, root, 30_000);
  if (result.exitCode !== 0 || result.timedOut) {
    throw new AcceptanceCorpusError([`${argv.join(" ")} could not be recorded`]);
  }
  return result.stdout.trim();
}

async function repositoryStatus(root) {
  return commandText(["git", "status", "--short", "--untracked-files=all"], root);
}

async function environmentRecord(root) {
  const [operatingSystem, bunVersion, nodeVersion, emacsVersion] = await Promise.all([
    commandText(["uname", "-sr"], root),
    commandText(["bun", "--version"], root),
    commandText(["node", "--version"], root),
    commandText(["emacs", "--batch", "-Q", "--eval", "(princ emacs-version)"], root),
  ]);
  return {
    platform: process.platform,
    architecture: process.arch,
    operatingSystem,
    bunVersion,
    nodeVersion,
    emacsVersion,
    cpu: os.cpus()[0]?.model ?? "unknown",
  };
}

async function artifactRecords(root, contract) {
  const filenames = sortedUnique([
    CONTRACT_FILE,
    ...Object.values(contract.sources),
    ...contract.criteria.flatMap((criterion) => criterion.evidence),
  ]);
  return Promise.all(filenames.map(async (file) => ({
    file,
    sha256: sha256(await readFile(path.join(root, file))),
  })));
}

function countResults(criteria) {
  const counts = { pass: 0, incomplete: 0, fail: 0, total: criteria.length };
  for (const criterion of criteria) counts[criterion.result] += 1;
  return counts;
}

export async function runAcceptanceCorpus(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const checked = await checkAcceptanceCorpus({ root, contract: options.contract });
  const before = await repositoryStatus(root);
  if (before.length > 0) {
    throw new AcceptanceCorpusError([
      "acceptance runs require a clean tracked and untracked worktree",
    ]);
  }

  const source = {
    commit: await commandText(["git", "rev-parse", "HEAD"], root),
    tree: await commandText(["git", "rev-parse", "HEAD^{tree}"], root),
    cleanBefore: true,
    cleanAfter: false,
  };
  const commands = [];
  for (const command of checked.contract.commands) {
    commands.push(await runProbe(command, root));
  }
  source.cleanAfter = (await repositoryStatus(root)).length === 0;

  const artifacts = await artifactRecords(root, checked.contract);
  const commandResults = new Map(commands.map((command) => [command.id, command]));
  const progressResults = new Map(
    checked.progress.verification.criteria.map((criterion) => [criterion.id, criterion]),
  );
  const criteria = checked.contract.criteria.map((criterion) => {
    const progress = progressResults.get(criterion.id);
    const probesPassed = criterion.probes.every(
      (id) => commandResults.get(id)?.status === "pass",
    );
    const result = !probesPassed
      ? "fail"
      : progress.status === "complete" ? "pass" : "incomplete";
    return {
      id: criterion.id,
      title: criterion.title,
      sourceSpec: criterion.sourceSpec,
      result,
      declaredStatus: progress.status,
      probes: criterion.probes,
      evidence: criterion.evidence,
      ...(progress.remaining ? { remaining: progress.remaining } : {}),
    };
  });
  const counts = countResults(criteria);
  const operationalSuccess = commands.every((command) => command.status === "pass") &&
    source.cleanBefore && source.cleanAfter;
  const report = {
    schemaVersion: 1,
    format: "eliscript-core-acceptance-run",
    version: 1,
    generatedAt: new Date().toISOString(),
    source,
    environment: await environmentRecord(root),
    corpus: {
      contract: CONTRACT_FILE,
      contractSha256: sha256(
        await readFile(path.join(root, CONTRACT_FILE)),
      ),
      criterionCount: checked.contract.criteria.length,
    },
    commands,
    artifacts,
    criteria,
    applications: checked.contract.applications.map((application) => ({
      ...application,
      result: "not-run",
    })),
    summary: {
      criteria: counts,
      corpusComplete: criteria.length === checked.criteria.length,
      operationalSuccess,
      acceptancePass: operationalSuccess && counts.pass === counts.total,
    },
  };

  if (options.jsonOutput) {
    const filename = path.resolve(root, options.jsonOutput);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, `${JSON.stringify(report, null, 2)}\n`);
  }
  if (options.markdownOutput) {
    const filename = path.resolve(root, options.markdownOutput);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, humanRunReport(report));
  }
  if (options.requirePass && !report.summary.acceptancePass) {
    throw new AcceptanceCorpusError([
      "the complete corpus ran, but the final acceptance gate did not pass",
    ]);
  }
  if (!report.summary.operationalSuccess) {
    throw new AcceptanceCorpusError([
      "one or more corpus commands failed or changed the repository",
    ]);
  }
  return report;
}

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function humanRunReport(report) {
  const lines = [
    "# Core Acceptance Corpus Run",
    "",
    `- Source commit: \`${report.source.commit}\``,
    `- Source tree: \`${report.source.tree}\``,
    `- Generated: ${report.generatedAt}`,
    `- Environment: ${report.environment.operatingSystem}; ${report.environment.architecture}; Bun ${report.environment.bunVersion}; Node ${report.environment.nodeVersion}; Emacs ${report.environment.emacsVersion}`,
    `- Corpus complete: ${report.summary.corpusComplete ? "yes" : "no"}`,
    `- Operational success: ${report.summary.operationalSuccess ? "yes" : "no"}`,
    `- Final acceptance: ${report.summary.acceptancePass ? "pass" : "not reached"}`,
    "",
    "This is a retained maturity audit, not a final 1.0 acceptance claim. A",
    "criterion remains incomplete until its complete normative wording is proven.",
    "Application validations are reported separately and contribute no core result.",
    "",
    "## Commands",
    "",
    "| Probe | Command | Result | Exit | Duration (ms) | Output SHA-256 |",
    "| --- | --- | --- | ---: | ---: | --- |",
    ...report.commands.map((command) =>
      `| ${command.id} | \`${markdownCell(command.argv.join(" "))}\` | ${command.status} | ${command.exitCode} | ${command.durationMs} | \`${command.outputSha256}\` |`),
    "",
    "## Mandatory Criteria",
    "",
    `Results: ${report.summary.criteria.pass} pass, ${report.summary.criteria.incomplete} incomplete, ${report.summary.criteria.fail} fail, ${report.summary.criteria.total} total.`,
    "",
    "| Criterion | Result | Declared state | Evidence | Remaining work |",
    "| --- | --- | --- | --- | --- |",
    ...report.criteria.map((criterion) =>
      `| ${criterion.id} ${markdownCell(criterion.title)} | ${criterion.result} | ${criterion.declaredStatus} | ${criterion.evidence.map((file) => `\`${file}\``).join("<br>")} | ${markdownCell(criterion.remaining ?? "-")} |`),
    "",
    "## Application Validation",
    "",
    "| Criterion | Result | Core contribution |",
    "| --- | --- | --- |",
    ...report.applications.map((application) =>
      `| ${application.id} ${markdownCell(application.title)} | ${application.result} | no |`),
    "",
    "## Artifact Digests",
    "",
    "| File | SHA-256 |",
    "| --- | --- |",
    ...report.artifacts.map((artifact) =>
      `| \`${artifact.file}\` | \`${artifact.sha256}\` |`),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

function validateRunShape(report, checked, errors) {
  if (!isPlainObject(report) || report.schemaVersion !== 1 ||
      report.format !== "eliscript-core-acceptance-run" || report.version !== 1) {
    errors.push("run must use eliscript-core-acceptance-run version 1");
    return;
  }
  if (!/^\d{4}-\d{2}-\d{2}T/u.test(report.generatedAt ?? "") ||
      !/^[0-9a-f]{40}$/u.test(report.source?.commit ?? "") ||
      !/^[0-9a-f]{40}$/u.test(report.source?.tree ?? "") ||
      report.source?.cleanBefore !== true || report.source?.cleanAfter !== true) {
    errors.push("run source identity and clean-worktree evidence are invalid");
  }
  if (!isPlainObject(report.environment) ||
      ["platform", "architecture", "operatingSystem", "bunVersion", "nodeVersion", "emacsVersion", "cpu"]
        .some((field) => typeof report.environment[field] !== "string" ||
          report.environment[field].length === 0)) {
    errors.push("run environment metadata is incomplete");
  }
  if (report.corpus?.contract !== CONTRACT_FILE ||
      !/^[0-9a-f]{64}$/u.test(report.corpus?.contractSha256 ?? "") ||
      report.corpus?.criterionCount !== checked.contract.criteria.length) {
    errors.push("run corpus identity is invalid");
  }
  const expectedCommands = checked.contract.commands.map(({ id, argv, timeoutMs }) => ({
    id,
    argv,
    timeoutMs,
  }));
  const actualCommands = Array.isArray(report.commands)
    ? report.commands.map(({ id, argv, timeoutMs }) => ({ id, argv, timeoutMs }))
    : [];
  if (!equal(actualCommands, expectedCommands) || report.commands?.some((command) =>
    !["pass", "fail"].includes(command.status) ||
    !Number.isInteger(command.exitCode) || typeof command.timedOut !== "boolean" ||
    typeof command.durationMs !== "number" || command.durationMs < 0 ||
    !/^[0-9a-f]{64}$/u.test(command.outputSha256 ?? ""))) {
    errors.push("run command records do not match the corpus contract");
  }
  const expectedCriteria = checked.contract.criteria.map(({ id, title, sourceSpec, probes, evidence }) => ({
    id,
    title,
    sourceSpec,
    probes,
    evidence,
  }));
  const actualCriteria = Array.isArray(report.criteria)
    ? report.criteria.map(({ id, title, sourceSpec, probes, evidence }) => ({
      id,
      title,
      sourceSpec,
      probes,
      evidence,
    }))
    : [];
  if (!equal(actualCriteria, expectedCriteria) || report.criteria?.some((criterion) =>
    !RUN_RESULTS.has(criterion.result) ||
    !["complete", "partial", "open", "blocked"].includes(criterion.declaredStatus))) {
    errors.push("run criteria do not match the complete corpus contract");
  }
  const expectedArtifacts = sortedUnique([
    CONTRACT_FILE,
    ...Object.values(checked.contract.sources),
    ...checked.contract.criteria.flatMap((criterion) => criterion.evidence),
  ]);
  if (!Array.isArray(report.artifacts) ||
      !equal(report.artifacts.map((artifact) => artifact.file), expectedArtifacts) ||
      report.artifacts.some((artifact) => !/^[0-9a-f]{64}$/u.test(artifact.sha256 ?? ""))) {
    errors.push("run artifact digest inventory is incomplete or invalid");
  }
  const expectedApplications = checked.contract.applications.map((application) => ({
    ...application,
    result: "not-run",
  }));
  if (!equal(report.applications, expectedApplications)) {
    errors.push("run application results must remain separate and non-contributing");
  }
  const counts = Array.isArray(report.criteria)
    ? countResults(report.criteria)
    : { pass: 0, incomplete: 0, fail: 0, total: 0 };
  const operationalSuccess = report.commands?.every((command) => command.status === "pass") &&
    report.source?.cleanBefore === true && report.source?.cleanAfter === true;
  const expectedSummary = {
    criteria: counts,
    corpusComplete: counts.total === checked.contract.criteria.length,
    operationalSuccess,
    acceptancePass: operationalSuccess && counts.pass === counts.total,
  };
  if (!equal(report.summary, expectedSummary)) {
    errors.push("run summary is not derived from recorded results");
  }
}

export async function verifyAcceptanceRun(runFile, options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const checked = await checkAcceptanceCorpus({ root, contract: options.contract });
  const report = options.report ?? await readJson(path.resolve(root, runFile));
  const errors = [];
  validateRunShape(report, checked, errors);
  const currentContractDigest = sha256(
    await readFile(path.join(root, CONTRACT_FILE)),
  );
  if (report.corpus?.contractSha256 !== currentContractDigest) {
    errors.push("run was produced from a different acceptance corpus contract");
  }
  if (options.markdownFile) {
    const markdown = await readFile(path.resolve(root, options.markdownFile), "utf8");
    if (markdown !== humanRunReport(report)) {
      errors.push("human report does not match its machine-readable run");
    }
  }
  if (errors.length > 0) throw new AcceptanceCorpusError(errors);
  return report;
}

export function humanCorpusReport(checked) {
  return [
    `Core acceptance corpus: ${checked.criteria.length} mandatory criteria`,
    `Commands: ${checked.contract.commands.map((command) => command.id).join(", ")}`,
    `Applications: ${checked.applications.length} separate non-contributing validations`,
  ].join("\n");
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--run") options.run = true;
    else if (argument === "--require-pass") options.requirePass = true;
    else if (argument === "--json") options.json = true;
    else if (["--json-output", "--markdown-output", "--verify-run", "--verify-markdown"].includes(argument)) {
      const value = argv[index + 1];
      if (!value) throw new AcceptanceCorpusError([`${argument} requires a path`]);
      const key = {
        "--json-output": "jsonOutput",
        "--markdown-output": "markdownOutput",
        "--verify-run": "verifyRun",
        "--verify-markdown": "verifyMarkdown",
      }[argument];
      options[key] = value;
      index += 1;
    } else {
      throw new AcceptanceCorpusError([`unknown argument ${argument}`]);
    }
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.run) {
    if (!options.jsonOutput || !options.markdownOutput) {
      throw new AcceptanceCorpusError([
        "--run requires --json-output and --markdown-output",
      ]);
    }
    const report = await runAcceptanceCorpus(options);
    process.stdout.write(options.json
      ? `${JSON.stringify(report, null, 2)}\n`
      : humanRunReport(report));
    return;
  }
  if (options.verifyRun) {
    const report = await verifyAcceptanceRun(options.verifyRun, {
      markdownFile: options.verifyMarkdown,
    });
    process.stdout.write(options.json
      ? `${JSON.stringify(report, null, 2)}\n`
      : humanRunReport(report));
    return;
  }
  const checked = await checkAcceptanceCorpus();
  process.stdout.write(options.json
    ? `${JSON.stringify({
      format: "eliscript-core-acceptance-corpus-report",
      version: 1,
      criteria: checked.criteria.length,
      commands: checked.contract.commands.map((command) => command.id),
      applications: checked.applications.length,
    }, null, 2)}\n`
    : `${humanCorpusReport(checked)}\n`);
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
