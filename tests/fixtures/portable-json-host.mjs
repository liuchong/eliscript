import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const moduleUrl = pathToFileURL(modulePath);
const jsonModule = await import(moduleUrl.href);
const resultModule = await import(new URL("./result.eli", moduleUrl).href);
const vectorModule = await import(
  new URL("./persistent-vector.eli", moduleUrl).href
);
const mapModule = await import(new URL("./persistent-map.eli", moduleUrl).href);
const valueModule = await import(new URL("./value.eli", moduleUrl).href);
const identifierModule = await import(new URL("./identifier.eli", moduleUrl).href);
const listModule = await import(
  new URL("./persistent-list.eli", moduleUrl).href
);
const setModule = await import(new URL("./persistent-set.eli", moduleUrl).href);

const {
  json_error_code: jsonErrorCode,
  json_error_message: jsonErrorMessage,
  json_error_offset: jsonErrorOffset,
  json_error_path: jsonErrorPath,
  json_error_QMARK_: isJsonError,
  parse_json: parseJson,
  stringify_json: stringifyJson,
} = jsonModule;
const {
  err_QMARK_: isErr,
  ok_QMARK_: isOk,
  result_payload: resultPayload,
} = resultModule;
const {
  persistent_vector_count: vectorCount,
  persistent_vector_from_array: vectorFromArray,
  persistent_vector_nth: vectorNth,
  persistent_vector_QMARK_: isVector,
} = vectorModule;
const {
  persistent_map_get: mapGet,
  persistent_map_QMARK_: isMap,
} = mapModule;
const {
  value_equal_QMARK_: valueEqual,
  value_map_from_entries: mapFromEntries,
} = valueModule;
const { keyword, symbol } = identifierModule;
const { persistent_list_from_array: listFromArray } = listModule;
const { persistent_set_from_array: setFromArray } = setModule;

function payload(result) {
  return resultPayload(result);
}

function encoded(value, options) {
  const result = stringifyJson(value, options);
  if (!isOk(result)) throw new Error(jsonErrorMessage(payload(result)));
  return payload(result);
}

function errorReport(result) {
  const error = payload(result);
  return {
    result: isErr(result),
    jsonError: isJsonError(error),
    code: jsonErrorCode(error),
    message: jsonErrorMessage(error),
    offset: jsonErrorOffset(error),
    path: jsonErrorPath(error),
  };
}

const nestedResult = parseJson(
  '{"z":[true,null,"x\\n\\u263a"],"a":{"n":-1.25e3}}',
);
const nested = payload(nestedResult);
const nestedVector = mapGet(nested, "z", null);
const nestedMap = mapGet(nested, "a", null);

const escaped = payload(parseJson('"\\"\\\\\\/\\b\\f\\n\\r\\t\\u0041"'));
const emoji = "\ud83d\ude00";
const emojiText = encoded(emoji);
const loneSurrogate = "\ud800";
const loneSurrogateText = encoded(loneSurrogate);

const firstMap = mapFromEntries([["b", 2], ["a", 1]]);
const secondMap = mapFromEntries([["a", 1], ["b", 2]]);
const firstCanonical = encoded(firstMap);
const secondCanonical = encoded(secondMap);

const malformedSources = [
  "",
  " ",
  "01",
  "1.",
  "1e",
  "1e+",
  "[1,]",
  '{"a":1,}',
  "'x'",
  '{"a" 1}',
  '{a:1}',
  '"\\x20"',
  '"line\nfeed"',
  "true false",
];
const malformed = malformedSources.map((source) => {
  const result = parseJson(source);
  return isErr(result) && isJsonError(payload(result));
});
const duplicate = errorReport(parseJson('{"a":1,"a":2}'));
const overflow = errorReport(parseJson("1e400"));
const sourceType = errorReport(parseJson(null));

const unsupportedValues = [
  undefined,
  1n,
  {},
  [],
  listFromArray([1]),
  setFromArray([1]),
  keyword("json"),
  symbol("json"),
];
const unsupported = unsupportedValues.map((value) =>
  jsonErrorCode(payload(stringifyJson(value))));
const badNumberCodes = [NaN, Infinity, -Infinity].map((value) =>
  jsonErrorCode(payload(stringifyJson(value))));
