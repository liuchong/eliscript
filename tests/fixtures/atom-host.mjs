import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const [modulePath] = process.argv.slice(2);
const atomModule = await import(pathToFileURL(modulePath).href);
const vectorModule = await import(pathToFileURL(
  resolve(dirname(modulePath), "../persistent-vector.eli"),
).href);

const {
  add_watch: addWatch,
  atom,
  atom_QMARK_: isAtom,
  compare_and_set_BANG_: compareAndSet,
  deref,
  get_validator: getValidator,
  remove_watch: removeWatch,
  reset_BANG_: reset,
  reset_vals_BANG_: resetVals,
  set_validator_BANG_: setValidator,
  swap_BANG_: swap,
  swap_vals_BANG_: swapVals,
} = atomModule;
const { persistent_vector_to_array: vectorToArray } = vectorModule;

function captureError(operation) {
  try {
    operation();
    return null;
  } catch (error) {
    return error?.code ?? String(error);
  }
}

const counter = atom(1);
const forgedAtom = {
  kind: "eliscript/atom",
  identify: () => true,
  read: counter.read,
};
const hostileAtom = {};
Object.defineProperty(hostileAtom, "identify", {
  enumerable: true,
  get() {
    throw new Error("hostile getter");
  },
});
const resetResult = reset(counter, 2);
const swapResult = swap(counter, (value, left, right) =>
  value + left + right, 3, 4);
const resetValues = vectorToArray(resetVals(counter, 10));
const swapValues = vectorToArray(
  swapVals(counter, (value, amount) => value + amount, 5),
);
const compareMismatch = compareAndSet(counter, 10, 20);
const compareSuccess = compareAndSet(counter, 15, 20);
const equalExpectedValue = resetVals(atom(0), 1);
const equalObservedValue = resetVals(atom(0), 1);
const equalExpected = atom(equalExpectedValue);
const valueEqualCompare = compareAndSet(
  equalExpected,
  equalObservedValue,
  [3, 4],
);
const opaqueExpected = { value: 1 };
const opaqueReference = atom(opaqueExpected);
const opaqueMismatch = compareAndSet(
  opaqueReference,
  { value: 1 },
  { value: 2 },
);
const opaqueSuccess = compareAndSet(
  opaqueReference,
  opaqueExpected,
  { value: 3 },
);

const validatorCalls = [];
const nonnegative = (value) => {
  validatorCalls.push(value);
  return value >= 0;
};
const guarded = atom(2, { validator: nonnegative });
let guardedWatchCalls = 0;
addWatch(guarded, "guard", () => {
  guardedWatchCalls += 1;
});
const compareRejected = compareAndSet(guarded, 99, -1);
const compareMismatchWatchCalls = guardedWatchCalls;
let inheritedValidatorCalls = 0;
const inheritedOptions = Object.create({
  validator() {
    inheritedValidatorCalls += 1;
    return false;
  },
});
const inheritedGuard = atom(1, inheritedOptions);
const acceptedValue = reset(guarded, 5);
const rejectedCode = captureError(() => reset(guarded, -1));
const rejectedState = deref(guarded);
const rejectedReplacement = captureError(() =>
  setValidator(guarded, (value) => value > 100));
const validatorUnchanged = getValidator(guarded) === nonnegative;
const clearedValidator = setValidator(guarded, null);
const unguardedValue = reset(guarded, -1);

const thrownMarker = { marker: "validator" };
const throwing = atom(1, {
  validator(value) {
    if (value === 2) throw thrownMarker;
    return true;
  },
});
let validatorMarkerPreserved = false;
try {
  reset(throwing, 2);
} catch (error) {
  validatorMarkerPreserved = error === thrownMarker;
}
const stateAfterThrownValidator = deref(throwing);
const stateAfterRecovery = reset(throwing, 3);

const reentrantSwap = atom(1);
const reentrantSwapCode = captureError(() =>
  swap(reentrantSwap, (value) => {
    reset(reentrantSwap, value + 1);
    return value + 2;
  }));

const reentrantValidator = atom(1);
const reentrantValidatorCode = captureError(() =>
  setValidator(reentrantValidator, (value) => {
    reset(reentrantValidator, value);
    return true;
  }));
const reentrantCompare = atom(1);
const reentrantCompareCode = captureError(() =>
  swap(reentrantCompare, (value) => {
    compareAndSet(reentrantCompare, value, value + 1);
    return value + 2;
  }));

const watched = atom(0);
const watchEvents = [];
addWatch(watched, "observer", (key, _reference, oldValue, newValue) => {
  watchEvents.push([key, oldValue, newValue]);
});
addWatch(watched, "control", (key, reference, oldValue, newValue) => {
  watchEvents.push([key, oldValue, newValue]);
  if (newValue === 1) {
    removeWatch(reference, "control");
    removeWatch(reference, "observer");
    addWatch(reference, "late", (lateKey, _atom, lateOld, lateNew) => {
      watchEvents.push([lateKey, lateOld, lateNew]);
    });
    reset(reference, 2);
  }
});
const outerResetResult = reset(watched, 1);
const outerEvents = watchEvents
  .filter(([, oldValue, newValue]) => oldValue === 0 && newValue === 1)
  .map(([key]) => key)
  .sort();
const nestedEvents = watchEvents
  .filter(([, oldValue, newValue]) => oldValue === 1 && newValue === 2)
  .map(([key]) => key)
  .sort();
