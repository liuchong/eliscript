import {
  BRANCH_BITS,
  BRANCH_MASK,
  BRANCH_WIDTH,
  EMPTY_ROOT,
  EMPTY_TAIL,
  TRANSIENT_VECTOR_CONSTRUCTOR_TOKEN,
  TRANSIENT_VECTOR_STATE,
  VECTOR_CONSTRUCTOR_TOKEN,
  VECTOR_STATE,
  VectorNode,
  allocateTail,
  editableVectorNode,
  recordInvalidTransientVectorCall,
  recordRootGrowth,
  recordTransientVectorNodeMutation,
  recordTransientVectorPersistent,
  recordTransientVectorTailCopy,
  recordTransientVectorTailMutation,
  visitNode,
} from "./vector-internals.mjs";
import {
  VALUE_EQUAL,
  VALUE_HASH,
  orderedCollectionHash,
} from "./value-internals.mjs";
import {
  COLLECTION_COUNT,
  COLLECTION_EMPTY,
  COLLECTION_CONJ,
  COLLECTION_GET,
  COLLECTION_ASSOC,
  COLLECTION_CONTAINS,
  COLLECTION_NTH,
  COLLECTION_REDUCE,
  COLLECTION_REDUCE_KV,
  COLLECTION_SEQ,
  isReducedValue,
  reduceIterable,
  sequenceView,
  unreducedValue,
} from "./collection-internals.mjs";
import {
  EDITABLE_TRANSIENT,
  TRANSIENT_ASSOC,
  TRANSIENT_CONJ,
  TRANSIENT_PERSISTENT,
} from "./transient-internals.mjs";
import {
  METADATA_READ,
  METADATA_WITH,
} from "./metadata-internals.mjs";

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

function transientNewPath(level, node, owner) {
  if (level === 0) {
    return node;
  }
  return new VectorNode(
    [transientNewPath(level - BRANCH_BITS, node, owner)],
    owner,
  );
}

function transientPushTail(level, parent, tailNode, count, owner) {
  visitNode(parent);
  const editable = editableVectorNode(parent, owner);
  const subindex = ((count - 1) >>> level) & BRANCH_MASK;
  if (level === BRANCH_BITS) {
    editable.slots[subindex] = tailNode;
  } else {
    const child = editable.slots[subindex];
    editable.slots[subindex] = child === undefined
      ? transientNewPath(level - BRANCH_BITS, tailNode, owner)
      : transientPushTail(level - BRANCH_BITS, child, tailNode, count, owner);
  }
  recordTransientVectorNodeMutation();
  return editable;
}

