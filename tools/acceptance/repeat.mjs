import { createHash } from "node:crypto";
import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
  mkdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runAcceptanceCorpus } from "./check.mjs";

const TOOL_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(TOOL_DIRECTORY, "../..");
export const REPEATED_DETERMINISM_FORMAT =
  "eliscript-repeated-determinism-run";
export const REPEATED_DETERMINISM_VERSION = 1;
export const REQUIRED_ITERATIONS = 20;

const COMPILER_MODULES = [
  "analyzer",
  "compiler",
  "emitter",
  "expander",
  "formatter",
  "ir",
  "lower",
  "project",
  "reader",
  "source-map",
  "symbol",
  "syntax",
  "transient-analysis",
];
const COMPILER_ARTIFACTS = COMPILER_MODULES.flatMap((name) => [
  `${name}.mjs`,
  `${name}.mjs.map`,
]).sort();
const EXCLUDED_OBSERVATIONS = [
  "acceptance.generatedAt",
  "acceptance.commands[].durationMs",
  "acceptance.commands[].outputSha256",
  "acceptance.commands[].summary",
  "compiler.temporaryDirectory",
];
const IDENTITY_PROJECTION_FORMAT =
  "eliscript-repeated-determinism-identity";
const IDENTITY_PROJECTION_VERSION = 1;

export class RepeatedDeterminismError extends Error {
  constructor(messages) {
    super(`repeated determinism validation failed:\n- ${messages.join("\n- ")}`);
    this.name = "RepeatedDeterminismError";
  }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [
      key,
      canonicalValue(value[key]),
    ]));
  }
  return value;
}

function identityDigest(value) {
  return sha256(JSON.stringify(canonicalValue(value)));
}

