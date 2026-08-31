import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const stdlib = resolve(root, "stdlib");
const compiler = resolve(root, "bin/eliscript");
const bootstrapBuilder = resolve(root, "bin/eliscript-bootstrap");
const portableCompiler = resolve(root, "bin/eliscript-portable");
const dependencies = [
  "bit",
  "persistent-list",
  "persistent-vector",
  "persistent-map",
  "persistent-set",
  "value",
];
const emacs = process.env.EMACS ?? "emacs";

async function runSuccessful(command, extraEnvironment = {}) {
  const child = Bun.spawn(command, {
    cwd: root,
    env: { ...process.env, EMACS: emacs, ...extraEnvironment },
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

async function compileFamily(command, outputDirectory, environment = {}) {
  await mkdir(resolve(outputDirectory, "interop"), { recursive: true });
  for (const name of dependencies) {
    await runSuccessful([
      command,
      "--source-map",
      "--output",
      resolve(outputDirectory, `${name}.eli`),
      resolve(stdlib, `${name}.eli`),
    ], environment);
  }
  await runSuccessful([
    command,
    "--source-map",
    "--output",
    resolve(outputDirectory, "interop/js.mjs"),
    resolve(stdlib, "interop/js.eli"),
  ], environment);
}

test("Eliscript JS interop preserves explicit host and persistent boundaries", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-interop-js-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");
  const hostFixture = resolve(root, "tests/fixtures/interop-js-host.mjs");
  const bunPreload = resolve(
    root,
    "tests/fixtures/compiled-eli-bun-preload.mjs",
  );
  const nodeLoader = resolve(
    root,
    "tests/fixtures/compiled-eli-node-loader.mjs",
  );

  try {
    await symlink(resolve(root, "runtime"), resolve(directory, "runtime"), "dir");
    await compileFamily(compiler, seedDirectory);
    await runSuccessful([bootstrapBuilder], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });
    await compileFamily(portableCompiler, selfHostedDirectory, {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
    });

    for (const relative of [
      ...dependencies.map((name) => `${name}.eli`),
      "interop/js.mjs",
    ]) {
      const seed = resolve(seedDirectory, relative);
      const selfHosted = resolve(selfHostedDirectory, relative);
      expect(await Bun.file(selfHosted).text()).toBe(await Bun.file(seed).text());
      expect(await Bun.file(`${selfHosted}.map`).text())
        .toBe(await Bun.file(`${seed}.map`).text());
    }

    const reports = [];
    for (const outputDirectory of [seedDirectory, selfHostedDirectory]) {
      const interopModule = resolve(outputDirectory, "interop/js.mjs");
      reports.push(JSON.parse(await runSuccessful([
        "bun",
        "--preload",
        bunPreload,
        hostFixture,
        interopModule,
      ])));
      reports.push(JSON.parse(await runSuccessful([
        process.env.NODE ?? "node",
        "--experimental-loader",
        nodeLoader,
        hostFixture,
        interopModule,
      ])));
    }
    for (const report of reports) expect(report).toEqual(reports[0]);

    expect(reports[0]).toEqual({
      predicates: {
        array: true,
        object: true,
        map: true,
        set: true,
        arrayNotObject: true,
        runtimeNotNative: true,
      },
      constructors: {
        array: [1, 2, 3],
        map: [["left", 1], ["right", 2]],
        set: [1, 2],
        objectName: "Eliscript",
        safeProto: true,
      },
      crossRealm: {
        predicates: true,
        array: true,
        map: true,
        set: true,
        object: true,
      },
      toJs: {
        shallowArray: true,
        shallowNestedIdentity: true,
        deepFamilies: true,
        deepSharing: true,
        deepList: true,
        mapArrayKey: true,
        setArrays: true,
        hostShallowIdentity: true,
      },
      fromJs: {
        shallowRuntimeVector: true,
        shallowNestedIdentity: true,
        deepRuntimeVector: true,
        deepSharing: true,
        nestedFamilies: true,
        objectMap: true,
        mapMap: true,
        setSet: true,
        portableFamilies: true,
        portableNested: true,
        runtimeFamilies: true,
        plainObjectRules: true,
        inheritedOptionsIgnored: true,
        persistentShallowIdentity: true,
      },
      errors: {
        arrayCycle: {
          code: "ELI-INTEROP-CYCLE",
          path: "$[0]",
          origin: "$",
        },
        objectCycle: {
          code: "ELI-INTEROP-CYCLE",
          path: "$[\"self\"]",
          origin: "$",
        },
        accessor: {
          code: "ELI-INTEROP-ACCESSOR",
          path: "$[\"secret\"]",
          origin: null,
        },
        symbolKey: {
          code: "ELI-INTEROP-INVALID-KEY",
          path: "$",
          origin: null,
        },
        optionAccessor: {
          code: "ELI-INTEROP-ACCESSOR",
          path: "$[\"deep\"]",
          origin: null,
        },
        symbolOption: {
          code: "ELI-INTEROP-INVALID-OPTIONS",
          path: "$",
          origin: null,
        },
        duplicateMap: {
          code: "ELI-INTEROP-DUPLICATE",
          path: "$<key:1>",
          origin: null,
        },
        duplicateSet: {
          code: "ELI-INTEROP-DUPLICATE",
          path: "$<set:1>",
          origin: null,
        },
        depth: {
          code: "ELI-INTEROP-DEPTH-LIMIT",
          path: "$[0][0]",
          origin: null,
        },
        values: {
          code: "ELI-INTEROP-VALUE-LIMIT",
          path: "$[1]",
          origin: null,
        },
        opaque: {
          code: "ELI-INTEROP-UNSUPPORTED",
          path: "$[\"value\"]",
          origin: null,
        },
        options: {
          code: "ELI-INTEROP-INVALID-OPTIONS",
          path: "$",
          origin: null,
        },
        objectKey: {
          code: "ELI-INTEROP-INVALID-KEY",
          path: "$<key:0>",
          origin: null,
        },
      },
      react: {
        propsArray: true,
        rendered: '<section class="interop">leftright</section>',
      },
      generated: {
        count: 2_000,
        agreement: true,
        scaleCount: 100_000,
        scaleLast: 99_999,
        sourceUnchanged: true,
      },
    });

    const sourceMap = await Bun.file(
      resolve(seedDirectory, "interop/js.mjs.map"),
    ).json();
    expect(sourceMap.sourcesContent).toHaveLength(1);
    expect(sourceMap.sourcesContent[0]).toContain("(defun to-js (");
    expect(sourceMap.sourcesContent[0]).toContain("(defun from-js (");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);
