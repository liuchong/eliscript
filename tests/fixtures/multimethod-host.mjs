import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const moduleUrl = pathToFileURL(modulePath);
const multimethodModule = await import(moduleUrl.href);
const hierarchyModule = await import(new URL("./hierarchy.eli", moduleUrl).href);
const mapModule = await import(new URL("./persistent-map.eli", moduleUrl).href);
const setModule = await import(new URL("./persistent-set.eli", moduleUrl).href);
const vectorModule = await import(
  new URL("./persistent-vector.eli", moduleUrl).href
);

const {
  add_method_BANG_: addMethod,
  default_dispatch_value: defaultDispatchValue,
  derive_BANG_: deriveMethod,
  dispatch_fn: dispatchFn,
  dispatch_value: dispatchValue,
  get_method: getMethod,
  has_method_QMARK_: hasMethod,
  methods,
  multi_fn: multiFn,
  multi_fn_hierarchy: multiFnHierarchy,
  multi_fn_name: multiFnName,
  multi_fn_QMARK_: isMultiFn,
  prefer_method_BANG_: preferMethod,
  preferences,
  preferred_method_QMARK_: preferredMethod,
  remove_all_methods_BANG_: removeAllMethods,
  remove_all_preferences_BANG_: removeAllPreferences,
  remove_method_BANG_: removeMethod,
  remove_preference_BANG_: removePreference,
  set_hierarchy_BANG_: setHierarchy,
  underive_BANG_: underiveMethod,
} = multimethodModule;
const {
  ancestors,
  derive,
  descendants,
  empty_hierarchy: emptyHierarchy,
  hierarchy_QMARK_: isHierarchy,
  is_a_QMARK_: isA,
  parents,
  underive,
} = hierarchyModule;
const {
  persistent_map_count: mapCount,
  persistent_map_get: mapGet,
} = mapModule;
const {
  persistent_set_count: setCount,
} = setModule;
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