async function capture(command, options = {}) {
  const child = Bun.spawn(command, {
    cwd: options.cwd,
    env: options.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

async function compilerIdentity(directory) {
  const actual = (await readdir(directory)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(COMPILER_ARTIFACTS)) {
    throw new RepeatedDeterminismError([
      "compiler build did not produce the exact declared artifact inventory",
    ]);
  }
  const artifacts = await Promise.all(actual.map(async (file) => {
    const bytes = await readFile(path.join(directory, file));
    return { file, bytes: bytes.length, sha256: sha256(bytes) };
  }));
  return {
    artifactCount: artifacts.length,
    sha256: identityDigest(artifacts),
    artifacts,
  };
}

export function acceptanceIdentity(report) {
  return {
    schemaVersion: 1,
    format: "eliscript-core-acceptance-identity",
    version: 1,
    source: report.source,
    environment: report.environment,
    corpus: report.corpus,
    commands: report.commands.map((command) => ({
      id: command.id,
      argv: command.argv,
      timeoutMs: command.timeoutMs,
      status: command.status,
      exitCode: command.exitCode,
      timedOut: command.timedOut,
    })),
    artifacts: report.artifacts,
    criteria: report.criteria,
    applications: report.applications,
    summary: report.summary,
  };
}

function runIdentity(compiler, acceptance) {
  const acceptanceValue = acceptanceIdentity(acceptance);
  const acceptanceSha256 = identityDigest(acceptanceValue);
  const value = {
    compilerSha256: compiler.sha256,
    acceptanceSha256,
  };
  return {
    sha256: identityDigest(value),
    compilerSha256: compiler.sha256,
    acceptanceSha256,
    acceptanceValue,
  };
}

async function buildCompiler(root, iteration) {
  const directory = await mkdtemp(path.join(
    tmpdir(),
    `eliscript-determinism-${iteration}-`,
  ));
  try {
    const result = await capture([path.join(root, "bin/eliscript-bootstrap")], {
      cwd: root,
      env: {
        ...process.env,
        ELISCRIPT_BOOTSTRAP_OUT_DIR: directory,
      },
    });
    if (result.exitCode !== 0) {
      throw new RepeatedDeterminismError([
        `compiler build ${iteration} failed: ${result.stderr.trim() || result.stdout.trim()}`,
      ]);
    }
    return await compilerIdentity(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function runRepeatedDeterminism(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const iterations = options.iterations ?? REQUIRED_ITERATIONS;
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > 100) {
    throw new RepeatedDeterminismError([
      "iterations must be an integer between 1 and 100",
    ]);
  }

  const runs = [];
  let reference;
  for (let index = 1; index <= iterations; index += 1) {
    const compiler = await buildCompiler(root, index);
    const acceptance = await runAcceptanceCorpus({ root });
    const identity = runIdentity(compiler, acceptance);
    reference ??= identity;
    if (identity.sha256 !== reference.sha256) {
      throw new RepeatedDeterminismError([
        `iteration ${index} produced identity ${identity.sha256}, expected ${reference.sha256}`,
      ]);
    }
    runs.push({
      iteration: index,
      source: acceptance.source,
      compiler: {
        artifactCount: compiler.artifactCount,
        sha256: compiler.sha256,
      },
      acceptance: {
        criterionCount: acceptance.summary.criteria.total,
        artifactCount: acceptance.artifacts.length,
        corpusComplete: acceptance.summary.corpusComplete,
        operationalSuccess: acceptance.summary.operationalSuccess,
        acceptancePass: acceptance.summary.acceptancePass,
        sha256: identity.acceptanceSha256,
      },
      identitySha256: identity.sha256,
      observations: {
        generatedAt: acceptance.generatedAt,
        commands: acceptance.commands.map((command) => ({
          id: command.id,
          durationMs: command.durationMs,
          outputSha256: command.outputSha256,
        })),
      },
    });
    options.onIteration?.({
      iteration: index,
      iterations,
      identitySha256: identity.sha256,
    });
  }

  const allOperational = runs.every((run) =>
    run.source.cleanBefore && run.source.cleanAfter &&
    run.acceptance.corpusComplete && run.acceptance.operationalSuccess
  );
  const report = {
    schemaVersion: 1,
    format: REPEATED_DETERMINISM_FORMAT,
    version: REPEATED_DETERMINISM_VERSION,
    generatedAt: new Date().toISOString(),
    source: {
      commit: runs[0].source.commit,
      tree: runs[0].source.tree,
    },
    parameters: {
      iterations,
      requiredIterations: REQUIRED_ITERATIONS,
    },
    identityProjection: {
      format: IDENTITY_PROJECTION_FORMAT,
      version: IDENTITY_PROJECTION_VERSION,
      excludedObservations: EXCLUDED_OBSERVATIONS,
    },
    identity: {
      sha256: reference.sha256,
      compilerSha256: reference.compilerSha256,
      acceptanceSha256: reference.acceptanceSha256,
      compilerArtifactCount: runs[0].compiler.artifactCount,
      acceptanceArtifactCount: runs[0].acceptance.artifactCount,
      criterionCount: runs[0].acceptance.criterionCount,
    },
    runs,
    summary: {
      allIdentical: true,
      allOperational,
      acceptanceQualified:
        iterations === REQUIRED_ITERATIONS && allOperational,
    },
  };
  return validateRepeatedDeterminismReport(report);
}

export function validateRepeatedDeterminismReport(report, options = {}) {
  const errors = [];
  const requiredIterations = options.requiredIterations ?? REQUIRED_ITERATIONS;
  if (report?.schemaVersion !== 1 ||
      report?.format !== REPEATED_DETERMINISM_FORMAT ||
      report?.version !== REPEATED_DETERMINISM_VERSION) {
    errors.push("report identity is invalid");
  }
  if (!/^[0-9a-f]{40}$/u.test(report?.source?.commit ?? "") ||
      !/^[0-9a-f]{40}$/u.test(report?.source?.tree ?? "")) {
    errors.push("source commit and tree identities are invalid");
  }
  const iterations = report?.parameters?.iterations;
  if (!Number.isSafeInteger(iterations) || iterations < 1 ||
      report?.parameters?.requiredIterations !== requiredIterations ||
      report?.runs?.length !== iterations) {
    errors.push("iteration parameters and run inventory do not agree");
  }
  if (JSON.stringify(report?.identityProjection?.excludedObservations) !==
      JSON.stringify(EXCLUDED_OBSERVATIONS) ||
      report?.identityProjection?.format !== IDENTITY_PROJECTION_FORMAT ||
      report?.identityProjection?.version !== IDENTITY_PROJECTION_VERSION) {
    errors.push("identity projection does not declare the exact observations");
  }
  if (report?.identity?.compilerArtifactCount !== COMPILER_ARTIFACTS.length ||
      !Number.isSafeInteger(report?.identity?.acceptanceArtifactCount) ||
      report.identity.acceptanceArtifactCount < 1 ||
      !Number.isSafeInteger(report?.identity?.criterionCount) ||
      report.identity.criterionCount < 1) {
    errors.push("identity artifact counts are invalid");
  }
  const reference = report?.identity?.sha256;
  const recomputedReference = identityDigest({
    compilerSha256: report?.identity?.compilerSha256,
    acceptanceSha256: report?.identity?.acceptanceSha256,
  });
  if (reference !== recomputedReference) {
    errors.push("combined identity digest cannot be reproduced");
  }
  for (let index = 0; index < (report?.runs?.length ?? 0); index += 1) {
    const run = report.runs[index];
    if (run.iteration !== index + 1 ||
        run.source?.commit !== report.source.commit ||
        run.source?.tree !== report.source.tree ||
        run.source?.cleanBefore !== true || run.source?.cleanAfter !== true) {
      errors.push(`run ${index + 1} has invalid source identity or cleanliness`);
    }
    if (run.compiler?.artifactCount !== COMPILER_ARTIFACTS.length ||
        run.compiler?.sha256 !== report.identity.compilerSha256 ||
        run.acceptance?.artifactCount !== report.identity.acceptanceArtifactCount ||
        run.acceptance?.criterionCount !== report.identity.criterionCount ||
        run.acceptance?.corpusComplete !== true ||
        run.acceptance?.operationalSuccess !== true ||
        run.acceptance?.sha256 !== report.identity.acceptanceSha256 ||
        run.identitySha256 !== reference) {
      errors.push(`run ${index + 1} does not match the declared identity`);
    }
  }
  const qualified = iterations === requiredIterations &&
    report?.runs?.length === requiredIterations && errors.length === 0;
  if (report?.summary?.allIdentical !== true ||
      report?.summary?.allOperational !== true ||
      report?.summary?.acceptanceQualified !== qualified) {
    errors.push("summary is not derived from the complete run inventory");
  }
  if (errors.length > 0) throw new RepeatedDeterminismError(errors);
  return report;
}

export function humanRepeatedDeterminismReport(report) {
  return [
    "# Repeated Determinism Run",
    "",
    `- Source commit: \`${report.source.commit}\``,
    `- Source tree: \`${report.source.tree}\``,
    `- Iterations: ${report.parameters.iterations}/${report.parameters.requiredIterations}`,
    `- Compiler artifacts per iteration: ${report.identity.compilerArtifactCount}`,
    `- Acceptance artifacts per iteration: ${report.identity.acceptanceArtifactCount}`,
    `- Mandatory criteria per iteration: ${report.identity.criterionCount}`,
    `- Identity SHA-256: \`${report.identity.sha256}\``,
    `- All identical: ${report.summary.allIdentical ? "yes" : "no"}`,
    `- All operational: ${report.summary.allOperational ? "yes" : "no"}`,
    `- Acceptance qualified: ${report.summary.acceptanceQualified ? "yes" : "no"}`,
    "",
    "Timing, command-output digests, summaries, and temporary directories are",
    "observations outside artifact identity by the versioned projection schema.",
    "",
    "| Run | Compiler SHA-256 | Acceptance SHA-256 | Identity SHA-256 |",
    "| ---: | --- | --- | --- |",
    ...report.runs.map((run) =>
      `| ${run.iteration} | \`${run.compiler.sha256}\` | \`${run.acceptance.sha256}\` | \`${run.identitySha256}\` |`),
    "",
  ].join("\n");
}

async function writeReport(report, jsonOutput, markdownOutput, root) {
  const jsonPath = path.resolve(root, jsonOutput);
  const markdownPath = path.resolve(root, markdownOutput);
  await mkdir(path.dirname(jsonPath), { recursive: true });
  await mkdir(path.dirname(markdownPath), { recursive: true });
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, humanRepeatedDeterminismReport(report));
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--run") options.run = true;
    else if (argument === "--verify") options.verify = true;
    else if (["--iterations", "--json-output", "--markdown-output",
      "--json-report", "--markdown-report"].includes(argument)) {
      const value = argv[index + 1];
      if (!value) throw new RepeatedDeterminismError([`${argument} requires a value`]);
      const key = {
        "--iterations": "iterations",
        "--json-output": "jsonOutput",
        "--markdown-output": "markdownOutput",
        "--json-report": "jsonReport",
        "--markdown-report": "markdownReport",
      }[argument];
      options[key] = argument === "--iterations" ? Number(value) : value;
      index += 1;
    } else {
      throw new RepeatedDeterminismError([`unknown argument ${argument}`]);
    }
  }
  if (options.run === options.verify) {
    throw new RepeatedDeterminismError(["choose exactly one of --run or --verify"]);
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.run) {
    if (!options.jsonOutput || !options.markdownOutput) {
      throw new RepeatedDeterminismError([
        "--run requires --json-output and --markdown-output",
      ]);
    }
    const report = await runRepeatedDeterminism({
      iterations: options.iterations,
      onIteration: ({ iteration, iterations, identitySha256 }) => {
        process.stderr.write(
          `Repeated determinism: ${iteration}/${iterations} matched ${identitySha256}\n`,
        );
      },
    });
    await writeReport(
      report,
      options.jsonOutput,
      options.markdownOutput,
      DEFAULT_ROOT,
    );
    process.stdout.write(`${humanRepeatedDeterminismReport(report)}\n`);
    return;
  }
  if (!options.jsonReport || !options.markdownReport) {
    throw new RepeatedDeterminismError([
      "--verify requires --json-report and --markdown-report",
    ]);
  }
  const report = validateRepeatedDeterminismReport(JSON.parse(
    await readFile(path.resolve(DEFAULT_ROOT, options.jsonReport), "utf8"),
  ));
  const markdown = await readFile(
    path.resolve(DEFAULT_ROOT, options.markdownReport),
    "utf8",
  );
  if (markdown !== humanRepeatedDeterminismReport(report)) {
    throw new RepeatedDeterminismError([
      "Markdown report does not match the machine-readable report",
    ]);
  }
  process.stdout.write(
    `Repeated determinism verified: ${report.runs.length}/${REQUIRED_ITERATIONS} identical clean runs\n`,
  );
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  }
}
