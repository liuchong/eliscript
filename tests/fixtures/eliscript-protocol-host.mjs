import { runInNewContext } from "node:vm";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const modulePath = resolve(process.argv[2]);
const {
  define_protocol: defineProtocol,
  extend_protocol_category: extendProtocolCategory,
  extend_protocol_default: extendProtocolDefault,
  extend_protocol_type: extendProtocolType,
  implements_protocol_operation_QMARK_: implementsProtocolOperation,
  implements_protocol_QMARK_: implementsProtocol,
  protocol_host_category: protocolHostCategory,
  protocol_method: protocolMethod,
  protocol_slot: protocolSlot,
} = await import(pathToFileURL(modulePath).href);

const protocol = defineProtocol("Measured", ["read", "size"]);
const read = protocolMethod(protocol, "read");
const size = protocolMethod(protocol, "size");
const readSlot = protocolSlot(protocol, "read");
const sizeSlot = protocolSlot(protocol, "size");

class Exact {
  constructor(value) {
    this.value = value;
  }
}
class Child extends Exact {}
class Direct extends Exact {
  [readSlot]() {
    return `direct:${this.value}`;
  }

  [sizeSlot]() {
    return this.value.length;
  }
}

extendProtocolDefault(protocol, {
  read: (value) => `default:${String(value)}`,
  size: () => -1,
});
extendProtocolCategory(protocol, "object", {
  read: (value) => `category:${value.value}`,
  size: () => 0,
});
extendProtocolType(protocol, Exact, {
  read: (value) => `exact:${value.value}`,
  size: (value) => value.value.length,
});

const remoteObject = runInNewContext("({ value: 'remote' })");
const direct = new Direct("alpha");
const exact = new Exact("beta");

const invalid = new Exact("invalid");
Object.defineProperty(invalid, readSlot, { value: 42 });
let invalidReason;
try {
  read(invalid);
} catch (error) {
  invalidReason = error.reason;
}

const atomic = defineProtocol("Atomic", ["left", "right"]);
let atomicMessage;
try {
  extendProtocolType(atomic, Exact, {
    left: () => "left",
    right: 42,
  });
} catch (error) {
  atomicMessage = error.message;
}

const accessor = {};
let accessorRead = false;
Object.defineProperty(accessor, "left", {
  get() {
    accessorRead = true;
    return () => "left";
  },
});
let accessorMessage;
try {
  extendProtocolDefault(atomic, accessor);
} catch (error) {
  accessorMessage = error.message;
}

const arrayPrototypeKeys = Reflect.ownKeys(Array.prototype);
extendProtocolType(atomic, Array, {
  left: (value) => value[0],
  right: (value) => value.at(-1),
});

const inheritance = defineProtocol("Inheritance", ["read"]);
const inheritanceRead = protocolMethod(inheritance, "read");
extendProtocolType(inheritance, Exact, {
  read: (value) => value.value,
});
let childError;
try {
  inheritanceRead(new Child("child"));
} catch (error) {
  childError = {
    code: error.code,
    protocol: error.protocol,
    operation: error.operation,
    observedType: error.observedType,
    reason: error.reason,
  };
}

const million = defineProtocol("Million", ["increment"]);
const increment = protocolMethod(million, "increment");
const incrementSlot = protocolSlot(million, "increment");
const counter = {
  [incrementSlot](value) {
    return value + 1;
  },
};
let value = 0;
for (let index = 0; index < 1_000_000; index += 1) {
  value = increment(counter, value);
}

console.log(JSON.stringify({
  frozen: [
    Object.isFrozen(protocol),
    Object.isFrozen(protocol.operations),
    Object.isFrozen(read),
  ],
  metadata: [
    read.protocol === protocol,
    read.operation,
    read.slot === readSlot,
  ],
  dispatch: {
    direct: [read(direct), size(direct), implementsProtocol(protocol, direct)],
    exact: [read(exact), size(exact), implementsProtocol(protocol, exact)],
    category: [read(remoteObject), size(remoteObject)],
    fallback: [read(7), size(7)],
    undefined: [read(undefined), size(undefined)],
  },
  categories: [
    protocolHostCategory(null),
    protocolHostCategory(undefined),
    protocolHostCategory(7),
    protocolHostCategory(Symbol("value")),
    protocolHostCategory(() => 1),
    protocolHostCategory({}),
  ],
  invalidReason,
  childError,
  atomic: {
    message: atomicMessage,
    leftInstalled: implementsProtocolOperation(atomic, "left", new Exact("x")),
    accessorRead,
    accessorMessage,
  },
  arrays: {
    values: [
      protocolMethod(atomic, "left")([1, 2, 3]),
      protocolMethod(atomic, "right")([1, 2, 3]),
    ],
    prototypePreserved: (() => {
      const current = Reflect.ownKeys(Array.prototype);
      return current.length === arrayPrototypeKeys.length &&
        current.every((key, index) => key === arrayPrototypeKeys[index]);
    })(),
  },
  million: value,
}));
