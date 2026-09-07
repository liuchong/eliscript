import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { EMPTY_LIST } from "../../runtime/core/list.mjs";
import { EMPTY_MAP } from "../../runtime/core/map.mjs";
import { EMPTY_SET } from "../../runtime/core/set.mjs";
import { EMPTY_VECTOR } from "../../runtime/core/vector.mjs";

const DEFAULT_SEED = 0x50443031;
const DEFAULT_SEQUENCES = 100_000;
const UPDATES_PER_SEQUENCE = 8;
const FAMILY_ORDER = ["list", "vector", "map", "set"];
const FAMILY_SEEDS = Object.freeze({
  list: 0x4c495354,
  vector: 0x56454354,
  map: 0x4d415000,
  set: 0x53455400,
});
const COLLISION_LEFT = "key-50691";
const COLLISION_RIGHT = "key-194634";
const PROBE_KEYS = Object.freeze([
  null,
  undefined,
  Number.NaN,
  0,
  COLLISION_LEFT,
  COLLISION_RIGHT,
  "key-0",
  "key-8",
  -8,
  8,
]);

function parsePositiveInteger(raw, option) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${option} requires a positive safe integer`);
  }
  return value;
}

function parseNonNegativeInteger(raw, option) {
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${option} requires a non-negative safe integer`);
  }
  return value;
}

function parseSeed(raw) {
  if (!/^(?:0x[0-9a-f]+|[0-9]+)$/iu.test(raw)) {
    throw new Error("--seed requires an unsigned 32-bit integer");
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error("--seed requires an unsigned 32-bit integer");
  }
  return value >>> 0;
}

function parseArguments(argv) {
  const options = {
    seed: DEFAULT_SEED,
    sequences: DEFAULT_SEQUENCES,
    family: null,
    sequence: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const raw = argv[index + 1];
    if (option === "--seed") {
      if (raw === undefined) throw new Error("--seed requires a value");
      options.seed = parseSeed(raw);
      index += 1;
    } else if (option === "--sequences") {
      if (raw === undefined) throw new Error("--sequences requires a value");
      options.sequences = parsePositiveInteger(raw, "--sequences");
      index += 1;
    } else if (option === "--family") {
      if (!FAMILY_ORDER.includes(raw)) {
        throw new Error(`--family requires one of ${FAMILY_ORDER.join(", ")}`);
      }
      options.family = raw;
      index += 1;
    } else if (option === "--sequence") {
      if (raw === undefined) throw new Error("--sequence requires a value");
      options.sequence = parseNonNegativeInteger(raw, "--sequence");
      index += 1;
    } else {
      throw new Error(`unknown option ${option}`);
    }
  }
  if (options.sequence !== null && options.family === null) {
    throw new Error("--sequence requires --family");
  }
  if (options.sequence !== null && options.sequence >= options.sequences) {
    throw new Error("--sequence must be smaller than --sequences");
  }
  return options;
}

function mix32(value) {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846ca68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function sequenceRandom(seed, family, sequence) {
  return {
    value: mix32(seed ^ FAMILY_SEEDS[family] ^ Math.imul(sequence + 1, 0x9e3779b1)) || 1,
  };
}

function nextRandom(random) {
  let value = random.value;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  random.value = value >>> 0;
  return random.value;
}

function generatedValue(random) {
  const bits = nextRandom(random);
  switch (bits & 7) {
    case 0:
      return null;
    case 1:
      return undefined;
    case 2:
      return Number.NaN;
    case 3:
      return -0;
    case 4:
      return `value-${bits % 17}`;
    default:
      return (bits % 257) - 128;
  }
}

function generatedKey(random) {
  const bits = nextRandom(random);
  switch (bits % 10) {
    case 0:
      return null;
    case 1:
      return undefined;
    case 2:
      return Number.NaN;
    case 3:
      return -0;
    case 4:
      return COLLISION_LEFT;
    case 5:
      return COLLISION_RIGHT;
    case 6:
    case 7:
      return `key-${bits % 17}`;
    default:
      return (bits % 17) - 8;
  }
}

function valueToken(value, key = false) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "number") {
    if (Number.isNaN(value)) return "number:nan";
    if (key && Object.is(value, -0)) return "number:0";
    if (Object.is(value, -0)) return "number:-0";
    return `number:${value}`;
  }
  return `${typeof value}:${JSON.stringify(value)}`;
}

