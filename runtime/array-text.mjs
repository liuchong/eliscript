// Internal JS target support. Generated modules import identical data URLs so
// recursive conversions share one guard without modifying global prototypes.
const apply = Reflect.apply;
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
function captureArrayText(value, key) {
  // Capture before source argument evaluation, including a failing lookup.
  const method = value[key];
  return (...args) => {
    if (method === intrinsicJoin && array(value)) return join(value, args[0]);
    if (method === intrinsicArrayString && array(value)) return arrayString(value);
    return apply(method, value, args);
  };
}
// Literal actual arguments have no observable evaluation before this lookup.
// Other calls must retain captureArrayText's lookup-before-arguments boundary.
function invokeArrayText(value, key, ...args) {
  const method = value[key];
  if (method === intrinsicJoin && array(value)) return join(value, args[0]);
  if (method === intrinsicArrayString && array(value)) return arrayString(value);
  return apply(method, value, args);
}
export {captureArrayText as c, invokeArrayText as d};
