#!/usr/bin/env bun

import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(moduleDirectory, "../..");
const CONTRACT_FILE = "contracts/documentation.json";
const EXPECTED_DOCUMENTS = [
  ["getting-started", "docs/getting-started.md"],
  ["language-reference", "docs/language-reference.md"],
  ["macros", "docs/macros.md"],
  ["javascript-interop", "docs/javascript-interop.md"],
  ["project-configuration", "docs/project-configuration.md"],
  ["compiler-architecture", "compiler/README.md"],
  ["emacs-mode", "editor/README.md"],
  ["terminal-repl", "docs/repl.md"],
  ["worker", "tools/worker/README.md"],
  ["troubleshooting", "docs/troubleshooting.md"],
  ["contributing", "CONTRIBUTING.md"],
];
const EXPECTED_SNIPPETS = [
  ["language-values", "language-reference", "elisp", "module"],
  ["macro-expansion", "macros", "elisp", "module"],
  ["host-containers", "javascript-interop", "elisp", "module"],
  ["project-config", "project-configuration", "json", "project-config"],
  ["persistent-repl", "terminal-repl", "text", "repl"],
];

export class DocumentationValidationError extends Error {
  constructor(errors) {
    super(`documentation validation failed:\n- ${errors.join("\n- ")}`);
    this.name = "DocumentationValidationError";
    this.errors = errors;
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeRelativePath(value) {
  return typeof value === "string" && value.length > 0 &&
    !path.isAbsolute(value) && !value.split("/").includes("..") &&
    path.posix.normalize(value) === value;
}

function uniqueStrings(values) {
  return Array.isArray(values) && values.length > 0 &&
    values.every((value) => typeof value === "string" && value.length > 0) &&
    new Set(values).size === values.length;
}

function equal(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function validateDocumentationContract(contract) {
  const errors = [];
  if (!isPlainObject(contract) || contract.schemaVersion !== 1 ||
      contract.format !== "eliscript-documentation-contract" ||
      contract.version !== 2) {
    throw new DocumentationValidationError([
      "contract must use eliscript-documentation-contract version 2",
    ]);
  }

  if (!Array.isArray(contract.documents) ||
      !equal(contract.documents.map((document) => [document?.id, document?.file]),
        EXPECTED_DOCUMENTS)) {
    errors.push("documents must contain the exact ordered AC-23 core inventory");
  } else {
    for (const [index, document] of contract.documents.entries()) {
      if (!isPlainObject(document) || !safeRelativePath(document.file) ||
          !uniqueStrings(document.requiredSections) ||
          !uniqueStrings(document.requiredLiterals)) {
        errors.push(`document ${index} must declare a valid file sections and literals`);
      }
    }
  }

  if (!Array.isArray(contract.snippets) ||
      !equal(contract.snippets.map((snippet) => [
        snippet?.id,
        snippet?.document,
        snippet?.language,
        snippet?.kind,
      ]), EXPECTED_SNIPPETS)) {
    errors.push("snippets must contain the exact ordered executable inventory");
  } else {
    for (const [index, snippet] of contract.snippets.entries()) {
      if (!isPlainObject(snippet)) {
        errors.push(`snippet ${index} must be an object`);
        continue;
      }
      if (snippet.kind === "module" &&
          (!equal(snippet.runtimes, ["bun", "node"]) ||
            typeof snippet.expectedStdout !== "string")) {
        errors.push(`snippet ${snippet.id} must execute under Bun and Node with expected stdout`);
      }
      if (snippet.kind === "repl" &&
          typeof snippet.expectedStdout !== "string") {
        errors.push(`snippet ${snippet.id} must declare expected stdout`);
      }
      if (snippet.kind === "project-config" &&
          (snippet.expectedStdout !== undefined || snippet.runtimes !== undefined)) {
        errors.push(`snippet ${snippet.id} is validation-only`);
      }
    }
  }

  if (!Array.isArray(contract.entryPoints) || contract.entryPoints.length !== 12) {
    errors.push("entryPoints must contain README plus every documentation-hub link");
  } else {
    for (const [index, entry] of contract.entryPoints.entries()) {
      if (!isPlainObject(entry) || !safeRelativePath(entry.file) ||
          typeof entry.literal !== "string" || entry.literal.length === 0) {
        errors.push(`entry point ${index} must declare a valid file and literal`);
      }
    }
  }

  if (errors.length > 0) throw new DocumentationValidationError(errors);
  return contract;
}

function secondLevelHeadings(source) {
  return [...source.matchAll(/^## ([^\n]+)$/gmu)].map((match) => match[1]);
}

function localLinkTargets(source) {
  const targets = [];
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/gmu)) {
    const raw = match[1].trim().replace(/^<|>$/g, "");
    if (raw.startsWith("#") || /^[a-z][a-z0-9+.-]*:/iu.test(raw)) continue;
    const target = raw.split("#", 1)[0].split("?", 1)[0];
    if (target.length > 0) targets.push(decodeURIComponent(target));
  }
  return targets;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSnippet(source, id, language, errors) {
  const marker = `<!-- eliscript-snippet:${id} -->`;
  const occurrences = source.split(marker).length - 1;
  if (occurrences !== 1) {
    errors.push(`snippet ${id} marker must occur exactly once`);
    return null;
  }
  const expression = new RegExp(
    `${escapeRegExp(marker)}\\s*\\n\`\`\`${escapeRegExp(language)}\\n([\\s\\S]*?)\\n\`\`\``,
    "u",
  );
  const match = expression.exec(source);
  if (!match) {
    errors.push(`snippet ${id} must be followed by a ${language} fence`);
    return null;
  }
  return `${match[1]}\n`;
}

async function runCommand(root, argv, options = {}) {
  const child = Bun.spawn(argv, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...(options.env ?? {}) },
    stdin: options.stdin === undefined ? "ignore" : "pipe",
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
  if (options.stdin !== undefined) {
    child.stdin.write(options.stdin);
    child.stdin.end();
  }
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  clearTimeout(timer);
  clearTimeout(forceKillTimer);
  return { argv, exitCode, timedOut, stdout, stderr };
}

function requireCommand(result, expectedStdout, label) {
  if (result.exitCode !== 0 || result.timedOut || result.stderr !== "" ||
      result.stdout !== expectedStdout) {
    throw new Error(`${label} failed: ${result.stderr.trim() ||
      `expected ${JSON.stringify(expectedStdout)}, received ${JSON.stringify(result.stdout)}`}`);
  }
}

function validateProjectConfiguration(source) {
  const value = JSON.parse(source);
  const expected = {
    schemaVersion: 1,
    sourceRoot: "src",
    entry: "main.eli",
    outDir: "dist",
  };
  if (!equal(value, expected)) {
    throw new Error("project-config must match the documented version 1 request");
  }
  return 1;
}

async function executeSnippets(root, contract, sources) {
  const directory = await mkdtemp(path.join(root, ".eliscript-docs-"));
  let executions = 0;
  try {
    for (const snippet of contract.snippets) {
      const document = contract.documents.find((candidate) =>
        candidate.id === snippet.document);
      const source = extractSnippet(
        sources.get(document.file),
        snippet.id,
        snippet.language,
        [],
      );
      if (snippet.kind === "project-config") {
        executions += validateProjectConfiguration(source);
        continue;
      }
      if (snippet.kind === "repl") {
        const result = await runCommand(root, [
          "./bin/eliscript-eval", "--repl", "--root", directory, "--no-prompt",
        ], { stdin: source, timeoutMs: 60_000 });
        requireCommand(result, snippet.expectedStdout, snippet.id);
        executions += 1;
        continue;
      }

      const input = path.join(directory, `${snippet.id}.eli`);
      const output = path.join(directory, `${snippet.id}.mjs`);
      await writeFile(input, source);
      const compiled = await runCommand(root, [
        "./bin/eliscript", "--output", output, input,
      ], { timeoutMs: 120_000 });
      if (compiled.exitCode !== 0 || compiled.timedOut) {
        throw new Error(`${snippet.id} compilation failed: ${compiled.stderr.trim()}`);
      }
      for (const runtime of snippet.runtimes) {
        const result = await runCommand(root, [runtime, output]);
        requireCommand(result, snippet.expectedStdout, `${snippet.id}/${runtime}`);
        executions += 1;
      }
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
  return executions;
}

export async function checkDocumentation(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const sourceOverrides = options.sourceOverrides ?? {};
  const contract = validateDocumentationContract(options.contract ?? JSON.parse(
    await readFile(path.join(root, CONTRACT_FILE), "utf8"),
  ));
  const errors = [];
  const sources = new Map();
  let sectionCount = 0;
  let literalCount = 0;
  let linkCount = 0;

  for (const document of contract.documents) {
    let source;
    try {
      source = sourceOverrides[document.file] ??
        await readFile(path.join(root, document.file), "utf8");
      sources.set(document.file, source);
    } catch (error) {
      errors.push(`${document.file} cannot be read: ${error.code ?? error.message}`);
      continue;
    }
    const headings = secondLevelHeadings(source);
    let previousIndex = -1;
    for (const section of document.requiredSections) {
      const index = headings.indexOf(section);
      if (index < 0) {
        errors.push(`${document.file} is missing section: ${section}`);
      } else if (index <= previousIndex) {
        errors.push(`${document.file} section is out of contract order: ${section}`);
      } else {
        previousIndex = index;
        sectionCount += 1;
      }
    }
    for (const literal of document.requiredLiterals) {
      if (!source.includes(literal)) {
        errors.push(`${document.file} is missing required text: ${literal}`);
      } else {
        literalCount += 1;
      }
    }
    for (const target of localLinkTargets(source)) {
      const resolved = path.resolve(path.dirname(path.join(root, document.file)), target);
      if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
        errors.push(`${document.file} link escapes the repository: ${target}`);
        continue;
      }
      try {
        if (!(await stat(resolved)).isFile()) {
          errors.push(`${document.file} link is not a regular file: ${target}`);
        } else {
          linkCount += 1;
        }
      } catch (error) {
        errors.push(`${document.file} has broken local link: ${target}`);
      }
    }
  }

  for (const entry of contract.entryPoints) {
    let source;
    try {
      source = sourceOverrides[entry.file] ?? sources.get(entry.file) ??
        await readFile(path.join(root, entry.file), "utf8");
    } catch (error) {
      errors.push(`${entry.file} cannot be read: ${error.code ?? error.message}`);
      continue;
    }
    if (!source.includes(entry.literal)) {
      errors.push(`${entry.file} is missing documentation entry point: ${entry.literal}`);
    }
  }

  for (const snippet of contract.snippets) {
    const document = contract.documents.find((candidate) =>
      candidate.id === snippet.document);
    const source = document ? sources.get(document.file) : undefined;
    if (source) extractSnippet(source, snippet.id, snippet.language, errors);
  }

  if (errors.length > 0) throw new DocumentationValidationError(errors);
  let executionCount;
  try {
    executionCount = await executeSnippets(root, contract, sources);
  } catch (error) {
    throw new DocumentationValidationError([error.message]);
  }
  return {
    schemaVersion: 1,
    format: "eliscript-documentation-report",
    version: 2,
    documents: contract.documents.length,
    sections: sectionCount,
    requiredLiterals: literalCount,
    localLinks: linkCount,
    snippets: contract.snippets.length,
    executions: executionCount,
    entryPoints: contract.entryPoints.length,
    applicationsContribute: false,
  };
}

export function humanDocumentationReport(report) {
  return [
    "Core documentation contract:",
    `  Documents     ${report.documents}`,
    `  Sections      ${report.sections}`,
    `  Required text ${report.requiredLiterals}`,
    `  Local links   ${report.localLinks}`,
    `  Snippets      ${report.snippets} / ${report.executions} executions`,
    `  Entry points  ${report.entryPoints}`,
    `  Applications  ${report.applicationsContribute ? "included" : "excluded"}`,
  ].join("\n");
}

const invokedFilename = process.argv[1] ? path.resolve(process.argv[1]) : undefined;
if (invokedFilename === fileURLToPath(import.meta.url)) {
  try {
    const report = await checkDocumentation();
    console.log(humanDocumentationReport(report));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
