import { pathToFileURL } from "node:url";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const [modulePath] = process.argv.slice(2);
const moduleUrl = pathToFileURL(modulePath);
const interop = await import(moduleUrl.href);
const listModule = await import(new URL("../persistent-list.eli", moduleUrl));
const vectorModule = await import(new URL("../persistent-vector.eli", moduleUrl));
const mapModule = await import(new URL("../persistent-map.eli", moduleUrl));
const setModule = await import(new URL("../persistent-set.eli", moduleUrl));
const valueModule = await import(new URL("../value.eli", moduleUrl));
const runtimeVector = await import(new URL(
  "../../runtime/core/vector.mjs",
  moduleUrl,
));
const runtimeMap = await import(new URL(
  "../../runtime/core/map.mjs",
  moduleUrl,
));
const runtimeSet = await import(new URL(
  "../../runtime/core/set.mjs",
  moduleUrl,
));

const {
  array_QMARK_: isArray,
  from_js: fromJs,
  js_array: jsArray,
  js_map: jsMap,
  js_map_QMARK_: isMap,
  js_object: jsObject,
  js_set: jsSet,
  js_set_QMARK_: isSet,
  object_QMARK_: isObject,
  to_js: toJs,
  to_js_object: toJsObject,
} = interop;
const {
  persistent_list_from_array: persistentListFromArray,
  persistent_list_QMARK_: isPortableList,
} = listModule;
const {
  persistent_vector_from_array: persistentVectorFromArray,
  persistent_vector_nth: portableVectorNth,
  persistent_vector_QMARK_: isPortableVector,
} = vectorModule;
const {
  persistent_map_get: portableMapGet,
  persistent_map_QMARK_: isPortableMap,
} = mapModule;
const {
  persistent_set_has_QMARK_: portableSetHas,
  persistent_set_QMARK_: isPortableSet,
} = setModule;
const {
  value_map_from_entries: valueMapFromEntries,
  value_set_from_array: valueSetFromArray,
} = valueModule;

function captureError(operation) {
  try {
    operation();
    return null;
  } catch (error) {
    return {
      code: error?.code ?? String(error),
      path: error?.path ?? null,
      origin: error?.origin ?? null,
    };
  }
}

function canonicalHostValue(value) {
  if (Array.isArray(value)) return value.map(canonicalHostValue);
  if (value instanceof Map) {
    return Object.fromEntries([...value]
      .map(([key, itemValue]) => [String(key), canonicalHostValue(itemValue)])
      .sort(([left], [right]) => left.localeCompare(right)));
  }
  if (value !== null && typeof value === "object" &&
      Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.keys(value).sort()
      .map((key) => [key, canonicalHostValue(value[key])]));
  }
  return value;
}

const sharedPortable = persistentVectorFromArray([1, 2]);
const portableList = persistentListFromArray([sharedPortable, "tail"]);
const portableVector = persistentVectorFromArray([
  sharedPortable,
  sharedPortable,
  portableList,
]);
const portableMap = valueMapFromEntries([
  ["shared", sharedPortable],
  [persistentVectorFromArray(["key"]), portableVector],
]);
const portableSet = valueSetFromArray([
  sharedPortable,
  persistentVectorFromArray(["member"]),
]);

const shallowVector = toJs(portableVector);
const deepVector = toJs(portableVector, { deep: true });
const deepMap = toJs(portableMap, { deep: true });
const deepSet = toJs(portableSet, { deep: true });

const sharedHost = [1, 2];
const shallowSnapshot = fromJs([sharedHost]);
const deepSnapshot = fromJs([sharedHost, sharedHost], { deep: true });
const objectSnapshot = fromJs({ nested: sharedHost }, { deep: true });
const mapSnapshot = fromJs(new Map([
  ["left", sharedHost],
  ["right", sharedHost],
]), { deep: true });
const setSnapshot = fromJs(new Set([sharedHost]), { deep: true });

const deepPortable = fromJs(portableVector, { deep: true });
const deepPortableMap = fromJs(portableMap, { deep: true });
const deepPortableSet = fromJs(portableSet, { deep: true });
const runtimeValue = runtimeVector.persistentVector(
  runtimeMap.persistentHashMap(["set", runtimeSet.persistentHashSet(1, 2)]),
);
const deepRuntime = fromJs(runtimeValue, { deep: true });

