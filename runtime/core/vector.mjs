import {
  BRANCH_BITS,
  BRANCH_MASK,
  BRANCH_WIDTH,
  EMPTY_ROOT,
  EMPTY_TAIL,
  VECTOR_CONSTRUCTOR_TOKEN,
  VECTOR_STATE,
  VectorNode,
  allocateTail,
  recordRootGrowth,
  visitNode,
} from "./vector-internals.mjs";
import {
  VALUE_EQUAL,
  VALUE_HASH,
  orderedCollectionHash,
} from "./value-internals.mjs";
import {
  COLLECTION_COUNT,
  COLLECTION_GET,
  COLLECTION_NTH,
  COLLECTION_REDUCE,
  COLLECTION_SEQ,
  reduceIterable,
  sequenceView,
} from "./collection-internals.mjs";

const MAX_COUNT = 0x7fffffff;
const MISSING = Symbol("eliscript.vector.missing");
const VECTOR_HASH_TAG = 0x4f1b_2c3d;

function assertIndex(index, upperBound, operation) {
  if (!Number.isInteger(index) || index < 0 || index >= upperBound) {
    throw new RangeError(
      `${operation} index ${String(index)} is outside [0, ${upperBound})`,
    );
  }
}

function tailOffset(count) {
  return count < BRANCH_WIDTH
    ? 0
    : ((count - 1) >>> BRANCH_BITS) << BRANCH_BITS;
}

function newPath(level, node) {
  if (level === 0) {
    return node;
  }
  return new VectorNode([newPath(level - BRANCH_BITS, node)]);
}

function pushTail(level, parent, tailNode, count) {
  visitNode(parent);
  const subindex = ((count - 1) >>> level) & BRANCH_MASK;
  const slots = parent.slots.slice();

  if (level === BRANCH_BITS) {
    slots[subindex] = tailNode;
  } else {
    const child = parent.slots[subindex];
    slots[subindex] = child === undefined
      ? newPath(level - BRANCH_BITS, tailNode)
      : pushTail(level - BRANCH_BITS, child, tailNode, count);
  }
  return new VectorNode(slots);
}

function assocNode(level, node, index, value) {
  visitNode(node);
  const slots = node.slots.slice();
  if (level === 0) {
    slots[index & BRANCH_MASK] = value;
  } else {
    const subindex = (index >>> level) & BRANCH_MASK;
    slots[subindex] = assocNode(
      level - BRANCH_BITS,
      node.slots[subindex],
      index,
      value,
    );
  }
  return new VectorNode(slots);
}

function popTail(level, node, count) {
  visitNode(node);
  const subindex = ((count - 2) >>> level) & BRANCH_MASK;
  if (level > BRANCH_BITS) {
    const child = popTail(
      level - BRANCH_BITS,
      node.slots[subindex],
      count,
    );
    if (child === undefined && subindex === 0) {
      return undefined;
    }
    const slots = node.slots.slice();
    slots[subindex] = child;
    return new VectorNode(slots);
  }
  if (subindex === 0) {
    return undefined;
  }
  const slots = node.slots.slice();
  slots[subindex] = undefined;
  return new VectorNode(slots);
}

function arrayFor(state, index) {
  if (index >= tailOffset(state.count)) {
    return state.tail;
  }

  let node = state.root;
  for (let level = state.shift; level > 0; level -= BRANCH_BITS) {
    visitNode(node);
    node = node.slots[(index >>> level) & BRANCH_MASK];
  }
  visitNode(node);
  return node.slots;
}

function makeVector(count, shift, root, tail) {
  return new PersistentVector(
    VECTOR_CONSTRUCTOR_TOKEN,
    count,
    shift,
    root,
    tail,
  );
}

export class PersistentVector {
  constructor(token, count, shift, root, tail) {
    if (token !== VECTOR_CONSTRUCTOR_TOKEN) {
      throw new TypeError(
        "PersistentVector values must be created with persistentVector or PersistentVector.from",
      );
    }
    this[VECTOR_STATE] = Object.freeze({ count, shift, root, tail });
    Object.freeze(this);
  }

  static empty() {
    return EMPTY_VECTOR;
  }

  static from(iterable) {
    if (iterable instanceof PersistentVector) {
      return iterable;
    }
    let result = EMPTY_VECTOR;
    for (const value of iterable) {
      result = result.conj(value);
    }
    return result;
  }

  get count() {
    return this[VECTOR_STATE].count;
  }

  get size() {
    return this[VECTOR_STATE].count;
  }

  nth(index, notFound = MISSING) {
    const state = this[VECTOR_STATE];
    if (!Number.isInteger(index) || index < 0 || index >= state.count) {
      if (notFound !== MISSING) {
        return notFound;
      }
      assertIndex(index, state.count, "nth");
    }
    return arrayFor(state, index)[index & BRANCH_MASK];
  }

