import {
  MemoizedSequenceView,
  memoizedSequenceView,
  seq,
} from "./collection.mjs";
import { memoizedSequenceStatus } from "./collection-internals.mjs";
import {
  deduping,
  distincting,
  dropping,
  droppingWhile,
  filtering,
  interposing,
  keeping,
  keepingIndexed,
  mapcatting,
  mapping,
  mappingIndexed,
  partitioningAll,
  partitioningBy,
  removing,
  sequence as transducerSequence,
  taking,
  takingNth,
  takingWhile,
} from "./transducer.mjs";

const lazyConsStates = new WeakMap();
const NO_LAZY_CONS_FAILURE = Symbol("eliscript.lazy-cons.no-failure");

function requireThunk(value, label) {
  if (typeof value !== "function") {
    throw new TypeError(`${label} must be a function`);
  }
  return value;
}

function requireArity(actual, expected, name) {
  if (actual !== expected) {
    const unit = expected === 1 ? "argument" : "arguments";
    throw new TypeError(`${name} requires exactly ${expected} ${unit}`);
  }
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

export function lazyMap(transform, collection) {
  requireArity(arguments.length, 2, "lazyMap");
  return transducerSequence(mapping(transform), collection);
}

export function lazyMapIndexed(transform, collection) {
  requireArity(arguments.length, 2, "lazyMapIndexed");
  return transducerSequence(mappingIndexed(transform), collection);
}

export function lazyKeep(transform, collection) {
  requireArity(arguments.length, 2, "lazyKeep");
  return transducerSequence(keeping(transform), collection);
}

export function lazyKeepIndexed(transform, collection) {
  requireArity(arguments.length, 2, "lazyKeepIndexed");
  return transducerSequence(keepingIndexed(transform), collection);
}

export function lazyFilter(predicate, collection) {
  requireArity(arguments.length, 2, "lazyFilter");
  return transducerSequence(filtering(predicate), collection);
}

export function lazyRemove(predicate, collection) {
  requireArity(arguments.length, 2, "lazyRemove");
  return transducerSequence(removing(predicate), collection);
}

export function lazyTake(limit, collection) {
  requireArity(arguments.length, 2, "lazyTake");
  return transducerSequence(taking(limit), collection);
}

export function lazyDrop(limit, collection) {
  requireArity(arguments.length, 2, "lazyDrop");
  return transducerSequence(dropping(limit), collection);
}

export function lazyTakeWhile(predicate, collection) {
  requireArity(arguments.length, 2, "lazyTakeWhile");
  return transducerSequence(takingWhile(predicate), collection);
}

export function lazyDropWhile(predicate, collection) {
  requireArity(arguments.length, 2, "lazyDropWhile");
  return transducerSequence(droppingWhile(predicate), collection);
}

export function lazyTakeNth(interval, collection) {
  requireArity(arguments.length, 2, "lazyTakeNth");
  return transducerSequence(takingNth(interval), collection);
}

export function lazyInterpose(separator, collection) {
  requireArity(arguments.length, 2, "lazyInterpose");
  return transducerSequence(interposing(separator), collection);
}

export function lazyDedupe(collection) {
  requireArity(arguments.length, 1, "lazyDedupe");
  return transducerSequence(deduping(), collection);
}

export function lazyDistinct(collection) {
  requireArity(arguments.length, 1, "lazyDistinct");
  return transducerSequence(distincting(), collection);
}

export function lazyMapcat(transform, collection) {
  requireArity(arguments.length, 2, "lazyMapcat");
  return transducerSequence(mapcatting(transform), collection);
}

export function lazyPartitionAll(size, collection) {
  requireArity(arguments.length, 2, "lazyPartitionAll");
  return transducerSequence(partitioningAll(size), collection);
}

export function lazyPartitionBy(classifier, collection) {
  requireArity(arguments.length, 2, "lazyPartitionBy");
  return transducerSequence(partitioningBy(classifier), collection);
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
