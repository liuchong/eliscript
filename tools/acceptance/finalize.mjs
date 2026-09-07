#!/usr/bin/env bun

import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { verifyAcceptanceRun } from "./check.mjs";

const TOOL_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(TOOL_DIRECTORY, "../..");
const CONTRACT_FILE = "contracts/final-acceptance.json";
const EXPECTED_SOURCE = {
  run: "acceptance/runs/m13-01.json",
  report: "acceptance/runs/m13-01.md",
};
const EXPECTED_OUTPUTS = {
  manifest: "acceptance/manifest.json",
  report: "acceptance/report.md",
};
const EXPECTED_GROUPS = ["benchmark", "fuzz", "scale", "soak", "test"];
const DEFECT_CLASSES = new Set([
  "bootstrap",
  "compatibility",
  "correctness",
  "data-loss",
  "security",
]);

export class FinalAcceptanceError extends Error {
  constructor(errors) {
    super(`final acceptance validation failed:\n- ${errors.join("\n- ")}`);
    this.name = "FinalAcceptanceError";
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

function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0 &&
    !path.isAbsolute(value) && !value.split("/").includes("..") &&
    path.posix.normalize(value) === value;
}

function sortedUniqueStrings(values) {
  return Array.isArray(values) && values.length > 0 &&
    values.every((value) => typeof value === "string" && value.length > 0) &&
    new Set(values).size === values.length &&
    equal(values, [...values].sort());
}

async function readJson(root, file) {
  return JSON.parse(await readFile(path.join(root, file), "utf8"));
}

async function regularFile(root, file) {
  try {
    return (await stat(path.join(root, file))).isFile();
  } catch {
    return false;
  }
}

export async function validateFinalAcceptanceContract(contract, run, options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const errors = [];
  if (!isPlainObject(contract) || contract.schemaVersion !== 1 ||
      contract.format !== "eliscript-final-acceptance-contract" ||
      contract.version !== 1) {
    throw new FinalAcceptanceError([
      "contract must use eliscript-final-acceptance-contract version 1",
    ]);
  }
  if (!equal(contract.source, EXPECTED_SOURCE)) {
    errors.push("contract source must identify the retained core run and report");
  }
  if (contract.defects !== "acceptance/defects.json") {
    errors.push("contract defects must identify acceptance/defects.json");
  }
  if (!equal(contract.outputs, EXPECTED_OUTPUTS)) {
    errors.push("contract outputs must be the canonical acceptance artifacts");
  }
  if (!equal(contract.blockingSeverities, [1, 2])) {
    errors.push("blocking severities must be exactly 1 and 2");
  }

  const groups = Array.isArray(contract.evidenceGroups)
    ? contract.evidenceGroups
    : [];
  if (!equal(groups.map((group) => group?.id), EXPECTED_GROUPS)) {
    errors.push("evidence groups must be exactly benchmark fuzz scale soak and test");
  }
  const criterionIds = new Set(run.criteria.map((criterion) => criterion.id));
  const runArtifacts = new Map(run.artifacts.map((artifact) => [
    artifact.file,
    artifact.sha256,
  ]));
  for (const [index, group] of groups.entries()) {
    const label = group?.id ?? `evidence group ${index}`;
    if (!isPlainObject(group) || !sortedUniqueStrings(group.criteria) ||
        !sortedUniqueStrings(group.artifacts)) {
      errors.push(`${label} must declare sorted unique criteria and artifacts`);
      continue;
    }
    if (group.criteria.includes("*") && !equal(group.criteria, ["*"])) {
      errors.push(`${label} wildcard criterion must be the only criterion`);
    }
    for (const id of group.criteria) {
      if (id !== "*" && !criterionIds.has(id)) {
        errors.push(`${label} references unknown criterion ${id}`);
      }
    }
    for (const file of group.artifacts) {
      if (!safeRelativePath(file)) {
        errors.push(`${label} has unsafe artifact path ${JSON.stringify(file)}`);
        continue;
      }
      if (!runArtifacts.has(file)) {
        errors.push(`${label} artifact is not bound by the source run: ${file}`);
        continue;
      }
      if (!await regularFile(root, file)) {
        errors.push(`${label} artifact is missing: ${file}`);
        continue;
      }
      const digest = sha256(await readFile(path.join(root, file)));
      if (digest !== runArtifacts.get(file)) {
        errors.push(`${label} artifact changed after the source run: ${file}`);
      }
    }
  }
  if (errors.length > 0) throw new FinalAcceptanceError(errors);
  return contract;
}

export async function validateDefectRegister(register, options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const errors = [];
  if (!isPlainObject(register) || register.schemaVersion !== 1 ||
      register.format !== "eliscript-acceptance-defect-register" ||
      register.version !== 1 || !Array.isArray(register.unresolved)) {
    throw new FinalAcceptanceError([
      "defect register must use eliscript-acceptance-defect-register version 1",
    ]);
  }
  const ids = [];
  for (const [index, defect] of register.unresolved.entries()) {
    const label = defect?.id ?? `defect ${index}`;
    if (!isPlainObject(defect) || !/^[A-Z][A-Z0-9-]+$/u.test(defect.id ?? "") ||
        !Number.isInteger(defect.severity) || defect.severity < 1 ||
        defect.severity > 4 || !DEFECT_CLASSES.has(defect.class) ||
        typeof defect.title !== "string" || defect.title.length === 0 ||
        !sortedUniqueStrings(defect.evidence)) {
      errors.push(`${label} must declare id severity class title and evidence`);
      continue;
    }
    ids.push(defect.id);
    for (const file of defect.evidence) {
      if (!safeRelativePath(file) || !await regularFile(root, file)) {
        errors.push(`${label} has missing or unsafe evidence ${JSON.stringify(file)}`);
      }
    }
  }
  if (new Set(ids).size !== ids.length || !equal(ids, [...ids].sort())) {
    errors.push("unresolved defect ids must be unique and sorted");
  }
  if (errors.length > 0) throw new FinalAcceptanceError(errors);
  return register;
}

function resultCounts(criteria) {
  const result = { pass: 0, incomplete: 0, fail: 0, total: criteria.length };
  for (const criterion of criteria) result[criterion.result] += 1;
  return result;
}

function evidenceRecords(contract, run) {
  const allCriteria = run.criteria.map((criterion) => criterion.id);
  const criteria = new Map(run.criteria.map((criterion) => [
    criterion.id,
    criterion.result,
  ]));
  const artifacts = new Map(run.artifacts.map((artifact) => [
    artifact.file,
    artifact.sha256,
  ]));
  return contract.evidenceGroups.map((group) => {
    const ids = equal(group.criteria, ["*"]) ? allCriteria : group.criteria;
    return {
      id: group.id,
      complete: true,
      criteria: ids.map((id) => ({ id, result: criteria.get(id) })),
      artifacts: group.artifacts.map((file) => ({
        file,
        sha256: artifacts.get(file),
      })),
    };
  });
}

export async function buildFinalAcceptance(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const contract = options.contract ?? await readJson(root, CONTRACT_FILE);
  const run = options.run ?? await verifyAcceptanceRun(contract.source.run, {
    root,
    markdownFile: contract.source.report,
  });
  await validateFinalAcceptanceContract(contract, run, { root });
  const defects = await validateDefectRegister(
    options.defects ?? await readJson(root, contract.defects),
    { root },
  );
  const sourceRunBytes = await readFile(path.join(root, contract.source.run));
  const sourceReportBytes = await readFile(path.join(root, contract.source.report));
  const defectBytes = options.defects
    ? Buffer.from(`${JSON.stringify(defects, null, 2)}\n`)
    : await readFile(path.join(root, contract.defects));
  const evidence = evidenceRecords(contract, run);
  const contractBytes = await readFile(path.join(root, CONTRACT_FILE));
  const blockingDefects = defects.unresolved.filter((defect) =>
    contract.blockingSeverities.includes(defect.severity)).length;
  const evidenceComplete = evidence.every((group) => group.complete);
  const criteria = resultCounts(run.criteria);
  return {
    schemaVersion: 1,
    format: "eliscript-1.0-acceptance-manifest",
    version: 1,
    generatedAt: run.generatedAt,
    source: run.source,
    environment: run.environment,
    contract: {
      file: CONTRACT_FILE,
      sha256: sha256(contractBytes),
    },
    sourceRun: {
      json: contract.source.run,
      jsonSha256: sha256(sourceRunBytes),
      markdown: contract.source.report,
      markdownSha256: sha256(sourceReportBytes),
    },
    commands: run.commands,
    criteria: run.criteria,
    artifacts: run.artifacts,
    evidence,
    defects: {
      register: contract.defects,
      registerSha256: sha256(defectBytes),
      blockingSeverities: contract.blockingSeverities,
      unresolved: defects.unresolved,
      blockingCount: blockingDefects,
    },
    applications: run.applications,
    summary: {
      criteria,
      corpusComplete: run.summary.corpusComplete,
      operationalSuccess: run.summary.operationalSuccess,
      evidenceComplete,
      blockingDefects,
      acceptancePass: run.summary.acceptancePass && evidenceComplete &&
        blockingDefects === 0,
    },
  };
}

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function humanFinalAcceptanceReport(manifest) {
  const lines = [
    "# Eliscript 1.0 Acceptance Report",
    "",
    `- Source commit: \`${manifest.source.commit}\``,
    `- Source tree: \`${manifest.source.tree}\``,
    `- Contract: \`${manifest.contract.file}\` (\`${manifest.contract.sha256}\`)`,
    `- Generated: ${manifest.generatedAt}`,
    `- Environment: ${manifest.environment.operatingSystem}; ${manifest.environment.architecture}; Bun ${manifest.environment.bunVersion}; Node ${manifest.environment.nodeVersion}; Emacs ${manifest.environment.emacsVersion}`,
    `- Corpus complete: ${manifest.summary.corpusComplete ? "yes" : "no"}`,
    `- Operational success: ${manifest.summary.operationalSuccess ? "yes" : "no"}`,
    `- Evidence complete: ${manifest.summary.evidenceComplete ? "yes" : "no"}`,
    `- Blocking defects: ${manifest.summary.blockingDefects}`,
    `- Final acceptance: ${manifest.summary.acceptancePass ? "pass" : "not reached"}`,
    "",
    manifest.summary.acceptancePass
      ? "Every mandatory core criterion and final gate passed in the source run."
      : "This is the canonical candidate report. It does not declare Eliscript 1.0 accepted while mandatory criteria remain incomplete.",
    "",
    "## Mandatory Criteria",
    "",
    `Results: ${manifest.summary.criteria.pass} pass, ${manifest.summary.criteria.incomplete} incomplete, ${manifest.summary.criteria.fail} fail, ${manifest.summary.criteria.total} total.`,
    "",
    "| Criterion | Result | Declared state | Remaining work |",
    "| --- | --- | --- | --- |",
    ...manifest.criteria.map((criterion) =>
      `| ${criterion.id} ${markdownCell(criterion.title)} | ${criterion.result} | ${criterion.declaredStatus} | ${markdownCell(criterion.remaining ?? "-")} |`),
    "",
    "## Evidence Summaries",
    "",
    "| Group | Complete | Criteria | Artifacts |",
    "| --- | --- | ---: | ---: |",
    ...manifest.evidence.map((group) =>
      `| ${group.id} | ${group.complete ? "yes" : "no"} | ${group.criteria.length} | ${group.artifacts.length} |`),
    "",
    "## Unresolved Defects",
    "",
    ...(manifest.defects.unresolved.length === 0
      ? ["No unresolved defects are recorded."]
      : [
        "| ID | Severity | Class | Title |",
        "| --- | ---: | --- | --- |",
        ...manifest.defects.unresolved.map((defect) =>
          `| ${defect.id} | ${defect.severity} | ${defect.class} | ${markdownCell(defect.title)} |`),
      ]),
    "",
    "## Application Validation",
    "",
    "| Criterion | Result | Core contribution |",
    "| --- | --- | --- |",
    ...manifest.applications.map((application) =>
      `| ${application.id} ${markdownCell(application.title)} | ${application.result} | no |`),
    "",
    "## Commands",
    "",
    "| Probe | Command | Result | Exit | Duration (ms) | Output SHA-256 |",
    "| --- | --- | --- | ---: | ---: | --- |",
    ...manifest.commands.map((command) =>
      `| ${command.id} | \`${markdownCell(command.argv.join(" "))}\` | ${command.status} | ${command.exitCode} | ${command.durationMs} | \`${command.outputSha256}\` |`),
    "",
    "## Artifact Digests",
    "",
    "| File | SHA-256 |",
    "| --- | --- |",
    ...manifest.artifacts.map((artifact) =>
      `| \`${artifact.file}\` | \`${artifact.sha256}\` |`),
  ];
  return `${lines.join("\n")}\n`;
}

export function validateFinalManifest(manifest, expected) {
  const errors = [];
  if (!isPlainObject(manifest) || manifest.schemaVersion !== 1 ||
      manifest.format !== "eliscript-1.0-acceptance-manifest" ||
      manifest.version !== 1) {
    errors.push("manifest must use eliscript-1.0-acceptance-manifest version 1");
  }
  if (!equal(manifest?.summary, expected.summary)) {
    errors.push("final acceptance summary is not derived from its source evidence");
  }
  if (!equal(manifest, expected)) {
    errors.push("final acceptance manifest does not match its verified source run");
  }
  if (errors.length > 0) throw new FinalAcceptanceError(errors);
  return manifest;
}

export async function generateFinalAcceptance(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const contract = options.contract ?? await readJson(root, CONTRACT_FILE);
  const manifest = await buildFinalAcceptance({ ...options, root, contract });
  await mkdir(path.dirname(path.join(root, contract.outputs.manifest)), {
    recursive: true,
  });
  await writeFile(
    path.join(root, contract.outputs.manifest),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFile(
    path.join(root, contract.outputs.report),
    humanFinalAcceptanceReport(manifest),
  );
  return manifest;
}

export async function verifyFinalAcceptance(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const contract = options.contract ?? await readJson(root, CONTRACT_FILE);
  const expected = await buildFinalAcceptance({ ...options, root, contract });
  const manifest = options.manifest ??
    await readJson(root, contract.outputs.manifest);
  validateFinalManifest(manifest, expected);
  const markdown = options.markdown ??
    await readFile(path.join(root, contract.outputs.report), "utf8");
  if (markdown !== humanFinalAcceptanceReport(manifest)) {
    throw new FinalAcceptanceError([
      "human acceptance report does not match the machine-readable manifest",
    ]);
  }
  if (options.requirePass && !manifest.summary.acceptancePass) {
    throw new FinalAcceptanceError([
      "the canonical artifacts are valid, but final acceptance has not been reached",
    ]);
  }
  return manifest;
}

export function humanFinalAcceptanceSummary(manifest) {
  return [
    `Final acceptance artifacts: ${manifest.source.commit}`,
    `Criteria: ${manifest.summary.criteria.pass}/${manifest.summary.criteria.total} pass, ${manifest.summary.criteria.incomplete} incomplete, ${manifest.summary.criteria.fail} fail`,
    `Evidence groups: ${manifest.evidence.length}/${manifest.evidence.length} complete`,
    `Blocking defects: ${manifest.summary.blockingDefects}`,
    `Final acceptance: ${manifest.summary.acceptancePass ? "pass" : "not reached"}`,
  ].join("\n");
}

function parseArguments(argv) {
  const options = {};
  for (const argument of argv) {
    if (argument === "--generate") options.generate = true;
    else if (argument === "--verify") options.verify = true;
    else if (argument === "--require-pass") options.requirePass = true;
    else throw new FinalAcceptanceError([`unknown argument ${argument}`]);
  }
  if (options.generate === options.verify) {
    throw new FinalAcceptanceError([
      "choose exactly one of --generate or --verify",
    ]);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifest = options.generate
    ? await generateFinalAcceptance(options)
    : await verifyFinalAcceptance(options);
  process.stdout.write(`${humanFinalAcceptanceSummary(manifest)}\n`);
  if (options.requirePass && !manifest.summary.acceptancePass) {
    throw new FinalAcceptanceError([
      "the canonical artifacts are valid, but final acceptance has not been reached",
    ]);
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
