import {
  MemoizedSequenceView,
  memoizedSequenceView,
  seq,
} from "./collection.mjs";
import { memoizedSequenceStatus } from "./collection-internals.mjs";

const lazyConsStates = new WeakMap();
const NO_LAZY_CONS_FAILURE = Symbol("eliscript.lazy-cons.no-failure");

function requireThunk(value, label) {
  if (typeof value !== "function") {
    throw new TypeError(`${label} must be a function`);
  }
  return value;
}

function sequenceIterator(value) {
  const sequence = seq(value);
  return sequence === null
    ? [][Symbol.iterator]()
    : sequence[Symbol.iterator]();
}

function realizeConsTail(state) {
  if (state.failure !== NO_LAZY_CONS_FAILURE) throw state.failure;
  if (!state.tailStarted) {
    state.tailStarted = true;
    try {
      state.tail = state.tailThunk();
      state.tailThunk = null;
    } catch (error) {
      state.failure = error;
      throw error;
    }
  }
  return state.tail;
}

function lazyConsIterator(initialState) {
  let state = initialState;
  let headPending = true;
  let tailIterator = null;
  let complete = false;
  return {
    next() {
      while (!complete) {
        if (state !== null && headPending) {
          headPending = false;
          return { value: state.value, done: false };
        }
        if (state !== null) {
          const tail = realizeConsTail(state);
          const tailState = lazyConsStates.get(tail);
          if (tailState !== undefined) {
            state = tailState;
            headPending = true;
            continue;
          }
          state = null;
          tailIterator = sequenceIterator(tail);
        }
        const result = tailIterator.next();
        if (!result.done) return result;
        complete = true;
      }
      return { value: undefined, done: true };
    },
    return(value) {
      complete = true;
      if (tailIterator !== null && typeof tailIterator.return === "function") {
        tailIterator.return();
      }
      return { value, done: true };
    },
    [Symbol.iterator]() {
      return this;
    },
  };
}

export function lazySequence(thunk) {
  if (arguments.length !== 1) {
    throw new TypeError("lazySequence requires exactly one thunk");
  }
  requireThunk(thunk, "lazySequence thunk");
  return memoizedSequenceView(() => sequenceIterator(thunk()));
}

export function lazyCons(value, tailThunk) {
  if (arguments.length !== 2) {
    throw new TypeError("lazyCons requires a value and tail thunk");
  }
  requireThunk(tailThunk, "lazyCons tail thunk");
  const state = {
    value,
    tailThunk,
    tailStarted: false,
    tail: null,
    failure: NO_LAZY_CONS_FAILURE,
  };
  const result = memoizedSequenceView(() => lazyConsIterator(state));
  lazyConsStates.set(result, state);
  return result;
}

export function isLazySequence(value) {
  return value instanceof MemoizedSequenceView;
}

function status(value) {
  if (!isLazySequence(value)) {
    throw new TypeError("operation requires a lazy sequence");
  }
  return memoizedSequenceStatus(value);
}

export function isLazySequenceRealized(value) {
  return status(value).started;
}

export function realizedLazySequenceCount(value) {
  return status(value).realizedCount;
}

export function realizeLazySequence(value) {
  status(value);
  for (const _element of value) {
    // Traversal commits each produced value to the shared realization cache.
  }
  return value;
}