function transientAssocNode(level, node, index, value, owner) {
  visitNode(node);
  const editable = editableVectorNode(node, owner);
  if (level === 0) {
    editable.slots[index & BRANCH_MASK] = value;
  } else {
    const subindex = (index >>> level) & BRANCH_MASK;
    editable.slots[subindex] = transientAssocNode(
      level - BRANCH_BITS,
      editable.slots[subindex],
      index,
      value,
      owner,
    );
  }
  recordTransientVectorNodeMutation();
  return editable;
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

function makeVector(count, shift, root, tail, metadata = null) {
  return new PersistentVector(
    VECTOR_CONSTRUCTOR_TOKEN,
    count,
    shift,
    root,
    tail,
    metadata,
  );
}

function emptyVectorWithMetadata(metadata) {
  return metadata === null
    ? EMPTY_VECTOR
    : makeVector(0, BRANCH_BITS, EMPTY_ROOT, EMPTY_TAIL, metadata);
}

function makeTransientVector(vector) {
  return new TransientVector(TRANSIENT_VECTOR_CONSTRUCTOR_TOKEN, vector);
}

function activeTransientVectorState(vector) {
  const state = vector[TRANSIENT_VECTOR_STATE];
  if (!state.active) {
    recordInvalidTransientVectorCall();
    throw new TypeError("transient vector is no longer editable");
  }
  return state;
}

function editableTransientTail(state) {
  if (!state.tailOwned) {
    state.tail = state.tail.slice();
    state.tailOwned = true;
    recordTransientVectorTailCopy();
  }
  return state.tail;
}

class TransientVector {
  constructor(token, vector) {
    if (token !== TRANSIENT_VECTOR_CONSTRUCTOR_TOKEN ||
        !(vector instanceof PersistentVector)) {
      throw new TypeError("transient vectors must be created from a persistent vector");
    }
    const source = vector[VECTOR_STATE];
    this[TRANSIENT_VECTOR_STATE] = {
      active: true,
      changed: false,
      owner: Object.freeze({}),
      source: vector,
      count: source.count,
      shift: source.shift,
      root: source.root,
      tail: source.tail,
      tailOwned: false,
      metadata: source.metadata,
    };
    Object.defineProperty(this, "__eliscript_transient__", {
      enumerable: true,
      get() {
        throw new TypeError("transient vectors cannot be serialized");
      },
    });
    Object.freeze(this);
  }

  [TRANSIENT_CONJ](value) {
    const state = activeTransientVectorState(this);
    if (state.count === MAX_COUNT) {
      throw new RangeError(`persistent vector cannot exceed ${MAX_COUNT} values`);
    }
    if (state.tail.length < BRANCH_WIDTH) {
      editableTransientTail(state).push(value);
      recordTransientVectorTailMutation();
    } else {
      if (!state.tailOwned) {
        state.tail = state.tail.slice();
        recordTransientVectorTailCopy();
      }
      const tailNode = new VectorNode(state.tail, state.owner);
      if ((state.count >>> BRANCH_BITS) > (1 << state.shift)) {
        state.root = new VectorNode([
          state.root,
          transientNewPath(state.shift, tailNode, state.owner),
        ], state.owner);
        state.shift += BRANCH_BITS;
        recordRootGrowth();
      } else {
        state.root = transientPushTail(
          state.shift,
          state.root,
          tailNode,
          state.count,
          state.owner,
        );
      }
      state.tail = [value];
      state.tailOwned = true;
      recordTransientVectorTailMutation();
    }
    state.count += 1;
    state.changed = true;
    return this;
  }

  [TRANSIENT_ASSOC](index, value) {
    const state = activeTransientVectorState(this);
    if (index === state.count) {
      return this[TRANSIENT_CONJ](value);
    }
    assertIndex(index, state.count, "assocBang");
    if (index >= tailOffset(state.count)) {
      editableTransientTail(state)[index & BRANCH_MASK] = value;
      recordTransientVectorTailMutation();
    } else {
      state.root = transientAssocNode(
        state.shift,
        state.root,
        index,
        value,
        state.owner,
      );
    }
    state.changed = true;
    return this;
  }

  [TRANSIENT_PERSISTENT]() {
    const state = activeTransientVectorState(this);
    const result = state.changed
      ? makeVector(
        state.count,
        state.shift,
        state.root,
        state.tail,
        state.metadata,
      )
      : state.source;
    state.active = false;
    state.owner = null;
    recordTransientVectorPersistent();
    return result;
  }

  toJSON() {
    throw new TypeError("transient vectors cannot be serialized");
  }

  get [Symbol.toStringTag]() {
    return "EliscriptTransientVector";
  }
}

export class PersistentVector {
  constructor(token, count, shift, root, tail, metadata = null) {
    if (token !== VECTOR_CONSTRUCTOR_TOKEN) {
      throw new TypeError(
        "PersistentVector values must be created with persistentVector or PersistentVector.from",
      );
    }
    this[VECTOR_STATE] = Object.freeze({
      count,
      shift,
      root,
      tail,
      metadata,
    });
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
        state.metadata,
      );
    }
    return makeVector(
      state.count,
      state.shift,
      assocNode(state.shift, state.root, index, value),
      state.tail,
      state.metadata,
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
        state.metadata,
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
      state.metadata,
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
      return emptyVectorWithMetadata(state.metadata);
    }
    if (state.tail.length > 1) {
      return makeVector(
        state.count - 1,
        state.shift,
        state.root,
        allocateTail(state.tail.slice(0, -1)),
        state.metadata,
      );
    }

    const tail = allocateTail([...arrayFor(state, state.count - 2)]);
    let root = popTail(state.shift, state.root, state.count) ?? EMPTY_ROOT;
    let shift = state.shift;
    if (shift > BRANCH_BITS && root.slots[1] === undefined) {
      root = root.slots[0];
      shift -= BRANCH_BITS;
    }
    return makeVector(
      state.count - 1,
      shift,
      root,
      tail,
      state.metadata,
    );
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

  [COLLECTION_EMPTY]() {
    return emptyVectorWithMetadata(this[VECTOR_STATE].metadata);
  }

  [COLLECTION_CONJ](value) {
    return this.conj(value);
  }

  [COLLECTION_GET](index, notFound = null) {
    return this.nth(index, notFound);
  }

  [COLLECTION_ASSOC](index, value) {
    return this.assoc(index, value);
  }

  [COLLECTION_CONTAINS](index) {
    return Number.isInteger(index) && index >= 0 && index < this.count;
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

  [COLLECTION_REDUCE_KV](reducer, initial) {
    const state = this[VECTOR_STATE];
    let result = initial;
    let index = 0;
    while (index < state.count) {
      const chunk = arrayFor(state, index);
      const chunkStart = index & BRANCH_MASK;
      const chunkLength = Math.min(chunk.length, state.count - (index - chunkStart));
      for (let offset = chunkStart; offset < chunkLength; offset += 1) {
        result = reducer(result, index, chunk[offset]);
        index += 1;
        if (isReducedValue(result)) return unreducedValue(result);
      }
    }
    return result;
  }

  [EDITABLE_TRANSIENT]() {
    return makeTransientVector(this);
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

  [METADATA_READ]() {
    return this[VECTOR_STATE].metadata;
  }

  [METADATA_WITH](metadata) {
    const state = this[VECTOR_STATE];
    return metadata === state.metadata
      ? this
      : makeVector(
        state.count,
        state.shift,
        state.root,
        state.tail,
        metadata,
      );
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
