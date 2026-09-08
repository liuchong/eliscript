import { expect, test } from "bun:test";
import {
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const packageFixtures = resolve(root, "tests/fixtures/packages");
const seedBuild = resolve(root, "bin/eliscript-seed-build");
const selfHostedBuild = resolve(root, "bin/eliscript-build");
const bootstrapBuilder = resolve(root, "bin/eliscript-bootstrap");
const emacs = process.env.EMACS ?? "emacs";
const repositoryPackage = JSON.parse(
  await readFile(resolve(root, "package.json"), "utf8"),
);
const dependencies = [
  "bit",
  "persistent-list",
  "persistent-vector",
  "persistent-map",
  "persistent-set",
  "value",
];

async function runSuccessful(command, options = {}) {
  const child = Bun.spawn(command, {
    cwd: options.cwd ?? root,
    env: { ...process.env, EMACS: emacs, ...options.env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(
      stderr.trim() || stdout.trim() || `${command[0]} exited with ${exitCode}`,
    );
  }
  return stdout;
}

async function compilePackage(command, packageRoot, environment = {}) {
  const outputDirectory = resolve(packageRoot, "stdlib");
  await Promise.all([
    mkdir(resolve(outputDirectory, "interop"), { recursive: true }),
    cp(resolve(root, "runtime"), resolve(packageRoot, "runtime"), {
      recursive: true,
    }),
    writeFile(
      resolve(packageRoot, "package.json"),
      JSON.stringify({
        name: repositoryPackage.name,
        private: true,
        exports: repositoryPackage.exports,
      }, null, 2) + "\n",
    ),
  ]);
  await runSuccessful([
    command,
    "--root",
    "stdlib",
    "--out-dir",
    outputDirectory,
    "stdlib/interop/js.eli",
  ], { env: environment });
}

async function prepareConsumer(directory, eliscriptPackage) {
  const scope = resolve(directory, "node_modules/@eliscript-fixtures");
  await Promise.all([
    mkdir(scope, { recursive: true }),
    copyFile(
      resolve(packageFixtures, "interop-consumer/package.json"),
      resolve(directory, "package.json"),
    ),
    copyFile(
      resolve(packageFixtures, "interop-consumer/index.mjs"),
      resolve(directory, "index.mjs"),
    ),
  ]);
  await Promise.all([
    symlink(eliscriptPackage, resolve(directory, "node_modules/eliscript"), "dir"),
    symlink(
      resolve(packageFixtures, "native-container-consumer"),
      resolve(scope, "native-container-consumer"),
      "dir",
    ),
  ]);
}

async function executeConsumer(runtime, directory) {
  const stdout = await runSuccessful([runtime, "index.mjs"], { cwd: directory });
  return JSON.parse(stdout.trim());
}

test("maintained JavaScript package consumes native values across compilers and hosts", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-interop-package-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedPackage = resolve(directory, "seed-package");
  const selfHostedPackage = resolve(directory, "self-hosted-package");
  try {
    const [consumerManifest, nativeManifest, nativeSource] = await Promise.all([
      readFile(resolve(packageFixtures, "interop-consumer/package.json"), "utf8")
        .then(JSON.parse),
      readFile(
        resolve(packageFixtures, "native-container-consumer/package.json"),
        "utf8",
      ).then(JSON.parse),
      readFile(
        resolve(packageFixtures, "native-container-consumer/index.mjs"),
        "utf8",
      ),
    ]);
    expect(consumerManifest.dependencies).toEqual({
      "@eliscript-fixtures/native-container-consumer": "*",
      eliscript: "*",
    });
    expect(nativeManifest).toMatchObject({
      name: "@eliscript-fixtures/native-container-consumer",
      private: true,
      type: "module",
    });
    expect(nativeSource).not.toContain("eliscript/");

    await Promise.all([
      mkdir(seedPackage, { recursive: true }),
      mkdir(selfHostedPackage, { recursive: true }),
    ]);
    await compilePackage(seedBuild, seedPackage);
    await runSuccessful([bootstrapBuilder], {
      env: { ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory },
    });
    await compilePackage(selfHostedBuild, selfHostedPackage, {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
    });

    for (const relative of [
      ...dependencies.flatMap((name) => [
        `stdlib/${name}.mjs`,
        `stdlib/${name}.mjs.map`,
      ]),
      "stdlib/interop/js.mjs",
      "stdlib/interop/js.mjs.map",
    ]) {
      expect(await readFile(resolve(selfHostedPackage, relative), "utf8"))
        .toBe(await readFile(resolve(seedPackage, relative), "utf8"));
    }

    const reports = [];
    for (const [generation, packageRoot] of [
      ["seed", seedPackage],
      ["self-hosted", selfHostedPackage],
    ]) {
      const consumer = resolve(directory, `${generation}-consumer`);
      await mkdir(consumer, { recursive: true });
      await prepareConsumer(consumer, packageRoot);
      reports.push(await executeConsumer(process.execPath, consumer));
      reports.push(await executeConsumer(process.env.NODE ?? "node", consumer));
    }

    for (const report of reports) expect(report).toEqual(reports[0]);
    expect(reports[0]).toEqual({
      consumer: {
        packageName: "@eliscript-fixtures/native-container-consumer",
        nativeCategories: {
          options: true,
          children: true,
          settings: true,
          tags: true,
        },
        beforeMutation: {
          title: "Eliscript",
          children: ["left", "right"],
          ready: true,
          tags: ["host", "stable"],
        },
        afterMutation: {
          children: ["left", "right", "package-added"],
          settingAdded: true,
          tags: ["host", "package-added", "stable"],
        },
      },
      sourceUnchanged: {
        children: ["left", "right"],
        childCount: 2,
        settingAdded: false,
        tagAdded: false,
      },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 120_000);
