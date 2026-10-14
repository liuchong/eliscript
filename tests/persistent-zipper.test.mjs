import { seedCompilerFixture } from "./helpers/seed-compiler.mjs";
import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const seedCompiler = resolve(root, "bin/eliscript-seed");
const portableCompiler = resolve(root, "bin/eliscript-portable");
const compilationUnits = [
  ["stdlib/core/zipper.eli", "stdlib/core/zipper.eli"],
  ["tests/fixtures/persistent-zipper.eli",
    "tests/fixtures/persistent-zipper.mjs"],
];
const hostFixture = resolve(root, "tests/fixtures/persistent-zipper-host.mjs");
const bunPreload = resolve(root, "tests/fixtures/compiled-eli-bun-preload.mjs");
const nodeLoader = resolve(root, "tests/fixtures/compiled-eli-node-loader.mjs");
const emacs = process.env.EMACS ?? "emacs";

async function runSuccessful(command, extraEnvironment = {}) {
  const started = performance.now();
  if (process.env.CI) console.error("host check starting:", command.join(" "));
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
  if (process.env.CI) console.error("host check completed:", command.join(" "), `(${Math.round(performance.now() - started)}ms; exit ${exitCode})`);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() ||
      `${command[0]} exited with ${exitCode}`);
  }
  return stdout;
}

async function compile(command, source, output, environment = {}) {
  await mkdir(dirname(output), { recursive: true });
  await runSuccessful([
    command,
    "--source-map",
    "--output",
    output,
    source,
  ], environment);
}

async function compileFamily(command, outputRoot, environment = {}) {
  await mkdir(outputRoot, { recursive: true });
  await symlink(resolve(root, "runtime"), resolve(outputRoot, "runtime"), "dir");
  for (const [source, output] of compilationUnits) {
    await compile(
      command,
      resolve(root, source),
      resolve(outputRoot, output),
      environment,
    );
  }
}

test("persistent zippers navigate edit and rebuild stack-safe trees", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-zipper-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");

  try {
    // These independent builds write disjoint output trees. Keep the same
    // deadline without making seed compilation wait for bootstrap startup.
    await Promise.all([
      compileFamily(seedCompiler, seedDirectory),
      seedCompilerFixture(bootstrapDirectory),
    ]);
    await compileFamily(portableCompiler, selfHostedDirectory, {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
    });

    for (const [, output] of compilationUnits) {
      expect(await Bun.file(resolve(selfHostedDirectory, output)).text())
        .toBe(await Bun.file(resolve(seedDirectory, output)).text());
      expect(await Bun.file(resolve(selfHostedDirectory, `${output}.map`)).text())
        .toBe(await Bun.file(resolve(seedDirectory, `${output}.map`)).text());
    }

    // All four hosts consume immutable outputs independently. Keep every
    // depth-12000 run and the existing deadline; avoid two serial host waves.
    const reports = await Promise.all([seedDirectory, selfHostedDirectory].flatMap((outputRoot) => {
      const modulePath = resolve(
        outputRoot,
        "tests/fixtures/persistent-zipper.mjs",
      );
      return [
        runSuccessful([
          "bun", "--preload", bunPreload, hostFixture, modulePath,
        ]),
        runSuccessful([
          process.env.NODE ?? "node",
          "--experimental-loader", nodeLoader, hostFixture, modulePath,
        ]),
      ].map(async (report) => JSON.parse(await report));
    }));
    for (const report of reports) expect(report).toEqual(reports[0]);

    expect(reports[0].recognition).toEqual([true, false, true]);
    expect(reports[0].navigation).toEqual([
      1, "vector", 2, 3, 2, 4, 1, 3, 2, 1, 1,
    ]);
    expect(reports[0].enumeration).toEqual(["vector", 1, "vector", 2, 3, 4]);
    expect(reports[0].end).toEqual([true, true, 4, 3, true]);
    expect(reports[0].identity).toEqual([true, true, 3, "zipper-test"]);
    expect(reports[0].edited).toEqual([1, 2, 20, 30, 40, 50, 4]);
    expect(reports[0].prepended).toEqual([0, 2, 3]);
    expect(reports[0].removed).toEqual([2, 1, true, 3]);
    expect(reports[0].generic).toEqual([7, 10]);
    expect(reports[0].list).toEqual([true, true, 5, 6, 8, "list-zipper"]);
    expect(reports[0].nullish).toEqual([true, true, true, true]);
    expect(reports[0].deep).toBe(1);
    expect(reports[0].errors).toEqual([
      "zipper branch predicate must be a function",
      "node requires a zipper location",
      "children requires a branch location",
      "insert-left cannot insert at the root",
      "insert-right cannot insert at the root",
      "remove cannot remove the root",
      "replace cannot modify the end location",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("deep zipper ascent reads indexed ancestor slots without reducing wide parent vectors", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-zipper-indexed-"));
  const seedDirectory = resolve(directory, "seed");
  try {
    await compileFamily(seedCompiler, seedDirectory);
    const script = `
      import assert from 'node:assert/strict';
      import {PersistentVector,persistentVector} from ${JSON.stringify(resolve(root,"runtime/core/vector.mjs"))};
      import {COLLECTION_REDUCE} from ${JSON.stringify(resolve(root,"runtime/core/collection-internals.mjs"))};
      import {persistentList} from ${JSON.stringify(resolve(root,"runtime/core/list.mjs"))};
      import {meta,withMeta} from ${JSON.stringify(resolve(root,"runtime/core/metadata.mjs"))};
      const zipper=await import(${JSON.stringify(resolve(seedDirectory,"stdlib/core/zipper.eli"))});
      const original=PersistentVector.prototype[COLLECTION_REDUCE];let visits=0;
      PersistentVector.prototype[COLLECTION_REDUCE]=function(reducer,...initial){
        return original.call(this,(...args)=>{if(this.count>32)visits++;return reducer(...args);},...initial);
      };
      try {
        let value=null;for(let i=0;i<512;i++)value=persistentVector(value);
        let location=zipper.vector_zipper(value);for(let i=0;i<512;i++)location=zipper.down(location);
        assert.equal(zipper.node(location),null);assert.equal(zipper.root(location),value);
        let edited=zipper.root(zipper.replace(location,undefined));for(let i=0;i<512;i++)edited=edited.nth(0);assert.equal(edited,undefined);
        assert.equal(visits,0,'one ancestor lookup must not scan wide parent vectors');
        const source=persistentVector(7),base=zipper.vector_zipper(source),configuration=meta(base);
        const listPath=persistentList(persistentVector(),persistentList(),null,persistentVector(source),false);
        for(const child of[undefined,null,false,0]){const loc=withMeta(persistentVector(child,listPath),configuration);assert.equal(zipper.node(loc),child);assert.equal(zipper.node(zipper.up(loc)),source);}
        const malformed=withMeta(persistentVector(undefined,persistentVector()),configuration);assert.throws(()=>zipper.up(malformed),/invalid zipper internal slot/);

      }finally{PersistentVector.prototype[COLLECTION_REDUCE]=original;}
    `;
    await runSuccessful(["bun","--preload",bunPreload,"--eval",script]);
  } finally {await rm(directory,{recursive:true,force:true});}
}, 30_000);
