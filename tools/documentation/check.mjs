import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(moduleDirectory, "../..");
const CONTRACT_FILE = "contracts/documentation.json";

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
    !path.isAbsolute(value) &&
    !value.split("/").includes("..") &&
    path.posix.normalize(value) === value;
}

function uniqueStrings(values) {
  return Array.isArray(values) && values.length > 0 &&
    values.every((value) => typeof value === "string" && value.length > 0) &&
    new Set(values).size === values.length;
}

export function validateDocumentationContract(contract) {
  const errors = [];
  if (!isPlainObject(contract) || contract.schemaVersion !== 1 ||
      contract.format !== "eliscript-documentation-contract" ||
      contract.version !== 1) {
    throw new DocumentationValidationError([
      "contract must use eliscript-documentation-contract version 1",
    ]);
  }

  if (!Array.isArray(contract.guides) || contract.guides.length === 0) {
    errors.push("guides must be a non-empty array");
  } else {
    const ids = [];
    const files = [];
    for (const [index, guide] of contract.guides.entries()) {
      if (!isPlainObject(guide) || typeof guide.id !== "string" ||
          guide.id.length === 0 || !safeRelativePath(guide.file) ||
          !uniqueStrings(guide.requiredSections) ||
          !uniqueStrings(guide.requiredLiterals)) {
        errors.push(`guide ${index} must declare a valid id file sections and literals`);
        continue;
      }
      ids.push(guide.id);
      files.push(guide.file);
    }
    if (new Set(ids).size !== ids.length || new Set(files).size !== files.length) {
      errors.push("guide ids and files must be unique");
    }
  }

  if (!Array.isArray(contract.entryPoints) ||
      contract.entryPoints.length === 0) {
    errors.push("entryPoints must be a non-empty array");
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

export async function checkDocumentation(options = {}) {
  const root = path.resolve(options.root ?? DEFAULT_ROOT);
  const contract = validateDocumentationContract(options.contract ?? JSON.parse(
    await readFile(path.join(root, CONTRACT_FILE), "utf8"),
  ));
  const errors = [];
  let sectionCount = 0;
  let literalCount = 0;

  for (const guide of contract.guides) {
    let source;
    try {
      source = await readFile(path.join(root, guide.file), "utf8");
    } catch (error) {
      errors.push(`${guide.file} cannot be read: ${error.code ?? error.message}`);
      continue;
    }
    const headings = secondLevelHeadings(source);
    let previousIndex = -1;
    for (const section of guide.requiredSections) {
      const index = headings.indexOf(section);
      if (index < 0) {
        errors.push(`${guide.file} is missing section: ${section}`);
      } else if (index <= previousIndex) {
        errors.push(`${guide.file} section is out of contract order: ${section}`);
      } else {
        previousIndex = index;
        sectionCount += 1;
      }
    }
    for (const literal of guide.requiredLiterals) {
      if (!source.includes(literal)) {
        errors.push(`${guide.file} is missing required text: ${literal}`);
      } else {
        literalCount += 1;
      }
    }
  }

  for (const entry of contract.entryPoints) {
    let source;
    try {
      source = await readFile(path.join(root, entry.file), "utf8");
    } catch (error) {
      errors.push(`${entry.file} cannot be read: ${error.code ?? error.message}`);
      continue;
    }
    if (!source.includes(entry.literal)) {
      errors.push(`${entry.file} is missing documentation entry point: ${entry.literal}`);
    }
  }

  if (errors.length > 0) throw new DocumentationValidationError(errors);
  return {
    schemaVersion: 1,
    format: "eliscript-documentation-report",
    version: 1,
    guides: contract.guides.length,
    sections: sectionCount,
    requiredLiterals: literalCount,
    entryPoints: contract.entryPoints.length,
  };
}

export function humanDocumentationReport(report) {
  return [
    "Documentation contract:",
    `  Guides        ${report.guides}`,
    `  Sections      ${report.sections}`,
    `  Required text ${report.requiredLiterals}`,
    `  Entry points  ${report.entryPoints}`,
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
