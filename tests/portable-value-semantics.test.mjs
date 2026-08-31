import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { persistentList as runtimePersistentList } from "../runtime/core/list.mjs";
import { hashValue as runtimeHashValue } from "../runtime/core/value.mjs";

const projectDirectory = resolve(import.meta.dir, "..");
const stdlibDirectory = resolve(projectDirectory, "stdlib");
const compiler = resolve(projectDirectory, "bin/eliscript");
const projectBuilder = resolve(projectDirectory, "bin/eliscript-build");
const bootstrapBuilder = resolve(projectDirectory, "bin/eliscript-bootstrap");
const portableCompiler = resolve(projectDirectory, "bin/eliscript-portable");
const sources = [
  "bit",
  "identifier",
  "persistent-list",
  "persistent-vector",
  "persistent-map",
  "persistent-set",
  "value",
];
const valueSource = resolve(stdlibDirectory, "value.eli");
const identityTokenSource = resolve(
  projectDirectory,
  "tests/fixtures/host-identity-token.eli",
);
const generatedValueModule = resolve(
  projectDirectory,
  "dist/stdlib/value.mjs",
);
const emacs = process.env.EMACS ?? "emacs";
let generatedModuleBuild;

async function runSuccessful(command, extraEnvironment = {}) {
  const child = Bun.spawn(command, {
    cwd: projectDirectory,
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

async function generatedModules(label) {
  generatedModuleBuild ??= runSuccessful([
    projectBuilder,
    "--root",
    stdlibDirectory,
    "--out-dir",
    resolve(projectDirectory, "dist/stdlib"),
    valueSource,
  ]);
  await generatedModuleBuild;
  const suffix = `?${label}=${Date.now()}`;
  const modules = {};
  for (const name of sources.filter((source) => source !== "identifier")) {
    const output = resolve(projectDirectory, `dist/stdlib/${name}.mjs`);
    modules[name] = await import(`${pathToFileURL(output).href}${suffix}`);
  }
  return modules;
}

function nextRandom(state) {
  let value = state.value;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  state.value = value >>> 0;
  return state.value;
}

test("Eliscript-authored value semantics compile and agree across hosts", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-value-"));
  const bootstrapDirectory = resolve(directory, "bootstrap");
  const seedDirectory = resolve(directory, "seed");
  const selfHostedDirectory = resolve(directory, "self-hosted");
  const hostFixture = resolve(
    projectDirectory,
    "tests/fixtures/portable-value-host.mjs",
  );
  const bunPreload = resolve(
    projectDirectory,
    "tests/fixtures/compiled-eli-bun-preload.mjs",
  );
  const nodeLoader = resolve(
    projectDirectory,
    "tests/fixtures/compiled-eli-node-loader.mjs",
  );

  try {
    await Promise.all([
      mkdir(seedDirectory, { recursive: true }),
      mkdir(selfHostedDirectory, { recursive: true }),
    ]);
    for (const name of sources) {
      const extension = name === "value" ? "mjs" : "eli";
      await runSuccessful([
        compiler,
        "--source-map",
        "--output",
        resolve(seedDirectory, `${name}.${extension}`),
        resolve(stdlibDirectory, `${name}.eli`),
      ]);
    }
    await runSuccessful([
      compiler,
      "--source-map",
      "--output",
      resolve(seedDirectory, "host-identity-token.mjs"),
      identityTokenSource,
    ]);
    await runSuccessful([bootstrapBuilder], {
      ELISCRIPT_BOOTSTRAP_OUT_DIR: bootstrapDirectory,
    });
    for (const name of sources) {
      const extension = name === "value" ? "mjs" : "eli";
      await runSuccessful([
        portableCompiler,
        "--source-map",
        "--output",
        resolve(selfHostedDirectory, `${name}.${extension}`),
        resolve(stdlibDirectory, `${name}.eli`),
      ], {
        ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
      });
    }
    await runSuccessful([
      portableCompiler,
      "--source-map",
      "--output",
      resolve(selfHostedDirectory, "host-identity-token.mjs"),
      identityTokenSource,
    ], {
      ELISCRIPT_BOOTSTRAP_MODULE_DIR: bootstrapDirectory,
    });

    for (const name of sources) {
      const extension = name === "value" ? "mjs" : "eli";
      const seed = resolve(seedDirectory, `${name}.${extension}`);
      const selfHosted = resolve(selfHostedDirectory, `${name}.${extension}`);
      expect(await Bun.file(selfHosted).text()).toBe(await Bun.file(seed).text());
      expect(await Bun.file(`${selfHosted}.map`).text())
        .toBe(await Bun.file(`${seed}.map`).text());
    }
    const seedIdentityToken = resolve(seedDirectory, "host-identity-token.mjs");
    const selfHostedIdentityToken = resolve(
      selfHostedDirectory,
      "host-identity-token.mjs",
    );
    expect(await Bun.file(selfHostedIdentityToken).text())
      .toBe(await Bun.file(seedIdentityToken).text());
    expect(await Bun.file(`${selfHostedIdentityToken}.map`).text())
      .toBe(await Bun.file(`${seedIdentityToken}.map`).text());
    expect(await Bun.file(resolve(seedDirectory, "persistent-vector.eli")).text())
      .not.toContain("__eliscript_host_identity_token");

    const reports = [];
    for (const outputDirectory of [seedDirectory, selfHostedDirectory]) {
      const valueModule = resolve(outputDirectory, "value.mjs");
      reports.push(JSON.parse(await runSuccessful([
        "bun",
        "--preload",
        bunPreload,
        hostFixture,
        valueModule,
      ])));
      reports.push(JSON.parse(await runSuccessful([
        process.env.NODE ?? "node",
        "--experimental-loader",
        nodeLoader,
        hostFixture,
        valueModule,
      ])));
    }
    for (const report of reports) expect(report).toEqual(reports[0]);
    expect(reports[0]).toEqual({
      scalars: {
        null: 1_108_378_657,
        undefined: 2_135_587_861,
        false: 1_624_342_457,
        true: 148_223_603,
        zero: 2_484_920_505,
        negativeZero: 2_484_920_505,
        one: 1_472_727_704,
        negativeOne: 1_598_749_574,
        fraction: 3_192_910_077,
        nan: 1_490_037_359,
        positiveInfinity: 232_236_935,
        negativeInfinity: 3_719_278_766,
        maxSafeInteger: 566_274_744,
        emptyString: 439_960_318,
        ascii: 1_222_682_721,
        unicode: 2_785_882_074,
      },
      collections: {
        vector: 3_898_133_958,
        list: 3_277_370_209,
        map: 3_379_452_415,
        set: 3_887_479_341,
      },
      identifiers: {
        keyword: 889_022_832,
        unqualifiedKeyword: 1_981_314_640,
        symbol: 1_771_029_623,
        unqualifiedSymbol: 3_731_567_423,
        portableKeyword: 889_022_832,
        portableSymbol: 1_771_029_623,
      },
      invariants: {
        nanEqual: true,
        zerosEqual: true,
        nestedEqual: true,
        nestedHashesEqual: true,
        listsEqual: true,
        listVectorDistinct: false,
        mapsEqual: true,
        mapHashesEqual: true,
        setsEqual: true,
        setHashesEqual: true,
        hostIdentity: true,
        hostDistinct: false,
        hostDistinctHashes: true,
        hostFunctionStable: true,
        nativeSymbolStable: true,
        nativeSymbolsDistinct: true,
        nativeSymbolIdentityEqual: true,
        nativeSymbolValuesDistinct: true,
        symbolsEqual: true,
        identifierCategoriesDistinct: true,
        portableKeywordEqual: true,
        portableSymbolEqual: true,
        portableKeywordValid: true,
        portableSymbolValid: true,
        concretePortableOnly: true,
        invalidPortableIdentifier: true,
      },
      collision: {
        leftHash: 2_357_254_775,
        rightHash: 2_357_254_775,
        keysEqual: false,
        count: 2,
        left: "left",
        right: "right",
      },
      lookup: {
        vectorKey: true,
        vectorValueHash: 2_519_951_401,
        setCount: 3,
        equalVectorMember: true,
        keywordValue: "keyword",
        symbolValue: "symbol",
        identifierSetCount: 2,
        equalSymbolMember: true,
        portableKeywordValue: "keyword",
        portableSymbolValue: "symbol",
        portableIdentifierSetCount: 2,
        nativeSymbolMapCount: 2,
        nativeSymbolLeft: "left",
        nativeSymbolRight: "right",
      },
      hostIdentityScale: {
        count: 20_000,
        uniqueHashes: 20_000,
        stable: true,
        mapCount: 20_000,
        mapLast: 19_999,
        setCount: 20_000,
        setLast: true,
      },
      identityToken: {
        objectStable: true,
        objectsDistinct: true,
        functionStable: true,
        symbolStable: true,
        symbolsDistinct: true,
        invalidScalar: {
          name: "TypeError",
          message: "host-identity-token expects an object, function, or symbol",
        },
      },
    });

    const sourceMap = await Bun.file(resolve(seedDirectory, "value.mjs.map"))
      .json();
    expect(sourceMap.sourcesContent).toHaveLength(1);
    expect(sourceMap.sourcesContent[0]).toContain("(defportable value-equal?");
    expect(sourceMap.sourcesContent[0]).toContain("(defportable value-hash");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 90_000);

test("portable persistent collections preserve nested undefined values", async () => {
  const modules = await generatedModules("undefined");
  const valueModule = modules.value;
  const listModule = modules["persistent-list"];
  const vectorModule = modules["persistent-vector"];
  const mapModule = modules["persistent-map"];
  const setModule = modules["persistent-set"];
  const {
    value_equal_QMARK_: valueEqual,
    value_hash: valueHash,
    value_map_from_entries: valueMapFromEntries,
    value_set_from_array: valueSetFromArray,
  } = valueModule;
  const {
    persistent_list_first: persistentListFirst,
    persistent_list_nth: persistentListNth,
    persistent_list_from_array: persistentListFromArray,
  } = listModule;
  const {
    persistent_vector_nth: persistentVectorNth,
    persistent_vector_from_array: persistentVectorFromArray,
  } = vectorModule;
  const {
    persistent_map_count: persistentMapCount,
    persistent_map_get: persistentMapGet,
  } = mapModule;
  const {
    persistent_set_count: persistentSetCount,
    persistent_set_has_QMARK_: persistentSetHas,
  } = setModule;

  const list = persistentListFromArray([undefined, null, false]);
  const vector = persistentVectorFromArray([undefined, null, false]);
  const map = valueMapFromEntries([
    [undefined, "undefined-key"],
    [null, "null-key"],
    ["undefined-value", undefined],
  ]);
  const set = valueSetFromArray([undefined, null, undefined]);
  expect(persistentListFirst(list, "missing")).toBeUndefined();
  expect(persistentListNth(list, 0, "missing")).toBeUndefined();
  expect(persistentVectorNth(vector, 0, "missing")).toBeUndefined();
  expect(persistentMapCount(map)).toBe(3);
  expect(persistentMapGet(map, undefined, "missing")).toBe("undefined-key");
  expect(persistentMapGet(map, null, "missing")).toBe("null-key");
  expect(persistentMapGet(map, "undefined-value", "missing")).toBeUndefined();
  expect(persistentSetCount(set)).toBe(2);
  expect(persistentSetHas(set, undefined)).toBe(true);
  expect(persistentSetHas(set, null)).toBe(true);
  expect(valueEqual(list, persistentListFromArray([undefined, null, false])))
    .toBe(true);
  expect(valueEqual(vector, persistentVectorFromArray([undefined, null, false])))
    .toBe(true);
  expect(valueHash(vector)).toBe(
    valueHash(persistentVectorFromArray([undefined, null, false])),
  );
}, 30_000);

test("optimized and portable persistent Lists share frozen hash semantics", async () => {
  const modules = await generatedModules("runtime-list");
  const { value_hash: valueHash } = modules.value;
  const { persistent_list_from_array: persistentListFromArray } =
    modules["persistent-list"];
  const portable = persistentListFromArray([
    1,
    "two",
    persistentListFromArray([3, 4]),
  ]);
  const runtime = runtimePersistentList(
    1,
    "two",
    runtimePersistentList(3, 4),
  );

  expect(runtimeHashValue(runtime)).toBe(valueHash(portable));
}, 30_000);

test("Eliscript-authored value semantics preserve generated cross-family invariants", async () => {
  const modules = await generatedModules("generated");
  const {
    value_equal_QMARK_: valueEqual,
    value_hash: valueHash,
    value_map_from_entries: valueMapFromEntries,
    value_set_from_array: valueSetFromArray,
  } = modules.value;
  const { persistent_list_from_array: persistentListFromArray } =
    modules["persistent-list"];
  const { persistent_vector_from_array: persistentVectorFromArray } =
    modules["persistent-vector"];
  const random = { value: 0x56414c31 };

  for (let step = 0; step < 2_000; step += 1) {
    const id = nextRandom(random) % 10_000;
    const number = (nextRandom(random) % 20_000) - 10_000;
    const scalar = step % 7 === 0 ? Number.NaN : number / 10;
    const nestedLeft = persistentVectorFromArray([id, `key-${id}`, scalar]);
    const nestedRight = persistentVectorFromArray([id, `key-${id}`, scalar]);
    const vectorLeft = persistentVectorFromArray([
      null,
      step % 5 === 0 ? undefined : false,
      nestedLeft,
    ]);
    const vectorRight = persistentVectorFromArray([
      null,
      step % 5 === 0 ? undefined : false,
      nestedRight,
    ]);
    const listLeft = persistentListFromArray([id, scalar, nestedLeft]);
    const listRight = persistentListFromArray([id, scalar, nestedRight]);
    const mapLeft = valueMapFromEntries([
      [nestedLeft, listLeft],
      ["id", id],
    ]);
    const mapRight = valueMapFromEntries([
      ["id", id],
      [nestedRight, listRight],
    ]);
    const setLeft = valueSetFromArray([nestedLeft, `id-${id}`, scalar]);
    const setRight = valueSetFromArray([scalar, `id-${id}`, nestedRight]);

    for (const [left, right] of [
      [nestedLeft, nestedRight],
      [vectorLeft, vectorRight],
      [listLeft, listRight],
      [mapLeft, mapRight],
      [setLeft, setRight],
    ]) {
      expect(valueEqual(left, right)).toBe(true);
      expect(valueHash(left)).toBe(valueHash(right));
    }
    expect(valueEqual(vectorLeft, listLeft)).toBe(false);
  }
}, 60_000);

test("Eliscript-authored value hashing traverses one million persistent values", async () => {
  const modules = await generatedModules("million");
  const { value_hash: valueHash } = modules.value;
  const {
    empty_persistent_vector: emptyPersistentVector,
    persistent_vector_count: persistentVectorCount,
    persistent_vector_nth: persistentVectorNth,
    persistent_vector_conj: persistentVectorConj,
    persistent_vector_assoc: persistentVectorAssoc,
  } = modules["persistent-vector"];
  let vector = emptyPersistentVector();
  for (let value = 0; value < 1_000_000; value += 1) {
    vector = persistentVectorConj(vector, value);
  }

  const hash = valueHash(vector);
  const updated = persistentVectorAssoc(vector, 500_000, -1);
  expect(persistentVectorCount(vector)).toBe(1_000_000);
  expect(persistentVectorNth(vector, 500_000, "missing")).toBe(500_000);
  expect(persistentVectorNth(updated, 500_000, "missing")).toBe(-1);
  expect(Number.isInteger(hash)).toBe(true);
  expect(hash).toBeGreaterThanOrEqual(0);
  expect(hash).toBeLessThanOrEqual(0xffff_ffff);
  expect(valueHash(vector)).toBe(hash);
  expect(valueHash(updated)).not.toBe(hash);
}, 60_000);