const badKey = errorReport(
  stringifyJson(mapFromEntries([[keyword("key"), 1]])),
);

const parseLimits = {
  options: errorReport(parseJson("null", { unknown: true })),
  optionValues: [
    { maxDepth: null },
    { maxLength: 1.5 },
    { maxValues: undefined },
  ].map((options) => jsonErrorCode(payload(parseJson("null", options)))),
  nullOptionsUseDefaults: isOk(parseJson("null", null)),
  length: errorReport(parseJson("null", { maxLength: 3 })),
  depth: errorReport(parseJson("[[0]]", { maxDepth: 1 })),
  values: errorReport(parseJson("[1,2]", { maxValues: 2 })),
};
const stringifyLimits = {
  options: errorReport(stringifyJson(null, { maxDepth: 513 })),
  length: errorReport(stringifyJson(null, { maxLength: 3 })),
  depth: errorReport(
    stringifyJson(vectorFromArray([vectorFromArray([0])]), { maxDepth: 1 }),
  ),
  values: errorReport(
    stringifyJson(vectorFromArray([1, 2]), { maxValues: 2 }),
  ),
};

const shared = vectorFromArray([1]);
const sharedText = encoded(vectorFromArray([shared, shared]));
const cyclic = vectorFromArray([null]);
cyclic.tail[0] = cyclic;
const cycle = errorReport(stringifyJson(cyclic));
const malformedErrorRejected = !isJsonError(mapFromEntries([
  ["kind", "eliscript/json-error"],
  ["code", "ELI-JSON-SYNTAX"],
  ["message", "invalid"],
  ["path", "$"],
  ["extra", null],
]));

let generatedRoundTrips = true;
for (let index = 0; index < 2_000; index += 1) {
  const value = mapFromEntries([
    ["index", index],
    ["parity", index % 2 === 0],
    ["items", vectorFromArray([index % 17, `v${index % 31}`, null])],
  ]);
  const roundTrip = parseJson(encoded(value));
  if (!isOk(roundTrip) || !valueEqual(payload(roundTrip), value)) {
    generatedRoundTrips = false;
    break;
  }
}

const scaleCount = 20_000;
const scaleSource = `[${Array.from(
  { length: scaleCount },
  (_, index) => index,
).join(",")}]`;
const scaleResult = parseJson(scaleSource);
const scaleValue = payload(scaleResult);
const scaleText = encoded(scaleValue);

console.log(JSON.stringify({
  parsing: {
    ok: isOk(nestedResult),
    map: isMap(nested),
    vector: isVector(nestedVector),
    vectorCount: vectorCount(nestedVector),
    trueValue: vectorNth(nestedVector, 0, false),
    nilValue: vectorNth(nestedVector, 1, "missing") === null,
    stringValue: vectorNth(nestedVector, 2, "missing"),
    numberValue: mapGet(nestedMap, "n", null),
  },
  strings: {
    escapedCodes: Array.from(escaped, (character) => character.charCodeAt(0)),
    emojiText,
    emojiRoundTrip: payload(parseJson(emojiText)) === emoji,
    loneSurrogateText,
    loneSurrogateRoundTrip:
      payload(parseJson(loneSurrogateText)).charCodeAt(0) === 0xd800,
  },
  canonical: {
    first: firstCanonical,
    sameAcrossInsertionOrder: firstCanonical === secondCanonical,
    nested: encoded(nested),
    negativeZero: encoded(-0),
  },
  strictness: {
    malformed: malformed.every(Boolean),
    malformedCount: malformed.length,
    duplicate,
    overflow,
    sourceType,
  },
  domain: {
    unsupported,
    badNumberCodes,
    badKey,
    sharedText,
    cycle,
    malformedErrorRejected,
  },
  limits: { parse: parseLimits, stringify: stringifyLimits },
  properties: { generatedRoundTrips },
  scale: {
    ok: isOk(scaleResult),
    count: vectorCount(scaleValue),
    first: vectorNth(scaleValue, 0, null),
    last: vectorNth(scaleValue, scaleCount - 1, null),
    stable: scaleText === scaleSource,
  },
}));
