import {
  ProtocolDispatchError,
  defineProtocol,
  extendProtocolCategory,
  extendProtocolDefault,
  extendProtocolType,
  implementsProtocol,
  protocolMethod,
  protocolSlot,
} from "../../runtime/core/protocol.mjs";

const protocol = defineProtocol("HostReport", ["label", "size"]);
const label = protocolMethod(protocol, "label");
const size = protocolMethod(protocol, "size");
const labelSlot = protocolSlot(protocol, "label");
const sizeSlot = protocolSlot(protocol, "size");

class ExactValue {
  constructor(value) {
    this.value = value;
  }
}

class DirectValue extends ExactValue {
  [labelSlot]() {
    return `direct:${this.value}`;
  }

  [sizeSlot]() {
    return this.value.length;
  }
}

extendProtocolType(protocol, ExactValue, {
  label: (value) => `exact:${value.value}`,
  size: (value) => value.value.length,
});
extendProtocolCategory(protocol, "string", {
  label: (value) => `string:${value}`,
  size: (value) => value.length,
});
extendProtocolDefault(protocol, {
  label: (value) => `default:${String(value)}`,
  size: () => -1,
});

let missing;
const missingProtocol = defineProtocol("Missing", ["read"]);
try {
  protocolMethod(missingProtocol, "read")({});
} catch (error) {
  if (!(error instanceof ProtocolDispatchError)) {
    throw error;
  }
  missing = {
    code: error.code,
    protocol: error.protocol,
    operation: error.operation,
    observedType: error.observedType,
    reason: error.reason,
  };
}

const direct = new DirectValue("alpha");
const exact = new ExactValue("beta");

console.log(JSON.stringify({
  direct: [label(direct), size(direct), implementsProtocol(protocol, direct)],
  exact: [label(exact), size(exact), implementsProtocol(protocol, exact)],
  category: [label("gamma"), size("gamma")],
  fallback: [label(null), size(null)],
  missing,
}));
