import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const moduleUrl = pathToFileURL(modulePath);
const valueModule = await import(moduleUrl.href);
const listModule = await import(new URL("./persistent-list.eli", moduleUrl).href);
const vectorModule = await import(new URL("./persistent-vector.eli", moduleUrl).href);
const mapModule = await import(new URL("./persistent-map.eli", moduleUrl).href);
const setModule = await import(new URL("./persistent-set.eli", moduleUrl).href);

const {
  value_equal_QMARK_: valueEqual,
  value_hash: valueHash,
  value_map_from_entries: valueMapFromEntries,
  value_set_from_array: valueSetFromArray,
} = valueModule;
const { persistent_list_from_array: persistentListFromArray } = listModule;
const { persistent_vector_from_array: persistentVectorFromArray } = vectorModule;
const {
  persistent_map_count: persistentMapCount,
  persistent_map_get: persistentMapGet,
} = mapModule;
const {
  persistent_set_count: persistentSetCount,
  persistent_set_has_QMARK_: persistentSetHas,
} = setModule;

const nestedLeft = persistentVectorFromArray([
  null,
  undefined,
  true,
  42,
  "eliscript",
  persistentVectorFromArray(["nested", Number.NaN, -0]),
]);
const nestedRight = persistentVectorFromArray([
  null,
  undefined,
  true,
  42,
  "eliscript",
  persistentVectorFromArray(["nested", Number.NaN, 0]),
]);
const listLeft = persistentListFromArray([1, "two", nestedLeft]);
const listRight = persistentListFromArray([1, "two", nestedRight]);
const orderedMap = valueMapFromEntries([
  ["alpha", 1],
  [persistentVectorFromArray(["key"]), persistentVectorFromArray([2, 3])],
  ["omega", Number.NaN],
]);
const reversedMap = valueMapFromEntries([
  ["omega", Number.NaN],
  [persistentVectorFromArray(["key"]), persistentVectorFromArray([2, 3])],
  ["alpha", 1],
]);
const collisionMap = valueMapFromEntries([
  ["key-50691", "left"],
  ["key-194634", "right"],
]);
const orderedSet = valueSetFromArray([
  "alpha",
  persistentVectorFromArray(["key"]),
  "omega",
]);
const reversedSet = valueSetFromArray([
  "omega",
  persistentVectorFromArray(["key"]),
  "alpha",
]);
const leftHost = { value: 1 };
const rightHost = { value: 1 };
const vectorLookup = persistentMapGet(
  orderedMap,
  persistentVectorFromArray(["key"]),
  "missing",
);

console.log(JSON.stringify({
  scalars: {
    null: valueHash(null),
    undefined: valueHash(undefined),
    false: valueHash(false),
    true: valueHash(true),
    zero: valueHash(0),
    negativeZero: valueHash(-0),
    one: valueHash(1),
    negativeOne: valueHash(-1),
    fraction: valueHash(1.5),
    nan: valueHash(Number.NaN),
    positiveInfinity: valueHash(Number.POSITIVE_INFINITY),
    negativeInfinity: valueHash(Number.NEGATIVE_INFINITY),
    maxSafeInteger: valueHash(Number.MAX_SAFE_INTEGER),
    emptyString: valueHash(""),
    ascii: valueHash("Eliscript"),
    unicode: valueHash("值语义🙂"),
  },
  collections: {
    vector: valueHash(nestedLeft),
    list: valueHash(listLeft),
    map: valueHash(orderedMap),
    set: valueHash(orderedSet),
  },
  invariants: {
    nanEqual: valueEqual(Number.NaN, Number.NaN),
    zerosEqual: valueEqual(0, -0),
    nestedEqual: valueEqual(nestedLeft, nestedRight),
    nestedHashesEqual: valueHash(nestedLeft) === valueHash(nestedRight),
    listsEqual: valueEqual(listLeft, listRight),
    listVectorDistinct: valueEqual(listLeft, nestedLeft),
    mapsEqual: valueEqual(orderedMap, reversedMap),
    mapHashesEqual: valueHash(orderedMap) === valueHash(reversedMap),
    setsEqual: valueEqual(orderedSet, reversedSet),
    setHashesEqual: valueHash(orderedSet) === valueHash(reversedSet),
    hostIdentity: valueEqual(leftHost, leftHost),
    hostDistinct: valueEqual(leftHost, rightHost),
    hostFallbackHash: valueHash(leftHost) === valueHash(rightHost),
  },
  collision: {
    leftHash: valueHash("key-50691"),
    rightHash: valueHash("key-194634"),
    keysEqual: valueEqual("key-50691", "key-194634"),
    count: persistentMapCount(collisionMap),
    left: persistentMapGet(collisionMap, "key-50691", "missing"),
    right: persistentMapGet(collisionMap, "key-194634", "missing"),
  },
  lookup: {
    vectorKey: valueEqual(vectorLookup, persistentVectorFromArray([2, 3])),
    vectorValueHash: valueHash(vectorLookup),
    setCount: persistentSetCount(orderedSet),
    equalVectorMember: persistentSetHas(
      orderedSet,
      persistentVectorFromArray(["key"]),
    ),
  },
}));
