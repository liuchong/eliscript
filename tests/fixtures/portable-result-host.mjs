import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const moduleUrl = pathToFileURL(modulePath);
const resultModule = await import(moduleUrl.href);
const vectorModule = await import(new URL("./persistent-vector.eli", moduleUrl).href);
const mapModule = await import(new URL("./persistent-map.eli", moduleUrl).href);
const valueModule = await import(new URL("./value.eli", moduleUrl).href);
const dataTextModule = await import(new URL("./data-text.eli", moduleUrl).href);

const {
  and_then: andThen,
  collect_results: collectResults,
  err,
  err_QMARK_: isErr,
  fold,
  map_err: mapErr,
  map_ok: mapOk,
  ok,
  ok_QMARK_: isOk,
  or_else: orElse,
  result_payload: resultPayload,
  result_QMARK_: isResult,
  traverse_results: traverseResults,
  unwrap_or: unwrapOr,
  unwrap_or_else: unwrapOrElse,
} = resultModule;
const {
  empty_persistent_vector: emptyVector,
  persistent_vector_conj: vectorConj,
  persistent_vector_count: vectorCount,
  persistent_vector_from_array: vectorFromArray,
  persistent_vector_to_array: vectorToArray,
} = vectorModule;
const { persistent_map_get: mapGet } = mapModule;
const {
  value_equal_QMARK_: valueEqual,
  value_hash: valueHash,
  value_map_from_entries: valueMapFromEntries,
} = valueModule;
const {
  data_text_result_value: dataTextResultValue,
  print_value: printValue,
  read_value: readValue,
} = dataTextModule;

const okFalse = ok(false);
const okNil = ok(null);
const okUndefined = ok(undefined);
const failed = err("failed");
let okCalls = 0;
let errorCalls = 0;
const mappedOk = mapOk((value) => {
  okCalls += 1;
  return value + 1;
}, ok(41));
const untouchedError = mapOk(() => {
  okCalls += 100;
  return 0;
}, failed);
const mappedError = mapErr((value) => {
  errorCalls += 1;
  return `${value}!`;
}, failed);
const untouchedOk = mapErr(() => {
  errorCalls += 100;
  return "wrong";
}, okFalse);

const collected = collectResults(vectorFromArray([ok(1), ok(2), ok(3)]));
const collectionFailure = err("stop");
const failedCollection = collectResults(
  vectorFromArray([ok(1), collectionFailure, ok(3)]),
);

let scaleValues = emptyVector();
for (let index = 0; index < 50_000; index += 1) {
  scaleValues = vectorConj(scaleValues, index);
}
let scaleCalls = 0;
const traversed = traverseResults((value) => {
  scaleCalls += 1;
  return ok(value * 2);
}, scaleValues);
const traversedValues = resultPayload(traversed);

const earlyFailure = err("early");
let earlyCalls = 0;
const early = traverseResults((value) => {
  earlyCalls += 1;
  return value === 12_345 ? earlyFailure : ok(value);
}, scaleValues);
let invalidCalls = 0;
const invalidTraversal = traverseResults((value) => {
  invalidCalls += 1;
  return value === 5 ? null : ok(value);
}, scaleValues);

const reconstructedOk = ok(vectorFromArray([1, 2, 3]));
const equivalentOk = ok(vectorFromArray([1, 2, 3]));
const resultKeyMap = valueMapFromEntries([[reconstructedOk, "present"]]);
const canonicalText = dataTextResultValue(printValue(reconstructedOk));
const decodedResult = dataTextResultValue(readValue(canonicalText));
let generatedInvariant = true;
for (let index = 0; index < 2_000; index += 1) {
  const left = index % 2 === 0 ? ok(index) : err(index);
  const right = index % 2 === 0 ? ok(index) : err(index);
  if (!valueEqual(left, right) || valueHash(left) !== valueHash(right)) {
    generatedInvariant = false;
    break;
  }
}

console.log(JSON.stringify({
  constructors: {
    ok: isOk(okFalse),
    error: isErr(failed),
    result: isResult(okNil) && isResult(failed),
    ordinaryMap: isResult(valueMapFromEntries([["status", "ok"]])),
    crossStatus: !isErr(okFalse) && !isOk(failed),
  },
  payloads: {
    false: resultPayload(okFalse) === false,
    nil: resultPayload(okNil) === null,
    undefined: resultPayload(okUndefined) === undefined,
    error: resultPayload(failed),
  },
  combinators: {
    mappedOk: resultPayload(mappedOk),
    mappedError: resultPayload(mappedError),
    untouchedError: untouchedError === failed,
    untouchedOk: untouchedOk === okFalse,
    okCalls,
    errorCalls,
    andThen: resultPayload(andThen((value) => ok(value + 1), ok(9))),
    andThenErrorIdentity: andThen(() => ok(0), failed) === failed,
    orElse: resultPayload(orElse((value) => ok(value.length), failed)),
    orElseOkIdentity: orElse(() => ok(0), okFalse) === okFalse,
    foldOk: fold((value) => value + 1, () => 0, ok(4)),
    foldError: fold(() => 0, (value) => value.length, failed),
    unwrapOk: unwrapOr(9, okFalse) === false,
    unwrapError: unwrapOr(9, failed),
    unwrapElse: unwrapOrElse((value) => value.length, failed),
  },
  collection: {
    values: vectorToArray(resultPayload(collected)),
    failureIdentity: failedCollection === collectionFailure,
    invalidSource: collectResults([]),
  },
  traversal: {
    ok: isOk(traversed),
    count: vectorCount(traversedValues),
    first: vectorToArray(traversedValues)[0],
    last: vectorToArray(traversedValues).at(-1),
    calls: scaleCalls,
    earlyIdentity: early === earlyFailure,
    earlyCalls,
    invalidResult: invalidTraversal === null,
    invalidCalls,
  },
  valueSemantics: {
    equal: valueEqual(reconstructedOk, equivalentOk),
    hashEqual: valueHash(reconstructedOk) === valueHash(equivalentOk),
    mapLookup: mapGet(resultKeyMap, equivalentOk, "missing"),
    generatedInvariant,
  },
  dataText: {
    decodedResult: isResult(decodedResult),
    equal: valueEqual(decodedResult, reconstructedOk),
    stable: dataTextResultValue(printValue(decodedResult)) === canonicalText,
  },
}));