function sameValue(left, right) {
  return left === right ||
    (typeof left === "number" && typeof right === "number" &&
      Number.isNaN(left) && Number.isNaN(right));
}

function fail(context, message) {
  const trace = context.trace === undefined
    ? ""
    : `\ntrace: ${JSON.stringify(context.trace)}`;
  throw new Error(
    `${context.family} sequence ${context.sequence} step ${context.step} ` +
      `(${context.operation}): ${message}${trace}`,
  );
}

function invariant(condition, context, message) {
  if (!condition) fail(context, message);
}

function equalValueArrays(actual, expected, context, label) {
  invariant(actual.length === expected.length, context, `${label} length differs`);
  for (let index = 0; index < actual.length; index += 1) {
    invariant(sameValue(actual[index], expected[index]), context, `${label}[${index}] differs`);
  }
}

function canonicalArray(values) {
  return `[${values.map((value) => valueToken(value)).join(",")}]`;
}

function canonicalMapEntries(entries) {
  return [...entries]
    .map(([key, value]) => `${valueToken(key, true)}=${valueToken(value)}`)
    .sort()
    .join("|");
}

function canonicalSetValues(values) {
  return [...values].map((value) => valueToken(value, true)).sort().join("|");
}

function recordOperation(report, operation) {
  report.operations[operation] = (report.operations[operation] ?? 0) + 1;
}

function retainVersion(history, value, snapshot) {
  history.push({ value, snapshot });
}

function checkHistory(history, snapshot, report, context) {
  for (const version of history) {
    invariant(snapshot(version.value) === version.snapshot, context, "a previous version changed");
    report.previousVersionsChecked += 1;
  }
}

function reduceValueTokens(values) {
  return values.map((value) => valueToken(value)).join("|");
}

function validateList(list, model, report, context) {
  recordOperation(report, "count");
  invariant(list.count === model.length, context, "count differs");
  recordOperation(report, "size");
  invariant(list.size === model.length, context, "size differs");
  recordOperation(report, "isEmpty");
  invariant(list.isEmpty === (model.length === 0), context, "isEmpty differs");
  recordOperation(report, "toArray");
  equalValueArrays(list.toArray(), model, context, "toArray");
  recordOperation(report, "iterator");
  equalValueArrays([...list], model, context, "iterator");
  const missing = Symbol("missing");
  recordOperation(report, "first");
  invariant(
    sameValue(list.first(missing), model.length === 0 ? missing : model[0]),
    context,
    "first differs",
  );
  recordOperation(report, "peek");
  invariant(
    sameValue(list.peek(missing), model.length === 0 ? missing : model[0]),
    context,
    "peek differs",
  );
  for (let index = 0; index < model.length; index += 1) {
    recordOperation(report, "nth");
    invariant(sameValue(list.nth(index), model[index]), context, `nth(${index}) differs`);
  }
  recordOperation(report, "nth-not-found");
  invariant(list.nth(model.length, missing) === missing, context, "nth fallback differs");
  recordOperation(report, "reduce");
  const reduced = list.reduce((tokens, value) => `${tokens}|${valueToken(value)}`, "");
  invariant(reduced === (model.length === 0 ? "" : `|${reduceValueTokens(model)}`), context, "reduce differs");
}

function runListSequence(sequence, seed, report, digest) {
  const random = sequenceRandom(seed, "list", sequence);
  let value = EMPTY_LIST;
  let model = [];
  const history = [];
  for (let step = 0; step < UPDATES_PER_SEQUENCE; step += 1) {
    const choice = nextRandom(random) % 4;
    const context = { family: "list", sequence, step, operation: "" };
    retainVersion(history, value, canonicalArray(value.toArray()));
    if (choice === 0) {
      context.operation = "conj";
      recordOperation(report, "conj");
      const item = generatedValue(random);
      value = value.conj(item);
      model = [item, ...model];
    } else if (choice === 1) {
      context.operation = "cons";
      recordOperation(report, "cons");
      const item = generatedValue(random);
      value = value.cons(item);
      model = [item, ...model];
    } else if (choice === 2) {
      context.operation = "rest";
      recordOperation(report, "rest");
      value = value.rest();
      model = model.slice(1);
    } else {
      context.operation = "pop";
      recordOperation(report, "pop");
      if (model.length === 0) {
        let rejected = false;
        try {
          value.pop();
        } catch (error) {
          rejected = error instanceof RangeError;
        }
        invariant(rejected, context, "empty pop did not reject with RangeError");
        report.rejectedUpdates += 1;
      } else {
        value = value.pop();
        model = model.slice(1);
      }
    }
    report.updates += 1;
    checkHistory(history, (version) => canonicalArray(version.toArray()), report, context);
    validateList(value, model, report, context);
    digest.update(`${sequence}:${step}:${context.operation}:${canonicalArray(model)}\n`);
  }
}

