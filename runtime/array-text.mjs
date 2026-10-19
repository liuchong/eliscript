// Internal JS target support. Generated modules import identical data URLs so
// recursive conversions share one guard without modifying global prototypes.
import {numberStringBuiltin, numberRadixText} from './number-radix.mjs';
const apply = Reflect.apply;
const functionCall = Function.prototype.call, functionApply = Function.prototype.apply, functionBind = Function.prototype.bind;
const define = Object.defineProperty, descriptor = Object.getOwnPropertyDescriptor;
const prototype = Object.getPrototypeOf, setPrototype = Object.setPrototypeOf, ownKeys = Reflect.ownKeys;
const hasInstance = Symbol.hasInstance;
const array = Array.isArray;
const intrinsicJoin = Array.prototype.join;
const intrinsicArrayString = Array.prototype.toString;
const objectString = Object.prototype.toString;
const string = String;
const TypeErrorClass = TypeError;
const primitiveKey = Symbol.toPrimitive;
const weakHas = WeakSet.prototype.has, weakAdd = WeakSet.prototype.add, weakDelete = WeakSet.prototype.delete;
const active = new WeakSet();
let activeRoot = null;
const object = value => value !== null && (typeof value === 'object' || typeof value === 'function' || (typeof value === 'undefined' && value !== void 0));
const callable = value => typeof value === 'function' || (typeof value === 'undefined' && value !== void 0);
function cycle() {
  const message = 'cyclic array text conversion', error = new TypeErrorClass(message);
  error.eliscriptDiagnostic = {format: 'eliscript-diagnostic', version: 1, code: 'ELI-RT0009', severity: 'error', phase: 'runtime', message};
  throw error;
}
function primitive(value) {
  if (!object(value)) return value;
  const exotic = value[primitiveKey];
  if (exotic !== void 0 && exotic !== null) {
    const result = apply(exotic, value, ['string']);
    if (!object(result)) return result;
    throw new TypeErrorClass('Cannot convert object to primitive value');
  }
  for (let index = 0; index < 2; index++) {
    const method = value[index === 0 ? 'toString' : 'valueOf'];
    if (callable(method)) {
      const result = method === intrinsicArrayString && array(value) ? arrayString(value) : apply(method, value, []);
      if (!object(result)) return result;
    }
  }
  throw new TypeErrorClass('Cannot convert object to primitive value');
}
function text(value) {
  const result = primitive(value);
  if (typeof result === 'symbol') throw new TypeErrorClass('Cannot convert a Symbol value to a string');
  return string(result);
}
function join(value, separator) {
  // Length is observed before separator conversion; indexed values stay live.
  const size = +value.length;
  const length = size !== size || size <= 0 ? 0 : size >= 9007199254740991 ? 9007199254740991 : size - size % 1;
  const sep = separator === void 0 ? ',' : text(separator);
  // The common outermost conversion needs only one private root reference.
  // Descendants retain weak membership and check that root before entering.
  const root = activeRoot === null;
  if (root) activeRoot = value;
  else {
    if (value === activeRoot || apply(weakHas, active, [value])) cycle();
    apply(weakAdd, active, [value]);
  }
  try {
    let result = '';
    for (let index = 0; index < length; index++) {
      if (index) result += sep;
      const child = value[index];
      if (child !== null && child !== void 0) result += text(child);
    }
    return result;
  } finally {
    if (root) activeRoot = null;
    else apply(weakDelete, active, [value]);
  }
}
function arrayString(value) {
  const method = value.join;
  return callable(method) ? method === intrinsicJoin ? join(value, void 0) : apply(method, value, []) : apply(objectString, value, []);
}
function argument(args, index) {return index < args.length ? args[index] : void 0;}
function argumentTail(args, start) {
  const result = [];
  for (let index = start; index < args.length; index++) {
    // This is an internal argument List, not a user array operation: neither
    // species, iterators nor inherited numeric setters participate.
    define(result, result.length, {value: args[index], writable: true, enumerable: true, configurable: true});
  }
  return result;
}
function joinArguments(first, second) {
  const result = [];
  for (let index = 0; index < first.length + second.length; index++) {
    define(result, index, {value: index < first.length ? first[index] : second[index - first.length],
      writable: true, enumerable: true, configurable: true});
  }
  return result;
}
function collectArguments(...args) {return args;}
function argumentList(value, optional) {
  // Native apply performs complete CreateListFromArrayLike in its original
  // order, even for ignored arguments. Reflect.apply deliberately rejects
  // null/undefined whereas Function.apply treats them as an empty list.
  return optional ? apply(functionApply, collectArguments, [void 0, value]) : apply(collectArguments, void 0, value);
}
function dispatch(method, receiver, args) {
  for (;;) {
    if (method === numberStringBuiltin) return numberRadixText(receiver, argument(args, 0));
    if (method === intrinsicJoin && array(receiver)) return join(receiver, argument(args, 0));
    if (method === intrinsicArrayString && array(receiver)) return arrayString(receiver);
    if (method === functionCall) {
      if (!callable(receiver)) return apply(method, receiver, args);
      const target = receiver, nextReceiver = argument(args, 0);
      args = argumentTail(args, 1);method = target;receiver = nextReceiver;continue;
    }
    if (method === functionApply) {
      // Reject a noncallable target before even asking for list.length.
      if (!callable(receiver)) return apply(method, receiver, args);
      const target = receiver, nextReceiver = argument(args, 0);
      args = argumentList(argument(args, 1), true);method = target;receiver = nextReceiver;continue;
    }
    if (method === apply) {
      const target = argument(args, 0), nextReceiver = argument(args, 1);
      if (!callable(target)) return apply(method, receiver, args);
      args = argumentList(argument(args, 2), false);method = target;receiver = nextReceiver;continue;
    }
    if (method === functionBind) {
      // Real bind owns the observable length/name reads, descriptors, prototype
      // and constructibility. Only its call behavior is handled privately.
      const bound = apply(method, receiver, args);
      if (receiver !== numberStringBuiltin && receiver !== intrinsicJoin && receiver !== intrinsicArrayString &&
          receiver !== functionCall && receiver !== functionApply && receiver !== apply && receiver !== functionBind) return bound;
      const target = receiver, boundReceiver = argument(args, 0), prefix = argumentTail(args, 1);
      // Return a real BoundFunction, so OrdinaryHasInstance can follow its
      // bound target. A Proxy around `bound` would lose that internal-slot
      // behavior even with no get trap. The private arrow is nonconstructible,
      // as are all supported native targets, and delegates live instanceof
      // checks to the original target (including a subsequently changed
      // prototype or Symbol.hasInstance).
      const invoke = (...values) => dispatch(target, boundReceiver, joinArguments(prefix, values));
      define(invoke, hasInstance, {value: value => value instanceof target, configurable: true});
      const result = apply(functionBind, invoke, [void 0]);
      setPrototype(result, prototype(bound));
      const keys = ownKeys(bound);
      for (let index = 0; index < keys.length; index++) define(result, keys[index], descriptor(bound, keys[index]));
      return result;
    }
    return apply(method, receiver, args);
  }
}
function captureArrayText(value, key) {
  // Capture before source argument evaluation, including a failing lookup.
  const method = value[key];
  return (...args) => dispatch(method, value, args);
}
// Literal actual arguments have no observable evaluation before this lookup.
// Other calls must retain captureArrayText's lookup-before-arguments boundary.
function invokeArrayText(value, key, ...args) {
  const method = value[key];
  return dispatch(method, value, args);
}
export {captureArrayText as c, invokeArrayText as d};
