import {
  conj,
  empty,
  isReduced,
  reduce,
  reduced,
  unreduced,
} from "./collection.mjs";
import { implementsProtocolOperation } from "./protocol.mjs";
import {
  IEditable,
  conjBang,
  persistentBang,
  transient,
} from "./transient.mjs";
import { isTruthy } from "./truth.mjs";

const REDUCING_FUNCTION = Symbol("eliscript.transducer.reducing-function");
const ZERO_INPUT = Symbol("eliscript.transducer.zero-input");

function identity(value) {
  return value;
}

function requireFunction(value, label) {
  if (typeof value !== "function") {
    throw new TypeError(`${label} must be a function`);
  }
  return value;
}

function asReducingFunction(value, label) {
  requireFunction(value, label);
  return value[REDUCING_FUNCTION] === true ? value : completing(value);
}

function makeTransducer(transform, zeroInput = false) {
  Object.defineProperty(transform, ZERO_INPUT, { value: zeroInput });
  return Object.freeze(transform);
}

function applyTransducer(transducer, reducingFunction) {
  requireFunction(transducer, "transducer");
  return asReducingFunction(
    transducer(reducingFunction),
    "transducer result",
  );
}

const IDENTITY_TRANSDUCER = makeTransducer((reducingFunction) =>
  reducingFunction);

export function completing(step, complete = identity) {
  requireFunction(step, "reducing step");
  requireFunction(complete, "reducing completion");

  const reducingFunction = (...arguments_) => {
    if (arguments_.length === 1) {
      return complete(arguments_[0]);
    }
    if (arguments_.length === 2) {
      return step(arguments_[0], arguments_[1]);
    }
    throw new TypeError(
      "reducing functions accept one completion argument or two step arguments",
    );
  };
  Object.defineProperty(reducingFunction, REDUCING_FUNCTION, { value: true });
  return Object.freeze(reducingFunction);
}

export function mapping(transform) {
  requireFunction(transform, "mapping transform");
  return makeTransducer((reducingFunction) => {
    const downstream = asReducingFunction(
      reducingFunction,
      "mapping reducing function",
    );
    return completing(
      (result, input) => downstream(result, transform(input)),
      (result) => downstream(result),
    );
  });
}

export function filtering(predicate) {
  requireFunction(predicate, "filtering predicate");
  return makeTransducer((reducingFunction) => {
    const downstream = asReducingFunction(
      reducingFunction,
      "filtering reducing function",
    );
    return completing(
      (result, input) => isTruthy(predicate(input))
        ? downstream(result, input)
        : result,
      (result) => downstream(result),
    );
  });
}

export function removing(predicate) {
  requireFunction(predicate, "removing predicate");
  return makeTransducer((reducingFunction) => {
    const downstream = asReducingFunction(
      reducingFunction,
      "removing reducing function",
    );
    return completing(
      (result, input) => isTruthy(predicate(input))
        ? result
        : downstream(result, input),
      (result) => downstream(result),
    );
  });
}

export function taking(limit) {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new TypeError("taking limit must be a non-negative safe integer");
  }
  return makeTransducer((reducingFunction) => {
    const downstream = asReducingFunction(
      reducingFunction,
      "taking reducing function",
    );
    let remaining = limit;
    return completing(
      (result, input) => {
        if (remaining === 0) {
          return reduced(result);
        }
        remaining -= 1;
        const stepped = downstream(result, input);
        return remaining === 0 && !isReduced(stepped)
          ? reduced(stepped)
          : stepped;
      },
      (result) => downstream(result),
    );
  }, limit === 0);
}

export function dropping(limit) {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new TypeError("dropping limit must be a non-negative safe integer");
  }
  return makeTransducer((reducingFunction) => {
    const downstream = asReducingFunction(
      reducingFunction,
      "dropping reducing function",
    );
    let remaining = limit;
    return completing(
      (result, input) => {
        if (remaining > 0) {
          remaining -= 1;
          return result;
        }
        return downstream(result, input);
      },
      (result) => downstream(result),
    );
  });
}

export function composeTransducers(...transducers) {
  for (const transducer of transducers) {
    requireFunction(transducer, "composed transducer");
  }
  return makeTransducer(
    (reducingFunction) => transducers.reduceRight(
      (downstream, transducer) => applyTransducer(transducer, downstream),
      asReducingFunction(reducingFunction, "composed reducing function"),
    ),
    transducers.some((transducer) => transducer[ZERO_INPUT] === true),
  );
}

export function transduce(transducer, reducer, initial, collection) {
  if (arguments.length !== 4) {
    throw new TypeError(
      "transduce requires a transducer, reducer, initial value, and collection",
    );
  }
  const transformed = applyTransducer(
    transducer,
    asReducingFunction(reducer, "transduce reducer"),
  );
  const seed = unreduced(initial);
  const result = transducer[ZERO_INPUT] === true
    ? seed
    : reduce(collection, transformed, seed);
  return unreduced(transformed(unreduced(result)));
}

export function into(target, ...arguments_) {
  if (arguments_.length !== 1 && arguments_.length !== 2) {
    throw new TypeError(
      "into requires a target and source, or a target, transducer, and source",
    );
  }
  const transducer = arguments_.length === 1
    ? IDENTITY_TRANSDUCER
    : arguments_[0];
  const source = arguments_.length === 1 ? arguments_[0] : arguments_[1];
  const seed = empty(target);
  if (implementsProtocolOperation(IEditable, "transient", seed)) {
    return transduce(
      transducer,
      completing(
        (result, value) => conjBang(result, value),
        (result) => persistentBang(result),
      ),
      transient(seed),
      source,
    );
  }
  return transduce(
    transducer,
    (result, value) => conj(result, value),
    seed,
    source,
  );
}
