import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const moduleUrl = pathToFileURL(modulePath);
const dataText = await import(moduleUrl.href);
const identifier = await import(new URL("./identifier.eli", moduleUrl).href);
const list = await import(new URL("./persistent-list.eli", moduleUrl).href);
const map = await import(new URL("./persistent-map.eli", moduleUrl).href);
const metadata = await import(new URL("./metadata.eli", moduleUrl).href);
const set = await import(new URL("./persistent-set.eli", moduleUrl).href);
const value = await import(new URL("./value.eli", moduleUrl).href);
const vector = await import(new URL("./persistent-vector.eli", moduleUrl).href);

const unwrap = dataText.data_text_result_value;
const printValue = dataText.print_value;
const readValue = dataText.read_value;
const readValues = dataText.read_values;
const keyword = identifier.keyword;
const symbol = identifier.symbol;
const listFromArray = list.persistent_list_from_array;
const mapAssoc = map.persistent_map_assoc;
const mapCount = map.persistent_map_count;
const mapGet = map.persistent_map_get;
const setCount = set.persistent_set_count;
const withMeta = metadata.with_meta;
const meta = metadata.meta;
const emptyValueMap = value.empty_value_map;
const emptyValueSet = value.empty_value_set;
const valueEqual = value.value_equal_QMARK_;
const vectorCount = vector.persistent_vector_count;
const vectorFromArray = vector.persistent_vector_from_array;
const vectorNth = vector.persistent_vector_nth;

function valueMap(entries) {
  let result = emptyValueMap();
  for (const [key, item] of entries) result = mapAssoc(result, key, item);
  return result;
}

function valueSet(items) {
  let result = emptyValueSet();
  for (const item of items) result = set.persistent_set_conj(result, item);
  return result;
}

const metadataValue = valueMap([
  [keyword("source"), "portable"],
  [keyword("line"), 7],
]);
const nested = withMeta(vectorFromArray([
  null,
  undefined,
  true,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  42n,
  "Unicode 值\n",
  keyword("article/title"),
  symbol("article", "title"),
  symbol("space name"),
]), metadataValue);
const orderedMap = valueMap([
  [keyword("z"), valueSet([3, 1, 2])],
  [keyword("a"), nested],
]);
const reorderedMap = valueMap([
  [keyword("a"), nested],
  [keyword("z"), valueSet([2, 3, 1])],
]);
const root = listFromArray([orderedMap, vectorFromArray([1, 2, 3])]);
const printedRoot = printValue(root);
const restoredRoot = readValue(unwrap(printedRoot));
const printedMap = printValue(orderedMap);
const readMany = readValues("1 :two\n(3 undefined)");
const duplicateMap = readValue("{:a 1 :a 2}");
const duplicateSet = readValue("#{1 1}");
const located = readValue("[\n  1\n}");
const unsafeIdentifier = printValue(symbol("space name"));
const limited = printValue(vectorFromArray([1, 2]), { maxValues: 2 });
const decodedString = readValue('"Unicode \\u503c\\n\\t\\\\\\\""');
const taggedSymbol = readValue('#eliscript/symbol ["article" "title"]');
const ignored = readValue("; header\n[1, 2 ; item\n 3]");
const depthLimited = readValue("[[[0]]]", { maxDepth: 2 });
const lengthLimited = readValue("[123]", { maxLength: 4 });
const valueLimited = readValue("[1 2]", { maxValues: 2 });
const invalidOptions = readValue("1", { maxDepth: 0 });
const invalidEscape = readValue('"\\x"');
const oddMap = readValue("{:a 1 :b}");
const unknownDispatch = readValue("#unknown 1");
const trailing = readValue("[1] trailing");
const common = withMeta(vectorFromArray([
  keyword("a"),
  valueMap([
    [keyword("b"), 2],
    [keyword("a"), 1],
  ]),
  valueSet([3, 1, 2]),
]), valueMap([[keyword("source"), "parity"]]));

let generated = vectorFromArray([]);
for (let index = 0; index < 2_000; index += 1) {
  generated = vector.persistent_vector_conj(
    generated,
    index % 3 === 0
      ? listFromArray([index, `value-${index % 17}`])
      : index % 3 === 1
        ? valueSet([index, keyword("generated", `value-${index}`)])
        : valueMap([[keyword("index"), index]]),
  );
}
const generatedPrinted = printValue(generated);
const generatedRestored = readValue(unwrap(generatedPrinted));

console.log(JSON.stringify({
  canonical: {
    root: unwrap(printedRoot),
    map: unwrap(printedMap),
    insertionIndependent: unwrap(printedMap) === unwrap(printValue(reorderedMap)),
    unsafeIdentifier: unwrap(unsafeIdentifier),
    common: unwrap(printValue(common)),
  },
  roundTrip: {
    rootEqual: valueEqual(root, unwrap(restoredRoot)),
    fixedPoint:
      unwrap(printValue(unwrap(restoredRoot))) === unwrap(printedRoot),
    metadataSource: mapGet(meta(
      list.persistent_list_first(unwrap(restoredRoot), null),
    ) ?? emptyValueMap(), keyword("source"), null),
    nestedMetadataSource: mapGet(
      meta(mapGet(
        list.persistent_list_first(unwrap(restoredRoot), null),
        keyword("a"),
        null,
      )),
      keyword("source"),
      null,
    ),
    generatedEqual: valueEqual(generated, unwrap(generatedRestored)),
    generatedFixedPoint:
      unwrap(printValue(unwrap(generatedRestored))) === unwrap(generatedPrinted),
  },
  values: {
    ok: readMany.ok,
    count: vectorCount(unwrap(readMany)),
    first: vectorNth(unwrap(readMany), 0, null),
    keyword: identifier.qualified_name(vectorNth(unwrap(readMany), 1, null)),
    listCount: list.persistent_list_count(vectorNth(unwrap(readMany), 2, null)),
    undefinedPreserved:
      list.persistent_list_nth(vectorNth(unwrap(readMany), 2, null), 1, "missing") ===
      undefined,
  },
  errors: {
    duplicateMap: duplicateMap.error.message,
    duplicateSet: duplicateSet.error.message,
    located: {
      offset: located.error.offset,
      line: located.error.line,
      column: located.error.column,
      sourceLength: located.error.sourceLength,
    },
    limited: limited.error.message,
  },
  edges: {
    decodedString: unwrap(decodedString),
    taggedSymbol: identifier.qualified_name(unwrap(taggedSymbol)),
    ignored: vector.persistent_vector_to_array(unwrap(ignored)),
    depthLimited: depthLimited.error.message,
    lengthLimited: lengthLimited.error.message,
    valueLimited: valueLimited.error.message,
    invalidOptions: invalidOptions.error.message,
    invalidEscape: invalidEscape.error.message,
    oddMap: oddMap.error.message,
    unknownDispatch: unknownDispatch.error.message,
    trailing: trailing.error.message,
    emptyValues: vectorCount(unwrap(readValues(" ; nothing\n"))),
    negativeZero: unwrap(printValue(unwrap(readValue("-0")))),
  },
  shape: {
    mapCount: mapCount(orderedMap),
    setCount: setCount(valueSet([3, 1, 2])),
    generatedCount: vectorCount(generated),
  },
}));
