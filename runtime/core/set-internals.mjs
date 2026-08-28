export const SET_CONSTRUCTOR_TOKEN = Symbol("eliscript.set.constructor");
export const SET_STATE = Symbol("eliscript.set.state");

export const SET_PRESENT = Object.freeze({
  [Symbol.toStringTag]: "EliscriptPersistentHashSetEntry",
});