function validateVector(vector, model, report, context) {
  recordOperation(report, "count");
  invariant(vector.count === model.length, context, "count differs");
  recordOperation(report, "size");
  invariant(vector.size === model.length, context, "size differs");
  recordOperation(report, "toArray");
  equalValueArrays(vector.toArray(), model, context, "toArray");
  recordOperation(report, "iterator");
  equalValueArrays([...vector], model, context, "iterator");
  const missing = Symbol("missing");
  recordOperation(report, "peek");
  invariant(
    sameValue(vector.peek(missing), model.length === 0 ? missing : model.at(-1)),
    context,
    "peek differs",
  );
  for (let index = 0; index < model.length; index += 1) {
    recordOperation(report, "nth");
    invariant(sameValue(vector.nth(index), model[index]), context, `nth(${index}) differs`);
  }
  recordOperation(report, "nth-not-found");
  invariant(vector.nth(model.length, missing) === missing, context, "nth fallback differs");
  recordOperation(report, "reduce");
  const reduced = vector.reduce((tokens, item) => `${tokens}|${valueToken(item)}`, "");
  invariant(reduced === (model.length === 0 ? "" : `|${reduceValueTokens(model)}`), context, "reduce differs");
}

function runVectorSequence(sequence, seed, report, digest) {
  const random = sequenceRandom(seed, "vector", sequence);
  let value = EMPTY_VECTOR;
  let model = [];
  const history = [];
  for (let step = 0; step < UPDATES_PER_SEQUENCE; step += 1) {
    const choice = nextRandom(random) % 4;
    const context = { family: "vector", sequence, step, operation: "" };
    retainVersion(history, value, canonicalArray(value.toArray()));
    if (choice === 0) {
      context.operation = "conj";
      recordOperation(report, "conj");
      const item = generatedValue(random);
      value = value.conj(item);
      model = [...model, item];
    } else if (choice === 1) {
      context.operation = "assoc";
      recordOperation(report, "assoc");
      const index = model.length === 0 ? 0 : nextRandom(random) % model.length;
      const item = generatedValue(random);
      value = value.assoc(index, item);
      model = model.slice();
      model[index] = item;
    } else if (choice === 2) {
      context.operation = "assoc-append";
      recordOperation(report, "assoc-append");
      const item = generatedValue(random);
      value = value.assoc(value.count, item);
      model = [...model, item];
    } else {
      context.operation = "pop";
      recordOperation(report, "pop");
      if (model.length === 0) {
        let rejected = false;
        try {
          value.pop();
        } catch (error) {
          rejected = error instanceof RangeError;
        }
        invariant(rejected, context, "empty pop did not reject with RangeError");
        report.rejectedUpdates += 1;
      } else {
        value = value.pop();
        model = model.slice(0, -1);
      }
    }
    report.updates += 1;
    checkHistory(history, (version) => canonicalArray(version.toArray()), report, context);
    validateVector(value, model, report, context);
    digest.update(`${sequence}:${step}:${context.operation}:${canonicalArray(model)}\n`);
  }
}

function mapSnapshot(map) {
  return canonicalMapEntries(map.entries());
}

