export const SET_CONSTRUCTOR_TOKEN = Symbol("eliscript.set.constructor");
export const SET_STATE = Symbol("eliscript.set.state");
export const TRANSIENT_SET_CONSTRUCTOR_TOKEN = Symbol(
  "eliscript.set.transient-constructor",
);
export const TRANSIENT_SET_STATE = Symbol("eliscript.set.transient-state");

const transientMetrics = {
  persistentCalls: 0,
  invalidCalls: 0,
};

export const SET_PRESENT = Object.freeze({
  [Symbol.toStringTag]: "EliscriptPersistentHashSetEntry",
});

export function resetTransientSetMetrics() {
  for (const key of Object.keys(transientMetrics)) {
    transientMetrics[key] = 0;
  }
}

export function readTransientSetMetrics() {
  return Object.freeze({ ...transientMetrics });
}

export function recordTransientSetPersistent() {
  transientMetrics.persistentCalls += 1;
}

export function recordInvalidTransientSetCall() {
  transientMetrics.invalidCalls += 1;
}
