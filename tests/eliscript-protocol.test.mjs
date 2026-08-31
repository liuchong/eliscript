import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const source = resolve(root, "stdlib/core/protocol.eli");
const seedCompiler = resolve(root, "bin/eliscript");
const bootstrapBuilder = resolve(root, "bin/eliscript-bootstrap");
const selfHostedCompiler = resolve(root, "bin/eliscript-portable");
const hostFixture = resolve(
  root,
  "tests/fixtures/eliscript-protocol-host.mjs",
);
const committedImplementation = resolve(
  root,
  "runtime/core/protocol-impl.mjs",
);
const committedFacade = resolve(root, "runtime/core/protocol.mjs");
const bun = process.execPath;
const node = process.env.NODE_BINARY ?? "node";

async function run(command, environment = {}) {
  const child = Bun.spawn(command, {
    cwd: root,
    env: {
      ...process.env,
      BUN: bun,
      EMACS: process.env.EMACS ?? "emacs",
      ...environment,
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() ||
      `${command[0]} exited with ${exitCode}`);
  }
  return stdout;
}

async function compile(compiler, output, environment = {}) {
  await mkdir(dirname(output), { recursive: true });
  await run([
    compiler,
    "--source-map",
    "--output",
    output,
    source,
  ], environment);
}

async function execute(host, modulePath) {
  return JSON.parse(await run([host, hostFixture, modulePath]));
}

function canonicalSourceMap(sourceMap) {
  return { ...JSON.parse(sourceMap), sources: ["<protocol-source>"] };
}

test("Eliscript-authored protocol policy preserves open dispatch semantics", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-protocol-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedRoot = resolve(directory, "seed");
  const selfHostedRoot = resolve(directory, "self-hosted");
  const seed = resolve(seedRoot, "stdlib/core/protocol-impl.mjs");
  const selfHosted = resolve(
    selfHostedRoot,
    "stdlib/core/protocol-impl.mjs",
  );

  try {
    await Promise.all([
      mkdir(seedRoot, { recursive: true }),
      mkdir(selfHostedRoot, { recursive: true }),
    ]);
    await Promise.all([
      symlink(resolve(root, "runtime"), resolve(seedRoot, "runtime"), "dir"),
      symlink(
        resolve(root, "runtime"),
        resolve(selfHostedRoot, "runtime"),
        "dir",
      ),
    ]);
    await compile(seedCompiler, seed);
    await run([bootstrapBuilder], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });
    await compile(selfHostedCompiler, selfHosted, {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
    });

    expect(await readFile(selfHosted, "utf8"))
      .toBe(await readFile(seed, "utf8"));
    expect(await readFile(`${selfHosted}.map`, "utf8"))
      .toBe(await readFile(`${seed}.map`, "utf8"));

    const generated = await readFile(seed, "utf8");
    const committed = await readFile(committedImplementation, "utf8");
    expect(generated).toBe(committed);
    expect(canonicalSourceMap(await readFile(`${seed}.map`, "utf8")))
      .toEqual(canonicalSourceMap(
        await readFile(`${committedImplementation}.map`, "utf8"),
      ));
    expect(generated).toContain("function define_protocol(name, operations)");
    expect(generated).toContain("const protocol_states = new WeakMap()");
    expect(generated).not.toContain("Runtime.defineProtocol");
    expect(generated).not.toContain("Runtime.extendProtocol");
    expect(generated).not.toContain("vite");
    expect(generated).not.toContain("react");

    const facade = await readFile(committedFacade, "utf8");
    expect(facade).toContain('from "./protocol-impl.mjs"');
    expect(facade).toContain('from "./protocol-error.mjs"');
    expect(facade).not.toContain("new WeakMap");
    expect(facade).not.toContain("function dispatch");

    const reports = await Promise.all([
      execute(bun, seed),
      execute(node, seed),
      execute(bun, selfHosted),
      execute(node, selfHosted),
      execute(bun, committedImplementation),
      execute(node, committedImplementation),
    ]);
    for (const report of reports) expect(report).toEqual(reports[0]);
    expect(reports[0]).toEqual({
      frozen: [true, true, true],
      metadata: [true, "read", true],
      dispatch: {
        direct: ["direct:alpha", 5, true],
        exact: ["exact:beta", 4, true],
        category: ["category:remote", 0],
        fallback: ["default:7", -1],
        undefined: ["default:undefined", -1],
      },
      categories: [
        "null",
        "undefined",
        "number",
        "symbol",
        "function",
        "object",
      ],
      invalidReason: "invalid-direct-slot",
      childError: {
        code: "ELI-RUNTIME-PROTOCOL",
        protocol: "Inheritance",
        operation: "read",
        observedType: "object:Child",
        reason: "missing",
      },
      atomic: {
        message: "protocol Atomic/right implementation must be a function",
        leftInstalled: false,
        accessorRead: false,
        accessorMessage:
          "protocol Atomic/left implementation must be a function",
      },
      arrays: {
        values: [1, 3],
        prototypePreserved: true,
      },
      million: 1_000_000,
    });

    const sourceMap = JSON.parse(await readFile(`${seed}.map`, "utf8"));
    expect(sourceMap.sourcesContent[0])
      .toContain("(defun external-method (state record receiver)");
    expect(sourceMap.sourcesContent[0])
      .toContain("(defun dispatch (protocol record receiver arguments)");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 90_000);