function validateMap(map, model, report, context, lastKey) {
  recordOperation(report, "count");
  invariant(map.count === model.size, context, "count differs");
  recordOperation(report, "size");
  invariant(map.size === model.size, context, "size differs");
  const probes = [...PROBE_KEYS, ...model.keys(), lastKey];
  for (const key of probes) {
    recordOperation(report, "has");
    invariant(map.has(key) === model.has(key), context, `has(${valueToken(key, true)}) differs`);
    const missing = Symbol("missing");
    recordOperation(report, "get");
    const actual = map.get(key, missing);
    const expected = model.has(key) ? model.get(key) : missing;
    invariant(actual === missing ? expected === missing : sameValue(actual, expected), context, `get(${valueToken(key, true)}) differs`);
  }
  recordOperation(report, "entries");
  invariant(mapSnapshot(map) === canonicalMapEntries(model.entries()), context, "entries differ");
  recordOperation(report, "iterator");
  invariant(canonicalMapEntries(map) === canonicalMapEntries(model), context, "iterator differs");
  recordOperation(report, "keys");
  invariant(canonicalSetValues(map.keys()) === canonicalSetValues(model.keys()), context, "keys differ");
  recordOperation(report, "values");
  invariant(
    [...map.values()].map((item) => valueToken(item)).sort().join("|") ===
      [...model.values()].map((item) => valueToken(item)).sort().join("|"),
    context,
    "values differ",
  );
  recordOperation(report, "toMap");
  invariant(canonicalMapEntries(map.toMap()) === canonicalMapEntries(model), context, "toMap differs");
  recordOperation(report, "reduce");
  const reduced = map.reduce((items, item, key) => {
    items.push(`${valueToken(key, true)}=${valueToken(item)}`);
    return items;
  }, []);
  invariant(reduced.sort().join("|") === canonicalMapEntries(model), context, "reduce differs");
}

function runMapSequence(sequence, seed, report, digest) {
  const random = sequenceRandom(seed, "map", sequence);
  let value = EMPTY_MAP;
  const model = new Map();
  const history = [];
  const trace = [];
  for (let step = 0; step < UPDATES_PER_SEQUENCE; step += 1) {
    const key = generatedKey(random);
    const choice = nextRandom(random) % 3;
    const context = { family: "map", sequence, step, operation: "", trace };
    retainVersion(history, value, mapSnapshot(value));
    if (choice < 2) {
      context.operation = "assoc";
      recordOperation(report, "assoc");
      const item = generatedValue(random);
      trace.push([context.operation, valueToken(key, true), valueToken(item)]);
      value = value.assoc(key, item);
      if (!model.has(key) || !sameValue(model.get(key), item)) {
        model.set(key, item);
      }
    } else {
      context.operation = "dissoc";
      recordOperation(report, "dissoc");
      trace.push([context.operation, valueToken(key, true)]);
      value = value.dissoc(key);
      model.delete(key);
    }
    report.updates += 1;
    checkHistory(history, mapSnapshot, report, context);
    validateMap(value, model, report, context, key);
    digest.update(`${sequence}:${step}:${context.operation}:${canonicalMapEntries(model)}\n`);
  }
}

function setSnapshot(set) {
  return canonicalSetValues(set.values());
}

function generatedKeyGroup(random) {
  return [generatedKey(random), generatedKey(random), generatedKey(random), generatedKey(random)];
}

function validateSet(set, model, report, context, lastValues) {
  recordOperation(report, "count");
  invariant(set.count === model.size, context, "count differs");
  recordOperation(report, "size");
  invariant(set.size === model.size, context, "size differs");
  const probes = [...PROBE_KEYS, ...model, ...lastValues];
  for (const item of probes) {
    recordOperation(report, "has");
    invariant(set.has(item) === model.has(item), context, `has(${valueToken(item, true)}) differs`);
  }
  recordOperation(report, "values");
  invariant(setSnapshot(set) === canonicalSetValues(model), context, "values differ");
  recordOperation(report, "keys");
  invariant(canonicalSetValues(set.keys()) === canonicalSetValues(model), context, "keys differ");
  recordOperation(report, "iterator");
  invariant(canonicalSetValues(set) === canonicalSetValues(model), context, "iterator differs");
  recordOperation(report, "entries");
  for (const [left, right] of set.entries()) {
    invariant(sameValue(left, right), context, "entry member pair differs");
    invariant(model.has(left), context, "entry member is absent from model");
  }
  recordOperation(report, "toSet");
  invariant(canonicalSetValues(set.toSet()) === canonicalSetValues(model), context, "toSet differs");
  recordOperation(report, "reduce");
  const reduced = set.reduce((items, item) => {
    items.push(valueToken(item, true));
    return items;
  }, []);
  invariant(reduced.sort().join("|") === canonicalSetValues(model), context, "reduce differs");

  const comparison = new Set(lastValues);
  recordOperation(report, "isSubsetOf");
  invariant(set.isSubsetOf(lastValues) === [...model].every((item) => comparison.has(item)), context, "isSubsetOf differs");
  recordOperation(report, "isSupersetOf");
  invariant(set.isSupersetOf(lastValues) === [...comparison].every((item) => model.has(item)), context, "isSupersetOf differs");
  recordOperation(report, "isDisjointFrom");
  invariant(set.isDisjointFrom(lastValues) === [...comparison].every((item) => !model.has(item)), context, "isDisjointFrom differs");
}

