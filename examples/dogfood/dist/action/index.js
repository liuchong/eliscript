var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  if (mod && typeof mod === "object" || typeof mod === "function") {
    for (let key of __getOwnPropNames(mod))
      if (!__hasOwnProp.call(to, key))
        __defProp(to, key, {
          get: __accessProp.bind(mod, key),
          enumerable: true
        });
  }
  if (canCache)
    cache.set(mod, to);
  return to;
};

// runtime/core/protocol-error.mjs
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
    const name = typeof constructor === "function" && constructor.name.length > 0 ? constructor.name : "anonymous";
    return `${category}:${name}`;
  } catch {
    return category;
  }
}

class ProtocolDispatchError extends TypeError {
  constructor(protocol, operation, receiver, reason = "missing") {
    const type = observedType(receiver);
    const detail = reason === "missing" ? "has no implementation" : "has a non-callable direct slot";
    super(`protocol ${protocol.name}/${operation} ${detail} for ${type}`);
    this.name = "ProtocolDispatchError";
    this.code = "ELI-RUNTIME-PROTOCOL";
    this.protocol = protocol.name;
    this.operation = operation;
    this.observedType = type;
    this.reason = reason;
  }
}
// runtime/core/protocol-impl.mjs
var __eliscript_truthy = (value) => value !== false && value != null;
var protocol_states = new WeakMap;
var protocol_missing = Symbol("eliscript.protocol.missing");
var protocol_host_categories = ["null", "undefined", "boolean", "number", "bigint", "string", "symbol", "function", "object"];
var protocol_max_operations = 1024;
var protocol_symbol = (description) => Symbol(description);
var protocol_array_QMARK_ = Array.isArray;
var protocol_map = () => new Map;
var protocol_null_object = () => Object.create(null);
var protocol_own_descriptors = Object.getOwnPropertyDescriptors;
var protocol_own_keys = Reflect.ownKeys;
var protocol_has_own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
var protocol_property_present = (value, key) => {
  if (value === null || value === undefined)
    return false;
  return Reflect.has(Object(value), key);
};
var protocol_property_value = (value, key) => Object(value)[key];
var protocol_host_type = (value) => typeof value;
var protocol_exact_prototype = (value, missing) => typeof value === "object" && value !== null || typeof value === "function" ? Object.getPrototypeOf(value) : missing;
var protocol_object_prototype = Object.prototype;
var protocol_freeze = Object.freeze;
var protocol_define_enumerable = (target, key, value) => {
  Object.defineProperty(target, key, { value, enumerable: true });
  return target;
};
var protocol_define_metadata = (target, protocol, operation, slot) => {
  Object.defineProperties(target, { protocol: { value: protocol }, operation: { value: operation }, slot: { value: slot } });
  return target;
};
function protocol_fail(message) {
  return ((__eliscript_value_1) => {
    throw __eliscript_value_1;
  })(new globalThis.TypeError(message));
}
function protocol_state(protocol) {
  {
    const __eliscript_value_2 = protocol_states["get"](protocol);
    {
      let state = __eliscript_value_2;
      return state === undefined ? protocol_fail("expected an Eliscript protocol") : state;
    }
  }
}
function normalize_name(value, label) {
  return !(((__eliscript_value) => {
    if (__eliscript_value === null)
      return "null";
    const __eliscript_host_type = typeof __eliscript_value;
    if (__eliscript_host_type !== "object" && __eliscript_host_type !== "function")
      return __eliscript_host_type;
    try {
      const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for("eliscript.value.type"));
      if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, "value") && (__eliscript_type.value === "keyword" || __eliscript_type.value === "symbol"))
        return __eliscript_type.value;
      const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, "kind");
      if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, "value")) {
        if (__eliscript_kind.value === "eliscript/keyword")
          return "keyword";
        if (__eliscript_kind.value === "eliscript/symbol")
          return "symbol";
      }
      return __eliscript_host_type;
    } catch {
      return __eliscript_host_type;
    }
  })(value) === "string") || (value ?? []).length === 0 ? protocol_fail(String(label) + String(" must be a non-empty string")) : value;
}
function normalize_protocol_operations(operations) {
  !__eliscript_truthy(protocol_array_QMARK_(operations)) && protocol_fail("protocol operations must be a non-empty dense array");
  {
    const __eliscript_value_3 = (operations ?? []).length;
    {
      let length = __eliscript_value_3;
      length === 0 && protocol_fail("protocol operations must be a non-empty dense array");
      length > protocol_max_operations && protocol_fail(String("protocol operations exceed ") + String(protocol_max_operations));
      {
        const __eliscript_value_4 = protocol_own_descriptors(operations);
        {
          let descriptors = __eliscript_value_4;
          {
            const __eliscript_value_5 = protocol_own_keys(descriptors);
            {
              let keys = __eliscript_value_5;
              {
                const __eliscript_value_6 = [];
                {
                  let normalized = __eliscript_value_6;
                  {
                    const __eliscript_value_7 = 0;
                    {
                      let index = __eliscript_value_7;
                      ((__eliscript_value_8, __eliscript_value_9) => __eliscript_value_8 !== __eliscript_value_9)((keys ?? []).length, length + 1) && protocol_fail("protocol operations must be a dense array with no extra properties");
                      while (index < length) {
                        {
                          const __eliscript_value_10 = descriptors[String(index)] ?? undefined;
                          {
                            let descriptor = __eliscript_value_10;
                            (descriptor === undefined || !__eliscript_truthy(protocol_has_own(descriptor, "value")) || !__eliscript_truthy(descriptor["enumerable"] ?? false)) && protocol_fail("protocol operations must contain enumerable data values");
                            normalized["push"](normalize_name(descriptor["value"], "protocol operation"));
                          }
                        }
                        index = index + 1;
                      }
                      return normalized;
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
function operation_record(protocol, operation) {
  {
    const __eliscript_value_29 = protocol_state(protocol);
    {
      let state = __eliscript_value_29;
      {
        const __eliscript_value_30 = state["operations"]["get"](operation);
        {
          let record = __eliscript_value_30;
          return record === undefined ? protocol_fail(String("protocol ") + String(protocol["name"]) + String(" has no operation ") + String(operation)) : record;
        }
      }
    }
  }
}
function protocol_host_category(value) {
  return value === null ? "null" : protocol_host_type(value);
}
function known_host_category_QMARK_(category) {
  {
    const __eliscript_value_31 = 0;
    const __eliscript_value_32 = false;
    {
      let index = __eliscript_value_31;
      let found = __eliscript_value_32;
      while (index < (protocol_host_categories ?? []).length && !__eliscript_truthy(found)) {
        category === ((protocol_host_categories ?? [])[index] ?? null) && (found = true);
        index = index + 1;
      }
      return found;
    }
  }
}
function normalize_implementations(protocol, implementations) {
  (implementations === null || !(((__eliscript_value) => {
    if (__eliscript_value === null)
      return "null";
    const __eliscript_host_type = typeof __eliscript_value;
    if (__eliscript_host_type !== "object" && __eliscript_host_type !== "function")
      return __eliscript_host_type;
    try {
      const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for("eliscript.value.type"));
      if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, "value") && (__eliscript_type.value === "keyword" || __eliscript_type.value === "symbol"))
        return __eliscript_type.value;
      const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, "kind");
      if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, "value")) {
        if (__eliscript_kind.value === "eliscript/keyword")
          return "keyword";
        if (__eliscript_kind.value === "eliscript/symbol")
          return "symbol";
      }
      return __eliscript_host_type;
    } catch {
      return __eliscript_host_type;
    }
  })(implementations) === "object")) && protocol_fail(String("protocol ") + String(protocol["name"]) + String(" implementations must be an object"));
  {
    const __eliscript_value_33 = protocol_own_descriptors(implementations);
    {
      let descriptors = __eliscript_value_33;
      {
        const __eliscript_value_34 = protocol_own_keys(descriptors);
        {
          let keys = __eliscript_value_34;
          {
            const __eliscript_value_35 = protocol_null_object();
            {
              let normalized = __eliscript_value_35;
              {
                const __eliscript_value_36 = 0;
                {
                  let index = __eliscript_value_36;
                  (keys ?? []).length === 0 && protocol_fail(String("protocol ") + String(protocol["name"]) + String(" extension must implement at least one operation"));
                  while (index < (keys ?? []).length) {
                    {
                      const __eliscript_value_37 = (keys ?? [])[index] ?? null;
                      {
                        let key = __eliscript_value_37;
                        {
                          const __eliscript_value_38 = descriptors[key];
                          {
                            let descriptor = __eliscript_value_38;
                            !(((__eliscript_value) => {
                              if (__eliscript_value === null)
                                return "null";
                              const __eliscript_host_type = typeof __eliscript_value;
                              if (__eliscript_host_type !== "object" && __eliscript_host_type !== "function")
                                return __eliscript_host_type;
                              try {
                                const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for("eliscript.value.type"));
                                if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, "value") && (__eliscript_type.value === "keyword" || __eliscript_type.value === "symbol"))
                                  return __eliscript_type.value;
                                const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, "kind");
                                if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, "value")) {
                                  if (__eliscript_kind.value === "eliscript/keyword")
                                    return "keyword";
                                  if (__eliscript_kind.value === "eliscript/symbol")
                                    return "symbol";
                                }
                                return __eliscript_host_type;
                              } catch {
                                return __eliscript_host_type;
                              }
                            })(key) === "string") && protocol_fail(String("protocol ") + String(protocol["name"]) + String(" implementation names must be strings"));
                            operation_record(protocol, key);
                            (!__eliscript_truthy(protocol_has_own(descriptor, "value")) || !(((__eliscript_value) => {
                              if (__eliscript_value === null)
                                return "null";
                              const __eliscript_host_type = typeof __eliscript_value;
                              if (__eliscript_host_type !== "object" && __eliscript_host_type !== "function")
                                return __eliscript_host_type;
                              try {
                                const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for("eliscript.value.type"));
                                if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, "value") && (__eliscript_type.value === "keyword" || __eliscript_type.value === "symbol"))
                                  return __eliscript_type.value;
                                const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, "kind");
                                if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, "value")) {
                                  if (__eliscript_kind.value === "eliscript/keyword")
                                    return "keyword";
                                  if (__eliscript_kind.value === "eliscript/symbol")
                                    return "symbol";
                                }
                                return __eliscript_host_type;
                              } catch {
                                return __eliscript_host_type;
                              }
                            })(descriptor["value"]) === "function")) && protocol_fail(String("protocol ") + String(protocol["name"]) + String("/") + String(key) + String(" implementation must be a function"));
                            protocol_define_enumerable(normalized, key, descriptor["value"]);
                          }
                        }
                      }
                    }
                    index = index + 1;
                  }
                  return protocol_freeze(normalized);
                }
              }
            }
          }
        }
      }
    }
  }
}
function merge_implementations(current, incoming) {
  {
    const __eliscript_value_39 = protocol_null_object();
    const __eliscript_value_40 = null;
    {
      let merged = __eliscript_value_39;
      let copy = __eliscript_value_40;
      copy = (source) => {
        return !(source == null) ? ((keys, index) => {
          while (index < (keys ?? []).length) {
            {
              const __eliscript_value_41 = (keys ?? [])[index] ?? null;
              {
                let key = __eliscript_value_41;
                protocol_define_enumerable(merged, key, source[key]);
              }
            }
            index = index + 1;
          }
          return null;
        })(Object.keys(source ?? {}), 0) : null;
      };
      copy(current);
      copy(incoming);
      return protocol_freeze(merged);
    }
  }
}
function direct_method(record, receiver) {
  return receiver === null || receiver === undefined ? protocol_missing : ((slot) => {
    return !__eliscript_truthy(protocol_property_present(receiver, slot)) ? protocol_missing : ((method) => {
      return ((__eliscript_value) => {
        if (__eliscript_value === null)
          return "null";
        const __eliscript_host_type = typeof __eliscript_value;
        if (__eliscript_host_type !== "object" && __eliscript_host_type !== "function")
          return __eliscript_host_type;
        try {
          const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for("eliscript.value.type"));
          if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, "value") && (__eliscript_type.value === "keyword" || __eliscript_type.value === "symbol"))
            return __eliscript_type.value;
          const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, "kind");
          if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, "value")) {
            if (__eliscript_kind.value === "eliscript/keyword")
              return "keyword";
            if (__eliscript_kind.value === "eliscript/symbol")
              return "symbol";
          }
          return __eliscript_host_type;
        } catch {
          return __eliscript_host_type;
        }
      })(method) === "function" ? method : null;
    })(protocol_property_value(receiver, slot));
  })(record["slot"]);
}
function external_method(state, record, receiver) {
  {
    const __eliscript_value_42 = protocol_exact_prototype(receiver, protocol_missing);
    {
      let prototype = __eliscript_value_42;
      {
        const __eliscript_value_43 = prototype === protocol_missing ? undefined : state["types"]["get"](prototype);
        {
          let exact_implementations = __eliscript_value_43;
          {
            const __eliscript_value_44 = exact_implementations === undefined ? undefined : exact_implementations[record["name"]] ?? undefined;
            {
              let exact = __eliscript_value_44;
              return !(exact === undefined) ? exact : ((category_implementations) => {
                return ((category) => {
                  return !(category === undefined) ? category : state["defaults"][record["name"]] ?? protocol_missing;
                })(category_implementations === undefined ? undefined : category_implementations[record["name"]] ?? undefined);
              })(state["categories"]["get"](protocol_host_category(receiver)));
            }
          }
        }
      }
    }
  }
}
function dispatch(protocol, record, receiver, arguments$) {
  {
    const __eliscript_value_45 = direct_method(record, receiver);
    {
      let direct = __eliscript_value_45;
      direct === null && ((__eliscript_value_46) => {
        throw __eliscript_value_46;
      })(new ProtocolDispatchError(protocol, record["name"], receiver, "invalid-direct-slot"));
      return ((__eliscript_value_47, __eliscript_value_48) => __eliscript_value_47 !== __eliscript_value_48)(direct, protocol_missing) ? direct["apply"](receiver, arguments$) : ((external) => {
        return external === protocol_missing ? ((__eliscript_value_49) => {
          throw __eliscript_value_49;
        })(new ProtocolDispatchError(protocol, record["name"], receiver)) : external(...[receiver, ...arguments$ ?? []]);
      })(external_method(protocol_state(protocol), record, receiver));
    }
  }
}
function define_protocol(name, operations) {
  {
    const __eliscript_value_50 = normalize_name(name, "protocol name");
    const __eliscript_value_51 = normalize_protocol_operations(operations);
    {
      let protocol_name = __eliscript_value_50;
      let protocol_operations = __eliscript_value_51;
      {
        const __eliscript_value_52 = protocol_map();
        const __eliscript_value_53 = protocol_null_object();
        const __eliscript_value_54 = null;
        const __eliscript_value_55 = 0;
        {
          let records = __eliscript_value_52;
          let operation_table = __eliscript_value_53;
          let protocol = __eliscript_value_54;
          let index = __eliscript_value_55;
          while (index < (protocol_operations ?? []).length) {
            {
              const __eliscript_value_56 = (protocol_operations ?? [])[index] ?? null;
              {
                let operation = __eliscript_value_56;
                __eliscript_truthy(records["has"](operation)) && protocol_fail(String("protocol ") + String(protocol_name) + String(" declares duplicate operation ") + String(operation));
                {
                  const __eliscript_value_57 = protocol_symbol(String("eliscript.protocol.") + String(protocol_name) + String("/") + String(operation));
                  {
                    let slot = __eliscript_value_57;
                    {
                      const __eliscript_value_58 = (...invocation) => {
                        (invocation ?? []).length === 0 && protocol_fail(String("protocol ") + String(protocol_name) + String("/") + String(operation) + String(" requires a dispatch value"));
                        return dispatch(protocol, records["get"](operation), invocation[0], invocation["slice"](1));
                      };
                      {
                        let method = __eliscript_value_58;
                        {
                          const __eliscript_value_59 = { name: operation, slot, method };
                          {
                            let record = __eliscript_value_59;
                            records["set"](operation, record);
                            protocol_define_enumerable(operation_table, operation, method);
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            index = index + 1;
          }
          protocol = protocol_freeze({ name: protocol_name, operations: protocol_freeze(operation_table) });
          index = 0;
          while (index < (protocol_operations ?? []).length) {
            {
              const __eliscript_value_60 = (protocol_operations ?? [])[index] ?? null;
              {
                let operation = __eliscript_value_60;
                {
                  const __eliscript_value_61 = records["get"](operation);
                  {
                    let record = __eliscript_value_61;
                    {
                      const __eliscript_value_62 = record["method"];
                      {
                        let method = __eliscript_value_62;
                        protocol_define_metadata(method, protocol, operation, record["slot"]);
                        protocol_freeze(method);
                        protocol_freeze(record);
                      }
                    }
                  }
                }
              }
            }
            index = index + 1;
          }
          protocol_states["set"](protocol, { operations: records, types: protocol_map(), categories: protocol_map(), defaults: protocol_freeze(protocol_null_object()) });
          return protocol;
        }
      }
    }
  }
}
function protocol_method(protocol, operation) {
  return operation_record(protocol, operation)["method"];
}
function protocol_slot(protocol, operation) {
  return operation_record(protocol, operation)["slot"];
}
function extend_protocol_type(protocol, constructor, implementations) {
  {
    const __eliscript_value_65 = protocol_state(protocol);
    {
      let state = __eliscript_value_65;
      !(((__eliscript_value) => {
        if (__eliscript_value === null)
          return "null";
        const __eliscript_host_type = typeof __eliscript_value;
        if (__eliscript_host_type !== "object" && __eliscript_host_type !== "function")
          return __eliscript_host_type;
        try {
          const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for("eliscript.value.type"));
          if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, "value") && (__eliscript_type.value === "keyword" || __eliscript_type.value === "symbol"))
            return __eliscript_type.value;
          const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, "kind");
          if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, "value")) {
            if (__eliscript_kind.value === "eliscript/keyword")
              return "keyword";
            if (__eliscript_kind.value === "eliscript/symbol")
              return "symbol";
          }
          return __eliscript_host_type;
        } catch {
          return __eliscript_host_type;
        }
      })(constructor) === "function") && protocol_fail(String("protocol ") + String(protocol["name"]) + String(" exact type must be a constructor with a prototype"));
      {
        const __eliscript_value_66 = constructor["prototype"] ?? null;
        {
          let prototype = __eliscript_value_66;
          (prototype === null || !(((__eliscript_value) => {
            if (__eliscript_value === null)
              return "null";
            const __eliscript_host_type = typeof __eliscript_value;
            if (__eliscript_host_type !== "object" && __eliscript_host_type !== "function")
              return __eliscript_host_type;
            try {
              const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for("eliscript.value.type"));
              if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, "value") && (__eliscript_type.value === "keyword" || __eliscript_type.value === "symbol"))
                return __eliscript_type.value;
              const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, "kind");
              if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, "value")) {
                if (__eliscript_kind.value === "eliscript/keyword")
                  return "keyword";
                if (__eliscript_kind.value === "eliscript/symbol")
                  return "symbol";
              }
              return __eliscript_host_type;
            } catch {
              return __eliscript_host_type;
            }
          })(prototype) === "object")) && protocol_fail(String("protocol ") + String(protocol["name"]) + String(" exact type must be a constructor with a prototype"));
          {
            const __eliscript_value_67 = normalize_implementations(protocol, implementations);
            {
              let normalized = __eliscript_value_67;
              {
                const __eliscript_value_68 = state["types"]["get"](prototype);
                {
                  let current = __eliscript_value_68;
                  state["types"]["set"](prototype, merge_implementations(current, normalized));
                }
              }
            }
          }
          return protocol;
        }
      }
    }
  }
}
function extend_protocol_category(protocol, category, implementations) {
  {
    const __eliscript_value_69 = protocol_state(protocol);
    {
      let state = __eliscript_value_69;
      !__eliscript_truthy(known_host_category_QMARK_(category)) && protocol_fail(String("unknown protocol host category ") + String(category));
      {
        const __eliscript_value_70 = normalize_implementations(protocol, implementations);
        {
          let normalized = __eliscript_value_70;
          {
            const __eliscript_value_71 = state["categories"]["get"](category);
            {
              let current = __eliscript_value_71;
              state["categories"]["set"](category, merge_implementations(current, normalized));
            }
          }
        }
      }
      return protocol;
    }
  }
}
function implements_protocol_operation_QMARK_(protocol, operation, value) {
  {
    const __eliscript_value_74 = operation_record(protocol, operation);
    {
      let record = __eliscript_value_74;
      {
        const __eliscript_value_75 = direct_method(record, value);
        {
          let direct = __eliscript_value_75;
          return !(direct === null) && (((__eliscript_value_76, __eliscript_value_77) => __eliscript_value_76 !== __eliscript_value_77)(direct, protocol_missing) || ((__eliscript_value_78, __eliscript_value_79) => __eliscript_value_78 !== __eliscript_value_79)(external_method(protocol_state(protocol), record, value), protocol_missing));
        }
      }
    }
  }
}
// runtime/core/collection-internals.mjs
var I_COUNTED = define_protocol("ICounted", ["count"]);
var I_EMPTYABLE = define_protocol("IEmptyable", ["empty"]);
var I_CONJ = define_protocol("IConj", ["conj"]);
var I_LOOKUP = define_protocol("ILookup", ["get"]);
var I_ASSOCIATIVE = define_protocol("IAssociative", [
  "assoc",
  "contains"
]);
var I_INDEXED = define_protocol("IIndexed", ["nth"]);
var I_SEQABLE = define_protocol("ISeqable", ["seq"]);
var I_REDUCE = define_protocol("IReduce", ["reduce"]);
var I_KV_REDUCE = define_protocol("IKVReduce", ["reduceKV"]);
var I_MAP = define_protocol("IMap", ["dissoc"]);
var I_SET = define_protocol("ISet", ["disj"]);
var I_STACK = define_protocol("IStack", ["peek", "pop"]);
var I_REVERSIBLE = define_protocol("IReversible", ["rseq"]);
var COLLECTION_COUNT = protocol_slot(I_COUNTED, "count");
var COLLECTION_EMPTY = protocol_slot(I_EMPTYABLE, "empty");
var COLLECTION_CONJ = protocol_slot(I_CONJ, "conj");
var COLLECTION_GET = protocol_slot(I_LOOKUP, "get");
var COLLECTION_ASSOC = protocol_slot(I_ASSOCIATIVE, "assoc");
var COLLECTION_CONTAINS = protocol_slot(I_ASSOCIATIVE, "contains");
var COLLECTION_NTH = protocol_slot(I_INDEXED, "nth");
var COLLECTION_SEQ = protocol_slot(I_SEQABLE, "seq");
var COLLECTION_REDUCE = protocol_slot(I_REDUCE, "reduce");
var COLLECTION_REDUCE_KV = protocol_slot(I_KV_REDUCE, "reduceKV");
var COLLECTION_DISSOC = protocol_slot(I_MAP, "dissoc");
var COLLECTION_DISJ = protocol_slot(I_SET, "disj");
var COLLECTION_PEEK = protocol_slot(I_STACK, "peek");
var COLLECTION_POP = protocol_slot(I_STACK, "pop");
var COLLECTION_RSEQ = protocol_slot(I_REVERSIBLE, "rseq");
var dispatchCollectionCount = protocol_method(I_COUNTED, "count");
var dispatchCollectionEmpty = protocol_method(I_EMPTYABLE, "empty");
var dispatchCollectionConj = protocol_method(I_CONJ, "conj");
var dispatchCollectionGet = protocol_method(I_LOOKUP, "get");
var dispatchCollectionAssoc = protocol_method(I_ASSOCIATIVE, "assoc");
var dispatchCollectionContains = protocol_method(I_ASSOCIATIVE, "contains");
var dispatchCollectionNth = protocol_method(I_INDEXED, "nth");
var dispatchCollectionSeq = protocol_method(I_SEQABLE, "seq");
var dispatchCollectionReduce = protocol_method(I_REDUCE, "reduce");
var dispatchCollectionReduceKV = protocol_method(I_KV_REDUCE, "reduceKV");
var dispatchCollectionDissoc = protocol_method(I_MAP, "dissoc");
var dispatchCollectionDisj = protocol_method(I_SET, "disj");
var dispatchCollectionPeek = protocol_method(I_STACK, "peek");
var dispatchCollectionPop = protocol_method(I_STACK, "pop");
var dispatchCollectionRseq = protocol_method(I_REVERSIBLE, "rseq");
var NO_INITIAL = Symbol("eliscript.collection.no-initial");
var REDUCED_STATE = Symbol("eliscript.collection.reduced-state");
var REDUCTION_STATE = Symbol("eliscript.collection.reduction-state");
var REDUCTION_TOKEN = Symbol("eliscript.collection.reduction-token");
var MEMOIZED_SEQUENCE_STATE = Symbol("eliscript.collection.memoized-sequence-state");
var MEMOIZED_SEQUENCE_TOKEN = Symbol("eliscript.collection.memoized-sequence-token");
var NO_MEMOIZED_SEQUENCE_FAILURE = Symbol("eliscript.collection.no-memoized-sequence-failure");
var SEQUENCE_STATE = Symbol("eliscript.collection.sequence-state");
var SEQUENCE_TOKEN = Symbol("eliscript.collection.sequence-token");
var UNBOUNDED_SEQUENCE = Symbol("eliscript.collection.unbounded-sequence");
function checkedCount(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("collection count must be a non-negative safe integer");
  }
  return value;
}
function iteratorFromFactory(factory) {
  const iterator = factory();
  if (iterator === null || typeof iterator !== "object" || typeof iterator.next !== "function") {
    throw new TypeError("sequence view factory must return an iterator");
  }
  return iterator;
}

class MemoizedSequenceSource {
  constructor(factory) {
    this.factory = factory;
    this.source = null;
    this.values = [];
    this.started = false;
    this.complete = false;
    this.failure = NO_MEMOIZED_SEQUENCE_FAILURE;
  }
  read(index) {
    if (index < this.values.length) {
      return { value: this.values[index], done: false };
    }
    if (this.failure !== NO_MEMOIZED_SEQUENCE_FAILURE)
      throw this.failure;
    if (this.complete)
      return { value: undefined, done: true };
    if (!this.started) {
      this.started = true;
      try {
        this.source = iteratorFromFactory(this.factory);
        this.factory = null;
      } catch (error) {
        this.failure = error;
        throw error;
      }
    }
    try {
      const result = this.source.next();
      if (result === null || typeof result !== "object" || typeof result.done !== "boolean") {
        throw new TypeError("sequence iterator must return an iterator result");
      }
      if (result.done) {
        this.complete = true;
        this.source = null;
        return { value: undefined, done: true };
      }
      this.values.push(result.value);
      return { value: result.value, done: false };
    } catch (error) {
      const source = this.source;
      this.failure = error;
      this.source = null;
      if (source !== null && typeof source.return === "function") {
        try {
          source.return();
        } catch {}
      }
      throw error;
    }
  }
  iterator() {
    const source = this;
    let index = 0;
    let closed = false;
    return {
      next() {
        if (closed)
          return { value: undefined, done: true };
        const result = source.read(index);
        if (!result.done)
          index += 1;
        return result;
      },
      return(value) {
        closed = true;
        return { value, done: true };
      },
      [Symbol.iterator]() {
        return this;
      }
    };
  }
}
function readCollectionEntry(entry) {
  if (entry === null || entry === undefined || typeof entry[Symbol.iterator] !== "function") {
    throw new TypeError("persistent hash map entries must be iterable key/value pairs");
  }
  const iterator = iteratorFromFactory(() => entry[Symbol.iterator]());
  let complete = false;
  try {
    const first = iterator.next();
    if (first.done) {
      throw new TypeError("persistent hash map entries must contain exactly two values");
    }
    const second = iterator.next();
    if (second.done) {
      throw new TypeError("persistent hash map entries must contain exactly two values");
    }
    const third = iterator.next();
    if (!third.done) {
      throw new TypeError("persistent hash map entries must contain exactly two values");
    }
    complete = true;
    return [first.value, second.value];
  } finally {
    if (!complete && typeof iterator.return === "function") {
      iterator.return();
    }
  }
}
function sequenceCount(state) {
  if (state.count === UNBOUNDED_SEQUENCE) {
    throw new RangeError("unbounded sequence does not have a finite count");
  }
  if (typeof state.count === "function") {
    return checkedCount(state.count());
  }
  if (state.count !== null) {
    return state.count;
  }
  const iterator = iteratorFromFactory(state.factory);
  let count = 0;
  while (!iterator.next().done) {
    count += 1;
    checkedCount(count);
  }
  return count;
}
class SequenceView {
  constructor(token, factory, count) {
    if (token !== SEQUENCE_TOKEN || typeof factory !== "function") {
      throw new TypeError("SequenceView values must be created by seq");
    }
    this[SEQUENCE_STATE] = Object.freeze({ factory, count });
    Object.freeze(this);
  }
  [COLLECTION_COUNT]() {
    return sequenceCount(this[SEQUENCE_STATE]);
  }
  [COLLECTION_SEQ]() {
    const state = this[SEQUENCE_STATE];
    if (state.count === UNBOUNDED_SEQUENCE) {
      return this;
    }
    if (state.count === null) {
      const iterator = iteratorFromFactory(state.factory);
      try {
        return iterator.next().done ? null : this;
      } finally {
        if (typeof iterator.return === "function") {
          iterator.return();
        }
      }
    }
    return this[COLLECTION_COUNT]() === 0 ? null : this;
  }
  [COLLECTION_REDUCE](reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }
  [Symbol.iterator]() {
    return iteratorFromFactory(this[SEQUENCE_STATE].factory);
  }
  get [Symbol.toStringTag]() {
    return "EliscriptSequenceView";
  }
}

class MemoizedSequenceView {
  constructor(token, factory, count) {
    if (token !== MEMOIZED_SEQUENCE_TOKEN || typeof factory !== "function") {
      throw new TypeError("MemoizedSequenceView values must be created by memoizedSequenceView");
    }
    this[MEMOIZED_SEQUENCE_STATE] = Object.freeze({
      source: new MemoizedSequenceSource(factory),
      count
    });
    Object.freeze(this);
  }
  [COLLECTION_COUNT]() {
    return sequenceCount({
      factory: () => this[Symbol.iterator](),
      count: this[MEMOIZED_SEQUENCE_STATE].count
    });
  }
  [COLLECTION_SEQ]() {
    const iterator = this[Symbol.iterator]();
    try {
      return iterator.next().done ? null : this;
    } finally {
      iterator.return();
    }
  }
  [COLLECTION_REDUCE](reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }
  [Symbol.iterator]() {
    return this[MEMOIZED_SEQUENCE_STATE].source.iterator();
  }
  get [Symbol.toStringTag]() {
    return "EliscriptMemoizedSequenceView";
  }
}

class ReductionView {
  constructor(token, reduceFunction) {
    if (token !== REDUCTION_TOKEN || typeof reduceFunction !== "function") {
      throw new TypeError("ReductionView values must be created by reductionView");
    }
    this[REDUCTION_STATE] = reduceFunction;
    Object.freeze(this);
  }
  [COLLECTION_REDUCE](reducer, ...initial) {
    return this[REDUCTION_STATE](reducer, ...initial);
  }
  get [Symbol.toStringTag]() {
    return "EliscriptReductionView";
  }
}
function sequenceView(factory, count = null) {
  if (typeof factory !== "function") {
    throw new TypeError("sequence view factory must be a function");
  }
  if (count !== null && typeof count !== "function") {
    checkedCount(count);
    if (count === 0) {
      return null;
    }
  }
  return new SequenceView(SEQUENCE_TOKEN, factory, count);
}
function reducedValue(value) {
  if (isReducedValue(value)) {
    return value;
  }
  const result = Object.create(null);
  Object.defineProperty(result, REDUCED_STATE, { value });
  return Object.freeze(result);
}
function isReducedValue(value) {
  return value !== null && (typeof value === "object" || typeof value === "function") && Object.prototype.hasOwnProperty.call(value, REDUCED_STATE);
}
function unreducedValue(value) {
  return isReducedValue(value) ? value[REDUCED_STATE] : value;
}
function reduceIterable(iterable, reducer, ...initial) {
  if (typeof reducer !== "function") {
    throw new TypeError("collection reducer must be a function");
  }
  let accumulator = initial.length === 0 ? NO_INITIAL : initial[0];
  for (const value of iterable) {
    if (accumulator === NO_INITIAL) {
      accumulator = value;
      continue;
    }
    accumulator = reducer(accumulator, value);
    if (isReducedValue(accumulator)) {
      return unreducedValue(accumulator);
    }
  }
  if (accumulator === NO_INITIAL) {
    throw new TypeError("cannot reduce an empty collection without an initial value");
  }
  return accumulator;
}
function validateCollectionCount(value) {
  return checkedCount(value);
}

// runtime/core/list-internals.mjs
var LIST_CONSTRUCTOR_TOKEN = Symbol("eliscript.list.constructor");
var LIST_STATE = Symbol("eliscript.list.state");
var metrics = {
  nodeAllocations: 0
};
function recordListNodeAllocation() {
  metrics.nodeAllocations += 1;
}

// runtime/core/metadata-internals.mjs
var I_META = define_protocol("IMeta", ["meta"]);
var I_WITH_META = define_protocol("IWithMeta", ["withMeta"]);
var METADATA_READ = protocol_slot(I_META, "meta");
var METADATA_WITH = protocol_slot(I_WITH_META, "withMeta");
var dispatchMetadataRead = protocol_method(I_META, "meta");
var dispatchMetadataWith = protocol_method(I_WITH_META, "withMeta");

// runtime/core/value-internals.mjs
var I_EQUIV = define_protocol("IEquiv", ["equal"]);
var I_HASH = define_protocol("IHash", ["hash"]);
var VALUE_EQUAL = protocol_slot(I_EQUIV, "equal");
var VALUE_HASH = protocol_slot(I_HASH, "hash");
var dispatchValueEqual = protocol_method(I_EQUIV, "equal");
var dispatchValueHash = protocol_method(I_HASH, "hash");
var BOOLEAN_TAG = 1260232563;
var BIGINT_TAG = 2017827537;
var GLOBAL_SYMBOL_TAG = 2657455275;
var HOST_IDENTITY_TAG = 762272397;
var NUMBER_TAG = 374761393;
var STRING_TAG = 1831565813;
var FALSE_HASH = 423263297;
var TRUE_HASH = 1911856395;
var NULL_HASH = 1108378657;
var UNDEFINED_HASH = 2135587861;
var NAN_HASH = 1490037359;
var floatBytes = new DataView(new ArrayBuffer(8));
var protocolHashes = new WeakMap;
var hostObjectHashes = new WeakMap;
var hostSymbolHashes = new Map;
var nextHostIdentity = 1;
var metrics2 = {
  hashValueCalls: 0,
  protocolHashComputations: 0,
  protocolHashCacheHits: 0,
  hostIdentityAssignments: 0
};
function avalancheHash(value) {
  let hash = value >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 2246822507);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 3266489909);
  hash ^= hash >>> 16;
  return hash >>> 0;
}
function mixHash(hash, value) {
  let mixed = (hash ^ value) >>> 0;
  mixed = Math.imul(mixed, 1540483477);
  mixed ^= mixed >>> 15;
  return mixed >>> 0;
}
function finishHash(hash, count) {
  return avalancheHash(mixHash(hash, count >>> 0));
}
function hashString(value, tag = STRING_TAG) {
  let hash = mixHash(tag, value.length);
  for (let index = 0;index < value.length; index += 1) {
    hash = mixHash(hash, value.charCodeAt(index));
  }
  return finishHash(hash, value.length);
}
function hashNumber(value) {
  if (Number.isNaN(value)) {
    return NAN_HASH;
  }
  const normalized = value === 0 ? 0 : value;
  floatBytes.setFloat64(0, normalized, true);
  const low = floatBytes.getUint32(0, true);
  const high = floatBytes.getUint32(4, true);
  return finishHash(mixHash(mixHash(NUMBER_TAG, low), high), 2);
}
function hashBigInt(value) {
  let magnitude = value < 0n ? -value : value;
  let hash = mixHash(BIGINT_TAG, value < 0n ? 1 : 0);
  let limbs = 0;
  do {
    hash = mixHash(hash, Number(magnitude & 0xffffffffn));
    magnitude >>= 32n;
    limbs += 1;
  } while (magnitude !== 0n);
  return finishHash(hash, limbs);
}
function hashBoolean(value) {
  return mixHash(BOOLEAN_TAG, value ? TRUE_HASH : FALSE_HASH);
}
function hashNull() {
  return NULL_HASH;
}
function hashUndefined() {
  return UNDEFINED_HASH;
}
function hashGlobalSymbol(key) {
  return hashString(key, GLOBAL_SYMBOL_TAG);
}
function orderedCollectionHash(iterable, hashValue, tag) {
  let hash = tag >>> 0;
  let count = 0;
  for (const value of iterable) {
    hash = mixHash(hash, hashValue(value));
    count += 1;
  }
  return finishHash(hash, count);
}
function rotateLeft(value, distance) {
  const shift = distance & 31;
  return (value << shift | value >>> 32 - shift) >>> 0;
}
function unorderedCollectionHash(iterable, hashElement, tag) {
  let sum = 0;
  let xor = 0;
  let product = 1;
  let count = 0;
  for (const element of iterable) {
    const hash = hashElement(element) >>> 0;
    sum = sum + hash >>> 0;
    xor = (xor ^ rotateLeft(hash, hash & 31)) >>> 0;
    product = Math.imul(product, hash | 1) >>> 0;
    count += 1;
  }
  return finishHash(mixHash(mixHash(mixHash(tag, sum), xor), product), count);
}
function cachedProtocolHash(value, compute) {
  const cached = protocolHashes.get(value);
  if (cached !== undefined) {
    metrics2.protocolHashCacheHits += 1;
    return cached;
  }
  metrics2.protocolHashComputations += 1;
  const hash = compute() >>> 0;
  protocolHashes.set(value, hash);
  return hash;
}
function recordHashValueCall() {
  metrics2.hashValueCalls += 1;
}
function hostIdentityHash(value) {
  const hashes = typeof value === "symbol" ? hostSymbolHashes : hostObjectHashes;
  const cached = hashes.get(value);
  if (cached !== undefined) {
    return cached;
  }
  const hash = finishHash(HOST_IDENTITY_TAG, nextHostIdentity);
  nextHostIdentity += 1;
  metrics2.hostIdentityAssignments += 1;
  hashes.set(value, hash);
  return hash;
}

// runtime/core/list.mjs
var MAX_COUNT = 2147483647;
var MISSING = Symbol("eliscript.list.missing");
var LIST_HASH_TAG = 793406745;
function makeList(count, value, rest, metadata = null) {
  recordListNodeAllocation();
  return new PersistentList(LIST_CONSTRUCTOR_TOKEN, count, false, value, rest, metadata);
}
function emptyListWithMetadata(metadata) {
  return metadata === null ? EMPTY_LIST : new PersistentList(LIST_CONSTRUCTOR_TOKEN, 0, true, undefined, null, metadata);
}

class PersistentList {
  constructor(token, count, empty, value, rest, metadata = null) {
    if (token !== LIST_CONSTRUCTOR_TOKEN) {
      throw new TypeError("PersistentList values must be created with persistentList or PersistentList.from");
    }
    this[LIST_STATE] = Object.freeze({
      count,
      empty,
      value,
      rest,
      metadata
    });
    Object.freeze(this);
  }
  static empty() {
    return EMPTY_LIST;
  }
  static from(iterable) {
    if (iterable instanceof PersistentList) {
      return iterable;
    }
    const values = Array.from(iterable);
    if (values.length > MAX_COUNT) {
      throw new RangeError(`persistent list cannot exceed ${MAX_COUNT} values`);
    }
    let result = EMPTY_LIST;
    for (let index = values.length - 1;index >= 0; index -= 1) {
      result = makeList(result.count + 1, values[index], result);
    }
    return result;
  }
  get count() {
    return this[LIST_STATE].count;
  }
  get size() {
    return this[LIST_STATE].count;
  }
  get isEmpty() {
    return this[LIST_STATE].empty;
  }
  first(notFound = null) {
    const state = this[LIST_STATE];
    return state.empty ? notFound : state.value;
  }
  rest() {
    const state = this[LIST_STATE];
    return state.empty ? this : state.rest;
  }
  peek(notFound = null) {
    return this.first(notFound);
  }
  pop() {
    if (this[LIST_STATE].empty) {
      throw new RangeError("cannot pop an empty persistent list");
    }
    return this[LIST_STATE].rest;
  }
  conj(value) {
    if (this.count === MAX_COUNT) {
      throw new RangeError(`persistent list cannot exceed ${MAX_COUNT} values`);
    }
    return makeList(this.count + 1, value, this, this[LIST_STATE].metadata);
  }
  cons(value) {
    return this.conj(value);
  }
  nth(index, notFound = MISSING) {
    if (!Number.isInteger(index) || index < 0 || index >= this.count) {
      if (notFound !== MISSING) {
        return notFound;
      }
      throw new RangeError(`nth index ${String(index)} is outside [0, ${this.count})`);
    }
    let node = this;
    let remaining = index;
    while (remaining > 0) {
      node = node[LIST_STATE].rest;
      remaining -= 1;
    }
    return node[LIST_STATE].value;
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
    return emptyListWithMetadata(this[LIST_STATE].metadata);
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
    return this.isEmpty ? null : sequenceView(() => this[Symbol.iterator](), this.count);
  }
  [COLLECTION_REDUCE](reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }
  [VALUE_EQUAL](other, equal) {
    if (!(other instanceof PersistentList) || other.count !== this.count) {
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
    return orderedCollectionHash(this, hash, LIST_HASH_TAG);
  }
  [METADATA_READ]() {
    return this[LIST_STATE].metadata;
  }
  [METADATA_WITH](metadata) {
    const state = this[LIST_STATE];
    if (metadata === state.metadata) {
      return this;
    }
    return state.empty ? emptyListWithMetadata(metadata) : makeList(state.count, state.value, state.rest, metadata);
  }
  *[Symbol.iterator]() {
    let node = this;
    while (!node[LIST_STATE].empty) {
      yield node[LIST_STATE].value;
      node = node[LIST_STATE].rest;
    }
  }
  get [Symbol.toStringTag]() {
    return "EliscriptPersistentList";
  }
}
var EMPTY_LIST = new PersistentList(LIST_CONSTRUCTOR_TOKEN, 0, true, undefined, null);

// runtime/core/value.mjs
var IEquiv = I_EQUIV;
var IHash = I_HASH;
function equalValues(left, right) {
  if (left === right) {
    return true;
  }
  if (typeof left === "number" && typeof right === "number") {
    return Number.isNaN(left) && Number.isNaN(right);
  }
  if (left === null || right === null || typeof left !== "object" && typeof left !== "function" || typeof right !== "object" && typeof right !== "function") {
    return false;
  }
  if (!implements_protocol_operation_QMARK_(IEquiv, "equal", left) || !implements_protocol_operation_QMARK_(IEquiv, "equal", right)) {
    return false;
  }
  return dispatchValueEqual(left, right, equalValues) === true;
}
function hashValue(value) {
  recordHashValueCall();
  if (value === null) {
    return hashNull();
  }
  switch (typeof value) {
    case "undefined":
      return hashUndefined();
    case "boolean":
      return hashBoolean(value);
    case "number":
      return hashNumber(value);
    case "bigint":
      return hashBigInt(value);
    case "string":
      return hashString(value);
    case "symbol": {
      const globalKey = Symbol.keyFor(value);
      return globalKey === undefined ? hostIdentityHash(value) : hashGlobalSymbol(globalKey);
    }
    case "function":
    case "object": {
      if (implements_protocol_operation_QMARK_(IHash, "hash", value)) {
        return cachedProtocolHash(value, () => dispatchValueHash(value, hashValue));
      }
      return hostIdentityHash(value);
    }
    default:
      throw new TypeError(`cannot hash JavaScript value of type ${typeof value}`);
  }
}

// runtime/core/map-internals.mjs
var MAP_STATE = Symbol("eliscript.map.state");
var MAP_CONSTRUCTOR_TOKEN = Symbol("eliscript.map.constructor");
var MAP_NOT_FOUND = Symbol("eliscript.map.not-found");
var TRANSIENT_MAP_STATE = Symbol("eliscript.map.transient-state");
var TRANSIENT_MAP_CONSTRUCTOR_TOKEN = Symbol("eliscript.map.transient-constructor");
var ARRAY_NODE_THRESHOLD = 32;
var BITMAP_NODE_THRESHOLD = 24;
var BRANCH_MASK = 31;
var metrics3 = {
  nodeAllocations: 0,
  nodeVisits: 0,
  entryAllocations: 0,
  keyEqualityChecks: 0,
  promotions: 0,
  demotions: 0
};
var transientMetrics = {
  nodeClones: 0,
  nodeMutations: 0,
  persistentCalls: 0,
  invalidCalls: 0
};

class MapEntry {
  constructor(key, value, hash) {
    metrics3.entryAllocations += 1;
    this.key = key;
    this.value = value;
    this.hash = hash >>> 0;
    Object.freeze(this);
  }
}

class BitmapIndexedNode {
  constructor(bitmap = 0, items = [], owner = null) {
    metrics3.nodeAllocations += 1;
    this.bitmap = bitmap >>> 0;
    this.owner = owner;
    this.items = owner === null ? Object.freeze(items) : items;
    if (owner === null) {
      Object.freeze(this);
    }
  }
}

class ArrayNode {
  constructor(count, children, owner = null) {
    metrics3.nodeAllocations += 1;
    this.count = count;
    this.owner = owner;
    this.children = owner === null ? Object.freeze(children) : children;
    if (owner === null) {
      Object.freeze(this);
    }
  }
}

class HashCollisionNode {
  constructor(hash, entries, owner = null) {
    metrics3.nodeAllocations += 1;
    this.hash = hash >>> 0;
    this.owner = owner;
    this.entries = owner === null ? Object.freeze(entries) : entries;
    if (owner === null) {
      Object.freeze(this);
    }
  }
}
function editableMapNode(node, owner) {
  if (node.owner === owner) {
    return node;
  }
  transientMetrics.nodeClones += 1;
  if (node instanceof BitmapIndexedNode) {
    return new BitmapIndexedNode(node.bitmap, node.items.slice(), owner);
  }
  if (node instanceof ArrayNode) {
    return new ArrayNode(node.count, node.children.slice(), owner);
  }
  return new HashCollisionNode(node.hash, node.entries.slice(), owner);
}
function recordTransientNodeMutation() {
  transientMetrics.nodeMutations += 1;
}
function visitNode(node) {
  metrics3.nodeVisits += 1;
  return node;
}
function keysEqual(left, right) {
  metrics3.keyEqualityChecks += 1;
  return equalValues(left, right);
}
function branchIndex(hash, shift) {
  return hash >>> shift & BRANCH_MASK;
}
function bitPosition(hash, shift) {
  return 1 << branchIndex(hash, shift) >>> 0;
}
function popcount(value) {
  let bits = value >>> 0;
  bits -= bits >>> 1 & 1431655765;
  bits = (bits & 858993459) + (bits >>> 2 & 858993459);
  return Math.imul(bits + (bits >>> 4) & 252645135, 16843009) >>> 24;
}
function packedIndex(bitmap, bit) {
  return popcount((bitmap & bit - 1 >>> 0) >>> 0);
}
function sameEntry(entry, hash, key) {
  return entry.hash === hash && keysEqual(entry.key, key);
}
function mergeEntries(shift, left, right) {
  if (left.hash === right.hash) {
    return new HashCollisionNode(left.hash, [left, right]);
  }
  const leftIndex = branchIndex(left.hash, shift);
  const rightIndex = branchIndex(right.hash, shift);
  if (leftIndex === rightIndex) {
    return new BitmapIndexedNode(1 << leftIndex >>> 0, [mergeEntries(shift + 5, left, right)]);
  }
  const bitmap = (1 << leftIndex | 1 << rightIndex) >>> 0;
  return new BitmapIndexedNode(bitmap, leftIndex < rightIndex ? [left, right] : [right, left]);
}
function mergeCollisionAndEntry(shift, node, entry) {
  const nodeIndex = branchIndex(node.hash, shift);
  const entryIndex = branchIndex(entry.hash, shift);
  if (nodeIndex === entryIndex) {
    return new BitmapIndexedNode(1 << nodeIndex >>> 0, [mergeCollisionAndEntry(shift + 5, node, entry)]);
  }
  const bitmap = (1 << nodeIndex | 1 << entryIndex) >>> 0;
  return new BitmapIndexedNode(bitmap, nodeIndex < entryIndex ? [node, entry] : [entry, node]);
}
function assocEntry(entry, shift, hash, key, value) {
  if (sameEntry(entry, hash, key)) {
    if (equalValues(entry.value, value)) {
      return { item: entry, added: false, changed: false };
    }
    return {
      item: new MapEntry(entry.key, value, entry.hash),
      added: false,
      changed: true
    };
  }
  return {
    item: mergeEntries(shift, entry, new MapEntry(key, value, hash)),
    added: true,
    changed: true
  };
}
function findEntry(entry, hash, key, notFound) {
  return sameEntry(entry, hash, key) ? entry.value : notFound;
}
function promoteBitmapNode(node, shift, hash, key, value) {
  const children = Array(32).fill(undefined);
  let packed = 0;
  for (let index = 0;index < 32; index += 1) {
    const bit = 1 << index >>> 0;
    if ((node.bitmap & bit) !== 0) {
      children[index] = node.items[packed];
      packed += 1;
    }
  }
  children[branchIndex(hash, shift)] = new MapEntry(key, value, hash);
  metrics3.promotions += 1;
  return new ArrayNode(node.items.length + 1, children);
}
function packArrayNode(node) {
  let bitmap = 0;
  const items = [];
  for (let index = 0;index < 32; index += 1) {
    const child = node.children[index];
    if (child !== undefined) {
      bitmap = (bitmap | 1 << index) >>> 0;
      items.push(child);
    }
  }
  metrics3.demotions += 1;
  return new BitmapIndexedNode(bitmap, items);
}
function findInNode(node, shift, hash, key, notFound) {
  visitNode(node);
  if (node instanceof BitmapIndexedNode) {
    const bit = bitPosition(hash, shift);
    if ((node.bitmap & bit) === 0) {
      return notFound;
    }
    const item = node.items[packedIndex(node.bitmap, bit)];
    return item instanceof MapEntry ? findEntry(item, hash, key, notFound) : findInNode(item, shift + 5, hash, key, notFound);
  }
  if (node instanceof ArrayNode) {
    const item = node.children[branchIndex(hash, shift)];
    if (item === undefined) {
      return notFound;
    }
    return item instanceof MapEntry ? findEntry(item, hash, key, notFound) : findInNode(item, shift + 5, hash, key, notFound);
  }
  if (node.hash !== hash) {
    return notFound;
  }
  for (const entry of node.entries) {
    if (keysEqual(entry.key, key)) {
      return entry.value;
    }
  }
  return notFound;
}
function assocNode(node, shift, hash, key, value) {
  visitNode(node);
  if (node instanceof BitmapIndexedNode) {
    const bit = bitPosition(hash, shift);
    const index2 = packedIndex(node.bitmap, bit);
    if ((node.bitmap & bit) === 0) {
      if (node.items.length + 1 >= ARRAY_NODE_THRESHOLD) {
        return {
          item: promoteBitmapNode(node, shift, hash, key, value),
          added: true,
          changed: true
        };
      }
      const items2 = node.items.slice();
      items2.splice(index2, 0, new MapEntry(key, value, hash));
      return {
        item: new BitmapIndexedNode((node.bitmap | bit) >>> 0, items2),
        added: true,
        changed: true
      };
    }
    const existing = node.items[index2];
    const result = existing instanceof MapEntry ? assocEntry(existing, shift + 5, hash, key, value) : assocNode(existing, shift + 5, hash, key, value);
    if (!result.changed) {
      return { item: node, added: false, changed: false };
    }
    const items = node.items.slice();
    items[index2] = result.item;
    return {
      item: new BitmapIndexedNode(node.bitmap, items),
      added: result.added,
      changed: true
    };
  }
  if (node instanceof ArrayNode) {
    const index2 = branchIndex(hash, shift);
    const existing = node.children[index2];
    if (existing === undefined) {
      const children2 = node.children.slice();
      children2[index2] = new MapEntry(key, value, hash);
      return {
        item: new ArrayNode(node.count + 1, children2),
        added: true,
        changed: true
      };
    }
    const result = existing instanceof MapEntry ? assocEntry(existing, shift + 5, hash, key, value) : assocNode(existing, shift + 5, hash, key, value);
    if (!result.changed) {
      return { item: node, added: false, changed: false };
    }
    const children = node.children.slice();
    children[index2] = result.item;
    return {
      item: new ArrayNode(node.count, children),
      added: result.added,
      changed: true
    };
  }
  if (node.hash !== hash) {
    return {
      item: mergeCollisionAndEntry(shift, node, new MapEntry(key, value, hash)),
      added: true,
      changed: true
    };
  }
  const index = node.entries.findIndex((entry) => keysEqual(entry.key, key));
  if (index >= 0) {
    const existing = node.entries[index];
    if (equalValues(existing.value, value)) {
      return { item: node, added: false, changed: false };
    }
    const entries = node.entries.slice();
    entries[index] = new MapEntry(existing.key, value, hash);
    return {
      item: new HashCollisionNode(hash, entries),
      added: false,
      changed: true
    };
  }
  return {
    item: new HashCollisionNode(hash, [...node.entries, new MapEntry(key, value, hash)]),
    added: true,
    changed: true
  };
}
function removePackedItem(node, bit, index) {
  if (node.items.length === 1) {
    return;
  }
  const items = node.items.slice();
  items.splice(index, 1);
  return new BitmapIndexedNode((node.bitmap ^ bit) >>> 0, items);
}
function dissocNode(node, shift, hash, key) {
  visitNode(node);
  if (node instanceof BitmapIndexedNode) {
    const bit = bitPosition(hash, shift);
    if ((node.bitmap & bit) === 0) {
      return { item: node, removed: false };
    }
    const index2 = packedIndex(node.bitmap, bit);
    const existing = node.items[index2];
    if (existing instanceof MapEntry) {
      if (!sameEntry(existing, hash, key)) {
        return { item: node, removed: false };
      }
      return {
        item: removePackedItem(node, bit, index2),
        removed: true
      };
    }
    const result = dissocNode(existing, shift + 5, hash, key);
    if (!result.removed) {
      return { item: node, removed: false };
    }
    if (result.item === undefined) {
      return {
        item: removePackedItem(node, bit, index2),
        removed: true
      };
    }
    const items = node.items.slice();
    items[index2] = result.item;
    return {
      item: new BitmapIndexedNode(node.bitmap, items),
      removed: true
    };
  }
  if (node instanceof ArrayNode) {
    const index2 = branchIndex(hash, shift);
    const existing = node.children[index2];
    if (existing === undefined) {
      return { item: node, removed: false };
    }
    let result;
    if (existing instanceof MapEntry) {
      result = sameEntry(existing, hash, key) ? { item: undefined, removed: true } : { item: existing, removed: false };
    } else {
      result = dissocNode(existing, shift + 5, hash, key);
    }
    if (!result.removed) {
      return { item: node, removed: false };
    }
    const children = node.children.slice();
    children[index2] = result.item;
    const count = result.item === undefined ? node.count - 1 : node.count;
    const updated = new ArrayNode(count, children);
    return {
      item: count <= BITMAP_NODE_THRESHOLD ? packArrayNode(updated) : updated,
      removed: true
    };
  }
  if (node.hash !== hash) {
    return { item: node, removed: false };
  }
  const index = node.entries.findIndex((entry) => keysEqual(entry.key, key));
  if (index < 0) {
    return { item: node, removed: false };
  }
  if (node.entries.length === 2) {
    return { item: node.entries[index === 0 ? 1 : 0], removed: true };
  }
  const entries = node.entries.slice();
  entries.splice(index, 1);
  return {
    item: new HashCollisionNode(hash, entries),
    removed: true
  };
}
function transientMergeEntries(shift, left, right, owner) {
  if (left.hash === right.hash) {
    return new HashCollisionNode(left.hash, [left, right], owner);
  }
  const leftIndex = branchIndex(left.hash, shift);
  const rightIndex = branchIndex(right.hash, shift);
  if (leftIndex === rightIndex) {
    return new BitmapIndexedNode(1 << leftIndex >>> 0, [transientMergeEntries(shift + 5, left, right, owner)], owner);
  }
  const bitmap = (1 << leftIndex | 1 << rightIndex) >>> 0;
  return new BitmapIndexedNode(bitmap, leftIndex < rightIndex ? [left, right] : [right, left], owner);
}
function transientMergeCollisionAndEntry(shift, node, entry, owner) {
  const nodeIndex = branchIndex(node.hash, shift);
  const entryIndex = branchIndex(entry.hash, shift);
  if (nodeIndex === entryIndex) {
    return new BitmapIndexedNode(1 << nodeIndex >>> 0, [transientMergeCollisionAndEntry(shift + 5, node, entry, owner)], owner);
  }
  const bitmap = (1 << nodeIndex | 1 << entryIndex) >>> 0;
  return new BitmapIndexedNode(bitmap, nodeIndex < entryIndex ? [node, entry] : [entry, node], owner);
}
function transientAssocEntry(entry, shift, hash, key, value, owner) {
  if (sameEntry(entry, hash, key)) {
    if (equalValues(entry.value, value)) {
      return { item: entry, added: false, changed: false };
    }
    return {
      item: new MapEntry(entry.key, value, entry.hash),
      added: false,
      changed: true
    };
  }
  return {
    item: transientMergeEntries(shift, entry, new MapEntry(key, value, hash), owner),
    added: true,
    changed: true
  };
}
function transientPromoteBitmapNode(node, shift, hash, key, value, owner) {
  const children = Array(32).fill(undefined);
  let packed = 0;
  for (let index = 0;index < 32; index += 1) {
    const bit = 1 << index >>> 0;
    if ((node.bitmap & bit) !== 0) {
      children[index] = node.items[packed];
      packed += 1;
    }
  }
  children[branchIndex(hash, shift)] = new MapEntry(key, value, hash);
  metrics3.promotions += 1;
  return new ArrayNode(node.items.length + 1, children, owner);
}
function transientPackArrayNode(node, removedIndex, owner) {
  let bitmap = 0;
  const items = [];
  for (let index = 0;index < 32; index += 1) {
    if (index === removedIndex) {
      continue;
    }
    const child = node.children[index];
    if (child !== undefined) {
      bitmap = (bitmap | 1 << index) >>> 0;
      items.push(child);
    }
  }
  metrics3.demotions += 1;
  return new BitmapIndexedNode(bitmap, items, owner);
}
function transientAssocNode(node, shift, hash, key, value, owner) {
  visitNode(node);
  if (node instanceof BitmapIndexedNode) {
    const bit = bitPosition(hash, shift);
    const index2 = packedIndex(node.bitmap, bit);
    if ((node.bitmap & bit) === 0) {
      if (node.items.length + 1 >= ARRAY_NODE_THRESHOLD) {
        return {
          item: transientPromoteBitmapNode(node, shift, hash, key, value, owner),
          added: true,
          changed: true
        };
      }
      const editable3 = editableMapNode(node, owner);
      editable3.bitmap = (editable3.bitmap | bit) >>> 0;
      editable3.items.splice(index2, 0, new MapEntry(key, value, hash));
      recordTransientNodeMutation();
      return { item: editable3, added: true, changed: true };
    }
    const existing = node.items[index2];
    const result = existing instanceof MapEntry ? transientAssocEntry(existing, shift + 5, hash, key, value, owner) : transientAssocNode(existing, shift + 5, hash, key, value, owner);
    if (!result.changed) {
      return { item: node, added: false, changed: false };
    }
    const editable2 = editableMapNode(node, owner);
    editable2.items[index2] = result.item;
    recordTransientNodeMutation();
    return { item: editable2, added: result.added, changed: true };
  }
  if (node instanceof ArrayNode) {
    const index2 = branchIndex(hash, shift);
    const existing = node.children[index2];
    if (existing === undefined) {
      const editable3 = editableMapNode(node, owner);
      editable3.children[index2] = new MapEntry(key, value, hash);
      editable3.count += 1;
      recordTransientNodeMutation();
      return { item: editable3, added: true, changed: true };
    }
    const result = existing instanceof MapEntry ? transientAssocEntry(existing, shift + 5, hash, key, value, owner) : transientAssocNode(existing, shift + 5, hash, key, value, owner);
    if (!result.changed) {
      return { item: node, added: false, changed: false };
    }
    const editable2 = editableMapNode(node, owner);
    editable2.children[index2] = result.item;
    recordTransientNodeMutation();
    return { item: editable2, added: result.added, changed: true };
  }
  if (node.hash !== hash) {
    return {
      item: transientMergeCollisionAndEntry(shift, node, new MapEntry(key, value, hash), owner),
      added: true,
      changed: true
    };
  }
  const index = node.entries.findIndex((entry) => keysEqual(entry.key, key));
  if (index >= 0) {
    const existing = node.entries[index];
    if (equalValues(existing.value, value)) {
      return { item: node, added: false, changed: false };
    }
    const editable2 = editableMapNode(node, owner);
    editable2.entries[index] = new MapEntry(existing.key, value, hash);
    recordTransientNodeMutation();
    return { item: editable2, added: false, changed: true };
  }
  const editable = editableMapNode(node, owner);
  editable.entries.push(new MapEntry(key, value, hash));
  recordTransientNodeMutation();
  return { item: editable, added: true, changed: true };
}
function transientRemovePackedItem(node, bit, index, owner) {
  if (node.items.length === 1) {
    return;
  }
  const editable = editableMapNode(node, owner);
  editable.bitmap = (editable.bitmap ^ bit) >>> 0;
  editable.items.splice(index, 1);
  recordTransientNodeMutation();
  return editable;
}
function transientDissocNode(node, shift, hash, key, owner) {
  visitNode(node);
  if (node instanceof BitmapIndexedNode) {
    const bit = bitPosition(hash, shift);
    if ((node.bitmap & bit) === 0) {
      return { item: node, removed: false };
    }
    const index2 = packedIndex(node.bitmap, bit);
    const existing = node.items[index2];
    if (existing instanceof MapEntry) {
      if (!sameEntry(existing, hash, key)) {
        return { item: node, removed: false };
      }
      return {
        item: transientRemovePackedItem(node, bit, index2, owner),
        removed: true
      };
    }
    const result = transientDissocNode(existing, shift + 5, hash, key, owner);
    if (!result.removed) {
      return { item: node, removed: false };
    }
    if (result.item === undefined) {
      return {
        item: transientRemovePackedItem(node, bit, index2, owner),
        removed: true
      };
    }
    const editable2 = editableMapNode(node, owner);
    editable2.items[index2] = result.item;
    recordTransientNodeMutation();
    return { item: editable2, removed: true };
  }
  if (node instanceof ArrayNode) {
    const index2 = branchIndex(hash, shift);
    const existing = node.children[index2];
    if (existing === undefined) {
      return { item: node, removed: false };
    }
    const result = existing instanceof MapEntry ? sameEntry(existing, hash, key) ? { item: undefined, removed: true } : { item: existing, removed: false } : transientDissocNode(existing, shift + 5, hash, key, owner);
    if (!result.removed) {
      return { item: node, removed: false };
    }
    const count = result.item === undefined ? node.count - 1 : node.count;
    if (result.item === undefined && count <= BITMAP_NODE_THRESHOLD) {
      return {
        item: transientPackArrayNode(node, index2, owner),
        removed: true
      };
    }
    const editable2 = editableMapNode(node, owner);
    editable2.children[index2] = result.item;
    editable2.count = count;
    recordTransientNodeMutation();
    return { item: editable2, removed: true };
  }
  if (node.hash !== hash) {
    return { item: node, removed: false };
  }
  const index = node.entries.findIndex((entry) => keysEqual(entry.key, key));
  if (index < 0) {
    return { item: node, removed: false };
  }
  if (node.entries.length === 2) {
    return { item: node.entries[index === 0 ? 1 : 0], removed: true };
  }
  const editable = editableMapNode(node, owner);
  editable.entries.splice(index, 1);
  recordTransientNodeMutation();
  return { item: editable, removed: true };
}
function mapFind(root, hash, key, notFound) {
  return findInNode(root, 0, hash >>> 0, key, notFound);
}
function mapAssoc(root, hash, key, value) {
  return assocNode(root, 0, hash >>> 0, key, value);
}
function mapDissoc(root, hash, key) {
  return dissocNode(root, 0, hash >>> 0, key);
}
function mapAssocTransient(root, owner, hash, key, value) {
  return transientAssocNode(root, 0, hash >>> 0, key, value, owner);
}
function mapDissocTransient(root, owner, hash, key) {
  return transientDissocNode(root, 0, hash >>> 0, key, owner);
}
function* mapEntries(item) {
  if (item instanceof MapEntry) {
    yield item;
    return;
  }
  if (item instanceof BitmapIndexedNode) {
    for (const child of item.items) {
      yield* mapEntries(child);
    }
    return;
  }
  if (item instanceof ArrayNode) {
    for (const child of item.children) {
      if (child !== undefined) {
        yield* mapEntries(child);
      }
    }
    return;
  }
  for (const entry of item.entries) {
    yield entry;
  }
}
function mapHash(key) {
  return hashValue(key);
}
function recordTransientMapPersistent() {
  transientMetrics.persistentCalls += 1;
}
function recordInvalidTransientMapCall() {
  transientMetrics.invalidCalls += 1;
}
var EMPTY_BITMAP_NODE = new BitmapIndexedNode;

// runtime/core/transient-internals.mjs
var I_EDITABLE = define_protocol("IEditable", ["transient"]);
var I_TRANSIENT_COLLECTION = define_protocol("ITransientCollection", ["conj!", "assoc!", "dissoc!", "persistent!"]);
var EDITABLE_TRANSIENT = protocol_slot(I_EDITABLE, "transient");
var TRANSIENT_CONJ = protocol_slot(I_TRANSIENT_COLLECTION, "conj!");
var TRANSIENT_ASSOC = protocol_slot(I_TRANSIENT_COLLECTION, "assoc!");
var TRANSIENT_DISSOC = protocol_slot(I_TRANSIENT_COLLECTION, "dissoc!");
var TRANSIENT_PERSISTENT = protocol_slot(I_TRANSIENT_COLLECTION, "persistent!");
var dispatchEditableTransient = protocol_method(I_EDITABLE, "transient");
var dispatchTransientConj = protocol_method(I_TRANSIENT_COLLECTION, "conj!");
var dispatchTransientAssoc = protocol_method(I_TRANSIENT_COLLECTION, "assoc!");
var dispatchTransientDissoc = protocol_method(I_TRANSIENT_COLLECTION, "dissoc!");
var dispatchTransientPersistent = protocol_method(I_TRANSIENT_COLLECTION, "persistent!");

// runtime/core/persistent-kind.mjs
var PERSISTENT_MAP_KIND = Symbol("eliscript.persistent-map.kind");
var PERSISTENT_MAP_HAS_VALUE_KEY = Symbol("eliscript.persistent-map.has-value-key");
var PERSISTENT_SET_KIND = Symbol("eliscript.persistent-set.kind");
var PERSISTENT_SET_HAS_VALUE = Symbol("eliscript.persistent-set.has-value");
function isPersistentMapValue(value) {
  return value?.[PERSISTENT_MAP_KIND] === true && typeof value?.[PERSISTENT_MAP_HAS_VALUE_KEY] === "function";
}
function isPersistentSetValue(value) {
  return value?.[PERSISTENT_SET_KIND] === true && typeof value?.[PERSISTENT_SET_HAS_VALUE] === "function";
}
function persistentMapValueEqual(left, right, equal) {
  if (!isPersistentMapValue(right) || right.count !== left.count) {
    return false;
  }
  for (const [key, value] of left) {
    if (!right[PERSISTENT_MAP_HAS_VALUE_KEY](key) || !equal(value, right.get(key))) {
      return false;
    }
  }
  return true;
}
function persistentSetValueEqual(left, right, equal) {
  if (!isPersistentSetValue(right) || right.count !== left.count) {
    return false;
  }
  for (const value of left) {
    if (!right[PERSISTENT_SET_HAS_VALUE](value, equal)) {
      return false;
    }
  }
  return true;
}

// runtime/core/map.mjs
var MAP_HASH_TAG = 1821285621;
var MAP_ENTRY_HASH_TAG = 982610667;
function makeMap(count, root, metadata = null) {
  return new PersistentHashMap(MAP_CONSTRUCTOR_TOKEN, count, root, metadata);
}
function emptyMapWithMetadata(metadata) {
  return metadata === null ? EMPTY_MAP : makeMap(0, EMPTY_BITMAP_NODE, metadata);
}
function makeTransientMap(map) {
  return new TransientHashMap(TRANSIENT_MAP_CONSTRUCTOR_TOKEN, map);
}
function activeTransientMapState(map) {
  const state = map[TRANSIENT_MAP_STATE];
  if (!state.active) {
    recordInvalidTransientMapCall();
    throw new TypeError("transient hash map is no longer editable");
  }
  return state;
}
function pairHash(entry, hash) {
  return finishHash(mixHash(mixHash(MAP_ENTRY_HASH_TAG, hash(entry.key)), hash(entry.value)), 2);
}

class TransientHashMap {
  constructor(token, map) {
    if (token !== TRANSIENT_MAP_CONSTRUCTOR_TOKEN || !(map instanceof PersistentHashMap)) {
      throw new TypeError("transient hash maps must be created from a persistent hash map");
    }
    const source = map[MAP_STATE];
    this[TRANSIENT_MAP_STATE] = {
      active: true,
      changed: false,
      owner: Object.freeze({}),
      source: map,
      count: source.count,
      root: source.root,
      metadata: source.metadata
    };
    Object.defineProperty(this, "__eliscript_transient__", {
      enumerable: true,
      get() {
        throw new TypeError("transient hash maps cannot be serialized");
      }
    });
    Object.freeze(this);
  }
  [TRANSIENT_CONJ](entry) {
    const [key, value] = readCollectionEntry(entry);
    return this[TRANSIENT_ASSOC](key, value);
  }
  [TRANSIENT_ASSOC](key, value) {
    const state = activeTransientMapState(this);
    const result = mapAssocTransient(state.root, state.owner, mapHash(key), key, value);
    if (result.changed) {
      state.root = result.item;
      state.count += result.added ? 1 : 0;
      state.changed = true;
    }
    return this;
  }
  [TRANSIENT_DISSOC](key) {
    const state = activeTransientMapState(this);
    const result = mapDissocTransient(state.root, state.owner, mapHash(key), key);
    if (result.removed) {
      state.count -= 1;
      state.root = state.count === 0 ? EMPTY_BITMAP_NODE : result.item ?? EMPTY_BITMAP_NODE;
      state.changed = true;
    }
    return this;
  }
  [TRANSIENT_PERSISTENT]() {
    const state = activeTransientMapState(this);
    const result = !state.changed ? state.source : state.count === 0 ? emptyMapWithMetadata(state.metadata) : makeMap(state.count, state.root, state.metadata);
    state.active = false;
    state.owner = null;
    recordTransientMapPersistent();
    return result;
  }
  toJSON() {
    throw new TypeError("transient hash maps cannot be serialized");
  }
  get [Symbol.toStringTag]() {
    return "EliscriptTransientHashMap";
  }
}

class PersistentHashMap {
  constructor(token, count, root, metadata = null) {
    if (token !== MAP_CONSTRUCTOR_TOKEN) {
      throw new TypeError("PersistentHashMap values must be created with persistentHashMap or PersistentHashMap.from");
    }
    this[MAP_STATE] = Object.freeze({ count, root, metadata });
    Object.freeze(this);
  }
  static empty() {
    return EMPTY_MAP;
  }
  static from(entries) {
    if (entries instanceof PersistentHashMap) {
      return entries;
    }
    let result = EMPTY_MAP;
    for (const entry of entries) {
      const [key, value] = readCollectionEntry(entry);
      result = result.assoc(key, value);
    }
    return result;
  }
  get count() {
    return this[MAP_STATE].count;
  }
  get size() {
    return this[MAP_STATE].count;
  }
  get(key, notFound = null) {
    return mapFind(this[MAP_STATE].root, mapHash(key), key, notFound);
  }
  has(key) {
    return this.get(key, MAP_NOT_FOUND) !== MAP_NOT_FOUND;
  }
  assoc(key, value) {
    const state = this[MAP_STATE];
    const result = mapAssoc(state.root, mapHash(key), key, value);
    if (!result.changed) {
      return this;
    }
    return makeMap(state.count + (result.added ? 1 : 0), result.item, state.metadata);
  }
  dissoc(key) {
    const state = this[MAP_STATE];
    const result = mapDissoc(state.root, mapHash(key), key);
    if (!result.removed) {
      return this;
    }
    if (state.count === 1) {
      return emptyMapWithMetadata(state.metadata);
    }
    return makeMap(state.count - 1, result.item ?? EMPTY_BITMAP_NODE, state.metadata);
  }
  *entries() {
    for (const entry of mapEntries(this[MAP_STATE].root)) {
      yield Object.freeze([entry.key, entry.value]);
    }
  }
  *keys() {
    for (const entry of mapEntries(this[MAP_STATE].root)) {
      yield entry.key;
    }
  }
  *values() {
    for (const entry of mapEntries(this[MAP_STATE].root)) {
      yield entry.value;
    }
  }
  reduce(reducer, initial) {
    if (typeof reducer !== "function") {
      throw new TypeError("persistent hash map reducer must be a function");
    }
    if (arguments.length < 2) {
      throw new TypeError("persistent hash map reduce requires an initial value");
    }
    let result = initial;
    for (const entry of mapEntries(this[MAP_STATE].root)) {
      result = reducer(result, entry.value, entry.key, this);
    }
    return result;
  }
  [COLLECTION_COUNT]() {
    return this.count;
  }
  [COLLECTION_EMPTY]() {
    return emptyMapWithMetadata(this[MAP_STATE].metadata);
  }
  [COLLECTION_CONJ](entry) {
    const [key, value] = readCollectionEntry(entry);
    return this.assoc(key, value);
  }
  [COLLECTION_GET](key, notFound = null) {
    return this.get(key, notFound);
  }
  [COLLECTION_ASSOC](key, value) {
    return this.assoc(key, value);
  }
  [COLLECTION_CONTAINS](key) {
    return this.has(key);
  }
  [COLLECTION_DISSOC](key) {
    return this.dissoc(key);
  }
  [COLLECTION_SEQ]() {
    return this.count === 0 ? null : sequenceView(() => this.entries(), this.count);
  }
  [COLLECTION_REDUCE](reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }
  [COLLECTION_REDUCE_KV](reducer, initial) {
    let result = initial;
    for (const entry of mapEntries(this[MAP_STATE].root)) {
      result = reducer(result, entry.key, entry.value);
      if (isReducedValue(result))
        return unreducedValue(result);
    }
    return result;
  }
  [EDITABLE_TRANSIENT]() {
    return makeTransientMap(this);
  }
  toMap() {
    return new Map(this.entries());
  }
  [PERSISTENT_MAP_HAS_VALUE_KEY](key) {
    return this.has(key);
  }
  get [PERSISTENT_MAP_KIND]() {
    return true;
  }
  [VALUE_EQUAL](other, equal) {
    return persistentMapValueEqual(this, other, equal);
  }
  [VALUE_HASH](hash) {
    return unorderedCollectionHash(mapEntries(this[MAP_STATE].root), (entry) => pairHash(entry, hash), MAP_HASH_TAG);
  }
  [METADATA_READ]() {
    return this[MAP_STATE].metadata;
  }
  [METADATA_WITH](metadata) {
    const state = this[MAP_STATE];
    return metadata === state.metadata ? this : makeMap(state.count, state.root, metadata);
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  get [Symbol.toStringTag]() {
    return "EliscriptPersistentHashMap";
  }
}
var EMPTY_MAP = makeMap(0, EMPTY_BITMAP_NODE);
function persistentHashMap(...entries) {
  return PersistentHashMap.from(entries);
}

// runtime/core/queue-internals.mjs
var QUEUE_CONSTRUCTOR_TOKEN = Symbol("eliscript.queue.constructor");
var QUEUE_STATE = Symbol("eliscript.queue.state");
var metrics4 = {
  queueAllocations: 0,
  frontPromotions: 0,
  promotedValues: 0
};
function recordQueueAllocation() {
  metrics4.queueAllocations += 1;
}
function recordQueueFrontPromotion(count) {
  metrics4.frontPromotions += 1;
  metrics4.promotedValues += count;
}

// runtime/core/vector-internals.mjs
var BRANCH_BITS = 5;
var BRANCH_WIDTH = 1 << BRANCH_BITS;
var BRANCH_MASK2 = BRANCH_WIDTH - 1;
var VECTOR_STATE = Symbol("eliscript.vector.state");
var VECTOR_CONSTRUCTOR_TOKEN = Symbol("eliscript.vector.constructor");
var TRANSIENT_VECTOR_STATE = Symbol("eliscript.vector.transient-state");
var TRANSIENT_VECTOR_CONSTRUCTOR_TOKEN = Symbol("eliscript.vector.transient-constructor");
var metrics5 = {
  nodeAllocations: 0,
  nodeVisits: 0,
  tailAllocations: 0,
  rootGrowths: 0
};
var transientMetrics2 = {
  nodeClones: 0,
  nodeMutations: 0,
  tailCopies: 0,
  tailMutations: 0,
  persistentCalls: 0,
  invalidCalls: 0
};

class VectorNode {
  constructor(slots = [], owner = null) {
    metrics5.nodeAllocations += 1;
    this.owner = owner;
    this.slots = owner === null ? Object.freeze(slots) : slots;
    if (owner === null) {
      Object.freeze(this);
    }
  }
}
function editableVectorNode(node, owner) {
  if (node.owner === owner) {
    return node;
  }
  transientMetrics2.nodeClones += 1;
  return new VectorNode(node.slots.slice(), owner);
}
function recordTransientVectorNodeMutation() {
  transientMetrics2.nodeMutations += 1;
}
function recordTransientVectorTailCopy() {
  transientMetrics2.tailCopies += 1;
}
function recordTransientVectorTailMutation() {
  transientMetrics2.tailMutations += 1;
}
function recordTransientVectorPersistent() {
  transientMetrics2.persistentCalls += 1;
}
function recordInvalidTransientVectorCall() {
  transientMetrics2.invalidCalls += 1;
}
function allocateTail(values) {
  metrics5.tailAllocations += 1;
  return Object.freeze(values);
}
function visitNode2(node) {
  metrics5.nodeVisits += 1;
  return node;
}
function recordRootGrowth() {
  metrics5.rootGrowths += 1;
}
var EMPTY_ROOT = new VectorNode;
var EMPTY_TAIL = allocateTail([]);

// runtime/core/vector.mjs
var MAX_COUNT2 = 2147483647;
var MISSING2 = Symbol("eliscript.vector.missing");
var VECTOR_HASH_TAG = 1327180861;
var SUBVECTOR_STATE = new WeakMap;
function assertIndex(index, upperBound, operation) {
  if (!Number.isInteger(index) || index < 0 || index >= upperBound) {
    throw new RangeError(`${operation} index ${String(index)} is outside [0, ${upperBound})`);
  }
}
function tailOffset(count) {
  return count < BRANCH_WIDTH ? 0 : count - 1 >>> BRANCH_BITS << BRANCH_BITS;
}
function reverseVectorIterator(state) {
  let index = state.count - 1;
  let chunk = EMPTY_TAIL;
  let chunkStart = state.count;
  return {
    next() {
      if (index < 0)
        return { value: undefined, done: true };
      if (index < chunkStart) {
        chunk = arrayFor(state, index);
        chunkStart = index - (index & BRANCH_MASK2);
      }
      const value = chunk[index - chunkStart];
      index -= 1;
      return { value, done: false };
    }
  };
}
function vectorRangeIterator(vector, start, end, reverse = false) {
  let index = reverse ? end - 1 : start;
  return {
    next() {
      if (reverse ? index < start : index >= end) {
        return { value: undefined, done: true };
      }
      const value = vector.nth(index);
      index += reverse ? -1 : 1;
      return { value, done: false };
    }
  };
}
function newPath(level, node) {
  if (level === 0) {
    return node;
  }
  return new VectorNode([newPath(level - BRANCH_BITS, node)]);
}
function pushTail(level, parent, tailNode, count) {
  visitNode2(parent);
  const subindex = count - 1 >>> level & BRANCH_MASK2;
  const slots = parent.slots.slice();
  if (level === BRANCH_BITS) {
    slots[subindex] = tailNode;
  } else {
    const child = parent.slots[subindex];
    slots[subindex] = child === undefined ? newPath(level - BRANCH_BITS, tailNode) : pushTail(level - BRANCH_BITS, child, tailNode, count);
  }
  return new VectorNode(slots);
}
function assocNode2(level, node, index, value) {
  visitNode2(node);
  const slots = node.slots.slice();
  if (level === 0) {
    slots[index & BRANCH_MASK2] = value;
  } else {
    const subindex = index >>> level & BRANCH_MASK2;
    slots[subindex] = assocNode2(level - BRANCH_BITS, node.slots[subindex], index, value);
  }
  return new VectorNode(slots);
}
function transientNewPath(level, node, owner) {
  if (level === 0) {
    return node;
  }
  return new VectorNode([transientNewPath(level - BRANCH_BITS, node, owner)], owner);
}
function transientPushTail(level, parent, tailNode, count, owner) {
  visitNode2(parent);
  const editable = editableVectorNode(parent, owner);
  const subindex = count - 1 >>> level & BRANCH_MASK2;
  if (level === BRANCH_BITS) {
    editable.slots[subindex] = tailNode;
  } else {
    const child = editable.slots[subindex];
    editable.slots[subindex] = child === undefined ? transientNewPath(level - BRANCH_BITS, tailNode, owner) : transientPushTail(level - BRANCH_BITS, child, tailNode, count, owner);
  }
  recordTransientVectorNodeMutation();
  return editable;
}
function transientAssocNode2(level, node, index, value, owner) {
  visitNode2(node);
  const editable = editableVectorNode(node, owner);
  if (level === 0) {
    editable.slots[index & BRANCH_MASK2] = value;
  } else {
    const subindex = index >>> level & BRANCH_MASK2;
    editable.slots[subindex] = transientAssocNode2(level - BRANCH_BITS, editable.slots[subindex], index, value, owner);
  }
  recordTransientVectorNodeMutation();
  return editable;
}
function popTail(level, node, count) {
  visitNode2(node);
  const subindex = count - 2 >>> level & BRANCH_MASK2;
  if (level > BRANCH_BITS) {
    const child = popTail(level - BRANCH_BITS, node.slots[subindex], count);
    if (child === undefined && subindex === 0) {
      return;
    }
    const slots2 = node.slots.slice();
    slots2[subindex] = child;
    return new VectorNode(slots2);
  }
  if (subindex === 0) {
    return;
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
  for (let level = state.shift;level > 0; level -= BRANCH_BITS) {
    visitNode2(node);
    node = node.slots[index >>> level & BRANCH_MASK2];
  }
  visitNode2(node);
  return node.slots;
}
function makeVector(count, shift, root, tail, metadata = null) {
  return new PersistentVector(VECTOR_CONSTRUCTOR_TOKEN, count, shift, root, tail, metadata);
}
function emptyVectorWithMetadata(metadata) {
  return metadata === null ? EMPTY_VECTOR : makeVector(0, BRANCH_BITS, EMPTY_ROOT, EMPTY_TAIL, metadata);
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
    if (token !== TRANSIENT_VECTOR_CONSTRUCTOR_TOKEN || !(vector instanceof PersistentVector)) {
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
      metadata: source.metadata
    };
    Object.defineProperty(this, "__eliscript_transient__", {
      enumerable: true,
      get() {
        throw new TypeError("transient vectors cannot be serialized");
      }
    });
    Object.freeze(this);
  }
  [TRANSIENT_CONJ](value) {
    const state = activeTransientVectorState(this);
    if (state.count === MAX_COUNT2) {
      throw new RangeError(`persistent vector cannot exceed ${MAX_COUNT2} values`);
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
      if (state.count >>> BRANCH_BITS > 1 << state.shift) {
        state.root = new VectorNode([
          state.root,
          transientNewPath(state.shift, tailNode, state.owner)
        ], state.owner);
        state.shift += BRANCH_BITS;
        recordRootGrowth();
      } else {
        state.root = transientPushTail(state.shift, state.root, tailNode, state.count, state.owner);
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
      editableTransientTail(state)[index & BRANCH_MASK2] = value;
      recordTransientVectorTailMutation();
    } else {
      state.root = transientAssocNode2(state.shift, state.root, index, value, state.owner);
    }
    state.changed = true;
    return this;
  }
  [TRANSIENT_PERSISTENT]() {
    const state = activeTransientVectorState(this);
    const result = state.changed ? makeVector(state.count, state.shift, state.root, state.tail, state.metadata) : state.source;
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

class PersistentVector {
  constructor(token, count, shift, root, tail, metadata = null) {
    if (token !== VECTOR_CONSTRUCTOR_TOKEN) {
      throw new TypeError("PersistentVector values must be created with persistentVector or PersistentVector.from");
    }
    this[VECTOR_STATE] = Object.freeze({
      count,
      shift,
      root,
      tail,
      metadata
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
  nth(index, notFound = MISSING2) {
    const state = this[VECTOR_STATE];
    if (!Number.isInteger(index) || index < 0 || index >= state.count) {
      if (notFound !== MISSING2) {
        return notFound;
      }
      assertIndex(index, state.count, "nth");
    }
    return arrayFor(state, index)[index & BRANCH_MASK2];
  }
  assoc(index, value) {
    const state = this[VECTOR_STATE];
    if (index === state.count) {
      return this.conj(value);
    }
    assertIndex(index, state.count, "assoc");
    if (index >= tailOffset(state.count)) {
      const tail = state.tail.slice();
      tail[index & BRANCH_MASK2] = value;
      return makeVector(state.count, state.shift, state.root, allocateTail(tail), state.metadata);
    }
    return makeVector(state.count, state.shift, assocNode2(state.shift, state.root, index, value), state.tail, state.metadata);
  }
  conj(value) {
    const state = this[VECTOR_STATE];
    if (state.count === MAX_COUNT2) {
      throw new RangeError(`persistent vector cannot exceed ${MAX_COUNT2} values`);
    }
    if (state.tail.length < BRANCH_WIDTH) {
      return makeVector(state.count + 1, state.shift, state.root, allocateTail([...state.tail, value]), state.metadata);
    }
    const tailNode = new VectorNode(state.tail);
    let shift = state.shift;
    let root;
    if (state.count >>> BRANCH_BITS > 1 << state.shift) {
      root = new VectorNode([
        state.root,
        newPath(state.shift, tailNode)
      ]);
      shift += BRANCH_BITS;
      recordRootGrowth();
    } else {
      root = pushTail(state.shift, state.root, tailNode, state.count);
    }
    return makeVector(state.count + 1, shift, root, allocateTail([value]), state.metadata);
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
      return makeVector(state.count - 1, state.shift, state.root, allocateTail(state.tail.slice(0, -1)), state.metadata);
    }
    const tail = allocateTail([...arrayFor(state, state.count - 2)]);
    let root = popTail(state.shift, state.root, state.count) ?? EMPTY_ROOT;
    let shift = state.shift;
    if (shift > BRANCH_BITS && root.slots[1] === undefined) {
      root = root.slots[0];
      shift -= BRANCH_BITS;
    }
    return makeVector(state.count - 1, shift, root, tail, state.metadata);
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
      const chunkStart = index & BRANCH_MASK2;
      const chunkLength = Math.min(chunk.length, state.count - (index - chunkStart));
      for (let offset = chunkStart;offset < chunkLength; offset += 1) {
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
  [COLLECTION_PEEK]() {
    return this.peek();
  }
  [COLLECTION_POP]() {
    return this.pop();
  }
  [COLLECTION_RSEQ]() {
    const state = this[VECTOR_STATE];
    return state.count === 0 ? null : sequenceView(() => reverseVectorIterator(state), state.count);
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
    return notFound.length === 0 ? this.nth(index) : this.nth(index, notFound[0]);
  }
  [COLLECTION_SEQ]() {
    return this.count === 0 ? null : sequenceView(() => this[Symbol.iterator](), this.count);
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
      const chunkStart = index & BRANCH_MASK2;
      const chunkLength = Math.min(chunk.length, state.count - (index - chunkStart));
      for (let offset = chunkStart;offset < chunkLength; offset += 1) {
        result = reducer(result, index, chunk[offset]);
        index += 1;
        if (isReducedValue(result))
          return unreducedValue(result);
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
    return metadata === state.metadata ? this : makeVector(state.count, state.shift, state.root, state.tail, metadata);
  }
  *[Symbol.iterator]() {
    const state = this[VECTOR_STATE];
    let index = 0;
    while (index < state.count) {
      const chunk = arrayFor(state, index);
      const chunkStart = index & BRANCH_MASK2;
      const chunkLength = Math.min(chunk.length, state.count - (index - chunkStart));
      for (let offset = chunkStart;offset < chunkLength; offset += 1) {
        yield chunk[offset];
        index += 1;
      }
    }
  }
  get [Symbol.toStringTag]() {
    return "EliscriptPersistentVector";
  }
}

class PersistentSubVector extends PersistentVector {
  constructor(vector, start, end, metadata = null) {
    const source = vector[VECTOR_STATE];
    super(VECTOR_CONSTRUCTOR_TOKEN, source.count, source.shift, source.root, source.tail, metadata);
    SUBVECTOR_STATE.set(this, Object.freeze({ vector, start, end, metadata }));
  }
  get count() {
    const state = SUBVECTOR_STATE.get(this);
    return state.end - state.start;
  }
  get size() {
    return this.count;
  }
  nth(index, notFound = MISSING2) {
    const state = SUBVECTOR_STATE.get(this);
    const count = state.end - state.start;
    if (!Number.isInteger(index) || index < 0 || index >= count) {
      if (notFound !== MISSING2)
        return notFound;
      assertIndex(index, count, "subvec nth");
    }
    return state.vector.nth(state.start + index);
  }
  assoc(index, value) {
    const state = SUBVECTOR_STATE.get(this);
    const count = state.end - state.start;
    if (!Number.isInteger(index) || index < 0 || index > count) {
      throw new RangeError(`subvec assoc index ${String(index)} is outside [0, ${count}]`);
    }
    const absoluteIndex = state.start + index;
    const vector = absoluteIndex === state.vector.count ? state.vector.conj(value) : state.vector.assoc(absoluteIndex, value);
    return new PersistentSubVector(vector, state.start, Math.max(state.end, absoluteIndex + 1), state.metadata);
  }
  conj(value) {
    return this.assoc(this.count, value);
  }
  peek(notFound = null) {
    const state = SUBVECTOR_STATE.get(this);
    return state.start === state.end ? notFound : state.vector.nth(state.end - 1);
  }
  pop() {
    const state = SUBVECTOR_STATE.get(this);
    if (state.start === state.end) {
      throw new RangeError("cannot pop an empty persistent subvector");
    }
    return state.end - state.start === 1 ? emptyVectorWithMetadata(state.metadata) : new PersistentSubVector(state.vector, state.start, state.end - 1, state.metadata);
  }
  reduce(reducer, ...initial) {
    if (typeof reducer !== "function") {
      throw new TypeError("persistent subvector reducer must be a function");
    }
    const state = SUBVECTOR_STATE.get(this);
    let index = 0;
    let result;
    if (initial.length === 0) {
      if (state.start === state.end) {
        throw new TypeError("cannot reduce an empty persistent subvector without an initial value");
      }
      result = state.vector.nth(state.start);
      index = 1;
    } else {
      result = initial[0];
    }
    while (index < state.end - state.start) {
      result = reducer(result, state.vector.nth(state.start + index), index);
      index += 1;
    }
    return result;
  }
  [COLLECTION_COUNT]() {
    return this.count;
  }
  [COLLECTION_EMPTY]() {
    return emptyVectorWithMetadata(SUBVECTOR_STATE.get(this).metadata);
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
  [COLLECTION_RSEQ]() {
    const state = SUBVECTOR_STATE.get(this);
    return state.start === state.end ? null : sequenceView(() => vectorRangeIterator(state.vector, state.start, state.end, true), state.end - state.start);
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
    return notFound.length === 0 ? this.nth(index) : this.nth(index, notFound[0]);
  }
  [COLLECTION_SEQ]() {
    return this.count === 0 ? null : sequenceView(() => this[Symbol.iterator](), this.count);
  }
  [COLLECTION_REDUCE](reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }
  [COLLECTION_REDUCE_KV](reducer, initial) {
    const state = SUBVECTOR_STATE.get(this);
    let result = initial;
    let index = 0;
    while (state.start + index < state.end) {
      result = reducer(result, index, state.vector.nth(state.start + index));
      index += 1;
      if (isReducedValue(result))
        return unreducedValue(result);
    }
    return result;
  }
  [EDITABLE_TRANSIENT]() {
    const state = SUBVECTOR_STATE.get(this);
    const builder = makeTransientVector(emptyVectorWithMetadata(state.metadata));
    for (const value of this) {
      builder[TRANSIENT_CONJ](value);
    }
    return builder;
  }
  [METADATA_READ]() {
    return SUBVECTOR_STATE.get(this).metadata;
  }
  [METADATA_WITH](metadata) {
    const state = SUBVECTOR_STATE.get(this);
    return metadata === state.metadata ? this : new PersistentSubVector(state.vector, state.start, state.end, metadata);
  }
  [Symbol.iterator]() {
    const state = SUBVECTOR_STATE.get(this);
    return vectorRangeIterator(state.vector, state.start, state.end);
  }
  get [Symbol.toStringTag]() {
    return "EliscriptPersistentSubVector";
  }
}
var EMPTY_VECTOR = makeVector(0, BRANCH_BITS, EMPTY_ROOT, EMPTY_TAIL);
function persistentVector(...values) {
  return PersistentVector.from(values);
}
function subvec(vector, start, end = undefined) {
  if (!(vector instanceof PersistentVector)) {
    throw new TypeError("subvec expects a persistent vector");
  }
  const count = vector.count;
  const limit = end == null ? count : end;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(limit) || start < 0 || limit < start || limit > count) {
    throw new RangeError(`subvec range [${String(start)}, ${String(limit)}) is outside [0, ${count}]`);
  }
  if (vector instanceof PersistentSubVector) {
    const state = SUBVECTOR_STATE.get(vector);
    return new PersistentSubVector(state.vector, state.start + start, state.start + limit);
  }
  return new PersistentSubVector(vector, start, limit);
}
function isPersistentVector(value) {
  return value instanceof PersistentVector;
}

// runtime/core/queue.mjs
var MAX_COUNT3 = 2147483647;
var QUEUE_HASH_TAG = 1799167783;
function makeQueue(count, front, rear, metadata = null) {
  recordQueueAllocation();
  return new PersistentQueue(QUEUE_CONSTRUCTOR_TOKEN, count, front, rear, metadata);
}
function emptyQueueWithMetadata(metadata) {
  return metadata === null ? EMPTY_QUEUE : makeQueue(0, EMPTY_VECTOR, EMPTY_VECTOR, metadata);
}

class PersistentQueue {
  constructor(token, count, front, rear, metadata = null) {
    if (token !== QUEUE_CONSTRUCTOR_TOKEN) {
      throw new TypeError("PersistentQueue values must be created with persistentQueue or PersistentQueue.from");
    }
    if (!Number.isSafeInteger(count) || count < 0 || count > MAX_COUNT3 || !(front instanceof PersistentVector) || !(rear instanceof PersistentVector) || front.count + rear.count !== count || (count === 0 ? front.count !== 0 || rear.count !== 0 : front.count === 0)) {
      throw new TypeError("invalid persistent queue state");
    }
    this[QUEUE_STATE] = Object.freeze({
      count,
      front,
      rear,
      metadata
    });
    Object.freeze(this);
  }
  static empty() {
    return EMPTY_QUEUE;
  }
  static from(iterable) {
    if (iterable instanceof PersistentQueue)
      return iterable;
    let result = EMPTY_QUEUE;
    for (const value of iterable)
      result = result.conj(value);
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
    if (state.count === MAX_COUNT3) {
      throw new RangeError(`persistent queue cannot exceed ${MAX_COUNT3} values`);
    }
    return state.count === 0 ? makeQueue(1, persistentVector(value), EMPTY_VECTOR, state.metadata) : makeQueue(state.count + 1, state.front, state.rear.conj(value), state.metadata);
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
      return makeQueue(state.count - 1, subvec(state.front, 1), state.rear, state.metadata);
    }
    if (state.rear.count === 0) {
      return emptyQueueWithMetadata(state.metadata);
    }
    recordQueueFrontPromotion(state.rear.count);
    return makeQueue(state.count - 1, state.rear, EMPTY_VECTOR, state.metadata);
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
    return this.isEmpty ? null : sequenceView(() => this[Symbol.iterator](), this.count);
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
      if (!equal(value, right.next().value))
        return false;
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
    return metadata === state.metadata ? this : makeQueue(state.count, state.front, state.rear, metadata);
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
var EMPTY_QUEUE = new PersistentQueue(QUEUE_CONSTRUCTOR_TOKEN, 0, EMPTY_VECTOR, EMPTY_VECTOR);

// runtime/core/set-internals.mjs
var SET_CONSTRUCTOR_TOKEN = Symbol("eliscript.set.constructor");
var SET_STATE = Symbol("eliscript.set.state");
var TRANSIENT_SET_CONSTRUCTOR_TOKEN = Symbol("eliscript.set.transient-constructor");
var TRANSIENT_SET_STATE = Symbol("eliscript.set.transient-state");
var transientMetrics3 = {
  persistentCalls: 0,
  invalidCalls: 0
};
var SET_PRESENT = Object.freeze({
  [Symbol.toStringTag]: "EliscriptPersistentHashSetEntry"
});
function recordTransientSetPersistent() {
  transientMetrics3.persistentCalls += 1;
}
function recordInvalidTransientSetCall() {
  transientMetrics3.invalidCalls += 1;
}

// runtime/core/set.mjs
var SET_HASH_TAG = 1374139181;
function makeSet(map, metadata = null) {
  return new PersistentHashSet(SET_CONSTRUCTOR_TOKEN, map, metadata);
}
function emptySetWithMetadata(metadata) {
  return metadata === null ? EMPTY_SET : makeSet(EMPTY_MAP, metadata);
}
function makeTransientSet(set) {
  return new TransientHashSet(TRANSIENT_SET_CONSTRUCTOR_TOKEN, set);
}
function activeTransientSetState(set) {
  const state = set[TRANSIENT_SET_STATE];
  if (!state.active) {
    recordInvalidTransientSetCall();
    throw new TypeError("transient hash set is no longer editable");
  }
  return state;
}
function asPersistentSet(values) {
  return values instanceof PersistentHashSet ? values : PersistentHashSet.from(values);
}

class TransientHashSet {
  constructor(token, set) {
    if (token !== TRANSIENT_SET_CONSTRUCTOR_TOKEN || !(set instanceof PersistentHashSet)) {
      throw new TypeError("transient hash sets must be created from a persistent hash set");
    }
    const sourceMap = set[SET_STATE].map;
    const metadata = set[SET_STATE].metadata;
    this[TRANSIENT_SET_STATE] = {
      active: true,
      source: set,
      sourceMap,
      map: sourceMap[EDITABLE_TRANSIENT](),
      metadata
    };
    Object.defineProperty(this, "__eliscript_transient__", {
      enumerable: true,
      get() {
        throw new TypeError("transient hash sets cannot be serialized");
      }
    });
    Object.freeze(this);
  }
  [TRANSIENT_CONJ](value) {
    const state = activeTransientSetState(this);
    state.map[TRANSIENT_ASSOC](value, SET_PRESENT);
    return this;
  }
  [TRANSIENT_DISSOC](value) {
    const state = activeTransientSetState(this);
    state.map[TRANSIENT_DISSOC](value);
    return this;
  }
  [TRANSIENT_PERSISTENT]() {
    const state = activeTransientSetState(this);
    const map = state.map[TRANSIENT_PERSISTENT]();
    const result = map === state.sourceMap ? state.source : map === EMPTY_MAP ? emptySetWithMetadata(state.metadata) : makeSet(map, state.metadata);
    state.active = false;
    recordTransientSetPersistent();
    return result;
  }
  toJSON() {
    throw new TypeError("transient hash sets cannot be serialized");
  }
  get [Symbol.toStringTag]() {
    return "EliscriptTransientHashSet";
  }
}

class PersistentHashSet {
  constructor(token, map, metadata = null) {
    if (token !== SET_CONSTRUCTOR_TOKEN || !(map instanceof PersistentHashMap)) {
      throw new TypeError("PersistentHashSet values must be created with persistentHashSet or PersistentHashSet.from");
    }
    this[SET_STATE] = Object.freeze({ map, metadata });
    Object.freeze(this);
  }
  static empty() {
    return EMPTY_SET;
  }
  static from(values) {
    if (values instanceof PersistentHashSet) {
      return values;
    }
    let result = EMPTY_SET;
    for (const value of values) {
      result = result.conj(value);
    }
    return result;
  }
  get count() {
    return this[SET_STATE].map.count;
  }
  get size() {
    return this[SET_STATE].map.count;
  }
  has(value) {
    return this[SET_STATE].map.has(value);
  }
  conj(value) {
    const state = this[SET_STATE];
    const map = state.map.assoc(value, SET_PRESENT);
    return map === state.map ? this : makeSet(map, state.metadata);
  }
  disj(value) {
    const state = this[SET_STATE];
    const map = state.map.dissoc(value);
    if (map === state.map) {
      return this;
    }
    return map === EMPTY_MAP ? emptySetWithMetadata(state.metadata) : makeSet(map, state.metadata);
  }
  union(...collections) {
    let result = this;
    for (const collection of collections) {
      for (const value of collection) {
        result = result.conj(value);
      }
    }
    return result;
  }
  intersection(...collections) {
    let result = this;
    for (const collection of collections) {
      const other = asPersistentSet(collection);
      if (result.count === 0) {
        return result;
      }
      const candidates = result.count <= other.count ? result : other;
      const membership = candidates === result ? other : result;
      let retained = emptySetWithMetadata(this[SET_STATE].metadata);
      for (const value of candidates) {
        if (membership.has(value)) {
          retained = retained.conj(value);
        }
      }
      result = retained.count === result.count ? result : retained;
    }
    return result;
  }
  difference(...collections) {
    let result = this;
    for (const collection of collections) {
      for (const value of collection) {
        result = result.disj(value);
      }
      if (result.count === 0) {
        return result;
      }
    }
    return result;
  }
  isSubsetOf(collection) {
    const other = asPersistentSet(collection);
    if (this.count > other.count) {
      return false;
    }
    for (const value of this) {
      if (!other.has(value)) {
        return false;
      }
    }
    return true;
  }
  isSupersetOf(collection) {
    return asPersistentSet(collection).isSubsetOf(this);
  }
  isDisjointFrom(collection) {
    const other = asPersistentSet(collection);
    const candidates = this.count <= other.count ? this : other;
    const membership = candidates === this ? other : this;
    for (const value of candidates) {
      if (membership.has(value)) {
        return false;
      }
    }
    return true;
  }
  values() {
    return this[SET_STATE].map.keys();
  }
  keys() {
    return this.values();
  }
  *entries() {
    for (const value of this) {
      yield Object.freeze([value, value]);
    }
  }
  reduce(reducer, initial) {
    if (typeof reducer !== "function") {
      throw new TypeError("persistent hash set reducer must be a function");
    }
    if (arguments.length < 2) {
      throw new TypeError("persistent hash set reduce requires an initial value");
    }
    let result = initial;
    for (const value of this) {
      result = reducer(result, value, this);
    }
    return result;
  }
  [COLLECTION_COUNT]() {
    return this.count;
  }
  [COLLECTION_EMPTY]() {
    return emptySetWithMetadata(this[SET_STATE].metadata);
  }
  [COLLECTION_CONJ](value) {
    return this.conj(value);
  }
  [COLLECTION_DISJ](value) {
    return this.disj(value);
  }
  [COLLECTION_GET](value, notFound = null) {
    return this.has(value) ? value : notFound;
  }
  [COLLECTION_CONTAINS](value) {
    return this.has(value);
  }
  [COLLECTION_SEQ]() {
    return this.count === 0 ? null : sequenceView(() => this.values(), this.count);
  }
  [COLLECTION_REDUCE](reducer, ...initial) {
    return reduceIterable(this, reducer, ...initial);
  }
  [EDITABLE_TRANSIENT]() {
    return makeTransientSet(this);
  }
  toSet() {
    return new Set(this);
  }
  [PERSISTENT_SET_HAS_VALUE](value) {
    return this.has(value);
  }
  get [PERSISTENT_SET_KIND]() {
    return true;
  }
  [VALUE_EQUAL](other, equal) {
    return persistentSetValueEqual(this, other, equal);
  }
  [VALUE_HASH](hash) {
    return unorderedCollectionHash(this, hash, SET_HASH_TAG);
  }
  [METADATA_READ]() {
    return this[SET_STATE].metadata;
  }
  [METADATA_WITH](metadata) {
    const state = this[SET_STATE];
    return metadata === state.metadata ? this : makeSet(state.map, metadata);
  }
  [Symbol.iterator]() {
    return this.values();
  }
  get [Symbol.toStringTag]() {
    return "EliscriptPersistentHashSet";
  }
}
var EMPTY_SET = makeSet(EMPTY_MAP);

// runtime/core/identifier.mjs
var VALUE_TYPE = Symbol.for("eliscript.value.type");
var KEYWORD_TYPE = "keyword";
var SYMBOL_TYPE = "symbol";
var KEYWORD_HASH_TAG = 795685287;
var SYMBOL_HASH_TAG = 1908952723;
var UNQUALIFIED_HASH = 1251063421;
var KEYWORD_TOKEN = Object.freeze({});
var SYMBOL_TOKEN = Object.freeze({});
var keywordState = new WeakMap;
var symbolState = new WeakMap;
var keywordInterns = new Map;
function logicalType(value) {
  if ((typeof value !== "object" || value === null) && typeof value !== "function") {
    return null;
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, VALUE_TYPE);
    return descriptor !== undefined && "value" in descriptor ? descriptor.value : null;
  } catch {
    return null;
  }
}
function normalizePart(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  if (value.includes("/")) {
    throw new TypeError(`${label} cannot contain /`);
  }
  return value;
}
function splitQualified(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${label} must be a non-empty string`);
  }
  const separator = value.indexOf("/");
  if (separator === -1) {
    return { namespace: null, name: value };
  }
  if (separator === 0 || separator === value.length - 1 || value.indexOf("/", separator + 1) !== -1) {
    throw new TypeError(`${label} must be name or namespace/name`);
  }
  return {
    namespace: value.slice(0, separator),
    name: value.slice(separator + 1)
  };
}
function normalizeArguments(arguments_, type, predicate) {
  if (arguments_.length === 1) {
    const value = arguments_[0];
    if (predicate(value)) {
      return {
        existing: value,
        namespace: identifierNamespace(value),
        name: identifierName(value)
      };
    }
    return { existing: null, ...splitQualified(value, `${type} name`) };
  }
  if (arguments_.length === 2) {
    const [namespace, name] = arguments_;
    if (namespace !== null) {
      normalizePart(namespace, `${type} namespace`);
    }
    return {
      existing: null,
      namespace,
      name: normalizePart(name, `${type} name`)
    };
  }
  throw new TypeError(`${type} expects one qualified name or namespace and name`);
}
function qualifiedName(state) {
  return state.namespace === null ? state.name : `${state.namespace}/${state.name}`;
}
function identifierHash(tag, state) {
  const namespaceHash = state.namespace === null ? UNQUALIFIED_HASH : hashString(state.namespace);
  return finishHash(mixHash(mixHash(tag, namespaceHash), hashString(state.name)), 2);
}
function defineIdentifier(instance, type, state, table) {
  table.set(instance, state);
  Object.defineProperty(instance, VALUE_TYPE, {
    value: type,
    enumerable: false
  });
  Object.freeze(instance);
}
function equalIdentifier(leftType, leftState, right) {
  if (logicalType(right) !== leftType) {
    return false;
  }
  try {
    return identifierNamespace(right) === leftState.namespace && identifierName(right) === leftState.name;
  } catch {
    return false;
  }
}

class Keyword {
  constructor(token, namespace, name) {
    if (token !== KEYWORD_TOKEN) {
      throw new TypeError("Keyword values must be created with keyword()");
    }
    defineIdentifier(this, KEYWORD_TYPE, { namespace, name }, keywordState);
  }
  get name() {
    return keywordState.get(this).name;
  }
  get namespace() {
    return keywordState.get(this).namespace;
  }
  get qualifiedName() {
    return qualifiedName(keywordState.get(this));
  }
  toString() {
    return `:${this.qualifiedName}`;
  }
  toJSON() {
    throw new TypeError("Keyword values require an explicit serialization codec");
  }
  [VALUE_EQUAL](other) {
    return equalIdentifier(KEYWORD_TYPE, keywordState.get(this), other);
  }
  [VALUE_HASH]() {
    return identifierHash(KEYWORD_HASH_TAG, keywordState.get(this));
  }
  get [Symbol.toStringTag]() {
    return "EliscriptKeyword";
  }
}

class EliscriptSymbol {
  constructor(token, namespace, name, metadata = null) {
    if (token !== SYMBOL_TOKEN) {
      throw new TypeError("EliscriptSymbol values must be created with eliscriptSymbol()");
    }
    defineIdentifier(this, SYMBOL_TYPE, { namespace, name, metadata }, symbolState);
  }
  get name() {
    return symbolState.get(this).name;
  }
  get namespace() {
    return symbolState.get(this).namespace;
  }
  get qualifiedName() {
    return qualifiedName(symbolState.get(this));
  }
  toString() {
    return this.qualifiedName;
  }
  toJSON() {
    throw new TypeError("EliscriptSymbol values require an explicit serialization codec");
  }
  [VALUE_EQUAL](other) {
    return equalIdentifier(SYMBOL_TYPE, symbolState.get(this), other);
  }
  [VALUE_HASH]() {
    return identifierHash(SYMBOL_HASH_TAG, symbolState.get(this));
  }
  [METADATA_READ]() {
    return symbolState.get(this).metadata;
  }
  [METADATA_WITH](metadata) {
    const state = symbolState.get(this);
    return metadata === state.metadata ? this : new EliscriptSymbol(SYMBOL_TOKEN, state.namespace, state.name, metadata);
  }
  get [Symbol.toStringTag]() {
    return "EliscriptSymbol";
  }
}
function keyword(...arguments_) {
  const normalized = normalizeArguments(arguments_, KEYWORD_TYPE, isKeyword);
  if (normalized.existing !== null) {
    return normalized.existing;
  }
  const key = normalized.namespace === null ? normalized.name : `${normalized.namespace}/${normalized.name}`;
  const existing = keywordInterns.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const result = new Keyword(KEYWORD_TOKEN, normalized.namespace, normalized.name);
  keywordInterns.set(key, result);
  return result;
}
function isKeyword(value) {
  return logicalType(value) === KEYWORD_TYPE;
}
function isEliscriptSymbol(value) {
  return logicalType(value) === SYMBOL_TYPE;
}
function isIdentifier(value) {
  return isKeyword(value) || isEliscriptSymbol(value);
}
function identifierName(value) {
  if (!isIdentifier(value)) {
    throw new TypeError("expected an Eliscript keyword or symbol");
  }
  const name = value.name;
  if (typeof name !== "string" || name.length === 0 || name.includes("/")) {
    throw new TypeError("expected an Eliscript keyword or symbol");
  }
  return name;
}
function identifierNamespace(value) {
  if (!isIdentifier(value)) {
    throw new TypeError("expected an Eliscript keyword or symbol");
  }
  const namespace = value.namespace;
  if (namespace !== null && (typeof namespace !== "string" || namespace.length === 0 || namespace.includes("/"))) {
    throw new TypeError("expected an Eliscript keyword or symbol");
  }
  return namespace;
}
function qualifiedIdentifierName(value) {
  const namespace = identifierNamespace(value);
  const name = identifierName(value);
  return namespace === null ? name : `${namespace}/${name}`;
}
// runtime/literals.mjs
function vector(...values) {
  return persistentVector(...values);
}
function hashMap(...keyValues) {
  if (keyValues.length % 2 !== 0) {
    throw new TypeError("hash-map expects complete key/value pairs");
  }
  const entries = [];
  for (let index = 0;index < keyValues.length; index += 2) {
    entries.push([keyValues[index], keyValues[index + 1]]);
  }
  return persistentHashMap(...entries);
}

// runtime/core/record.mjs
var MAX_FIELDS = 1024;
var RECORD_CONSTRUCTOR_TOKEN = Symbol("eliscript.record.constructor-token");
var RECORD_STATE = Symbol("eliscript.record.state");
var RECORD_HASH_TAG = 1300474159;
var recordTypes = new WeakSet;
function fail(message) {
  throw new TypeError(message);
}
function normalizeTypeName(name) {
  if (typeof name !== "string" || name.length === 0) {
    fail("record type name must be a non-empty string");
  }
  return name;
}
function normalizeFieldNames(fields) {
  if (!Array.isArray(fields) || fields.length > MAX_FIELDS) {
    fail(`record fields must be a dense array of at most ${MAX_FIELDS} names`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(fields);
  if (Reflect.ownKeys(descriptors).length !== fields.length + 1) {
    fail("record fields must be a dense array with no extra properties");
  }
  const seen = new Set;
  const result = [];
  for (let index = 0;index < fields.length; index += 1) {
    const descriptor = descriptors[String(index)];
    const field = descriptor?.value;
    if (!descriptor?.enumerable || typeof field !== "string" || field.length === 0 || field.includes("/")) {
      fail("record field names must be non-empty unqualified strings");
    }
    if (seen.has(field)) {
      fail(`record declares duplicate field ${field}`);
    }
    seen.add(field);
    result.push(field);
  }
  return Object.freeze(result);
}
function declaredFieldIndex(typeState, key) {
  if (!isKeyword(key) || identifierNamespace(key) !== null)
    return -1;
  return typeState.fieldIndexes.get(identifierName(key)) ?? -1;
}
function mapWithMetadata(map, metadata) {
  return metadata === null ? map : map[METADATA_WITH](metadata);
}
function defineFieldAccessors(RecordValue, typeState) {
  for (let index = 0;index < typeState.fieldNames.length; index += 1) {
    const fieldName = typeState.fieldNames[index];
    if (fieldName in RecordValue.prototype) {
      fail(`record field ${fieldName} conflicts with a record member`);
    }
    const fieldKey = typeState.fieldKeys[index];
    Object.defineProperty(RecordValue.prototype, fieldName, {
      configurable: false,
      enumerable: true,
      get() {
        return this[RECORD_STATE].map.get(fieldKey);
      }
    });
  }
}
function makeInitialMap(typeState, values) {
  let map = EMPTY_MAP;
  for (let index = 0;index < values.length; index += 1) {
    map = map.assoc(typeState.fieldKeys[index], values[index]);
  }
  return map;
}
function normalizeSourceMap(typeState, source) {
  let map;
  try {
    map = PersistentHashMap.from(source);
  } catch (error) {
    throw new TypeError(`map->${typeState.name} expects an iterable collection of entries`, { cause: error });
  }
  for (const fieldKey of typeState.fieldKeys) {
    if (!map.has(fieldKey))
      map = map.assoc(fieldKey, null);
  }
  return map;
}
function defineRecordType(name, fields) {
  const typeName = normalizeTypeName(name);
  const fieldNames = normalizeFieldNames(fields);
  const fieldKeys = Object.freeze(fieldNames.map((field) => keyword(field)));
  const fieldIndexes = new Map(fieldNames.map((field, index) => [field, index]));
  const typeState = Object.freeze({
    name: typeName,
    fieldNames,
    fieldKeys,
    fieldIndexes,
    signature: `${typeName}[${fieldNames.join(",")}]`
  });

  class RecordValue {
    constructor(token, map, metadata = null) {
      if (token !== RECORD_CONSTRUCTOR_TOKEN || !(map instanceof PersistentHashMap)) {
        fail(`${typeName} values must be created with its record constructors`);
      }
      this[RECORD_STATE] = Object.freeze({ map, metadata });
      Object.freeze(this);
    }
    static create(...values) {
      if (values.length !== fieldNames.length) {
        fail(`->${typeName} expects ${fieldNames.length} values, received ${values.length}`);
      }
      return new RecordValue(RECORD_CONSTRUCTOR_TOKEN, makeInitialMap(typeState, values));
    }
    static fromMap(source) {
      return new RecordValue(RECORD_CONSTRUCTOR_TOKEN, normalizeSourceMap(typeState, source));
    }
    static isInstance(value) {
      return value instanceof RecordValue;
    }
    get count() {
      return this[RECORD_STATE].map.count;
    }
    get size() {
      return this.count;
    }
    get(key, notFound = null) {
      return this[RECORD_STATE].map.get(key, notFound);
    }
    has(key) {
      return this[RECORD_STATE].map.has(key);
    }
    assoc(key, value) {
      const state = this[RECORD_STATE];
      const map = state.map.assoc(key, value);
      return map === state.map ? this : new RecordValue(RECORD_CONSTRUCTOR_TOKEN, map, state.metadata);
    }
    dissoc(key) {
      const state = this[RECORD_STATE];
      if (declaredFieldIndex(typeState, key) >= 0) {
        return mapWithMetadata(state.map.dissoc(key), state.metadata);
      }
      const map = state.map.dissoc(key);
      return map === state.map ? this : new RecordValue(RECORD_CONSTRUCTOR_TOKEN, map, state.metadata);
    }
    entries() {
      return this[RECORD_STATE].map.entries();
    }
    keys() {
      return this[RECORD_STATE].map.keys();
    }
    values() {
      return this[RECORD_STATE].map.values();
    }
    toPersistentMap() {
      return mapWithMetadata(this[RECORD_STATE].map, this[RECORD_STATE].metadata);
    }
    [COLLECTION_COUNT]() {
      return this.count;
    }
    [COLLECTION_EMPTY]() {
      return mapWithMetadata(EMPTY_MAP, this[RECORD_STATE].metadata);
    }
    [COLLECTION_CONJ](entry) {
      const [key, value] = readCollectionEntry(entry);
      return this.assoc(key, value);
    }
    [COLLECTION_GET](key, notFound = null) {
      return this.get(key, notFound);
    }
    [COLLECTION_ASSOC](key, value) {
      return this.assoc(key, value);
    }
    [COLLECTION_CONTAINS](key) {
      return this.has(key);
    }
    [COLLECTION_DISSOC](key) {
      return this.dissoc(key);
    }
    [COLLECTION_SEQ]() {
      return this.count === 0 ? null : sequenceView(() => this.entries(), this.count);
    }
    [COLLECTION_REDUCE](reducer, ...initial) {
      return reduceIterable(this, reducer, ...initial);
    }
    [COLLECTION_REDUCE_KV](reducer, initial) {
      let result = initial;
      for (const [key, value] of this.entries()) {
        result = reducer(result, key, value);
        if (isReducedValue(result))
          return unreducedValue(result);
      }
      return result;
    }
    [VALUE_EQUAL](other, equal) {
      return other instanceof RecordValue && equal(this[RECORD_STATE].map, other[RECORD_STATE].map);
    }
    [VALUE_HASH](hash) {
      return finishHash(mixHash(mixHash(RECORD_HASH_TAG, hashString(typeState.signature)), hash(this[RECORD_STATE].map)), this.count);
    }
    [METADATA_READ]() {
      return this[RECORD_STATE].metadata;
    }
    [METADATA_WITH](metadata) {
      const state = this[RECORD_STATE];
      return metadata === state.metadata ? this : new RecordValue(RECORD_CONSTRUCTOR_TOKEN, state.map, metadata);
    }
    [Symbol.iterator]() {
      return this.entries();
    }
    get [Symbol.toStringTag]() {
      return `EliscriptRecord:${typeName}`;
    }
  }
  Object.defineProperty(RecordValue, "name", { value: typeName });
  Object.defineProperties(RecordValue, {
    recordName: { enumerable: true, value: typeName },
    recordFields: { enumerable: true, value: fieldNames }
  });
  defineFieldAccessors(RecordValue, typeState);
  Object.freeze(RecordValue.prototype);
  Object.freeze(RecordValue);
  recordTypes.add(RecordValue);
  return RecordValue;
}
function isRecordType(value) {
  return typeof value === "function" && recordTypes.has(value);
}
function isRecord(value) {
  return value !== null && typeof value === "object" && isRecordType(value.constructor);
}

// runtime/core/collection.mjs
var MISSING3 = Symbol("eliscript.collection.missing");
function indexedValue(values, index, notFound = MISSING3) {
  if (Number.isInteger(index) && index >= 0 && index < values.length) {
    return values[index];
  }
  if (notFound !== MISSING3) {
    return notFound;
  }
  throw new RangeError(`nth index ${String(index)} is outside collection bounds`);
}
function indexedAssoc(values, index, value) {
  if (!Number.isInteger(index) || index < 0 || index > values.length) {
    throw new RangeError(`assoc index ${String(index)} is outside collection bounds`);
  }
  const result = values.slice();
  result[index] = value;
  return result;
}
function indexedContains(values, index) {
  return Number.isInteger(index) && index >= 0 && index < values.length;
}
function mapConj(values, entry) {
  const [key, value] = readCollectionEntry(entry);
  const result = new Map(values);
  result.set(key, value);
  return result;
}
function mapAssoc2(values, key, value) {
  const result = new Map(values);
  result.set(key, value);
  return result;
}
function mapDissoc2(values, key) {
  const result = new Map(values);
  result.delete(key);
  return result;
}
function setConj(values, value) {
  const result = new Set(values);
  result.add(value);
  return result;
}
function setDisj(values, value) {
  const result = new Set(values);
  result.delete(value);
  return result;
}
function objectAssoc(values, key, value) {
  if (typeof key !== "string") {
    throw new TypeError("plain object association keys must be strings");
  }
  return { ...values, [key]: value };
}
function objectConj(values, entry) {
  const [key, value] = readCollectionEntry(entry);
  return objectAssoc(values, key, value);
}
function objectDissoc(values, key) {
  if (typeof key !== "string") {
    throw new TypeError("plain object dissociation keys must be strings");
  }
  const result = { ...values };
  delete result[key];
  return result;
}
function arrayPeek(values) {
  return values.length === 0 ? null : values[values.length - 1];
}
function arrayPop(values) {
  if (values.length === 0) {
    throw new RangeError("cannot pop an empty array");
  }
  return values.slice(0, -1);
}
function indexedReverseSequence(values) {
  return values.length === 0 ? null : sequenceView(() => {
    let index = values.length;
    return {
      next() {
        if (index === 0)
          return { value: undefined, done: true };
        index -= 1;
        return { value: values[index], done: false };
      }
    };
  }, () => values.length);
}
function arraySequence(values) {
  return values.length === 0 ? null : sequenceView(() => values[Symbol.iterator](), () => values.length);
}
function mapSequence(values) {
  if (values.size === 0) {
    return null;
  }
  return sequenceView(() => function* entries() {
    for (const entry of values) {
      yield Object.freeze([entry[0], entry[1]]);
    }
  }(), () => values.size);
}
function setSequence(values) {
  return values.size === 0 ? null : sequenceView(() => values[Symbol.iterator](), () => values.size);
}
function stringSequence(value) {
  return value.length === 0 ? null : sequenceView(() => function* codeUnits() {
    for (let index = 0;index < value.length; index += 1) {
      yield value[index];
    }
  }(), () => value.length);
}
function objectSequence(value) {
  const keys = Object.keys(value);
  return keys.length === 0 ? null : sequenceView(() => function* entries() {
    for (const key of Object.keys(value)) {
      yield Object.freeze([key, value[key]]);
    }
  }(), () => Object.keys(value).length);
}
function reduceIndexedValues(values, reducer, initial) {
  let result = initial;
  for (let index = 0;index < values.length; index += 1) {
    result = reducer(result, index, values[index]);
    if (isReducedValue(result))
      return unreducedValue(result);
  }
  return result;
}
function reduceMapValues(values, reducer, initial) {
  let result = initial;
  for (const [key, value] of values) {
    result = reducer(result, key, value);
    if (isReducedValue(result))
      return unreducedValue(result);
  }
  return result;
}
function reduceObjectValues(value, reducer, initial) {
  let result = initial;
  for (const key of Object.keys(value)) {
    result = reducer(result, key, value[key]);
    if (isReducedValue(result))
      return unreducedValue(result);
  }
  return result;
}
extend_protocol_category(I_COUNTED, "string", {
  count: (value) => value.length
});
extend_protocol_category(I_EMPTYABLE, "string", { empty: () => "" });
extend_protocol_category(I_LOOKUP, "string", {
  get: (value, index, notFound = null) => indexedValue(value, index, notFound)
});
extend_protocol_category(I_INDEXED, "string", { nth: indexedValue });
extend_protocol_category(I_SEQABLE, "string", { seq: stringSequence });
extend_protocol_category(I_REDUCE, "string", {
  reduce: (value, reducer, ...initial) => reduceIterable(stringSequence(value) ?? [], reducer, ...initial)
});
extend_protocol_category(I_REVERSIBLE, "string", {
  rseq: indexedReverseSequence
});
extend_protocol_type(I_COUNTED, Object, {
  count: (value) => Object.keys(value).length
});
extend_protocol_type(I_EMPTYABLE, Object, { empty: () => ({}) });
extend_protocol_type(I_CONJ, Object, { conj: objectConj });
extend_protocol_type(I_LOOKUP, Object, {
  get: (value, key, notFound = null) => typeof key === "string" && Object.hasOwn(value, key) ? value[key] : notFound
});
extend_protocol_type(I_ASSOCIATIVE, Object, {
  assoc: objectAssoc,
  contains: (value, key) => typeof key === "string" && Object.hasOwn(value, key)
});
extend_protocol_type(I_SEQABLE, Object, { seq: objectSequence });
extend_protocol_type(I_REDUCE, Object, {
  reduce: (value, reducer, ...initial) => reduceIterable(objectSequence(value) ?? [], reducer, ...initial)
});
extend_protocol_type(I_KV_REDUCE, Object, { reduceKV: reduceObjectValues });
extend_protocol_type(I_MAP, Object, { dissoc: objectDissoc });
extend_protocol_type(I_COUNTED, Array, { count: (values) => values.length });
extend_protocol_type(I_EMPTYABLE, Array, { empty: () => [] });
extend_protocol_type(I_CONJ, Array, {
  conj: (values, value) => [...values, value]
});
extend_protocol_type(I_LOOKUP, Array, {
  get: (values, index, notFound = null) => indexedValue(values, index, notFound)
});
extend_protocol_type(I_ASSOCIATIVE, Array, {
  assoc: indexedAssoc,
  contains: indexedContains
});
extend_protocol_type(I_INDEXED, Array, { nth: indexedValue });
extend_protocol_type(I_SEQABLE, Array, { seq: arraySequence });
extend_protocol_type(I_REDUCE, Array, { reduce: reduceIterable });
extend_protocol_type(I_KV_REDUCE, Array, { reduceKV: reduceIndexedValues });
extend_protocol_type(I_STACK, Array, { peek: arrayPeek, pop: arrayPop });
extend_protocol_type(I_REVERSIBLE, Array, { rseq: indexedReverseSequence });
extend_protocol_type(I_COUNTED, Map, { count: (values) => values.size });
extend_protocol_type(I_EMPTYABLE, Map, { empty: () => new Map });
extend_protocol_type(I_CONJ, Map, { conj: mapConj });
extend_protocol_type(I_LOOKUP, Map, {
  get: (values, key, notFound = null) => values.has(key) ? values.get(key) : notFound
});
extend_protocol_type(I_ASSOCIATIVE, Map, {
  assoc: mapAssoc2,
  contains: (values, key) => values.has(key)
});
extend_protocol_type(I_SEQABLE, Map, { seq: mapSequence });
extend_protocol_type(I_REDUCE, Map, {
  reduce: (values, reducer, ...initial) => reduceIterable(mapSequence(values) ?? [], reducer, ...initial)
});
extend_protocol_type(I_KV_REDUCE, Map, { reduceKV: reduceMapValues });
extend_protocol_type(I_MAP, Map, { dissoc: mapDissoc2 });
extend_protocol_type(I_COUNTED, Set, { count: (values) => values.size });
extend_protocol_type(I_EMPTYABLE, Set, { empty: () => new Set });
extend_protocol_type(I_CONJ, Set, { conj: setConj });
extend_protocol_type(I_LOOKUP, Set, {
  get: (values, key, notFound = null) => values.has(key) ? key : notFound
});
extend_protocol_type(I_ASSOCIATIVE, Set, {
  contains: (values, key) => values.has(key)
});
extend_protocol_type(I_SEQABLE, Set, { seq: setSequence });
extend_protocol_type(I_REDUCE, Set, { reduce: reduceIterable });
extend_protocol_type(I_SET, Set, { disj: setDisj });
extend_protocol_category(I_COUNTED, "null", { count: () => 0 });
extend_protocol_category(I_EMPTYABLE, "null", { empty: () => null });
extend_protocol_category(I_SEQABLE, "null", { seq: () => null });
extend_protocol_category(I_REDUCE, "null", {
  reduce: (_value, reducer, ...initial) => reduceIterable([], reducer, ...initial)
});
extend_protocol_category(I_KV_REDUCE, "null", {
  reduceKV: (_value, _reducer, initial) => initial
});
extend_protocol_category(I_MAP, "null", { dissoc: () => null });
extend_protocol_category(I_SET, "null", { disj: () => null });
extend_protocol_category(I_STACK, "null", { peek: () => null, pop: () => null });
extend_protocol_category(I_REVERSIBLE, "null", { rseq: () => null });
function count(collection) {
  return validateCollectionCount(dispatchCollectionCount(collection));
}
function isVector(value) {
  return isPersistentVector(value);
}
function isMap(value) {
  return isPersistentMapValue(value) || isRecord(value);
}
function empty(collection) {
  return dispatchCollectionEmpty(collection);
}
function conj(collection, ...values) {
  let result = collection;
  for (const value of values) {
    result = dispatchCollectionConj(result, value);
  }
  return result;
}
function get(collection, key, notFound = null) {
  return dispatchCollectionGet(collection, key, notFound);
}
function assoc(collection, key, value, ...keyValues) {
  if (arguments.length < 3 || keyValues.length % 2 !== 0) {
    throw new TypeError("assoc requires a collection followed by one or more key/value pairs");
  }
  let result = dispatchCollectionAssoc(collection, key, value);
  for (let index = 0;index < keyValues.length; index += 2) {
    result = dispatchCollectionAssoc(result, keyValues[index], keyValues[index + 1]);
  }
  return result;
}
function nth(collection, index, ...notFound) {
  return notFound.length === 0 ? dispatchCollectionNth(collection, index) : dispatchCollectionNth(collection, index, notFound[0]);
}
function reduce(collection, reducer, ...initial) {
  if (typeof reducer !== "function") {
    throw new TypeError("collection reducer must be a function");
  }
  return unreducedValue(initial.length === 0 ? dispatchCollectionReduce(collection, reducer) : dispatchCollectionReduce(collection, reducer, initial[0]));
}
function reduceKV(collection, reducer, initial) {
  if (arguments.length !== 3) {
    throw new TypeError("reduceKV requires a collection, reducer, and initial value");
  }
  if (typeof reducer !== "function") {
    throw new TypeError("key/value reducer must be a function");
  }
  return unreducedValue(dispatchCollectionReduceKV(collection, reducer, initial));
}
function reduced(value) {
  return reducedValue(value);
}
function isReduced(value) {
  return isReducedValue(value);
}
function unreduced(value) {
  return unreducedValue(value);
}

// runtime/core/transient.mjs
var IEditable = I_EDITABLE;
function transient(collection) {
  return dispatchEditableTransient(collection);
}
function conjBang(collection, ...values) {
  let result = collection;
  for (const value of values) {
    result = dispatchTransientConj(result, value);
  }
  return result;
}
function persistentBang(collection) {
  return dispatchTransientPersistent(collection);
}

// runtime/core/truth.mjs
function isTruthy(value) {
  return value !== false && value != null;
}

// runtime/core/transducer.mjs
var REDUCING_FUNCTION = Symbol("eliscript.transducer.reducing-function");
var ZERO_INPUT = Symbol("eliscript.transducer.zero-input");
var NO_PREVIOUS_VALUE = Symbol("eliscript.transducer.no-previous-value");
var NO_PARTITION_KEY = Symbol("eliscript.transducer.no-partition-key");
var NO_REDUCTION_INITIAL = Symbol("eliscript.transducer.no-reduction-initial");
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
  return asReducingFunction(transducer(reducingFunction), "transducer result");
}
var IDENTITY_TRANSDUCER = makeTransducer((reducingFunction) => reducingFunction);
function completing(step, complete = identity) {
  requireFunction(step, "reducing step");
  requireFunction(complete, "reducing completion");
  const reducingFunction = (...arguments_) => {
    if (arguments_.length === 1) {
      return complete(arguments_[0]);
    }
    if (arguments_.length === 2) {
      return step(arguments_[0], arguments_[1]);
    }
    throw new TypeError("reducing functions accept one completion argument or two step arguments");
  };
  Object.defineProperty(reducingFunction, REDUCING_FUNCTION, { value: true });
  return Object.freeze(reducingFunction);
}
function mapping(transform) {
  requireFunction(transform, "mapping transform");
  return makeTransducer((reducingFunction) => {
    const downstream = asReducingFunction(reducingFunction, "mapping reducing function");
    return completing((result, input) => downstream(result, transform(input)), (result) => downstream(result));
  });
}
function filtering(predicate) {
  requireFunction(predicate, "filtering predicate");
  return makeTransducer((reducingFunction) => {
    const downstream = asReducingFunction(reducingFunction, "filtering reducing function");
    return completing((result, input) => isTruthy(predicate(input)) ? downstream(result, input) : result, (result) => downstream(result));
  });
}
function taking(limit) {
  if (!Number.isSafeInteger(limit) || limit < 0) {
    throw new TypeError("taking limit must be a non-negative safe integer");
  }
  return makeTransducer((reducingFunction) => {
    const downstream = asReducingFunction(reducingFunction, "taking reducing function");
    let remaining = limit;
    return completing((result, input) => {
      if (remaining === 0) {
        return reduced(result);
      }
      remaining -= 1;
      const stepped = downstream(result, input);
      return remaining === 0 && !isReduced(stepped) ? reduced(stepped) : stepped;
    }, (result) => downstream(result));
  }, limit === 0);
}
function transduce(transducer, reducer, initial, collection) {
  if (arguments.length !== 4) {
    throw new TypeError("transduce requires a transducer, reducer, initial value, and collection");
  }
  const transformed = applyTransducer(transducer, asReducingFunction(reducer, "transduce reducer"));
  const seed = unreduced(initial);
  const result = transducer[ZERO_INPUT] === true ? seed : reduce(collection, transformed, seed);
  return unreduced(transformed(unreduced(result)));
}
function into(target, ...arguments_) {
  if (arguments_.length !== 1 && arguments_.length !== 2) {
    throw new TypeError("into requires a target and source, or a target, transducer, and source");
  }
  const transducer = arguments_.length === 1 ? IDENTITY_TRANSDUCER : arguments_[0];
  const source = arguments_.length === 1 ? arguments_[0] : arguments_[1];
  const seed = empty(target);
  if (implements_protocol_operation_QMARK_(IEditable, "transient", seed)) {
    return transduce(transducer, completing((result, value) => conjBang(result, value), (result) => persistentBang(result)), transient(seed), source);
  }
  return transduce(transducer, (result, value) => conj(result, value), seed, source);
}

// runtime/core/sequence.mjs
var NOT_FOUND = Symbol("eliscript.sequence.not-found");
var NO_PARTITION_PAD = Symbol("eliscript.sequence.no-partition-pad");
function map(transform, collection) {
  return into(EMPTY_VECTOR, mapping(transform), collection);
}
function filter(predicate, collection) {
  return into(EMPTY_VECTOR, filtering(predicate), collection);
}
function take(limit, collection) {
  return into(EMPTY_VECTOR, taking(limit), collection);
}

// examples/dogfood/dist/src/builder/main.mjs
var import_node_crypto = require("node:crypto");
var import_node_fs3 = require("node:fs");
var Path2 = __toESM(require("node:path"));

// runtime/core/order.mjs
var IComparable = define_protocol("IComparable", ["compare"]);
var dispatchCompare = protocol_method(IComparable, "compare");
function requireFunction2(value, label) {
  if (typeof value !== "function") {
    throw new TypeError(`${label} must be a function`);
  }
  return value;
}
function comparisonResult(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must return a finite number`);
  }
  return value < 0 ? -1 : value > 0 ? 1 : 0;
}
function typeName(value) {
  if (value === null)
    return "null";
  if (value === undefined)
    return "undefined";
  if (value instanceof Keyword)
    return "keyword";
  if (value instanceof EliscriptSymbol)
    return "symbol";
  if (value instanceof PersistentVector)
    return "vector";
  if (value instanceof PersistentList)
    return "list";
  return typeof value;
}
function requireComparableType(right, predicate, leftName) {
  if (!predicate(right)) {
    throw new TypeError(`cannot compare ${leftName} to ${typeName(right)}`);
  }
  return right;
}
function comparePrimitive(left, right, predicate, name) {
  requireComparableType(right, predicate, name);
  return left < right ? -1 : left > right ? 1 : 0;
}
function compareNumber(left, right) {
  requireComparableType(right, (value) => typeof value === "number", "number");
  if (Number.isNaN(left))
    return Number.isNaN(right) ? 0 : 1;
  if (Number.isNaN(right))
    return -1;
  return left < right ? -1 : left > right ? 1 : 0;
}
function compareIdentifier(left, right, Constructor, name) {
  requireComparableType(right, (value) => value instanceof Constructor, name);
  return comparePrimitive(qualifiedIdentifierName(left), qualifiedIdentifierName(right), (value) => typeof value === "string", "string");
}
function compareSequential(left, right, Constructor, name) {
  requireComparableType(right, (value) => value instanceof Constructor, name);
  const leftIterator = left[Symbol.iterator]();
  const rightIterator = right[Symbol.iterator]();
  while (true) {
    const leftItem = leftIterator.next();
    const rightItem = rightIterator.next();
    if (leftItem.done || rightItem.done) {
      return leftItem.done === rightItem.done ? 0 : leftItem.done ? -1 : 1;
    }
    const result = compareValues(leftItem.value, rightItem.value);
    if (result !== 0)
      return result;
  }
}
extend_protocol_category(IComparable, "boolean", {
  compare: (left, right) => comparePrimitive(left, right, (value) => typeof value === "boolean", "boolean")
});
extend_protocol_category(IComparable, "number", { compare: compareNumber });
extend_protocol_category(IComparable, "bigint", {
  compare: (left, right) => comparePrimitive(left, right, (value) => typeof value === "bigint", "bigint")
});
extend_protocol_category(IComparable, "string", {
  compare: (left, right) => comparePrimitive(left, right, (value) => typeof value === "string", "string")
});
extend_protocol_type(IComparable, Keyword, {
  compare: (left, right) => compareIdentifier(left, right, Keyword, "keyword")
});
extend_protocol_type(IComparable, EliscriptSymbol, {
  compare: (left, right) => compareIdentifier(left, right, EliscriptSymbol, "symbol")
});
extend_protocol_type(IComparable, PersistentVector, {
  compare: (left, right) => compareSequential(left, right, PersistentVector, "vector")
});
extend_protocol_type(IComparable, PersistentList, {
  compare: (left, right) => compareSequential(left, right, PersistentList, "list")
});
function compareValues(left, right) {
  if (left === right || Number.isNaN(left) && Number.isNaN(right))
    return 0;
  if (left === null)
    return -1;
  if (right === null)
    return 1;
  if (left === undefined)
    return -1;
  if (right === undefined)
    return 1;
  return comparisonResult(dispatchCompare(left, right), "IComparable/compare");
}
function comparator(comparison) {
  requireFunction2(comparison, "comparator comparison");
  return (left, right) => {
    const result = comparison(left, right);
    if (typeof result === "number") {
      return comparisonResult(result, "comparator comparison");
    }
    if (isTruthy(result))
      return -1;
    return isTruthy(comparison(right, left)) ? 1 : 0;
  };
}
function sortDecorated(values, comparison) {
  values.sort((left, right) => comparison(left.key, right.key) || left.index - right.index);
  return into(EMPTY_VECTOR, values.map(({ value }) => value));
}
function collectDecorated(collection, keyFunction) {
  const values = [];
  reduce(collection, (result, value) => {
    result.push({ index: result.length, key: keyFunction(value), value });
    return result;
  }, values);
  return values;
}
function sort(...arguments_) {
  if (arguments_.length !== 1 && arguments_.length !== 2) {
    throw new TypeError("sort expects a collection or comparator and collection");
  }
  const comparison = arguments_.length === 1 ? compareValues : arguments_[0];
  const collection = arguments_[arguments_.length - 1];
  return sortDecorated(collectDecorated(collection, (value) => value), comparator(comparison));
}

// runtime/core/text-impl.mjs
var __eliscript_truthy2 = (value) => value !== false && value != null;
function empty_QMARK_(text) {
  return count(text) === 0;
}
function slice(start, end, text) {
  {
    const __eliscript_value_1 = "";
    const __eliscript_value_2 = start < 0 ? 0 : start;
    const __eliscript_value_3 = end > count(text) ? count(text) : end;
    {
      let result = __eliscript_value_1;
      let index = __eliscript_value_2;
      let limit = __eliscript_value_3;
      while (index < limit) {
        result = String(result) + String(nth(text, index)), index = index + 1;
      }
      return result;
    }
  }
}
function starts_at_QMARK_(prefix, offset, text) {
  {
    const __eliscript_value_4 = offset >= 0 && offset + count(prefix) <= count(text);
    const __eliscript_value_5 = 0;
    {
      let matched = __eliscript_value_4;
      let index = __eliscript_value_5;
      while (__eliscript_truthy2(((__eliscript_value_6) => __eliscript_truthy2(__eliscript_value_6) ? index < count(prefix) : __eliscript_value_6)(matched))) {
        !(nth(prefix, index) === nth(text, offset + index)) && (matched = false);
        index = index + 1;
      }
      return matched;
    }
  }
}
function starts_with_QMARK_(prefix, text) {
  return starts_at_QMARK_(prefix, 0, text);
}
function ends_with_QMARK_(suffix, text) {
  return starts_at_QMARK_(suffix, count(text) - count(suffix), text);
}
function contains_QMARK_(needle, text) {
  {
    const __eliscript_value_7 = false;
    const __eliscript_value_8 = 0;
    const __eliscript_value_9 = count(text) - count(needle);
    {
      let found = __eliscript_value_7;
      let offset = __eliscript_value_8;
      let last_offset = __eliscript_value_9;
      while (!__eliscript_truthy2(found) && offset <= last_offset) {
        __eliscript_truthy2(starts_at_QMARK_(needle, offset, text)) && (found = true);
        offset = offset + 1;
      }
      return found;
    }
  }
}
function strip_prefix(prefix, text) {
  return __eliscript_truthy2(starts_with_QMARK_(prefix, text)) ? slice(count(prefix), count(text), text) : text;
}
function whitespace_QMARK_(character) {
  return character === " " || character === "\t" || character === `
` || character === "\r";
}
function trim(text) {
  {
    const __eliscript_value_10 = 0;
    const __eliscript_value_11 = count(text) - 1;
    {
      let start = __eliscript_value_10;
      let end = __eliscript_value_11;
      while (__eliscript_truthy2(((__eliscript_value_12) => __eliscript_truthy2(__eliscript_value_12) ? whitespace_QMARK_(nth(text, start)) : __eliscript_value_12)(start <= end))) {
        start = start + 1;
      }
      while (__eliscript_truthy2(((__eliscript_value_13) => __eliscript_truthy2(__eliscript_value_13) ? whitespace_QMARK_(nth(text, end)) : __eliscript_value_13)(end >= start))) {
        end = end - 1;
      }
      return slice(start, end + 1, text);
    }
  }
}
function blank_QMARK_(text) {
  return empty_QMARK_(trim(text));
}
function join(separator, values) {
  return reduce(values, (state, value) => {
    return { first: false, text: String(state["text"]) + String(__eliscript_truthy2(state["first"]) ? "" : separator) + String(value) };
  }, { first: true, text: "" })["text"];
}
// examples/dogfood/dist/src/support/text.mjs
var __eliscript_truthy3 = (value) => value !== false && value != null;
var __eliscript_to_number = (value) => {
  if (typeof value === "string") {
    const text = value.trim();
    if (/^(?:0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+)$/.test(text))
      return Number(BigInt(text));
  }
  return Number(value);
};
function text_length(text) {
  return count(text);
}
function empty_value_QMARK_(value) {
  return ((__eliscript_value_1) => __eliscript_truthy3(__eliscript_value_1) ? __eliscript_value_1 : ((__eliscript_value_2) => __eliscript_truthy3(__eliscript_value_2) ? __eliscript_value_2 : ((__eliscript_value_3) => __eliscript_truthy3(__eliscript_value_3) ? blank_QMARK_(value) : __eliscript_value_3)(((__eliscript_value) => {
    if (__eliscript_value === null)
      return "null";
    const __eliscript_host_type = typeof __eliscript_value;
    if (__eliscript_host_type !== "object" && __eliscript_host_type !== "function")
      return __eliscript_host_type;
    try {
      const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for("eliscript.value.type"));
      if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, "value") && (__eliscript_type.value === "keyword" || __eliscript_type.value === "symbol"))
        return __eliscript_type.value;
      const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, "kind");
      if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, "value")) {
        if (__eliscript_kind.value === "eliscript/keyword")
          return "keyword";
        if (__eliscript_kind.value === "eliscript/symbol")
          return "symbol";
      }
      return __eliscript_host_type;
    } catch {
      return __eliscript_host_type;
    }
  })(value) === "string"))(value === undefined))(value === null);
}
function string_value_QMARK_(value) {
  return ((__eliscript_value) => {
    if (__eliscript_value === null)
      return "null";
    const __eliscript_host_type = typeof __eliscript_value;
    if (__eliscript_host_type !== "object" && __eliscript_host_type !== "function")
      return __eliscript_host_type;
    try {
      const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for("eliscript.value.type"));
      if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, "value") && (__eliscript_type.value === "keyword" || __eliscript_type.value === "symbol"))
        return __eliscript_type.value;
      const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, "kind");
      if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, "value")) {
        if (__eliscript_kind.value === "eliscript/keyword")
          return "keyword";
        if (__eliscript_kind.value === "eliscript/symbol")
          return "symbol";
      }
      return __eliscript_host_type;
    } catch {
      return __eliscript_host_type;
    }
  })(value) === "string";
}
function char_code(text, index) {
  return text.charCodeAt(index);
}
function upper_code_QMARK_(code) {
  return code >= 65 && code <= 90;
}
function lower_code_QMARK_(code) {
  return code >= 97 && code <= 122;
}
function digit_code_QMARK_(code) {
  return code >= 48 && code <= 57;
}
function lower_code(code) {
  return __eliscript_truthy3(upper_code_QMARK_(code)) ? code + 32 : code;
}
function to_lowercase(text) {
  {
    const __eliscript_value_4 = "";
    const __eliscript_value_5 = 0;
    {
      let result = __eliscript_value_4;
      let index = __eliscript_value_5;
      while (index < text_length(text)) {
        result = String(result) + String(String.fromCharCode(lower_code(char_code(text, index)))), index = index + 1;
      }
      return result;
    }
  }
}
function split_lines(text) {
  {
    const __eliscript_value_6 = vector();
    const __eliscript_value_7 = 0;
    const __eliscript_value_8 = 0;
    const __eliscript_value_9 = text_length(text);
    {
      let lines = __eliscript_value_6;
      let start = __eliscript_value_7;
      let index = __eliscript_value_8;
      let size = __eliscript_value_9;
      while (index < size) {
        char_code(text, index) === 10 && (lines = conj(lines, slice(start, index, text)), start = index + 1);
        index = index + 1;
      }
      return conj(lines, slice(start, size, text));
    }
  }
}
function split_on(separator, text) {
  {
    const __eliscript_value_10 = vector();
    const __eliscript_value_11 = 0;
    const __eliscript_value_12 = 0;
    const __eliscript_value_13 = text_length(text);
    const __eliscript_value_14 = text_length(separator);
    {
      let parts = __eliscript_value_10;
      let start = __eliscript_value_11;
      let index = __eliscript_value_12;
      let size = __eliscript_value_13;
      let width = __eliscript_value_14;
      while (index < size) {
        width > 0 && index + width <= size && slice(index, index + width, text) === separator ? (parts = conj(parts, slice(start, index, text)), index = index + width, start = index) : index = index + 1;
      }
      return conj(parts, slice(start, size, text));
    }
  }
}
function index_of_from(needle, text, start) {
  {
    const __eliscript_value_15 = -1;
    const __eliscript_value_16 = start;
    const __eliscript_value_17 = text_length(needle);
    const __eliscript_value_18 = text_length(text) - text_length(needle);
    {
      let found = __eliscript_value_15;
      let index = __eliscript_value_16;
      let width = __eliscript_value_17;
      let limit = __eliscript_value_18;
      while (found < 0 && index <= limit) {
        slice(index, index + width, text) === needle && (found = index);
        index = index + 1;
      }
      return found;
    }
  }
}
function index_of(needle, text) {
  return index_of_from(needle, text, 0);
}
function basename(path) {
  {
    const __eliscript_value_19 = -1;
    const __eliscript_value_20 = 0;
    {
      let last = __eliscript_value_19;
      let index = __eliscript_value_20;
      while (index < text_length(path)) {
        char_code(path, index) === 47 && (last = index);
        index = index + 1;
      }
      return last < 0 ? path : slice(last + 1, text_length(path), path);
    }
  }
}
function without_suffix(suffix, text) {
  return __eliscript_truthy3(ends_with_QMARK_(suffix, text)) ? slice(0, text_length(text) - text_length(suffix), text) : text;
}
function parse_integer(text, fallback) {
  {
    const __eliscript_value_21 = __eliscript_to_number(trim(text));
    {
      let value = __eliscript_value_21;
      return value === value ? value : fallback;
    }
  }
}
function replace_all(needle, replacement, text) {
  {
    const __eliscript_value_22 = "";
    const __eliscript_value_23 = 0;
    const __eliscript_value_24 = text_length(text);
    const __eliscript_value_25 = text_length(needle);
    {
      let result = __eliscript_value_22;
      let index = __eliscript_value_23;
      let size = __eliscript_value_24;
      let width = __eliscript_value_25;
      while (index < size) {
        width > 0 && index + width <= size && slice(index, index + width, text) === needle ? (result = String(result) + String(replacement), index = index + width) : (result = String(result) + String(String.fromCharCode(char_code(text, index))), index = index + 1);
      }
      return result;
    }
  }
}
function strip_tags(html) {
  {
    const __eliscript_value_26 = "";
    const __eliscript_value_27 = 0;
    const __eliscript_value_28 = false;
    const __eliscript_value_29 = text_length(html);
    {
      let result = __eliscript_value_26;
      let index = __eliscript_value_27;
      let in_tag = __eliscript_value_28;
      let size = __eliscript_value_29;
      while (index < size) {
        {
          const __eliscript_value_30 = char_code(html, index);
          {
            let code = __eliscript_value_30;
            code === 60 ? in_tag = true : code === 62 ? in_tag = false : !__eliscript_truthy3(in_tag) && (result = String(result) + String(String.fromCharCode(code)));
          }
        }
        index = index + 1;
      }
      return decode_entities(result);
    }
  }
}
function decode_entities(text) {
  return replace_all("&amp;", "&", replace_all("&#39;", "'", replace_all("&quot;", '"', replace_all("&gt;", ">", replace_all("&lt;", "<", text)))));
}
function slugify(text) {
  {
    const __eliscript_value_31 = to_lowercase(text);
    const __eliscript_value_32 = "";
    const __eliscript_value_33 = false;
    const __eliscript_value_34 = 0;
    {
      let lowered = __eliscript_value_31;
      let result = __eliscript_value_32;
      let pending_dash = __eliscript_value_33;
      let index = __eliscript_value_34;
      while (index < text_length(lowered)) {
        {
          const __eliscript_value_35 = char_code(lowered, index);
          {
            let code = __eliscript_value_35;
            __eliscript_truthy3(((__eliscript_value_36) => __eliscript_truthy3(__eliscript_value_36) ? __eliscript_value_36 : digit_code_QMARK_(code))(lower_code_QMARK_(code))) ? (result = String(result) + String(__eliscript_truthy3(pending_dash) ? "-" : "") + String(String.fromCharCode(code)), pending_dash = false) : pending_dash = text_length(result) > 0;
          }
        }
        index = index + 1;
      }
      return result;
    }
  }
}

// examples/dogfood/dist/src/support/sanitize.mjs
var __eliscript_truthy4 = (value) => value !== false && value != null;
var ampersand = 38;
var less_than = 60;
var greater_than = 62;
var double_quote = 34;
var single_quote = 39;
function escape_html(text) {
  {
    const __eliscript_value_1 = "";
    const __eliscript_value_2 = 0;
    {
      let result = __eliscript_value_1;
      let index = __eliscript_value_2;
      while (index < text_length(text)) {
        {
          const __eliscript_value_3 = char_code(text, index);
          {
            let code = __eliscript_value_3;
            result = String(result) + String(code === ampersand ? "&amp;" : code === less_than ? "&lt;" : code === greater_than ? "&gt;" : code === double_quote ? "&quot;" : code === single_quote ? "&#39;" : String.fromCharCode(code)), index = index + 1;
          }
        }
      }
      return result;
    }
  }
}
function safe_url_QMARK_(url) {
  {
    const __eliscript_value_4 = trim(url);
    {
      let target = __eliscript_value_4;
      return ((__eliscript_value_5) => __eliscript_truthy4(__eliscript_value_5) ? __eliscript_value_5 : ((__eliscript_value_6) => __eliscript_truthy4(__eliscript_value_6) ? __eliscript_value_6 : ((__eliscript_value_7) => __eliscript_truthy4(__eliscript_value_7) ? __eliscript_value_7 : ((__eliscript_value_8) => __eliscript_truthy4(__eliscript_value_8) ? __eliscript_value_8 : ((__eliscript_value_9) => __eliscript_truthy4(__eliscript_value_9) ? __eliscript_value_9 : !__eliscript_truthy4(contains_QMARK_(":", target)) && !__eliscript_truthy4(starts_with_QMARK_("//", target)))(((__eliscript_value_10) => __eliscript_truthy4(__eliscript_value_10) ? !__eliscript_truthy4(starts_with_QMARK_("//", target)) : __eliscript_value_10)(starts_with_QMARK_("/", target))))(starts_with_QMARK_("#", target)))(starts_with_QMARK_("mailto:", target)))(starts_with_QMARK_("http://", target)))(starts_with_QMARK_("https://", target));
    }
  }
}

// examples/dogfood/dist/src/renderer/theme.mjs
var __eliscript_truthy5 = (value) => value !== false && value != null;
var site_css = String(":root{--ink:#16181d;--paper:#fbfaf7;--muted:#5f646e;") + String("--line:#e2ded6;--accent:#2f6f4f;--fresh:#9a6b12;--error:#a32c22;") + String('--sans:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans",sans-serif;') + String('--serif:Georgia,"Songti SC","Noto Serif",serif;') + String(`--mono:ui-monospace,SFMono-Regular,Menlo,monospace}
`) + String("@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--ink:#eceae5;--paper:#14161a;") + String(`--muted:#9aa0ab;--line:#2c3037;--accent:#7fb495;--fresh:#d3a44c;--error:#e0796c}}
`) + String(`:root[data-theme=dark]{--ink:#eceae5;--paper:#14161a;--muted:#9aa0ab;--line:#2c3037;--accent:#7fb495;--fresh:#d3a44c;--error:#e0796c}
`) + String(`.theme-toggle{font:inherit;font-size:14px;color:var(--muted);background:none;border:1px solid var(--line);border-radius:8px;padding:3px 10px;cursor:pointer}
`) + String(`.theme-toggle:hover{color:var(--ink);border-color:var(--ink)}
`) + String(`.search-form{display:flex;gap:8px;align-items:center}
`) + String(`.preview-banner{margin:0;padding:8px 24px;background:var(--fresh);color:#1b1d22;font-size:14px;text-align:center}
`) + String(`.search-form input{font:inherit;font-size:15px;padding:6px 12px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink);min-width:220px}
`) + String(`*{box-sizing:border-box}
`) + String(`html{-webkit-text-size-adjust:100%}
`) + String("body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);") + String(`font-size:17px;line-height:1.6;letter-spacing:0}
`) + String(`a{color:var(--accent);text-decoration:none}
`) + String(`a:hover{text-decoration:underline}
`) + String(`.skip{position:absolute;left:-9999px}
`) + String(".skip:focus{left:12px;top:12px;background:var(--paper);padding:8px 12px;") + String(`border:1px solid var(--line);border-radius:8px;z-index:5}
`) + String(".masthead{display:flex;flex-wrap:wrap;gap:16px;align-items:baseline;") + String("justify-content:space-between;max-width:1040px;margin:0 auto;") + String(`padding:28px 24px 18px;border-bottom:1px solid var(--line)}
`) + String(`.wordmark{font-weight:650;font-size:19px;color:var(--ink)}
`) + String(`.masthead nav{display:flex;flex-wrap:wrap;gap:18px;font-size:15px;color:var(--muted)}
`) + String(`main{max-width:1040px;margin:0 auto;padding:36px 24px 72px}
`) + String(`.article{max-width:44rem}
`) + String(`.article h1{font-family:var(--serif);font-size:34px;line-height:1.25;margin:0 0 12px}
`) + String(`.article h2{font-family:var(--serif);font-size:24px;margin:36px 0 10px}
`) + String(`.article h3{font-family:var(--serif);font-size:20px;margin:28px 0 8px}
`) + String(`.lede{font-size:18px;color:var(--muted);margin:0 0 18px}
`) + String(".meta{font-family:var(--mono);font-size:13px;color:var(--muted);") + String(`display:flex;flex-wrap:wrap;gap:6px 14px;margin:0 0 26px}
`) + String(`.meta .tag{border:1px solid var(--line);border-radius:8px;padding:1px 7px}
`) + String(`.provenance{font-family:var(--mono);font-size:12.5px;color:var(--fresh)}
`) + String(`.article p{margin:0 0 18px}
`) + String(`.article ul,.article ol{margin:0 0 18px;padding-left:22px}
`) + String(`.article li{margin:4px 0}
`) + String(".article blockquote{margin:0 0 18px;padding:2px 0 2px 16px;") + String(`border-left:3px solid var(--line);color:var(--muted)}
`) + String(".article pre{background:#1c1f24;color:#e8e6e1;padding:14px 16px;") + String(`border-radius:8px;overflow-x:auto;font-family:var(--mono);font-size:14px}
`) + String(`.article code{font-family:var(--mono);font-size:0.92em}
`) + String(`.article :not(pre) > code{background:var(--line);padding:1px 5px;border-radius:5px}
`) + String(`.article hr{border:0;border-top:1px solid var(--line);margin:32px 0}
`) + String(`.list{list-style:none;padding:0;margin:0;display:grid;gap:14px}
`) + String(".list li{border:1px solid var(--line);border-radius:8px;padding:16px 18px;") + String(`max-width:44rem}
`) + String(`.list a.title{font-family:var(--serif);font-size:20px}
`) + String(`.list .summary{margin:6px 0 0;color:var(--muted)}
`) + String(`.crumbs{font-size:14px;color:var(--muted);margin:0 0 20px}
`) + String(`.empty{color:var(--muted)}
`) + String("footer{max-width:1040px;margin:0 auto;padding:24px;border-top:1px solid var(--line);") + String(`color:var(--muted);font-family:var(--mono);font-size:13px}
`) + String(`.comments{margin-top:34px;border-top:1px solid var(--line);padding-top:20px}
`) + String(`.comments h2{font-family:var(--serif);font-size:20px;margin:0 0 4px}
`) + String(`.comments-list{list-style:none;padding:0;margin:14px 0 0;display:grid;gap:12px}
`) + String(".comment{border:1px solid var(--line);border-radius:8px;padding:12px 14px;") + String(`max-width:44rem}
`) + String(".comment .meta{display:flex;flex-wrap:wrap;gap:4px 12px;margin-bottom:8px;") + String(`font-family:var(--mono);font-size:12px;color:var(--muted)}
`) + String(`.comment-author{font-weight:600;color:var(--ink)}
`) + String(`.comment-body p{margin:0 0 10px}
`) + String(`.comment-body p:last-child{margin-bottom:0}
`) + String(`.comment-note{color:var(--muted);font-size:14px}
`) + String(`.comment-replies{margin-top:12px;border-left:2px solid var(--line);padding-left:12px;gap:10px}
`) + String(`.embed-region{min-height:180px;height:auto;contain:layout style;border:1px dashed var(--line);border-radius:8px;padding:14px;color:var(--muted);font-size:14px;overflow-wrap:anywhere}
`) + String(`.meta,.meta .tag,.provenance,.crumbs,.comment .meta{overflow-wrap:anywhere;min-width:0}
`) + String(`.masthead>*{min-width:0}
`) + String(`a:focus-visible,button:focus-visible,summary:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
`) + String(`@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:0.01ms !important;animation-iteration-count:1 !important;transition-duration:0.01ms !important;scroll-behavior:auto !important}}
`) + String("@media (min-width:601px){.menu{display:contents}.menu>summary{display:none}") + String(`.menu>nav{display:flex}}
`) + String("@media (max-width:600px){.article h1{font-size:28px}main{padding:28px 18px 56px}") + String(".masthead{padding:20px 18px 14px}.menu{width:100%}") + String(".menu>summary{display:block;font-size:15px;color:var(--muted);cursor:pointer;padding:6px 0}") + String(".menu>nav{flex-direction:column;gap:12px;padding:10px 0 2px}") + String(`html[data-menu=collapsed] .menu>nav{display:none}}
`);
function home_href(root) {
  return root === "" ? "./" : root;
}
function nav_links(root) {
  return String('<details class="menu" open><summary>Menu</summary>') + String('<nav aria-label="site">') + String('<a href="') + String(root) + String('archive/">Archive</a>') + String('<a href="') + String(root) + String('tags/">Tags</a>') + String('<a href="') + String(root) + String('search/">Search</a>') + String('<a href="') + String(root) + String('feed.xml">Feed</a>') + String('<a href="https://github.com/">GitHub</a>') + String('<button id="theme-toggle" class="theme-toggle" type="button"') + String(' title="Switch the colour theme">Theme</button>') + String("</nav></details>");
}
function document(site, root, title, description, content) {
  {
    const __eliscript_value_1 = get(site, keyword("title"), "dogfood");
    const __eliscript_value_2 = get(site, keyword("language"), "en");
    const __eliscript_value_3 = get(site, keyword("preview"), false);
    {
      let site_title = __eliscript_value_1;
      let language = __eliscript_value_2;
      let preview = __eliscript_value_3;
      return String(`<!doctype html>
`) + String('<html lang="') + String(escape_html(language)) + String(`">
`) + String(`<head>
`) + String(`<meta charset="utf-8">
`) + String(`<meta name="viewport" content="width=device-width, initial-scale=1">
`) + String("<title>") + String(escape_html(title)) + String(`</title>
`) + String('<meta name="description" content="') + String(escape_html(description)) + String(`">
`) + String(__eliscript_truthy5(preview) ? `<meta name="robots" content="noindex">
` : "") + String('<meta name="dogfood-search-index" content="') + String(root) + String(`search.json">
`) + String('<meta name="dogfood-root" content="') + String(root) + String(`">
`) + String('<script src="') + String(root) + String(`assets/browser.js"></script>
`) + String('<link rel="stylesheet" href="') + String(root) + String(`assets/site.css">
`) + String('<link rel="alternate" type="application/atom+xml" href="') + String(root) + String('feed.xml" title="') + String(escape_html(site_title)) + String(`">
`) + String(`</head>
<body>
`) + String(`<a class="skip" href="#main">Skip to content</a>
`) + String(`<header class="masthead">
`) + String('<a class="wordmark" href="') + String(home_href(root)) + String('">') + String(escape_html(site_title)) + String(`</a>
`) + String(nav_links(root)) + String(`
`) + String(`</header>
`) + String(__eliscript_truthy5(preview) ? String('<p class="preview-banner">Preview build: drafts are included and') + String(` this page must not be indexed.</p>
`) : "") + String(`<main id="main">
`) + String(content) + String(`
</main>
`) + String(`<footer>Built with Eliscript from the repository and its published Markdown.</footer>
`) + String(`</body>
</html>
`);
    }
  }
}

// examples/dogfood/dist/src/renderer/server.mjs
var __eliscript_truthy6 = (value) => value !== false && value != null;
var recent_limit = 12;
var to_native_array = (value) => Array.from(value);
function compare_posts(left, right) {
  {
    const __eliscript_value_1 = left["pinned-weight"];
    const __eliscript_value_2 = right["pinned-weight"];
    {
      let left_pinned = __eliscript_value_1;
      let right_pinned = __eliscript_value_2;
      return !(left_pinned === right_pinned) ? left_pinned > right_pinned ? -1 : 1 : !(left["published-at"] === right["published-at"]) ? left["published-at"] > right["published-at"] ? -1 : 1 : left["id"] === right["id"] ? 0 : left["id"] < right["id"] ? -1 : 1;
    }
  }
}
function sort_posts(posts) {
  return sort(compare_posts, posts);
}
function site_value(site, key, fallback) {
  return get(site, key, fallback);
}
function absolute_url(site, path) {
  return String(site_value(site, keyword("base-url"), "/")) + String(path);
}
function append_all(target, values) {
  return reduce(values, (accumulator, value) => {
    return conj(accumulator, value);
  }, target);
}
function render_tag_links(root, post) {
  {
    const __eliscript_value_3 = post["tags"];
    const __eliscript_value_4 = "";
    const __eliscript_value_5 = 0;
    {
      let tags = __eliscript_value_3;
      let result = __eliscript_value_4;
      let index = __eliscript_value_5;
      while (index < count(tags)) {
        {
          const __eliscript_value_6 = nth(tags, index);
          {
            let tag = __eliscript_value_6;
            result = String(result) + String('<a class="tag" href="') + String(root) + String("tags/") + String(slugify(tag)) + String('/">') + String(escape_html(tag)) + String("</a>");
          }
        }
        index = index + 1;
      }
      return result;
    }
  }
}
function render_card(root, post) {
  {
    const __eliscript_value_7 = post["summary"];
    {
      let summary = __eliscript_value_7;
      return String('<li><a class="title" href="') + String(root) + String("posts/") + String(post["slug"]) + String('/">') + String(escape_html(post["title"])) + String("</a>") + String(__eliscript_truthy6(blank_QMARK_(summary)) ? "" : String('<p class="summary">') + String(escape_html(summary)) + String("</p>")) + String('<div class="meta"><span>') + String(escape_html(post["published-at"])) + String("</span>") + String(render_tag_links(root, post)) + String("</div></li>");
    }
  }
}
function render_post_list(root, posts) {
  {
    const __eliscript_value_8 = "";
    const __eliscript_value_9 = 0;
    {
      let items = __eliscript_value_8;
      let index = __eliscript_value_9;
      while (index < count(posts)) {
        items = String(items) + String(render_card(root, nth(posts, index))), index = index + 1;
      }
      return String('<ul class="list">') + String(items) + String("</ul>");
    }
  }
}
function section(heading, content) {
  return __eliscript_truthy6(blank_QMARK_(content)) ? "" : String("<h2>") + String(escape_html(heading)) + String("</h2>") + String(content);
}
function tagged_QMARK_(post, tag) {
  {
    const __eliscript_value_10 = post["tags"];
    const __eliscript_value_11 = 0;
    const __eliscript_value_12 = false;
    {
      let tags = __eliscript_value_10;
      let index = __eliscript_value_11;
      let found = __eliscript_value_12;
      while (index < count(tags) && !__eliscript_truthy6(found)) {
        nth(tags, index) === tag && (found = true);
        index = index + 1;
      }
      return found;
    }
  }
}
function posts_with_tag(tag, posts) {
  return filter((post) => {
    return tagged_QMARK_(post, tag);
  }, posts);
}
function collect_tags(posts) {
  {
    const __eliscript_value_13 = hashMap();
    const __eliscript_value_14 = vector();
    const __eliscript_value_15 = 0;
    {
      let seen = __eliscript_value_13;
      let tags = __eliscript_value_14;
      let index = __eliscript_value_15;
      while (index < count(posts)) {
        {
          const __eliscript_value_16 = nth(posts, index)["tags"];
          {
            let post_tags = __eliscript_value_16;
            {
              const __eliscript_value_17 = 0;
              {
                let tag_index = __eliscript_value_17;
                while (tag_index < count(post_tags)) {
                  {
                    const __eliscript_value_18 = nth(post_tags, tag_index);
                    {
                      let tag = __eliscript_value_18;
                      !__eliscript_truthy6(get(seen, tag, false)) && (seen = assoc(seen, tag, true), tags = conj(tags, tag));
                    }
                  }
                  tag_index = tag_index + 1;
                }
              }
            }
          }
        }
        index = index + 1;
      }
      return sort(tags);
    }
  }
}
function render_home(site, posts) {
  {
    const __eliscript_value_19 = take(recent_limit, posts);
    {
      let recent = __eliscript_value_19;
      {
        const __eliscript_value_20 = site_value(site, keyword("description"), "");
        {
          let description = __eliscript_value_20;
          return hashMap(keyword("path"), "index.html", keyword("content"), document(site, "", site_value(site, keyword("title"), "dogfood"), description, String('<div class="article">') + String("<h1>") + String(escape_html(site_value(site, keyword("title"), "dogfood"))) + String("</h1>") + String(__eliscript_truthy6(blank_QMARK_(description)) ? "" : String('<p class="lede">') + String(escape_html(description)) + String("</p>")) + String("</div>") + String(section("Recent writing", render_post_list("", recent)))));
        }
      }
    }
  }
}
function render_archive(site, posts) {
  return hashMap(keyword("path"), "archive/index.html", keyword("content"), document(site, "../", "Archive", "Every published article in date order.", String('<div class="article"><h1>Archive</h1>') + String('<p class="crumbs"><a href="../">Home</a></p></div>') + String(render_post_list("../", posts))));
}
function neighbour_link(root, label, post) {
  return post === null ? "" : String('<a href="') + String(root) + String("posts/") + String(post["slug"]) + String('/">') + String(escape_html(label)) + String(": ") + String(escape_html(post["title"])) + String("</a>");
}
function render_neighbours(root, posts, position) {
  {
    const __eliscript_value_21 = position > 0 ? nth(posts, position - 1) : null;
    const __eliscript_value_22 = position < count(posts) - 1 ? nth(posts, position + 1) : null;
    {
      let newer = __eliscript_value_21;
      let older = __eliscript_value_22;
      return newer === null && older === null ? "" : String('<nav class="crumbs" aria-label="article">') + String(neighbour_link(root, "Newer", newer)) + String(!(newer === null) && !(older === null) ? " · " : "") + String(neighbour_link(root, "Older", older)) + String("</nav>");
    }
  }
}
function render_post_page(site, post, posts, position) {
  {
    const __eliscript_value_23 = "../../";
    {
      let root = __eliscript_value_23;
      {
        const __eliscript_value_24 = post["slug"];
        {
          let slug = __eliscript_value_24;
          {
            const __eliscript_value_25 = post["updated-at"];
            {
              let updated = __eliscript_value_25;
              {
                const __eliscript_value_26 = post["summary"];
                {
                  let summary = __eliscript_value_26;
                  {
                    const __eliscript_value_27 = get(post["provenance"], keyword("path"), "");
                    {
                      let source_path = __eliscript_value_27;
                      return hashMap(keyword("path"), String("posts/") + String(slug) + String("/index.html"), keyword("content"), document(site, root, post["title"], summary, String('<article class="article">') + String(render_neighbours(root, posts, position)) + String("<h1>") + String(escape_html(post["title"])) + String("</h1>") + String(__eliscript_truthy6(blank_QMARK_(summary)) ? "" : String('<p class="lede">') + String(escape_html(summary)) + String("</p>")) + String('<div class="meta"><span>') + String(escape_html(post["published-at"])) + String("</span>") + String(updated === post["published-at"] ? "" : String("<span>updated ") + String(escape_html(updated)) + String("</span>")) + String(render_tag_links(root, post)) + String("</div>") + String(post["body"]) + String("<hr>") + String('<p class="provenance">Markdown · ') + String(escape_html(source_path)) + String(' · <a href="') + String(root) + String('archive/">archive</a></p>') + String(render_comment_channels(post)) + String("</article>")));
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
function render_alias_page(site, post, alias) {
  {
    const __eliscript_value_28 = post["slug"];
    const __eliscript_value_29 = post["title"];
    {
      let slug = __eliscript_value_28;
      let title = __eliscript_value_29;
      return hashMap(keyword("path"), String("posts/") + String(alias) + String("/index.html"), keyword("content"), String(`<!doctype html>
`) + String('<html lang="') + String(escape_html(site_value(site, keyword("language"), "en"))) + String(`">
`) + String(`<head>
<meta charset="utf-8">
`) + String('<meta http-equiv="refresh" content="0; url=../') + String(escape_html(slug)) + String(`/">
`) + String(`<meta name="robots" content="noindex">
`) + String('<link rel="canonical" href="') + String(escape_html(absolute_url(site, String("posts/") + String(slug) + String("/")))) + String(`">
`) + String("<title>") + String(escape_html(title)) + String(`</title>
`) + String(`</head>
<body>
<p>This page moved to `) + String('<a href="../') + String(escape_html(slug)) + String('/">') + String(escape_html(title)) + String(`</a>.</p>
`) + String(`</body>
</html>
`));
    }
  }
}
function alias_documents(site, posts) {
  {
    const __eliscript_value_30 = vector();
    const __eliscript_value_31 = 0;
    {
      let documents = __eliscript_value_30;
      let index = __eliscript_value_31;
      while (index < count(posts)) {
        {
          const __eliscript_value_32 = nth(posts, index);
          {
            let post = __eliscript_value_32;
            {
              const __eliscript_value_33 = post["aliases"];
              {
                let aliases = __eliscript_value_33;
                {
                  const __eliscript_value_34 = 0;
                  {
                    let alias_index = __eliscript_value_34;
                    while (alias_index < count(aliases)) {
                      documents = conj(documents, render_alias_page(site, post, nth(aliases, alias_index))), alias_index = alias_index + 1;
                    }
                  }
                }
              }
            }
          }
        }
        index = index + 1;
      }
      return documents;
    }
  }
}
function display_name(value) {
  {
    const __eliscript_value_35 = String(value);
    {
      let text = __eliscript_value_35;
      return slice(0, 1, text) === ":" ? slice(1, text_length(text), text) : text;
    }
  }
}
function provider_label(kind) {
  return kind === keyword("issue") ? "GitHub Issues" : kind === keyword("discussion") ? "GitHub Discussions" : display_name(kind);
}
function channel_binding(channel) {
  {
    const __eliscript_value_36 = get(channel, keyword("binding"), null);
    {
      let binding = __eliscript_value_36;
      return binding === null ? "" : ((repository, number) => {
        return number === null ? repository : String(repository) + String("#") + String(number);
      })(get(binding, keyword("repository"), ""), get(binding, keyword("number"), null));
    }
  }
}
function render_refresh_note(channel, binding) {
  {
    const __eliscript_value_37 = display_name(get(channel, keyword("kind"), keyword("issue")));
    {
      let kind_name = __eliscript_value_37;
      {
        const __eliscript_value_38 = get(channel, keyword("updated-at"), null);
        {
          let snapshot = __eliscript_value_38;
          {
            const __eliscript_value_39 = get(channel, keyword("count"), 0);
            {
              let count_value = __eliscript_value_39;
              {
                const __eliscript_value_40 = provider_thread_url(binding);
                {
                  let posting = __eliscript_value_40;
                  return String('<p class="comment-note refresh-note"') + String(' data-comment-refresh="1"') + String(' data-comment-kind="') + String(escape_html(kind_name)) + String('"') + String(' data-comment-count="') + String(String(count_value)) + String('"') + String(' data-comment-binding="') + String(escape_html(binding)) + String('"') + String(__eliscript_truthy6(blank_QMARK_(snapshot)) ? "" : String(' data-comment-snapshot="') + String(escape_html(String(snapshot))) + String('"')) + String(">Snapshot") + String(__eliscript_truthy6(blank_QMARK_(snapshot)) ? "" : String(" from ") + String(escape_html(String(snapshot)))) + String(count_value > 0 ? String(" with ") + String(count_value) + String(" comments") : "") + String(".") + String(__eliscript_truthy6(blank_QMARK_(posting)) ? "" : String(' <a href="') + String(escape_html(posting)) + String('">Read or reply at ') + String(escape_html(posting)) + String("</a>.")) + String('<span class="refresh-verdict"></span>') + String("</p>");
                }
              }
            }
          }
        }
      }
    }
  }
}
function provider_thread_url(binding) {
  return __eliscript_truthy6(blank_QMARK_(binding)) ? "" : ((hash) => {
    return ((path) => {
      return ((number) => {
        return __eliscript_truthy6(blank_QMARK_(number)) ? String("https://github.com/") + String(path) : String("https://github.com/") + String(path) + String("/issues/") + String(number);
      })(hash < 0 ? "" : slice(hash + 1, text_length(binding), binding));
    })(hash < 0 ? binding : slice(0, hash, binding));
  })(index_of("#", binding));
}
function render_comment_item(comment) {
  {
    const __eliscript_value_41 = get(comment, keyword("author"), hashMap());
    {
      let author = __eliscript_value_41;
      {
        const __eliscript_value_42 = String(get(author, keyword("login"), "unknown"));
        {
          let login = __eliscript_value_42;
          {
            const __eliscript_value_43 = get(comment, keyword("url"), null);
            {
              let url = __eliscript_value_43;
              {
                const __eliscript_value_44 = String(get(comment, keyword("created-at"), ""));
                {
                  let created = __eliscript_value_44;
                  {
                    const __eliscript_value_45 = String(get(comment, keyword("updated-at"), ""));
                    {
                      let updated = __eliscript_value_45;
                      return String('<li class="comment">') + String('<div class="meta"><span class="comment-author">') + String(escape_html(login)) + String("</span>") + String("<span>") + String(escape_html(created)) + String("</span>") + String(updated === created ? "" : String("<span>updated ") + String(escape_html(updated)) + String("</span>")) + String(url === null ? "" : String('<a href="') + String(escape_html(url)) + String('">on GitHub</a>')) + String("</div>") + String('<div class="comment-body">') + String(get(comment, keyword("body"), "")) + String("</div>") + String(((replies) => {
                        return count(replies) === 0 ? "" : String('<ol class="comments-list comment-replies">') + String(render_reply_items(replies)) + String("</ol>");
                      })(get(comment, keyword("replies"), vector()))) + String("</li>");
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
function render_reply_items(items) {
  {
    const __eliscript_value_46 = "";
    const __eliscript_value_47 = 0;
    {
      let markup = __eliscript_value_46;
      let index = __eliscript_value_47;
      while (index < count(items)) {
        markup = String(markup) + String(render_comment_item(nth(items, index))), index = index + 1;
      }
      return markup;
    }
  }
}
function render_comment_items(items) {
  {
    const __eliscript_value_48 = "";
    const __eliscript_value_49 = 0;
    {
      let markup = __eliscript_value_48;
      let index = __eliscript_value_49;
      while (index < count(items)) {
        markup = String(markup) + String(render_comment_item(nth(items, index))), index = index + 1;
      }
      return String('<ol class="comments-list">') + String(markup) + String("</ol>");
    }
  }
}
function render_channel_heading(channel) {
  {
    const __eliscript_value_50 = get(channel, keyword("count"), null);
    const __eliscript_value_51 = get(channel, keyword("updated-at"), null);
    {
      let count_value = __eliscript_value_50;
      let freshness = __eliscript_value_51;
      return String("<h2>Comments") + String(!(count_value === null) && count_value > 0 ? String(" (") + String(count_value) + String(")") : "") + String("</h2>") + String(__eliscript_truthy6(blank_QMARK_(freshness)) ? "" : String('<p class="comment-note">Snapshot from ') + String(escape_html(String(freshness))) + String(".</p>"));
    }
  }
}
function render_channel(channel) {
  {
    const __eliscript_value_52 = get(channel, keyword("mode"), keyword("snapshot"));
    {
      let mode = __eliscript_value_52;
      {
        const __eliscript_value_53 = get(channel, keyword("kind"), keyword("issue"));
        {
          let kind = __eliscript_value_53;
          {
            const __eliscript_value_54 = provider_label(kind);
            {
              let provider = __eliscript_value_54;
              {
                const __eliscript_value_55 = channel_binding(channel);
                {
                  let binding = __eliscript_value_55;
                  {
                    const __eliscript_value_56 = get(channel, keyword("items"), vector());
                    {
                      let items = __eliscript_value_56;
                      return String('<section class="comments" data-comment-provider="') + String(escape_html(provider)) + String('"') + String(__eliscript_truthy6(blank_QMARK_(binding)) ? "" : String(' data-comments-binding="') + String(escape_html(binding)) + String('"')) + String(">") + String(render_channel_heading(channel)) + String(mode === keyword("embed") || mode === keyword("external") ? String('<div class="embed-region" data-comment-mount="') + String(escape_html(provider)) + String('">') + String('<p class="comment-note">Comments are provided by ') + String(escape_html(provider)) + String(". The browser loads that provider; this build does not") + String(" script it.</p>") + String(((fallback) => {
                        return __eliscript_truthy6(blank_QMARK_(fallback)) ? "" : String('<p class="comment-note">If it does not load, read') + String(' the thread at <a href="') + String(escape_html(fallback)) + String('">') + String(escape_html(fallback)) + String("</a>.</p>");
                      })(__eliscript_truthy6(blank_QMARK_(binding)) ? ((__eliscript_value_57) => __eliscript_truthy6(__eliscript_value_57) ? __eliscript_value_57 : "")(get(channel, keyword("provider-url"), null)) : binding)) + String("</div>") : mode === keyword("live") ? String('<p class="comment-note">') + String(__eliscript_truthy6(blank_QMARK_(binding)) ? "This channel is served live." : String("This thread is served live for ") + String(escape_html(binding)) + String(".")) + String(" A comment never triggers a build; open the provider to") + String(" read or reply.</p>") : mode === keyword("hybrid") ? String(count(items) === 0 ? '<p class="comment-note">No comments in this snapshot yet.</p>' : render_comment_items(items)) + String(render_refresh_note(channel, binding)) : count(items) === 0 ? '<p class="comment-note">No comments in this snapshot.</p>' : render_comment_items(items)) + String("</section>");
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
function render_comment_channels(post) {
  {
    const __eliscript_value_58 = get(post, keyword("comment-channels"));
    {
      let channels = __eliscript_value_58;
      {
        const __eliscript_value_59 = "";
        const __eliscript_value_60 = 0;
        {
          let markup = __eliscript_value_59;
          let index = __eliscript_value_60;
          while (index < count(channels)) {
            markup = String(markup) + String(render_channel(nth(channels, index))), index = index + 1;
          }
          return markup;
        }
      }
    }
  }
}
function render_tag_index(site, tags, posts) {
  {
    const __eliscript_value_61 = "";
    const __eliscript_value_62 = 0;
    {
      let items = __eliscript_value_61;
      let index = __eliscript_value_62;
      while (index < count(tags)) {
        {
          const __eliscript_value_63 = nth(tags, index);
          {
            let tag = __eliscript_value_63;
            items = String(items) + String('<li><a class="title" href="') + String(slugify(tag)) + String('/">') + String(escape_html(tag)) + String("</a>") + String('<div class="meta"><span>') + String(count(posts_with_tag(tag, posts))) + String(" articles</span></div></li>");
          }
        }
        index = index + 1;
      }
      return hashMap(keyword("path"), "tags/index.html", keyword("content"), document(site, "../", "Tags", "Articles grouped by tag.", String('<div class="article"><h1>Tags</h1>') + String('<p class="crumbs"><a href="../">Home</a></p></div>') + String('<ul class="list">') + String(items) + String("</ul>")));
    }
  }
}
function render_tag_page(site, tag, posts) {
  {
    const __eliscript_value_64 = filter((post) => {
      return tagged_QMARK_(post, tag);
    }, posts);
    {
      let matching = __eliscript_value_64;
      return hashMap(keyword("path"), String("tags/") + String(slugify(tag)) + String("/index.html"), keyword("content"), document(site, "../../", String("Tag: ") + String(tag), String("Articles tagged ") + String(tag) + String("."), String('<div class="article"><h1>') + String(escape_html(tag)) + String("</h1>") + String('<p class="crumbs"><a href="../../">Home</a> · ') + String('<a href="../">Tags</a></p></div>') + String(render_post_list("../../", matching))));
    }
  }
}
function render_search_page(site) {
  return hashMap(keyword("path"), "search/index.html", keyword("content"), document(site, "../", "Search", "Search every published article locally.", String('<div class="article"><h1>Search</h1>') + String('<p class="crumbs"><a href="../">Home</a></p>') + String('<div class="search-form">') + String('<label class="skip" for="search-input">Search articles</label>') + String('<input id="search-input" type="search" autocomplete="off"') + String(' placeholder="Search title, summary, tags, or text">') + String("</div>") + String('<div id="search-results" aria-live="polite"></div>') + String('<noscript><p class="comment-note">Search needs JavaScript.') + String(" Every article is still reachable from the") + String(' <a href="../archive/">archive</a>.</p></noscript>') + String("</div>")));
}
function render_not_found(site) {
  return hashMap(keyword("path"), "404.html", keyword("content"), document(site, "", "Not found", "The requested page does not exist.", String('<div class="article"><h1>Not found</h1>') + String('<p class="empty">That page does not exist. ') + String('<a href="./">Return home</a>.</p></div>')));
}
function render_feed(site, posts) {
  {
    const __eliscript_value_65 = site_value(site, keyword("base-url"), "/");
    const __eliscript_value_66 = site_value(site, keyword("title"), "dogfood");
    const __eliscript_value_67 = "";
    const __eliscript_value_68 = 0;
    {
      let base = __eliscript_value_65;
      let title = __eliscript_value_66;
      let entries = __eliscript_value_67;
      let index = __eliscript_value_68;
      while (index < count(posts)) {
        {
          const __eliscript_value_69 = nth(posts, index);
          {
            let post = __eliscript_value_69;
            {
              const __eliscript_value_70 = String(base) + String("posts/") + String(post["slug"]) + String("/");
              {
                let url = __eliscript_value_70;
                entries = String(entries) + String("<entry><title>") + String(escape_html(post["title"])) + String("</title>") + String('<link href="') + String(escape_html(url)) + String('"/>') + String("<id>") + String(escape_html(url)) + String("</id>") + String("<updated>") + String(escape_html(post["updated-at"])) + String("T00:00:00Z</updated>") + String("<summary>") + String(escape_html(post["summary"])) + String("</summary>") + String("</entry>");
                index = index + 1;
              }
            }
          }
        }
      }
      return hashMap(keyword("path"), "feed.xml", keyword("content"), String(`<?xml version="1.0" encoding="utf-8"?>
`) + String('<feed xmlns="http://www.w3.org/2005/Atom">') + String("<title>") + String(escape_html(title)) + String("</title>") + String('<link href="') + String(escape_html(base)) + String('"/>') + String("<id>") + String(escape_html(base)) + String("</id>") + String(entries) + String(`</feed>
`));
    }
  }
}
function render_sitemap(site, posts) {
  {
    const __eliscript_value_71 = String("<url><loc>") + String(escape_html(absolute_url(site, ""))) + String("</loc></url>") + String("<url><loc>") + String(escape_html(absolute_url(site, "archive/"))) + String("</loc></url>") + String("<url><loc>") + String(escape_html(absolute_url(site, "tags/"))) + String("</loc></url>");
    const __eliscript_value_72 = 0;
    {
      let urls = __eliscript_value_71;
      let index = __eliscript_value_72;
      while (index < count(posts)) {
        urls = String(urls) + String("<url><loc>") + String(escape_html(absolute_url(site, String("posts/") + String(nth(posts, index)["slug"]) + String("/")))) + String("</loc></url>");
        index = index + 1;
      }
      return hashMap(keyword("path"), "sitemap.xml", keyword("content"), String(`<?xml version="1.0" encoding="utf-8"?>
`) + String('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">') + String(urls) + String(`</urlset>
`));
    }
  }
}
function search_entry(post) {
  return { id: post["id"], slug: post["slug"], title: post["title"], summary: post["summary"], tags: to_native_array(post["tags"]), authors: to_native_array(post["authors"]), url: String("posts/") + String(post["slug"]) + String("/"), text: strip_tags(post["body"]) };
}
function render_search_index(site, posts) {
  return hashMap(keyword("path"), "search.json", keyword("content"), String(JSON.stringify({ format: "dogfood-search", version: 1, entries: to_native_array(map(search_entry, posts)) })) + String(`
`));
}
function preview_QMARK_(site) {
  return truthy_QMARK_(get(site, keyword("preview"), false));
}
function truthy_QMARK_(value) {
  return __eliscript_truthy6(value) ? true : null;
}
function render_preview_robots() {
  return hashMap(keyword("path"), "robots.txt", keyword("content"), `User-agent: *
Disallow: /
`);
}
function render_robots(site) {
  return hashMap(keyword("path"), "robots.txt", keyword("content"), String(`User-agent: *
Allow: /
Sitemap: `) + String(absolute_url(site, "sitemap.xml")) + String(`
`));
}
function render_site(site, posts) {
  {
    const __eliscript_value_73 = sort_posts(posts);
    {
      let sorted = __eliscript_value_73;
      {
        const __eliscript_value_74 = collect_tags(sorted);
        {
          let tags = __eliscript_value_74;
          {
            const __eliscript_value_75 = vector();
            {
              let post_pages = __eliscript_value_75;
              {
                const __eliscript_value_76 = vector();
                {
                  let tag_pages = __eliscript_value_76;
                  {
                    const __eliscript_value_77 = vector();
                    {
                      let documents = __eliscript_value_77;
                      {
                        const __eliscript_value_78 = 0;
                        {
                          let index = __eliscript_value_78;
                          while (index < count(sorted)) {
                            post_pages = conj(post_pages, render_post_page(site, nth(sorted, index), sorted, index)), index = index + 1;
                          }
                        }
                      }
                      {
                        const __eliscript_value_79 = 0;
                        {
                          let index = __eliscript_value_79;
                          while (index < count(tags)) {
                            tag_pages = conj(tag_pages, render_tag_page(site, nth(tags, index), sorted)), index = index + 1;
                          }
                        }
                      }
                      documents = conj(documents, render_home(site, sorted));
                      documents = conj(documents, render_archive(site, sorted));
                      documents = conj(documents, render_tag_index(site, tags, sorted));
                      documents = conj(documents, render_search_page(site));
                      documents = conj(documents, render_not_found(site));
                      !__eliscript_truthy6(preview_QMARK_(site)) && (() => {
                        documents = conj(documents, render_feed(site, sorted));
                        return documents = conj(documents, render_sitemap(site, sorted));
                      })();
                      documents = conj(documents, render_search_index(site, sorted));
                      documents = conj(documents, __eliscript_truthy6(preview_QMARK_(site)) ? render_preview_robots() : render_robots(site));
                      documents = conj(documents, hashMap(keyword("path"), "assets/site.css", keyword("content"), site_css));
                      return append_all(append_all(append_all(documents, post_pages), tag_pages), alias_documents(site, sorted));
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

// examples/dogfood/dist/src/builder/content.mjs
var import_node_fs = require("node:fs");
var Path = __toESM(require("node:path"));

// examples/dogfood/dist/src/support/diagnostics.mjs
function fail2(code, message) {
  return ((__eliscript_value_1) => {
    throw __eliscript_value_1;
  })({ code, message });
}

// examples/dogfood/dist/src/support/fields.mjs
var __eliscript_truthy7 = (value) => value !== false && value != null;
function parse_field_line(line) {
  {
    const __eliscript_value_1 = index_of(":", line);
    {
      let colon = __eliscript_value_1;
      return colon < 1 ? null : vector(trim(slice(0, colon, line)), trim(slice(colon + 1, text_length(line), line)));
    }
  }
}
function parse_fields(lines, start, end) {
  {
    const __eliscript_value_2 = hashMap();
    const __eliscript_value_3 = start;
    {
      let fields = __eliscript_value_2;
      let index = __eliscript_value_3;
      while (index < end) {
        {
          const __eliscript_value_4 = parse_field_line(nth(lines, index));
          {
            let pair = __eliscript_value_4;
            __eliscript_truthy7(pair) && (fields = assoc(fields, nth(pair, 0, null), nth(pair, 1, null)));
          }
        }
        index = index + 1;
      }
      return fields;
    }
  }
}
function parse_list(value) {
  {
    const __eliscript_value_5 = __eliscript_truthy7(((__eliscript_value_6) => __eliscript_truthy7(__eliscript_value_6) ? ends_with_QMARK_("]", value) : __eliscript_value_6)(starts_with_QMARK_("[", value))) ? slice(1, text_length(value) - 1, value) : value;
    {
      let inner = __eliscript_value_5;
      {
        const __eliscript_value_7 = split_on(",", inner);
        {
          let parts = __eliscript_value_7;
          {
            const __eliscript_value_8 = vector();
            {
              let result = __eliscript_value_8;
              {
                const __eliscript_value_9 = 0;
                {
                  let index = __eliscript_value_9;
                  while (index < count(parts)) {
                    {
                      const __eliscript_value_10 = trim(nth(parts, index));
                      {
                        let item = __eliscript_value_10;
                        !__eliscript_truthy7(blank_QMARK_(item)) && (result = conj(result, item));
                      }
                    }
                    index = index + 1;
                  }
                  return result;
                }
              }
            }
          }
        }
      }
    }
  }
}
function field(fields, key, fallback) {
  {
    const __eliscript_value_11 = get(fields, key, null);
    {
      let value = __eliscript_value_11;
      return __eliscript_truthy7(empty_value_QMARK_(value)) ? fallback : value;
    }
  }
}
function require_field(fields, key, path) {
  {
    const __eliscript_value_12 = get(fields, key, null);
    {
      let value = __eliscript_value_12;
      return __eliscript_truthy7(empty_value_QMARK_(value)) ? fail2("DOGFOOD-CONTENT-001", String(path) + String(': missing required metadata field "') + String(key) + String('"')) : value;
    }
  }
}

// examples/dogfood/dist/src/support/records.mjs
function define_record_type(name, fields) {
  return defineRecordType(name, fields);
}

// examples/dogfood/dist/src/support/markdown.mjs
var __eliscript_truthy8 = (value) => value !== false && value != null;
var space = 32;
var hash_mark = 35;
function block_start_QMARK_(line) {
  {
    const __eliscript_value_1 = trim(line);
    {
      let trimmed = __eliscript_value_1;
      return ((__eliscript_value_2) => __eliscript_truthy8(__eliscript_value_2) ? __eliscript_value_2 : ((__eliscript_value_3) => __eliscript_truthy8(__eliscript_value_3) ? __eliscript_value_3 : ((__eliscript_value_4) => __eliscript_truthy8(__eliscript_value_4) ? __eliscript_value_4 : ((__eliscript_value_5) => __eliscript_truthy8(__eliscript_value_5) ? __eliscript_value_5 : ((__eliscript_value_6) => __eliscript_truthy8(__eliscript_value_6) ? __eliscript_value_6 : ((__eliscript_value_7) => __eliscript_truthy8(__eliscript_value_7) ? __eliscript_value_7 : trimmed === "---")(ordered_item_QMARK_(trimmed)))(starts_with_QMARK_("- ", trimmed)))(starts_with_QMARK_("> ", trimmed)))(starts_with_QMARK_("```", trimmed)))(starts_with_QMARK_("#", trimmed)))(blank_QMARK_(trimmed));
    }
  }
}
function heading_level(text) {
  {
    const __eliscript_value_8 = 0;
    {
      let index = __eliscript_value_8;
      while (index < text_length(text) && char_code(text, index) === hash_mark) {
        index = index + 1;
      }
      return index > 0 && index <= 6 && index < text_length(text) && char_code(text, index) === space ? index : 0;
    }
  }
}
function ordered_prefix_length(text) {
  {
    const __eliscript_value_9 = 0;
    {
      let index = __eliscript_value_9;
      while (__eliscript_truthy8(((__eliscript_value_10) => __eliscript_truthy8(__eliscript_value_10) ? digit_code_QMARK_(char_code(text, index)) : __eliscript_value_10)(index < text_length(text)))) {
        index = index + 1;
      }
      return index > 0 && index + 1 < text_length(text) && slice(index, index + 2, text) === ". " ? index + 2 : -1;
    }
  }
}
function ordered_item_QMARK_(text) {
  return ordered_prefix_length(text) > 0;
}
function unordered_item_QMARK_(text) {
  return starts_with_QMARK_("- ", text);
}
function fence_close(lines, start, total) {
  {
    const __eliscript_value_11 = start + 1;
    const __eliscript_value_12 = total;
    {
      let index = __eliscript_value_11;
      let close = __eliscript_value_12;
      while (index < total) {
        __eliscript_truthy8(starts_with_QMARK_("```", trim(nth(lines, index)))) && (close = index, index = total);
        index = index + 1;
      }
      return close;
    }
  }
}
function item_of_kind_QMARK_(text, ordered) {
  return __eliscript_truthy8(ordered) ? ordered_item_QMARK_(text) : unordered_item_QMARK_(text);
}
function list_end(lines, start, total, ordered) {
  {
    const __eliscript_value_13 = start;
    {
      let index = __eliscript_value_13;
      while (__eliscript_truthy8(((__eliscript_value_14) => __eliscript_truthy8(__eliscript_value_14) ? ((trimmed) => {
        return ((__eliscript_value_15) => __eliscript_truthy8(__eliscript_value_15) ? __eliscript_value_15 : !__eliscript_truthy8(block_start_QMARK_(trimmed)))(item_of_kind_QMARK_(trimmed, ordered));
      })(trim(nth(lines, index))) : __eliscript_value_14)(index < total))) {
        index = index + 1;
      }
      return index;
    }
  }
}
function quote_end(lines, start, total) {
  {
    const __eliscript_value_16 = start;
    {
      let index = __eliscript_value_16;
      while (__eliscript_truthy8(((__eliscript_value_17) => __eliscript_truthy8(__eliscript_value_17) ? starts_with_QMARK_("> ", trim(nth(lines, index))) : __eliscript_value_17)(index < total))) {
        index = index + 1;
      }
      return index;
    }
  }
}
function paragraph_end(lines, start, total) {
  {
    const __eliscript_value_18 = start;
    {
      let index = __eliscript_value_18;
      while (index < total && !__eliscript_truthy8(block_start_QMARK_(nth(lines, index)))) {
        index = index + 1;
      }
      return index;
    }
  }
}
function paragraph_text(lines, start, end) {
  {
    const __eliscript_value_19 = vector();
    const __eliscript_value_20 = start;
    {
      let parts = __eliscript_value_19;
      let index = __eliscript_value_20;
      while (index < end) {
        parts = conj(parts, trim(nth(lines, index))), index = index + 1;
      }
      return join(" ", parts);
    }
  }
}
function render_fence(lines, start, close) {
  {
    const __eliscript_value_21 = trim(nth(lines, start));
    {
      let opening = __eliscript_value_21;
      {
        const __eliscript_value_22 = trim(strip_prefix("```", opening));
        {
          let language = __eliscript_value_22;
          {
            const __eliscript_value_23 = "";
            {
              let content = __eliscript_value_23;
              {
                const __eliscript_value_24 = start + 1;
                {
                  let index = __eliscript_value_24;
                  while (index < close) {
                    content = String(content) + String(nth(lines, index)) + String(`
`), index = index + 1;
                  }
                  return String("<pre><code") + String(__eliscript_truthy8(blank_QMARK_(language)) ? "" : String(' class="language-') + String(escape_html(language)) + String('"')) + String(">") + String(escape_html(content)) + String("</code></pre>");
                }
              }
            }
          }
        }
      }
    }
  }
}
function list_marker_width(text) {
  return __eliscript_truthy8(unordered_item_QMARK_(text)) ? 2 : __eliscript_truthy8(ordered_item_QMARK_(text)) ? ordered_prefix_length(text) : 0;
}
function render_list(lines, start, end) {
  {
    const __eliscript_value_25 = "";
    const __eliscript_value_26 = null;
    const __eliscript_value_27 = start;
    {
      let items = __eliscript_value_25;
      let current = __eliscript_value_26;
      let index = __eliscript_value_27;
      while (index < end) {
        {
          const __eliscript_value_28 = trim(nth(lines, index));
          {
            let trimmed = __eliscript_value_28;
            {
              const __eliscript_value_29 = list_marker_width(trimmed);
              {
                let width = __eliscript_value_29;
                width > 0 ? (() => {
                  __eliscript_truthy8(current) && (items = String(items) + String("<li>") + String(render_inline(current)) + String("</li>"));
                  return current = trim(slice(width, text_length(trimmed), trimmed));
                })() : current = String(current) + String(" ") + String(trimmed);
              }
            }
          }
        }
        index = index + 1;
      }
      __eliscript_truthy8(current) && (items = String(items) + String("<li>") + String(render_inline(current)) + String("</li>"));
      return String(__eliscript_truthy8(unordered_item_QMARK_(trim(nth(lines, start)))) ? "<ul>" : "<ol>") + String(items) + String(__eliscript_truthy8(unordered_item_QMARK_(trim(nth(lines, start)))) ? "</ul>" : "</ol>");
    }
  }
}
function render_quote(lines, start, end) {
  {
    const __eliscript_value_30 = vector();
    const __eliscript_value_31 = start;
    {
      let parts = __eliscript_value_30;
      let index = __eliscript_value_31;
      while (index < end) {
        parts = conj(parts, strip_prefix("> ", trim(nth(lines, index)))), index = index + 1;
      }
      return String("<blockquote><p>") + String(render_inline(join(" ", parts))) + String("</p></blockquote>");
    }
  }
}
function render_heading(trimmed) {
  {
    const __eliscript_value_32 = heading_level(trimmed);
    {
      let level = __eliscript_value_32;
      {
        const __eliscript_value_33 = trim(slice(level, text_length(trimmed), trimmed));
        {
          let content = __eliscript_value_33;
          return String("<h") + String(level) + String(">") + String(render_inline(content)) + String("</h") + String(level) + String(">");
        }
      }
    }
  }
}
function render_markdown(text) {
  {
    const __eliscript_value_34 = split_lines(text);
    {
      let lines = __eliscript_value_34;
      {
        const __eliscript_value_35 = count(lines);
        {
          let total = __eliscript_value_35;
          {
            const __eliscript_value_36 = vector();
            {
              let blocks = __eliscript_value_36;
              {
                const __eliscript_value_37 = 0;
                {
                  let index = __eliscript_value_37;
                  while (index < total) {
                    {
                      const __eliscript_value_38 = trim(nth(lines, index));
                      {
                        let trimmed = __eliscript_value_38;
                        {
                          const __eliscript_value_39 = heading_level(trimmed);
                          {
                            let level = __eliscript_value_39;
                            __eliscript_truthy8(blank_QMARK_(trimmed)) ? index = index + 1 : __eliscript_truthy8(starts_with_QMARK_("```", trimmed)) ? ((close) => {
                              return ((next) => {
                                return blocks = conj(blocks, render_fence(lines, index, close)), index = next;
                              })(close < total ? close + 1 : total);
                            })(fence_close(lines, index, total)) : level > 0 ? (blocks = conj(blocks, render_heading(trimmed)), index = index + 1) : trimmed === "---" ? (blocks = conj(blocks, "<hr>"), index = index + 1) : __eliscript_truthy8(starts_with_QMARK_("> ", trimmed)) ? ((end) => {
                              return blocks = conj(blocks, render_quote(lines, index, end)), index = end;
                            })(quote_end(lines, index, total)) : __eliscript_truthy8(unordered_item_QMARK_(trimmed)) ? ((end) => {
                              return blocks = conj(blocks, render_list(lines, index, end)), index = end;
                            })(list_end(lines, index, total, false)) : __eliscript_truthy8(ordered_item_QMARK_(trimmed)) ? ((end) => {
                              return blocks = conj(blocks, render_list(lines, index, end)), index = end;
                            })(list_end(lines, index, total, true)) : ((end) => {
                              return blocks = conj(blocks, String("<p>") + String(render_inline(paragraph_text(lines, index, end))) + String("</p>")), index = end;
                            })(paragraph_end(lines, index, total));
                          }
                        }
                      }
                    }
                  }
                }
              }
              return join(`
`, blocks);
            }
          }
        }
      }
    }
  }
}
function render_inline(text) {
  {
    const __eliscript_value_40 = "";
    const __eliscript_value_41 = "";
    const __eliscript_value_42 = 0;
    const __eliscript_value_43 = text_length(text);
    {
      let result = __eliscript_value_40;
      let plain = __eliscript_value_41;
      let index = __eliscript_value_42;
      let size = __eliscript_value_43;
      while (index < size) {
        {
          const __eliscript_value_44 = slice(index, index + 1, text);
          {
            let character = __eliscript_value_44;
            character === "`" ? ((close) => {
              return close < 0 ? (plain = String(plain) + String(character), index = index + 1) : (result = String(result) + String(escape_html(plain)) + String("<code>") + String(escape_html(slice(index + 1, close, text))) + String("</code>"), plain = "", index = close + 1);
            })(index_of_from("`", text, index + 1)) : character === "*" && index + 1 < size && slice(index + 1, index + 2, text) === "*" ? ((close) => {
              return close < 0 ? (plain = String(plain) + String(character), index = index + 1) : (result = String(result) + String(escape_html(plain)) + String("<strong>") + String(render_inline(slice(index + 2, close, text))) + String("</strong>"), plain = "", index = close + 2);
            })(index_of_from("**", text, index + 2)) : character === "*" ? ((close) => {
              return close < 0 ? (plain = String(plain) + String(character), index = index + 1) : (result = String(result) + String(escape_html(plain)) + String("<em>") + String(render_inline(slice(index + 1, close, text))) + String("</em>"), plain = "", index = close + 1);
            })(index_of_from("*", text, index + 1)) : character === "[" ? ((label_end) => {
              return ((url_end) => {
                return label_end < 0 || url_end < 0 ? (plain = String(plain) + String(character), index = index + 1) : ((label, target) => {
                  return result = String(result) + String(escape_html(plain)) + String(__eliscript_truthy8(safe_url_QMARK_(target)) ? String('<a href="') + String(escape_html(target)) + String('">') + String(render_inline(label)) + String("</a>") : render_inline(label)), plain = "", index = url_end + 1;
                })(slice(index + 1, label_end, text), slice(label_end + 2, url_end, text));
              })(label_end < 0 ? -1 : index_of_from(")", text, label_end + 2));
            })(index_of_from("](", text, index + 1)) : (plain = String(plain) + String(character), index = index + 1);
          }
        }
      }
      return String(result) + String(escape_html(plain));
    }
  }
}

// examples/dogfood/dist/src/builder/content.mjs
var __eliscript_truthy9 = (value) => value !== false && value != null;
var Post = define_record_type("Post", ["id", "slug", "title", "summary", "body", "published-at", "updated-at", "authors", "tags", "cover", "draft", "pinned-weight", "provenance", "aliases", "comment-channels"]);
var __GT_Post = (id, slug, title, summary, body, published_at, updated_at, authors, tags, cover, draft, pinned_weight, provenance, aliases, comment_channels) => {
  return Post["create"](id, slug, title, summary, body, published_at, updated_at, authors, tags, cover, draft, pinned_weight, provenance, aliases, comment_channels);
};
function markdown_names(directory) {
  {
    const __eliscript_value_1 = import_node_fs.readdirSync(directory);
    const __eliscript_value_2 = vector();
    const __eliscript_value_3 = 0;
    {
      let names = __eliscript_value_1;
      let result = __eliscript_value_2;
      let index = __eliscript_value_3;
      while (index < count(names)) {
        {
          const __eliscript_value_4 = nth(names, index);
          {
            let name = __eliscript_value_4;
            __eliscript_truthy9(ends_with_QMARK_(".md", name)) && (result = conj(result, name));
          }
        }
        index = index + 1;
      }
      return sort(result);
    }
  }
}
function front_matter_close(lines) {
  {
    const __eliscript_value_5 = 1;
    const __eliscript_value_6 = -1;
    const __eliscript_value_7 = count(lines);
    {
      let index = __eliscript_value_5;
      let close = __eliscript_value_6;
      let total = __eliscript_value_7;
      while (index < total && close < 0) {
        trim(nth(lines, index)) === "---" && (close = index);
        index = index + 1;
      }
      return close;
    }
  }
}
function date_value(text) {
  return slice(0, 10, trim(text));
}
function body_text(lines, start) {
  {
    const __eliscript_value_8 = vector();
    const __eliscript_value_9 = start;
    const __eliscript_value_10 = count(lines);
    {
      let parts = __eliscript_value_8;
      let index = __eliscript_value_9;
      let total = __eliscript_value_10;
      while (index < total) {
        parts = conj(parts, nth(lines, index)), index = index + 1;
      }
      return join(`
`, parts);
    }
  }
}
function build_post(path, relative, lines, close, fields) {
  {
    const __eliscript_value_11 = require_field(fields, "id", path);
    {
      let identifier = __eliscript_value_11;
      {
        const __eliscript_value_12 = require_field(fields, "title", path);
        {
          let title = __eliscript_value_12;
          {
            const __eliscript_value_13 = date_value(require_field(fields, "date", path));
            {
              let published = __eliscript_value_13;
              {
                const __eliscript_value_14 = field(fields, "updated", null);
                {
                  let updated_field = __eliscript_value_14;
                  {
                    const __eliscript_value_15 = field(fields, "slug", null);
                    {
                      let slug_field = __eliscript_value_15;
                      {
                        const __eliscript_value_16 = slug_field === null ? slugify(without_suffix(".md", basename(path))) : slug_field;
                        {
                          let slug = __eliscript_value_16;
                          {
                            const __eliscript_value_17 = parse_list(field(fields, "authors", ""));
                            {
                              let authors = __eliscript_value_17;
                              {
                                const __eliscript_value_18 = parse_list(field(fields, "tags", ""));
                                {
                                  let tags = __eliscript_value_18;
                                  {
                                    const __eliscript_value_19 = parse_list(field(fields, "aliases", ""));
                                    {
                                      let aliases = __eliscript_value_19;
                                      {
                                        const __eliscript_value_20 = field(fields, "draft", "false") === "true";
                                        {
                                          let draft = __eliscript_value_20;
                                          {
                                            const __eliscript_value_21 = render_markdown(body_text(lines, close + 1));
                                            {
                                              let body = __eliscript_value_21;
                                              return __GT_Post(identifier, slug, title, field(fields, "description", ""), body, published, updated_field === null ? published : date_value(updated_field), count(authors) > 0 ? authors : vector("dogfood"), tags, field(fields, "cover", null), draft, parse_integer(field(fields, "pinned", "0"), 0), hashMap(keyword("provider"), "markdown", keyword("path"), relative), aliases, vector());
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
function read_posts(root, directory) {
  {
    const __eliscript_value_22 = Path.join(root, directory);
    {
      let absolute = __eliscript_value_22;
      {
        const __eliscript_value_23 = markdown_names(absolute);
        {
          let names = __eliscript_value_23;
          {
            const __eliscript_value_24 = vector();
            {
              let posts = __eliscript_value_24;
              {
                const __eliscript_value_25 = 0;
                {
                  let index = __eliscript_value_25;
                  while (index < count(names)) {
                    {
                      const __eliscript_value_26 = nth(names, index);
                      {
                        let name = __eliscript_value_26;
                        {
                          const __eliscript_value_27 = Path.join(absolute, name);
                          {
                            let path = __eliscript_value_27;
                            {
                              const __eliscript_value_28 = String(directory) + String("/") + String(name);
                              {
                                let relative = __eliscript_value_28;
                                {
                                  const __eliscript_value_29 = split_lines(import_node_fs.readFileSync(path, "utf8"));
                                  {
                                    let lines = __eliscript_value_29;
                                    count(lines) < 3 && fail2("DOGFOOD-CONTENT-002", String(relative) + String(": file is too short to contain front matter"));
                                    !(trim(nth(lines, 0)) === "---") && fail2("DOGFOOD-CONTENT-002", String(relative) + String(": file must open with a --- front matter block"));
                                    {
                                      const __eliscript_value_30 = front_matter_close(lines);
                                      {
                                        let close = __eliscript_value_30;
                                        close < 0 && fail2("DOGFOOD-CONTENT-002", String(relative) + String(": front matter block is not terminated"));
                                        posts = conj(posts, build_post(path, relative, lines, close, parse_fields(lines, 1, close)));
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                    index = index + 1;
                  }
                  return posts;
                }
              }
            }
          }
        }
      }
    }
  }
}
function duplicate_in_QMARK_(posts, field2, label) {
  {
    const __eliscript_value_31 = 0;
    {
      let index = __eliscript_value_31;
      while (index < count(posts)) {
        {
          const __eliscript_value_32 = 0;
          const __eliscript_value_33 = get(nth(posts, index), field2);
          {
            let earlier = __eliscript_value_32;
            let value = __eliscript_value_33;
            while (earlier < index) {
              get(nth(posts, earlier), field2) === value && fail2("DOGFOOD-IDENTITY-001", String("duplicate ") + String(label) + String(' "') + String(value) + String('" in ') + String(get(nth(posts, index)["provenance"], keyword("path"), "")));
              earlier = earlier + 1;
            }
          }
        }
        index = index + 1;
      }
      return null;
    }
  }
}
function check_aliases(posts) {
  {
    const __eliscript_value_34 = hashMap();
    const __eliscript_value_35 = hashMap();
    const __eliscript_value_36 = 0;
    {
      let canonical = __eliscript_value_34;
      let seen = __eliscript_value_35;
      let index = __eliscript_value_36;
      while (index < count(posts)) {
        canonical = assoc(assoc(canonical, nth(posts, index)["slug"], true), nth(posts, index)["id"], true);
        index = index + 1;
      }
      index = 0;
      while (index < count(posts)) {
        {
          const __eliscript_value_37 = nth(posts, index)["aliases"];
          const __eliscript_value_38 = 0;
          {
            let aliases = __eliscript_value_37;
            let alias_index = __eliscript_value_38;
            while (alias_index < count(aliases)) {
              {
                const __eliscript_value_39 = nth(aliases, alias_index);
                {
                  let alias = __eliscript_value_39;
                  __eliscript_truthy9(get(canonical, alias, false)) && fail2("DOGFOOD-IDENTITY-002", String('alias "') + String(alias) + String('" collides with a canonical slug or id'));
                  __eliscript_truthy9(get(seen, alias, false)) && fail2("DOGFOOD-IDENTITY-003", String('duplicate alias "') + String(alias) + String('"'));
                  seen = assoc(seen, alias, true);
                }
              }
              alias_index = alias_index + 1;
            }
          }
        }
        index = index + 1;
      }
      return null;
    }
  }
}
function check_identity(posts) {
  duplicate_in_QMARK_(posts, keyword("id"), "canonical id");
  duplicate_in_QMARK_(posts, keyword("slug"), "slug");
  return check_aliases(posts);
}

// examples/dogfood/dist/src/support/github.mjs
var maximum_pages = 100;
function append_all2(target, values) {
  return reduce(values, (accumulator, value) => {
    return conj(accumulator, value);
  }, target);
}
function link_target(link) {
  {
    const __eliscript_value_1 = index_of("<", link);
    {
      let start = __eliscript_value_1;
      return start < 0 ? null : ((end) => {
        return end < 0 ? null : slice(start + 1, end, link);
      })(index_of(">", link));
    }
  }
}
function next_link(headers) {
  {
    const __eliscript_value_2 = headers["link"] ?? null;
    {
      let link = __eliscript_value_2;
      {
        const __eliscript_value_3 = link === null ? vector() : split_on(",", link);
        {
          let parts = __eliscript_value_3;
          {
            const __eliscript_value_4 = 0;
            {
              let index = __eliscript_value_4;
              {
                const __eliscript_value_5 = null;
                {
                  let found = __eliscript_value_5;
                  while (index < count(parts)) {
                    {
                      const __eliscript_value_6 = nth(parts, index);
                      {
                        let part = __eliscript_value_6;
                        found === null && index_of('rel="next"', part) >= 0 && (found = link_target(part));
                      }
                    }
                    index = index + 1;
                  }
                  return found;
                }
              }
            }
          }
        }
      }
    }
  }
}
async function fetch_paginated(transport, url, label) {
  return await (async (records, pages, next) => {
    await (async () => {
      while (!(next === null) && pages < maximum_pages) {
        ((response) => {
          !((response["status"] ?? 0) === 200) && fail2("DOGFOOD-GITHUB-001", String(label) + String(" failed with status ") + String(response["status"] ?? "unknown"));
          records = append_all2(records, response["body"] ?? vector());
          next = next_link(response["headers"] ?? {});
          return pages = pages + 1;
        })(await transport(next));
      }
      return null;
    })();
    !(next === null) && fail2("DOGFOOD-GITHUB-002", String(label) + String(" exceeded ") + String(maximum_pages) + String(" pages"));
    return records;
  })(vector(), 0, url);
}
function list_url(repository, resource, page_size, label) {
  return String("https://api.github.com/repos/") + String(repository) + String("/") + String(resource) + String("?state=all&per_page=") + String(page_size) + String(label === null ? "" : String("&labels=") + String(label));
}

// examples/dogfood/dist/src/builder/comments.mjs
var __eliscript_truthy10 = (value) => value !== false && value != null;
var default_page_size = 100;
function comment_list_url(repository, number, page_size) {
  return String("https://api.github.com/repos/") + String(repository) + String("/issues/") + String(number) + String("/comments?per_page=") + String(page_size);
}
function normalize_comment(record) {
  {
    const __eliscript_value_1 = record["user"] ?? {};
    {
      let user = __eliscript_value_1;
      return hashMap(keyword("id"), record["id"], keyword("author"), hashMap(keyword("login"), user["login"] ?? "unknown", keyword("url"), user["html_url"] ?? null), keyword("body"), render_markdown(record["body"] ?? ""), keyword("created-at"), record["created_at"] ?? "", keyword("updated-at"), record["updated_at"] ?? "", keyword("url"), record["html_url"] ?? null, keyword("replies"), vector());
    }
  }
}
function normalize_comments(records) {
  return append_all2(vector(), map_comments(records));
}
function map_comments(records) {
  {
    const __eliscript_value_2 = vector();
    const __eliscript_value_3 = 0;
    {
      let result = __eliscript_value_2;
      let index = __eliscript_value_3;
      while (index < count(records)) {
        result = conj(result, normalize_comment(nth(records, index)));
        index = index + 1;
      }
      return result;
    }
  }
}
function freshness(items) {
  {
    const __eliscript_value_4 = "";
    const __eliscript_value_5 = 0;
    {
      let latest = __eliscript_value_4;
      let index = __eliscript_value_5;
      while (index < count(items)) {
        {
          const __eliscript_value_6 = get(nth(items, index), keyword("updated-at"), "");
          {
            let updated = __eliscript_value_6;
            updated > latest && (latest = String(updated));
          }
        }
        index = index + 1;
      }
      return latest;
    }
  }
}
function channel_declaration(comments, kind) {
  {
    const __eliscript_value_7 = get(comments, keyword("channels"), vector());
    const __eliscript_value_8 = 0;
    const __eliscript_value_9 = null;
    {
      let declarations = __eliscript_value_7;
      let index = __eliscript_value_8;
      let found = __eliscript_value_9;
      while (index < count(declarations)) {
        {
          const __eliscript_value_10 = nth(declarations, index);
          {
            let declaration = __eliscript_value_10;
            __eliscript_truthy10(((__eliscript_value_11) => __eliscript_truthy10(__eliscript_value_11) ? get(declaration, keyword("kind"), keyword("none")) === kind : __eliscript_value_11)(get(declaration, keyword("enabled"), false))) && (found = declaration);
          }
        }
        index = index + 1;
      }
      return found;
    }
  }
}
function live_channel(declaration, repository, number) {
  return hashMap(keyword("id"), get(declaration, keyword("id"), keyword("issue-native")), keyword("kind"), get(declaration, keyword("kind"), keyword("issue")), keyword("mode"), keyword("live"), keyword("binding"), hashMap(keyword("repository"), repository, keyword("number"), number), keyword("count"), null, keyword("updated-at"), null, keyword("items"), vector(), keyword("capabilities"), vector(keyword("read"), keyword("reply"), keyword("reactions")));
}
async function snapshot_channel(options) {
  return await (async (declaration) => {
    return await (async (repository) => {
      return await (async (number) => {
        return await (async (transport) => {
          return await (async (mode) => {
            return await (async (page_size) => {
              return ((records) => {
                return ((items) => {
                  return hashMap(keyword("id"), get(declaration, keyword("id"), keyword("issue-native")), keyword("kind"), get(declaration, keyword("kind"), keyword("issue")), keyword("mode"), mode, keyword("binding"), hashMap(keyword("repository"), repository, keyword("number"), number), keyword("count"), count(items), keyword("updated-at"), freshness(items), keyword("items"), items, keyword("capabilities"), vector(keyword("read"), keyword("reply"), keyword("reactions")));
                })(normalize_comments(records));
              })(await fetch_paginated(transport, comment_list_url(repository, number, page_size), "GitHub issue comments"));
            })(get(declaration, keyword("page-size"), default_page_size));
          })(get(declaration, keyword("mode"), keyword("snapshot")));
        })(get(options, keyword("transport")));
      })(get(options, keyword("number")));
    })(get(options, keyword("repository")));
  })(get(options, keyword("declaration")));
}
async function native_channel(options) {
  return await (async (declaration) => {
    return declaration === null ? null : get(declaration, keyword("mode"), keyword("snapshot")) === keyword("live") ? live_channel(declaration, get(options, keyword("repository")), get(options, keyword("number"))) : await snapshot_channel(assoc(options, keyword("declaration"), declaration));
  })(channel_declaration(get(options, keyword("comments")), get(options, keyword("kind"), keyword("issue"))));
}

// examples/dogfood/dist/src/builder/issues.mjs
var __eliscript_truthy11 = (value) => value !== false && value != null;
var default_page_size2 = 100;
function normalize_login(login) {
  return to_lowercase(trim(String(login)));
}
function denied_identity_QMARK_(author) {
  return !((author["type"] ?? "User") === "User") || normalize_login(author["login"] ?? "") === "ghost";
}
function publisher_matches_QMARK_(publisher, author) {
  {
    const __eliscript_value_1 = get(publisher, keyword("id"), null);
    {
      let pinned = __eliscript_value_1;
      return normalize_login(get(publisher, keyword("login"), "")) === normalize_login(author["login"] ?? "") && (pinned === null || pinned === (author["id"] ?? null));
    }
  }
}
function publisher_set(publishing) {
  {
    const __eliscript_value_2 = get(publishing, keyword("owner"), null);
    const __eliscript_value_3 = get(publishing, keyword("coauthors"), vector());
    const __eliscript_value_4 = vector();
    {
      let owner = __eliscript_value_2;
      let coauthors = __eliscript_value_3;
      let result = __eliscript_value_4;
      !(owner === null) && (result = conj(result, owner));
      {
        const __eliscript_value_5 = 0;
        {
          let index = __eliscript_value_5;
          while (index < count(coauthors)) {
            result = conj(result, nth(coauthors, index));
            index = index + 1;
          }
        }
      }
      return result;
    }
  }
}
function authorized_author_QMARK_(publishers, author) {
  return ((__eliscript_value_6) => __eliscript_truthy11(__eliscript_value_6) ? ((index, found) => {
    while (index < count(publishers)) {
      __eliscript_truthy11(publisher_matches_QMARK_(nth(publishers, index), author)) && (found = true);
      index = index + 1;
    }
    return found;
  })(0, false) : __eliscript_value_6)(!__eliscript_truthy11(denied_identity_QMARK_(author)));
}
function identity_after(marker, body) {
  {
    const __eliscript_value_7 = split_lines(body);
    {
      let lines = __eliscript_value_7;
      {
        const __eliscript_value_8 = 0;
        {
          let index = __eliscript_value_8;
          {
            const __eliscript_value_9 = null;
            {
              let found = __eliscript_value_9;
              while (index < count(lines) && found === null) {
                {
                  const __eliscript_value_10 = trim(nth(lines, index));
                  {
                    let line = __eliscript_value_10;
                    __eliscript_truthy11(starts_with_QMARK_(marker, line)) && (found = trim(slice(text_length(marker), text_length(line), line)));
                  }
                }
                index = index + 1;
              }
              return found;
            }
          }
        }
      }
    }
  }
}
function known_identity_QMARK_(identities, value) {
  {
    const __eliscript_value_11 = 0;
    const __eliscript_value_12 = false;
    {
      let index = __eliscript_value_11;
      let found = __eliscript_value_12;
      while (index < count(identities) && !__eliscript_truthy11(found)) {
        nth(identities, index) === value && (found = true);
        index = index + 1;
      }
      return found;
    }
  }
}
function carrier_adapter(adapters, author, body, identities) {
  {
    const __eliscript_value_13 = 0;
    const __eliscript_value_14 = null;
    {
      let index = __eliscript_value_13;
      let found = __eliscript_value_14;
      while (index < count(adapters) && found === null) {
        {
          const __eliscript_value_15 = nth(adapters, index);
          {
            let adapter = __eliscript_value_15;
            {
              const __eliscript_value_16 = get(adapter, keyword("principal"), null);
              {
                let principal = __eliscript_value_16;
                {
                  const __eliscript_value_17 = get(adapter, keyword("marker"), null);
                  {
                    let marker = __eliscript_value_17;
                    get(adapter, keyword("carrier-kind"), keyword("none")) === keyword("issue") && !(principal === null) && !(marker === null) && normalize_login(principal) === normalize_login(author["login"] ?? "") && ((identity2) => {
                      return __eliscript_truthy11(((__eliscript_value_18) => __eliscript_truthy11(__eliscript_value_18) ? known_identity_QMARK_(identities, identity2) : __eliscript_value_18)(!(identity2 === null))) ? found = get(adapter, keyword("id"), null) : null;
                    })(identity_after(marker, body));
                  }
                }
              }
            }
          }
        }
        index = index + 1;
      }
      return found;
    }
  }
}
function metadata_block(lines) {
  {
    const __eliscript_value_19 = 0;
    const __eliscript_value_20 = -1;
    const __eliscript_value_21 = -1;
    const __eliscript_value_22 = count(lines);
    {
      let index = __eliscript_value_19;
      let start = __eliscript_value_20;
      let end = __eliscript_value_21;
      let total = __eliscript_value_22;
      while (index < total && end < 0) {
        {
          const __eliscript_value_23 = trim(nth(lines, index));
          {
            let trimmed = __eliscript_value_23;
            start < 0 && trimmed === "```dogfood" ? start = index : start >= 0 && trimmed === "```" && (end = index);
          }
        }
        index = index + 1;
      }
      return start < 0 || end < 0 ? null : vector(start, end);
    }
  }
}
function issue_fields(body, path) {
  {
    const __eliscript_value_24 = split_lines(body);
    {
      let lines = __eliscript_value_24;
      {
        const __eliscript_value_25 = metadata_block(lines);
        {
          let block = __eliscript_value_25;
          return block === null ? fail2("DOGFOOD-ISSUES-001", String(path) + String(": issue body has no ```dogfood metadata block")) : parse_fields(lines, nth(block, 0, null) + 1, nth(block, 1, null));
        }
      }
    }
  }
}
function issue_markdown(body) {
  {
    const __eliscript_value_26 = split_lines(body);
    {
      let lines = __eliscript_value_26;
      {
        const __eliscript_value_27 = metadata_block(lines);
        {
          let block = __eliscript_value_27;
          {
            const __eliscript_value_28 = block === null ? 0 : nth(block, 1, null) + 1;
            {
              let start = __eliscript_value_28;
              {
                const __eliscript_value_29 = vector();
                {
                  let parts = __eliscript_value_29;
                  {
                    const __eliscript_value_30 = start;
                    {
                      let index = __eliscript_value_30;
                      {
                        const __eliscript_value_31 = count(lines);
                        {
                          let total = __eliscript_value_31;
                          while (index < total) {
                            parts = conj(parts, nth(lines, index));
                            index = index + 1;
                          }
                          return join(`
`, parts);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
function page_size(source) {
  return get(source, keyword("page-size"), default_page_size2);
}
function issue_list_url(source) {
  return list_url(get(source, keyword("repository"), ""), "issues", page_size(source), get(source, keyword("label"), null));
}
async function fetch_issues(transport, url) {
  return await fetch_paginated(transport, url, "GitHub issue listing");
}
function issue_url(source, record) {
  {
    const __eliscript_value_32 = record["html_url"] ?? null;
    {
      let explicit = __eliscript_value_32;
      return explicit === null ? String("https://github.com/") + String(get(source, keyword("repository"), "")) + String("/issues/") + String(record["number"]) : explicit;
    }
  }
}
function normalize_issue(source, record, identity_urls, channel) {
  {
    const __eliscript_value_33 = record["number"];
    {
      let number = __eliscript_value_33;
      {
        const __eliscript_value_34 = get(source, keyword("repository"), "");
        {
          let repository = __eliscript_value_34;
          {
            const __eliscript_value_35 = String(repository) + String("#") + String(number);
            {
              let path = __eliscript_value_35;
              {
                const __eliscript_value_36 = record["body"] ?? "";
                {
                  let body = __eliscript_value_36;
                  {
                    const __eliscript_value_37 = issue_fields(body, path);
                    {
                      let fields = __eliscript_value_37;
                      {
                        const __eliscript_value_38 = require_field(fields, "title", path);
                        {
                          let title = __eliscript_value_38;
                          {
                            const __eliscript_value_39 = field(fields, "slug", null);
                            {
                              let slug_field = __eliscript_value_39;
                              {
                                const __eliscript_value_40 = date_value(field(fields, "date", record["created_at"] ?? ""));
                                {
                                  let published = __eliscript_value_40;
                                  {
                                    const __eliscript_value_41 = field(fields, "updated", null);
                                    {
                                      let updated_raw = __eliscript_value_41;
                                      return __GT_Post(require_field(fields, "id", path), slug_field === null ? slugify(title) : slug_field, title, field(fields, "description", ""), render_markdown(issue_markdown(body)), published, updated_raw === null ? published : date_value(updated_raw), vector(record["user"]["login"] ?? "unknown"), parse_list(field(fields, "tags", "")), null, field(fields, "draft", "false") === "true", parse_integer(field(fields, "pinned", "0"), 0), hashMap(keyword("provider"), "issues", keyword("path"), path, keyword("url"), issue_url(source, record), keyword("revision"), record["updated_at"] ?? ""), parse_list(field(fields, "aliases", "")), __eliscript_truthy11(empty_value_QMARK_(channel)) ? vector() : vector(channel));
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
async function collect_issues(options) {
  return await (async (source) => {
    return await (async (publishing) => {
      return await (async (adapters) => {
        return await (async (comments) => {
          return await (async (identities) => {
            return await (async (transport) => {
              return await (async (publishers) => {
                return await (async (records) => {
                  return await (async (posts) => {
                    return await (async (carriers) => {
                      return await (async (unauthorized) => {
                        return await (async (index) => {
                          return await (async () => {
                            await (async () => {
                              while (index < count(records)) {
                                await (async (record) => {
                                  return await (async (body) => {
                                    return await (async (author) => {
                                      return __eliscript_truthy11(record["pull_request"] ?? null) ? null : !(carrier_adapter(adapters, author, body, identities) === null) ? carriers = carriers + 1 : __eliscript_truthy11(authorized_author_QMARK_(publishers, author)) ? ((channel) => {
                                        return posts = conj(posts, normalize_issue(source, record, identities, channel));
                                      })(await native_channel(hashMap(keyword("comments"), comments, keyword("kind"), keyword("issue"), keyword("repository"), get(source, keyword("repository"), ""), keyword("number"), record["number"], keyword("transport"), transport))) : unauthorized = unauthorized + 1;
                                    })(record["user"] ?? {});
                                  })(record["body"] ?? "");
                                })(nth(records, index));
                                index = index + 1;
                              }
                              return null;
                            })();
                            return hashMap(keyword("posts"), posts, keyword("carriers"), carriers, keyword("unauthorized"), unauthorized, keyword("records"), count(records));
                          })();
                        })(0);
                      })(0);
                    })(0);
                  })(vector());
                })(await fetch_issues(transport, issue_list_url(source)));
              })(publisher_set(publishing));
            })(get(options, keyword("transport")));
          })(get(options, keyword("identities"), vector()));
        })(get(options, keyword("comments"), hashMap()));
      })(get(options, keyword("adapters"), vector()));
    })(get(options, keyword("publishing")));
  })(get(options, keyword("source")));
}

// examples/dogfood/dist/src/builder/discussions.mjs
var __eliscript_truthy12 = (value) => value !== false && value != null;
var default_page_size3 = 50;
var comment_bound = 100;
var maximum_pages2 = 100;
function repository_parts(repository) {
  {
    const __eliscript_value_1 = index_of("/", repository);
    {
      let slash = __eliscript_value_1;
      return slash < 1 ? fail2("DOGFOOD-DISCUSSIONS-001", String('discussion source repository must be "owner/name": ') + String(repository)) : vector(slice(0, slash, repository), slice(slash + 1, count(repository), repository));
    }
  }
}
var author_selection = "author { login __typename ... on User { databaseId } }";
function reply_selection(depth) {
  return depth === 0 ? "" : String(" replies(first: 50) { nodes { id ") + String(author_selection) + String(" body createdAt updatedAt url") + String(reply_selection(depth - 1)) + String(" } }");
}
function comment_selection() {
  return String(" comments(first: ") + String(comment_bound) + String(") { pageInfo { hasNextPage endCursor }") + String(" nodes { id ") + String(author_selection) + String(" body createdAt updatedAt url") + String(reply_selection(2)) + String(" } }");
}
function discussions_query(with_comments) {
  return String("query DogfoodDiscussions($owner: String!, $name: String!, $cursor: String,") + String(" $pageSize: Int!) { repository(owner: $owner, name: $name) {") + String(" discussions(first: $pageSize, after: $cursor,") + String(" orderBy: {field: UPDATED_AT, direction: DESC}) {") + String(" pageInfo { hasNextPage endCursor }") + String(" nodes { number title body createdAt updatedAt url") + String(" category { name } ") + String(author_selection) + String(" answerChosenAt") + String(__eliscript_truthy12(with_comments) ? comment_selection() : "") + String(" } } } }");
}
async function graphql(transport, query, variables) {
  return ((response) => {
    return ((status) => {
      return ((body) => {
        return (() => {
          !(status === 200) && fail2("DOGFOOD-DISCUSSIONS-002", String("GitHub discussion query failed with status ") + String(status));
          !(body === null) && !((body["errors"] ?? null) === null) && fail2("DOGFOOD-DISCUSSIONS-003", String("GitHub discussion query returned errors: ") + String(JSON.stringify(body["errors"])));
          return body["data"]["repository"] ?? null;
        })();
      })(response["body"] ?? null);
    })(response["status"] ?? 0);
  })(await transport({ url: "https://api.github.com/graphql", method: "POST", body: JSON.stringify({ query, variables }) }));
}
async function fetch_discussions(transport, source, with_comments) {
  return await (async (parts) => {
    return await (async (page_size2) => {
      return await (async (query) => {
        return await (async (nodes) => {
          return await (async (pages) => {
            return await (async (cursor) => {
              return await (async (more) => {
                return await (async () => {
                  await (async () => {
                    while (__eliscript_truthy12(((__eliscript_value_2) => __eliscript_truthy12(__eliscript_value_2) ? pages < maximum_pages2 : __eliscript_value_2)(more))) {
                      ((data) => {
                        return ((connection) => {
                          return (() => {
                            connection === null && fail2("DOGFOOD-DISCUSSIONS-004", "discussion query returned no connection");
                            nodes = append_all2(nodes, connection["nodes"] ?? vector());
                            {
                              const __eliscript_value_3 = connection["pageInfo"] ?? {};
                              {
                                let page_info = __eliscript_value_3;
                                more = page_info["hasNextPage"] ?? false, cursor = page_info["endCursor"] ?? null;
                              }
                            }
                            return pages = pages + 1;
                          })();
                        })(data["discussions"] ?? null);
                      })(await graphql(transport, query, { owner: nth(parts, 0, null), name: nth(parts, 1, null), pageSize: page_size2, cursor: cursor === null ? null : cursor }));
                    }
                    return null;
                  })();
                  __eliscript_truthy12(((__eliscript_value_4) => __eliscript_truthy12(__eliscript_value_4) ? pages >= maximum_pages2 : __eliscript_value_4)(more)) && fail2("DOGFOOD-DISCUSSIONS-005", String("discussion listing exceeded ") + String(maximum_pages2) + String(" pages"));
                  return nodes;
                })();
              })(true);
            })(null);
          })(0);
        })(vector());
      })(discussions_query(with_comments));
    })(get(source, keyword("page-size"), default_page_size3));
  })(repository_parts(get(source, keyword("repository"), "")));
}
function comment_record(node) {
  {
    const __eliscript_value_5 = node["author"] ?? null;
    {
      let user = __eliscript_value_5;
      return hashMap(keyword("id"), node["id"], keyword("author"), hashMap(keyword("login"), user["login"] ?? "ghost", keyword("url"), node["url"] ?? null), keyword("body"), render_markdown(node["body"] ?? ""), keyword("created-at"), node["createdAt"] ?? "", keyword("updated-at"), node["updatedAt"] ?? "", keyword("url"), node["url"] ?? null, keyword("replies"), vector());
    }
  }
}
function reply_tree(nodes) {
  {
    const __eliscript_value_6 = vector();
    const __eliscript_value_7 = 0;
    {
      let replies = __eliscript_value_6;
      let index = __eliscript_value_7;
      while (index < count(nodes)) {
        {
          const __eliscript_value_8 = nth(nodes, index);
          {
            let node = __eliscript_value_8;
            {
              const __eliscript_value_9 = (node["replies"] ?? {})["nodes"] ?? vector();
              {
                let children = __eliscript_value_9;
                {
                  const __eliscript_value_10 = (node["replies"] ?? {})["pageInfo"] ?? null;
                  {
                    let page_info = __eliscript_value_10;
                    __eliscript_truthy12(((__eliscript_value_11) => __eliscript_truthy12(__eliscript_value_11) ? page_info["hasNextPage"] ?? false : __eliscript_value_11)(!(page_info === null))) && fail2("DOGFOOD-DISCUSSIONS-006", String("discussion reply tree exceeded ") + String(comment_bound) + String(" replies at ") + String(node["id"] ?? "unknown"));
                    replies = conj(replies, assoc(comment_record(node), keyword("replies"), reply_tree(children)));
                  }
                }
              }
            }
          }
        }
        index = index + 1;
      }
      return replies;
    }
  }
}
function comment_tree(record) {
  {
    const __eliscript_value_12 = record["comments"] ?? {};
    {
      let connection = __eliscript_value_12;
      {
        const __eliscript_value_13 = connection["pageInfo"] ?? {};
        {
          let page_info = __eliscript_value_13;
          {
            const __eliscript_value_14 = connection["nodes"] ?? vector();
            {
              let nodes = __eliscript_value_14;
              __eliscript_truthy12(page_info["hasNextPage"] ?? false) && fail2("DOGFOOD-DISCUSSIONS-007", String("discussion ") + String(record["number"] ?? "unknown") + String(" has more than ") + String(comment_bound) + String(" comments"));
              return reply_tree(nodes);
            }
          }
        }
      }
    }
  }
}
function category_name(record) {
  return (record["category"] ?? {})["name"] ?? "";
}
function allowed_category_QMARK_(source, record) {
  {
    const __eliscript_value_15 = get(source, keyword("category"), null);
    const __eliscript_value_16 = category_name(record);
    {
      let allowed = __eliscript_value_15;
      let category = __eliscript_value_16;
      return allowed === null || allowed === category;
    }
  }
}
function discussion_author(record) {
  {
    const __eliscript_value_17 = record["author"] ?? null;
    {
      let author = __eliscript_value_17;
      {
        const __eliscript_value_18 = author === null ? "User" : author["__typename"] ?? "User";
        {
          let kind = __eliscript_value_18;
          return { login: author["login"] ?? "ghost", id: author["databaseId"] ?? null, type: kind === "User" ? "User" : kind };
        }
      }
    }
  }
}
function discussion_channel(declaration, repository, record, items) {
  return hashMap(keyword("id"), get(declaration, keyword("id"), keyword("discussion-native")), keyword("kind"), keyword("discussion"), keyword("mode"), get(declaration, keyword("mode"), keyword("snapshot")), keyword("binding"), hashMap(keyword("repository"), repository, keyword("number"), record["number"]), keyword("count"), count(items), keyword("updated-at"), freshness(items), keyword("items"), items, keyword("capabilities"), vector(keyword("read"), keyword("reply"), keyword("nested-replies"), keyword("reactions"), keyword("moderation")));
}
function normalize_discussion(source, record, items, channel) {
  {
    const __eliscript_value_19 = record["number"];
    {
      let number = __eliscript_value_19;
      {
        const __eliscript_value_20 = get(source, keyword("repository"), "");
        {
          let repository = __eliscript_value_20;
          {
            const __eliscript_value_21 = String(repository) + String("#") + String(number);
            {
              let path = __eliscript_value_21;
              {
                const __eliscript_value_22 = issue_fields(record["body"] ?? "", path);
                {
                  let fields = __eliscript_value_22;
                  {
                    const __eliscript_value_23 = require_field(fields, "title", path);
                    {
                      let title = __eliscript_value_23;
                      {
                        const __eliscript_value_24 = field(fields, "slug", null);
                        {
                          let slug_field = __eliscript_value_24;
                          {
                            const __eliscript_value_25 = date_value(field(fields, "date", record["createdAt"] ?? ""));
                            {
                              let published = __eliscript_value_25;
                              {
                                const __eliscript_value_26 = field(fields, "updated", null);
                                {
                                  let updated_raw = __eliscript_value_26;
                                  return __GT_Post(require_field(fields, "id", path), slug_field === null ? slugify(title) : slug_field, title, field(fields, "description", ""), render_markdown(issue_markdown(record["body"] ?? "")), published, updated_raw === null ? published : date_value(updated_raw), vector((record["author"] ?? {})["login"] ?? "unknown"), parse_list(field(fields, "tags", "")), null, field(fields, "draft", "false") === "true", parse_integer(field(fields, "pinned", "0"), 0), hashMap(keyword("provider"), "discussions", keyword("path"), path, keyword("url"), record["url"] ?? null, keyword("revision"), record["updatedAt"] ?? ""), parse_list(field(fields, "aliases", "")), __eliscript_truthy12(empty_value_QMARK_(channel)) ? vector() : vector(channel));
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
async function collect_discussions(options) {
  return await (async (source) => {
    return await (async (publishing) => {
      return await (async (adapters) => {
        return await (async (identities) => {
          return await (async (comments) => {
            return await (async (declaration) => {
              return await (async (with_comments) => {
                return await (async (transport) => {
                  return await (async (publishers) => {
                    return ((records) => {
                      return ((posts) => {
                        return ((carriers) => {
                          return ((unauthorized) => {
                            return ((index) => {
                              return (() => {
                                while (index < count(records)) {
                                  {
                                    const __eliscript_value_27 = nth(records, index);
                                    {
                                      let record = __eliscript_value_27;
                                      {
                                        const __eliscript_value_28 = record["body"] ?? "";
                                        {
                                          let body = __eliscript_value_28;
                                          {
                                            const __eliscript_value_29 = discussion_author(record);
                                            {
                                              let author = __eliscript_value_29;
                                              !(carrier_adapter(adapters, author, body, identities) === null) ? carriers = carriers + 1 : !__eliscript_truthy12(allowed_category_QMARK_(source, record)) || (__eliscript_truthy12(authorized_author_QMARK_(publishers, author)) ? ((items) => {
                                                return ((channel) => {
                                                  return posts = conj(posts, normalize_discussion(source, record, items, channel));
                                                })(declaration === null ? null : discussion_channel(declaration, get(source, keyword("repository"), ""), record, items));
                                              })(__eliscript_truthy12(with_comments) ? comment_tree(record) : vector()) : unauthorized = unauthorized + 1);
                                            }
                                          }
                                        }
                                      }
                                    }
                                  }
                                  index = index + 1;
                                }
                                return hashMap(keyword("posts"), posts, keyword("carriers"), carriers, keyword("unauthorized"), unauthorized, keyword("records"), count(records));
                              })();
                            })(0);
                          })(0);
                        })(0);
                      })(vector());
                    })(await fetch_discussions(transport, source, with_comments));
                  })(publisher_set(publishing));
                })(get(options, keyword("transport")));
              })(!(declaration === null) && !(get(declaration, keyword("mode"), keyword("snapshot")) === keyword("live")));
            })(channel_declaration(comments, keyword("discussion")));
          })(get(options, keyword("comments"), hashMap()));
        })(get(options, keyword("identities"), vector()));
      })(get(options, keyword("adapters"), vector()));
    })(get(options, keyword("publishing")));
  })(get(options, keyword("source")));
}

// examples/dogfood/dist/src/builder/events.mjs
var __eliscript_truthy13 = (value) => value !== false && value != null;
var article_events = vector("push", "schedule", "workflow_dispatch", "issues", "release");
var comment_events = vector("issue_comment", "discussion_comment", "discussions");
var content_events = vector("issues", "release");
var article_policies = vector(keyword("push"), keyword("event"), keyword("scheduled"), keyword("manual"), keyword("hybrid"));
var comment_policies = vector(keyword("runtime"), keyword("external"), keyword("scheduled"), keyword("manual"), keyword("hybrid"), keyword("event"));
function member_QMARK_(values, needle) {
  {
    const __eliscript_value_1 = 0;
    const __eliscript_value_2 = false;
    {
      let index = __eliscript_value_1;
      let found = __eliscript_value_2;
      while (index < count(values) && !__eliscript_truthy13(found)) {
        nth(values, index) === needle && (found = true);
        index = index + 1;
      }
      return found;
    }
  }
}
function classification(subject, event_name, action, payload) {
  return hashMap(keyword("subject"), subject, keyword("event"), event_name, keyword("action"), action, keyword("payload"), payload);
}
function classify_event(event_name, payload) {
  {
    const __eliscript_value_3 = get(payload, "action", "");
    {
      let action = __eliscript_value_3;
      return __eliscript_truthy13(member_QMARK_(article_events, event_name)) ? classification(keyword("articles"), event_name, action, payload) : __eliscript_truthy13(member_QMARK_(comment_events, event_name)) ? classification(keyword("comments"), event_name, action, payload) : classification(keyword("unknown"), event_name, action, payload);
    }
  }
}
function refresh_value(config, area, fallback) {
  {
    const __eliscript_value_4 = get(config, keyword("refresh"), hashMap());
    {
      let refresh = __eliscript_value_4;
      return get(refresh, area, fallback);
    }
  }
}
function article_builds_QMARK_(policy, event_name) {
  return event_name === "workflow_dispatch" ? true : policy === keyword("push") ? event_name === "push" : policy === keyword("event") ? member_QMARK_(content_events, event_name) : policy === keyword("scheduled") ? event_name === "schedule" : policy === keyword("manual") ? false : policy === keyword("hybrid") ? ((__eliscript_value_5) => __eliscript_truthy13(__eliscript_value_5) ? __eliscript_value_5 : ((__eliscript_value_6) => __eliscript_truthy13(__eliscript_value_6) ? __eliscript_value_6 : member_QMARK_(content_events, event_name))(event_name === "schedule"))(event_name === "push") : false;
}
function build_decision(config, classification2, forced) {
  {
    const __eliscript_value_7 = get(classification2, keyword("subject"), keyword("unknown"));
    const __eliscript_value_8 = get(classification2, keyword("event"), "");
    {
      let subject = __eliscript_value_7;
      let event_name = __eliscript_value_8;
      return __eliscript_truthy13(forced) ? hashMap(keyword("build"), true, keyword("reason"), "forced", keyword("subject"), subject) : subject === keyword("articles") ? ((policy) => {
        return __eliscript_truthy13(article_builds_QMARK_(policy, event_name)) ? hashMap(keyword("build"), true, keyword("reason"), "changed", keyword("subject"), keyword("articles")) : hashMap(keyword("build"), false, keyword("reason"), "deferred", keyword("subject"), keyword("articles"), keyword("refresh"), policy);
      })(refresh_value(config, keyword("articles"), keyword("push"))) : subject === keyword("comments") ? ((policy) => {
        return policy === keyword("event") ? hashMap(keyword("build"), true, keyword("reason"), "changed", keyword("subject"), keyword("comments")) : hashMap(keyword("build"), false, keyword("reason"), "deferred", keyword("subject"), keyword("comments"), keyword("refresh"), policy);
      })(refresh_value(config, keyword("comments"), keyword("runtime"))) : hashMap(keyword("build"), false, keyword("reason"), "deferred", keyword("subject"), keyword("unknown"));
    }
  }
}
function requested_event() {
  return classification(keyword("articles"), "workflow_dispatch", "requested", hashMap());
}

// examples/dogfood/dist/src/builder/channels.mjs
var __eliscript_truthy14 = (value) => value !== false && value != null;
var browser_only_kinds = vector(keyword("external"), keyword("none"));
function member_keyword_QMARK_(values, needle) {
  {
    const __eliscript_value_1 = 0;
    const __eliscript_value_2 = false;
    {
      let index = __eliscript_value_1;
      let found = __eliscript_value_2;
      while (index < count(values) && !__eliscript_truthy14(found)) {
        nth(values, index) === needle && (found = true);
        index = index + 1;
      }
      return found;
    }
  }
}
function find_adapter(adapters, id) {
  {
    const __eliscript_value_3 = 0;
    const __eliscript_value_4 = null;
    {
      let index = __eliscript_value_3;
      let found = __eliscript_value_4;
      while (index < count(adapters)) {
        {
          const __eliscript_value_5 = nth(adapters, index);
          {
            let adapter = __eliscript_value_5;
            get(adapter, keyword("id"), null) === id && (found = adapter);
          }
        }
        index = index + 1;
      }
      return found;
    }
  }
}
function carrier_kind_of(adapters, kind) {
  {
    const __eliscript_value_6 = find_adapter(adapters, kind);
    {
      let adapter = __eliscript_value_6;
      return adapter === null ? keyword("external") : get(adapter, keyword("carrier-kind"), keyword("external"));
    }
  }
}
function enabled_channels(config) {
  {
    const __eliscript_value_7 = get(config, keyword("comments"), hashMap());
    {
      let comments = __eliscript_value_7;
      return filter((channel) => {
        return get(channel, keyword("enabled"), false);
      }, get(comments, keyword("channels"), vector()));
    }
  }
}
function browser_only_channel_QMARK_(adapters, channel) {
  return member_keyword_QMARK_(browser_only_kinds, carrier_kind_of(adapters, get(channel, keyword("kind"), null)));
}
function channel_present_QMARK_(post, id) {
  {
    const __eliscript_value_8 = get(post, keyword("comment-channels"), vector());
    const __eliscript_value_9 = 0;
    const __eliscript_value_10 = false;
    {
      let channels = __eliscript_value_8;
      let index = __eliscript_value_9;
      let found = __eliscript_value_10;
      while (index < count(channels) && !__eliscript_truthy14(found)) {
        get(nth(channels, index), keyword("id"), null) === id && (found = true);
        index = index + 1;
      }
      return found;
    }
  }
}
function provider_url(adapter) {
  return adapter === null ? null : ((origins) => {
    return count(origins) === 0 ? null : nth(origins, 0);
  })(get(adapter, keyword("origins"), vector()));
}
function declared_channel(channel, adapter) {
  return hashMap(keyword("id"), get(channel, keyword("id"), null), keyword("kind"), get(channel, keyword("kind"), null), keyword("mode"), get(channel, keyword("mode"), keyword("embed")), keyword("items"), vector(), keyword("count"), 0, keyword("binding"), null, keyword("provider-url"), provider_url(adapter));
}
function attach_to_post(post, channels, adapters) {
  {
    const __eliscript_value_11 = vector();
    {
      let added = __eliscript_value_11;
      {
        const __eliscript_value_12 = 0;
        {
          let index = __eliscript_value_12;
          while (index < count(channels)) {
            {
              const __eliscript_value_13 = nth(channels, index);
              {
                let channel = __eliscript_value_13;
                !__eliscript_truthy14(channel_present_QMARK_(post, get(channel, keyword("id"), null))) && (added = conj(added, declared_channel(channel, find_adapter(adapters, get(channel, keyword("kind"), null)))));
              }
            }
            index = index + 1;
          }
        }
      }
      return count(added) === 0 ? post : post_with_channels(post, append_all3(get(post, keyword("comment-channels"), vector()), added));
    }
  }
}
function append_all3(left, right) {
  {
    const __eliscript_value_14 = left;
    const __eliscript_value_15 = 0;
    {
      let result = __eliscript_value_14;
      let index = __eliscript_value_15;
      while (index < count(right)) {
        result = conj(result, nth(right, index));
        index = index + 1;
      }
      return result;
    }
  }
}
function post_with_channels(post, channels) {
  return __GT_Post(post["id"], post["slug"], post["title"], post["summary"], post["body"], post["published-at"], post["updated-at"], post["authors"], post["tags"], post["cover"], post["draft"], post["pinned-weight"], post["provenance"], post["aliases"], channels);
}
function attach_configured_channels(config, posts) {
  {
    const __eliscript_value_16 = get(config, keyword("adapters"), vector());
    {
      let adapters = __eliscript_value_16;
      {
        const __eliscript_value_17 = filter((channel) => {
          return browser_only_channel_QMARK_(adapters, channel);
        }, enabled_channels(config));
        {
          let channels = __eliscript_value_17;
          return count(channels) === 0 ? posts : ((result, index) => {
            while (index < count(posts)) {
              result = conj(result, attach_to_post(nth(posts, index), channels, adapters));
              index = index + 1;
            }
            return result;
          })(vector(), 0);
        }
      }
    }
  }
}
function snapshot_count(posts) {
  {
    const __eliscript_value_18 = 0;
    const __eliscript_value_19 = 0;
    {
      let total = __eliscript_value_18;
      let index = __eliscript_value_19;
      while (index < count(posts)) {
        {
          const __eliscript_value_20 = get(nth(posts, index), keyword("comment-channels"), vector());
          {
            let channels = __eliscript_value_20;
            {
              const __eliscript_value_21 = 0;
              {
                let channel_index = __eliscript_value_21;
                while (channel_index < count(channels)) {
                  {
                    const __eliscript_value_22 = get(nth(channels, channel_index), keyword("mode"), keyword("snapshot"));
                    {
                      let mode = __eliscript_value_22;
                      (mode === keyword("snapshot") || mode === keyword("hybrid")) && (total = total + 1);
                    }
                  }
                  channel_index = channel_index + 1;
                }
              }
            }
          }
        }
        index = index + 1;
      }
      return total;
    }
  }
}

// examples/dogfood/dist/src/builder/identity.mjs
var __eliscript_truthy15 = (value) => value !== false && value != null;
var authority_only = vector(keyword("slug"), keyword("body"));
var comparable_fields = vector(keyword("title"), keyword("summary"), keyword("published-at"), keyword("updated-at"), keyword("authors"), keyword("tags"), keyword("cover"), keyword("draft"), keyword("pinned-weight"));
function merged_field(post, overrides, key) {
  return get(overrides, key, get(post, key, null));
}
function post_with(post, overrides) {
  return __GT_Post(merged_field(post, overrides, keyword("id")), merged_field(post, overrides, keyword("slug")), merged_field(post, overrides, keyword("title")), merged_field(post, overrides, keyword("summary")), merged_field(post, overrides, keyword("body")), merged_field(post, overrides, keyword("published-at")), merged_field(post, overrides, keyword("updated-at")), merged_field(post, overrides, keyword("authors")), merged_field(post, overrides, keyword("tags")), merged_field(post, overrides, keyword("cover")), merged_field(post, overrides, keyword("draft")), merged_field(post, overrides, keyword("pinned-weight")), merged_field(post, overrides, keyword("provenance")), merged_field(post, overrides, keyword("aliases")), merged_field(post, overrides, keyword("comment-channels")));
}
var provider_of = hashMap(keyword("markdown"), "markdown", keyword("issue"), "issues", keyword("discussion"), "discussions");
function projection_matches_QMARK_(projection, post) {
  {
    const __eliscript_value_1 = get(projection, keyword("source"), null);
    {
      let source = __eliscript_value_1;
      {
        const __eliscript_value_2 = get(provider_of, source, "");
        {
          let provider = __eliscript_value_2;
          {
            const __eliscript_value_3 = post["provenance"];
            {
              let provenance = __eliscript_value_3;
              {
                const __eliscript_value_4 = get(projection, keyword("repository"), "");
                {
                  let repository = __eliscript_value_4;
                  {
                    const __eliscript_value_5 = get(projection, keyword("number"), null);
                    {
                      let number = __eliscript_value_5;
                      {
                        const __eliscript_value_6 = number === null ? repository : String(repository) + String("#") + String(number);
                        {
                          let path = __eliscript_value_6;
                          return !(provider === "") && get(provenance, keyword("provider"), "") === provider && get(provenance, keyword("path"), "") === path;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
function group_by_id(posts) {
  {
    const __eliscript_value_7 = hashMap();
    const __eliscript_value_8 = 0;
    {
      let groups = __eliscript_value_7;
      let index = __eliscript_value_8;
      while (index < count(posts)) {
        {
          const __eliscript_value_9 = nth(posts, index);
          {
            let post = __eliscript_value_9;
            {
              const __eliscript_value_10 = post["id"];
              {
                let id = __eliscript_value_10;
                {
                  const __eliscript_value_11 = get(groups, id, null);
                  {
                    let existing = __eliscript_value_11;
                    groups = assoc(groups, id, existing === null ? vector(post) : conj(existing, post));
                  }
                }
              }
            }
          }
        }
        index = index + 1;
      }
      return groups;
    }
  }
}
function provenance_text(post) {
  {
    const __eliscript_value_12 = post["provenance"];
    {
      let provenance = __eliscript_value_12;
      return String(get(provenance, keyword("provider"), "unknown")) + String(" ") + String(get(provenance, keyword("path"), "unknown"));
    }
  }
}
function values_equal_QMARK_(left, right) {
  return equalValues(left, right);
}
function declared_fields(declaration, projection) {
  return dedupe(append_all2(get(declaration, keyword("fields"), vector()), get(projection, keyword("fields"), vector())));
}
function declared_QMARK_(fields, key) {
  {
    const __eliscript_value_13 = 0;
    const __eliscript_value_14 = false;
    {
      let index = __eliscript_value_13;
      let found = __eliscript_value_14;
      while (index < count(fields)) {
        nth(fields, index) === key && (found = true);
        index = index + 1;
      }
      return found;
    }
  }
}
function check_agreement(authority, projected, projection, fields) {
  {
    const __eliscript_value_15 = 0;
    {
      let index = __eliscript_value_15;
      while (index < count(comparable_fields)) {
        {
          const __eliscript_value_16 = nth(comparable_fields, index);
          {
            let key = __eliscript_value_16;
            !__eliscript_truthy15(values_equal_QMARK_(get(authority, key, null), get(projected, key, null))) && !__eliscript_truthy15(declared_QMARK_(fields, key)) && fail2("DOGFOOD-IDENTITY-004", String("projection ") + String(provenance_text(projected)) + String(" disagrees with authority ") + String(provenance_text(authority)) + String(" on ") + String(String(key)));
          }
        }
        index = index + 1;
      }
      return null;
    }
  }
}
function check_authority_only(authority, projected, projection, fields) {
  {
    const __eliscript_value_17 = 0;
    {
      let index = __eliscript_value_17;
      while (index < count(authority_only)) {
        {
          const __eliscript_value_18 = nth(authority_only, index);
          {
            let key = __eliscript_value_18;
            {
              const __eliscript_value_19 = ((__eliscript_value_20) => __eliscript_truthy15(__eliscript_value_20) ? contains_value_QMARK_(projected["aliases"], projected["slug"]) : __eliscript_value_20)(String(key) === ":slug");
              {
                let alias_QMARK_ = __eliscript_value_19;
                !__eliscript_truthy15(values_equal_QMARK_(get(authority, key, null), get(projected, key, null))) && !__eliscript_truthy15(declared_QMARK_(fields, key)) && !__eliscript_truthy15(alias_QMARK_) && fail2("DOGFOOD-IDENTITY-005", String("projection ") + String(provenance_text(projected)) + String(" differs from authority ") + String(provenance_text(authority)) + String(" on ") + String(String(key)) + String(" without an alias or a declared field"));
              }
            }
          }
        }
        index = index + 1;
      }
      return null;
    }
  }
}
function contains_value_QMARK_(values, needle) {
  {
    const __eliscript_value_21 = 0;
    const __eliscript_value_22 = false;
    {
      let index = __eliscript_value_21;
      let found = __eliscript_value_22;
      while (index < count(values) && !__eliscript_truthy15(found)) {
        nth(values, index) === needle && (found = true);
        index = index + 1;
      }
      return found;
    }
  }
}
function merged_overrides(authority, projected, fields) {
  {
    const __eliscript_value_23 = hashMap();
    {
      let overrides = __eliscript_value_23;
      {
        const __eliscript_value_24 = 0;
        {
          let index = __eliscript_value_24;
          while (index < count(fields)) {
            {
              const __eliscript_value_25 = nth(fields, index);
              {
                let key = __eliscript_value_25;
                overrides = assoc(overrides, key, get(projected, key, null));
              }
            }
            index = index + 1;
          }
        }
      }
      overrides = assoc(overrides, keyword("comment-channels"), append_all2(authority["comment-channels"], projected["comment-channels"]));
      overrides = assoc(overrides, keyword("aliases"), dedupe(append_all2(authority["aliases"], projected["aliases"])));
      return overrides;
    }
  }
}
function dedupe(values) {
  {
    const __eliscript_value_26 = vector();
    const __eliscript_value_27 = 0;
    {
      let result = __eliscript_value_26;
      let index = __eliscript_value_27;
      while (index < count(values)) {
        {
          const __eliscript_value_28 = nth(values, index);
          {
            let value = __eliscript_value_28;
            !__eliscript_truthy15(contains_value_QMARK_(result, value)) && (result = conj(result, value));
          }
        }
        index = index + 1;
      }
      return result;
    }
  }
}
function resolve_projection(declaration, group) {
  {
    const __eliscript_value_29 = get(declaration, keyword("id"), "");
    {
      let id = __eliscript_value_29;
      {
        const __eliscript_value_30 = get(declaration, keyword("authority"), null);
        {
          let authority_source = __eliscript_value_30;
          {
            const __eliscript_value_31 = get(declaration, keyword("projections"), vector());
            {
              let projections = __eliscript_value_31;
              {
                const __eliscript_value_32 = null;
                {
                  let authority = __eliscript_value_32;
                  {
                    const __eliscript_value_33 = 0;
                    {
                      let projection_index = __eliscript_value_33;
                      {
                        const __eliscript_value_34 = hashMap();
                        {
                          let overrides = __eliscript_value_34;
                          {
                            const __eliscript_value_35 = 0;
                            {
                              let index = __eliscript_value_35;
                              while (index < count(group)) {
                                {
                                  const __eliscript_value_36 = nth(group, index);
                                  {
                                    let post = __eliscript_value_36;
                                    {
                                      const __eliscript_value_37 = get(post["provenance"], keyword("provider"), "");
                                      {
                                        let provider = __eliscript_value_37;
                                        {
                                          const __eliscript_value_38 = get(provider_of, authority_source, "");
                                          {
                                            let expected = __eliscript_value_38;
                                            authority === null && provider === expected && (authority = post);
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                                index = index + 1;
                              }
                            }
                          }
                          authority === null && fail2("DOGFOOD-IDENTITY-006", String('projection for "') + String(id) + String('" names authority ') + String(String(authority_source)) + String(" but no record from that source carries the id"));
                          while (projection_index < count(projections)) {
                            {
                              const __eliscript_value_39 = nth(projections, projection_index);
                              {
                                let projection = __eliscript_value_39;
                                {
                                  const __eliscript_value_40 = null;
                                  {
                                    let matched = __eliscript_value_40;
                                    {
                                      const __eliscript_value_41 = 0;
                                      {
                                        let index = __eliscript_value_41;
                                        while (index < count(group)) {
                                          {
                                            const __eliscript_value_42 = nth(group, index);
                                            {
                                              let post = __eliscript_value_42;
                                              __eliscript_truthy15(projection_matches_QMARK_(projection, post)) && (matched = post);
                                            }
                                          }
                                          index = index + 1;
                                        }
                                        matched === null && fail2("DOGFOOD-IDENTITY-007", String('projection for "') + String(id) + String('" names a record that was not collected: ') + String(String(get(projection, keyword("source"), ""))) + String(" ") + String(String(get(projection, keyword("repository"), ""))) + String("#") + String(String(get(projection, keyword("number"), null))));
                                        {
                                          const __eliscript_value_43 = declared_fields(declaration, projection);
                                          {
                                            let fields = __eliscript_value_43;
                                            check_agreement(authority, matched, projection, fields);
                                            check_authority_only(authority, matched, projection, fields);
                                            overrides = merged_overrides(authority, matched, fields);
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                            projection_index = projection_index + 1;
                          }
                          return post_with(authority, overrides);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
function resolve_identity(config, posts) {
  {
    const __eliscript_value_44 = get(config, keyword("identity"), hashMap());
    {
      let identity2 = __eliscript_value_44;
      {
        const __eliscript_value_45 = get(identity2, keyword("projections"), vector());
        {
          let declarations = __eliscript_value_45;
          {
            const __eliscript_value_46 = group_by_id(posts);
            {
              let groups = __eliscript_value_46;
              {
                const __eliscript_value_47 = distinct_ids(posts);
                {
                  let ids = __eliscript_value_47;
                  {
                    const __eliscript_value_48 = vector();
                    {
                      let resolved = __eliscript_value_48;
                      {
                        const __eliscript_value_49 = 0;
                        {
                          let index = __eliscript_value_49;
                          while (index < count(ids)) {
                            {
                              const __eliscript_value_50 = nth(ids, index);
                              {
                                let id = __eliscript_value_50;
                                {
                                  const __eliscript_value_51 = get(groups, id);
                                  {
                                    let group = __eliscript_value_51;
                                    {
                                      const __eliscript_value_52 = find_declaration(declarations, id);
                                      {
                                        let declaration = __eliscript_value_52;
                                        count(group) === 1 ? resolved = conj(resolved, nth(group, 0)) : declaration === null ? fail2("DOGFOOD-IDENTITY-001", String('duplicate canonical id "') + String(id) + String('" from ') + String(join(", ", map_provenance(group))) + String("; declare a projection to resolve it")) : resolved = conj(resolved, resolve_projection(declaration, group));
                                      }
                                    }
                                  }
                                }
                              }
                            }
                            index = index + 1;
                          }
                          return resolved;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
function distinct_ids(posts) {
  {
    const __eliscript_value_53 = vector();
    const __eliscript_value_54 = 0;
    {
      let ids = __eliscript_value_53;
      let index = __eliscript_value_54;
      while (index < count(posts)) {
        {
          const __eliscript_value_55 = nth(posts, index)["id"];
          {
            let id = __eliscript_value_55;
            !__eliscript_truthy15(contains_value_QMARK_(ids, id)) && (ids = conj(ids, id));
          }
        }
        index = index + 1;
      }
      return ids;
    }
  }
}
function find_declaration(declarations, id) {
  {
    const __eliscript_value_56 = 0;
    const __eliscript_value_57 = null;
    {
      let index = __eliscript_value_56;
      let found = __eliscript_value_57;
      while (index < count(declarations)) {
        get(nth(declarations, index), keyword("id"), "") === id && (found = nth(declarations, index));
        index = index + 1;
      }
      return found;
    }
  }
}
function map_provenance(posts) {
  {
    const __eliscript_value_58 = vector();
    const __eliscript_value_59 = 0;
    {
      let result = __eliscript_value_58;
      let index = __eliscript_value_59;
      while (index < count(posts)) {
        result = conj(result, provenance_text(nth(posts, index)));
        index = index + 1;
      }
      return result;
    }
  }
}

// examples/dogfood/dist/src/builder/preflight.mjs
var __eliscript_truthy16 = (value) => value !== false && value != null;
function repository_name(payload) {
  {
    const __eliscript_value_1 = payload["repository"] ?? null;
    {
      let repository = __eliscript_value_1;
      return repository === null ? "" : String(repository["full_name"] ?? "");
    }
  }
}
function event_record(event_name, payload) {
  return event_name === "issues" ? ((issue) => {
    return issue === null ? null : hashMap(keyword("kind"), keyword("issues"), keyword("record"), issue, keyword("author"), issue["user"] ?? null);
  })(payload["issue"] ?? null) : event_name === "discussions" ? ((discussion) => {
    return discussion === null ? null : hashMap(keyword("kind"), keyword("discussions"), keyword("record"), discussion, keyword("author"), discussion["user"] ?? null);
  })(payload["discussion"] ?? null) : null;
}
function record_field(record, key) {
  return get(record, key, null);
}
function enabled_sources_of_kind(config, kind) {
  return filter((source) => {
    return ((__eliscript_value_2) => __eliscript_truthy16(__eliscript_value_2) ? get(source, keyword("kind"), keyword("markdown")) === kind : __eliscript_value_2)(get(source, keyword("enabled"), false));
  }, get(config, keyword("sources"), vector()));
}
function matching_source(config, kind, repository) {
  {
    const __eliscript_value_3 = enabled_sources_of_kind(config, kind);
    const __eliscript_value_4 = 0;
    const __eliscript_value_5 = null;
    {
      let sources = __eliscript_value_3;
      let index = __eliscript_value_4;
      let found = __eliscript_value_5;
      while (index < count(sources)) {
        {
          const __eliscript_value_6 = nth(sources, index);
          {
            let source = __eliscript_value_6;
            get(source, keyword("repository"), "") === repository && (found = source);
          }
        }
        index = index + 1;
      }
      return found;
    }
  }
}
function labelled_for_publication_QMARK_(source, issue) {
  {
    const __eliscript_value_7 = get(source, keyword("label"), "");
    const __eliscript_value_8 = issue["labels"] ?? [];
    const __eliscript_value_9 = 0;
    const __eliscript_value_10 = false;
    {
      let required = __eliscript_value_7;
      let labels = __eliscript_value_8;
      let index = __eliscript_value_9;
      let found = __eliscript_value_10;
      while (index < (labels ?? []).length) {
        (((labels ?? [])[index] ?? null)["name"] ?? "") === required && (found = true);
        index = index + 1;
      }
      return found;
    }
  }
}
function carrier_shaped_QMARK_(config, author, body) {
  {
    const __eliscript_value_11 = get(config, keyword("adapters"), vector());
    const __eliscript_value_12 = 0;
    const __eliscript_value_13 = false;
    {
      let adapters = __eliscript_value_11;
      let index = __eliscript_value_12;
      let found = __eliscript_value_13;
      while (index < count(adapters)) {
        {
          const __eliscript_value_14 = nth(adapters, index);
          {
            let adapter = __eliscript_value_14;
            {
              const __eliscript_value_15 = get(adapter, keyword("principal"), null);
              {
                let principal = __eliscript_value_15;
                {
                  const __eliscript_value_16 = get(adapter, keyword("marker"), null);
                  {
                    let marker = __eliscript_value_16;
                    {
                      const __eliscript_value_17 = login_of(author);
                      {
                        let login = __eliscript_value_17;
                        __eliscript_truthy16(((__eliscript_value_18) => __eliscript_truthy16(__eliscript_value_18) ? ((__eliscript_value_19) => __eliscript_truthy16(__eliscript_value_19) ? ((__eliscript_value_20) => __eliscript_truthy16(__eliscript_value_20) ? ((__eliscript_value_21) => __eliscript_truthy16(__eliscript_value_21) ? contains_QMARK_(String(marker), String(body)) : __eliscript_value_21)(to_lowercase(login) === to_lowercase(String(principal))) : __eliscript_value_20)(!(marker === null)) : __eliscript_value_19)(!(principal === null)) : __eliscript_value_18)(get(adapter, keyword("carrier-kind"), keyword("none")) === keyword("issue"))) && (found = true);
                      }
                    }
                  }
                }
              }
            }
          }
        }
        index = index + 1;
      }
      return found;
    }
  }
}
function source_skip(config, kind, source, body, author) {
  return kind === keyword("issues") && !__eliscript_truthy16(labelled_for_publication_QMARK_(source, body)) ? String("the issue is not labelled ") + String(get(source, keyword("label"), "")) : kind === keyword("discussions") && !__eliscript_truthy16(allowed_category_QMARK_(source, body)) ? "the discussion is in a category that is not published" : __eliscript_truthy16(carrier_shaped_QMARK_(config, author, body_of(body))) ? "the record is a comment carrier" : !__eliscript_truthy16(authorized_author_QMARK_(publisher_set(get(config, keyword("publishing"), hashMap())), author)) ? String("the author ") + String(login_of(author)) + String(" is not a publisher") : "";
}
function record_skip(config, record, repository) {
  {
    const __eliscript_value_22 = record_field(record, keyword("kind"));
    {
      let kind = __eliscript_value_22;
      {
        const __eliscript_value_23 = record_field(record, keyword("record"));
        {
          let body = __eliscript_value_23;
          {
            const __eliscript_value_24 = record_field(record, keyword("author"));
            {
              let author = __eliscript_value_24;
              {
                const __eliscript_value_25 = matching_source(config, kind, repository);
                {
                  let source = __eliscript_value_25;
                  return !((body["pull_request"] ?? null) === null) ? "the record is a pull request, not an article" : source === null ? String("no enabled ") + String(name_of(kind)) + String(" source selects ") + String(repository) : source_skip(config, kind, source, body, author);
                }
              }
            }
          }
        }
      }
    }
  }
}
function skip_decision(config, classification2) {
  {
    const __eliscript_value_26 = get(classification2, keyword("event"), "");
    {
      let event_name = __eliscript_value_26;
      {
        const __eliscript_value_27 = get(classification2, keyword("payload"), hashMap());
        {
          let payload = __eliscript_value_27;
          {
            const __eliscript_value_28 = event_record(event_name, payload);
            {
              let record = __eliscript_value_28;
              {
                const __eliscript_value_29 = record === null ? "" : record_skip(config, record, repository_name(payload));
                {
                  let detail = __eliscript_value_29;
                  return __eliscript_truthy16(blank_QMARK_(detail)) ? hashMap(keyword("skip"), false) : hashMap(keyword("skip"), true, keyword("detail"), detail);
                }
              }
            }
          }
        }
      }
    }
  }
}
function body_of(body) {
  {
    const __eliscript_value_30 = body["body"] ?? null;
    {
      let text = __eliscript_value_30;
      return text === null ? "" : String(text);
    }
  }
}
function login_of(author) {
  return author === null ? "" : String(author["login"] ?? "");
}
function name_of(kind) {
  return kind === keyword("discussions") ? "discussions" : "issues";
}

// examples/dogfood/dist/src/builder/sources.mjs
function enabled_sources(config) {
  return filter((source) => {
    return get(source, keyword("enabled"), false);
  }, get(config, keyword("sources"), vector()));
}
function identity_list(posts) {
  {
    const __eliscript_value_1 = vector();
    const __eliscript_value_2 = 0;
    {
      let result = __eliscript_value_1;
      let index = __eliscript_value_2;
      while (index < count(posts)) {
        {
          const __eliscript_value_3 = nth(posts, index);
          {
            let post = __eliscript_value_3;
            {
              const __eliscript_value_4 = post["aliases"];
              {
                let aliases = __eliscript_value_4;
                {
                  const __eliscript_value_5 = 0;
                  {
                    let alias_index = __eliscript_value_5;
                    result = conj(result, post["id"]);
                    while (alias_index < count(aliases)) {
                      result = conj(result, nth(aliases, alias_index));
                      alias_index = alias_index + 1;
                    }
                  }
                }
              }
            }
          }
        }
        index = index + 1;
      }
      return result;
    }
  }
}
async function source_posts(root, config, source, transport, identities) {
  return await (async (kind) => {
    return kind === keyword("markdown") ? hashMap(keyword("posts"), read_posts(root, get(source, keyword("directory"), "content/posts")), keyword("carriers"), 0, keyword("unauthorized"), 0) : kind === keyword("issues") ? await collect_issues(hashMap(keyword("source"), source, keyword("publishing"), get(config, keyword("publishing")), keyword("adapters"), get(config, keyword("adapters"), vector()), keyword("identities"), identities, keyword("comments"), get(config, keyword("comments"), hashMap()), keyword("transport"), transport)) : kind === keyword("discussions") ? await collect_discussions(hashMap(keyword("source"), source, keyword("publishing"), get(config, keyword("publishing")), keyword("adapters"), get(config, keyword("adapters"), vector()), keyword("identities"), identities, keyword("comments"), get(config, keyword("comments"), hashMap()), keyword("transport"), transport)) : fail2("DOGFOOD-SOURCE-001", String("unsupported source kind: ") + String(kind));
  })(get(source, keyword("kind"), keyword("markdown")));
}

// examples/dogfood/dist/src/support/config.mjs
var import_node_fs2 = require("node:fs");
var __eliscript_truthy17 = (value) => value !== false && value != null;
var __eliscript_to_number2 = (value) => {
  if (typeof value === "string") {
    const text = value.trim();
    if (/^(?:0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+)$/.test(text))
      return Number(BigInt(text));
  }
  return Number(value);
};
var open_paren = 40;
var close_paren = 41;
var open_brace = 123;
var close_brace = 125;
var open_bracket = 91;
var close_bracket = 93;
var double_quote2 = 34;
var colon = 58;
var semicolon = 59;
var backslash = 92;
var minus_sign = 45;
var refresh_article_policies = vector(keyword("push"), keyword("event"), keyword("scheduled"), keyword("manual"), keyword("hybrid"));
var refresh_no_change_policies = vector(keyword("skip"), keyword("build"));
var refresh_comment_policies = vector(keyword("runtime"), keyword("external"), keyword("scheduled"), keyword("manual"), keyword("hybrid"), keyword("event"));
var known_keys = vector(keyword("schema-version"), keyword("site"), keyword("publishing"), keyword("sources"), keyword("identity"), keyword("comments"), keyword("adapters"), keyword("refresh"), keyword("output"));
function make_reader(source) {
  return { source, index: 0, length: text_length(source) };
}
function reader_code(reader) {
  {
    const __eliscript_value_1 = reader["index"];
    {
      let index = __eliscript_value_1;
      return index < reader["length"] ? char_code(reader["source"], index) : null;
    }
  }
}
function advance_reader(reader) {
  return reader["index"] = reader["index"] + 1;
}
function whitespace_code_QMARK_(code) {
  return code === 32 || code === 9 || code === 10 || code === 13;
}
function delimiter_code_QMARK_(code) {
  return ((__eliscript_value_2) => __eliscript_truthy17(__eliscript_value_2) ? __eliscript_value_2 : ((__eliscript_value_3) => __eliscript_truthy17(__eliscript_value_3) ? __eliscript_value_3 : code === open_paren || code === close_paren || code === open_brace || code === close_brace || code === open_bracket || code === close_bracket || code === double_quote2 || code === semicolon)(whitespace_code_QMARK_(code)))(code === null);
}
function skip_space(reader) {
  {
    const __eliscript_value_4 = false;
    {
      let done = __eliscript_value_4;
      while (!__eliscript_truthy17(done)) {
        {
          const __eliscript_value_5 = reader_code(reader);
          {
            let code = __eliscript_value_5;
            code === null ? done = true : __eliscript_truthy17(whitespace_code_QMARK_(code)) ? advance_reader(reader) : code === semicolon ? (() => {
              while (!(reader_code(reader) === null) && !(reader_code(reader) === 10)) {
                advance_reader(reader);
              }
              return null;
            })() : done = true;
          }
        }
      }
      return null;
    }
  }
}
function read_failure(reader, message) {
  return fail2("DOGFOOD-CONFIG-001", String("configuration at offset ") + String(reader["index"]) + String(": ") + String(message));
}
function read_delimited(reader, open, close, kind) {
  advance_reader(reader);
  {
    const __eliscript_value_6 = vector();
    const __eliscript_value_7 = false;
    {
      let items = __eliscript_value_6;
      let done = __eliscript_value_7;
      while (!__eliscript_truthy17(done)) {
        skip_space(reader);
        {
          const __eliscript_value_8 = reader_code(reader);
          {
            let code = __eliscript_value_8;
            code === null ? read_failure(reader, String("unterminated ") + String(kind)) : code === close ? (() => {
              advance_reader(reader);
              return done = true;
            })() : items = conj(items, read_value(reader));
          }
        }
      }
      return items;
    }
  }
}
function read_map_value(reader) {
  {
    const __eliscript_value_9 = read_delimited(reader, open_brace, close_brace, "map");
    {
      let items = __eliscript_value_9;
      {
        const __eliscript_value_10 = count(items);
        {
          let total = __eliscript_value_10;
          total % 2 === 1 && read_failure(reader, "map literal needs an even number of forms");
          {
            const __eliscript_value_11 = hashMap();
            const __eliscript_value_12 = 0;
            {
              let result = __eliscript_value_11;
              let index = __eliscript_value_12;
              while (index < total) {
                result = assoc(result, nth(items, index), nth(items, index + 1)), index = index + 2;
              }
              return result;
            }
          }
        }
      }
    }
  }
}
function read_vector_value(reader) {
  return read_delimited(reader, open_bracket, close_bracket, "vector");
}
function read_list_value(reader) {
  return read_delimited(reader, open_paren, close_paren, "list");
}
function read_escaped(reader) {
  advance_reader(reader);
  {
    const __eliscript_value_13 = reader_code(reader);
    {
      let code = __eliscript_value_13;
      code === null && read_failure(reader, "unterminated string literal");
      advance_reader(reader);
      return code === 110 ? `
` : code === 116 ? "\t" : code === 114 ? "\r" : code === double_quote2 ? '"' : code === backslash ? "\\" : read_failure(reader, "unsupported string escape");
    }
  }
}
function read_string_value(reader) {
  advance_reader(reader);
  {
    const __eliscript_value_14 = "";
    const __eliscript_value_15 = false;
    {
      let result = __eliscript_value_14;
      let done = __eliscript_value_15;
      while (!__eliscript_truthy17(done)) {
        {
          const __eliscript_value_16 = reader_code(reader);
          {
            let code = __eliscript_value_16;
            code === null ? read_failure(reader, "unterminated string literal") : code === double_quote2 ? (() => {
              advance_reader(reader);
              return done = true;
            })() : code === backslash ? result = String(result) + String(read_escaped(reader)) : (() => {
              result = String(result) + String(String.fromCharCode(code));
              return advance_reader(reader);
            })();
          }
        }
      }
      return result;
    }
  }
}
function read_keyword_value(reader) {
  advance_reader(reader);
  {
    const __eliscript_value_17 = read_token(reader);
    {
      let name = __eliscript_value_17;
      __eliscript_truthy17(blank_QMARK_(name)) && read_failure(reader, "empty keyword");
      return keyword(name);
    }
  }
}
function token_end_QMARK_(code) {
  return delimiter_code_QMARK_(code);
}
function read_token(reader) {
  {
    const __eliscript_value_18 = "";
    const __eliscript_value_19 = false;
    {
      let result = __eliscript_value_18;
      let done = __eliscript_value_19;
      while (!__eliscript_truthy17(done)) {
        {
          const __eliscript_value_20 = reader_code(reader);
          {
            let code = __eliscript_value_20;
            __eliscript_truthy17(token_end_QMARK_(code)) ? done = true : (() => {
              result = String(result) + String(String.fromCharCode(code));
              return advance_reader(reader);
            })();
          }
        }
      }
      return result;
    }
  }
}
function numeric_token_QMARK_(text) {
  {
    const __eliscript_value_21 = 0;
    const __eliscript_value_22 = 0;
    const __eliscript_value_23 = text_length(text) > 0;
    {
      let start = __eliscript_value_21;
      let index = __eliscript_value_22;
      let ok = __eliscript_value_23;
      __eliscript_truthy17(((__eliscript_value_24) => __eliscript_truthy17(__eliscript_value_24) ? char_code(text, 0) === minus_sign : __eliscript_value_24)(ok)) && (start = 1, index = 1);
      while (index < text_length(text)) {
        !__eliscript_truthy17(digit_code_QMARK_(char_code(text, index))) && (ok = false);
        index = index + 1;
      }
      return ((__eliscript_value_25) => __eliscript_truthy17(__eliscript_value_25) ? text_length(text) > start : __eliscript_value_25)(ok);
    }
  }
}
function read_atom(reader) {
  {
    const __eliscript_value_26 = read_token(reader);
    {
      let token = __eliscript_value_26;
      return token === "t" ? true : token === "false" ? false : token === "nil" ? null : __eliscript_truthy17(numeric_token_QMARK_(token)) ? __eliscript_to_number2(token) : __eliscript_truthy17(blank_QMARK_(token)) ? read_failure(reader, "unexpected character") : { "config-symbol": token };
    }
  }
}
function read_value(reader) {
  skip_space(reader);
  {
    const __eliscript_value_27 = reader_code(reader);
    {
      let code = __eliscript_value_27;
      return code === null ? read_failure(reader, "unexpected end of configuration") : code === open_paren ? read_list_value(reader) : code === open_brace ? read_map_value(reader) : code === open_bracket ? read_vector_value(reader) : code === double_quote2 ? read_string_value(reader) : code === colon ? read_keyword_value(reader) : read_atom(reader);
    }
  }
}
function read_forms(reader) {
  {
    const __eliscript_value_28 = vector();
    {
      let forms = __eliscript_value_28;
      skip_space(reader);
      while (!(reader_code(reader) === null)) {
        forms = conj(forms, read_value(reader));
        skip_space(reader);
      }
      return forms;
    }
  }
}
function symbol_named_QMARK_(value, name) {
  return !(value === null) && !__eliscript_truthy17(isMap(value)) && !__eliscript_truthy17(isVector(value)) && (value["config-symbol"] ?? null) === name;
}
function list_starting_with_QMARK_(value, name) {
  return ((__eliscript_value_29) => __eliscript_truthy17(__eliscript_value_29) ? ((__eliscript_value_30) => __eliscript_truthy17(__eliscript_value_30) ? ((__eliscript_value_31) => __eliscript_truthy17(__eliscript_value_31) ? symbol_named_QMARK_(nth(value, 0), name) : __eliscript_value_31)(count(value) > 1) : __eliscript_value_30)(isVector(value)) : __eliscript_value_29)(!(value === null));
}
function find_child_declaration(children, name) {
  {
    const __eliscript_value_32 = 0;
    const __eliscript_value_33 = null;
    {
      let index = __eliscript_value_32;
      let found = __eliscript_value_33;
      while (index < count(children)) {
        {
          const __eliscript_value_34 = nth(children, index);
          {
            let child = __eliscript_value_34;
            __eliscript_truthy17(((__eliscript_value_35) => __eliscript_truthy17(__eliscript_value_35) ? list_starting_with_QMARK_(child, name) : __eliscript_value_35)(found === null)) && (found = child);
          }
        }
        index = index + 1;
      }
      return found;
    }
  }
}
function find_declaration2(forms, name) {
  {
    const __eliscript_value_36 = 0;
    const __eliscript_value_37 = null;
    {
      let index = __eliscript_value_36;
      let found = __eliscript_value_37;
      while (index < count(forms)) {
        {
          const __eliscript_value_38 = nth(forms, index);
          {
            let form = __eliscript_value_38;
            found === null && (__eliscript_truthy17(list_starting_with_QMARK_(form, name)) ? found = form : __eliscript_truthy17(list_starting_with_QMARK_(form, "module")) && (found = find_child_declaration(form, name)));
          }
        }
        index = index + 1;
      }
      return found;
    }
  }
}
function load_config_value(path) {
  {
    const __eliscript_value_39 = import_node_fs2.readFileSync(path, "utf8");
    {
      let source = __eliscript_value_39;
      {
        const __eliscript_value_40 = make_reader(source);
        {
          let reader = __eliscript_value_40;
          {
            const __eliscript_value_41 = read_forms(reader);
            {
              let forms = __eliscript_value_41;
              {
                const __eliscript_value_42 = find_declaration2(forms, "defconst");
                {
                  let declaration = __eliscript_value_42;
                  declaration === null && fail2("DOGFOOD-CONFIG-002", String(path) + String(": no (defconst config ...) declaration found"));
                  count(declaration) < 3 && fail2("DOGFOOD-CONFIG-002", String(path) + String(": defconst must bind a value"));
                  return nth(declaration, 2);
                }
              }
            }
          }
        }
      }
    }
  }
}
function scalar_value_QMARK_(value) {
  return ((__eliscript_value) => {
    if (__eliscript_value === null)
      return "null";
    const __eliscript_host_type = typeof __eliscript_value;
    if (__eliscript_host_type !== "object" && __eliscript_host_type !== "function")
      return __eliscript_host_type;
    try {
      const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for("eliscript.value.type"));
      if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, "value") && (__eliscript_type.value === "keyword" || __eliscript_type.value === "symbol"))
        return __eliscript_type.value;
      const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, "kind");
      if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, "value")) {
        if (__eliscript_kind.value === "eliscript/keyword")
          return "keyword";
        if (__eliscript_kind.value === "eliscript/symbol")
          return "symbol";
      }
      return __eliscript_host_type;
    } catch {
      return __eliscript_host_type;
    }
  })(value) === "string" || ((__eliscript_value) => {
    if (__eliscript_value === null)
      return "null";
    const __eliscript_host_type = typeof __eliscript_value;
    if (__eliscript_host_type !== "object" && __eliscript_host_type !== "function")
      return __eliscript_host_type;
    try {
      const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for("eliscript.value.type"));
      if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, "value") && (__eliscript_type.value === "keyword" || __eliscript_type.value === "symbol"))
        return __eliscript_type.value;
      const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, "kind");
      if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, "value")) {
        if (__eliscript_kind.value === "eliscript/keyword")
          return "keyword";
        if (__eliscript_kind.value === "eliscript/symbol")
          return "symbol";
      }
      return __eliscript_host_type;
    } catch {
      return __eliscript_host_type;
    }
  })(value) === "number" || ((__eliscript_value) => {
    if (__eliscript_value === null)
      return "null";
    const __eliscript_host_type = typeof __eliscript_value;
    if (__eliscript_host_type !== "object" && __eliscript_host_type !== "function")
      return __eliscript_host_type;
    try {
      const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for("eliscript.value.type"));
      if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, "value") && (__eliscript_type.value === "keyword" || __eliscript_type.value === "symbol"))
        return __eliscript_type.value;
      const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, "kind");
      if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, "value")) {
        if (__eliscript_kind.value === "eliscript/keyword")
          return "keyword";
        if (__eliscript_kind.value === "eliscript/symbol")
          return "symbol";
      }
      return __eliscript_host_type;
    } catch {
      return __eliscript_host_type;
    }
  })(value) === "boolean" || ((__eliscript_value) => {
    if (__eliscript_value === null)
      return "null";
    const __eliscript_host_type = typeof __eliscript_value;
    if (__eliscript_host_type !== "object" && __eliscript_host_type !== "function")
      return __eliscript_host_type;
    try {
      const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for("eliscript.value.type"));
      if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, "value") && (__eliscript_type.value === "keyword" || __eliscript_type.value === "symbol"))
        return __eliscript_type.value;
      const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, "kind");
      if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, "value")) {
        if (__eliscript_kind.value === "eliscript/keyword")
          return "keyword";
        if (__eliscript_kind.value === "eliscript/symbol")
          return "symbol";
      }
      return __eliscript_host_type;
    } catch {
      return __eliscript_host_type;
    }
  })(value) === "keyword";
}
function data_only_QMARK_(value) {
  return value === null ? true : __eliscript_truthy17(((__eliscript_value_43) => __eliscript_truthy17(__eliscript_value_43) ? __eliscript_value_43 : scalar_value_QMARK_(value))(value === undefined)) ? !(value === undefined) : __eliscript_truthy17(isVector(value)) ? ((index, ok) => {
    while (index < count(value)) {
      !__eliscript_truthy17(data_only_QMARK_(nth(value, index))) && (ok = false);
      index = index + 1;
    }
    return ok;
  })(0, true) : __eliscript_truthy17(isMap(value)) ? ((keys, index, ok) => {
    while (index < count(keys)) {
      !__eliscript_truthy17(((__eliscript_value_44) => __eliscript_truthy17(__eliscript_value_44) ? data_only_QMARK_(get(value, nth(keys, index))) : __eliscript_value_44)(((__eliscript_value) => {
        if (__eliscript_value === null)
          return "null";
        const __eliscript_host_type = typeof __eliscript_value;
        if (__eliscript_host_type !== "object" && __eliscript_host_type !== "function")
          return __eliscript_host_type;
        try {
          const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for("eliscript.value.type"));
          if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, "value") && (__eliscript_type.value === "keyword" || __eliscript_type.value === "symbol"))
            return __eliscript_type.value;
          const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, "kind");
          if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, "value")) {
            if (__eliscript_kind.value === "eliscript/keyword")
              return "keyword";
            if (__eliscript_kind.value === "eliscript/symbol")
              return "symbol";
          }
          return __eliscript_host_type;
        } catch {
          return __eliscript_host_type;
        }
      })(nth(keys, index)) === "keyword")) && (ok = false);
      index = index + 1;
    }
    return ok;
  })(collect_keys(value), 0, true) : null;
}
function map_value_QMARK_(value) {
  return isMap(value);
}
function require_map(value, label) {
  !__eliscript_truthy17(map_value_QMARK_(value)) && fail2("DOGFOOD-CONFIG-003", String(label) + String(" must be a map"));
  return value;
}
function require_string(value, label) {
  !(!(value === null) && ((__eliscript_value) => {
    if (__eliscript_value === null)
      return "null";
    const __eliscript_host_type = typeof __eliscript_value;
    if (__eliscript_host_type !== "object" && __eliscript_host_type !== "function")
      return __eliscript_host_type;
    try {
      const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for("eliscript.value.type"));
      if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, "value") && (__eliscript_type.value === "keyword" || __eliscript_type.value === "symbol"))
        return __eliscript_type.value;
      const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, "kind");
      if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, "value")) {
        if (__eliscript_kind.value === "eliscript/keyword")
          return "keyword";
        if (__eliscript_kind.value === "eliscript/symbol")
          return "symbol";
      }
      return __eliscript_host_type;
    } catch {
      return __eliscript_host_type;
    }
  })(value) === "string") && fail2("DOGFOOD-CONFIG-003", String(label) + String(" must be a string"));
  return value;
}
function require_key(map2, key, label) {
  {
    const __eliscript_value_45 = get(map2, key, null);
    {
      let value = __eliscript_value_45;
      __eliscript_truthy17(empty_value_QMARK_(value)) && fail2("DOGFOOD-CONFIG-003", String(label) + String(" is required"));
      return value;
    }
  }
}
function relative_path_QMARK_(text) {
  return !__eliscript_truthy17(blank_QMARK_(text)) && !__eliscript_truthy17(starts_with_QMARK_("/", text)) && !__eliscript_truthy17(starts_with_QMARK_("~", text)) && !__eliscript_truthy17(starts_with_QMARK_("..", text));
}
function collect_keys(map2) {
  return reduceKV(map2, (accumulator, key, value) => {
    return conj(accumulator, key);
  }, vector());
}
function known_key_QMARK_(key) {
  {
    const __eliscript_value_46 = 0;
    const __eliscript_value_47 = false;
    {
      let index = __eliscript_value_46;
      let found = __eliscript_value_47;
      while (index < count(known_keys) && !__eliscript_truthy17(found)) {
        nth(known_keys, index) === key && (found = true);
        index = index + 1;
      }
      return found;
    }
  }
}
function check_source(source, index) {
  require_map(source, String("sources[") + String(index) + String("]"));
  {
    const __eliscript_value_48 = String("sources[") + String(index) + String("]");
    {
      let label = __eliscript_value_48;
      {
        const __eliscript_value_49 = require_key(source, keyword("kind"), label);
        {
          let kind = __eliscript_value_49;
          require_key(source, keyword("id"), label);
          return kind === keyword("markdown") ? check_contained(require_string(require_key(source, keyword("directory"), String(label) + String(" markdown")), String(label) + String(".directory")), String(label) + String(".directory")) : kind === keyword("issues") ? (() => {
            check_repository(source, label);
            check_visibility(source, label);
            return check_optional_string(source, keyword("label"), label);
          })() : kind === keyword("discussions") ? (() => {
            check_repository(source, label);
            check_visibility(source, label);
            return require_string(require_key(source, keyword("category"), String(label) + String(" discussions")), String(label) + String(".category"));
          })() : fail2("DOGFOOD-CONFIG-009", String(label) + String(".kind must be markdown, issues, or discussions"));
        }
      }
    }
  }
}
function check_contained(value, label) {
  !__eliscript_truthy17(relative_path_QMARK_(value)) && fail2("DOGFOOD-CONFIG-004", String(label) + String(" must be a contained repository-relative path"));
  return value;
}
function check_repository(source, label) {
  {
    const __eliscript_value_50 = require_string(require_key(source, keyword("repository"), label), String(label) + String(".repository"));
    {
      let repository = __eliscript_value_50;
      !(count(split_on("/", repository)) === 2 && !__eliscript_truthy17(blank_QMARK_(nth(split_on("/", repository), 0))) && !__eliscript_truthy17(blank_QMARK_(nth(split_on("/", repository), 1)))) && fail2("DOGFOOD-CONFIG-010", String(label) + String(".repository must be owner/name"));
      return repository;
    }
  }
}
function check_visibility(source, label) {
  {
    const __eliscript_value_51 = get(source, keyword("visibility"), null);
    {
      let value = __eliscript_value_51;
      !(value === null || value === keyword("public") || value === keyword("private")) && fail2("DOGFOOD-CONFIG-016", String(label) + String(".visibility must be public or private"));
      return value;
    }
  }
}
function check_optional_string(source, key, label) {
  {
    const __eliscript_value_52 = get(source, key, null);
    {
      let value = __eliscript_value_52;
      return !(value === null) && !(((__eliscript_value) => {
        if (__eliscript_value === null)
          return "null";
        const __eliscript_host_type = typeof __eliscript_value;
        if (__eliscript_host_type !== "object" && __eliscript_host_type !== "function")
          return __eliscript_host_type;
        try {
          const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for("eliscript.value.type"));
          if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, "value") && (__eliscript_type.value === "keyword" || __eliscript_type.value === "symbol"))
            return __eliscript_type.value;
          const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, "kind");
          if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, "value")) {
            if (__eliscript_kind.value === "eliscript/keyword")
              return "keyword";
            if (__eliscript_kind.value === "eliscript/symbol")
              return "symbol";
          }
          return __eliscript_host_type;
        } catch {
          return __eliscript_host_type;
        }
      })(value) === "string") ? fail2("DOGFOOD-CONFIG-003", String(label) + String(".") + String(String(key)) + String(" must be a string")) : null;
    }
  }
}
function check_sources(sources) {
  !__eliscript_truthy17(isVector(sources)) && fail2("DOGFOOD-CONFIG-003", "sources must be a vector");
  count(sources) === 0 && fail2("DOGFOOD-CONFIG-003", "at least one article source is required");
  {
    const __eliscript_value_53 = 0;
    const __eliscript_value_54 = 0;
    {
      let index = __eliscript_value_53;
      let enabled = __eliscript_value_54;
      while (index < count(sources)) {
        {
          const __eliscript_value_55 = nth(sources, index);
          {
            let source = __eliscript_value_55;
            check_source(source, index);
            __eliscript_truthy17(get(source, keyword("enabled"), false)) && (enabled = enabled + 1);
          }
        }
        index = index + 1;
      }
      enabled === 0 && fail2("DOGFOOD-CONFIG-003", "at least one article source must be enabled");
      return check_unique_field(sources, keyword("id"), "provider id");
    }
  }
}
function check_unique_field(values, key, label) {
  {
    const __eliscript_value_56 = vector();
    const __eliscript_value_57 = 0;
    {
      let collected = __eliscript_value_56;
      let index = __eliscript_value_57;
      while (index < count(values)) {
        {
          const __eliscript_value_58 = get(nth(values, index), key, null);
          {
            let value = __eliscript_value_58;
            !(value === null) && (collected = conj(collected, value));
          }
        }
        index = index + 1;
      }
      return check_unique_values(collected, label);
    }
  }
}
function check_unique_values(values, label) {
  {
    const __eliscript_value_59 = vector();
    const __eliscript_value_60 = 0;
    {
      let seen = __eliscript_value_59;
      let index = __eliscript_value_60;
      while (index < count(values)) {
        {
          const __eliscript_value_61 = nth(values, index);
          {
            let value = __eliscript_value_61;
            __eliscript_truthy17(member_of_QMARK_(seen, value)) && fail2("DOGFOOD-CONFIG-011", String(label) + String(" ") + String(String(value)) + String(" is declared more than once"));
            seen = conj(seen, value);
          }
        }
        index = index + 1;
      }
      return seen;
    }
  }
}
function member_of_QMARK_(values, needle) {
  {
    const __eliscript_value_62 = 0;
    const __eliscript_value_63 = false;
    {
      let index = __eliscript_value_62;
      let found = __eliscript_value_63;
      while (index < count(values) && !__eliscript_truthy17(found)) {
        nth(values, index) === needle && (found = true);
        index = index + 1;
      }
      return found;
    }
  }
}
function check_comments(config) {
  {
    const __eliscript_value_64 = get(config, keyword("comments"), null);
    {
      let comments = __eliscript_value_64;
      return !(comments === null) ? (() => {
        require_map(comments, "config.comments");
        {
          const __eliscript_value_65 = get(comments, keyword("channels"), vector());
          {
            let channels = __eliscript_value_65;
            !__eliscript_truthy17(isVector(channels)) && fail2("DOGFOOD-CONFIG-003", "comments.channels must be a vector");
            {
              const __eliscript_value_66 = 0;
              {
                let index = __eliscript_value_66;
                while (index < count(channels)) {
                  require_map(nth(channels, index), String("comments.channels[") + String(index) + String("]"));
                  require_key(nth(channels, index), keyword("id"), String("comments.channels[") + String(index) + String("]"));
                  require_key(nth(channels, index), keyword("kind"), String("comments.channels[") + String(index) + String("]"));
                  check_mode(nth(channels, index), String("comments.channels[") + String(index) + String("]"));
                  index = index + 1;
                }
              }
            }
            return check_unique_field(channels, keyword("id"), "channel id");
          }
        }
      })() : null;
    }
  }
}
function check_private_input(config) {
  {
    const __eliscript_value_67 = vector();
    const __eliscript_value_68 = get(config, keyword("sources"), vector());
    const __eliscript_value_69 = 0;
    {
      let private_sources = __eliscript_value_67;
      let sources = __eliscript_value_68;
      let index = __eliscript_value_69;
      while (index < count(sources)) {
        {
          const __eliscript_value_70 = nth(sources, index);
          {
            let source = __eliscript_value_70;
            __eliscript_truthy17(((__eliscript_value_71) => __eliscript_truthy17(__eliscript_value_71) ? get(source, keyword("visibility"), keyword("public")) === keyword("private") : __eliscript_value_71)(get(source, keyword("enabled"), false))) && (private_sources = conj(private_sources, source));
            index = index + 1;
          }
        }
      }
      return count(private_sources) > 0 ? (() => {
        {
          const __eliscript_value_72 = get(config, keyword("publishing"), hashMap());
          {
            let publishing = __eliscript_value_72;
            !(get(publishing, keyword("private-input"), keyword("open")) === keyword("acknowledged")) && fail2("DOGFOOD-CONFIG-017", String("a private source publishes into public output; declare ") + String("publishing.private-input :acknowledged to accept it"));
          }
        }
        {
          const __eliscript_value_73 = get(get(config, keyword("comments"), hashMap()), keyword("channels"), vector());
          const __eliscript_value_74 = 0;
          {
            let channels = __eliscript_value_73;
            let channel_index = __eliscript_value_74;
            while (channel_index < count(channels)) {
              {
                const __eliscript_value_75 = nth(channels, channel_index);
                {
                  let channel = __eliscript_value_75;
                  {
                    const __eliscript_value_76 = get(channel, keyword("kind"), null);
                    {
                      let kind = __eliscript_value_76;
                      {
                        const __eliscript_value_77 = get(channel, keyword("mode"), keyword("snapshot"));
                        {
                          let mode = __eliscript_value_77;
                          __eliscript_truthy17(((__eliscript_value_78) => __eliscript_truthy17(__eliscript_value_78) ? (kind === keyword("issue") || kind === keyword("discussion")) && (mode === keyword("live") || mode === keyword("hybrid")) : __eliscript_value_78)(get(channel, keyword("enabled"), false))) && fail2("DOGFOOD-CONFIG-018", String("a private source cannot serve ") + String(String(mode)) + String(" comments: the reader holds no credential"));
                        }
                      }
                    }
                  }
                }
              }
              channel_index = channel_index + 1;
            }
            return null;
          }
        }
      })() : null;
    }
  }
}
function check_refresh(config) {
  {
    const __eliscript_value_79 = get(config, keyword("refresh"), null);
    {
      let refresh = __eliscript_value_79;
      return !(refresh === null) ? (() => {
        require_map(refresh, "config.refresh");
        check_policy(refresh, keyword("articles"), refresh_article_policies, "articles");
        check_policy(refresh, keyword("comments"), refresh_comment_policies, "comments");
        return check_policy(refresh, keyword("no-change"), refresh_no_change_policies, "no-change");
      })() : null;
    }
  }
}
function check_policy(declaration, key, allowed, label) {
  {
    const __eliscript_value_80 = get(declaration, key, null);
    {
      let value = __eliscript_value_80;
      return !(value === null) && !__eliscript_truthy17(member_of_QMARK_(allowed, value)) ? fail2("DOGFOOD-CONFIG-015", String("refresh.") + String(label) + String(" must be one of ") + String(join_keywords(allowed))) : null;
    }
  }
}
function join_keywords(values) {
  {
    const __eliscript_value_81 = vector();
    const __eliscript_value_82 = 0;
    {
      let parts = __eliscript_value_81;
      let index = __eliscript_value_82;
      while (index < count(values)) {
        parts = conj(parts, collection_name(nth(values, index)));
        index = index + 1;
      }
      return join(", ", parts);
    }
  }
}
function collection_name(value) {
  {
    const __eliscript_value_83 = String(value);
    {
      let text = __eliscript_value_83;
      return text_length(text) > 0 && char_code(text, 0) === 58 ? slice(1, text_length(text), text) : text;
    }
  }
}
function check_adapters(config) {
  {
    const __eliscript_value_84 = get(config, keyword("adapters"), vector());
    {
      let adapters = __eliscript_value_84;
      !__eliscript_truthy17(isVector(adapters)) && fail2("DOGFOOD-CONFIG-003", "adapters must be a vector");
      {
        const __eliscript_value_85 = 0;
        {
          let index = __eliscript_value_85;
          while (index < count(adapters)) {
            {
              const __eliscript_value_86 = String("adapters[") + String(index) + String("]");
              {
                let label = __eliscript_value_86;
                {
                  const __eliscript_value_87 = nth(adapters, index);
                  {
                    let adapter = __eliscript_value_87;
                    require_map(adapter, label);
                    require_key(adapter, keyword("id"), label);
                    {
                      const __eliscript_value_88 = require_key(adapter, keyword("carrier-kind"), label);
                      {
                        let kind = __eliscript_value_88;
                        !__eliscript_truthy17(carrier_kind_QMARK_(kind)) && fail2("DOGFOOD-CONFIG-012", String(label) + String(".carrier-kind must be issue, discussion, ") + String("external, or none"));
                        (kind === keyword("issue") || kind === keyword("discussion")) && (() => {
                          require_key(adapter, keyword("principal"), String(label) + String(" native carrier"));
                          return require_key(adapter, keyword("marker"), String(label) + String(" native carrier"));
                        })();
                        {
                          const __eliscript_value_89 = get(adapter, keyword("mode"), null);
                          {
                            let mode = __eliscript_value_89;
                            !(mode === null) && (kind === keyword("external") || kind === keyword("none")) && mode === keyword("snapshot") && fail2("DOGFOOD-CONFIG-013", String(label) + String(" is browser-only and cannot snapshot"));
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
            index = index + 1;
          }
        }
      }
      return check_unique_field(adapters, keyword("id"), "adapter id");
    }
  }
}
function check_mode(declaration, label) {
  {
    const __eliscript_value_90 = get(declaration, keyword("mode"), null);
    {
      let mode = __eliscript_value_90;
      return !(mode === null) && !__eliscript_truthy17(comment_mode_QMARK_(mode)) ? fail2("DOGFOOD-CONFIG-014", String(label) + String(".mode must be snapshot, live, hybrid, or embed")) : null;
    }
  }
}
function comment_mode_QMARK_(mode) {
  return mode === keyword("snapshot") || mode === keyword("live") || mode === keyword("hybrid") || mode === keyword("embed");
}
function carrier_kind_QMARK_(kind) {
  return kind === keyword("issue") || kind === keyword("discussion") || kind === keyword("external") || kind === keyword("none");
}
function check_publishing(config) {
  {
    const __eliscript_value_91 = get(config, keyword("publishing"), null);
    {
      let publishing = __eliscript_value_91;
      return !(publishing === null) ? (() => {
        require_map(publishing, "config.publishing");
        {
          const __eliscript_value_92 = require_map(require_key(publishing, keyword("owner"), "config.publishing.owner"), "config.publishing.owner");
          {
            let owner = __eliscript_value_92;
            {
              const __eliscript_value_93 = vector(login_of2(owner, "config.publishing.owner"));
              {
                let logins = __eliscript_value_93;
                {
                  const __eliscript_value_94 = get(publishing, keyword("coauthors"), vector());
                  {
                    let coauthors = __eliscript_value_94;
                    {
                      const __eliscript_value_95 = 0;
                      {
                        let index = __eliscript_value_95;
                        !__eliscript_truthy17(isVector(coauthors)) && fail2("DOGFOOD-CONFIG-003", "publishing.coauthors must be a vector");
                        while (index < count(coauthors)) {
                          {
                            const __eliscript_value_96 = require_map(nth(coauthors, index), String("publishing.coauthors[") + String(index) + String("]"));
                            {
                              let coauthor = __eliscript_value_96;
                              logins = conj(logins, login_of2(coauthor, String("publishing.coauthors[") + String(index) + String("]")));
                            }
                          }
                          index = index + 1;
                        }
                      }
                    }
                  }
                }
                check_unique_values(logins, "publisher login");
              }
            }
          }
        }
        return require_map(get(publishing, keyword("owner"), null), "config.publishing.owner");
      })() : null;
    }
  }
}
function login_of2(publisher, label) {
  return to_lowercase(require_string(require_key(publisher, keyword("login"), String(label) + String(".login")), String(label) + String(".login")));
}
function validate_config(config, path) {
  require_map(config, "config");
  !__eliscript_truthy17(data_only_QMARK_(config)) && fail2("DOGFOOD-CONFIG-005", String(path) + String(": configuration must contain data only, never code"));
  {
    const __eliscript_value_97 = collect_keys(config);
    const __eliscript_value_98 = 0;
    {
      let keys = __eliscript_value_97;
      let index = __eliscript_value_98;
      while (index < count(keys)) {
        !__eliscript_truthy17(known_key_QMARK_(nth(keys, index))) && fail2("DOGFOOD-CONFIG-006", String(path) + String(": unknown configuration key ") + String(nth(keys, index)));
        index = index + 1;
      }
    }
  }
  {
    const __eliscript_value_99 = require_key(config, keyword("schema-version"), "config.schema-version");
    {
      let version = __eliscript_value_99;
      !(version === 1) && fail2("DOGFOOD-CONFIG-007", String(path) + String(": unsupported schema version ") + String(version));
    }
  }
  {
    const __eliscript_value_100 = require_map(require_key(config, keyword("site"), "config.site"), "site");
    {
      let site = __eliscript_value_100;
      {
        const __eliscript_value_101 = require_string(require_key(site, keyword("base-url"), "config.site.base-url"), "site.base-url");
        {
          let base_url = __eliscript_value_101;
          require_string(require_key(site, keyword("title"), "config.site.title"), "site.title");
          !__eliscript_truthy17(starts_with_QMARK_("https://", base_url)) && fail2("DOGFOOD-CONFIG-008", "site.base-url must be an absolute https URL for production");
          check_sources(require_key(config, keyword("sources"), "config.sources"));
          check_private_input(config);
          check_refresh(config);
          check_adapters(config);
          check_comments(config);
          check_publishing(config);
          {
            const __eliscript_value_102 = require_map(require_key(config, keyword("output"), "config.output"), "output");
            {
              let output = __eliscript_value_102;
              {
                const __eliscript_value_103 = require_string(require_key(output, keyword("directory"), "config.output.directory"), "output.directory");
                {
                  let directory = __eliscript_value_103;
                  !__eliscript_truthy17(relative_path_QMARK_(directory)) && fail2("DOGFOOD-CONFIG-004", "output.directory must be a contained repository-relative path");
                }
              }
            }
          }
          return config;
        }
      }
    }
  }
}
function load_config(path) {
  return validate_config(load_config_value(path), path);
}

// examples/dogfood/dist/src/builder/main.mjs
var __eliscript_truthy18 = (value) => value !== false && value != null;
var program_arguments = process.argv;
var environment = process.env;
var fetch_implementation = globalThis.fetch;
var set_exit_code = (code) => {
  process.exitCode = code;
};
var to_native_array2 = (value) => Array.from(value);
function env_value(name) {
  {
    const __eliscript_value_1 = environment[name] ?? null;
    {
      let value = __eliscript_value_1;
      return value === null || value === "" ? null : value;
    }
  }
}
function truthy_input_QMARK_(value) {
  return value === "true" || value === "1" || value === "yes";
}
function action_input(name) {
  return name === "config-file" ? first_value(env_value("INPUT_CONFIG-FILE"), env_value("INPUT_CONFIG_FILE")) : name === "output-directory" ? first_value(env_value("INPUT_OUTPUT-DIRECTORY"), env_value("INPUT_OUTPUT_DIRECTORY")) : name === "force" ? env_value("INPUT_FORCE") : name === "preview" ? env_value("INPUT_PREVIEW") : name === "event-file" ? first_value(env_value("INPUT_EVENT-FILE"), env_value("INPUT_EVENT_FILE")) : name === "previous-manifest" ? first_value(env_value("INPUT_PREVIOUS-MANIFEST"), env_value("INPUT_PREVIOUS_MANIFEST")) : name === "github-token" ? first_value(env_value("INPUT_GITHUB-TOKEN"), env_value("INPUT_GITHUB_TOKEN")) : null;
}
function first_value(first, second) {
  return first === null ? second : first;
}
function flag_present_QMARK_(arguments$, name) {
  {
    const __eliscript_value_2 = 0;
    const __eliscript_value_3 = null;
    const __eliscript_value_4 = count(arguments$);
    {
      let index = __eliscript_value_2;
      let found = __eliscript_value_3;
      let total = __eliscript_value_4;
      while (index < total) {
        nth(arguments$, index) === name && (found = true);
        index = index + 1;
      }
      return found;
    }
  }
}
function option_value(arguments$, name, fallback) {
  {
    const __eliscript_value_5 = 2;
    const __eliscript_value_6 = fallback;
    const __eliscript_value_7 = count(arguments$);
    {
      let index = __eliscript_value_5;
      let found = __eliscript_value_6;
      let total = __eliscript_value_7;
      while (index < total) {
        nth(arguments$, index) === name && index + 1 < total && (found = nth(arguments$, index + 1));
        index = index + 1;
      }
      return found;
    }
  }
}
function absolute_path(root, value) {
  return slice(0, 1, value) === "/" ? value : Path2.join(root, value);
}
function prepare_staging(staging) {
  __eliscript_truthy18(import_node_fs3.existsSync(staging)) && import_node_fs3.rmSync(staging, { recursive: true, force: true });
  return import_node_fs3.mkdirSync(staging, { recursive: true });
}
function write_document(staging, document2) {
  {
    const __eliscript_value_8 = get(document2, keyword("path"));
    {
      let relative = __eliscript_value_8;
      {
        const __eliscript_value_9 = Path2.join(staging, relative);
        {
          let target = __eliscript_value_9;
          import_node_fs3.mkdirSync(Path2.dirname(target), { recursive: true });
          return import_node_fs3.writeFileSync(target, get(document2, keyword("content")));
        }
      }
    }
  }
}
function canonical_channel(channel) {
  return { id: String(get(channel, keyword("id"), null)), kind: String(get(channel, keyword("kind"), null)), mode: String(get(channel, keyword("mode"), null)), count: get(channel, keyword("count"), null), updatedAt: get(channel, keyword("updated-at"), null), binding: String(channel_binding_text(channel)), items: canonical_items(get(channel, keyword("items"), vector())) };
}
function channel_binding_text(channel) {
  {
    const __eliscript_value_10 = get(channel, keyword("binding"), null);
    {
      let binding = __eliscript_value_10;
      return binding === null ? "" : String(get(binding, keyword("repository"), "")) + String("#") + String(get(binding, keyword("number"), null));
    }
  }
}
function canonical_items(items) {
  {
    const __eliscript_value_11 = [];
    const __eliscript_value_12 = 0;
    {
      let result = __eliscript_value_11;
      let index = __eliscript_value_12;
      while (index < count(items)) {
        {
          const __eliscript_value_13 = nth(items, index);
          {
            let item = __eliscript_value_13;
            result["push"]({ id: String(get(item, keyword("id"), null)), author: String(get(get(item, keyword("author"), hashMap()), keyword("login"), "")), body: get(item, keyword("body"), ""), createdAt: get(item, keyword("created-at"), null), updatedAt: get(item, keyword("updated-at"), null), replies: canonical_items(get(item, keyword("replies"), vector())) });
          }
        }
        index = index + 1;
      }
      return result;
    }
  }
}
function canonical_post(post) {
  return { id: post["id"], slug: post["slug"], title: post["title"], summary: post["summary"], body: post["body"], publishedAt: post["published-at"], updatedAt: post["updated-at"], authors: values__GT_array(post["authors"]), tags: values__GT_array(post["tags"]), cover: post["cover"] ?? null, draft: post["draft"], pinnedWeight: post["pinned-weight"], provenance: { provider: get(post["provenance"], keyword("provider"), ""), path: get(post["provenance"], keyword("path"), "") }, aliases: values__GT_array(post["aliases"]), channels: channels__GT_array(post["comment-channels"]) };
}
function channels__GT_array(channels) {
  {
    const __eliscript_value_14 = [];
    const __eliscript_value_15 = 0;
    {
      let result = __eliscript_value_14;
      let index = __eliscript_value_15;
      while (index < count(channels)) {
        result["push"](canonical_channel(nth(channels, index)));
        index = index + 1;
      }
      return result;
    }
  }
}
function values__GT_array(values) {
  {
    const __eliscript_value_16 = [];
    const __eliscript_value_17 = 0;
    {
      let result = __eliscript_value_16;
      let index = __eliscript_value_17;
      while (index < count(values)) {
        result["push"](nth(values, index));
        index = index + 1;
      }
      return result;
    }
  }
}
function publishable_inputs(config, site, posts, browser_text, renderer) {
  return { site: { title: get(site, keyword("title"), ""), baseUrl: get(site, keyword("base-url"), ""), language: get(site, keyword("language"), ""), theme: String(get(site, keyword("theme"), keyword("system"))), preview: get(site, keyword("preview"), false) }, presentation: String(get(get(config, keyword("comments"), hashMap()), keyword("presentation"), keyword("tabs"))), posts: posts__GT_array(posts), browserAsset: digest_of_text(browser_text), renderer: renderer_digest(renderer) };
}
function posts__GT_array(posts) {
  {
    const __eliscript_value_18 = [];
    const __eliscript_value_19 = 0;
    {
      let result = __eliscript_value_18;
      let index = __eliscript_value_19;
      while (index < count(posts)) {
        result["push"](canonical_post(nth(posts, index)));
        index = index + 1;
      }
      return result;
    }
  }
}
function digest_of_text(text) {
  return import_node_crypto.createHash("sha256")["update"](text)["digest"]("hex");
}
function renderer_module_path() {
  {
    const __eliscript_value_20 = program_arguments[1] ?? "";
    {
      let entry = __eliscript_value_20;
      {
        const __eliscript_value_21 = Path2.join(Path2.dirname(entry), "../renderer/server.mjs");
        {
          let sibling = __eliscript_value_21;
          return __eliscript_truthy18(import_node_fs3.existsSync(sibling)) ? sibling : entry;
        }
      }
    }
  }
}
function renderer_digest() {
  {
    const __eliscript_value_22 = renderer_module_path();
    {
      let path = __eliscript_value_22;
      return __eliscript_truthy18(import_node_fs3.existsSync(path)) ? digest_of_text(import_node_fs3.readFileSync(path, "utf8")) : "unknown";
    }
  }
}
function input_digest(inputs) {
  return digest_of_text(JSON.stringify(inputs));
}
function no_change_policy(config) {
  return get(get(config, keyword("refresh"), hashMap()), keyword("no-change"), keyword("skip"));
}
function report_no_change(output, posts, inputs) {
  {
    const __eliscript_value_23 = count(posts);
    {
      let count2 = __eliscript_value_23;
      console.log(String("dogfood: no change; ") + String(count2) + String(" published posts produce the fingerprint already on disk"));
      console.log(String("dogfood: output ") + String(output));
      console.log(String("dogfood: fingerprint ") + String(inputs));
      set_output("built", "false");
      set_output("reason", "no-change");
      set_output("content-fingerprint", inputs);
      set_output("output-directory", output);
      set_output("post-count", String(count2));
      set_output("comment-snapshot-count", String(snapshot_count(posts)));
      set_output("manifest", Path2.join(output, "_dogfood/build.json"));
    }
  }
  return inputs;
}
function previous_input_digest(output) {
  {
    const __eliscript_value_24 = Path2.join(output, "_dogfood/build.json");
    {
      let manifest = __eliscript_value_24;
      return __eliscript_truthy18(import_node_fs3.existsSync(manifest)) ? get(JSON.parse(import_node_fs3.readFileSync(manifest, "utf8")), "inputDigest", null) : null;
    }
  }
}
function fingerprint(documents) {
  {
    const __eliscript_value_25 = import_node_crypto.createHash("sha256");
    const __eliscript_value_26 = 0;
    {
      let hash = __eliscript_value_25;
      let index = __eliscript_value_26;
      while (index < count(documents)) {
        {
          const __eliscript_value_27 = nth(documents, index);
          {
            let document2 = __eliscript_value_27;
            hash["update"](get(document2, keyword("path")));
            hash["update"](`
`);
            hash["update"](get(document2, keyword("content")));
            hash["update"](`
`);
          }
        }
        index = index + 1;
      }
      return hash["digest"]("hex");
    }
  }
}
function public_post(post) {
  return { id: post["id"], slug: post["slug"], title: post["title"], summary: post["summary"], publishedAt: post["published-at"], updatedAt: post["updated-at"], tags: to_native_array2(post["tags"]), source: get(post["provenance"], keyword("path"), "") };
}
function public_posts(posts) {
  return to_native_array2(map(public_post, posts));
}
function write_manifests(staging, documents, posts, config, carriers, unauthorized, inputs) {
  import_node_fs3.mkdirSync(Path2.join(staging, "_dogfood"), { recursive: true });
  import_node_fs3.writeFileSync(Path2.join(staging, "_dogfood/build.json"), String(JSON.stringify({ format: "dogfood-build", version: 1, configSchemaVersion: get(config, keyword("schema-version"), 1), postCount: count(posts), routeCount: count(documents), contentFingerprint: fingerprint(documents), inputDigest: inputs, commentSnapshots: String(snapshot_count(posts)), commentCarriers: String(carriers), unauthorizedRecords: String(unauthorized) })) + String(`
`));
  return import_node_fs3.writeFileSync(Path2.join(staging, "_dogfood/posts.json"), String(JSON.stringify({ format: "dogfood-posts", version: 1, posts: public_posts(posts) })) + String(`
`));
}
function manifest_fingerprint(path) {
  return get(JSON.parse(import_node_fs3.readFileSync(path, "utf8")), "contentFingerprint", null);
}
function verify_previous_manifest(previous_manifest, output) {
  return !(previous_manifest === null) ? ((expected_path) => {
    return ((current_path) => {
      return ((current) => {
        return ((expected) => {
          return current === null ? null : expected === null ? fail2("DOGFOOD-BUILD-005", String("previous manifest is missing or unreadable: ") + String(expected_path)) : !(current === expected) ? fail2("DOGFOOD-BUILD-004", String("output ") + String(output) + String(" was not produced by the recorded build: ") + String(String(current)) + String(" does not match ") + String(String(expected))) : null;
        })(__eliscript_truthy18(import_node_fs3.existsSync(expected_path)) ? manifest_fingerprint(expected_path) : null);
      })(__eliscript_truthy18(import_node_fs3.existsSync(current_path)) ? manifest_fingerprint(current_path) : null);
    })(Path2.join(output, "_dogfood/build.json"));
  })(absolute_path(".", previous_manifest)) : null;
}
function publish(staging, output) {
  {
    const __eliscript_value_28 = String(output) + String(".backup");
    {
      let backup = __eliscript_value_28;
      __eliscript_truthy18(import_node_fs3.existsSync(backup)) && import_node_fs3.rmSync(backup, { recursive: true, force: true });
      __eliscript_truthy18(import_node_fs3.existsSync(output)) && import_node_fs3.renameSync(output, backup);
      (() => {
        try {
          return import_node_fs3.renameSync(staging, output);
        } catch (error) {
          __eliscript_truthy18(import_node_fs3.existsSync(backup)) && import_node_fs3.renameSync(backup, output);
          return ((__eliscript_value_29) => {
            throw __eliscript_value_29;
          })(error);
        }
      })();
      return __eliscript_truthy18(import_node_fs3.existsSync(backup)) ? import_node_fs3.rmSync(backup, { recursive: true, force: true }) : null;
    }
  }
}
function publishable_QMARK_(post, preview) {
  return ((__eliscript_value_30) => __eliscript_truthy18(__eliscript_value_30) ? __eliscript_value_30 : !__eliscript_truthy18(post["draft"]))(preview);
}
function preview_site(site) {
  return assoc(site, keyword("preview"), true);
}
function defined_values(values) {
  {
    const __eliscript_value_31 = vector();
    const __eliscript_value_32 = 0;
    {
      let result = __eliscript_value_31;
      let index = __eliscript_value_32;
      while (index < count(values)) {
        {
          const __eliscript_value_33 = nth(values, index);
          {
            let value = __eliscript_value_33;
            !(value === null) && (result = conj(result, value));
          }
        }
        index = index + 1;
      }
      return result;
    }
  }
}
function browser_bundle_candidates(root, override) {
  {
    const __eliscript_value_34 = String(Path2.dirname(program_arguments[1] ?? ".")) + String("/../site/browser.js");
    {
      let from_entry = __eliscript_value_34;
      return defined_values(vector(override, env_value("DOGFOOD_BROWSER_BUNDLE"), String(root) + String("/dist/site/browser.js"), from_entry));
    }
  }
}
function browser_bundle(root, override) {
  {
    const __eliscript_value_35 = browser_bundle_candidates(root, override);
    const __eliscript_value_36 = 0;
    const __eliscript_value_37 = null;
    {
      let candidates = __eliscript_value_35;
      let index = __eliscript_value_36;
      let found = __eliscript_value_37;
      while (index < count(candidates) && found === null) {
        {
          const __eliscript_value_38 = nth(candidates, index);
          {
            let candidate = __eliscript_value_38;
            __eliscript_truthy18(((__eliscript_value_39) => __eliscript_truthy18(__eliscript_value_39) ? import_node_fs3.existsSync(candidate) : __eliscript_value_39)(!(candidate === null))) && (found = candidate);
          }
        }
        index = index + 1;
      }
      return found === null ? fail2("DOGFOOD-BUILD-003", String("browser bundle not found; looked in ") + String(join(", ", candidates))) : import_node_fs3.readFileSync(found, "utf8");
    }
  }
}
function append_all4(target, values) {
  return reduce(values, (accumulator, value) => {
    return conj(accumulator, value);
  }, target);
}
function request_headers(token) {
  return token === null ? { accept: "application/vnd.github+json", "user-agent": "dogfood" } : { accept: "application/vnd.github+json", "user-agent": "dogfood", authorization: String("Bearer ") + String(token) };
}
function request_field(request, name, fallback) {
  return __eliscript_truthy18(isMap(request)) ? get(request, keyword(name), fallback) : ((value) => {
    return value === undefined ? fallback : value;
  })(request[name]);
}
async function github_transport(request) {
  return await (async (token) => {
    return await (async (plain) => {
      return await (async (url) => {
        return await (async (method) => {
          return await (async (body) => {
            return await (async (init) => {
              return await (async () => {
                __eliscript_truthy18(blank_QMARK_(url)) && fail2("DOGFOOD-GITHUB-002", "a provider request carried no URL");
                !(body === null) && (init["body"] = body);
                return await (async () => {
                  try {
                    return await (async (response) => {
                      return hashMap(keyword("status"), response["status"], keyword("headers"), { link: response["headers"]["get"]("link") }, keyword("body"), await response["json"]());
                    })(await fetch_implementation(url, init));
                  } catch (error) {
                    return fail2("DOGFOOD-GITHUB-001", String("GitHub request failed: ") + String(error["message"] ?? String(error)));
                  }
                })();
              })();
            })({ method, headers: request_headers(token) });
          })(__eliscript_truthy18(plain) ? null : request_field(request, "body", null));
        })(__eliscript_truthy18(plain) ? "GET" : request_field(request, "method", "GET"));
      })(__eliscript_truthy18(plain) ? request : request_field(request, "url", ""));
    })(string_value_QMARK_(request));
  })(first_value(env_value("GITHUB_TOKEN"), action_input("github-token")));
}
function set_output(name, value) {
  {
    const __eliscript_value_40 = env_value("GITHUB_OUTPUT");
    {
      let destination = __eliscript_value_40;
      return !(destination === null) ? import_node_fs3.appendFileSync(destination, String(name) + String("=") + String(value) + String(`
`)) : null;
    }
  }
}
function report(output, documents, posts, reason, fingerprint_value, inputs) {
  {
    const __eliscript_value_41 = count(posts);
    {
      let post_count = __eliscript_value_41;
      console.log(String("dogfood: wrote ") + String(count(documents)) + String(" routes from ") + String(post_count) + String(" published posts"));
      console.log(String("dogfood: output ") + String(output));
      console.log(String("dogfood: fingerprint ") + String(inputs));
      set_output("built", "true");
      set_output("reason", reason);
      set_output("content-fingerprint", inputs);
      set_output("cache-key", String("dogfood-") + String(fingerprint_value));
      set_output("output-directory", output);
      set_output("post-count", String(post_count));
      set_output("comment-snapshot-count", String(snapshot_count(posts)));
      return set_output("manifest", Path2.join(output, "_dogfood/build.json"));
    }
  }
}
function output_directory_of(root, config, override) {
  return Path2.join(root, override === null ? get(get(config, keyword("output")), keyword("directory"), "_site") : override);
}
async function build_site(root, config_path, output_override, browser_override, preview, reason) {
  return await (async (config) => {
    return await (async (site) => {
      return await (async (sources) => {
        return await (async (output) => {
          return await (async (staging) => {
            return ((collected) => {
              return finish_build(root, config, site, output, staging, browser_override, preview, reason, collected);
            })(await collect_sources(root, config, sources));
          })(String(output) + String(".staging"));
        })(output_directory_of(root, config, output_override));
      })(enabled_sources(config));
    })(__eliscript_truthy18(preview) ? preview_site(get(config, keyword("site"))) : get(config, keyword("site")));
  })(load_config(config_path));
}
async function collect_sources(root, config, sources) {
  return await (async (collected, carriers, unauthorized, index) => {
    await (async () => {
      while (index < count(sources)) {
        await (async (source) => {
          return ((result) => {
            return collected = append_all4(collected, get(result, keyword("posts"), vector())), carriers = carriers + get(result, keyword("carriers"), 0), unauthorized = unauthorized + get(result, keyword("unauthorized"), 0);
          })(await source_posts(root, config, source, github_transport, identity_list(collected)));
        })(nth(sources, index));
        index = index + 1;
      }
      return null;
    })();
    return hashMap(keyword("posts"), collected, keyword("carriers"), carriers, keyword("unauthorized"), unauthorized);
  })(vector(), 0, 0, 0);
}
function finish_build(root, config, site, output, staging, browser_override, preview, reason, collected) {
  {
    const __eliscript_value_42 = get(collected, keyword("posts"), vector());
    {
      let collected_posts = __eliscript_value_42;
      {
        const __eliscript_value_43 = get(collected, keyword("carriers"), 0);
        {
          let carriers = __eliscript_value_43;
          {
            const __eliscript_value_44 = get(collected, keyword("unauthorized"), 0);
            {
              let unauthorized = __eliscript_value_44;
              {
                const __eliscript_value_45 = sort_posts(attach_configured_channels(config, filter((post) => {
                  return publishable_QMARK_(post, preview);
                }, resolve_identity(config, collected_posts))));
                {
                  let posts = __eliscript_value_45;
                  {
                    const __eliscript_value_46 = browser_bundle(root, browser_override);
                    {
                      let bundle = __eliscript_value_46;
                      {
                        const __eliscript_value_47 = input_digest(publishable_inputs(config, site, posts, bundle, renderer_digest()));
                        {
                          let inputs = __eliscript_value_47;
                          check_identity(posts);
                          return __eliscript_truthy18(unchanged_inputs_QMARK_(config, output, inputs, reason)) ? report_no_change(output, posts, inputs) : render_and_publish(output, staging, config, site, posts, bundle, inputs, carriers, unauthorized, reason);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
function unchanged_inputs_QMARK_(config, output, inputs, reason) {
  return no_change_policy(config) === keyword("skip") && !(reason === "forced") && inputs === previous_input_digest(output);
}
function render_and_publish(output, staging, config, site, posts, bundle, inputs, carriers, unauthorized, reason) {
  {
    const __eliscript_value_48 = conj(render_site(site, posts), hashMap(keyword("path"), "assets/browser.js", keyword("content"), bundle));
    {
      let documents = __eliscript_value_48;
      {
        const __eliscript_value_49 = fingerprint(documents);
        {
          let digest = __eliscript_value_49;
          {
            const __eliscript_value_50 = 0;
            {
              let index = __eliscript_value_50;
              prepare_staging(staging);
              while (index < count(documents)) {
                write_document(staging, nth(documents, index));
                index = index + 1;
              }
              write_manifests(staging, documents, posts, config, carriers, unauthorized, inputs);
              publish(staging, output);
              report(output, documents, posts, reason, digest, inputs);
              return digest;
            }
          }
        }
      }
    }
  }
}
function keyword_name(value) {
  {
    const __eliscript_value_51 = String(value);
    {
      let text = __eliscript_value_51;
      {
        const __eliscript_value_52 = text_length(text);
        {
          let size = __eliscript_value_52;
          return size > 0 && text.charCodeAt(0) === 58 ? slice(1, size, text) : text;
        }
      }
    }
  }
}
function skip(decision) {
  {
    const __eliscript_value_53 = get(decision, keyword("detail"), "");
    {
      let detail = __eliscript_value_53;
      console.log(String("dogfood: skipped; ") + String(detail));
      set_output("built", "false");
      set_output("reason", "skipped");
      return set_output("subject", "articles");
    }
  }
}
function defer(decision) {
  {
    const __eliscript_value_54 = keyword_name(get(decision, keyword("subject"), keyword("unknown")));
    const __eliscript_value_55 = String(get(decision, keyword("event"), ""));
    {
      let subject = __eliscript_value_54;
      let event = __eliscript_value_55;
      console.log(String("dogfood: deferred; ") + String(subject) + String(" event ") + String(event === "" ? "(none)" : event) + String(" cannot change the site"));
      set_output("built", "false");
      set_output("reason", "deferred");
      return set_output("subject", subject);
    }
  }
}
async function main() {
  return await (async (arguments$) => {
    return await (async (root) => {
      return await (async (config_input) => {
        return await (async (config_file) => {
          return await (async (config_path) => {
            return await (async (output_override) => {
              return await (async (forced) => {
                return await (async (browser_override) => {
                  return await (async (preview) => {
                    return await (async (event_file) => {
                      return await (async (previous_manifest) => {
                        return await (async () => {
                          try {
                            return await (async (classification2) => {
                              return await (async (config) => {
                                return await (async (decision) => {
                                  return !__eliscript_truthy18(get(decision, keyword("build"), null)) ? defer(decision) : await (async (preflight) => {
                                    return __eliscript_truthy18(get(preflight, keyword("skip"), false)) ? skip(preflight) : await (async () => {
                                      verify_previous_manifest(previous_manifest, output_directory_of(root, config, output_override));
                                      return await build_site(root, config_path, output_override, browser_override, preview, get(decision, keyword("reason"), "changed"));
                                    })();
                                  })(skip_decision(config, classification2));
                                })(build_decision(config, classification2, forced));
                              })(load_config(config_path));
                            })(event_file === null ? requested_event() : classify_event(first_value(env_value("GITHUB_EVENT_NAME"), "workflow_dispatch"), JSON.parse(import_node_fs3.readFileSync(absolute_path(root, event_file), "utf8"))));
                          } catch (error) {
                            console.log(String("dogfood: ") + String(error["code"] ?? "DOGFOOD") + String(": ") + String(error["message"]));
                            set_output("built", "false");
                            set_output("reason", "failed");
                            return set_exit_code(1);
                          }
                        })();
                      })(first_value(option_value(arguments$, "--previous-manifest", null), action_input("previous-manifest")));
                    })(first_value(option_value(arguments$, "--event-file", null), first_value(action_input("event-file"), env_value("GITHUB_EVENT_PATH"))));
                  })(((__eliscript_value_57) => __eliscript_truthy18(__eliscript_value_57) ? __eliscript_value_57 : truthy_input_QMARK_(action_input("preview")))(flag_present_QMARK_(arguments$, "--preview")));
                })(option_value(arguments$, "--browser-bundle", null));
              })(((__eliscript_value_56) => __eliscript_truthy18(__eliscript_value_56) ? __eliscript_value_56 : truthy_input_QMARK_(action_input("force")))(flag_present_QMARK_(arguments$, "--force")));
            })(first_value(option_value(arguments$, "--output", null), action_input("output-directory")));
          })(absolute_path(root, config_file));
        })(config_input === null ? "dogfood.config.eli" : config_input);
      })(first_value(option_value(arguments$, "--config", null), action_input("config-file")));
    })(option_value(arguments$, "--root", first_value(env_value("GITHUB_WORKSPACE"), ".")));
  })(program_arguments);
}
main();

//# debugId=65367CB4E42A29D364756E2164756E21
