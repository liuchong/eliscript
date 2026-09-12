import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(moduleDirectory, "../..");
const matrixPath = "contracts/compatibility-matrix.json";

export class CompatibilityMatrixError extends Error {
  constructor(errors) {
    super(`compatibility matrix validation failed:\n- ${errors.join("\n- ")}`);
    this.name = "CompatibilityMatrixError";
    this.errors = errors;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sortedUnique(values, label, errors) {
  const expected = [...new Set(values)].sort();
  if (JSON.stringify(values) !== JSON.stringify(expected)) {
    errors.push(`${label} must be unique and lexicographically sorted`);
  }
}

function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0 &&
    !path.isAbsolute(value) &&
    !value.split("/").includes("..") &&
    path.posix.normalize(value) === value;
}

function actionMap(matrix, errors) {
  if (!Array.isArray(matrix.actions)) {
    errors.push("actions must be an array");
    return new Map();
  }

  const ids = matrix.actions.map((action) => action?.id);
  sortedUnique(ids, "action ids", errors);
  const actions = new Map();
  for (const [index, action] of matrix.actions.entries()) {
    const label = `action ${index}`;
    if (!isPlainObject(action)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    if (!/^[a-z0-9-]+\/[a-z0-9-]+$/i.test(action.repository ?? "")) {
      errors.push(`${label} must declare a GitHub repository`);
    }
    if (!/^[0-9a-f]{40}$/.test(action.revision ?? "")) {
      errors.push(`${label} revision must be a full lowercase commit SHA`);
    }
    if (typeof action.label !== "string" || action.label.length === 0) {
      errors.push(`${label} must declare its inspected label`);
    }
    actions.set(action.id, action);
  }

  for (const id of ["checkout", "setup-bun", "setup-emacs"]) {
    if (!actions.has(id)) errors.push(`missing required action ${id}`);
  }
  return actions;
}

export function validateCompatibilityMatrix(matrix) {
  const errors = [];
  if (!isPlainObject(matrix)) {
    throw new CompatibilityMatrixError(["matrix must be an object"]);
  }
  if (matrix.schemaVersion !== 1 ||
      matrix.format !== "eliscript-compatibility-matrix" ||
      matrix.version !== 1) {
    errors.push("matrix must use eliscript-compatibility-matrix version 1");
  }
  if (matrix.workflow !== ".github/workflows/compatibility.yml") {
    errors.push("workflow must be .github/workflows/compatibility.yml");
  }

  const systems = Array.isArray(matrix.operatingSystems)
    ? matrix.operatingSystems
    : [];
  if (systems.length === 0) errors.push("operatingSystems must not be empty");
  const systemIds = [];
  for (const [index, system] of systems.entries()) {
    const label = `operating system ${index}`;
    if (!isPlainObject(system)) {
      errors.push(`${label} must be an object`);
      continue;
    }
    systemIds.push(system.id);
    if (!/^[a-z][a-z0-9-]*$/.test(system.id ?? "")) {
      errors.push(`${label} id must be a lowercase identifier`);
    }
    if (typeof system.runner !== "string" || system.runner.length === 0) {
      errors.push(`${label} must declare a runner`);
    }
    if (!new Set(["x64", "arm64"]).has(system.architecture)) {
      errors.push(`${label} must declare x64 or arm64 architecture`);
    }
  }
  sortedUnique(systemIds, "operating system ids", errors);
  if (!systemIds.includes("linux") || !systemIds.includes("macos")) {
    errors.push("operatingSystems must include linux and macos");
  }

  const acceptanceSystemIds = Array.isArray(matrix.acceptanceOperatingSystems)
    ? matrix.acceptanceOperatingSystems
    : [];
  if (acceptanceSystemIds.length === 0 ||
      acceptanceSystemIds.some((id) => typeof id !== "string")) {
    errors.push("acceptanceOperatingSystems must be a non-empty string array");
  }
  sortedUnique(acceptanceSystemIds, "acceptance operating system ids", errors);
  for (const id of acceptanceSystemIds) {
    if (!systemIds.includes(id)) {
      errors.push(`acceptance operating system ${id} must exist in operatingSystems`);
    }
  }
  const acceptanceSystems = systems.filter((system) =>
    acceptanceSystemIds.includes(system.id));

  const emacsVersions = Array.isArray(matrix.emacsVersions)
    ? matrix.emacsVersions
    : [];
  if (emacsVersions.length === 0 ||
      emacsVersions.some((version) => !/^\d+\.\d+$/.test(version))) {
    errors.push("emacsVersions must contain major.minor release strings");
  }
  sortedUnique(emacsVersions, "Emacs versions", errors);
  const emacsMajors = new Set(emacsVersions.map((version) => version.split(".")[0]));
  if (!emacsMajors.has("29") || !emacsMajors.has("30")) {
    errors.push("emacsVersions must cover Emacs 29 and Emacs 30");
  }

  if (!isPlainObject(matrix.javascriptHost) ||
      matrix.javascriptHost.name !== "bun" ||
      !/^\d+\.\d+\.\d+$/.test(matrix.javascriptHost.version ?? "")) {
    errors.push("javascriptHost must declare an exact Bun version");
  }

  const localEvidence = matrix.localEvidence;
  if (!isPlainObject(localEvidence)) {
    errors.push("localEvidence must declare direct local matrix evidence");
  } else {
    if (!safeRelativePath(localEvidence.directory) ||
        localEvidence.directory !== "acceptance/matrix") {
      errors.push("localEvidence directory must be acceptance/matrix");
    }
    if (!isPlainObject(localEvidence.nodeHost) ||
        localEvidence.nodeHost.name !== "node" ||
        !/^\d+\.\d+\.\d+$/.test(localEvidence.nodeHost.version ?? "")) {
      errors.push("localEvidence nodeHost must declare an exact Node version");
    }
  }

  const actions = actionMap(matrix, errors);
  const commands = Array.isArray(matrix.commands) ? matrix.commands : [];
  const requiredCommands = [
    "bun install --frozen-lockfile",
    "bun run test",
    "make byte-compile",
  ];
  if (JSON.stringify(commands) !== JSON.stringify(requiredCommands)) {
    errors.push(`commands must be ${requiredCommands.join(", ")}`);
  }
  const timeouts = localEvidence?.timeoutsMs;
  if (!isPlainObject(timeouts) ||
      JSON.stringify(Object.keys(timeouts)) !== JSON.stringify(requiredCommands) ||
      requiredCommands.some((command) =>
        !Number.isInteger(timeouts[command]) || timeouts[command] < 60_000)) {
    errors.push("localEvidence timeoutsMs must cover every command with bounded values");
  }

  if (errors.length > 0) throw new CompatibilityMatrixError(errors);
  return {
    schemaVersion: 1,
    systems,
    acceptanceSystems,
    emacsVersions,
    javascriptHost: matrix.javascriptHost,
    localEvidence,
    actions,
    commands,
    jobs: systems.length * emacsVersions.length,
    acceptanceJobs: acceptanceSystems.length * emacsVersions.length,
    workflow: matrix.workflow,
  };
}

function workflowJobRows(validated) {
  return validated.systems.flatMap((system) =>
    validated.emacsVersions.map((emacsVersion) => [
      "          - name: " + `${system.id}-emacs-${emacsVersion}`,
      "            os: " + system.runner,
      "            architecture: " + system.architecture,
      `            emacs: \"${emacsVersion}\"`,
    ].join("\n"))
  ).join("\n");
}

export function renderWorkflow(matrix) {
  const validated = validateCompatibilityMatrix(matrix);
  const checkout = validated.actions.get("checkout");
  const setupBun = validated.actions.get("setup-bun");
  const setupEmacs = validated.actions.get("setup-emacs");
  const commandSteps = validated.commands.map((command) => {
    const names = {
      "bun install --frozen-lockfile": "Install locked dependencies",
      "bun run test": "Run complete test suite",
      "make byte-compile": "Strict byte compilation",
    };
    return `      - name: ${names[command]}\n        run: ${command}`;
  }).join("\n");

  return `# Generated by tools/ci/render-workflow.mjs from contracts/compatibility-matrix.json.\n` +
`# Run \`bun tools/ci/render-workflow.mjs --write\` after changing the contract.\n` +
`name: Compatibility\n\n` +
`on:\n` +
`  push:\n` +
`    branches: [master]\n` +
`  pull_request:\n` +
`  workflow_dispatch:\n\n` +
`permissions:\n` +
`  contents: read\n\n` +
`concurrency:\n` +
`  group: compatibility-\${{ github.workflow }}-\${{ github.ref }}\n` +
`  cancel-in-progress: true\n\n` +
`jobs:\n` +
`  test:\n` +
`    name: \${{ matrix.name }}\n` +
`    runs-on: \${{ matrix.os }}\n` +
`    timeout-minutes: 30\n` +
`    strategy:\n` +
`      fail-fast: false\n` +
`      matrix:\n` +
`        include:\n` +
`${workflowJobRows(validated)}\n` +
`    steps:\n` +
`      - name: Check out repository\n` +
`        uses: ${checkout.repository}@${checkout.revision} # ${checkout.label}\n` +
`        with:\n` +
`          persist-credentials: false\n` +
`      - name: Install Emacs\n` +
`        uses: ${setupEmacs.repository}@${setupEmacs.revision} # ${setupEmacs.label}\n` +
`        with:\n` +
`          version: \${{ matrix.emacs }}\n` +
`      - name: Install Bun\n` +
`        uses: ${setupBun.repository}@${setupBun.revision} # ${setupBun.label}\n` +
`        with:\n` +
`          bun-version: ${validated.javascriptHost.version}\n` +
`      - name: Record toolchain\n` +
`        run: |\n` +
`          uname -a\n` +
`          emacs --version\n` +
`          bun --version\n` +
`${commandSteps}\n`;
}

export async function checkCompatibilityWorkflow(options = {}) {
  const root = options.root ?? defaultRoot;
  const matrix = options.matrix ?? JSON.parse(
    await readFile(path.join(root, matrixPath), "utf8"),
  );
  const validated = validateCompatibilityMatrix(matrix);
  const expected = renderWorkflow(matrix);
  const workflowText = options.workflowText ?? await readFile(
    path.join(root, validated.workflow), "utf8",
  );
  if (workflowText !== expected) {
    throw new CompatibilityMatrixError([
      `${validated.workflow} differs from the compatibility matrix; run the renderer with --write`,
    ]);
  }
  return {
    schemaVersion: 1,
    systems: validated.systems.map(({ id, architecture, runner }) => ({
      id, architecture, runner,
    })),
    acceptanceSystems: validated.acceptanceSystems.map(
      ({ id, architecture, runner }) => ({ id, architecture, runner }),
    ),
    emacsVersions: validated.emacsVersions,
    javascriptHost: validated.javascriptHost,
    nodeHost: validated.localEvidence.nodeHost,
    localEvidenceDirectory: validated.localEvidence.directory,
    jobs: validated.jobs,
    acceptanceJobs: validated.acceptanceJobs,
    workflow: validated.workflow,
  };
}

export function humanCompatibilityReport(report) {
  const systems = report.systems
    .map((system) => `${system.id}/${system.architecture}`)
    .join(", ");
  const acceptanceSystems = report.acceptanceSystems
    .map((system) => `${system.id}/${system.architecture}`)
    .join(", ");
  return [
    "Compatibility matrix:",
    `  Systems        ${systems}`,
    `  Acceptance     ${acceptanceSystems}`,
    `  Emacs          ${report.emacsVersions.join(", ")}`,
    `  JS host        ${report.javascriptHost.name} ${report.javascriptHost.version}`,
    `  Node host      ${report.nodeHost.name} ${report.nodeHost.version}`,
    `  Matrix jobs    ${report.jobs}`,
    `  Required jobs  ${report.acceptanceJobs}`,
    `  Local evidence ${report.localEvidenceDirectory}`,
    `  Workflow       ${report.workflow}`,
  ].join("\n");
}

const invokedFilename = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedFilename === fileURLToPath(import.meta.url)) {
  const args = new Set(process.argv.slice(2));
  try {
    const matrix = JSON.parse(
      await readFile(path.join(defaultRoot, matrixPath), "utf8"),
    );
    const validated = validateCompatibilityMatrix(matrix);
    if (args.has("--write")) {
      await writeFile(
        path.join(defaultRoot, validated.workflow),
        renderWorkflow(matrix),
        "utf8",
      );
    }
    const report = await checkCompatibilityWorkflow({ root: defaultRoot, matrix });
    console.log(args.has("--json")
      ? JSON.stringify(report, null, 2)
      : humanCompatibilityReport(report));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