  assoc(index, value) {
    const state = this[VECTOR_STATE];
    if (index === state.count) {
      return this.conj(value);
    }
    assertIndex(index, state.count, "assoc");

    if (index >= tailOffset(state.count)) {
      const tail = state.tail.slice();
      tail[index & BRANCH_MASK] = value;
      return makeVector(
        state.count,
        state.shift,
        state.root,
        allocateTail(tail),
      );
    }
    return makeVector(
      state.count,
      state.shift,
      assocNode(state.shift, state.root, index, value),
      state.tail,
    );
  }

  conj(value) {
    const state = this[VECTOR_STATE];
    if (state.count === MAX_COUNT) {
      throw new RangeError(`persistent vector cannot exceed ${MAX_COUNT} values`);
    }
    if (state.tail.length < BRANCH_WIDTH) {
      return makeVector(
        state.count + 1,
        state.shift,
        state.root,
        allocateTail([...state.tail, value]),
      );
    }

    const tailNode = new VectorNode(state.tail);
    let shift = state.shift;
    let root;
    if ((state.count >>> BRANCH_BITS) > (1 << state.shift)) {
      root = new VectorNode([
        state.root,
        newPath(state.shift, tailNode),
      ]);
      shift += BRANCH_BITS;
      recordRootGrowth();
    } else {
      root = pushTail(state.shift, state.root, tailNode, state.count);
    }
    return makeVector(
      state.count + 1,
      shift,
      root,
      allocateTail([value]),
    );
  }

  peek(notFound = null) {
    const state = this[VECTOR_STATE];
    return state.count === 0 ? notFound : state.tail[state.tail.length - 1];
  }

  pop() {
    const state = this[VECTOR_STATE];
    if (state.count === 0) {
      throw new RangeError("cannot pop an empty persistent vector");
    }
    if (state.count === 1) {
      return EMPTY_VECTOR;
    }
    if (state.tail.length > 1) {
      return makeVector(
        state.count - 1,
        state.shift,
        state.root,
        allocateTail(state.tail.slice(0, -1)),
      );
    }

    const tail = allocateTail([...arrayFor(state, state.count - 2)]);
    let root = popTail(state.shift, state.root, state.count) ?? EMPTY_ROOT;
    let shift = state.shift;
    if (shift > BRANCH_BITS && root.slots[1] === undefined) {
      root = root.slots[0];
      shift -= BRANCH_BITS;
    }
    return makeVector(state.count - 1, shift, root, tail);
  }

  reduce(reducer, ...initial) {
    if (typeof reducer !== "function") {
      throw new TypeError("persistent vector reducer must be a function");
    }
    const state = this[VECTOR_STATE];
    let accumulator;
    let index = 0;
    if (initial.length === 0) {
      if (state.count === 0) {
        throw new TypeError("cannot reduce an empty persistent vector without an initial value");
      }
      accumulator = this.nth(0);
      index = 1;
    } else {
      accumulator = initial[0];
    }

    while (index < state.count) {
      const chunk = arrayFor(state, index);
      const chunkStart = index & BRANCH_MASK;
      const chunkLength = Math.min(chunk.length, state.count - (index - chunkStart));
      for (let offset = chunkStart; offset < chunkLength; offset += 1) {
        accumulator = reducer(accumulator, chunk[offset], index);
        index += 1;
      }
    }
    return accumulator;
  }

  [COLLECTION_COUNT]() {
    return this.count;
  }

  [COLLECTION_GET](index, notFound = null) {
    return this.nth(index, notFound);
  }

  [COLLECTION_NTH](index, ...notFound) {
    return notFound.length === 0
      ? this.nth(index)
      : this.nth(index, notFound[0]);
  }

  [COLLECTION_SEQ]() {
    return this.count === 0
      ? null
      : sequenceView(() => this[Symbol.iterator](), this.count);
  }

  [COLLECTION_REDUCE](reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }

  toArray() {
    return this.reduce((values, value) => {
      values.push(value);
      return values;
    }, []);
  }

  [VALUE_EQUAL](other, equal) {
    if (!(other instanceof PersistentVector) || other.count !== this.count) {
      return false;
    }
    const right = other[Symbol.iterator]();
    for (const value of this) {
      if (!equal(value, right.next().value)) {
        return false;
      }
    }
    return true;
  }

  [VALUE_HASH](hash) {
    return orderedCollectionHash(this, hash, VECTOR_HASH_TAG);
  }

  *[Symbol.iterator]() {
    const state = this[VECTOR_STATE];
    let index = 0;
    while (index < state.count) {
      const chunk = arrayFor(state, index);
      const chunkStart = index & BRANCH_MASK;
      const chunkLength = Math.min(chunk.length, state.count - (index - chunkStart));
      for (let offset = chunkStart; offset < chunkLength; offset += 1) {
        yield chunk[offset];
        index += 1;
      }
    }
  }

  get [Symbol.toStringTag]() {
    return "EliscriptPersistentVector";
  }
}

export const EMPTY_VECTOR = makeVector(0, BRANCH_BITS, EMPTY_ROOT, EMPTY_TAIL);

export function persistentVector(...values) {
  return PersistentVector.from(values);
}

export function isPersistentVector(value) {
  return value instanceof PersistentVector;
}
