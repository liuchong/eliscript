import { expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  IKVReduce,
  IReduce,
  count as collectionCount,
  isReduced,
  isSequenceView,
  reduced,
  seq,
  unreduced,
} from "../runtime/core/collection.mjs";
import {
  assocIn,
  countBy,
  frequencies,
  getIn,
  groupBy,
  indexBy,
  keys as dataKeys,
  merge as mergeData,
  mergeWith,
  selectKeys,
  update as updateData,
  updateIn,
  updateKeys,
  updateVals,
  vals as dataVals,
  zipmap,
} from "../runtime/core/data.mjs";
import { EMPTY_MAP } from "../runtime/core/map.mjs";
import { extendProtocolType } from "../runtime/core/protocol.mjs";
import {
  butlast,
  concat,
  cycle,
  dedupe,
  distinct,
  drop,
  dropLast,
  dropWhile,
  every,
  filter,
  find,
  first,
  generate,
  interpose,
  keep,
  keepIndexed,
  last,
  iterate,
  map,
  mapIndexed,
  mapcat,
  sequenceNth,
  partitionAll,
  partitionBy,
  reductions,
  remove,
  repeat,
  repeatedly,
  reverse,
  range,
  some,
  splitAt,
  splitWith,
  take,
  takeLast,
  takeNth,
  takeWhile,
} from "../runtime/core/sequence.mjs";
import {
  composeTransducers,
  dropping,
  filtering,
  into,
  mapping,
  removing,
} from "../runtime/core/transducer.mjs";
import {
  EMPTY_VECTOR,
  persistentVector,
} from "../runtime/core/vector.mjs";
import {
  persistentMapMetrics,
  resetPersistentMapMetrics,
  resetTransientMapMetrics,
  transientMapMetrics,
} from "../runtime/testing/map.mjs";

const ROOT = resolve(import.meta.dir, "..");
const EMACS = process.env.EMACS ??
  "/opt/homebrew/Cellar/emacs-plus@30/30.2/bin/emacs";
const COMPILER = resolve(ROOT, "bin/eliscript");
const USAGE_SOURCE = resolve(ROOT, "tests/fixtures/core-stdlib-usage.eli");
const API_USAGE_SOURCE = resolve(
  ROOT,
  "tests/fixtures/core-language-api-usage.eli",
);
const HOST_FIXTURE = resolve(ROOT, "tests/fixtures/core-stdlib-host.mjs");

