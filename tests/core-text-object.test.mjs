import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import {
  filterValues,
  keys,
  mapValues,
  merge,
  pick,
} from "../runtime/core/object.mjs";
import {
  join,
  slice,
} from "../runtime/core/text.mjs";
import {
  IAssociative,
  IConj,
  ICounted,
  IEmptyable,
  IIndexed,
  ILookup,
  IReduce,
  reduce,
} from "../runtime/core/collection.mjs";
import { equalValues } from "../runtime/core/value.mjs";
import {
  EMPTY_MAP,
} from "../runtime/core/map.mjs";
import {
  assocBang,
  persistentBang,
  transient,
} from "../runtime/core/transient.mjs";
import {
  persistentMapMetrics,
  resetPersistentMapMetrics,
  resetTransientMapMetrics,
  transientMapMetrics,
} from "../runtime/testing/map.mjs";
import { extendProtocolType } from "../runtime/core/protocol.mjs";

const ROOT = resolve(import.meta.dir, "..");
const SEED_COMPILER = resolve(ROOT, "bin/eliscript");
const BOOTSTRAP_BUILDER = resolve(ROOT, "bin/eliscript-bootstrap");
const SELF_HOSTED_COMPILER = resolve(ROOT, "bin/eliscript-portable");
const HOST_FIXTURE = resolve(
  ROOT,
  "tests/fixtures/core-text-object-host.mjs",
);
const BUN = process.execPath;
const NODE = process.env.NODE_BINARY ?? "node";
const MODULES = Object.freeze([
  {
    name: "text",
    source: resolve(ROOT, "stdlib/core/text.eli"),
    committed: resolve(ROOT, "runtime/core/text-impl.mjs"),
    facade: resolve(ROOT, "runtime/core/text.mjs"),
  },
  {
    name: "object",
    source: resolve(ROOT, "stdlib/core/object.eli"),
    committed: resolve(ROOT, "runtime/core/object-impl.mjs"),
    facade: resolve(ROOT, "runtime/core/object.mjs"),
  },
]);