const cyclicArray = [];
cyclicArray.push(cyclicArray);
const cyclicObject = {};
cyclicObject.self = cyclicObject;
const accessorObject = {};
Object.defineProperty(accessorObject, "secret", {
  enumerable: true,
  get() {
    throw new Error("accessor must not execute");
  },
});
const symbolKeyObject = {};
Object.defineProperty(symbolKeyObject, Symbol("secret"), {
  enumerable: true,
  value: 1,
});
const accessorOptions = {};
Object.defineProperty(accessorOptions, "deep", {
  enumerable: true,
  get() {
    throw new Error("option accessor must not execute");
  },
});
const symbolOptions = { [Symbol("deep")]: true };
const inheritedOptionsPrototype = Object.create(null);
inheritedOptionsPrototype.deep = true;
const inheritedOptions = Object.create(inheritedOptionsPrototype);

const inheritedObjectPrototype = Object.create(null);
inheritedObjectPrototype.inherited = "ignored";
const inheritedObject = Object.create(inheritedObjectPrototype);
inheritedObject.own = "kept";
Object.defineProperty(inheritedObject, "hidden", {
  enumerable: false,
  value: "ignored",
});
const inheritedObjectSnapshot = fromJs(inheritedObject, { deep: true });

const duplicateMap = new Map([
  [[1], "left"],
  [[1], "right"],
]);
const duplicateSet = new Set([[1], [1]]);

const hostArray = jsArray(1, 2, 3);
const hostMap = jsMap(["left", 1], ["right", 2]);
const hostSet = jsSet(1, 2, 2);
const hostObject = jsObject("name", "Eliscript", "__proto__", "data");
const foreign = vm.runInNewContext(`({
  array: [1, 2],
  map: new Map([["value", [3, 4]]]),
  set: new Set([5, 6]),
  object: { nested: [7, 8] },
})`);
const foreignSnapshot = fromJs(foreign.object, { deep: true });

const propsMap = valueMapFromEntries([
  ["className", "interop"],
  ["children", persistentVectorFromArray(["left", "right"])],
]);
const props = toJsObject(propsMap, { deep: true });
const rendered = renderToStaticMarkup(React.createElement("section", props));

let generatedAgreement = true;
for (let index = 0; index < 2_000; index += 1) {
  const source = {
    id: index,
    active: index % 2 === 0,
    values: [index % 17, `value-${index}`, null, [index, index + 1]],
    nested: { group: index % 11, enabled: index % 3 !== 0 },
  };
  const before = JSON.stringify(source);
  const restored = toJs(fromJs(source, { deep: true }), { deep: true });
  if (JSON.stringify(canonicalHostValue(restored)) !==
      JSON.stringify(canonicalHostValue(source)) ||
      JSON.stringify(source) !== before) {
    generatedAgreement = false;
  }
}
const scaleSource = Array.from({ length: 100_000 }, (_, index) => index);
const scaleSnapshot = fromJs(scaleSource, { deep: true });
const scaleRestored = toJs(scaleSnapshot, { deep: true });

const sharedSnapshotLeft = deepSnapshot.nth(0);
const sharedSnapshotRight = deepSnapshot.nth(1);
const objectNested = objectSnapshot.get("nested");
const mapLeft = mapSnapshot.get("left");
const mapRight = mapSnapshot.get("right");
const setMember = [...setSnapshot][0];
const deepRuntimeMap = deepRuntime.nth(0);
const deepRuntimeSet = deepRuntimeMap.get("set");