function captureHierarchyError(operation) {
  try {
    operation();
    return null;
  } catch (error) {
    return {
      code: error?.code ?? String(error),
      child: error?.child ?? null,
      parent: error?.parent ?? null,
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

const hierarchy0 = emptyHierarchy();
const hierarchy1 = derive(hierarchy0, "mammal", "animal");
const hierarchy2 = derive(hierarchy1, "cat", "mammal");
const hierarchy3 = derive(hierarchy2, "dog", "mammal");
const duplicateHierarchy = derive(hierarchy3, "dog", "mammal");
const hierarchy4 = underive(hierarchy3, "mammal", "animal");
const diamond0 = derive(hierarchy0, "left", "root");
const diamond1 = derive(diamond0, "right", "root");
const diamond2 = derive(diamond1, "leaf", "left");
const diamond3 = derive(diamond2, "leaf", "right");
const diamond4 = underive(diamond3, "left", "root");
const lateAncestor0 = derive(hierarchy0, "child", "parent");
const lateAncestor1 = derive(lateAncestor0, "grandchild", "child");
const lateAncestor2 = derive(lateAncestor1, "parent", "late-root");
const vectorChild = vectorFromArray(["cat", "online"]);
const vectorParent = vectorFromArray(["animal", "online"]);
let wideHierarchy = hierarchy0;
for (let index = 0; index < 10_000; index += 1) {
  wideHierarchy = derive(wideHierarchy, `leaf-${index}`, "wide-root");
}

const taxonomy = multiFn("taxonomy", (value) => value);
const deriveResult = deriveMethod(taxonomy, "mammal", "animal");
deriveMethod(taxonomy, "cat", "mammal");
addMethod(taxonomy, "animal", (value) => `animal:${value}`);
addMethod(taxonomy, "mammal", (value) => `mammal:${value}`);
addMethod(taxonomy, defaultDispatchValue(taxonomy), (value) => `default:${value}`);
const mammalResult = taxonomy("cat");
const specificResult = taxonomy("cat");
removeMethod(taxonomy, "mammal");
const cacheInvalidatedByRemoval = taxonomy("cat");
addMethod(taxonomy, "mammal", (value) => `mammal:${value}`);
const cacheInvalidatedByAddition = taxonomy("cat");
addMethod(taxonomy, "cat", (value) => `exact:${value}`);
const exactOverridesAncestor = taxonomy("cat");
removeMethod(taxonomy, "cat");
const removingExactRestoresAncestor = taxonomy("cat");
const hierarchicalFallbackResult = taxonomy("mineral");
const setHierarchyResult = setHierarchy(taxonomy, hierarchy3);
const externalHierarchyIdentity =
  setHierarchyResult === taxonomy && multiFnHierarchy(taxonomy) === hierarchy3;
const underiveResult = underiveMethod(taxonomy, "cat", "mammal");
const underivedFallback = taxonomy("cat");

const chooser = multiFn("chooser", (value) => value);
deriveMethod(chooser, "chimera", "mammal");
deriveMethod(chooser, "chimera", "machine");
addMethod(chooser, "mammal", (value) => `mammal:${value}`);
addMethod(chooser, "machine", (value) => `machine:${value}`);
const ambiguous = captureError(() => chooser("chimera"));
const preferResult = preferMethod(chooser, "mammal", "machine");
const preferredResult = chooser("chimera");
preferMethod(chooser, "machine", "artifact");
const preferenceSnapshot = preferences(chooser);
const directPreference = preferredMethod(chooser, "mammal", "machine");
const transitivePreference = preferredMethod(chooser, "mammal", "artifact");
const preferenceSelf = captureError(() =>
  preferMethod(chooser, "mammal", "mammal"));
const preferenceConflict = captureError(() =>
  preferMethod(chooser, "machine", "mammal"));
const invalidHierarchy = captureError(() => setHierarchy(chooser, {}));
const hierarchyConflict = captureError(() =>
  deriveMethod(chooser, "machine", "mammal"));
const conflictHierarchy = derive(hierarchy0, "machine", "mammal");
const externalHierarchyConflict = captureError(() =>
  setHierarchy(chooser, conflictHierarchy));
const removePreferenceResult = removePreference(chooser, "mammal", "machine");
const removedPreferenceError = captureError(() => chooser("chimera"));
const clearPreferencesResult = removeAllPreferences(chooser);

const invalidHierarchyValue = captureHierarchyError(() => parents({}, "cat"));
const selfHierarchy = captureHierarchyError(() =>
  derive(hierarchy0, "animal", "animal"));
const cycleHierarchy = captureHierarchyError(() =>
  derive(hierarchy3, "animal", "cat"));

let hierarchicalScaleCalls = 0;
const hierarchicalScale = multiFn("hierarchical-scale", (value) => {
  hierarchicalScaleCalls += 1;
  return "leaf";
});
deriveMethod(hierarchicalScale, "leaf", "root");
addMethod(hierarchicalScale, "root", (value) => value);
let hierarchicalScaleTotal = 0;
for (let index = 0; index < 100_000; index += 1) {
  hierarchicalScaleTotal += hierarchicalScale(index);
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
  hierarchy: {
    identity: isHierarchy(hierarchy0),
    forged: isHierarchy({}),
    duplicateRetainsIdentity: duplicateHierarchy === hierarchy3,
    directParentCount: setCount(parents(hierarchy3, "cat")),
    transitiveAncestorCount: setCount(ancestors(hierarchy3, "cat")),
    transitiveDescendantCount: setCount(descendants(hierarchy3, "animal")),
    catIsAnimal: isA(hierarchy3, "cat", "animal"),
    vectorIsA: isA(hierarchy3, vectorChild, vectorParent),
    oldSnapshotRetainsRelation: isA(hierarchy3, "cat", "animal"),
    underiveRemovesTransitiveRelation: !isA(hierarchy4, "cat", "animal"),
    underiveRetainsDirectRelation: isA(hierarchy4, "cat", "mammal"),
    diamondRetainsAlternatePath: isA(diamond4, "leaf", "root"),
    lateAncestorReachesGrandchild:
      isA(lateAncestor2, "grandchild", "late-root"),
    lateAncestorDescendantCount:
      setCount(descendants(lateAncestor2, "late-root")),
    wideDescendantCount: setCount(descendants(wideHierarchy, "wide-root")),
    wideLastLeafMatches: isA(wideHierarchy, "leaf-9999", "wide-root"),
    wideBaseRemainsEmpty: descendants(hierarchy0, "wide-root") === null,
  },
  hierarchyErrors: {
    invalid: invalidHierarchyValue,
    self: selfHierarchy,
    cycle: cycleHierarchy,
  },
  hierarchicalDispatch: {
    deriveReturnsIdentity: deriveResult === taxonomy,
    mammalResult,
    specificResult,
    cacheInvalidatedByRemoval,
    cacheInvalidatedByAddition,
    exactOverridesAncestor,
    removingExactRestoresAncestor,
    fallbackResult: hierarchicalFallbackResult,
    externalHierarchyIdentity,
    underiveReturnsIdentity: underiveResult === taxonomy,
    underivedFallback,
  },
  preferences: {
    ambiguous: ambiguous.code,
    preferReturnsIdentity: preferResult === chooser,
    preferredResult,
    directPreference,
    transitivePreference,
    snapshotCount: mapCount(preferenceSnapshot),
    removeReturnsIdentity: removePreferenceResult === chooser,
    removedIsAmbiguous: removedPreferenceError.code,
    clearReturnsIdentity: clearPreferencesResult === chooser,
    clearedCount: mapCount(preferences(chooser)),
  },
  preferenceErrors: {
    self: preferenceSelf.code,
    conflict: preferenceConflict.code,
    invalidHierarchy: invalidHierarchy.code,
    hierarchyConflict: hierarchyConflict.code,
    externalHierarchyConflict: externalHierarchyConflict.code,
  },
  hierarchicalScale: {
    calls: hierarchicalScaleCalls,
    total: hierarchicalScaleTotal,
  },
}));
