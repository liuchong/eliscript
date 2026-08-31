function protocolHostCategory(value) {
  return value === null ? "null" : typeof value;
}

function observedType(value) {
  const category = protocolHostCategory(value);
  if (category !== "object" && category !== "function") {
    return category;
  }
  try {
    const prototype = Object.getPrototypeOf(value);
    const constructor = prototype?.constructor;
    const name = typeof constructor === "function" && constructor.name.length > 0
      ? constructor.name
      : "anonymous";
    return `${category}:${name}`;
  } catch {
    return category;
  }
}

export class ProtocolDispatchError extends TypeError {
  constructor(protocol, operation, receiver, reason = "missing") {
    const type = observedType(receiver);
    const detail = reason === "missing"
      ? "has no implementation"
      : "has a non-callable direct slot";
    super(`protocol ${protocol.name}/${operation} ${detail} for ${type}`);
    this.name = "ProtocolDispatchError";
    this.code = "ELI-RUNTIME-PROTOCOL";
    this.protocol = protocol.name;
    this.operation = operation;
    this.observedType = type;
    this.reason = reason;
  }
}