console.log(JSON.stringify({
  predicates: {
    array: isArray(hostArray),
    object: isObject(hostObject),
    map: isMap(hostMap),
    set: isSet(hostSet),
    arrayNotObject: !isObject(hostArray),
    runtimeNotNative: !isArray(runtimeValue) && !isMap(runtimeValue),
  },
  constructors: {
    array: hostArray,
    map: [...hostMap],
    set: [...hostSet],
    objectName: hostObject.name,
    safeProto: Object.getPrototypeOf(hostObject) === Object.prototype &&
      Object.prototype.hasOwnProperty.call(hostObject, "__proto__") &&
      hostObject.__proto__ === "data",
  },
  crossRealm: {
    predicates: isArray(foreign.array) && isMap(foreign.map) &&
      isSet(foreign.set) && isObject(foreign.object),
    array: runtimeVector.isPersistentVector(fromJs(foreign.array)),
    map: runtimeMap.isPersistentHashMap(fromJs(foreign.map)),
    set: runtimeSet.isPersistentHashSet(fromJs(foreign.set)),
    object: runtimeMap.isPersistentHashMap(foreignSnapshot) &&
      runtimeVector.isPersistentVector(foreignSnapshot.get("nested")),
  },
  toJs: {
    shallowArray: Array.isArray(shallowVector),
    shallowNestedIdentity: shallowVector[0] === sharedPortable,
    deepFamilies: Array.isArray(deepVector) &&
      deepMap instanceof Map && deepSet instanceof Set,
    deepSharing: deepVector[0] === deepVector[1],
    deepList: Array.isArray(deepVector[2]) && deepVector[2][1] === "tail",
    mapArrayKey: [...deepMap.keys()].some((key) =>
      Array.isArray(key) && key[0] === "key"),
    setArrays: [...deepSet].every(Array.isArray),
    hostShallowIdentity: toJs(hostArray) === hostArray,
  },
  fromJs: {
    shallowRuntimeVector: runtimeVector.isPersistentVector(shallowSnapshot),
    shallowNestedIdentity: shallowSnapshot.nth(0) === sharedHost,
    deepRuntimeVector: runtimeVector.isPersistentVector(deepSnapshot) &&
      runtimeVector.isPersistentVector(sharedSnapshotLeft),
    deepSharing: sharedSnapshotLeft === sharedSnapshotRight && mapLeft === mapRight,
    nestedFamilies: runtimeVector.isPersistentVector(objectNested) &&
      runtimeVector.isPersistentVector(setMember),
    objectMap: runtimeMap.isPersistentHashMap(objectSnapshot),
    mapMap: runtimeMap.isPersistentHashMap(mapSnapshot),
    setSet: runtimeSet.isPersistentHashSet(setSnapshot),
    portableFamilies: isPortableVector(deepPortable) &&
      isPortableList(portableVectorNth(deepPortable, 2, null)) &&
      isPortableMap(deepPortableMap) && isPortableSet(deepPortableSet),
    portableNested: isPortableVector(
      portableMapGet(deepPortableMap, "shared", null),
    ) && portableSetHas(deepPortableSet, sharedPortable),
    runtimeFamilies: runtimeVector.isPersistentVector(deepRuntime) &&
      runtimeMap.isPersistentHashMap(deepRuntimeMap) &&
      runtimeSet.isPersistentHashSet(deepRuntimeSet),
    plainObjectRules: inheritedObjectSnapshot.get("own") === "kept" &&
      !inheritedObjectSnapshot.has("inherited") &&
      !inheritedObjectSnapshot.has("hidden"),
    inheritedOptionsIgnored: toJs(portableVector, inheritedOptions)[0] ===
      sharedPortable,
    persistentShallowIdentity: fromJs(portableVector) === portableVector &&
      fromJs(runtimeValue) === runtimeValue,
  },
  errors: {
    arrayCycle: captureError(() => fromJs(cyclicArray, { deep: true })),
    objectCycle: captureError(() => toJs(cyclicObject, { deep: true })),
    accessor: captureError(() => fromJs(accessorObject, { deep: true })),
    symbolKey: captureError(() => fromJs(symbolKeyObject, { deep: true })),
    optionAccessor: captureError(() => toJs([], accessorOptions)),
    symbolOption: captureError(() => toJs([], symbolOptions)),
    duplicateMap: captureError(() => fromJs(duplicateMap, { deep: true })),
    duplicateSet: captureError(() => fromJs(duplicateSet, { deep: true })),
    depth: captureError(() => fromJs([[[1]]], {
      deep: true,
      maxDepth: 1,
    })),
    values: captureError(() => fromJs([1, 2], {
      deep: true,
      maxValues: 2,
    })),
    opaque: captureError(() => fromJs({ value: new Date(0) }, { deep: true })),
    options: captureError(() => toJs([], { unknown: true })),
    objectKey: captureError(() => toJsObject(
      valueMapFromEntries([[1, "value"]]),
    )),
  },
  react: {
    propsArray: Array.isArray(props.children),
    rendered,
  },
  generated: {
    count: 2_000,
    agreement: generatedAgreement,
    scaleCount: scaleRestored.length,
    scaleLast: scaleRestored.at(-1),
    sourceUnchanged: scaleSource.length === 100_000 && scaleSource.at(-1) === 99_999,
  },
}));