function runSetSequence(sequence, seed, report, digest) {
  const random = sequenceRandom(seed, "set", sequence);
  let value = EMPTY_SET;
  let model = new Set();
  const history = [];
  for (let step = 0; step < UPDATES_PER_SEQUENCE; step += 1) {
    const choice = nextRandom(random) % 5;
    const items = generatedKeyGroup(random);
    const context = { family: "set", sequence, step, operation: "" };
    retainVersion(history, value, setSnapshot(value));
    if (choice === 0) {
      context.operation = "conj";
      recordOperation(report, "conj");
      value = value.conj(items[0]);
      model.add(items[0]);
    } else if (choice === 1) {
      context.operation = "disj";
      recordOperation(report, "disj");
      value = value.disj(items[0]);
      model.delete(items[0]);
    } else if (choice === 2) {
      context.operation = "union";
      recordOperation(report, "union");
      value = value.union(items);
      model = new Set([...model, ...items]);
    } else if (choice === 3) {
      context.operation = "intersection";
      recordOperation(report, "intersection");
      const other = new Set(items);
      value = value.intersection(items);
      model = new Set([...model].filter((item) => other.has(item)));
    } else {
      context.operation = "difference";
      recordOperation(report, "difference");
      const other = new Set(items);
      value = value.difference(items);
      model = new Set([...model].filter((item) => !other.has(item)));
    }
    report.updates += 1;
    checkHistory(history, setSnapshot, report, context);
    validateSet(value, model, report, context, items);
    digest.update(`${sequence}:${step}:${context.operation}:${canonicalSetValues(model)}\n`);
  }
}

const FAMILY_RUNNERS = Object.freeze({
  list: runListSequence,
  vector: runVectorSequence,
  map: runMapSequence,
  set: runSetSequence,
});

function emptyFamilyReport() {
  return {
    sequences: 0,
    updates: 0,
    rejectedUpdates: 0,
    previousVersionsChecked: 0,
    operations: {},
    digest: "",
  };
}

export function runPersistentSemanticsCorpus(options = {}) {
  const seed = options.seed ?? DEFAULT_SEED;
  const sequences = options.sequences ?? DEFAULT_SEQUENCES;
  const selectedFamilies = options.family === undefined || options.family === null
    ? FAMILY_ORDER
    : [options.family];
  const selectedSequence = options.sequence ?? null;
  const familyReports = {};
  const overall = createHash("sha256");

  for (const family of selectedFamilies) {
    const report = emptyFamilyReport();
    const digest = createHash("sha256");
    const start = selectedSequence ?? 0;
    const end = selectedSequence === null ? sequences : selectedSequence + 1;
    for (let sequence = start; sequence < end; sequence += 1) {
      FAMILY_RUNNERS[family](sequence, seed, report, digest);
      report.sequences += 1;
    }
    report.digest = digest.digest("hex");
    familyReports[family] = report;
    overall.update(`${family}:${report.sequences}:${report.updates}:${report.digest}\n`);
  }

  const acceptanceEligible =
    seed === DEFAULT_SEED &&
    sequences === DEFAULT_SEQUENCES &&
    selectedFamilies.length === FAMILY_ORDER.length &&
    selectedSequence === null;
  return {
    schemaVersion: 1,
    format: "eliscript-persistent-semantics-corpus",
    version: 1,
    verified: true,
    acceptanceEligible,
    seed: `0x${seed.toString(16).padStart(8, "0")}`,
    sequencesPerFamily: sequences,
    updatesPerSequence: UPDATES_PER_SEQUENCE,
    totalSequences: Object.values(familyReports)
      .reduce((total, report) => total + report.sequences, 0),
    totalUpdates: Object.values(familyReports)
      .reduce((total, report) => total + report.updates, 0),
    families: familyReports,
    digest: overall.digest("hex"),
  };
}

const invokedPath = process.argv[1] === undefined ? null : resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  const options = parseArguments(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify(runPersistentSemanticsCorpus(options), null, 2)}\n`);
}
