import {
  COLLECTION_CONJ,
  COLLECTION_COUNT,
  COLLECTION_EMPTY,
  COLLECTION_PEEK,
  COLLECTION_POP,
  COLLECTION_REDUCE,
  COLLECTION_SEQ,
  reduceIterable,
  sequenceView,
} from "./collection-internals.mjs";
import {
  METADATA_READ,
  METADATA_WITH,
} from "./metadata-internals.mjs";
import {
  QUEUE_CONSTRUCTOR_TOKEN,
  QUEUE_STATE,
  recordQueueAllocation,
  recordQueueFrontPromotion,
} from "./queue-internals.mjs";
import {
  VALUE_EQUAL,
  VALUE_HASH,
  orderedCollectionHash,
} from "./value-internals.mjs";
import {
  EMPTY_VECTOR,
  PersistentVector,
  persistentVector,
  subvec,
} from "./vector.mjs";

const MAX_COUNT = 0x7fff_ffff;
const QUEUE_HASH_TAG = 0x6b3d_1f27;

function makeQueue(count, front, rear, metadata = null) {
  recordQueueAllocation();
  return new PersistentQueue(
    QUEUE_CONSTRUCTOR_TOKEN,
    count,
    front,
    rear,
    metadata,
  );
}

function emptyQueueWithMetadata(metadata) {
  return metadata === null
    ? EMPTY_QUEUE
    : makeQueue(0, EMPTY_VECTOR, EMPTY_VECTOR, metadata);
}

export class PersistentQueue {
  constructor(token, count, front, rear, metadata = null) {
    if (token !== QUEUE_CONSTRUCTOR_TOKEN) {
      throw new TypeError(
        "PersistentQueue values must be created with persistentQueue or PersistentQueue.from",
      );
    }
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_COUNT ||
        !(front instanceof PersistentVector) ||
        !(rear instanceof PersistentVector) ||
        front.count + rear.count !== count ||
        (count === 0 ? front.count !== 0 || rear.count !== 0 : front.count === 0)) {
      throw new TypeError("invalid persistent queue state");
    }
    this[QUEUE_STATE] = Object.freeze({
      count,
      front,
      rear,
      metadata,
    });
    Object.freeze(this);
  }

  static empty() {
    return EMPTY_QUEUE;
  }

  static from(iterable) {
    if (iterable instanceof PersistentQueue) return iterable;
    let result = EMPTY_QUEUE;
    for (const value of iterable) result = result.conj(value);
    return result;
  }

  get count() {
    return this[QUEUE_STATE].count;
  }

  get size() {
    return this[QUEUE_STATE].count;
  }

  get isEmpty() {
    return this[QUEUE_STATE].count === 0;
  }

  conj(value) {
    const state = this[QUEUE_STATE];
    if (state.count === MAX_COUNT) {
      throw new RangeError(`persistent queue cannot exceed ${MAX_COUNT} values`);
    }
    return state.count === 0
      ? makeQueue(1, persistentVector(value), EMPTY_VECTOR, state.metadata)
      : makeQueue(
        state.count + 1,
        state.front,
        state.rear.conj(value),
        state.metadata,
      );
  }

  peek(notFound = null) {
    const state = this[QUEUE_STATE];
    return state.count === 0 ? notFound : state.front.nth(0);
  }

  pop() {
    const state = this[QUEUE_STATE];
    if (state.count === 0) {
      throw new RangeError("cannot pop an empty persistent queue");
    }
    if (state.front.count > 1) {
      return makeQueue(
        state.count - 1,
        subvec(state.front, 1),
        state.rear,
        state.metadata,
      );
    }
    if (state.rear.count === 0) {
      return emptyQueueWithMetadata(state.metadata);
    }
    recordQueueFrontPromotion(state.rear.count);
    return makeQueue(
      state.count - 1,
      state.rear,
      EMPTY_VECTOR,
      state.metadata,
    );
  }

  reduce(reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }

  toArray() {
    return [...this];
  }

  [COLLECTION_COUNT]() {
    return this.count;
  }

  [COLLECTION_EMPTY]() {
    return emptyQueueWithMetadata(this[QUEUE_STATE].metadata);
  }

  [COLLECTION_CONJ](value) {
    return this.conj(value);
  }

  [COLLECTION_PEEK]() {
    return this.peek();
  }

  [COLLECTION_POP]() {
    return this.pop();
  }

  [COLLECTION_SEQ]() {
    return this.isEmpty
      ? null
      : sequenceView(() => this[Symbol.iterator](), this.count);
  }

  [COLLECTION_REDUCE](reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }

  [VALUE_EQUAL](other, equal) {
    if (!(other instanceof PersistentQueue) || other.count !== this.count) {
      return false;
    }
    const right = other[Symbol.iterator]();
    for (const value of this) {
      if (!equal(value, right.next().value)) return false;
    }
    return true;
  }

  [VALUE_HASH](hash) {
    return orderedCollectionHash(this, hash, QUEUE_HASH_TAG);
  }

  [METADATA_READ]() {
    return this[QUEUE_STATE].metadata;
  }

  [METADATA_WITH](metadata) {
    const state = this[QUEUE_STATE];
    return metadata === state.metadata
      ? this
      : makeQueue(
        state.count,
        state.front,
        state.rear,
        metadata,
      );
  }

  *[Symbol.iterator]() {
    const state = this[QUEUE_STATE];
    yield* state.front;
    yield* state.rear;
  }

  get [Symbol.toStringTag]() {
    return "EliscriptPersistentQueue";
  }
}

export const EMPTY_QUEUE = new PersistentQueue(
  QUEUE_CONSTRUCTOR_TOKEN,
  0,
  EMPTY_VECTOR,
  EMPTY_VECTOR,
);

export function persistentQueue(...values) {
  return PersistentQueue.from(values);
}

export function isPersistentQueue(value) {
  return value instanceof PersistentQueue;
}