async function runSuccessful(command) {
  const child = Bun.spawn(command, {
    cwd: ROOT,
    env: { ...process.env, EMACS },
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

async function compile(source, output) {
  await mkdir(dirname(output), { recursive: true });
  await runSuccessful([COMPILER, "--source-map", "--output", output, source]);
}

async function runHost(command) {
  return JSON.parse(await runSuccessful([command, HOST_FIXTURE]));
}

async function runBuiltCoreProjectHost(command, outputRoot) {
  const moduleUrl = (name) => JSON.stringify(pathToFileURL(
    resolve(outputRoot, `core/${name}.mjs`),
  ).href);
  const runtimeUrl = JSON.stringify(pathToFileURL(
    resolve(ROOT, "runtime/core/vector.mjs"),
  ).href);
  const source = [
    `const protocol = await import(${moduleUrl("protocol")});`,
    `const collection = await import(${moduleUrl("collection")});`,
    `const transient = await import(${moduleUrl("transient")});`,
    `const transducer = await import(${moduleUrl("transducer")});`,
    `const sequence = await import(${moduleUrl("seq")});`,
    `const data = await import(${moduleUrl("data")});`,
    `const set = await import(${moduleUrl("set")});`,
    `const order = await import(${moduleUrl("order")});`,
    `const text = await import(${moduleUrl("text")});`,
    `const object = await import(${moduleUrl("object")});`,
    `const vector = await import(${runtimeUrl});`,
    "const named = protocol.define_protocol('Named', ['name']);",
    "protocol.extend_protocol_category(named, 'number',",
    "  { name: (value) => `n:${value}` });",
    "const name = protocol.protocol_method(named, 'name');",
    "const sourceValues = vector.persistentVector(1, 2, 3, 2);",
    "const builder = transient.transient(vector.EMPTY_VECTOR);",
    "transient.conj_BANG_(builder, 4, 5);",
    "const built = transient.persistent_BANG_(builder);",
    "const transformed = transducer.into(",
    "  vector.EMPTY_VECTOR,",
    "  transducer.compose_transducers(",
    "    transducer.mapping((value) => value * 2),",
    "    transducer.filtering((value) => value > 3)),",
    "  sourceValues);",
    "const mapped = sequence.map((value) => value + 1, sourceValues);",
    "let generatedState = 0;",
    "const counts = data.frequencies(sourceValues);",
    "const nested = data.update_in(",
    "  data.assoc_in(null, ['profile', 'visits'], 1),",
    "  ['profile', 'visits'],",
    "  (value, amount) => value + amount, 4);",
    "const mergedData = data.merge({ left: 1 }, { left: 3, right: 2 });",
    "let orderKeyCalls = 0;",
    "const mappedObject = object.map_values(",
    "  (value) => value * 10, { left: 1, right: 2 });",
    "console.log(JSON.stringify({",
    "  protocol: name(7),",
    "  count: collection.collection_count(sourceValues),",
    "  built: [...built],",
    "  transformed: [...transformed],",
    "  mapped: [...mapped],",
    "  sequence: [",
    "    sequence.first(sourceValues),",
    "    sequence.last(sourceValues),",
    "    sequence.sequence_nth(2, sourceValues),",
    "    [...sequence.take_last(2, sourceValues)],",
    "    [...sequence.drop_last(2, sourceValues)],",
    "    [...sequence.split_at(2, sourceValues)].map((part) => [...part]),",
    "  ],",
    "  sources: [",
    "    [...sequence.range(1, 8, 2)],",
    "    [...sequence.take(5, sequence.range())],",
    "    [...sequence.take(4, sequence.repeat('x'))],",
    "    [...sequence.repeatedly(3, () => ++generatedState)],",
    "    [...sequence.take(5, sequence.iterate((value) => value * 2, 1))],",
    "    [...sequence.take(7, sequence.cycle([1, 2, 3]))],",
    "    [...sequence.generate(4, (index) => index * index)],",
    "  ],",
    "  frequencies: [counts.get(1), counts.get(2), counts.get(3)],",
    "  data: [",
    "    data.get_in(nested, ['profile', 'visits']),",
    "    mergedData.get('left'),",
    "    mergedData.get('right'),",
    "  ],",
    "  set: [",
    "    [...set.intersection([1, 2, 3], [2, 3, 4])].sort((a, b) => a - b),",
    "    set.subset_QMARK_([1, 2], [1, 2, 3]),",
    "    set.disjoint_QMARK_([1, 2], [3, 4]),",
    "  ],",
    "  order: [",
    "    [...order.sort(sourceValues)],",
    "    [...order.sort_by((value) => {",
    "      orderKeyCalls += 1;",
    "      return value.group;",
    "    }, [",
    "      { group: 2, id: 'first' },",
    "      { group: 1, id: 'middle' },",
    "      { group: 2, id: 'last' },",
    "    ])].map((value) => value.id),",
    "    order.min_key((value) => value.rank,",
    "      { rank: 2, id: 'high' }, { rank: 1, id: 'low' }).id,",
    "    order.max_key((value) => value.rank,",
    "      { rank: 2, id: 'first' }, { rank: 2, id: 'last' }).id,",
    "    orderKeyCalls,",
    "  ],",
    "  text: [text.slice(1, 4, 'Eliscript'), text.join('-', sourceValues)],",
    "  object: [mappedObject.left, mappedObject.right],",
    "}));",
  ].join("\n");
  return JSON.parse(await runSuccessful([
    command,
    "--input-type=module",
    "--eval",
    source,
  ]));
}

async function runBuiltPortableUtilityProjectHost(command, outputRoot) {
  const moduleUrl = (name) => JSON.stringify(pathToFileURL(
    resolve(outputRoot, `${name}.mjs`),
  ).href);
  const source = [
    `const sequence = await import(${moduleUrl("sequence")});`,
    `const text = await import(${moduleUrl("text")});`,
    `const object = await import(${moduleUrl("object")});`,
    `const data = await import(${moduleUrl("data")});`,
    "const values = [1, 2, 3, 4];",
    "const sourceObject = { left: 1 };",
    "const merged = object.merge(sourceObject, { left: 3, right: 2 });",
    "const grouped = data.group_by((value) => value % 2, values);",
    "const counted = data.count_by((value) => value % 2, values);",
    "console.log(JSON.stringify({",
    "  sequence: [",
    "    sequence.map((value) => value * 3, values),",
    "    sequence.reduce((sum, value) => sum + value, 0, values),",
    "  ],",
    "  text: [",
    "    text.trim('  Eliscript\\n'),",
    "    text.join('-', values),",
    "    text.contains_QMARK_('script', 'Eliscript'),",
    "  ],",
    "  object: [merged.left, merged.right, sourceObject.left],",
    "  data: [grouped[0], grouped[1], counted[0], counted[1]],",
    "}));",
  ].join("\n");
  return JSON.parse(await runSuccessful([
    command,
    "--input-type=module",
    "--eval",
    source,
  ]));
}

async function runBuiltPersistentValueProjectHost(command, outputRoot) {
  const moduleUrl = (name) => JSON.stringify(pathToFileURL(
    resolve(outputRoot, `${name}.mjs`),
  ).href);
  const source = [
    `const bit = await import(${moduleUrl("bit")});`,
    `const list = await import(${moduleUrl("persistent-list")});`,
    `const vector = await import(${moduleUrl("persistent-vector")});`,
    `const map = await import(${moduleUrl("persistent-map")});`,
    `const set = await import(${moduleUrl("persistent-set")});`,
    `const value = await import(${moduleUrl("value")});`,
    "const sourceVector = vector.persistent_vector_from_array([1, 2, 3]);",
    "const changedVector = vector.persistent_vector_assoc(sourceVector, 1, 20);",
    "const sourceList = list.persistent_list_from_array(['a', 'b', 'c']);",
    "const equalKey = () => vector.persistent_vector_from_array(['key']);",
    "const valueMap = value.value_map_from_entries([",
    "  [equalKey(), sourceList],",
    "  ['undefined', undefined],",
    "]);",
    "const valueSet = value.value_set_from_array([",
    "  equalKey(),",
    "  sourceList,",
    "  equalKey(),",
    "]);",
    "const foundList = map.persistent_map_get(valueMap, equalKey(), null);",
    "const equivalentVector = vector.persistent_vector_from_array([1, 2, 3]);",
    "console.log(JSON.stringify({",
    "  bit: [bit.bit_count(4042322160), bit.rotate_left(1, 1),",
    "    bit.rotate_right(1, 1)],",
    "  vector: [",
    "    vector.persistent_vector_to_array(sourceVector),",
    "    vector.persistent_vector_to_array(changedVector),",
    "  ],",
    "  list: list.persistent_list_to_array(foundList),",
    "  map: [",
    "    map.persistent_map_count(valueMap),",
    "    map.persistent_map_has_QMARK_(valueMap, 'undefined'),",
    "    map.persistent_map_get(valueMap, 'undefined', 'missing') === undefined,",
    "  ],",
    "  set: [",
    "    set.persistent_set_count(valueSet),",
    "    set.persistent_set_has_QMARK_(valueSet, equalKey()),",
    "  ],",
    "  value: [",
    "    value.value_equal_QMARK_(sourceVector, equivalentVector),",
    "    value.value_hash(sourceVector) === value.value_hash(equivalentVector),",
    "  ],",
    "}));",
  ].join("\n");
  return JSON.parse(await runSuccessful([
    command,
    "--input-type=module",
    "--eval",
    source,
  ]));
}

async function runBuiltValueTextProjectHost(command, outputRoot) {
  const moduleUrl = (name) => JSON.stringify(pathToFileURL(
    resolve(outputRoot, `${name}.mjs`),
  ).href);
  const source = [
    `const dataText = await import(${moduleUrl("data-text")});`,
    `const identifier = await import(${moduleUrl("identifier")});`,
    `const list = await import(${moduleUrl("persistent-list")});`,
    `const map = await import(${moduleUrl("persistent-map")});`,
    `const metadata = await import(${moduleUrl("metadata")});`,
    `const set = await import(${moduleUrl("persistent-set")});`,
    `const value = await import(${moduleUrl("value")});`,
    `const vector = await import(${moduleUrl("persistent-vector")});`,
    "const keyword = identifier.keyword;",
    "const symbol = identifier.symbol;",
    "const unwrap = dataText.data_text_result_value;",
    "let metadataValue = value.empty_value_map();",
    "metadataValue = map.persistent_map_assoc(",
    "  metadataValue, keyword('source'), 'project');",
    "let members = value.empty_value_set();",
    "for (const item of [3, 1, 2])",
    "  members = set.persistent_set_conj(members, item);",
    "const annotated = metadata.with_meta(",
    "  vector.persistent_vector_from_array([symbol('article/title'), members]),",
    "  metadataValue);",
    "const root = list.persistent_list_from_array([",
    "  keyword('article/title'), annotated,",
    "]);",
    "const printed = dataText.print_value(root);",
    "const restored = dataText.read_value(unwrap(printed));",
    "const restoredRoot = unwrap(restored);",
    "const restoredAnnotated = list.persistent_list_nth(restoredRoot, 1, null);",
    "const duplicate = dataText.read_value('{:a 1 :a 2}');",
    "console.log(JSON.stringify({",
    "  identifier: [",
    "    identifier.qualified_name(keyword('article/title')),",
    "    identifier.qualified_name(symbol('article', 'title')),",
    "    identifier.keyword_QMARK_(keyword('article/title')),",
    "    identifier.symbol_QMARK_(symbol('article/title')),",
    "  ],",
    "  metadata: [",
    "    map.persistent_map_get(",
    "      metadata.meta(restoredAnnotated), keyword('source'), null),",
    "    value.value_equal_QMARK_(annotated, restoredAnnotated),",
    "    value.value_hash(annotated) === value.value_hash(restoredAnnotated),",
    "  ],",
    "  text: unwrap(printed),",
    "  roundTrip: value.value_equal_QMARK_(root, restoredRoot),",
    "  fixedPoint: unwrap(dataText.print_value(restoredRoot)) === unwrap(printed),",
    "  error: [duplicate.error.code, duplicate.error.line, duplicate.error.column],",
    "}));",
  ].join("\n");
  return JSON.parse(await runSuccessful([
    command,
    "--input-type=module",
    "--eval",
    source,
  ]));
}

async function runBuiltPublicStdlibProjectHost(command, outputRoot) {
  const moduleUrl = (name) => JSON.stringify(pathToFileURL(
    resolve(outputRoot, `${name}.mjs`),
  ).href);
  const source = [
    `const atom = await import(${moduleUrl("state/atom")});`,
    `const interop = await import(${moduleUrl("interop/js")});`,
    `const json = await import(${moduleUrl("json")});`,
    `const numeric = await import(${moduleUrl("numeric")});`,
    `const result = await import(${moduleUrl("result")});`,
    `const value = await import(${moduleUrl("value")});`,
    "const transitions = [];",
    "const reference = atom.atom(1);",
    "atom.add_watch(reference, 'project', (_key, _ref, oldValue, newValue) => {",
    "  transitions.push([oldValue, newValue]);",
    "});",
    "const swapped = atom.swap_BANG_(reference, (current, amount) =>",
    "  current + amount, 4);",
    "const reset = atom.reset_BANG_(reference, 2);",
    "const hostSource = { items: [1, 2], nested: { ready: true } };",
    "const persistentSnapshot = interop.from_js(hostSource, { deep: true });",
    "hostSource.items.push(3);",
    "const restoredHost = interop.to_js_object(",
    "  persistentSnapshot, { deep: true });",
    "const parsed = json.parse_json('{\"b\":2,\"a\":[1,true]}');",
    "const encoded = json.stringify_json(result.result_payload(parsed));",
    "const leftIdentity = {};",
    "const rightIdentity = {};",
    "const leftHash = value.value_hash(leftIdentity);",
    "const mapped = result.map_ok((item) => item + 1, result.ok(41));",
    "const failed = result.err('stop');",
    "console.log(JSON.stringify({",
    "  atom: [",
    "    atom.atom_QMARK_(reference), swapped, reset, atom.deref(reference),",
    "    transitions,",
    "  ],",
    "  interop: [",
    "    restoredHost.items, restoredHost.nested.get('ready'), hostSource.items.length,",
    "    interop.object_QMARK_(restoredHost), interop.array_QMARK_(restoredHost.items),",
    "    interop.js_map_QMARK_(restoredHost.nested),",
    "  ],",
    "  result: [",
    "    result.ok_QMARK_(mapped), result.result_payload(mapped),",
    "    result.err_QMARK_(failed), result.result_payload(failed),",
    "  ],",
    "  json: [",
    "    result.ok_QMARK_(parsed), result.ok_QMARK_(encoded),",
    "    result.result_payload(encoded),",
    "  ],",
    "  numeric: [",
    "    numeric.gcd(54, 24), numeric.lcm(21, 6),",
    "    numeric.modulo(-5, 3),",
    "    numeric.checked_add(Number.MAX_SAFE_INTEGER, 1),",
    "  ],",
    "  identity: [",
    "    leftHash === value.value_hash(leftIdentity),",
    "    leftHash !== value.value_hash(rightIdentity),",
    "    value.value_equal_QMARK_(leftIdentity, leftIdentity),",
    "    value.value_equal_QMARK_(leftIdentity, rightIdentity),",
    "  ],",
    "}));",
  ].join("\n");
  return JSON.parse(await runSuccessful([
    command,
    "--input-type=module",
    "--eval",
    source,
  ]));
}

test("sequence algorithms use protocols and Eliscript truthiness", () => {
  class Range {
    constructor(start, end, observe = () => {}) {
      this.start = start;
      this.end = end;
      this.observe = observe;
      Object.freeze(this);
    }
  }
  extendProtocolType(IReduce, Range, {
    reduce: (range, reducer, initial) => {
      let result = initial;
      for (let value = range.start; value < range.end; value += 1) {
        range.observe(value);
        result = reducer(result, value);
        if (isReduced(result)) {
          return unreduced(result);
        }
      }
      return result;
    },
  });

  const values = new Range(0, 6);
  expect([...reverse(values)]).toEqual([5, 4, 3, 2, 1, 0]);
  expect([...map((value) => value * 2, values)]).toEqual([0, 2, 4, 6, 8, 10]);
  expect([...filter((value) => value === 0 ? 0 : value % 2 === 0, values)])
    .toEqual([0, 2, 4]);
  expect([...remove((value) => value === 2, values)]).toEqual([0, 1, 3, 4, 5]);
  expect([...take(3, values)]).toEqual([0, 1, 2]);
  const takenValues = [];
  expect([...take(3, new Range(0, 100, (value) => takenValues.push(value)))])
    .toEqual([0, 1, 2]);
  expect(takenValues).toEqual([0, 1, 2]);
  expect([...drop(3, values)]).toEqual([3, 4, 5]);
  expect([...concat([0], persistentVector(1, 2), null, new Set([3, 4]))])
    .toEqual([0, 1, 2, 3, 4]);
  expect(some((value) => value === 2 ? 0 : null, values)).toBe(0);
  expect(some(() => null, values, "missing")).toBe("missing");
  expect(every(() => "", values)).toBe(true);
  expect(every((value) => value < 4, values)).toBe(false);
  expect(find((value) => value === 0, values, "missing")).toBe(0);
  const foundValues = [];
  expect(find(
    (value) => value === 0,
    new Range(0, 100, (value) => foundValues.push(value)),
    "missing",
  )).toBe(0);
  expect(foundValues).toEqual([0]);
  expect(find(() => false, values, "missing")).toBe("missing");
});

test("expanded sequence vocabulary builds persistent results through protocols", () => {
  class ProtocolValues {
    constructor(values) {
      this.values = Object.freeze([...values]);
      Object.freeze(this);
    }
  }
  extendProtocolType(IReduce, ProtocolValues, {
    reduce: (source, reducer, initial) => {
      let result = initial;
      for (const value of source.values) {
        result = reducer(result, value);
        if (isReduced(result)) return unreduced(result);
      }
      return result;
    },
  });
  const source = (...values) => new ProtocolValues(values);
  const values = source(0, 1, 2, 3, 4, 5);
  expect([...mapIndexed((index, value) => `${index}:${value}`, values)])
    .toEqual(["0:0", "1:1", "2:2", "3:3", "4:4", "5:5"]);
  expect([...keep((value) => value % 2 === 0 ? value : null, values)])
    .toEqual([0, 2, 4]);
  expect([...keepIndexed((index, value) => value % 2 === 0
    ? persistentVector(index, value)
    : null, values)].map((value) => [...value]))
    .toEqual([[0, 0], [2, 2], [4, 4]]);
  expect([...takeWhile((value) => value < 3, values)]).toEqual([0, 1, 2]);
  expect([...dropWhile((value) => value < 3, values)]).toEqual([3, 4, 5]);
  expect([...takeNth(2, values)]).toEqual([0, 2, 4]);
  expect([...interpose("between", source("left", "middle", "right"))])
    .toEqual(["left", "between", "middle", "between", "right"]);
  expect([...dedupe(source(1, 1, 2, 1, 1))]).toEqual([1, 2, 1]);

  const equalKey = () => persistentVector("same");
  const first = equalKey();
  expect([...distinct(source(first, 1, equalKey(), 2, 1, first))])
    .toEqual([first, 1, 2]);
  expect([...mapcat(
    (value) => persistentVector(value, value * 10),
    source(1, 2, 3),
  )])
    .toEqual([1, 10, 2, 20, 3, 30]);
  expect([...partitionAll(2, values)].map((value) => [...value]))
    .toEqual([[0, 1], [2, 3], [4, 5]]);
  expect([...partitionBy((value) => value % 2, source(1, 3, 2, 4, 5))]
    .map((value) => [...value]))
    .toEqual([[1, 3], [2, 4], [5]]);

  const observed = [];
  class ObservedRange {
    constructor(end) {
      this.end = end;
      Object.freeze(this);
    }
  }
  extendProtocolType(IReduce, ObservedRange, {
    reduce: (range, reducer, initial) => {
      let result = initial;
      for (let value = 1; value < range.end; value += 1) {
        observed.push(value);
        result = reducer(result, value);
        if (isReduced(result)) return unreduced(result);
      }
      return result;
    },
  });
  expect([...reductions(
    (sum, value) => value === 3 ? reduced(sum + value) : sum + value,
    0,
    new ObservedRange(100),
  )]).toEqual([0, 1, 3, 6]);
  expect(observed).toEqual([1, 2, 3]);
  expect([...reductions(() => 99, reduced(7), new ObservedRange(100))])
    .toEqual([7]);
  expect(observed).toEqual([1, 2, 3]);
  expect(() => reductions(null, 0, values))
    .toThrow("reductions step must be a function");
});

test("finite sequence selection is single-pass, bounded, and nullish-safe", () => {
  class ObservedValues {
    constructor(values, observations) {
      this.values = Object.freeze([...values]);
      this.observations = observations;
      Object.freeze(this);
    }
  }
  extendProtocolType(IReduce, ObservedValues, {
    reduce: (source, reducer, initial) => {
      let result = initial;
      for (const value of source.values) {
        source.observations.push(value);
        result = reducer(result, value);
        if (isReduced(result)) return unreduced(result);
      }
      return result;
    },
  });
  const observed = [];
  const source = (...values) => new ObservedValues(values, observed);

  expect(first(source(undefined, 1), "missing")).toBeUndefined();
  expect(observed).toEqual([undefined]);
  observed.length = 0;
  expect(sequenceNth(2, source("a", "b", undefined, "d"), "missing"))
    .toBeUndefined();
  expect(observed).toEqual(["a", "b", undefined]);
  expect(sequenceNth(8, source(1, 2), "missing")).toBe("missing");
  expect(last(source(1, 2, undefined), "missing")).toBeUndefined();
  expect(first(source(), "missing")).toBe("missing");
  expect(last(source(), "missing")).toBe("missing");

  expect([...takeLast(3, source(0, 1, 2, 3, 4))]).toEqual([2, 3, 4]);
  expect([...takeLast(9, source(0, 1, 2))]).toEqual([0, 1, 2]);
  expect([...takeLast(0, source(0, 1, 2))]).toEqual([]);
  expect([...dropLast(2, source(0, 1, 2, 3, 4))]).toEqual([0, 1, 2]);
  expect([...dropLast(9, source(0, 1, 2))]).toEqual([]);
  expect([...dropLast(0, source(0, 1, 2))]).toEqual([0, 1, 2]);
  expect([...butlast(source(0, 1, 2))]).toEqual([0, 1]);

  const at = splitAt(2, source(0, 1, 2, 3));
  expect([...at].map((part) => [...part])).toEqual([[0, 1], [2, 3]]);
  const predicateCalls = [];
  const withPrefix = splitWith((value) => {
    predicateCalls.push(value);
    return value < 3 ? 0 : false;
  }, source(1, 2, 3, 4, 5));
  expect([...withPrefix].map((part) => [...part])).toEqual([[1, 2], [3, 4, 5]]);
  expect(predicateCalls).toEqual([1, 2, 3]);

  for (const operation of [
    () => sequenceNth(-1, source()),
    () => takeLast(1.5, source()),
    () => dropLast(Number.MAX_SAFE_INTEGER + 1, source()),
    () => splitAt(-1, source()),
  ]) {
    expect(operation).toThrow("must be a non-negative safe integer");
  }
  expect(() => splitWith(null, source())).toThrow(
    "splitWith predicate must be a function",
  );

  const large = new ObservedValues(
    Array.from({ length: 100_000 }, (_, index) => index),
    observed,
  );
  expect([...takeLast(3, large)]).toEqual([99_997, 99_998, 99_999]);
  expect(dropLast(3, large).count).toBe(99_997);
});

test("replayable sequence sources compose lazily with bounded reduction", () => {
  const unboundedRange = range();
  expect(isSequenceView(unboundedRange)).toBe(true);
  expect(seq(unboundedRange)).toBe(unboundedRange);
  expect(() => collectionCount(unboundedRange)).toThrow(
    "unbounded sequence does not have a finite count",
  );
  expect([...take(5, unboundedRange)]).toEqual([0, 1, 2, 3, 4]);
  expect([...take(5, unboundedRange)]).toEqual([0, 1, 2, 3, 4]);

  expect([...range(5)]).toEqual([0, 1, 2, 3, 4]);
  expect([...range(1, 8, 2)]).toEqual([1, 3, 5, 7]);
  expect([...range(5, -1, -2)]).toEqual([5, 3, 1]);
  expect([...range(0, 1, 0.25)]).toEqual([0, 0.25, 0.5, 0.75]);
  expect(range(5, 0)).toBeNull();
  expect(collectionCount(range(0, 7, 2))).toBe(4);

  expect([...take(4, repeat("value"))]).toEqual([
    "value", "value", "value", "value",
  ]);
  expect([...repeat(3, undefined)]).toEqual([
    undefined, undefined, undefined,
  ]);
  expect(repeat(0, "value")).toBeNull();

  let repeatedCalls = 0;
  const produced = repeatedly(3, () => ++repeatedCalls);
  expect(repeatedCalls).toBe(0);
  expect([...produced]).toEqual([1, 2, 3]);
  expect([...produced]).toEqual([4, 5, 6]);

  let iterationCalls = 0;
  const powers = iterate((value) => {
    iterationCalls += 1;
    return value * 2;
  }, 1);
  expect([...take(5, powers)]).toEqual([1, 2, 4, 8, 16]);
  expect(iterationCalls).toBe(4);

  let cyclePulls = 0;
  class CycleSource {
    constructor(values) {
      this.values = values;
    }
  }
  extendProtocolType(IReduce, CycleSource, {
    reduce: (source, reducer, initial) => {
      let result = initial;
      for (const value of source.values) {
        cyclePulls += 1;
        result = reducer(result, value);
        if (isReduced(result)) return unreduced(result);
      }
      return result;
    },
  });
  const finiteSource = new CycleSource([1, 2, 3]);
  expect([...take(7, cycle(finiteSource))]).toEqual([1, 2, 3, 1, 2, 3, 1]);
  expect(cyclePulls).toBe(3);
  expect(cycle(null)).toBeNull();

  let generatedCalls = 0;
  const generated = generate(4, (index) => {
    generatedCalls += 1;
    return index * index;
  });
  expect(generatedCalls).toBe(0);
  expect([...generated]).toEqual([0, 1, 4, 9]);
  expect(generatedCalls).toBe(4);
  expect(last(take(100_000, range()))).toBe(99_999);

  for (const operation of [
    () => range(0, 1, 0),
    () => range(Number.POSITIVE_INFINITY),
    () => range(0, 1, 1, 2),
    () => repeat(-1, "value"),
    () => repeat(),
    () => repeatedly(1, null),
    () => iterate(null, 0),
    () => generate(1.5, () => 0),
    () => generate(1, null),
  ]) {
    expect(operation).toThrow();
  }
});

test("removing and dropping compose with fresh reduction state", () => {
  const pipeline = composeTransducers(
    dropping(2),
    removing((value) => value === 4),
    mapping((value) => value * 10),
    filtering((value) => value === 0 ? 0 : true),
  );
  expect([...into(EMPTY_VECTOR, pipeline, [0, 1, 2, 3, 4, 5])])
    .toEqual([20, 30, 50]);
  expect([...into(EMPTY_VECTOR, pipeline, [0, 1, 2, 3, 4, 5])])
    .toEqual([20, 30, 50]);
  expect(() => dropping(-1)).toThrow(
    "dropping limit must be a non-negative safe integer",
  );
  expect(() => removing(null)).toThrow("removing predicate must be a function");
});

test("data algorithms return persistent value-semantic maps and vectors", () => {
  const equalKey = () => persistentVector("same");
  const values = persistentVector(
    { id: 1, kind: "note" },
    { id: 2, kind: "guide" },
    { id: 3, kind: "note" },
  );
  const calls = [];
  const indexed = indexBy((value) => {
    calls.push(value.id);
    return value.kind;
  }, values);
  expect(calls).toEqual([1, 2, 3]);
  expect(indexed.get("note").id).toBe(3);
  expect(indexed.get("guide").id).toBe(2);

  const grouped = groupBy((value) => value.kind, values);
  expect([...grouped.get("note")].map(({ id }) => id)).toEqual([1, 3]);
  expect([...grouped.get("guide")].map(({ id }) => id)).toEqual([2]);
  const counted = countBy((value) => value.kind, values);
  expect(counted.get("note")).toBe(2);
  expect(counted.get("guide")).toBe(1);

  const valueKeys = groupBy(equalKey, values);
  expect(valueKeys.count).toBe(1);
  expect([...valueKeys.get(equalKey())].map(({ id }) => id)).toEqual([1, 2, 3]);
  const counts = frequencies(persistentVector("a", "b", "a", "c", "b", "a"));
  expect(counts.get("a")).toBe(3);
  expect(counts.get("b")).toBe(2);
  expect(counts.get("c")).toBe(1);
  expect(indexBy((value) => value, null)).toBe(EMPTY_MAP);
  expect(groupBy((value) => value, null)).toBe(EMPTY_MAP);
  expect(countBy((value) => value, null)).toBe(EMPTY_MAP);
});

test("associative data algorithms preserve nested and value-semantic behavior", () => {
  class ProtocolValues {
    constructor(values) {
      this.values = Object.freeze([...values]);
      Object.freeze(this);
    }
  }
  extendProtocolType(IReduce, ProtocolValues, {
    reduce: (source, reducer, initial) => {
      let result = initial;
      for (const value of source.values) {
        result = reducer(result, value);
        if (isReduced(result)) return unreduced(result);
      }
      return result;
    },
  });
  const source = (...values) => new ProtocolValues(values);
  class KeyValueSource {
    constructor(entries) {
      this.entries = Object.freeze(entries.map((entry) => Object.freeze(entry)));
      Object.freeze(this);
    }
  }
  extendProtocolType(IKVReduce, KeyValueSource, {
    reduceKV: (keyed, reducer, initial) => {
      let result = initial;
      for (const [key, value] of keyed.entries) {
        result = reducer(result, key, value);
        if (isReduced(result)) return unreduced(result);
      }
      return result;
    },
  });

  const nested = EMPTY_MAP.assoc(
    "profile",
    EMPTY_MAP.assoc("name", "Ada").assoc("unset", undefined),
  );
  expect(getIn(nested, source("profile", "name"))).toBe("Ada");
  expect(getIn(nested, ["profile", "unset"], "missing")).toBeUndefined();
  expect(getIn(nested, ["profile", "absent"], "missing")).toBe("missing");
  expect(getIn(nested, [], "missing")).toBe(nested);

  const associated = assocIn(nested, source("profile", "score"), 10);
  expect(getIn(associated, ["profile", "score"])).toBe(10);
  expect(getIn(nested, ["profile", "score"], "missing")).toBe("missing");
  expect(getIn(assocIn(null, ["a", "b"], 3), ["a", "b"])).toBe(3);
  expect(assocIn(nested, [], "replacement")).toBe("replacement");
  expect(() => assocIn({ a: 1 }, ["a", "b"], 2)).toThrow();

  const updated = updateData(nested, "visits", (value, amount) =>
    (value ?? 0) + amount, 2);
  expect(updated.get("visits")).toBe(2);
  expect(updateData(null, "created", (value) => value === null).get("created"))
    .toBe(true);
  expect(updateData(nested.get("profile"), "unset", (value) =>
    value === undefined).get("unset")).toBe(true);
  const nestedUpdate = updateIn(nested, ["profile", "visits"],
    (value, amount) => (value ?? 0) + amount, 4);
  expect(getIn(nestedUpdate, ["profile", "visits"])).toBe(4);
  expect(updateIn(3, [], (value, amount) => value + amount, 2)).toBe(5);
  expect(() => updateData(nested, "x", null)).toThrow(
    "update transform must be a function",
  );
  expect(() => updateIn(nested, ["x"], null)).toThrow(
    "updateIn transform must be a function",
  );

  expect([...dataKeys([10, 20, 30])]).toEqual([0, 1, 2]);
  expect([...dataVals(new KeyValueSource([
    ["first", 10],
    ["second", undefined],
  ]))]).toEqual([10, undefined]);
  expect([...dataKeys(null)]).toEqual([]);
  expect([...dataVals(null)]).toEqual([]);

  const keySource = new Map([["left", 1], ["right", 2]]);
  const renamed = updateKeys(keySource, (key) => `field:${key}`);
  expect(renamed.get("field:left")).toBe(1);
  expect(renamed.get("field:right")).toBe(2);
  expect(keySource.has("field:left")).toBe(false);
  const collided = updateKeys(keySource, () => "same");
  expect(collided.count).toBe(1);
  expect(collided.get("same")).toBe(2);

  const valueSource = { left: 2, unset: undefined };
  const mappedValues = updateVals(
    valueSource,
    (value) => value === undefined ? "missing" : value * 10,
  );
  expect(mappedValues.get("left")).toBe(20);
  expect(mappedValues.get("unset")).toBe("missing");
  expect(valueSource).toEqual({ left: 2, unset: undefined });
  expect(updateKeys(null, (key) => key)).toBe(EMPTY_MAP);
  expect(updateVals(null, (value) => value)).toBe(EMPTY_MAP);
  expect(() => updateKeys(nested, null)).toThrow(
    "updateKeys transform must be a function",
  );
  expect(() => updateVals(nested, null)).toThrow(
    "updateVals transform must be a function",
  );

  const selected = selectKeys(
    { left: 1, unset: undefined, ignored: 3 },
    source("unset", "left", "missing"),
  );
  expect(selected.count).toBe(2);
  expect(selected.get("left")).toBe(1);
  expect(selected.has("unset")).toBe(true);
  expect(selected.get("unset", "missing")).toBeUndefined();
  expect(selectKeys(null, ["left"])).toBe(EMPTY_MAP);

  const valueKey = persistentVector("same");
  const equalValueKey = persistentVector("same");
  const merged = mergeData(
    null,
    { left: 1, overwritten: 1 },
    new Map([["right", 2], ["overwritten", 3]]),
  );
  expect(merged.count).toBe(3);
  expect(merged.get("overwritten")).toBe(3);
  const mergedKeyValues = mergeData(
    new KeyValueSource([["direct", 4], ["overwritten", 8]]),
  );
  expect(mergedKeyValues.get("direct")).toBe(4);
  expect(mergedKeyValues.get("overwritten")).toBe(8);
  const combined = mergeWith(
    (left, right) => left + right,
    new Map([[valueKey, 2], ["unset", undefined]]),
    new Map([[equalValueKey, 5], ["unset", 7]]),
  );
  expect(combined.count).toBe(2);
  expect(combined.get(persistentVector("same"))).toBe(7);
  expect(combined.get("unset")).toBeNaN();
  expect(() => mergeWith(null, merged)).toThrow(
    "mergeWith combine function must be a function",
  );
  expect(() => mergeData([["too", "many", "values"]])).toThrow(
    "data entries must contain exactly one key/value pair",
  );

  const zipped = zipmap(
    source(persistentVector("k"), "second", "unused"),
    source(10, 20),
  );
  expect(zipped.count).toBe(2);
  expect(zipped.get(persistentVector("k"))).toBe(10);
  expect(zipped.get("second")).toBe(20);
  expect(zipmap(null, [1, 2])).toBe(EMPTY_MAP);
});

test("indexBy uses a transient HAMT builder at scale", () => {
  const size = 50_000;
  const values = Array.from({ length: size }, (_, value) => value);
  resetPersistentMapMetrics();
  let reference = EMPTY_MAP;
  for (const value of values) {
    reference = reference.assoc(value, value);
  }
  const persistentAllocations = persistentMapMetrics().nodeAllocations;

  resetPersistentMapMetrics();
  resetTransientMapMetrics();
  const result = indexBy((value) => value, values);
  expect(result.count).toBe(size);
  expect(result.get(size - 1)).toBe(size - 1);
  expect(persistentMapMetrics().nodeAllocations)
    .toBeLessThan(persistentAllocations / 3);
  expect(transientMapMetrics()).toMatchObject({
    persistentCalls: 1,
    invalidCalls: 0,
  });
});

test("Eliscript core modules compile and execute against runtime protocols", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-core-stdlib-"));
  const runtimeLink = resolve(directory, "runtime");
  const protocolModule = resolve(directory, "stdlib/core/protocol.mjs");
  const identifierModule = resolve(directory, "stdlib/core/identifier.mjs");
  const dataTextModule = resolve(directory, "stdlib/core/data-text.mjs");
  const metadataModule = resolve(directory, "stdlib/core/metadata.mjs");
  const collectionModule = resolve(directory, "stdlib/core/collection.mjs");
  const transientModule = resolve(directory, "stdlib/core/transient.mjs");
  const transducerModule = resolve(directory, "stdlib/core/transducer.mjs");
  const seqModule = resolve(directory, "stdlib/core/seq.mjs");
  const dataModule = resolve(directory, "stdlib/core/data.mjs");
  const usageModule = resolve(directory, "core-stdlib-usage.mjs");
  const apiUsageModule = resolve(directory, "core-language-api-usage.mjs");
  try {
    await symlink(resolve(ROOT, "runtime"), runtimeLink, "dir");
    await compile(resolve(ROOT, "stdlib/core/protocol.eli"), protocolModule);
    await compile(resolve(ROOT, "stdlib/core/identifier.eli"), identifierModule);
    await compile(resolve(ROOT, "stdlib/core/data-text.eli"), dataTextModule);
    await compile(resolve(ROOT, "stdlib/core/metadata.eli"), metadataModule);
    await compile(resolve(ROOT, "stdlib/core/collection.eli"), collectionModule);
    await compile(resolve(ROOT, "stdlib/core/transient.eli"), transientModule);
    await compile(resolve(ROOT, "stdlib/core/transducer.eli"), transducerModule);
    await compile(resolve(ROOT, "stdlib/core/seq.eli"), seqModule);
    await compile(resolve(ROOT, "stdlib/core/data.eli"), dataModule);
    await compile(USAGE_SOURCE, usageModule);
    await compile(API_USAGE_SOURCE, apiUsageModule);

    const usage = await import(pathToFileURL(usageModule).href);
    expect([...usage.mapped]).toEqual([0, 2, 4, 6, 8]);
    expect([...usage.filtered]).toEqual([0, 2, 4]);
    expect([...usage.removed]).toEqual([0, 1, 3, 4]);
    expect([...usage.taken]).toEqual([0, 1, 2]);
    expect([...usage.dropped]).toEqual([2, 3, 4]);
    expect([...usage.indexed_map]).toEqual([0, 2, 4, 6, 8]);
    expect([...usage.kept]).toEqual([0, 2, 4]);
    expect([...usage.kept_indexed]).toEqual([0, 4, 8]);
    expect([...usage.taken_while]).toEqual([0, 1, 2]);
    expect([...usage.dropped_while]).toEqual([3, 4]);
    expect([...usage.sampled_sequence]).toEqual([0, 2, 4]);
    expect([...usage.interposed_sequence]).toEqual([1, "x", 2, "x", 3]);
    expect([...usage.deduped]).toEqual([1, 2, 1]);
    expect([...usage.distinct_values]).toEqual([1, 2, 3]);
    expect([...usage.flattened_values]).toEqual([1, 10, 2, 20]);
    expect([...usage.fixed_partitions].map((value) => [...value]))
      .toEqual([[0, 1], [2, 3], [4]]);
    expect([...usage.keyed_partitions].map((value) => [...value]))
      .toEqual([[1, 3], [2, 4], [5]]);
    expect([...usage.intermediate_values]).toEqual([0, 1, 3, 6]);
    expect([...usage.reversed]).toEqual([4, 3, 2, 1, 0]);
    expect([...usage.concatenated]).toEqual([0, 1, 2, 3, 4]);
    expect(usage.first_even).toBe(4);
    expect(usage.zero_truth).toBe(0);
    expect(usage.all_truth).toBe(true);
    expect(usage.first_value).toBe(0);
    expect(usage.last_value).toBe(4);
    expect(usage.third_value).toBe(2);
    expect([...usage.tail_values]).toEqual([3, 4]);
    expect([...usage.without_tail]).toEqual([0, 1, 2]);
    expect([...usage.without_last]).toEqual([0, 1, 2, 3]);
    expect([...usage.split_position].map((part) => [...part]))
      .toEqual([[0, 1], [2, 3, 4]]);
    expect([...usage.split_prefix].map((part) => [...part]))
      .toEqual([[0, 1, 2], [3, 4]]);
    expect([...usage.finite_range]).toEqual([1, 3, 5, 7]);
    expect([...usage.open_range]).toEqual([0, 1, 2, 3, 4]);
    expect([...usage.repeated_values]).toEqual(["x", "x", "x", "x"]);
    expect([...usage.produced_values]).toEqual([1, 2, 3]);
    expect([...usage.iterated_values]).toEqual([1, 2, 4, 8, 16]);
    expect(usage.iteration_state).toBe(4);
    expect([...usage.cycled_values]).toEqual([1, 2, 3, 1, 2, 3, 1]);
    expect([...usage.generated_values]).toEqual([0, 1, 4, 9]);
    expect([...usage.pipeline_values]).toEqual([2, 4, 6, 8, 10]);
    expect(usage.pipeline_total).toBe(18);
    expect(usage.pipeline_run_result).toBeNull();
    expect(usage.indexed.get(0)).toBe(3);
    expect([...usage.grouped.get(0)]).toEqual([0, 2, 4]);
    expect(usage.counted.get(1)).toBe(2);
    expect(usage.frequencies_result.get(1)).toBe(3);
    expect(usage.nested_value).toBe(5);
    expect(usage.updated_result.get("visits")).toBe(3);
    expect([...usage.keyed_keys]).toEqual([0, 1, 2]);
    expect(new Set(usage.keyed_vals)).toEqual(new Set([1, 2]));
    expect(usage.renamed_result.get("field:left")).toBe(1);
    expect(usage.renamed_result.get("field:right")).toBe(2);
    expect(usage.mapped_vals_result.get("left")).toBe(10);
    expect(usage.mapped_vals_result.get("right")).toBe(20);
    expect(usage.selected_result.count).toBe(1);
    expect(usage.selected_result.get("right")).toBe(2);
    expect(usage.merged_result.get("overwritten")).toBe(3);
    expect(usage.combined_result.get("hits")).toBe(7);
    expect(usage.zipped_result.count).toBe(2);
    expect(usage.zipped_result.get("b")).toBe(20);
    expect(usage.keyed_total).toBe(17);
    expect([...usage.removed_map]).toEqual([["middle", 2]]);
    expect([...usage.removed_set]).toEqual(["middle"]);
    expect(usage.vector_stack_top).toBe(3);
    expect([...usage.vector_stack_rest]).toEqual([1, 2]);
    expect(usage.list_stack_top).toBe(1);
    expect([...usage.list_stack_rest]).toEqual([2, 3]);
    expect([...usage.reverse_sequence]).toEqual([3, 2, 1]);

    const generatedUsage = await readFile(usageModule, "utf8");
    expect(generatedUsage).toContain("first_even");

    const seqMap = await Bun.file(`${seqModule}.map`).json();
    expect(seqMap.sourcesContent[0]).toContain("(defun reverse\n    (collection)");
    expect(seqMap.sourcesContent[0]).toContain(
      "(implementsProtocolOperation IReversible \"rseq\" collection)",
    );
    expect(seqMap.sourcesContent[0]).toContain("(defun some\n    (predicate collection");
    expect(seqMap.sourcesContent[0]).not.toContain("runtime/core/sequence.mjs");
    const dataMap = await Bun.file(`${dataModule}.map`).json();
    expect(dataMap.sourcesContent[0]).toContain("(defun collect-buckets");
    expect(dataMap.sourcesContent[0]).toContain("(defun index-by");
    expect(dataMap.sourcesContent[0]).not.toContain("runtime/core/data.mjs");

    const api = await import(pathToFileURL(apiUsageModule).href);
    expect(api.report).toMatchObject({
      "number-description": "number:7",
      "default-description": "default",
      "number-category": "number",
      "method-slot-type": "symbol",
      "implements-number": true,
      "implements-operation": true,
      "vector-count": 3,
      "vector-second": 2,
      "vector-has-two": true,
      "vector-seq-count": 3,
      "map-left": 10,
      "map-missing": "fallback",
      "map-has-right": true,
      "metadata-support": true,
      "keyword-metadata-support": false,
      "metadata-left": 10,
      "metadata-varied-left": 30,
      "metadata-preserved": true,
      "printed-annotated-vector": '^{"left" 10 "right" 20} [1 2 3]',
      "read-metadata-left": 10,
      "bounded-sum": 6,
      "observed": [1, 2, 3],
      "reduced-state": true,
      "unreduced-value": 9,
      "keyword-string": ":article/title",
      "symbol-name": "article/title",
      "identifier-name": "title",
      "identifier-namespace": "article",
      "keyword-state": true,
      "symbol-state": true,
      "identifier-state": true,
    });
    expect([...api.report["vector-appended"]]).toEqual([1, 2, 3, 4]);
    expect([...api.report["vector-empty"]]).toEqual([]);
    expect([...api.report.transformed]).toEqual([6, 8]);
    expect([...api.report["stateful-transformed"]].map((value) => [...value]))
      .toEqual([[2, 2], [3, 4]]);
    expect([...api.report.flattened]).toEqual([1, 10, 2, 20]);
    expect([...api.report.concatenated]).toEqual(["left", "right"]);
    expect([...api.report.sampled].map((value) => [...value]))
      .toEqual([[0, 5], [3, 7]]);
    expect([...api.report.interposed]).toEqual(["left", "between", "right"]);
    expect([...api.report["unique-transformed"]]).toEqual([1, 2, 3]);
    expect([...api.report.partitioned].map((value) => [...value]))
      .toEqual([[1, 2], [3]]);
    expect([...api.report.grouped].map((value) => [...value]))
      .toEqual([[1, 2], [3, 4]]);

    class SourceRange {
      constructor(end, observe) {
        this.end = end;
        this.observe = observe;
        Object.freeze(this);
      }
    }
    extendProtocolType(IReduce, SourceRange, {
      reduce: (range, reducer, initial) => {
        let result = initial;
        for (let value = 0; value < range.end; value += 1) {
          range.observe(value);
          result = reducer(result, value);
          if (isReduced(result)) {
            return unreduced(result);
          }
        }
        return result;
      },
    });
    const generatedSeq = await import(pathToFileURL(seqModule).href);
    const observed = [];
    expect(generatedSeq.find(
      (value) => value === 4,
      new SourceRange(100, (value) => observed.push(value)),
      "missing",
    )).toBe(4);
    expect(observed).toEqual([0, 1, 2, 3, 4]);
    expect(() => generatedSeq.some(null, [], "missing"))
      .toThrow("some predicate must be a function");

    const generatedData = await import(pathToFileURL(dataModule).href);
    resetPersistentMapMetrics();
    resetTransientMapMetrics();
    const indexed = generatedData.index_by(
      (value) => value,
      Array.from({ length: 50_000 }, (_, value) => value),
    );
    expect(indexed.count).toBe(50_000);
    expect(transientMapMetrics()).toMatchObject({
      persistentCalls: 1,
      invalidCalls: 0,
    });

    const nodeCheck = [
      `const api = await import(${JSON.stringify(pathToFileURL(apiUsageModule).href)});`,
      `const seq = await import(${JSON.stringify(pathToFileURL(seqModule).href)});`,
      `const identifier = await import(${JSON.stringify(pathToFileURL(identifierModule).href)});`,
      `const metadata = await import(${JSON.stringify(pathToFileURL(metadataModule).href)});`,
      "if (api.report['number-description'] !== 'number:7') process.exit(1);",
      "if (JSON.stringify([...api.report['vector-appended']]) !== '[1,2,3,4]') process.exit(1);",
      "if (JSON.stringify([...seq.map((value) => value * 3, [1,2,3])]) !== '[3,6,9]') process.exit(1);",
      "if (JSON.stringify([...api.report['stateful-transformed']].map((value) => [...value])) !== '[[2,2],[3,4]]') process.exit(1);",
      "if (JSON.stringify([...api.report.flattened]) !== '[1,10,2,20]') process.exit(1);",
      "if (JSON.stringify([...api.report.sampled].map((value) => [...value])) !== '[[0,5],[3,7]]') process.exit(1);",
      "if (JSON.stringify([...api.report.partitioned].map((value) => [...value])) !== '[[1,2],[3]]') process.exit(1);",
      "if (String(identifier.keyword('article/title')) !== ':article/title') process.exit(1);",
      "if (metadata.meta(api.report['vector-appended']) !== null) process.exit(1);",
    ].join("");
    await runSuccessful(["node", "--input-type=module", "--eval", nodeCheck]);

    const protocolMap = await Bun.file(`${protocolModule}.map`).json();
    expect(protocolMap.sourcesContent[0]).toContain("(defun define-protocol");
    const identifierMap = await Bun.file(`${identifierModule}.map`).json();
    expect(identifierMap.sourcesContent[0]).toContain("(defun keyword");
    const dataTextMap = await Bun.file(`${dataTextModule}.map`).json();
    expect(dataTextMap.sourcesContent[0]).toContain("(defun print-value");
    const metadataMap = await Bun.file(`${metadataModule}.map`).json();
    expect(metadataMap.sourcesContent[0]).toContain("(defun with-meta");
    const collectionMap = await Bun.file(`${collectionModule}.map`).json();
    expect(collectionMap.sourcesContent[0]).toContain("(defun reduce");
    const transientMap = await Bun.file(`${transientModule}.map`).json();
    expect(transientMap.sourcesContent[0]).toContain("(defun persistent!");
    const transducerMap = await Bun.file(`${transducerModule}.map`).json();
    expect(transducerMap.sourcesContent[0])
      .toContain("(defun compose-transducers");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("protocol standard-library algorithms agree under Bun and Node", async () => {
  const expected = {
    reverse: [4, 3, 2, 1, 0],
    map: [0, 2, 4, 6, 8],
    filter: [0, 2, 4],
    remove: [0, 1, 3, 4],
    take: [0, 1, 2],
    drop: [2, 3, 4],
    mapIndexed: [0, 2, 4, 6, 8],
    keep: [0, 2, 4],
    keepIndexed: [0, 4, 8],
    takeWhile: [0, 1, 2],
    dropWhile: [3, 4],
    takeNth: [0, 2, 4],
    interpose: [1, "x", 2, "x", 3],
    dedupe: [1, 2, 1],
    distinct: [1, 2, 3],
    mapcat: [1, 10, 2, 20],
    partitionAll: [[0, 1], [2, 3], [4]],
    partitionBy: [[1, 3], [2, 4], [5]],
    reductions: [0, 1, 3, 6],
    concat: [0, 1, 2, 3, 4],
    some: 0,
    every: true,
    find: 3,
    selection: [
      0,
      4,
      2,
      [3, 4],
      [0, 1, 2],
      [0, 1, 2, 3],
      [[0, 1], [2, 3, 4]],
      [[0, 1, 2], [3, 4]],
    ],
    sources: [
      [1, 3, 5, 7],
      [0, 1, 2, 3, 4],
      ["x", "x", "x", "x"],
      [1, 2, 3],
      [1, 2, 4, 8, 16],
      [1, 2, 3, 1, 2, 3, 1],
      [0, 1, 4, 9],
    ],
    indexed: [3, 4, 2],
    grouped: [[0, 2, 4], [1, 3]],
    counted: [3, 2],
    frequencies: [3, 2, 1],
    associative: [5, 2, 3, 2, 7, 10, 20, 2],
  };
  expect(await runHost(process.execPath)).toEqual(expected);
  expect(await runHost(process.env.NODE_BINARY ?? "node")).toEqual(expected);
});

test("stable protocol and core algorithms build as one project across Bun and Node", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-core-project-"));
  const outputRoot = resolve(directory, "stdlib");
  const sources = [
    "protocol",
    "collection",
    "transient",
    "transducer",
    "seq",
    "data",
    "set",
    "order",
    "text",
    "object",
  ].map((name) => resolve(ROOT, `stdlib/core/${name}.eli`));
  try {
    await symlink(resolve(ROOT, "runtime"), resolve(directory, "runtime"), "dir");
    const report = JSON.parse(await runSuccessful([
      resolve(ROOT, "bin/eliscript-build"),
      "--json",
      "--root",
      resolve(ROOT, "stdlib"),
      "--out-dir",
      outputRoot,
      "--no-cache",
      ...sources,
    ]));
    expect(report).toMatchObject({
      format: "eliscript-build-report",
      version: 2,
      mode: "standard",
      entries: [
        "core/collection.eli",
        "core/data.eli",
        "core/object.eli",
        "core/order.eli",
        "core/protocol.eli",
        "core/seq.eli",
        "core/set.eli",
        "core/text.eli",
        "core/transducer.eli",
        "core/transient.eli",
      ],
      counts: { modules: 10, compiled: 10, reused: 0 },
      cache: { enabled: false, status: "disabled", reason: "cache-disabled" },
    });
    for (const name of [
      "protocol",
      "collection",
      "transient",
      "transducer",
      "seq",
      "data",
      "set",
      "order",
      "text",
      "object",
    ]) {
      const sourceMap = JSON.parse(await readFile(
        resolve(outputRoot, `core/${name}.mjs.map`),
        "utf8",
      ));
      expect(sourceMap.sourcesContent[0])
        .toContain(`(module eliscript.core.${name}`);
    }
    const expected = {
      protocol: "n:7",
      count: 4,
      built: [4, 5],
      transformed: [4, 6, 4],
      mapped: [2, 3, 4, 3],
      sequence: [1, 2, 3, [3, 2], [1, 2], [[1, 2], [3, 2]]],
      sources: [
        [1, 3, 5, 7],
        [0, 1, 2, 3, 4],
        ["x", "x", "x", "x"],
        [1, 2, 3],
        [1, 2, 4, 8, 16],
        [1, 2, 3, 1, 2, 3, 1],
        [0, 1, 4, 9],
      ],
      frequencies: [1, 2, 1],
      data: [5, 3, 2],
      set: [[2, 3], true, true],
      order: [
        [1, 2, 2, 3],
        ["middle", "first", "last"],
        "low",
        "last",
        3,
      ],
      text: ["lis", "1-2-3-2"],
      object: [10, 20],
    };
    expect(await runBuiltCoreProjectHost(process.execPath, outputRoot))
      .toEqual(expected);
    expect(await runBuiltCoreProjectHost(
      process.env.NODE_BINARY ?? "node",
      outputRoot,
    )).toEqual(expected);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

test("stable portable utility modules build as one project across Bun and Node", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-utility-project-"));
  const outputRoot = resolve(directory, "stdlib");
  const modules = [
    ["sequence", "eliscript.sequence"],
    ["text", "eliscript.text"],
    ["object", "eliscript.object"],
    ["data", "eliscript.data"],
  ];
  try {
    const report = JSON.parse(await runSuccessful([
      resolve(ROOT, "bin/eliscript-build"),
      "--json",
      "--root",
      resolve(ROOT, "stdlib"),
      "--out-dir",
      outputRoot,
      "--no-cache",
      ...modules.map(([name]) => resolve(ROOT, `stdlib/${name}.eli`)),
    ]));
    expect(report).toMatchObject({
      format: "eliscript-build-report",
      version: 2,
      mode: "standard",
      entries: modules.map(([name]) => `${name}.eli`).sort(),
      counts: { modules: 4, compiled: 4, reused: 0 },
      cache: { enabled: false, status: "disabled", reason: "cache-disabled" },
    });
    for (const [name, declaration] of modules) {
      const sourceMap = JSON.parse(await readFile(
        resolve(outputRoot, `${name}.mjs.map`),
        "utf8",
      ));
      expect(sourceMap.sourcesContent[0]).toContain(`(module ${declaration}`);
    }
    const expected = {
      sequence: [[3, 6, 9, 12], 10],
      text: ["Eliscript", "1-2-3-4", true],
      object: [3, 2, 1],
      data: [[2, 4], [1, 3], 2, 2],
    };
    expect(await runBuiltPortableUtilityProjectHost(process.execPath, outputRoot))
      .toEqual(expected);
    expect(await runBuiltPortableUtilityProjectHost(
      process.env.NODE_BINARY ?? "node",
      outputRoot,
    )).toEqual(expected);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

test("persistent value library builds as one project and executes under Bun and Node", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-value-project-"));
  const outputRoot = resolve(directory, "stdlib");
  const sourceNames = [
    "bit",
    "persistent-list",
    "persistent-vector",
    "persistent-map",
    "persistent-set",
    "value",
  ];
  const sources = sourceNames.map((name) => resolve(ROOT, `stdlib/${name}.eli`));
  try {
    await symlink(resolve(ROOT, "runtime"), resolve(directory, "runtime"), "dir");
    const report = JSON.parse(await runSuccessful([
      resolve(ROOT, "bin/eliscript-build"),
      "--json",
      "--root",
      resolve(ROOT, "stdlib"),
      "--out-dir",
      outputRoot,
      "--no-cache",
      ...sources,
    ]));
    expect(report).toMatchObject({
      format: "eliscript-build-report",
      version: 2,
      mode: "standard",
      entries: sourceNames.map((name) => `${name}.eli`).sort(),
      counts: { modules: 6, compiled: 6, reused: 0 },
      cache: { enabled: false, status: "disabled", reason: "cache-disabled" },
    });
    for (const name of sourceNames) {
      const sourceMap = JSON.parse(await readFile(
        resolve(outputRoot, `${name}.mjs.map`),
        "utf8",
      ));
      expect(sourceMap.sourcesContent[0])
        .toContain(`(module eliscript.${name}`);
    }
    const expected = {
      bit: [16, 2, 2_147_483_648],
      vector: [[1, 2, 3], [1, 20, 3]],
      list: ["a", "b", "c"],
      map: [2, true, true],
      set: [2, true],
      value: [true, true],
    };
    expect(await runBuiltPersistentValueProjectHost(process.execPath, outputRoot))
      .toEqual(expected);
    expect(await runBuiltPersistentValueProjectHost(
      process.env.NODE_BINARY ?? "node",
      outputRoot,
    )).toEqual(expected);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

test("identifier metadata and data text build as one project across Bun and Node", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-value-text-project-"));
  const outputRoot = resolve(directory, "stdlib");
  const entries = ["identifier", "metadata", "data-text"];
  const moduleNames = [
    "bit",
    "data-text",
    "identifier",
    "metadata",
    "persistent-list",
    "persistent-map",
    "persistent-set",
    "persistent-vector",
    "value",
  ];
  try {
    await symlink(resolve(ROOT, "runtime"), resolve(directory, "runtime"), "dir");
    const report = JSON.parse(await runSuccessful([
      resolve(ROOT, "bin/eliscript-build"),
      "--json",
      "--root",
      resolve(ROOT, "stdlib"),
      "--out-dir",
      outputRoot,
      "--no-cache",
      ...entries.map((name) => resolve(ROOT, `stdlib/${name}.eli`)),
    ]));
    expect(report).toMatchObject({
      format: "eliscript-build-report",
      version: 2,
      mode: "standard",
      entries: entries.map((name) => `${name}.eli`).sort(),
      counts: { modules: 9, compiled: 9, reused: 0 },
      cache: { enabled: false, status: "disabled", reason: "cache-disabled" },
    });
    for (const name of moduleNames) {
      const sourceMap = JSON.parse(await readFile(
        resolve(outputRoot, `${name}.mjs.map`),
        "utf8",
      ));
      expect(sourceMap.sourcesContent[0])
        .toContain(`(module eliscript.${name}`);
    }
    const expected = {
      identifier: ["article/title", "article/title", true, true],
      metadata: ["project", true, true],
      text: '(:article/title ^{:source "project"} [article/title #{1 2 3}])',
      roundTrip: true,
      fixedPoint: true,
      error: ["ELI-DATA-TEXT", 1, 7],
    };
    expect(await runBuiltValueTextProjectHost(process.execPath, outputRoot))
      .toEqual(expected);
    expect(await runBuiltValueTextProjectHost(
      process.env.NODE_BINARY ?? "node",
      outputRoot,
    )).toEqual(expected);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);

test("public state interop result JSON and numeric modules build across hosts", async () => {
  const directory = await mkdtemp(resolve(ROOT, ".eliscript-stdlib-project-"));
  const outputRoot = resolve(directory, "stdlib");
  const entries = [
    "state/atom",
    "interop/js",
    "result",
    "json",
    "numeric",
  ];
  const modules = [
    ["bit", "eliscript.bit"],
    ["interop/js", "eliscript.interop.js"],
    ["json", "eliscript.json"],
    ["numeric", "eliscript.numeric"],
    ["persistent-list", "eliscript.persistent-list"],
    ["persistent-map", "eliscript.persistent-map"],
    ["persistent-set", "eliscript.persistent-set"],
    ["persistent-vector", "eliscript.persistent-vector"],
    ["result", "eliscript.result"],
    ["state/atom", "eliscript.state.atom"],
    ["value", "eliscript.value"],
  ];
  try {
    await symlink(resolve(ROOT, "runtime"), resolve(directory, "runtime"), "dir");
    const report = JSON.parse(await runSuccessful([
      resolve(ROOT, "bin/eliscript-build"),
      "--json",
      "--root",
      resolve(ROOT, "stdlib"),
      "--out-dir",
      outputRoot,
      "--no-cache",
      ...entries.map((name) => resolve(ROOT, `stdlib/${name}.eli`)),
    ]));
    expect(report).toMatchObject({
      format: "eliscript-build-report",
      version: 2,
      mode: "standard",
      entries: entries.map((name) => `${name}.eli`).sort(),
      counts: { modules: 11, compiled: 11, reused: 0 },
      cache: { enabled: false, status: "disabled", reason: "cache-disabled" },
    });
    for (const [name, declaration] of modules) {
      const sourceMap = JSON.parse(await readFile(
        resolve(outputRoot, `${name}.mjs.map`),
        "utf8",
      ));
      expect(sourceMap.sourcesContent[0]).toContain(`(module ${declaration}`);
    }
    const expected = {
      atom: [true, 5, 2, 2, [[1, 5], [5, 2]]],
      interop: [[1, 2], true, 3, true, true, true],
      result: [true, 42, true, "stop"],
      json: [true, true, '{"a":[1,true],"b":2}'],
      numeric: [6, 42, 1, null],
      identity: [true, true, true, false],
    };
    expect(await runBuiltPublicStdlibProjectHost(process.execPath, outputRoot))
      .toEqual(expected);
    expect(await runBuiltPublicStdlibProjectHost(
      process.env.NODE_BINARY ?? "node",
      outputRoot,
    )).toEqual(expected);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 60_000);
