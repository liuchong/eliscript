import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const atomModule = await import(pathToFileURL(modulePath).href);

const {
  add_watch: addWatch,
  atom,
  atom_QMARK_: isAtom,
  deref,
  get_validator: getValidator,
  remove_watch: removeWatch,
  reset_BANG_: reset,
  set_validator_BANG_: setValidator,
  swap_BANG_: swap,
} = atomModule;

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

const validatorCalls = [];
const nonnegative = (value) => {
  validatorCalls.push(value);
  return value >= 0;
};
const guarded = atom(2, { validator: nonnegative });
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
    value: deref(counter),
    invalidReference: captureError(() => deref({})),
    invalidTransform: captureError(() => swap(counter, null)),
  },
  validation: {
    calls: validatorCalls,
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
