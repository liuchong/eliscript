import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const moduleUrl = pathToFileURL(modulePath);
const multimethodModule = await import(moduleUrl.href);
const mapModule = await import(new URL("./persistent-map.eli", moduleUrl).href);
const vectorModule = await import(
  new URL("./persistent-vector.eli", moduleUrl).href
);

const {
  add_method_BANG_: addMethod,
  default_dispatch_value: defaultDispatchValue,
  dispatch_fn: dispatchFn,
  dispatch_value: dispatchValue,
  get_method: getMethod,
  has_method_QMARK_: hasMethod,
  methods,
  multi_fn: multiFn,
  multi_fn_name: multiFnName,
  multi_fn_QMARK_: isMultiFn,
  remove_all_methods_BANG_: removeAllMethods,
  remove_method_BANG_: removeMethod,
} = multimethodModule;
const {
  persistent_map_count: mapCount,
  persistent_map_get: mapGet,
} = mapModule;
const {
  persistent_vector_from_array: vectorFromArray,
} = vectorModule;

function captureError(operation) {
  try {
    operation();
    return null;
  } catch (error) {
    return {
      code: error?.code ?? String(error),
      name: error?.name ?? null,
      dispatchValue: error?.["dispatch-value"] ?? null,
    };
  }
}

let dispatchCalls = 0;
const render = multiFn("render", (kind, value) => {
  dispatchCalls += 1;
  return kind;
});
const textMethod = (_kind, value) => `text:${value}`;
const numberMethod = (_kind, value) => value * 2;
const fallbackMethod = (kind, value) => `${kind}:${value}`;
const initialSnapshot = methods(render);
const addTextResult = addMethod(render, "text", textMethod);
addMethod(render, "number", numberMethod);
addMethod(render, defaultDispatchValue(render), fallbackMethod);
const populatedSnapshot = methods(render);
const textResult = render("text", "hello");
const numberResult = render("number", 21);
const fallbackResult = render("unknown", 9);
const dispatchOnly = dispatchValue(render, "text", "ignored");
const dispatchFunction = dispatchFn(render);
const lookedUpText = getMethod(render, "text");
const lookedUpFallback = getMethod(render, "absent");
const hasTextBeforeRemoval = hasMethod(render, "text");
const hasAbsentThroughDefault = hasMethod(render, "absent");
addMethod(render, "text", (_kind, value) => `replacement:${value}`);
const replacementResult = render("text", "hello");
const removeTextResult = removeMethod(render, "text");
const removedFallsBack = render("text", "hello");
const oldSnapshotText = mapGet(populatedSnapshot, "text", null);

const composite = multiFn("composite", (left, right) =>
  vectorFromArray([left, right]));
addMethod(
  composite,
  vectorFromArray(["number", 2]),
  (left, right) => `${left}/${right}`,
);
const compositeResult = composite("number", 2);

const customDefault = multiFn("custom-default", (value) => value, "fallback");
addMethod(customDefault, "fallback", (value) => `default:${value}`);
const customDefaultResult = customDefault("missing");
const nilDefault = multiFn("nil-default", (value) => value, null);
addMethod(nilDefault, null, (value) => `nil:${value}`);
const nilDefaultResult = nilDefault("missing");
const undefinedDefault = multiFn(
  "undefined-default",
  (value) => value,
  undefined,
);
addMethod(undefinedDefault, undefined, (value) => `undefined:${value}`);
const undefinedDefaultResult = undefinedDefault("missing");

const identityKey = {};
const identityDispatch = multiFn("identity", (value) => value);
addMethod(identityDispatch, identityKey, () => "identity-match");
const identityMatch = identityDispatch(identityKey);
const identityMiss = captureError(() => identityDispatch({}));

const dispatchMarker = { marker: "dispatch" };
const methodMarker = { marker: "method" };
const failedDispatch = multiFn("failed-dispatch", () => {
  throw dispatchMarker;
});
const failedMethod = multiFn("failed-method", (value) => value);
addMethod(failedMethod, "throw", () => {
  throw methodMarker;
});
let dispatchMarkerPreserved = false;
let methodMarkerPreserved = false;
try {
  failedDispatch();
} catch (error) {
  dispatchMarkerPreserved = error === dispatchMarker;
}
try {
  failedMethod("throw");
} catch (error) {
  methodMarkerPreserved = error === methodMarker;
}

const selfReplacing = multiFn("self-replacing", (value) => value);
addMethod(selfReplacing, "replace", () => {
  addMethod(selfReplacing, "replace", () => "second");
  return "first";
});
const firstSelfReplacement = selfReplacing("replace");
const secondSelfReplacement = selfReplacing("replace");

const empty = multiFn("empty", (value) => value);
const noMethod = captureError(() => empty("missing"));
const invalidDispatch = captureError(() => multiFn("bad", null));
const invalidArity = captureError(() => multiFn("bad", () => null, 1, 2));
const invalidMethod = captureError(() => addMethod(empty, "bad", 42));
const invalidReference = captureError(() => methods(() => null));
const forged = function forgedMultiFn() {};

const clearedSnapshot = methods(render);
const clearResult = removeAllMethods(render);
const clearedError = captureError(() => render("text", "hello"));

let scaleDispatchCalls = 0;
const parity = multiFn("parity", (value) => {
  scaleDispatchCalls += 1;
  return value & 1;
});
addMethod(parity, 0, (value) => value);
addMethod(parity, 1, (value) => -value);
let scaleTotal = 0;
for (let index = 0; index < 100_000; index += 1) {
  scaleTotal += parity(index);
}

console.log(JSON.stringify({
  identity: {
    multiFn: isMultiFn(render),
    ordinaryFunction: isMultiFn(() => null),
    forged: isMultiFn(forged),
    callable: typeof render === "function",
    name: multiFnName(render),
    dispatchFunction: dispatchFunction("number", 1),
    customDefault: defaultDispatchValue(customDefault),
  },
  dispatch: {
    textResult,
    numberResult,
    fallbackResult,
    dispatchOnly,
    calls: dispatchCalls,
    textLookup: lookedUpText === textMethod,
    fallbackLookup: lookedUpFallback === fallbackMethod,
    hasText: hasTextBeforeRemoval,
    hasAbsentThroughDefault,
  },
  mutation: {
    addReturnsIdentity: addTextResult === render,
    removeReturnsIdentity: removeTextResult === render,
    clearReturnsIdentity: clearResult === render,
    initialCount: mapCount(initialSnapshot),
    populatedCount: mapCount(populatedSnapshot),
    snapshotRetainsText: oldSnapshotText === textMethod,
    replacementResult,
    removedFallsBack,
    beforeClearCount: mapCount(clearedSnapshot),
    afterClearCount: mapCount(methods(render)),
  },
  valueDispatch: {
    compositeResult,
    customDefaultResult,
    nilDefaultResult,
    undefinedDefaultResult,
    identityMatch,
    identityMiss,
  },
  callbacks: {
    dispatchMarkerPreserved,
    methodMarkerPreserved,
    firstSelfReplacement,
    secondSelfReplacement,
  },
  errors: {
    noMethod,
    invalidDispatch,
    invalidArity,
    invalidMethod,
    invalidReference,
    clearedError,
  },
  scale: {
    calls: scaleDispatchCalls,
    total: scaleTotal,
  },
}));