const firstNestedIndex = watchEvents.findIndex(([, oldValue]) => oldValue === 1);
const lastOuterIndex = watchEvents.findLastIndex(([, oldValue]) =>
  oldValue === 0);

const replacement = atom(0);
const replacementEvents = [];
addWatch(replacement, "same", () => replacementEvents.push("old"));
addWatch(replacement, "same", () => replacementEvents.push("new"));
reset(replacement, 1);

const watchFailure = atom(0);
const watchMarker = { marker: "watch" };
let healthyWatchCalls = 0;
addWatch(watchFailure, "bad", () => {
  throw watchMarker;
});
addWatch(watchFailure, "good", () => {
  healthyWatchCalls += 1;
});
let watchMarkerPreserved = false;
try {
  reset(watchFailure, 1);
} catch (error) {
  watchMarkerPreserved = error === watchMarker;
}
removeWatch(watchFailure, "bad");
const watchRecoveryValue = reset(watchFailure, 2);

const model = atom(0, { validator: (value) => value >= 0 });
let modelValue = 0;
let modelTransitions = 0;
let modelAgreement = true;
addWatch(model, "model", (_key, _reference, oldValue, newValue) => {
  modelTransitions += 1;
  if (oldValue !== modelValue) modelAgreement = false;
  modelValue = newValue;
});
let randomState = 0x6d2b79f5;
for (let index = 0; index < 20_000; index += 1) {
  randomState ^= randomState << 13;
  randomState ^= randomState >>> 17;
  randomState ^= randomState << 5;
  randomState >>>= 0;
  if (index % 17 === 0) {
    const before = deref(model);
    if (captureError(() => reset(model, -1)) !== "ELI-ATOM-VALIDATION") {
      modelAgreement = false;
    }
    if (deref(model) !== before) modelAgreement = false;
  } else if (index % 13 === 0) {
    const before = deref(model);
    const candidate = randomState % 10_000;
    const values = vectorToArray(resetVals(model, candidate));
    if (values[0] !== before || values[1] !== candidate) modelAgreement = false;
  } else if (index % 11 === 0) {
    const before = deref(model);
    const amount = randomState % 7;
    const values = vectorToArray(
      swapVals(model, (value, increment) => value + increment, amount),
    );
    if (values[0] !== before || values[1] !== before + amount) {
      modelAgreement = false;
    }
  } else if (index % 7 === 0) {
    const before = deref(model);
    const shouldMatch = (randomState & 2) === 0;
    const expected = shouldMatch ? before : before + 1;
    const candidate = randomState % 10_000;
    if (compareAndSet(model, expected, candidate) !== shouldMatch) {
      modelAgreement = false;
    }
  } else if ((randomState & 1) === 0) {
    const next = randomState % 10_000;
    reset(model, next);
  } else {
    const amount = randomState % 7;
    swap(model, (value, increment) => value + increment, amount);
  }
  if (deref(model) !== modelValue) modelAgreement = false;
}

const scale = atom(0);
for (let index = 0; index < 100_000; index += 1) {
  swap(scale, (value) => value + 1);
}

console.log(JSON.stringify({
  basic: {
    atom: isAtom(counter),
    hostObject: isAtom({}),
    forgedAtom: isAtom(forgedAtom),
    hostileAtom: isAtom(hostileAtom),
    resetResult,
    swapResult,
    resetValues,
    swapValues,
    compareMismatch,
    compareSuccess,
    value: deref(counter),
    valueEqualCompare,
    valueEqualState: deref(equalExpected),
    opaqueMismatch,
    opaqueSuccess,
    opaqueState: deref(opaqueReference),
    invalidReference: captureError(() => deref({})),
    invalidTransform: captureError(() => swap(counter, null)),
  },
  validation: {
    calls: validatorCalls,
    compareRejected,
    compareMismatchWatchCalls,
    guardedWatchCalls,
    acceptedValue,
    rejectedCode,
    rejectedState,
    rejectedReplacement,
    validatorUnchanged,
    clearedValidator,
    unguardedValue,
    initialRejection: captureError(() => atom(-1, { validator: (v) => v >= 0 })),
    invalidValidator: captureError(() => atom(0, { validator: 1 })),
    invalidOptions: captureError(() => atom(0, { unknown: true })),
    inheritedValidatorCalls,
    inheritedValue: deref(inheritedGuard),
    validatorMarkerPreserved,
    stateAfterThrownValidator,
    stateAfterRecovery,
  },
  reentrancy: {
    swap: reentrantSwapCode,
    swapState: deref(reentrantSwap),
    validator: reentrantValidatorCode,
    validatorState: deref(reentrantValidator),
    validatorInstalled: getValidator(reentrantValidator) !== null,
    compare: reentrantCompareCode,
    compareState: deref(reentrantCompare),
  },
  watches: {
    outerResetResult,
    finalValue: deref(watched),
    outerEvents,
    nestedEvents,
    ordered: lastOuterIndex < firstNestedIndex,
    replacementEvents,
    watchMarkerPreserved,
    committedAfterFailure: deref(watchFailure),
    healthyWatchCalls,
    watchRecoveryValue,
  },
  model: {
    agreement: modelAgreement,
    transitions: modelTransitions,
    value: deref(model),
  },
  scale: {
    value: deref(scale),
  },
}));
