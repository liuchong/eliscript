import { pathToFileURL } from "node:url";
import {
  eliscriptSymbol,
  keyword,
} from "../../runtime/core/identifier.mjs";

const [modulePath] = process.argv.slice(2);
const moduleUrl = pathToFileURL(modulePath);
const valueModule = await import(moduleUrl.href);
const identityTokenModule = await import(
  new URL("./host-identity-token.mjs", moduleUrl).href,
);
const identifierModule = await import(new URL("./identifier.eli", moduleUrl).href);
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
const { identity_token: identityToken } = identityTokenModule;
const {
  keyword: portableKeyword,
  keyword_QMARK_: portableKeywordPredicate,
  portable_keyword_QMARK_: concretePortableKeywordPredicate,
  portable_symbol_QMARK_: concretePortableSymbolPredicate,
  qualified_name: portableQualifiedName,
  symbol: portableSymbol,
  symbol_QMARK_: portableSymbolPredicate,
} = identifierModule;
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
const hostFunction = () => "host";
const leftNativeSymbol = Symbol("identity");
const rightNativeSymbol = Symbol("identity");
const leftHostHash = valueHash(leftHost);
const rightHostHash = valueHash(rightHost);
const hostFunctionHash = valueHash(hostFunction);
const leftNativeSymbolHash = valueHash(leftNativeSymbol);
const rightNativeSymbolHash = valueHash(rightNativeSymbol);
const identityKeys = [];
const identityEntries = [];
const identityHashes = new Set();
let identityHashesStable = true;
for (let index = 0; index < 20_000; index += 1) {
  const key = Object.freeze({ index });
  const hash = valueHash(key);
  identityKeys.push(key);
  identityEntries.push([key, index]);
  identityHashes.add(hash);
  if (valueHash(key) !== hash) identityHashesStable = false;
}
const identityMap = valueMapFromEntries(identityEntries);
const identitySet = valueSetFromArray(identityKeys);
const nativeSymbolMap = valueMapFromEntries([
  [leftNativeSymbol, "left"],
  [rightNativeSymbol, "right"],
]);
const tokenLeftObject = {};
const tokenRightObject = {};
const tokenFunction = () => null;
const tokenLeftSymbol = Symbol("token");
const tokenRightSymbol = Symbol("token");
const tokenLeftObjectValue = identityToken(tokenLeftObject);
const tokenFunctionValue = identityToken(tokenFunction);
const tokenLeftSymbolValue = identityToken(tokenLeftSymbol);
let invalidTokenScalar;
try {
  identityToken(1);
} catch (error) {
  invalidTokenScalar = { name: error.name, message: error.message };
}
const vectorLookup = persistentMapGet(
  orderedMap,
  persistentVectorFromArray(["key"]),
  "missing",
);
const keywordTitle = keyword("article/title");
const symbolTitle = eliscriptSymbol("article/title");
const portableKeywordTitle = portableKeyword("article/title");
const portableSymbolTitle = portableSymbol("article", "title");
const identifierMap = valueMapFromEntries([
  [keywordTitle, "keyword"],
  [symbolTitle, "symbol"],
]);
const identifierSet = valueSetFromArray([
  symbolTitle,
  eliscriptSymbol("article", "title"),
  keywordTitle,
]);
const portableIdentifierSet = valueSetFromArray([
  keywordTitle,
  portableKeywordTitle,
  symbolTitle,
  portableSymbolTitle,
]);

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
  identifiers: {
    keyword: valueHash(keywordTitle),
    unqualifiedKeyword: valueHash(keyword("title")),
    symbol: valueHash(symbolTitle),
    unqualifiedSymbol: valueHash(eliscriptSymbol("title")),
    portableKeyword: valueHash(portableKeywordTitle),
    portableSymbol: valueHash(portableSymbolTitle),
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
    hostDistinctHashes: leftHostHash !== rightHostHash,
    hostFunctionStable: hostFunctionHash === valueHash(hostFunction),
    nativeSymbolStable: leftNativeSymbolHash === valueHash(leftNativeSymbol),
    nativeSymbolsDistinct: leftNativeSymbolHash !== rightNativeSymbolHash,
    nativeSymbolIdentityEqual: valueEqual(leftNativeSymbol, leftNativeSymbol),
    nativeSymbolValuesDistinct: !valueEqual(leftNativeSymbol, rightNativeSymbol),
    symbolsEqual: valueEqual(
      symbolTitle,
      eliscriptSymbol("article", "title"),
    ),
    identifierCategoriesDistinct: !valueEqual(keywordTitle, symbolTitle),
    portableKeywordEqual: valueEqual(keywordTitle, portableKeywordTitle),
    portableSymbolEqual: valueEqual(symbolTitle, portableSymbolTitle),
    portableKeywordValid:
      portableKeywordPredicate(portableKeywordTitle) &&
      concretePortableKeywordPredicate(portableKeywordTitle) &&
      portableQualifiedName(portableKeywordTitle) === "article/title",
    portableSymbolValid:
      portableSymbolPredicate(portableSymbolTitle) &&
      concretePortableSymbolPredicate(portableSymbolTitle) &&
      portableQualifiedName(portableSymbolTitle) === "article/title",
    concretePortableOnly:
      !concretePortableKeywordPredicate(keywordTitle) &&
      !concretePortableSymbolPredicate(symbolTitle),
    invalidPortableIdentifier:
      portableKeyword("bad/name/again") === null &&
      portableSymbol("", "name") === null &&
      !concretePortableKeywordPredicate({
        kind: "eliscript/keyword",
        namespace: "bad/namespace",
        name: "title",
      }),
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
    keywordValue: persistentMapGet(
      identifierMap,
      keyword("article", "title"),
      "missing",
    ),
    symbolValue: persistentMapGet(
      identifierMap,
      eliscriptSymbol("article", "title"),
      "missing",
    ),
    identifierSetCount: persistentSetCount(identifierSet),
    equalSymbolMember: persistentSetHas(
      identifierSet,
      eliscriptSymbol("article", "title"),
    ),
    portableKeywordValue: persistentMapGet(
      identifierMap,
      portableKeywordTitle,
      "missing",
    ),
    portableSymbolValue: persistentMapGet(
      identifierMap,
      portableSymbolTitle,
      "missing",
    ),
    portableIdentifierSetCount: persistentSetCount(portableIdentifierSet),
    nativeSymbolMapCount: persistentMapCount(nativeSymbolMap),
    nativeSymbolLeft: persistentMapGet(
      nativeSymbolMap,
      leftNativeSymbol,
      "missing",
    ),
    nativeSymbolRight: persistentMapGet(
      nativeSymbolMap,
      rightNativeSymbol,
      "missing",
    ),
  },
  hostIdentityScale: {
    count: identityKeys.length,
    uniqueHashes: identityHashes.size,
    stable: identityHashesStable,
    mapCount: persistentMapCount(identityMap),
    mapLast: persistentMapGet(identityMap, identityKeys.at(-1), "missing"),
    setCount: persistentSetCount(identitySet),
    setLast: persistentSetHas(identitySet, identityKeys.at(-1)),
  },
  identityToken: {
    objectStable: tokenLeftObjectValue === identityToken(tokenLeftObject),
    objectsDistinct: tokenLeftObjectValue !== identityToken(tokenRightObject),
    functionStable: tokenFunctionValue === identityToken(tokenFunction),
    symbolStable: tokenLeftSymbolValue === identityToken(tokenLeftSymbol),
    symbolsDistinct: tokenLeftSymbolValue !== identityToken(tokenRightSymbol),
    invalidScalar: invalidTokenScalar,
  },
}));