async function run(command, environment = {}) {
  const child = Bun.spawn(command, {
    cwd: ROOT,
    env: {
      ...process.env,
      BUN,
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

async function compile(compiler, source, output, environment = {}) {
  await mkdir(dirname(output), { recursive: true });
  await run([
    compiler,
    "--source-map",
    "--output",
    output,
    source,
  ], environment);
}

async function execute(host, textModule, objectModule) {
  return JSON.parse(await run([
    host,
    HOST_FIXTURE,
    textModule,
    objectModule,
  ]));
}

function canonicalSourceMap(sourceMap, name) {
  return { ...JSON.parse(sourceMap), sources: [`<${name}-source>`] };
}

test("protocol-driven text and object algorithms preserve value boundaries", () => {
  expect(slice(0, 3, "A😀")).toBe("A😀");
  expect(join("/", new Set(["a", 2, false]))).toBe("a/2/false");

  const plain = { zero: 0, right: 2, absent: undefined };
  expect([...keys(plain)]).toEqual(["zero", "right", "absent"]);
  expect(mapValues((value) => value ?? "nil", plain)).toEqual({
    zero: 0,
    right: 2,
    absent: "nil",
  });
  expect(filterValues((value) => value === 0 ? 0 : false, plain))
    .toEqual({ zero: 0 });
  expect(plain).toEqual({ zero: 0, right: 2, absent: undefined });

  class RecordLike {
    constructor() {
      this.value = 1;
    }
  }
  expect(() => keys(new RecordLike())).toThrow("IReduce/reduce");
});

test("external protocol values reuse text and keyed algorithms", () => {
  class TextView {
    constructor(value) {
      this.value = value;
      Object.freeze(this);
    }
  }
  extendProtocolType(ICounted, TextView, {
    count: (value) => value.value.length,
  });
  extendProtocolType(IIndexed, TextView, {
    nth: (value, index, ...notFound) => {
      if (Number.isInteger(index) && index >= 0 &&
          index < value.value.length) {
        return value.value[index];
      }
      if (notFound.length > 0) return notFound[0];
      throw new RangeError("text view index outside bounds");
    },
  });
  expect(slice(1, 4, new TextView("Eliscript"))).toBe("lis");

  class KeyedValue {
    constructor(entries) {
      this.entries = Object.freeze(entries.map((entry) =>
        Object.freeze([entry[0], entry[1]])));
      Object.freeze(this);
    }
  }
  function keyedAssoc(value, key, next) {
    const entries = value.entries.filter(([current]) => current !== key);
    entries.push([key, next]);
    return new KeyedValue(entries);
  }
  extendProtocolType(IEmptyable, KeyedValue, {
    empty: () => new KeyedValue([]),
  });
  extendProtocolType(IConj, KeyedValue, {
    conj: (value, entry) => keyedAssoc(value, entry[0], entry[1]),
  });
  extendProtocolType(ILookup, KeyedValue, {
    get: (value, key, notFound = null) =>
      value.entries.find(([current]) => current === key)?.[1] ?? notFound,
  });
  extendProtocolType(IAssociative, KeyedValue, {
    assoc: keyedAssoc,
    contains: (value, key) =>
      value.entries.some(([current]) => current === key),
  });
  extendProtocolType(IReduce, KeyedValue, {
    reduce: (value, reducer, ...initial) =>
      reduce(value.entries, reducer, ...initial),
  });

  const value = new KeyedValue([["left", 1], ["right", 2]]);
  expect(mapValues((current) => current * 10, value).entries)
    .toEqual([["left", 10], ["right", 20]]);
  expect(pick(value, ["right"]).entries).toEqual([["right", 2]]);
  expect(merge(value, new KeyedValue([["right", 9], ["next", 3]])).entries)
    .toEqual([["left", 1], ["right", 9], ["next", 3]]);
});

test("core object transforms use transient persistent-map construction", () => {
  let builder = transient(EMPTY_MAP);
  for (let value = 0; value < 50_000; value += 1) {
    builder = assocBang(builder, value, value);
  }
  const source = persistentBang(builder);

  resetPersistentMapMetrics();
  let reference = EMPTY_MAP;
  for (const [key, value] of source) {
    reference = reference.assoc(key, value + 1);
  }
  const persistentAllocations = persistentMapMetrics().nodeAllocations;

  resetPersistentMapMetrics();
  resetTransientMapMetrics();
  const mapped = mapValues((value) => value + 1, source);
  expect(mapped.count).toBe(50_000);
  expect(mapped.get(0)).toBe(1);
  expect(mapped.get(49_999)).toBe(50_000);
  expect(equalValues(mapped, reference)).toBe(true);
  expect(persistentMapMetrics().nodeAllocations)
    .toBeLessThan(persistentAllocations / 3);
  expect(transientMapMetrics()).toMatchObject({
    persistentCalls: 1,
    invalidCalls: 0,
  });
}, 30_000);

test("core text/object production artifacts are fixed-point and cross-host", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-core-values-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedRoot = resolve(directory, "seed");
  const selfHostedRoot = resolve(directory, "self-hosted");

  try {
    await Promise.all([
      mkdir(seedRoot, { recursive: true }),
      mkdir(selfHostedRoot, { recursive: true }),
    ]);
    await Promise.all([
      symlink(resolve(ROOT, "runtime"), resolve(seedRoot, "runtime"), "dir"),
      symlink(
        resolve(ROOT, "runtime"),
        resolve(selfHostedRoot, "runtime"),
        "dir",
      ),
    ]);
    await run([BOOTSTRAP_BUILDER], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });

    const artifacts = [];
    for (const module of MODULES) {
      const seed = resolve(
        seedRoot,
        `stdlib/core/${module.name}-impl.mjs`,
      );
      const selfHosted = resolve(
        selfHostedRoot,
        `stdlib/core/${module.name}-impl.mjs`,
      );
      await compile(SEED_COMPILER, module.source, seed);
      await compile(SELF_HOSTED_COMPILER, module.source, selfHosted, {
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
      });

      expect(await readFile(selfHosted, "utf8"))
        .toBe(await readFile(seed, "utf8"));
      expect(await readFile(`${selfHosted}.map`, "utf8"))
        .toBe(await readFile(`${seed}.map`, "utf8"));
      expect(await readFile(seed, "utf8"))
        .toBe(await readFile(module.committed, "utf8"));
      expect(canonicalSourceMap(
        await readFile(`${seed}.map`, "utf8"),
        module.name,
      )).toEqual(canonicalSourceMap(
        await readFile(`${module.committed}.map`, "utf8"),
        module.name,
      ));

      const facade = await readFile(module.facade, "utf8");
      expect(facade).toContain(`from "./${module.name}-impl.mjs"`);
      expect(facade).not.toContain("vite");
      expect(facade).not.toContain("react");
      artifacts.push({ seed, selfHosted, committed: module.committed });
    }

    const reports = [];
    for (const textArtifact of Object.values(artifacts[0])) {
      for (const objectArtifact of Object.values(artifacts[1])) {
        reports.push(await execute(BUN, textArtifact, objectArtifact));
        reports.push(await execute(NODE, textArtifact, objectArtifact));
      }
    }
    for (const report of reports) expect(report).toEqual(reports[0]);
    expect(reports[0]).toMatchObject({
      text: {
        empty: true,
        slice: "A😀",
        surrogate: 55357,
        starts: true,
        ends: true,
        contains: true,
        stripped: "article",
        trimmed: "Eliscript",
        blank: true,
        joined: "a/2/false",
        repeated: "ababab",
      },
      object: {
        keys: ["zero", "right", "absent"],
        sourceUnchanged: true,
        associated: [0, 2, 3],
        safePrototype: true,
        missingPreserved: true,
        absentIdentity: true,
        valueKey: true,
      },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 90_000);
