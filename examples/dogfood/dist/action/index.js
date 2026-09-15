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
  return ((state) => {
    return __eliscript_truthy(state === undefined) ? protocol_fail("expected an Eliscript protocol") : state;
  })(protocol_states["get"](protocol));
}
function normalize_name(value, label) {
  return __eliscript_truthy(((__eliscript_value_2) => __eliscript_truthy(__eliscript_value_2) ? __eliscript_value_2 : (value ?? []).length === 0)(!__eliscript_truthy(((__eliscript_value) => {
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
  })(value) === "string"))) ? protocol_fail(String(label) + String(" must be a non-empty string")) : value;
}
function normalize_protocol_operations(operations) {
  __eliscript_truthy(!__eliscript_truthy(protocol_array_QMARK_(operations))) && protocol_fail("protocol operations must be a non-empty dense array");
  return ((length) => {
    __eliscript_truthy(length === 0) && protocol_fail("protocol operations must be a non-empty dense array");
    __eliscript_truthy(length > protocol_max_operations) && protocol_fail(String("protocol operations exceed ") + String(protocol_max_operations));
    return ((descriptors) => {
      return ((keys) => {
        return ((normalized) => {
          return ((index) => {
            return (() => {
              __eliscript_truthy(((__eliscript_value_3, __eliscript_value_4) => __eliscript_value_3 !== __eliscript_value_4)((keys ?? []).length, length + 1)) && protocol_fail("protocol operations must be a dense array with no extra properties");
              (() => {
                while (__eliscript_truthy(index < length)) {
                  ((descriptor) => {
                    __eliscript_truthy(((__eliscript_value_5) => __eliscript_truthy(__eliscript_value_5) ? __eliscript_value_5 : ((__eliscript_value_6) => __eliscript_truthy(__eliscript_value_6) ? __eliscript_value_6 : !__eliscript_truthy(descriptor["enumerable"] ?? false))(!__eliscript_truthy(protocol_has_own(descriptor, "value"))))(descriptor === undefined)) && protocol_fail("protocol operations must contain enumerable data values");
                    return normalized["push"](normalize_name(descriptor["value"], "protocol operation"));
                  })(descriptors[String(index)] ?? undefined);
                  index = index + 1;
                }
                return null;
              })();
              return normalized;
            })();
          })(0);
        })([]);
      })(protocol_own_keys(descriptors));
    })(protocol_own_descriptors(operations));
  })((operations ?? []).length);
}
function operation_record(protocol, operation) {
  return ((state) => {
    return ((record) => {
      return __eliscript_truthy(record === undefined) ? protocol_fail(String("protocol ") + String(protocol["name"]) + String(" has no operation ") + String(operation)) : record;
    })(state["operations"]["get"](operation));
  })(protocol_state(protocol));
}
function protocol_host_category(value) {
  return __eliscript_truthy(value === null) ? "null" : protocol_host_type(value);
}
function known_host_category_QMARK_(category) {
  return ((index, found) => {
    (() => {
      while (__eliscript_truthy(((__eliscript_value_20) => __eliscript_truthy(__eliscript_value_20) ? !__eliscript_truthy(found) : __eliscript_value_20)(index < (protocol_host_categories ?? []).length))) {
        __eliscript_truthy(category === ((protocol_host_categories ?? [])[index] ?? null)) && (found = true);
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(0, false);
}
function normalize_implementations(protocol, implementations) {
  __eliscript_truthy(((__eliscript_value_21) => __eliscript_truthy(__eliscript_value_21) ? __eliscript_value_21 : !__eliscript_truthy(((__eliscript_value) => {
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
  })(implementations) === "object"))(implementations === null)) && protocol_fail(String("protocol ") + String(protocol["name"]) + String(" implementations must be an object"));
  return ((descriptors) => {
    return ((keys) => {
      return ((normalized) => {
        return ((index) => {
          return (() => {
            __eliscript_truthy((keys ?? []).length === 0) && protocol_fail(String("protocol ") + String(protocol["name"]) + String(" extension must implement at least one operation"));
            (() => {
              while (__eliscript_truthy(index < (keys ?? []).length)) {
                ((key) => {
                  return ((descriptor) => {
                    return (() => {
                      __eliscript_truthy(!__eliscript_truthy(((__eliscript_value) => {
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
                      })(key) === "string")) && protocol_fail(String("protocol ") + String(protocol["name"]) + String(" implementation names must be strings"));
                      operation_record(protocol, key);
                      __eliscript_truthy(((__eliscript_value_22) => __eliscript_truthy(__eliscript_value_22) ? __eliscript_value_22 : !__eliscript_truthy(((__eliscript_value) => {
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
                      })(descriptor["value"]) === "function"))(!__eliscript_truthy(protocol_has_own(descriptor, "value")))) && protocol_fail(String("protocol ") + String(protocol["name"]) + String("/") + String(key) + String(" implementation must be a function"));
                      return protocol_define_enumerable(normalized, key, descriptor["value"]);
                    })();
                  })(descriptors[key]);
                })((keys ?? [])[index] ?? null);
                index = index + 1;
              }
              return null;
            })();
            return protocol_freeze(normalized);
          })();
        })(0);
      })(protocol_null_object());
    })(protocol_own_keys(descriptors));
  })(protocol_own_descriptors(implementations));
}
function merge_implementations(current, incoming) {
  return ((merged, copy) => {
    copy = (source) => {
      return __eliscript_truthy(!__eliscript_truthy(source == null)) ? ((keys, index) => {
        return (() => {
          while (__eliscript_truthy(index < (keys ?? []).length)) {
            ((key) => {
              return protocol_define_enumerable(merged, key, source[key]);
            })((keys ?? [])[index] ?? null);
            index = index + 1;
          }
          return null;
        })();
      })(Object.keys(source ?? {}), 0) : null;
    };
    copy(current);
    copy(incoming);
    return protocol_freeze(merged);
  })(protocol_null_object(), null);
}
function direct_method(record, receiver) {
  return __eliscript_truthy(((__eliscript_value_23) => __eliscript_truthy(__eliscript_value_23) ? __eliscript_value_23 : receiver === undefined)(receiver === null)) ? protocol_missing : ((slot) => {
    return __eliscript_truthy(!__eliscript_truthy(protocol_property_present(receiver, slot))) ? protocol_missing : ((method) => {
      return __eliscript_truthy(((__eliscript_value) => {
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
      })(method) === "function") ? method : null;
    })(protocol_property_value(receiver, slot));
  })(record["slot"]);
}
function external_method(state, record, receiver) {
  return ((prototype) => {
    return ((exact_implementations) => {
      return ((exact) => {
        return __eliscript_truthy(!__eliscript_truthy(exact === undefined)) ? exact : ((category_implementations) => {
          return ((category) => {
            return __eliscript_truthy(!__eliscript_truthy(category === undefined)) ? category : state["defaults"][record["name"]] ?? protocol_missing;
          })(__eliscript_truthy(category_implementations === undefined) ? undefined : category_implementations[record["name"]] ?? undefined);
        })(state["categories"]["get"](protocol_host_category(receiver)));
      })(__eliscript_truthy(exact_implementations === undefined) ? undefined : exact_implementations[record["name"]] ?? undefined);
    })(__eliscript_truthy(prototype === protocol_missing) ? undefined : state["types"]["get"](prototype));
  })(protocol_exact_prototype(receiver, protocol_missing));
}
function dispatch(protocol, record, receiver, arguments$) {
  return ((direct) => {
    __eliscript_truthy(direct === null) && ((__eliscript_value_24) => {
      throw __eliscript_value_24;
    })(new ProtocolDispatchError(protocol, record["name"], receiver, "invalid-direct-slot"));
    return __eliscript_truthy(((__eliscript_value_25, __eliscript_value_26) => __eliscript_value_25 !== __eliscript_value_26)(direct, protocol_missing)) ? direct["apply"](receiver, arguments$) : ((external) => {
      return __eliscript_truthy(external === protocol_missing) ? ((__eliscript_value_27) => {
        throw __eliscript_value_27;
      })(new ProtocolDispatchError(protocol, record["name"], receiver)) : external(...[receiver, ...arguments$ ?? []]);
    })(external_method(protocol_state(protocol), record, receiver));
  })(direct_method(record, receiver));
}
function define_protocol(name, operations) {
  return ((protocol_name, protocol_operations) => {
    return ((records, operation_table, protocol, index) => {
      (() => {
        while (__eliscript_truthy(index < (protocol_operations ?? []).length)) {
          ((operation) => {
            __eliscript_truthy(records["has"](operation)) && protocol_fail(String("protocol ") + String(protocol_name) + String(" declares duplicate operation ") + String(operation));
            return ((slot) => {
              return ((method) => {
                return ((record) => {
                  return (() => {
                    records["set"](operation, record);
                    return protocol_define_enumerable(operation_table, operation, method);
                  })();
                })({ name: operation, slot, method });
              })((...invocation) => {
                __eliscript_truthy((invocation ?? []).length === 0) && protocol_fail(String("protocol ") + String(protocol_name) + String("/") + String(operation) + String(" requires a dispatch value"));
                return dispatch(protocol, records["get"](operation), invocation[0], invocation["slice"](1));
              });
            })(protocol_symbol(String("eliscript.protocol.") + String(protocol_name) + String("/") + String(operation)));
          })((protocol_operations ?? [])[index] ?? null);
          index = index + 1;
        }
        return null;
      })();
      protocol = protocol_freeze({ name: protocol_name, operations: protocol_freeze(operation_table) });
      index = 0;
      (() => {
        while (__eliscript_truthy(index < (protocol_operations ?? []).length)) {
          ((operation) => {
            return ((record) => {
              return ((method) => {
                return (() => {
                  protocol_define_metadata(method, protocol, operation, record["slot"]);
                  protocol_freeze(method);
                  return protocol_freeze(record);
                })();
              })(record["method"]);
            })(records["get"](operation));
          })((protocol_operations ?? [])[index] ?? null);
          index = index + 1;
        }
        return null;
      })();
      protocol_states["set"](protocol, { operations: records, types: protocol_map(), categories: protocol_map(), defaults: protocol_freeze(protocol_null_object()) });
      return protocol;
    })(protocol_map(), protocol_null_object(), null, 0);
  })(normalize_name(name, "protocol name"), normalize_protocol_operations(operations));
}
function protocol_method(protocol, operation) {
  return operation_record(protocol, operation)["method"];
}
function protocol_slot(protocol, operation) {
  return operation_record(protocol, operation)["slot"];
}
function extend_protocol_type(protocol, constructor, implementations) {
  return ((state) => {
    __eliscript_truthy(!__eliscript_truthy(((__eliscript_value) => {
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
    })(constructor) === "function")) && protocol_fail(String("protocol ") + String(protocol["name"]) + String(" exact type must be a constructor with a prototype"));
    return ((prototype) => {
      __eliscript_truthy(((__eliscript_value_28) => __eliscript_truthy(__eliscript_value_28) ? __eliscript_value_28 : !__eliscript_truthy(((__eliscript_value) => {
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
      })(prototype) === "object"))(prototype === null)) && protocol_fail(String("protocol ") + String(protocol["name"]) + String(" exact type must be a constructor with a prototype"));
      ((normalized) => {
        return ((current) => {
          return state["types"]["set"](prototype, merge_implementations(current, normalized));
        })(state["types"]["get"](prototype));
      })(normalize_implementations(protocol, implementations));
      return protocol;
    })(constructor["prototype"] ?? null);
  })(protocol_state(protocol));
}
function extend_protocol_category(protocol, category, implementations) {
  return ((state) => {
    __eliscript_truthy(!__eliscript_truthy(known_host_category_QMARK_(category))) && protocol_fail(String("unknown protocol host category ") + String(category));
    ((normalized) => {
      return ((current) => {
        return state["categories"]["set"](category, merge_implementations(current, normalized));
      })(state["categories"]["get"](category));
    })(normalize_implementations(protocol, implementations));
    return protocol;
  })(protocol_state(protocol));
}
function implements_protocol_operation_QMARK_(protocol, operation, value) {
  return ((record) => {
    return ((direct) => {
      return ((__eliscript_value_29) => __eliscript_truthy(__eliscript_value_29) ? ((__eliscript_value_30) => __eliscript_truthy(__eliscript_value_30) ? __eliscript_value_30 : ((__eliscript_value_33, __eliscript_value_34) => __eliscript_value_33 !== __eliscript_value_34)(external_method(protocol_state(protocol), record, value), protocol_missing))(((__eliscript_value_31, __eliscript_value_32) => __eliscript_value_31 !== __eliscript_value_32)(direct, protocol_missing)) : __eliscript_value_29)(!__eliscript_truthy(direct === null));
    })(direct_method(record, value));
  })(operation_record(protocol, operation));
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
  return ((result, index, limit) => {
    (() => {
      while (__eliscript_truthy2(index < limit)) {
        result = String(result) + String(nth(text, index)), index = index + 1;
      }
      return null;
    })();
    return result;
  })("", __eliscript_truthy2(start < 0) ? 0 : start, __eliscript_truthy2(end > count(text)) ? count(text) : end);
}
function starts_at_QMARK_(prefix, offset, text) {
  return ((matched, index) => {
    (() => {
      while (__eliscript_truthy2(((__eliscript_value_2) => __eliscript_truthy2(__eliscript_value_2) ? index < count(prefix) : __eliscript_value_2)(matched))) {
        __eliscript_truthy2(!__eliscript_truthy2(nth(prefix, index) === nth(text, offset + index))) && (matched = false);
        index = index + 1;
      }
      return null;
    })();
    return matched;
  })(((__eliscript_value_1) => __eliscript_truthy2(__eliscript_value_1) ? offset + count(prefix) <= count(text) : __eliscript_value_1)(offset >= 0), 0);
}
function starts_with_QMARK_(prefix, text) {
  return starts_at_QMARK_(prefix, 0, text);
}
function ends_with_QMARK_(suffix, text) {
  return starts_at_QMARK_(suffix, count(text) - count(suffix), text);
}
function contains_QMARK_(needle, text) {
  return ((found, offset, last_offset) => {
    (() => {
      while (__eliscript_truthy2(((__eliscript_value_3) => __eliscript_truthy2(__eliscript_value_3) ? offset <= last_offset : __eliscript_value_3)(!__eliscript_truthy2(found)))) {
        __eliscript_truthy2(starts_at_QMARK_(needle, offset, text)) && (found = true);
        offset = offset + 1;
      }
      return null;
    })();
    return found;
  })(false, 0, count(text) - count(needle));
}
function strip_prefix(prefix, text) {
  return __eliscript_truthy2(starts_with_QMARK_(prefix, text)) ? slice(count(prefix), count(text), text) : text;
}
function whitespace_QMARK_(character) {
  return ((__eliscript_value_4) => __eliscript_truthy2(__eliscript_value_4) ? __eliscript_value_4 : ((__eliscript_value_5) => __eliscript_truthy2(__eliscript_value_5) ? __eliscript_value_5 : ((__eliscript_value_6) => __eliscript_truthy2(__eliscript_value_6) ? __eliscript_value_6 : character === "\r")(character === `
`))(character === "\t"))(character === " ");
}
function trim(text) {
  return ((start, end) => {
    (() => {
      while (__eliscript_truthy2(((__eliscript_value_7) => __eliscript_truthy2(__eliscript_value_7) ? whitespace_QMARK_(nth(text, start)) : __eliscript_value_7)(start <= end))) {
        start = start + 1;
      }
      return null;
    })();
    (() => {
      while (__eliscript_truthy2(((__eliscript_value_8) => __eliscript_truthy2(__eliscript_value_8) ? whitespace_QMARK_(nth(text, end)) : __eliscript_value_8)(end >= start))) {
        end = end - 1;
      }
      return null;
    })();
    return slice(start, end + 1, text);
  })(0, count(text) - 1);
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
  return ((__eliscript_value_4) => __eliscript_truthy3(__eliscript_value_4) ? code <= 90 : __eliscript_value_4)(code >= 65);
}
function lower_code_QMARK_(code) {
  return ((__eliscript_value_5) => __eliscript_truthy3(__eliscript_value_5) ? code <= 122 : __eliscript_value_5)(code >= 97);
}
function digit_code_QMARK_(code) {
  return ((__eliscript_value_6) => __eliscript_truthy3(__eliscript_value_6) ? code <= 57 : __eliscript_value_6)(code >= 48);
}
function lower_code(code) {
  return __eliscript_truthy3(upper_code_QMARK_(code)) ? code + 32 : code;
}
function to_lowercase(text) {
  return ((result, index) => {
    (() => {
      while (__eliscript_truthy3(index < text_length(text))) {
        result = String(result) + String(String.fromCharCode(lower_code(char_code(text, index)))), index = index + 1;
      }
      return null;
    })();
    return result;
  })("", 0);
}
function split_lines(text) {
  return ((lines, start, index, size) => {
    (() => {
      while (__eliscript_truthy3(index < size)) {
        __eliscript_truthy3(char_code(text, index) === 10) && (lines = conj(lines, slice(start, index, text)), start = index + 1);
        index = index + 1;
      }
      return null;
    })();
    return conj(lines, slice(start, size, text));
  })(vector(), 0, 0, text_length(text));
}
function split_on(separator, text) {
  return ((parts, start, index, size, width) => {
    (() => {
      while (__eliscript_truthy3(index < size)) {
        __eliscript_truthy3(((__eliscript_value_7) => __eliscript_truthy3(__eliscript_value_7) ? ((__eliscript_value_8) => __eliscript_truthy3(__eliscript_value_8) ? slice(index, index + width, text) === separator : __eliscript_value_8)(index + width <= size) : __eliscript_value_7)(width > 0)) ? (parts = conj(parts, slice(start, index, text)), index = index + width, start = index) : index = index + 1;
      }
      return null;
    })();
    return conj(parts, slice(start, size, text));
  })(vector(), 0, 0, text_length(text), text_length(separator));
}
function index_of_from(needle, text, start) {
  return ((found, index, width, limit) => {
    (() => {
      while (__eliscript_truthy3(((__eliscript_value_9) => __eliscript_truthy3(__eliscript_value_9) ? index <= limit : __eliscript_value_9)(found < 0))) {
        __eliscript_truthy3(slice(index, index + width, text) === needle) && (found = index);
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(-1, start, text_length(needle), text_length(text) - text_length(needle));
}
function index_of(needle, text) {
  return index_of_from(needle, text, 0);
}
function basename(path) {
  return ((last, index) => {
    (() => {
      while (__eliscript_truthy3(index < text_length(path))) {
        __eliscript_truthy3(char_code(path, index) === 47) && (last = index);
        index = index + 1;
      }
      return null;
    })();
    return __eliscript_truthy3(last < 0) ? path : slice(last + 1, text_length(path), path);
  })(-1, 0);
}
function without_suffix(suffix, text) {
  return __eliscript_truthy3(ends_with_QMARK_(suffix, text)) ? slice(0, text_length(text) - text_length(suffix), text) : text;
}
function parse_integer(text, fallback) {
  return ((value) => {
    return __eliscript_truthy3(value === value) ? value : fallback;
  })(Number(trim(text)));
}
function replace_all(needle, replacement, text) {
  return ((result, index, size, width) => {
    (() => {
      while (__eliscript_truthy3(index < size)) {
        __eliscript_truthy3(((__eliscript_value_10) => __eliscript_truthy3(__eliscript_value_10) ? ((__eliscript_value_11) => __eliscript_truthy3(__eliscript_value_11) ? slice(index, index + width, text) === needle : __eliscript_value_11)(index + width <= size) : __eliscript_value_10)(width > 0)) ? (result = String(result) + String(replacement), index = index + width) : (result = String(result) + String(String.fromCharCode(char_code(text, index))), index = index + 1);
      }
      return null;
    })();
    return result;
  })("", 0, text_length(text), text_length(needle));
}
function strip_tags(html) {
  return ((result, index, in_tag, size) => {
    (() => {
      while (__eliscript_truthy3(index < size)) {
        ((code) => {
          return __eliscript_truthy3(code === 60) ? in_tag = true : __eliscript_truthy3(code === 62) ? in_tag = false : __eliscript_truthy3(!__eliscript_truthy3(in_tag)) ? result = String(result) + String(String.fromCharCode(code)) : null;
        })(char_code(html, index));
        index = index + 1;
      }
      return null;
    })();
    return decode_entities(result);
  })("", 0, false, text_length(html));
}
function decode_entities(text) {
  return replace_all("&amp;", "&", replace_all("&#39;", "'", replace_all("&quot;", '"', replace_all("&gt;", ">", replace_all("&lt;", "<", text)))));
}
function slugify(text) {
  return ((lowered, result, pending_dash, index) => {
    (() => {
      while (__eliscript_truthy3(index < text_length(lowered))) {
        ((code) => {
          return __eliscript_truthy3(((__eliscript_value_12) => __eliscript_truthy3(__eliscript_value_12) ? __eliscript_value_12 : digit_code_QMARK_(code))(lower_code_QMARK_(code))) ? (result = String(result) + String(__eliscript_truthy3(pending_dash) ? "-" : "") + String(String.fromCharCode(code)), pending_dash = false) : pending_dash = text_length(result) > 0;
        })(char_code(lowered, index));
        index = index + 1;
      }
      return null;
    })();
    return result;
  })(to_lowercase(text), "", false, 0);
}

// examples/dogfood/dist/src/support/sanitize.mjs
var __eliscript_truthy4 = (value) => value !== false && value != null;
var ampersand = 38;
var less_than = 60;
var greater_than = 62;
var double_quote = 34;
var single_quote = 39;
function escape_html(text) {
  return ((result, index) => {
    (() => {
      while (__eliscript_truthy4(index < text_length(text))) {
        ((code) => {
          return result = String(result) + String(__eliscript_truthy4(code === ampersand) ? "&amp;" : __eliscript_truthy4(code === less_than) ? "&lt;" : __eliscript_truthy4(code === greater_than) ? "&gt;" : __eliscript_truthy4(code === double_quote) ? "&quot;" : __eliscript_truthy4(code === single_quote) ? "&#39;" : String.fromCharCode(code)), index = index + 1;
        })(char_code(text, index));
      }
      return null;
    })();
    return result;
  })("", 0);
}
function safe_url_QMARK_(url) {
  return ((target) => {
    return ((__eliscript_value_1) => __eliscript_truthy4(__eliscript_value_1) ? __eliscript_value_1 : ((__eliscript_value_2) => __eliscript_truthy4(__eliscript_value_2) ? __eliscript_value_2 : ((__eliscript_value_3) => __eliscript_truthy4(__eliscript_value_3) ? __eliscript_value_3 : ((__eliscript_value_4) => __eliscript_truthy4(__eliscript_value_4) ? __eliscript_value_4 : ((__eliscript_value_5) => __eliscript_truthy4(__eliscript_value_5) ? __eliscript_value_5 : ((__eliscript_value_7) => __eliscript_truthy4(__eliscript_value_7) ? !__eliscript_truthy4(starts_with_QMARK_("//", target)) : __eliscript_value_7)(!__eliscript_truthy4(contains_QMARK_(":", target))))(((__eliscript_value_6) => __eliscript_truthy4(__eliscript_value_6) ? !__eliscript_truthy4(starts_with_QMARK_("//", target)) : __eliscript_value_6)(starts_with_QMARK_("/", target))))(starts_with_QMARK_("#", target)))(starts_with_QMARK_("mailto:", target)))(starts_with_QMARK_("http://", target)))(starts_with_QMARK_("https://", target));
  })(trim(url));
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
  return __eliscript_truthy5(root === "") ? "./" : root;
}
function nav_links(root) {
  return String('<details class="menu" open><summary>Menu</summary>') + String('<nav aria-label="site">') + String('<a href="') + String(root) + String('archive/">Archive</a>') + String('<a href="') + String(root) + String('tags/">Tags</a>') + String('<a href="') + String(root) + String('search/">Search</a>') + String('<a href="') + String(root) + String('feed.xml">Feed</a>') + String('<a href="https://github.com/">GitHub</a>') + String('<button id="theme-toggle" class="theme-toggle" type="button"') + String(' title="Switch the colour theme">Theme</button>') + String("</nav></details>");
}
function document(site, root, title, description, content) {
  return ((site_title, language, preview) => {
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
  })(get(site, keyword("title"), "dogfood"), get(site, keyword("language"), "en"), get(site, keyword("preview"), false));
}

// examples/dogfood/dist/src/renderer/server.mjs
var __eliscript_truthy6 = (value) => value !== false && value != null;
var recent_limit = 12;
var to_native_array = (value) => Array.from(value);
function compare_posts(left, right) {
  return ((left_pinned, right_pinned) => {
    return __eliscript_truthy6(!__eliscript_truthy6(left_pinned === right_pinned)) ? __eliscript_truthy6(left_pinned > right_pinned) ? -1 : 1 : __eliscript_truthy6(!__eliscript_truthy6(left["published-at"] === right["published-at"])) ? __eliscript_truthy6(left["published-at"] > right["published-at"]) ? -1 : 1 : __eliscript_truthy6(left["id"] === right["id"]) ? 0 : __eliscript_truthy6(left["id"] < right["id"]) ? -1 : 1;
  })(left["pinned-weight"], right["pinned-weight"]);
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
  return ((tags, result, index) => {
    (() => {
      while (__eliscript_truthy6(index < count(tags))) {
        ((tag) => {
          return result = String(result) + String('<a class="tag" href="') + String(root) + String("tags/") + String(slugify(tag)) + String('/">') + String(escape_html(tag)) + String("</a>");
        })(nth(tags, index));
        index = index + 1;
      }
      return null;
    })();
    return result;
  })(post["tags"], "", 0);
}
function render_card(root, post) {
  return ((summary) => {
    return String('<li><a class="title" href="') + String(root) + String("posts/") + String(post["slug"]) + String('/">') + String(escape_html(post["title"])) + String("</a>") + String(__eliscript_truthy6(blank_QMARK_(summary)) ? "" : String('<p class="summary">') + String(escape_html(summary)) + String("</p>")) + String('<div class="meta"><span>') + String(escape_html(post["published-at"])) + String("</span>") + String(render_tag_links(root, post)) + String("</div></li>");
  })(post["summary"]);
}
function render_post_list(root, posts) {
  return ((items, index) => {
    (() => {
      while (__eliscript_truthy6(index < count(posts))) {
        items = String(items) + String(render_card(root, nth(posts, index))), index = index + 1;
      }
      return null;
    })();
    return String('<ul class="list">') + String(items) + String("</ul>");
  })("", 0);
}
function section(heading, content) {
  return __eliscript_truthy6(blank_QMARK_(content)) ? "" : String("<h2>") + String(escape_html(heading)) + String("</h2>") + String(content);
}
function tagged_QMARK_(post, tag) {
  return ((tags, index, found) => {
    (() => {
      while (__eliscript_truthy6(((__eliscript_value_1) => __eliscript_truthy6(__eliscript_value_1) ? !__eliscript_truthy6(found) : __eliscript_value_1)(index < count(tags)))) {
        __eliscript_truthy6(nth(tags, index) === tag) && (found = true);
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(post["tags"], 0, false);
}
function posts_with_tag(tag, posts) {
  return filter((post) => {
    return tagged_QMARK_(post, tag);
  }, posts);
}
function collect_tags(posts) {
  return ((seen, tags, index) => {
    (() => {
      while (__eliscript_truthy6(index < count(posts))) {
        ((post_tags) => {
          return ((tag_index) => {
            return (() => {
              while (__eliscript_truthy6(tag_index < count(post_tags))) {
                ((tag) => {
                  return __eliscript_truthy6(!__eliscript_truthy6(get(seen, tag, false))) ? (seen = assoc(seen, tag, true), tags = conj(tags, tag)) : null;
                })(nth(post_tags, tag_index));
                tag_index = tag_index + 1;
              }
              return null;
            })();
          })(0);
        })(nth(posts, index)["tags"]);
        index = index + 1;
      }
      return null;
    })();
    return sort(tags);
  })(hashMap(), vector(), 0);
}
function render_home(site, posts) {
  return ((recent) => {
    return ((description) => {
      return hashMap(keyword("path"), "index.html", keyword("content"), document(site, "", site_value(site, keyword("title"), "dogfood"), description, String('<div class="article">') + String("<h1>") + String(escape_html(site_value(site, keyword("title"), "dogfood"))) + String("</h1>") + String(__eliscript_truthy6(blank_QMARK_(description)) ? "" : String('<p class="lede">') + String(escape_html(description)) + String("</p>")) + String("</div>") + String(section("Recent writing", render_post_list("", recent)))));
    })(site_value(site, keyword("description"), ""));
  })(take(recent_limit, posts));
}
function render_archive(site, posts) {
  return hashMap(keyword("path"), "archive/index.html", keyword("content"), document(site, "../", "Archive", "Every published article in date order.", String('<div class="article"><h1>Archive</h1>') + String('<p class="crumbs"><a href="../">Home</a></p></div>') + String(render_post_list("../", posts))));
}
function neighbour_link(root, label, post) {
  return __eliscript_truthy6(post === null) ? "" : String('<a href="') + String(root) + String("posts/") + String(post["slug"]) + String('/">') + String(escape_html(label)) + String(": ") + String(escape_html(post["title"])) + String("</a>");
}
function render_neighbours(root, posts, position) {
  return ((newer, older) => {
    return __eliscript_truthy6(((__eliscript_value_2) => __eliscript_truthy6(__eliscript_value_2) ? older === null : __eliscript_value_2)(newer === null)) ? "" : String('<nav class="crumbs" aria-label="article">') + String(neighbour_link(root, "Newer", newer)) + String(__eliscript_truthy6(((__eliscript_value_3) => __eliscript_truthy6(__eliscript_value_3) ? !__eliscript_truthy6(older === null) : __eliscript_value_3)(!__eliscript_truthy6(newer === null))) ? " · " : "") + String(neighbour_link(root, "Older", older)) + String("</nav>");
  })(__eliscript_truthy6(position > 0) ? nth(posts, position - 1) : null, __eliscript_truthy6(position < count(posts) - 1) ? nth(posts, position + 1) : null);
}
function render_post_page(site, post, posts, position) {
  return ((root) => {
    return ((slug) => {
      return ((updated) => {
        return ((summary) => {
          return ((source_path) => {
            return hashMap(keyword("path"), String("posts/") + String(slug) + String("/index.html"), keyword("content"), document(site, root, post["title"], summary, String('<article class="article">') + String(render_neighbours(root, posts, position)) + String("<h1>") + String(escape_html(post["title"])) + String("</h1>") + String(__eliscript_truthy6(blank_QMARK_(summary)) ? "" : String('<p class="lede">') + String(escape_html(summary)) + String("</p>")) + String('<div class="meta"><span>') + String(escape_html(post["published-at"])) + String("</span>") + String(__eliscript_truthy6(updated === post["published-at"]) ? "" : String("<span>updated ") + String(escape_html(updated)) + String("</span>")) + String(render_tag_links(root, post)) + String("</div>") + String(post["body"]) + String("<hr>") + String('<p class="provenance">Markdown · ') + String(escape_html(source_path)) + String(' · <a href="') + String(root) + String('archive/">archive</a></p>') + String(render_comment_channels(post)) + String("</article>")));
          })(get(post["provenance"], keyword("path"), ""));
        })(post["summary"]);
      })(post["updated-at"]);
    })(post["slug"]);
  })("../../");
}
function render_alias_page(site, post, alias) {
  return ((slug, title) => {
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
  })(post["slug"], post["title"]);
}
function alias_documents(site, posts) {
  return ((documents, index) => {
    (() => {
      while (__eliscript_truthy6(index < count(posts))) {
        ((post) => {
          return ((aliases) => {
            return ((alias_index) => {
              return (() => {
                while (__eliscript_truthy6(alias_index < count(aliases))) {
                  documents = conj(documents, render_alias_page(site, post, nth(aliases, alias_index))), alias_index = alias_index + 1;
                }
                return null;
              })();
            })(0);
          })(post["aliases"]);
        })(nth(posts, index));
        index = index + 1;
      }
      return null;
    })();
    return documents;
  })(vector(), 0);
}
function display_name(value) {
  return ((text) => {
    return __eliscript_truthy6(slice(0, 1, text) === ":") ? slice(1, text_length(text), text) : text;
  })(String(value));
}
function provider_label(kind) {
  return __eliscript_truthy6(kind === keyword("issue")) ? "GitHub Issues" : __eliscript_truthy6(kind === keyword("discussion")) ? "GitHub Discussions" : display_name(kind);
}
function channel_binding(channel) {
  return ((binding) => {
    return __eliscript_truthy6(binding === null) ? "" : ((repository, number) => {
      return __eliscript_truthy6(number === null) ? repository : String(repository) + String("#") + String(number);
    })(get(binding, keyword("repository"), ""), get(binding, keyword("number"), null));
  })(get(channel, keyword("binding"), null));
}
function render_refresh_note(channel, binding) {
  return ((kind_name) => {
    return ((snapshot) => {
      return ((count_value) => {
        return ((posting) => {
          return String('<p class="comment-note refresh-note"') + String(' data-comment-refresh="1"') + String(' data-comment-kind="') + String(escape_html(kind_name)) + String('"') + String(' data-comment-count="') + String(String(count_value)) + String('"') + String(' data-comment-binding="') + String(escape_html(binding)) + String('"') + String(__eliscript_truthy6(blank_QMARK_(snapshot)) ? "" : String(' data-comment-snapshot="') + String(escape_html(String(snapshot))) + String('"')) + String(">Snapshot") + String(__eliscript_truthy6(blank_QMARK_(snapshot)) ? "" : String(" from ") + String(escape_html(String(snapshot)))) + String(__eliscript_truthy6(count_value > 0) ? String(" with ") + String(count_value) + String(" comments") : "") + String(".") + String(__eliscript_truthy6(blank_QMARK_(posting)) ? "" : String(' <a href="') + String(escape_html(posting)) + String('">Read or reply at ') + String(escape_html(posting)) + String("</a>.")) + String('<span class="refresh-verdict"></span>') + String("</p>");
        })(provider_thread_url(binding));
      })(get(channel, keyword("count"), 0));
    })(get(channel, keyword("updated-at"), null));
  })(display_name(get(channel, keyword("kind"), keyword("issue"))));
}
function provider_thread_url(binding) {
  return __eliscript_truthy6(blank_QMARK_(binding)) ? "" : ((hash) => {
    return ((path) => {
      return ((number) => {
        return __eliscript_truthy6(blank_QMARK_(number)) ? String("https://github.com/") + String(path) : String("https://github.com/") + String(path) + String("/issues/") + String(number);
      })(__eliscript_truthy6(hash < 0) ? "" : slice(hash + 1, text_length(binding), binding));
    })(__eliscript_truthy6(hash < 0) ? binding : slice(0, hash, binding));
  })(index_of("#", binding));
}
function render_comment_item(comment) {
  return ((author) => {
    return ((login) => {
      return ((url) => {
        return ((created) => {
          return ((updated) => {
            return String('<li class="comment">') + String('<div class="meta"><span class="comment-author">') + String(escape_html(login)) + String("</span>") + String("<span>") + String(escape_html(created)) + String("</span>") + String(__eliscript_truthy6(updated === created) ? "" : String("<span>updated ") + String(escape_html(updated)) + String("</span>")) + String(__eliscript_truthy6(url === null) ? "" : String('<a href="') + String(escape_html(url)) + String('">on GitHub</a>')) + String("</div>") + String('<div class="comment-body">') + String(get(comment, keyword("body"), "")) + String("</div>") + String(((replies) => {
              return __eliscript_truthy6(count(replies) === 0) ? "" : String('<ol class="comments-list comment-replies">') + String(render_reply_items(replies)) + String("</ol>");
            })(get(comment, keyword("replies"), vector()))) + String("</li>");
          })(String(get(comment, keyword("updated-at"), "")));
        })(String(get(comment, keyword("created-at"), "")));
      })(get(comment, keyword("url"), null));
    })(String(get(author, keyword("login"), "unknown")));
  })(get(comment, keyword("author"), hashMap()));
}
function render_reply_items(items) {
  return ((markup, index) => {
    (() => {
      while (__eliscript_truthy6(index < count(items))) {
        markup = String(markup) + String(render_comment_item(nth(items, index))), index = index + 1;
      }
      return null;
    })();
    return markup;
  })("", 0);
}
function render_comment_items(items) {
  return ((markup, index) => {
    (() => {
      while (__eliscript_truthy6(index < count(items))) {
        markup = String(markup) + String(render_comment_item(nth(items, index))), index = index + 1;
      }
      return null;
    })();
    return String('<ol class="comments-list">') + String(markup) + String("</ol>");
  })("", 0);
}
function render_channel_heading(channel) {
  return ((count_value, freshness) => {
    return String("<h2>Comments") + String(__eliscript_truthy6(((__eliscript_value_4) => __eliscript_truthy6(__eliscript_value_4) ? count_value > 0 : __eliscript_value_4)(!__eliscript_truthy6(count_value === null))) ? String(" (") + String(count_value) + String(")") : "") + String("</h2>") + String(__eliscript_truthy6(blank_QMARK_(freshness)) ? "" : String('<p class="comment-note">Snapshot from ') + String(escape_html(String(freshness))) + String(".</p>"));
  })(get(channel, keyword("count"), null), get(channel, keyword("updated-at"), null));
}
function render_channel(channel) {
  return ((mode) => {
    return ((kind) => {
      return ((provider) => {
        return ((binding) => {
          return ((items) => {
            return String('<section class="comments" data-comment-provider="') + String(escape_html(provider)) + String('"') + String(__eliscript_truthy6(blank_QMARK_(binding)) ? "" : String(' data-comments-binding="') + String(escape_html(binding)) + String('"')) + String(">") + String(render_channel_heading(channel)) + String(__eliscript_truthy6(((__eliscript_value_5) => __eliscript_truthy6(__eliscript_value_5) ? __eliscript_value_5 : mode === keyword("external"))(mode === keyword("embed"))) ? String('<div class="embed-region" data-comment-mount="') + String(escape_html(provider)) + String('">') + String('<p class="comment-note">Comments are provided by ') + String(escape_html(provider)) + String(". The browser loads that provider; this build does not") + String(" script it.</p>") + String(((fallback) => {
              return __eliscript_truthy6(blank_QMARK_(fallback)) ? "" : String('<p class="comment-note">If it does not load, read') + String(' the thread at <a href="') + String(escape_html(fallback)) + String('">') + String(escape_html(fallback)) + String("</a>.</p>");
            })(__eliscript_truthy6(blank_QMARK_(binding)) ? ((__eliscript_value_6) => __eliscript_truthy6(__eliscript_value_6) ? __eliscript_value_6 : "")(get(channel, keyword("provider-url"), null)) : binding)) + String("</div>") : __eliscript_truthy6(mode === keyword("live")) ? String('<p class="comment-note">') + String(__eliscript_truthy6(blank_QMARK_(binding)) ? "This channel is served live." : String("This thread is served live for ") + String(escape_html(binding)) + String(".")) + String(" A comment never triggers a build; open the provider to") + String(" read or reply.</p>") : __eliscript_truthy6(mode === keyword("hybrid")) ? String(__eliscript_truthy6(count(items) === 0) ? '<p class="comment-note">No comments in this snapshot yet.</p>' : render_comment_items(items)) + String(render_refresh_note(channel, binding)) : __eliscript_truthy6(count(items) === 0) ? '<p class="comment-note">No comments in this snapshot.</p>' : render_comment_items(items)) + String("</section>");
          })(get(channel, keyword("items"), vector()));
        })(channel_binding(channel));
      })(provider_label(kind));
    })(get(channel, keyword("kind"), keyword("issue")));
  })(get(channel, keyword("mode"), keyword("snapshot")));
}
function render_comment_channels(post) {
  return ((channels) => {
    return ((markup, index) => {
      (() => {
        while (__eliscript_truthy6(index < count(channels))) {
          markup = String(markup) + String(render_channel(nth(channels, index))), index = index + 1;
        }
        return null;
      })();
      return markup;
    })("", 0);
  })(get(post, keyword("comment-channels")));
}
function render_tag_index(site, tags, posts) {
  return ((items, index) => {
    (() => {
      while (__eliscript_truthy6(index < count(tags))) {
        ((tag) => {
          return items = String(items) + String('<li><a class="title" href="') + String(slugify(tag)) + String('/">') + String(escape_html(tag)) + String("</a>") + String('<div class="meta"><span>') + String(count(posts_with_tag(tag, posts))) + String(" articles</span></div></li>");
        })(nth(tags, index));
        index = index + 1;
      }
      return null;
    })();
    return hashMap(keyword("path"), "tags/index.html", keyword("content"), document(site, "../", "Tags", "Articles grouped by tag.", String('<div class="article"><h1>Tags</h1>') + String('<p class="crumbs"><a href="../">Home</a></p></div>') + String('<ul class="list">') + String(items) + String("</ul>")));
  })("", 0);
}
function render_tag_page(site, tag, posts) {
  return ((matching) => {
    return hashMap(keyword("path"), String("tags/") + String(slugify(tag)) + String("/index.html"), keyword("content"), document(site, "../../", String("Tag: ") + String(tag), String("Articles tagged ") + String(tag) + String("."), String('<div class="article"><h1>') + String(escape_html(tag)) + String("</h1>") + String('<p class="crumbs"><a href="../../">Home</a> · ') + String('<a href="../">Tags</a></p></div>') + String(render_post_list("../../", matching))));
  })(filter((post) => {
    return tagged_QMARK_(post, tag);
  }, posts));
}
function render_search_page(site) {
  return hashMap(keyword("path"), "search/index.html", keyword("content"), document(site, "../", "Search", "Search every published article locally.", String('<div class="article"><h1>Search</h1>') + String('<p class="crumbs"><a href="../">Home</a></p>') + String('<div class="search-form">') + String('<label class="skip" for="search-input">Search articles</label>') + String('<input id="search-input" type="search" autocomplete="off"') + String(' placeholder="Search title, summary, tags, or text">') + String("</div>") + String('<div id="search-results" aria-live="polite"></div>') + String('<noscript><p class="comment-note">Search needs JavaScript.') + String(" Every article is still reachable from the") + String(' <a href="../archive/">archive</a>.</p></noscript>') + String("</div>")));
}
function render_not_found(site) {
  return hashMap(keyword("path"), "404.html", keyword("content"), document(site, "", "Not found", "The requested page does not exist.", String('<div class="article"><h1>Not found</h1>') + String('<p class="empty">That page does not exist. ') + String('<a href="./">Return home</a>.</p></div>')));
}
function render_feed(site, posts) {
  return ((base, title, entries, index) => {
    (() => {
      while (__eliscript_truthy6(index < count(posts))) {
        ((post) => {
          return ((url) => {
            return (() => {
              entries = String(entries) + String("<entry><title>") + String(escape_html(post["title"])) + String("</title>") + String('<link href="') + String(escape_html(url)) + String('"/>') + String("<id>") + String(escape_html(url)) + String("</id>") + String("<updated>") + String(escape_html(post["updated-at"])) + String("T00:00:00Z</updated>") + String("<summary>") + String(escape_html(post["summary"])) + String("</summary>") + String("</entry>");
              return index = index + 1;
            })();
          })(String(base) + String("posts/") + String(post["slug"]) + String("/"));
        })(nth(posts, index));
      }
      return null;
    })();
    return hashMap(keyword("path"), "feed.xml", keyword("content"), String(`<?xml version="1.0" encoding="utf-8"?>
`) + String('<feed xmlns="http://www.w3.org/2005/Atom">') + String("<title>") + String(escape_html(title)) + String("</title>") + String('<link href="') + String(escape_html(base)) + String('"/>') + String("<id>") + String(escape_html(base)) + String("</id>") + String(entries) + String(`</feed>
`));
  })(site_value(site, keyword("base-url"), "/"), site_value(site, keyword("title"), "dogfood"), "", 0);
}
function render_sitemap(site, posts) {
  return ((urls, index) => {
    (() => {
      while (__eliscript_truthy6(index < count(posts))) {
        urls = String(urls) + String("<url><loc>") + String(escape_html(absolute_url(site, String("posts/") + String(nth(posts, index)["slug"]) + String("/")))) + String("</loc></url>");
        index = index + 1;
      }
      return null;
    })();
    return hashMap(keyword("path"), "sitemap.xml", keyword("content"), String(`<?xml version="1.0" encoding="utf-8"?>
`) + String('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">') + String(urls) + String(`</urlset>
`));
  })(String("<url><loc>") + String(escape_html(absolute_url(site, ""))) + String("</loc></url>") + String("<url><loc>") + String(escape_html(absolute_url(site, "archive/"))) + String("</loc></url>") + String("<url><loc>") + String(escape_html(absolute_url(site, "tags/"))) + String("</loc></url>"), 0);
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
  return ((sorted) => {
    return ((tags) => {
      return ((post_pages) => {
        return ((tag_pages) => {
          return ((documents) => {
            return (() => {
              ((index) => {
                return (() => {
                  while (__eliscript_truthy6(index < count(sorted))) {
                    post_pages = conj(post_pages, render_post_page(site, nth(sorted, index), sorted, index)), index = index + 1;
                  }
                  return null;
                })();
              })(0);
              ((index) => {
                return (() => {
                  while (__eliscript_truthy6(index < count(tags))) {
                    tag_pages = conj(tag_pages, render_tag_page(site, nth(tags, index), sorted)), index = index + 1;
                  }
                  return null;
                })();
              })(0);
              documents = conj(documents, render_home(site, sorted));
              documents = conj(documents, render_archive(site, sorted));
              documents = conj(documents, render_tag_index(site, tags, sorted));
              documents = conj(documents, render_search_page(site));
              documents = conj(documents, render_not_found(site));
              __eliscript_truthy6(!__eliscript_truthy6(preview_QMARK_(site))) && (() => {
                documents = conj(documents, render_feed(site, sorted));
                return documents = conj(documents, render_sitemap(site, sorted));
              })();
              documents = conj(documents, render_search_index(site, sorted));
              documents = conj(documents, __eliscript_truthy6(preview_QMARK_(site)) ? render_preview_robots() : render_robots(site));
              documents = conj(documents, hashMap(keyword("path"), "assets/site.css", keyword("content"), site_css));
              return append_all(append_all(append_all(documents, post_pages), tag_pages), alias_documents(site, sorted));
            })();
          })(vector());
        })(vector());
      })(vector());
    })(collect_tags(sorted));
  })(sort_posts(posts));
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
  return ((colon) => {
    return __eliscript_truthy7(colon < 1) ? null : vector(trim(slice(0, colon, line)), trim(slice(colon + 1, text_length(line), line)));
  })(index_of(":", line));
}
function parse_fields(lines, start, end) {
  return ((fields, index) => {
    (() => {
      while (__eliscript_truthy7(index < end)) {
        ((pair) => {
          return __eliscript_truthy7(pair) ? fields = assoc(fields, nth(pair, 0, null), nth(pair, 1, null)) : null;
        })(parse_field_line(nth(lines, index)));
        index = index + 1;
      }
      return null;
    })();
    return fields;
  })(hashMap(), start);
}
function parse_list(value) {
  return ((inner) => {
    return ((parts) => {
      return ((result) => {
        return ((index) => {
          return (() => {
            (() => {
              while (__eliscript_truthy7(index < count(parts))) {
                ((item) => {
                  return __eliscript_truthy7(!__eliscript_truthy7(blank_QMARK_(item))) ? result = conj(result, item) : null;
                })(trim(nth(parts, index)));
                index = index + 1;
              }
              return null;
            })();
            return result;
          })();
        })(0);
      })(vector());
    })(split_on(",", inner));
  })(__eliscript_truthy7(((__eliscript_value_1) => __eliscript_truthy7(__eliscript_value_1) ? ends_with_QMARK_("]", value) : __eliscript_value_1)(starts_with_QMARK_("[", value))) ? slice(1, text_length(value) - 1, value) : value);
}
function field(fields, key, fallback) {
  return ((value) => {
    return __eliscript_truthy7(empty_value_QMARK_(value)) ? fallback : value;
  })(get(fields, key, null));
}
function require_field(fields, key, path) {
  return ((value) => {
    return __eliscript_truthy7(empty_value_QMARK_(value)) ? fail2("DOGFOOD-CONTENT-001", String(path) + String(': missing required metadata field "') + String(key) + String('"')) : value;
  })(get(fields, key, null));
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
  return ((trimmed) => {
    return ((__eliscript_value_1) => __eliscript_truthy8(__eliscript_value_1) ? __eliscript_value_1 : ((__eliscript_value_2) => __eliscript_truthy8(__eliscript_value_2) ? __eliscript_value_2 : ((__eliscript_value_3) => __eliscript_truthy8(__eliscript_value_3) ? __eliscript_value_3 : ((__eliscript_value_4) => __eliscript_truthy8(__eliscript_value_4) ? __eliscript_value_4 : ((__eliscript_value_5) => __eliscript_truthy8(__eliscript_value_5) ? __eliscript_value_5 : ((__eliscript_value_6) => __eliscript_truthy8(__eliscript_value_6) ? __eliscript_value_6 : trimmed === "---")(ordered_item_QMARK_(trimmed)))(starts_with_QMARK_("- ", trimmed)))(starts_with_QMARK_("> ", trimmed)))(starts_with_QMARK_("```", trimmed)))(starts_with_QMARK_("#", trimmed)))(blank_QMARK_(trimmed));
  })(trim(line));
}
function heading_level(text) {
  return ((index) => {
    (() => {
      while (__eliscript_truthy8(((__eliscript_value_7) => __eliscript_truthy8(__eliscript_value_7) ? char_code(text, index) === hash_mark : __eliscript_value_7)(index < text_length(text)))) {
        index = index + 1;
      }
      return null;
    })();
    return __eliscript_truthy8(((__eliscript_value_8) => __eliscript_truthy8(__eliscript_value_8) ? ((__eliscript_value_9) => __eliscript_truthy8(__eliscript_value_9) ? ((__eliscript_value_10) => __eliscript_truthy8(__eliscript_value_10) ? char_code(text, index) === space : __eliscript_value_10)(index < text_length(text)) : __eliscript_value_9)(index <= 6) : __eliscript_value_8)(index > 0)) ? index : 0;
  })(0);
}
function ordered_prefix_length(text) {
  return ((index) => {
    (() => {
      while (__eliscript_truthy8(((__eliscript_value_11) => __eliscript_truthy8(__eliscript_value_11) ? digit_code_QMARK_(char_code(text, index)) : __eliscript_value_11)(index < text_length(text)))) {
        index = index + 1;
      }
      return null;
    })();
    return __eliscript_truthy8(((__eliscript_value_12) => __eliscript_truthy8(__eliscript_value_12) ? ((__eliscript_value_13) => __eliscript_truthy8(__eliscript_value_13) ? slice(index, index + 2, text) === ". " : __eliscript_value_13)(index + 1 < text_length(text)) : __eliscript_value_12)(index > 0)) ? index + 2 : -1;
  })(0);
}
function ordered_item_QMARK_(text) {
  return ordered_prefix_length(text) > 0;
}
function unordered_item_QMARK_(text) {
  return starts_with_QMARK_("- ", text);
}
function fence_close(lines, start, total) {
  return ((index, close) => {
    (() => {
      while (__eliscript_truthy8(index < total)) {
        __eliscript_truthy8(starts_with_QMARK_("```", trim(nth(lines, index)))) && (close = index, index = total);
        index = index + 1;
      }
      return null;
    })();
    return close;
  })(start + 1, total);
}
function item_of_kind_QMARK_(text, ordered) {
  return __eliscript_truthy8(ordered) ? ordered_item_QMARK_(text) : unordered_item_QMARK_(text);
}
function list_end(lines, start, total, ordered) {
  return ((index) => {
    (() => {
      while (__eliscript_truthy8(((__eliscript_value_14) => __eliscript_truthy8(__eliscript_value_14) ? ((trimmed) => {
        return ((__eliscript_value_15) => __eliscript_truthy8(__eliscript_value_15) ? __eliscript_value_15 : !__eliscript_truthy8(block_start_QMARK_(trimmed)))(item_of_kind_QMARK_(trimmed, ordered));
      })(trim(nth(lines, index))) : __eliscript_value_14)(index < total))) {
        index = index + 1;
      }
      return null;
    })();
    return index;
  })(start);
}
function quote_end(lines, start, total) {
  return ((index) => {
    (() => {
      while (__eliscript_truthy8(((__eliscript_value_16) => __eliscript_truthy8(__eliscript_value_16) ? starts_with_QMARK_("> ", trim(nth(lines, index))) : __eliscript_value_16)(index < total))) {
        index = index + 1;
      }
      return null;
    })();
    return index;
  })(start);
}
function paragraph_end(lines, start, total) {
  return ((index) => {
    (() => {
      while (__eliscript_truthy8(((__eliscript_value_17) => __eliscript_truthy8(__eliscript_value_17) ? !__eliscript_truthy8(block_start_QMARK_(nth(lines, index))) : __eliscript_value_17)(index < total))) {
        index = index + 1;
      }
      return null;
    })();
    return index;
  })(start);
}
function paragraph_text(lines, start, end) {
  return ((parts, index) => {
    (() => {
      while (__eliscript_truthy8(index < end)) {
        parts = conj(parts, trim(nth(lines, index))), index = index + 1;
      }
      return null;
    })();
    return join(" ", parts);
  })(vector(), start);
}
function render_fence(lines, start, close) {
  return ((opening) => {
    return ((language) => {
      return ((content) => {
        return ((index) => {
          return (() => {
            (() => {
              while (__eliscript_truthy8(index < close)) {
                content = String(content) + String(nth(lines, index)) + String(`
`), index = index + 1;
              }
              return null;
            })();
            return String("<pre><code") + String(__eliscript_truthy8(blank_QMARK_(language)) ? "" : String(' class="language-') + String(escape_html(language)) + String('"')) + String(">") + String(escape_html(content)) + String("</code></pre>");
          })();
        })(start + 1);
      })("");
    })(trim(strip_prefix("```", opening)));
  })(trim(nth(lines, start)));
}
function list_marker_width(text) {
  return __eliscript_truthy8(unordered_item_QMARK_(text)) ? 2 : __eliscript_truthy8(ordered_item_QMARK_(text)) ? ordered_prefix_length(text) : 0;
}
function render_list(lines, start, end) {
  return ((items, current, index) => {
    (() => {
      while (__eliscript_truthy8(index < end)) {
        ((trimmed) => {
          return ((width) => {
            return __eliscript_truthy8(width > 0) ? (() => {
              __eliscript_truthy8(current) && (items = String(items) + String("<li>") + String(render_inline(current)) + String("</li>"));
              return current = trim(slice(width, text_length(trimmed), trimmed));
            })() : current = String(current) + String(" ") + String(trimmed);
          })(list_marker_width(trimmed));
        })(trim(nth(lines, index)));
        index = index + 1;
      }
      return null;
    })();
    __eliscript_truthy8(current) && (items = String(items) + String("<li>") + String(render_inline(current)) + String("</li>"));
    return String(__eliscript_truthy8(unordered_item_QMARK_(trim(nth(lines, start)))) ? "<ul>" : "<ol>") + String(items) + String(__eliscript_truthy8(unordered_item_QMARK_(trim(nth(lines, start)))) ? "</ul>" : "</ol>");
  })("", null, start);
}
function render_quote(lines, start, end) {
  return ((parts, index) => {
    (() => {
      while (__eliscript_truthy8(index < end)) {
        parts = conj(parts, strip_prefix("> ", trim(nth(lines, index)))), index = index + 1;
      }
      return null;
    })();
    return String("<blockquote><p>") + String(render_inline(join(" ", parts))) + String("</p></blockquote>");
  })(vector(), start);
}
function render_heading(trimmed) {
  return ((level) => {
    return ((content) => {
      return String("<h") + String(level) + String(">") + String(render_inline(content)) + String("</h") + String(level) + String(">");
    })(trim(slice(level, text_length(trimmed), trimmed)));
  })(heading_level(trimmed));
}
function render_markdown(text) {
  return ((lines) => {
    return ((total) => {
      return ((blocks) => {
        return (() => {
          ((index) => {
            return (() => {
              while (__eliscript_truthy8(index < total)) {
                ((trimmed) => {
                  return ((level) => {
                    return __eliscript_truthy8(blank_QMARK_(trimmed)) ? index = index + 1 : __eliscript_truthy8(starts_with_QMARK_("```", trimmed)) ? ((close) => {
                      return ((next) => {
                        return blocks = conj(blocks, render_fence(lines, index, close)), index = next;
                      })(__eliscript_truthy8(close < total) ? close + 1 : total);
                    })(fence_close(lines, index, total)) : __eliscript_truthy8(level > 0) ? (blocks = conj(blocks, render_heading(trimmed)), index = index + 1) : __eliscript_truthy8(trimmed === "---") ? (blocks = conj(blocks, "<hr>"), index = index + 1) : __eliscript_truthy8(starts_with_QMARK_("> ", trimmed)) ? ((end) => {
                      return blocks = conj(blocks, render_quote(lines, index, end)), index = end;
                    })(quote_end(lines, index, total)) : __eliscript_truthy8(unordered_item_QMARK_(trimmed)) ? ((end) => {
                      return blocks = conj(blocks, render_list(lines, index, end)), index = end;
                    })(list_end(lines, index, total, false)) : __eliscript_truthy8(ordered_item_QMARK_(trimmed)) ? ((end) => {
                      return blocks = conj(blocks, render_list(lines, index, end)), index = end;
                    })(list_end(lines, index, total, true)) : ((end) => {
                      return blocks = conj(blocks, String("<p>") + String(render_inline(paragraph_text(lines, index, end))) + String("</p>")), index = end;
                    })(paragraph_end(lines, index, total));
                  })(heading_level(trimmed));
                })(trim(nth(lines, index)));
              }
              return null;
            })();
          })(0);
          return join(`
`, blocks);
        })();
      })(vector());
    })(count(lines));
  })(split_lines(text));
}
function render_inline(text) {
  return ((result, plain, index, size) => {
    (() => {
      while (__eliscript_truthy8(index < size)) {
        ((character) => {
          return __eliscript_truthy8(character === "`") ? ((close) => {
            return __eliscript_truthy8(close < 0) ? (plain = String(plain) + String(character), index = index + 1) : (result = String(result) + String(escape_html(plain)) + String("<code>") + String(escape_html(slice(index + 1, close, text))) + String("</code>"), plain = "", index = close + 1);
          })(index_of_from("`", text, index + 1)) : __eliscript_truthy8(((__eliscript_value_18) => __eliscript_truthy8(__eliscript_value_18) ? ((__eliscript_value_19) => __eliscript_truthy8(__eliscript_value_19) ? slice(index + 1, index + 2, text) === "*" : __eliscript_value_19)(index + 1 < size) : __eliscript_value_18)(character === "*")) ? ((close) => {
            return __eliscript_truthy8(close < 0) ? (plain = String(plain) + String(character), index = index + 1) : (result = String(result) + String(escape_html(plain)) + String("<strong>") + String(render_inline(slice(index + 2, close, text))) + String("</strong>"), plain = "", index = close + 2);
          })(index_of_from("**", text, index + 2)) : __eliscript_truthy8(character === "*") ? ((close) => {
            return __eliscript_truthy8(close < 0) ? (plain = String(plain) + String(character), index = index + 1) : (result = String(result) + String(escape_html(plain)) + String("<em>") + String(render_inline(slice(index + 1, close, text))) + String("</em>"), plain = "", index = close + 1);
          })(index_of_from("*", text, index + 1)) : __eliscript_truthy8(character === "[") ? ((label_end) => {
            return ((url_end) => {
              return __eliscript_truthy8(((__eliscript_value_20) => __eliscript_truthy8(__eliscript_value_20) ? __eliscript_value_20 : url_end < 0)(label_end < 0)) ? (plain = String(plain) + String(character), index = index + 1) : ((label, target) => {
                return result = String(result) + String(escape_html(plain)) + String(__eliscript_truthy8(safe_url_QMARK_(target)) ? String('<a href="') + String(escape_html(target)) + String('">') + String(render_inline(label)) + String("</a>") : render_inline(label)), plain = "", index = url_end + 1;
              })(slice(index + 1, label_end, text), slice(label_end + 2, url_end, text));
            })(__eliscript_truthy8(label_end < 0) ? -1 : index_of_from(")", text, label_end + 2));
          })(index_of_from("](", text, index + 1)) : (plain = String(plain) + String(character), index = index + 1);
        })(slice(index, index + 1, text));
      }
      return null;
    })();
    return String(result) + String(escape_html(plain));
  })("", "", 0, text_length(text));
}

// examples/dogfood/dist/src/builder/content.mjs
var __eliscript_truthy9 = (value) => value !== false && value != null;
var Post = define_record_type("Post", ["id", "slug", "title", "summary", "body", "published-at", "updated-at", "authors", "tags", "cover", "draft", "pinned-weight", "provenance", "aliases", "comment-channels"]);
var __GT_Post = (id, slug, title, summary, body, published_at, updated_at, authors, tags, cover, draft, pinned_weight, provenance, aliases, comment_channels) => {
  return Post["create"](id, slug, title, summary, body, published_at, updated_at, authors, tags, cover, draft, pinned_weight, provenance, aliases, comment_channels);
};
function markdown_names(directory) {
  return ((names, result, index) => {
    (() => {
      while (__eliscript_truthy9(index < count(names))) {
        ((name) => {
          return __eliscript_truthy9(ends_with_QMARK_(".md", name)) ? result = conj(result, name) : null;
        })(nth(names, index));
        index = index + 1;
      }
      return null;
    })();
    return sort(result);
  })(import_node_fs.readdirSync(directory), vector(), 0);
}
function front_matter_close(lines) {
  return ((index, close, total) => {
    (() => {
      while (__eliscript_truthy9(((__eliscript_value_1) => __eliscript_truthy9(__eliscript_value_1) ? close < 0 : __eliscript_value_1)(index < total))) {
        __eliscript_truthy9(trim(nth(lines, index)) === "---") && (close = index);
        index = index + 1;
      }
      return null;
    })();
    return close;
  })(1, -1, count(lines));
}
function date_value(text) {
  return slice(0, 10, trim(text));
}
function body_text(lines, start) {
  return ((parts, index, total) => {
    (() => {
      while (__eliscript_truthy9(index < total)) {
        parts = conj(parts, nth(lines, index)), index = index + 1;
      }
      return null;
    })();
    return join(`
`, parts);
  })(vector(), start, count(lines));
}
function build_post(path, relative, lines, close, fields) {
  return ((identifier) => {
    return ((title) => {
      return ((published) => {
        return ((updated_field) => {
          return ((slug_field) => {
            return ((slug) => {
              return ((authors) => {
                return ((tags) => {
                  return ((aliases) => {
                    return ((draft) => {
                      return ((body) => {
                        return __GT_Post(identifier, slug, title, field(fields, "description", ""), body, published, __eliscript_truthy9(updated_field === null) ? published : date_value(updated_field), __eliscript_truthy9(count(authors) > 0) ? authors : vector("dogfood"), tags, field(fields, "cover", null), draft, parse_integer(field(fields, "pinned", "0"), 0), hashMap(keyword("provider"), "markdown", keyword("path"), relative), aliases, vector());
                      })(render_markdown(body_text(lines, close + 1)));
                    })(field(fields, "draft", "false") === "true");
                  })(parse_list(field(fields, "aliases", "")));
                })(parse_list(field(fields, "tags", "")));
              })(parse_list(field(fields, "authors", "")));
            })(__eliscript_truthy9(slug_field === null) ? slugify(without_suffix(".md", basename(path))) : slug_field);
          })(field(fields, "slug", null));
        })(field(fields, "updated", null));
      })(date_value(require_field(fields, "date", path)));
    })(require_field(fields, "title", path));
  })(require_field(fields, "id", path));
}
function read_posts(root, directory) {
  return ((absolute) => {
    return ((names) => {
      return ((posts) => {
        return ((index) => {
          return (() => {
            (() => {
              while (__eliscript_truthy9(index < count(names))) {
                ((name) => {
                  return ((path) => {
                    return ((relative) => {
                      return ((lines) => {
                        return (() => {
                          __eliscript_truthy9(count(lines) < 3) && fail2("DOGFOOD-CONTENT-002", String(relative) + String(": file is too short to contain front matter"));
                          __eliscript_truthy9(!__eliscript_truthy9(trim(nth(lines, 0)) === "---")) && fail2("DOGFOOD-CONTENT-002", String(relative) + String(": file must open with a --- front matter block"));
                          return ((close) => {
                            __eliscript_truthy9(close < 0) && fail2("DOGFOOD-CONTENT-002", String(relative) + String(": front matter block is not terminated"));
                            return posts = conj(posts, build_post(path, relative, lines, close, parse_fields(lines, 1, close)));
                          })(front_matter_close(lines));
                        })();
                      })(split_lines(import_node_fs.readFileSync(path, "utf8")));
                    })(String(directory) + String("/") + String(name));
                  })(Path.join(absolute, name));
                })(nth(names, index));
                index = index + 1;
              }
              return null;
            })();
            return posts;
          })();
        })(0);
      })(vector());
    })(markdown_names(absolute));
  })(Path.join(root, directory));
}
function duplicate_in_QMARK_(posts, field2, label) {
  return ((index) => {
    return (() => {
      while (__eliscript_truthy9(index < count(posts))) {
        ((earlier, value) => {
          return (() => {
            while (__eliscript_truthy9(earlier < index)) {
              __eliscript_truthy9(get(nth(posts, earlier), field2) === value) && fail2("DOGFOOD-IDENTITY-001", String("duplicate ") + String(label) + String(' "') + String(value) + String('" in ') + String(get(nth(posts, index)["provenance"], keyword("path"), "")));
              earlier = earlier + 1;
            }
            return null;
          })();
        })(0, get(nth(posts, index), field2));
        index = index + 1;
      }
      return null;
    })();
  })(0);
}
function check_aliases(posts) {
  return ((canonical, seen, index) => {
    (() => {
      while (__eliscript_truthy9(index < count(posts))) {
        canonical = assoc(assoc(canonical, nth(posts, index)["slug"], true), nth(posts, index)["id"], true);
        index = index + 1;
      }
      return null;
    })();
    index = 0;
    return (() => {
      while (__eliscript_truthy9(index < count(posts))) {
        ((aliases, alias_index) => {
          return (() => {
            while (__eliscript_truthy9(alias_index < count(aliases))) {
              ((alias) => {
                __eliscript_truthy9(get(canonical, alias, false)) && fail2("DOGFOOD-IDENTITY-002", String('alias "') + String(alias) + String('" collides with a canonical slug or id'));
                __eliscript_truthy9(get(seen, alias, false)) && fail2("DOGFOOD-IDENTITY-003", String('duplicate alias "') + String(alias) + String('"'));
                return seen = assoc(seen, alias, true);
              })(nth(aliases, alias_index));
              alias_index = alias_index + 1;
            }
            return null;
          })();
        })(nth(posts, index)["aliases"], 0);
        index = index + 1;
      }
      return null;
    })();
  })(hashMap(), hashMap(), 0);
}
function check_identity(posts) {
  duplicate_in_QMARK_(posts, keyword("id"), "canonical id");
  duplicate_in_QMARK_(posts, keyword("slug"), "slug");
  return check_aliases(posts);
}

// examples/dogfood/dist/src/support/github.mjs
var __eliscript_truthy10 = (value) => value !== false && value != null;
var maximum_pages = 100;
function append_all2(target, values) {
  return reduce(values, (accumulator, value) => {
    return conj(accumulator, value);
  }, target);
}
function link_target(link) {
  return ((start) => {
    return __eliscript_truthy10(start < 0) ? null : ((end) => {
      return __eliscript_truthy10(end < 0) ? null : slice(start + 1, end, link);
    })(index_of(">", link));
  })(index_of("<", link));
}
function next_link(headers) {
  return ((link) => {
    return ((parts) => {
      return ((index) => {
        return ((found) => {
          return (() => {
            (() => {
              while (__eliscript_truthy10(index < count(parts))) {
                ((part) => {
                  return __eliscript_truthy10(((__eliscript_value_1) => __eliscript_truthy10(__eliscript_value_1) ? index_of('rel="next"', part) >= 0 : __eliscript_value_1)(found === null)) ? found = link_target(part) : null;
                })(nth(parts, index));
                index = index + 1;
              }
              return null;
            })();
            return found;
          })();
        })(null);
      })(0);
    })(__eliscript_truthy10(link === null) ? vector() : split_on(",", link));
  })(headers["link"] ?? null);
}
async function fetch_paginated(transport, url, label) {
  return await (async (records, pages, next) => {
    await (async () => {
      while (__eliscript_truthy10(((__eliscript_value_2) => __eliscript_truthy10(__eliscript_value_2) ? pages < maximum_pages : __eliscript_value_2)(!__eliscript_truthy10(next === null)))) {
        ((response) => {
          __eliscript_truthy10(!__eliscript_truthy10((response["status"] ?? 0) === 200)) && fail2("DOGFOOD-GITHUB-001", String(label) + String(" failed with status ") + String(response["status"] ?? "unknown"));
          records = append_all2(records, response["body"] ?? vector());
          next = next_link(response["headers"] ?? {});
          return pages = pages + 1;
        })(await transport(next));
      }
      return null;
    })();
    __eliscript_truthy10(!__eliscript_truthy10(next === null)) && fail2("DOGFOOD-GITHUB-002", String(label) + String(" exceeded ") + String(maximum_pages) + String(" pages"));
    return records;
  })(vector(), 0, url);
}
function list_url(repository, resource, page_size, label) {
  return String("https://api.github.com/repos/") + String(repository) + String("/") + String(resource) + String("?state=all&per_page=") + String(page_size) + String(__eliscript_truthy10(label === null) ? "" : String("&labels=") + String(label));
}

// examples/dogfood/dist/src/builder/comments.mjs
var __eliscript_truthy11 = (value) => value !== false && value != null;
var default_page_size = 100;
function comment_list_url(repository, number, page_size) {
  return String("https://api.github.com/repos/") + String(repository) + String("/issues/") + String(number) + String("/comments?per_page=") + String(page_size);
}
function normalize_comment(record) {
  return ((user) => {
    return hashMap(keyword("id"), record["id"], keyword("author"), hashMap(keyword("login"), user["login"] ?? "unknown", keyword("url"), user["html_url"] ?? null), keyword("body"), render_markdown(record["body"] ?? ""), keyword("created-at"), record["created_at"] ?? "", keyword("updated-at"), record["updated_at"] ?? "", keyword("url"), record["html_url"] ?? null, keyword("replies"), vector());
  })(record["user"] ?? {});
}
function normalize_comments(records) {
  return append_all2(vector(), map_comments(records));
}
function map_comments(records) {
  return ((result, index) => {
    (() => {
      while (__eliscript_truthy11(index < count(records))) {
        result = conj(result, normalize_comment(nth(records, index)));
        index = index + 1;
      }
      return null;
    })();
    return result;
  })(vector(), 0);
}
function freshness(items) {
  return ((latest, index) => {
    (() => {
      while (__eliscript_truthy11(index < count(items))) {
        ((updated) => {
          return __eliscript_truthy11(updated > latest) ? latest = String(updated) : null;
        })(get(nth(items, index), keyword("updated-at"), ""));
        index = index + 1;
      }
      return null;
    })();
    return latest;
  })("", 0);
}
function channel_declaration(comments, kind) {
  return ((declarations, index, found) => {
    (() => {
      while (__eliscript_truthy11(index < count(declarations))) {
        ((declaration) => {
          return __eliscript_truthy11(((__eliscript_value_1) => __eliscript_truthy11(__eliscript_value_1) ? get(declaration, keyword("kind"), keyword("none")) === kind : __eliscript_value_1)(get(declaration, keyword("enabled"), false))) ? found = declaration : null;
        })(nth(declarations, index));
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(get(comments, keyword("channels"), vector()), 0, null);
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
    return __eliscript_truthy11(declaration === null) ? null : __eliscript_truthy11(get(declaration, keyword("mode"), keyword("snapshot")) === keyword("live")) ? live_channel(declaration, get(options, keyword("repository")), get(options, keyword("number"))) : await snapshot_channel(assoc(options, keyword("declaration"), declaration));
  })(channel_declaration(get(options, keyword("comments")), get(options, keyword("kind"), keyword("issue"))));
}

// examples/dogfood/dist/src/builder/issues.mjs
var __eliscript_truthy12 = (value) => value !== false && value != null;
var default_page_size2 = 100;
function normalize_login(login) {
  return to_lowercase(trim(String(login)));
}
function denied_identity_QMARK_(author) {
  return ((__eliscript_value_1) => __eliscript_truthy12(__eliscript_value_1) ? __eliscript_value_1 : normalize_login(author["login"] ?? "") === "ghost")(!__eliscript_truthy12((author["type"] ?? "User") === "User"));
}
function publisher_matches_QMARK_(publisher, author) {
  return ((pinned) => {
    return ((__eliscript_value_2) => __eliscript_truthy12(__eliscript_value_2) ? ((__eliscript_value_3) => __eliscript_truthy12(__eliscript_value_3) ? __eliscript_value_3 : pinned === (author["id"] ?? null))(pinned === null) : __eliscript_value_2)(normalize_login(get(publisher, keyword("login"), "")) === normalize_login(author["login"] ?? ""));
  })(get(publisher, keyword("id"), null));
}
function publisher_set(publishing) {
  return ((owner, coauthors, result) => {
    __eliscript_truthy12(!__eliscript_truthy12(owner === null)) && (result = conj(result, owner));
    ((index) => {
      return (() => {
        while (__eliscript_truthy12(index < count(coauthors))) {
          result = conj(result, nth(coauthors, index));
          index = index + 1;
        }
        return null;
      })();
    })(0);
    return result;
  })(get(publishing, keyword("owner"), null), get(publishing, keyword("coauthors"), vector()), vector());
}
function authorized_author_QMARK_(publishers, author) {
  return ((__eliscript_value_4) => __eliscript_truthy12(__eliscript_value_4) ? ((index, found) => {
    (() => {
      while (__eliscript_truthy12(index < count(publishers))) {
        __eliscript_truthy12(publisher_matches_QMARK_(nth(publishers, index), author)) && (found = true);
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(0, false) : __eliscript_value_4)(!__eliscript_truthy12(denied_identity_QMARK_(author)));
}
function identity_after(marker, body) {
  return ((lines) => {
    return ((index) => {
      return ((found) => {
        return (() => {
          (() => {
            while (__eliscript_truthy12(((__eliscript_value_5) => __eliscript_truthy12(__eliscript_value_5) ? found === null : __eliscript_value_5)(index < count(lines)))) {
              ((line) => {
                return __eliscript_truthy12(starts_with_QMARK_(marker, line)) ? found = trim(slice(text_length(marker), text_length(line), line)) : null;
              })(trim(nth(lines, index)));
              index = index + 1;
            }
            return null;
          })();
          return found;
        })();
      })(null);
    })(0);
  })(split_lines(body));
}
function known_identity_QMARK_(identities, value) {
  return ((index, found) => {
    (() => {
      while (__eliscript_truthy12(((__eliscript_value_6) => __eliscript_truthy12(__eliscript_value_6) ? !__eliscript_truthy12(found) : __eliscript_value_6)(index < count(identities)))) {
        __eliscript_truthy12(nth(identities, index) === value) && (found = true);
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(0, false);
}
function carrier_adapter(adapters, author, body, identities) {
  return ((index, found) => {
    (() => {
      while (__eliscript_truthy12(((__eliscript_value_7) => __eliscript_truthy12(__eliscript_value_7) ? found === null : __eliscript_value_7)(index < count(adapters)))) {
        ((adapter) => {
          return ((principal) => {
            return ((marker) => {
              return __eliscript_truthy12(((__eliscript_value_8) => __eliscript_truthy12(__eliscript_value_8) ? ((__eliscript_value_9) => __eliscript_truthy12(__eliscript_value_9) ? ((__eliscript_value_10) => __eliscript_truthy12(__eliscript_value_10) ? normalize_login(principal) === normalize_login(author["login"] ?? "") : __eliscript_value_10)(!__eliscript_truthy12(marker === null)) : __eliscript_value_9)(!__eliscript_truthy12(principal === null)) : __eliscript_value_8)(get(adapter, keyword("carrier-kind"), keyword("none")) === keyword("issue"))) ? ((identity2) => {
                return __eliscript_truthy12(((__eliscript_value_11) => __eliscript_truthy12(__eliscript_value_11) ? known_identity_QMARK_(identities, identity2) : __eliscript_value_11)(!__eliscript_truthy12(identity2 === null))) ? found = get(adapter, keyword("id"), null) : null;
              })(identity_after(marker, body)) : null;
            })(get(adapter, keyword("marker"), null));
          })(get(adapter, keyword("principal"), null));
        })(nth(adapters, index));
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(0, null);
}
function metadata_block(lines) {
  return ((index, start, end, total) => {
    (() => {
      while (__eliscript_truthy12(((__eliscript_value_12) => __eliscript_truthy12(__eliscript_value_12) ? end < 0 : __eliscript_value_12)(index < total))) {
        ((trimmed) => {
          return __eliscript_truthy12(((__eliscript_value_13) => __eliscript_truthy12(__eliscript_value_13) ? trimmed === "```dogfood" : __eliscript_value_13)(start < 0)) ? start = index : __eliscript_truthy12(((__eliscript_value_14) => __eliscript_truthy12(__eliscript_value_14) ? trimmed === "```" : __eliscript_value_14)(start >= 0)) ? end = index : null;
        })(trim(nth(lines, index)));
        index = index + 1;
      }
      return null;
    })();
    return __eliscript_truthy12(((__eliscript_value_15) => __eliscript_truthy12(__eliscript_value_15) ? __eliscript_value_15 : end < 0)(start < 0)) ? null : vector(start, end);
  })(0, -1, -1, count(lines));
}
function issue_fields(body, path) {
  return ((lines) => {
    return ((block) => {
      return __eliscript_truthy12(block === null) ? fail2("DOGFOOD-ISSUES-001", String(path) + String(": issue body has no ```dogfood metadata block")) : parse_fields(lines, nth(block, 0, null) + 1, nth(block, 1, null));
    })(metadata_block(lines));
  })(split_lines(body));
}
function issue_markdown(body) {
  return ((lines) => {
    return ((block) => {
      return ((start) => {
        return ((parts) => {
          return ((index) => {
            return ((total) => {
              return (() => {
                (() => {
                  while (__eliscript_truthy12(index < total)) {
                    parts = conj(parts, nth(lines, index));
                    index = index + 1;
                  }
                  return null;
                })();
                return join(`
`, parts);
              })();
            })(count(lines));
          })(start);
        })(vector());
      })(__eliscript_truthy12(block === null) ? 0 : nth(block, 1, null) + 1);
    })(metadata_block(lines));
  })(split_lines(body));
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
  return ((explicit) => {
    return __eliscript_truthy12(explicit === null) ? String("https://github.com/") + String(get(source, keyword("repository"), "")) + String("/issues/") + String(record["number"]) : explicit;
  })(record["html_url"] ?? null);
}
function normalize_issue(source, record, identity_urls, channel) {
  return ((number) => {
    return ((repository) => {
      return ((path) => {
        return ((body) => {
          return ((fields) => {
            return ((title) => {
              return ((slug_field) => {
                return ((published) => {
                  return ((updated_raw) => {
                    return __GT_Post(require_field(fields, "id", path), __eliscript_truthy12(slug_field === null) ? slugify(title) : slug_field, title, field(fields, "description", ""), render_markdown(issue_markdown(body)), published, __eliscript_truthy12(updated_raw === null) ? published : date_value(updated_raw), vector(record["user"]["login"] ?? "unknown"), parse_list(field(fields, "tags", "")), null, field(fields, "draft", "false") === "true", parse_integer(field(fields, "pinned", "0"), 0), hashMap(keyword("provider"), "issues", keyword("path"), path, keyword("url"), issue_url(source, record), keyword("revision"), record["updated_at"] ?? ""), parse_list(field(fields, "aliases", "")), __eliscript_truthy12(empty_value_QMARK_(channel)) ? vector() : vector(channel));
                  })(field(fields, "updated", null));
                })(date_value(field(fields, "date", record["created_at"] ?? "")));
              })(field(fields, "slug", null));
            })(require_field(fields, "title", path));
          })(issue_fields(body, path));
        })(record["body"] ?? "");
      })(String(repository) + String("#") + String(number));
    })(get(source, keyword("repository"), ""));
  })(record["number"]);
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
                              while (__eliscript_truthy12(index < count(records))) {
                                await (async (record) => {
                                  return await (async (body) => {
                                    return await (async (author) => {
                                      return __eliscript_truthy12(record["pull_request"] ?? null) ? null : __eliscript_truthy12(!__eliscript_truthy12(carrier_adapter(adapters, author, body, identities) === null)) ? carriers = carriers + 1 : __eliscript_truthy12(authorized_author_QMARK_(publishers, author)) ? ((channel) => {
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
var __eliscript_truthy13 = (value) => value !== false && value != null;
var default_page_size3 = 50;
var comment_bound = 100;
var maximum_pages2 = 100;
function repository_parts(repository) {
  return ((slash) => {
    return __eliscript_truthy13(slash < 1) ? fail2("DOGFOOD-DISCUSSIONS-001", String('discussion source repository must be "owner/name": ') + String(repository)) : vector(slice(0, slash, repository), slice(slash + 1, count(repository), repository));
  })(index_of("/", repository));
}
var author_selection = "author { login __typename ... on User { databaseId } }";
function reply_selection(depth) {
  return __eliscript_truthy13(depth === 0) ? "" : String(" replies(first: 50) { nodes { id ") + String(author_selection) + String(" body createdAt updatedAt url") + String(reply_selection(depth - 1)) + String(" } }");
}
function comment_selection() {
  return String(" comments(first: ") + String(comment_bound) + String(") { pageInfo { hasNextPage endCursor }") + String(" nodes { id ") + String(author_selection) + String(" body createdAt updatedAt url") + String(reply_selection(2)) + String(" } }");
}
function discussions_query(with_comments) {
  return String("query DogfoodDiscussions($owner: String!, $name: String!, $cursor: String,") + String(" $pageSize: Int!) { repository(owner: $owner, name: $name) {") + String(" discussions(first: $pageSize, after: $cursor,") + String(" orderBy: {field: UPDATED_AT, direction: DESC}) {") + String(" pageInfo { hasNextPage endCursor }") + String(" nodes { number title body createdAt updatedAt url") + String(" category { name } ") + String(author_selection) + String(" answerChosenAt") + String(__eliscript_truthy13(with_comments) ? comment_selection() : "") + String(" } } } }");
}
async function graphql(transport, query, variables) {
  return ((response) => {
    return ((status) => {
      return ((body) => {
        return (() => {
          __eliscript_truthy13(!__eliscript_truthy13(status === 200)) && fail2("DOGFOOD-DISCUSSIONS-002", String("GitHub discussion query failed with status ") + String(status));
          __eliscript_truthy13(((__eliscript_value_1) => __eliscript_truthy13(__eliscript_value_1) ? !__eliscript_truthy13((body["errors"] ?? null) === null) : __eliscript_value_1)(!__eliscript_truthy13(body === null))) && fail2("DOGFOOD-DISCUSSIONS-003", String("GitHub discussion query returned errors: ") + String(JSON.stringify(body["errors"])));
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
                    while (__eliscript_truthy13(((__eliscript_value_2) => __eliscript_truthy13(__eliscript_value_2) ? pages < maximum_pages2 : __eliscript_value_2)(more))) {
                      ((data) => {
                        return ((connection) => {
                          return (() => {
                            __eliscript_truthy13(connection === null) && fail2("DOGFOOD-DISCUSSIONS-004", "discussion query returned no connection");
                            nodes = append_all2(nodes, connection["nodes"] ?? vector());
                            ((page_info) => {
                              return more = page_info["hasNextPage"] ?? false, cursor = page_info["endCursor"] ?? null;
                            })(connection["pageInfo"] ?? {});
                            return pages = pages + 1;
                          })();
                        })(data["discussions"] ?? null);
                      })(await graphql(transport, query, { owner: nth(parts, 0, null), name: nth(parts, 1, null), pageSize: page_size2, cursor: __eliscript_truthy13(cursor === null) ? null : cursor }));
                    }
                    return null;
                  })();
                  __eliscript_truthy13(((__eliscript_value_3) => __eliscript_truthy13(__eliscript_value_3) ? pages >= maximum_pages2 : __eliscript_value_3)(more)) && fail2("DOGFOOD-DISCUSSIONS-005", String("discussion listing exceeded ") + String(maximum_pages2) + String(" pages"));
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
  return ((user) => {
    return hashMap(keyword("id"), node["id"], keyword("author"), hashMap(keyword("login"), user["login"] ?? "ghost", keyword("url"), node["url"] ?? null), keyword("body"), render_markdown(node["body"] ?? ""), keyword("created-at"), node["createdAt"] ?? "", keyword("updated-at"), node["updatedAt"] ?? "", keyword("url"), node["url"] ?? null, keyword("replies"), vector());
  })(node["author"] ?? null);
}
function reply_tree(nodes) {
  return ((replies, index) => {
    (() => {
      while (__eliscript_truthy13(index < count(nodes))) {
        ((node) => {
          return ((children) => {
            return ((page_info) => {
              return (() => {
                __eliscript_truthy13(((__eliscript_value_4) => __eliscript_truthy13(__eliscript_value_4) ? page_info["hasNextPage"] ?? false : __eliscript_value_4)(!__eliscript_truthy13(page_info === null))) && fail2("DOGFOOD-DISCUSSIONS-006", String("discussion reply tree exceeded ") + String(comment_bound) + String(" replies at ") + String(node["id"] ?? "unknown"));
                return replies = conj(replies, assoc(comment_record(node), keyword("replies"), reply_tree(children)));
              })();
            })((node["replies"] ?? {})["pageInfo"] ?? null);
          })((node["replies"] ?? {})["nodes"] ?? vector());
        })(nth(nodes, index));
        index = index + 1;
      }
      return null;
    })();
    return replies;
  })(vector(), 0);
}
function comment_tree(record) {
  return ((connection) => {
    return ((page_info) => {
      return ((nodes) => {
        return (() => {
          __eliscript_truthy13(page_info["hasNextPage"] ?? false) && fail2("DOGFOOD-DISCUSSIONS-007", String("discussion ") + String(record["number"] ?? "unknown") + String(" has more than ") + String(comment_bound) + String(" comments"));
          return reply_tree(nodes);
        })();
      })(connection["nodes"] ?? vector());
    })(connection["pageInfo"] ?? {});
  })(record["comments"] ?? {});
}
function category_name(record) {
  return (record["category"] ?? {})["name"] ?? "";
}
function allowed_category_QMARK_(source, record) {
  return ((allowed, category) => {
    return ((__eliscript_value_5) => __eliscript_truthy13(__eliscript_value_5) ? __eliscript_value_5 : allowed === category)(allowed === null);
  })(get(source, keyword("category"), null), category_name(record));
}
function discussion_author(record) {
  return ((author) => {
    return ((kind) => {
      return { login: author["login"] ?? "ghost", id: author["databaseId"] ?? null, type: __eliscript_truthy13(kind === "User") ? "User" : kind };
    })(__eliscript_truthy13(author === null) ? "User" : author["__typename"] ?? "User");
  })(record["author"] ?? null);
}
function discussion_channel(declaration, repository, record, items) {
  return hashMap(keyword("id"), get(declaration, keyword("id"), keyword("discussion-native")), keyword("kind"), keyword("discussion"), keyword("mode"), get(declaration, keyword("mode"), keyword("snapshot")), keyword("binding"), hashMap(keyword("repository"), repository, keyword("number"), record["number"]), keyword("count"), count(items), keyword("updated-at"), freshness(items), keyword("items"), items, keyword("capabilities"), vector(keyword("read"), keyword("reply"), keyword("nested-replies"), keyword("reactions"), keyword("moderation")));
}
function normalize_discussion(source, record, items, channel) {
  return ((number) => {
    return ((repository) => {
      return ((path) => {
        return ((fields) => {
          return ((title) => {
            return ((slug_field) => {
              return ((published) => {
                return ((updated_raw) => {
                  return __GT_Post(require_field(fields, "id", path), __eliscript_truthy13(slug_field === null) ? slugify(title) : slug_field, title, field(fields, "description", ""), render_markdown(issue_markdown(record["body"] ?? "")), published, __eliscript_truthy13(updated_raw === null) ? published : date_value(updated_raw), vector((record["author"] ?? {})["login"] ?? "unknown"), parse_list(field(fields, "tags", "")), null, field(fields, "draft", "false") === "true", parse_integer(field(fields, "pinned", "0"), 0), hashMap(keyword("provider"), "discussions", keyword("path"), path, keyword("url"), record["url"] ?? null, keyword("revision"), record["updatedAt"] ?? ""), parse_list(field(fields, "aliases", "")), __eliscript_truthy13(empty_value_QMARK_(channel)) ? vector() : vector(channel));
                })(field(fields, "updated", null));
              })(date_value(field(fields, "date", record["createdAt"] ?? "")));
            })(field(fields, "slug", null));
          })(require_field(fields, "title", path));
        })(issue_fields(record["body"] ?? "", path));
      })(String(repository) + String("#") + String(number));
    })(get(source, keyword("repository"), ""));
  })(record["number"]);
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
                                (() => {
                                  while (__eliscript_truthy13(index < count(records))) {
                                    ((record) => {
                                      return ((body) => {
                                        return ((author) => {
                                          return __eliscript_truthy13(!__eliscript_truthy13(carrier_adapter(adapters, author, body, identities) === null)) ? carriers = carriers + 1 : __eliscript_truthy13(!__eliscript_truthy13(allowed_category_QMARK_(source, record))) ? null : __eliscript_truthy13(authorized_author_QMARK_(publishers, author)) ? ((items) => {
                                            return ((channel) => {
                                              return posts = conj(posts, normalize_discussion(source, record, items, channel));
                                            })(__eliscript_truthy13(declaration === null) ? null : discussion_channel(declaration, get(source, keyword("repository"), ""), record, items));
                                          })(__eliscript_truthy13(with_comments) ? comment_tree(record) : vector()) : unauthorized = unauthorized + 1;
                                        })(discussion_author(record));
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
                    })(await fetch_discussions(transport, source, with_comments));
                  })(publisher_set(publishing));
                })(get(options, keyword("transport")));
              })(((__eliscript_value_6) => __eliscript_truthy13(__eliscript_value_6) ? !__eliscript_truthy13(get(declaration, keyword("mode"), keyword("snapshot")) === keyword("live")) : __eliscript_value_6)(!__eliscript_truthy13(declaration === null)));
            })(channel_declaration(comments, keyword("discussion")));
          })(get(options, keyword("comments"), hashMap()));
        })(get(options, keyword("identities"), vector()));
      })(get(options, keyword("adapters"), vector()));
    })(get(options, keyword("publishing")));
  })(get(options, keyword("source")));
}

// examples/dogfood/dist/src/builder/events.mjs
var __eliscript_truthy14 = (value) => value !== false && value != null;
var article_events = vector("push", "schedule", "workflow_dispatch", "issues", "release");
var comment_events = vector("issue_comment", "discussion_comment", "discussions");
var content_events = vector("issues", "release");
var article_policies = vector(keyword("push"), keyword("event"), keyword("scheduled"), keyword("manual"), keyword("hybrid"));
var comment_policies = vector(keyword("runtime"), keyword("external"), keyword("scheduled"), keyword("manual"), keyword("hybrid"), keyword("event"));
function member_QMARK_(values, needle) {
  return ((index, found) => {
    (() => {
      while (__eliscript_truthy14(((__eliscript_value_1) => __eliscript_truthy14(__eliscript_value_1) ? !__eliscript_truthy14(found) : __eliscript_value_1)(index < count(values)))) {
        __eliscript_truthy14(nth(values, index) === needle) && (found = true);
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(0, false);
}
function classification(subject, event_name, action, payload) {
  return hashMap(keyword("subject"), subject, keyword("event"), event_name, keyword("action"), action, keyword("payload"), payload);
}
function classify_event(event_name, payload) {
  return ((action) => {
    return __eliscript_truthy14(member_QMARK_(article_events, event_name)) ? classification(keyword("articles"), event_name, action, payload) : __eliscript_truthy14(member_QMARK_(comment_events, event_name)) ? classification(keyword("comments"), event_name, action, payload) : classification(keyword("unknown"), event_name, action, payload);
  })(get(payload, "action", ""));
}
function refresh_value(config, area, fallback) {
  return ((refresh) => {
    return get(refresh, area, fallback);
  })(get(config, keyword("refresh"), hashMap()));
}
function article_builds_QMARK_(policy, event_name) {
  return __eliscript_truthy14(event_name === "workflow_dispatch") ? true : __eliscript_truthy14(policy === keyword("push")) ? event_name === "push" : __eliscript_truthy14(policy === keyword("event")) ? member_QMARK_(content_events, event_name) : __eliscript_truthy14(policy === keyword("scheduled")) ? event_name === "schedule" : __eliscript_truthy14(policy === keyword("manual")) ? false : __eliscript_truthy14(policy === keyword("hybrid")) ? ((__eliscript_value_2) => __eliscript_truthy14(__eliscript_value_2) ? __eliscript_value_2 : ((__eliscript_value_3) => __eliscript_truthy14(__eliscript_value_3) ? __eliscript_value_3 : member_QMARK_(content_events, event_name))(event_name === "schedule"))(event_name === "push") : false;
}
function build_decision(config, classification2, forced) {
  return ((subject, event_name) => {
    return __eliscript_truthy14(forced) ? hashMap(keyword("build"), true, keyword("reason"), "forced", keyword("subject"), subject) : __eliscript_truthy14(subject === keyword("articles")) ? ((policy) => {
      return __eliscript_truthy14(article_builds_QMARK_(policy, event_name)) ? hashMap(keyword("build"), true, keyword("reason"), "changed", keyword("subject"), keyword("articles")) : hashMap(keyword("build"), false, keyword("reason"), "deferred", keyword("subject"), keyword("articles"), keyword("refresh"), policy);
    })(refresh_value(config, keyword("articles"), keyword("push"))) : __eliscript_truthy14(subject === keyword("comments")) ? ((policy) => {
      return __eliscript_truthy14(policy === keyword("event")) ? hashMap(keyword("build"), true, keyword("reason"), "changed", keyword("subject"), keyword("comments")) : hashMap(keyword("build"), false, keyword("reason"), "deferred", keyword("subject"), keyword("comments"), keyword("refresh"), policy);
    })(refresh_value(config, keyword("comments"), keyword("runtime"))) : hashMap(keyword("build"), false, keyword("reason"), "deferred", keyword("subject"), keyword("unknown"));
  })(get(classification2, keyword("subject"), keyword("unknown")), get(classification2, keyword("event"), ""));
}
function requested_event() {
  return classification(keyword("articles"), "workflow_dispatch", "requested", hashMap());
}

// examples/dogfood/dist/src/builder/channels.mjs
var __eliscript_truthy15 = (value) => value !== false && value != null;
var browser_only_kinds = vector(keyword("external"), keyword("none"));
function member_keyword_QMARK_(values, needle) {
  return ((index, found) => {
    (() => {
      while (__eliscript_truthy15(((__eliscript_value_1) => __eliscript_truthy15(__eliscript_value_1) ? !__eliscript_truthy15(found) : __eliscript_value_1)(index < count(values)))) {
        __eliscript_truthy15(nth(values, index) === needle) && (found = true);
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(0, false);
}
function find_adapter(adapters, id) {
  return ((index, found) => {
    (() => {
      while (__eliscript_truthy15(index < count(adapters))) {
        ((adapter) => {
          return __eliscript_truthy15(get(adapter, keyword("id"), null) === id) ? found = adapter : null;
        })(nth(adapters, index));
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(0, null);
}
function carrier_kind_of(adapters, kind) {
  return ((adapter) => {
    return __eliscript_truthy15(adapter === null) ? keyword("external") : get(adapter, keyword("carrier-kind"), keyword("external"));
  })(find_adapter(adapters, kind));
}
function enabled_channels(config) {
  return ((comments) => {
    return filter((channel) => {
      return get(channel, keyword("enabled"), false);
    }, get(comments, keyword("channels"), vector()));
  })(get(config, keyword("comments"), hashMap()));
}
function browser_only_channel_QMARK_(adapters, channel) {
  return member_keyword_QMARK_(browser_only_kinds, carrier_kind_of(adapters, get(channel, keyword("kind"), null)));
}
function channel_present_QMARK_(post, id) {
  return ((channels, index, found) => {
    (() => {
      while (__eliscript_truthy15(((__eliscript_value_2) => __eliscript_truthy15(__eliscript_value_2) ? !__eliscript_truthy15(found) : __eliscript_value_2)(index < count(channels)))) {
        __eliscript_truthy15(get(nth(channels, index), keyword("id"), null) === id) && (found = true);
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(get(post, keyword("comment-channels"), vector()), 0, false);
}
function provider_url(adapter) {
  return __eliscript_truthy15(adapter === null) ? null : ((origins) => {
    return __eliscript_truthy15(count(origins) === 0) ? null : nth(origins, 0);
  })(get(adapter, keyword("origins"), vector()));
}
function declared_channel(channel, adapter) {
  return hashMap(keyword("id"), get(channel, keyword("id"), null), keyword("kind"), get(channel, keyword("kind"), null), keyword("mode"), get(channel, keyword("mode"), keyword("embed")), keyword("items"), vector(), keyword("count"), 0, keyword("binding"), null, keyword("provider-url"), provider_url(adapter));
}
function attach_to_post(post, channels, adapters) {
  return ((added) => {
    ((index) => {
      return (() => {
        while (__eliscript_truthy15(index < count(channels))) {
          ((channel) => {
            return __eliscript_truthy15(!__eliscript_truthy15(channel_present_QMARK_(post, get(channel, keyword("id"), null)))) ? added = conj(added, declared_channel(channel, find_adapter(adapters, get(channel, keyword("kind"), null)))) : null;
          })(nth(channels, index));
          index = index + 1;
        }
        return null;
      })();
    })(0);
    return __eliscript_truthy15(count(added) === 0) ? post : post_with_channels(post, append_all3(get(post, keyword("comment-channels"), vector()), added));
  })(vector());
}
function append_all3(left, right) {
  return ((result, index) => {
    (() => {
      while (__eliscript_truthy15(index < count(right))) {
        result = conj(result, nth(right, index));
        index = index + 1;
      }
      return null;
    })();
    return result;
  })(left, 0);
}
function post_with_channels(post, channels) {
  return __GT_Post(post["id"], post["slug"], post["title"], post["summary"], post["body"], post["published-at"], post["updated-at"], post["authors"], post["tags"], post["cover"], post["draft"], post["pinned-weight"], post["provenance"], post["aliases"], channels);
}
function attach_configured_channels(config, posts) {
  return ((adapters) => {
    return ((channels) => {
      return __eliscript_truthy15(count(channels) === 0) ? posts : ((result, index) => {
        (() => {
          while (__eliscript_truthy15(index < count(posts))) {
            result = conj(result, attach_to_post(nth(posts, index), channels, adapters));
            index = index + 1;
          }
          return null;
        })();
        return result;
      })(vector(), 0);
    })(filter((channel) => {
      return browser_only_channel_QMARK_(adapters, channel);
    }, enabled_channels(config)));
  })(get(config, keyword("adapters"), vector()));
}
function snapshot_count(posts) {
  return ((total, index) => {
    (() => {
      while (__eliscript_truthy15(index < count(posts))) {
        ((channels) => {
          return ((channel_index) => {
            return (() => {
              while (__eliscript_truthy15(channel_index < count(channels))) {
                ((mode) => {
                  return __eliscript_truthy15(((__eliscript_value_3) => __eliscript_truthy15(__eliscript_value_3) ? __eliscript_value_3 : mode === keyword("hybrid"))(mode === keyword("snapshot"))) ? total = total + 1 : null;
                })(get(nth(channels, channel_index), keyword("mode"), keyword("snapshot")));
                channel_index = channel_index + 1;
              }
              return null;
            })();
          })(0);
        })(get(nth(posts, index), keyword("comment-channels"), vector()));
        index = index + 1;
      }
      return null;
    })();
    return total;
  })(0, 0);
}

// examples/dogfood/dist/src/builder/identity.mjs
var __eliscript_truthy16 = (value) => value !== false && value != null;
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
  return ((source) => {
    return ((provider) => {
      return ((provenance) => {
        return ((repository) => {
          return ((number) => {
            return ((path) => {
              return ((__eliscript_value_1) => __eliscript_truthy16(__eliscript_value_1) ? ((__eliscript_value_2) => __eliscript_truthy16(__eliscript_value_2) ? get(provenance, keyword("path"), "") === path : __eliscript_value_2)(get(provenance, keyword("provider"), "") === provider) : __eliscript_value_1)(!__eliscript_truthy16(provider === ""));
            })(__eliscript_truthy16(number === null) ? repository : String(repository) + String("#") + String(number));
          })(get(projection, keyword("number"), null));
        })(get(projection, keyword("repository"), ""));
      })(post["provenance"]);
    })(get(provider_of, source, ""));
  })(get(projection, keyword("source"), null));
}
function group_by_id(posts) {
  return ((groups, index) => {
    (() => {
      while (__eliscript_truthy16(index < count(posts))) {
        ((post) => {
          return ((id) => {
            return ((existing) => {
              return groups = assoc(groups, id, __eliscript_truthy16(existing === null) ? vector(post) : conj(existing, post));
            })(get(groups, id, null));
          })(post["id"]);
        })(nth(posts, index));
        index = index + 1;
      }
      return null;
    })();
    return groups;
  })(hashMap(), 0);
}
function provenance_text(post) {
  return ((provenance) => {
    return String(get(provenance, keyword("provider"), "unknown")) + String(" ") + String(get(provenance, keyword("path"), "unknown"));
  })(post["provenance"]);
}
function values_equal_QMARK_(left, right) {
  return equalValues(left, right);
}
function declared_fields(declaration, projection) {
  return dedupe(append_all2(get(declaration, keyword("fields"), vector()), get(projection, keyword("fields"), vector())));
}
function declared_QMARK_(fields, key) {
  return ((index, found) => {
    (() => {
      while (__eliscript_truthy16(index < count(fields))) {
        __eliscript_truthy16(nth(fields, index) === key) && (found = true);
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(0, false);
}
function check_agreement(authority, projected, projection, fields) {
  return ((index) => {
    return (() => {
      while (__eliscript_truthy16(index < count(comparable_fields))) {
        ((key) => {
          return __eliscript_truthy16(((__eliscript_value_3) => __eliscript_truthy16(__eliscript_value_3) ? !__eliscript_truthy16(declared_QMARK_(fields, key)) : __eliscript_value_3)(!__eliscript_truthy16(values_equal_QMARK_(get(authority, key, null), get(projected, key, null))))) ? fail2("DOGFOOD-IDENTITY-004", String("projection ") + String(provenance_text(projected)) + String(" disagrees with authority ") + String(provenance_text(authority)) + String(" on ") + String(String(key))) : null;
        })(nth(comparable_fields, index));
        index = index + 1;
      }
      return null;
    })();
  })(0);
}
function check_authority_only(authority, projected, projection, fields) {
  return ((index) => {
    return (() => {
      while (__eliscript_truthy16(index < count(authority_only))) {
        ((key) => {
          return ((alias_QMARK_) => {
            return __eliscript_truthy16(((__eliscript_value_5) => __eliscript_truthy16(__eliscript_value_5) ? ((__eliscript_value_6) => __eliscript_truthy16(__eliscript_value_6) ? !__eliscript_truthy16(alias_QMARK_) : __eliscript_value_6)(!__eliscript_truthy16(declared_QMARK_(fields, key))) : __eliscript_value_5)(!__eliscript_truthy16(values_equal_QMARK_(get(authority, key, null), get(projected, key, null))))) ? fail2("DOGFOOD-IDENTITY-005", String("projection ") + String(provenance_text(projected)) + String(" differs from authority ") + String(provenance_text(authority)) + String(" on ") + String(String(key)) + String(" without an alias or a declared field")) : null;
          })(((__eliscript_value_4) => __eliscript_truthy16(__eliscript_value_4) ? contains_value_QMARK_(projected["aliases"], projected["slug"]) : __eliscript_value_4)(String(key) === ":slug"));
        })(nth(authority_only, index));
        index = index + 1;
      }
      return null;
    })();
  })(0);
}
function contains_value_QMARK_(values, needle) {
  return ((index, found) => {
    (() => {
      while (__eliscript_truthy16(((__eliscript_value_7) => __eliscript_truthy16(__eliscript_value_7) ? !__eliscript_truthy16(found) : __eliscript_value_7)(index < count(values)))) {
        __eliscript_truthy16(nth(values, index) === needle) && (found = true);
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(0, false);
}
function merged_overrides(authority, projected, fields) {
  return ((overrides) => {
    ((index) => {
      return (() => {
        while (__eliscript_truthy16(index < count(fields))) {
          ((key) => {
            return overrides = assoc(overrides, key, get(projected, key, null));
          })(nth(fields, index));
          index = index + 1;
        }
        return null;
      })();
    })(0);
    overrides = assoc(overrides, keyword("comment-channels"), append_all2(authority["comment-channels"], projected["comment-channels"]));
    overrides = assoc(overrides, keyword("aliases"), dedupe(append_all2(authority["aliases"], projected["aliases"])));
    return overrides;
  })(hashMap());
}
function dedupe(values) {
  return ((result, index) => {
    (() => {
      while (__eliscript_truthy16(index < count(values))) {
        ((value) => {
          return __eliscript_truthy16(!__eliscript_truthy16(contains_value_QMARK_(result, value))) ? result = conj(result, value) : null;
        })(nth(values, index));
        index = index + 1;
      }
      return null;
    })();
    return result;
  })(vector(), 0);
}
function resolve_projection(declaration, group) {
  return ((id) => {
    return ((authority_source) => {
      return ((projections) => {
        return ((authority) => {
          return ((projection_index) => {
            return ((overrides) => {
              return (() => {
                ((index) => {
                  return (() => {
                    while (__eliscript_truthy16(index < count(group))) {
                      ((post) => {
                        return ((provider) => {
                          return ((expected) => {
                            return __eliscript_truthy16(((__eliscript_value_8) => __eliscript_truthy16(__eliscript_value_8) ? provider === expected : __eliscript_value_8)(authority === null)) ? authority = post : null;
                          })(get(provider_of, authority_source, ""));
                        })(get(post["provenance"], keyword("provider"), ""));
                      })(nth(group, index));
                      index = index + 1;
                    }
                    return null;
                  })();
                })(0);
                __eliscript_truthy16(authority === null) && fail2("DOGFOOD-IDENTITY-006", String('projection for "') + String(id) + String('" names authority ') + String(String(authority_source)) + String(" but no record from that source carries the id"));
                (() => {
                  while (__eliscript_truthy16(projection_index < count(projections))) {
                    ((projection) => {
                      return ((matched) => {
                        return ((index) => {
                          return (() => {
                            (() => {
                              while (__eliscript_truthy16(index < count(group))) {
                                ((post) => {
                                  return __eliscript_truthy16(projection_matches_QMARK_(projection, post)) ? matched = post : null;
                                })(nth(group, index));
                                index = index + 1;
                              }
                              return null;
                            })();
                            __eliscript_truthy16(matched === null) && fail2("DOGFOOD-IDENTITY-007", String('projection for "') + String(id) + String('" names a record that was not collected: ') + String(String(get(projection, keyword("source"), ""))) + String(" ") + String(String(get(projection, keyword("repository"), ""))) + String("#") + String(String(get(projection, keyword("number"), null))));
                            return ((fields) => {
                              check_agreement(authority, matched, projection, fields);
                              check_authority_only(authority, matched, projection, fields);
                              return overrides = merged_overrides(authority, matched, fields);
                            })(declared_fields(declaration, projection));
                          })();
                        })(0);
                      })(null);
                    })(nth(projections, projection_index));
                    projection_index = projection_index + 1;
                  }
                  return null;
                })();
                return post_with(authority, overrides);
              })();
            })(hashMap());
          })(0);
        })(null);
      })(get(declaration, keyword("projections"), vector()));
    })(get(declaration, keyword("authority"), null));
  })(get(declaration, keyword("id"), ""));
}
function resolve_identity(config, posts) {
  return ((identity2) => {
    return ((declarations) => {
      return ((groups) => {
        return ((ids) => {
          return ((resolved) => {
            return ((index) => {
              return (() => {
                (() => {
                  while (__eliscript_truthy16(index < count(ids))) {
                    ((id) => {
                      return ((group) => {
                        return ((declaration) => {
                          return __eliscript_truthy16(count(group) === 1) ? resolved = conj(resolved, nth(group, 0)) : __eliscript_truthy16(declaration === null) ? fail2("DOGFOOD-IDENTITY-001", String('duplicate canonical id "') + String(id) + String('" from ') + String(join(", ", map_provenance(group))) + String("; declare a projection to resolve it")) : resolved = conj(resolved, resolve_projection(declaration, group));
                        })(find_declaration(declarations, id));
                      })(get(groups, id));
                    })(nth(ids, index));
                    index = index + 1;
                  }
                  return null;
                })();
                return resolved;
              })();
            })(0);
          })(vector());
        })(distinct_ids(posts));
      })(group_by_id(posts));
    })(get(identity2, keyword("projections"), vector()));
  })(get(config, keyword("identity"), hashMap()));
}
function distinct_ids(posts) {
  return ((ids, index) => {
    (() => {
      while (__eliscript_truthy16(index < count(posts))) {
        ((id) => {
          return __eliscript_truthy16(!__eliscript_truthy16(contains_value_QMARK_(ids, id))) ? ids = conj(ids, id) : null;
        })(nth(posts, index)["id"]);
        index = index + 1;
      }
      return null;
    })();
    return ids;
  })(vector(), 0);
}
function find_declaration(declarations, id) {
  return ((index, found) => {
    (() => {
      while (__eliscript_truthy16(index < count(declarations))) {
        __eliscript_truthy16(get(nth(declarations, index), keyword("id"), "") === id) && (found = nth(declarations, index));
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(0, null);
}
function map_provenance(posts) {
  return ((result, index) => {
    (() => {
      while (__eliscript_truthy16(index < count(posts))) {
        result = conj(result, provenance_text(nth(posts, index)));
        index = index + 1;
      }
      return null;
    })();
    return result;
  })(vector(), 0);
}

// examples/dogfood/dist/src/builder/preflight.mjs
var __eliscript_truthy17 = (value) => value !== false && value != null;
function repository_name(payload) {
  return ((repository) => {
    return __eliscript_truthy17(repository === null) ? "" : String(repository["full_name"] ?? "");
  })(payload["repository"] ?? null);
}
function event_record(event_name, payload) {
  return __eliscript_truthy17(event_name === "issues") ? ((issue) => {
    return __eliscript_truthy17(issue === null) ? null : hashMap(keyword("kind"), keyword("issues"), keyword("record"), issue, keyword("author"), issue["user"] ?? null);
  })(payload["issue"] ?? null) : __eliscript_truthy17(event_name === "discussions") ? ((discussion) => {
    return __eliscript_truthy17(discussion === null) ? null : hashMap(keyword("kind"), keyword("discussions"), keyword("record"), discussion, keyword("author"), discussion["user"] ?? null);
  })(payload["discussion"] ?? null) : null;
}
function record_field(record, key) {
  return get(record, key, null);
}
function enabled_sources_of_kind(config, kind) {
  return filter((source) => {
    return ((__eliscript_value_1) => __eliscript_truthy17(__eliscript_value_1) ? get(source, keyword("kind"), keyword("markdown")) === kind : __eliscript_value_1)(get(source, keyword("enabled"), false));
  }, get(config, keyword("sources"), vector()));
}
function matching_source(config, kind, repository) {
  return ((sources, index, found) => {
    (() => {
      while (__eliscript_truthy17(index < count(sources))) {
        ((source) => {
          return __eliscript_truthy17(get(source, keyword("repository"), "") === repository) ? found = source : null;
        })(nth(sources, index));
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(enabled_sources_of_kind(config, kind), 0, null);
}
function labelled_for_publication_QMARK_(source, issue) {
  return ((required, labels, index, found) => {
    (() => {
      while (__eliscript_truthy17(index < (labels ?? []).length)) {
        __eliscript_truthy17((((labels ?? [])[index] ?? null)["name"] ?? "") === required) && (found = true);
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(get(source, keyword("label"), ""), issue["labels"] ?? [], 0, false);
}
function carrier_shaped_QMARK_(config, author, body) {
  return ((adapters, index, found) => {
    (() => {
      while (__eliscript_truthy17(index < count(adapters))) {
        ((adapter) => {
          return ((principal) => {
            return ((marker) => {
              return ((login) => {
                return __eliscript_truthy17(((__eliscript_value_2) => __eliscript_truthy17(__eliscript_value_2) ? ((__eliscript_value_3) => __eliscript_truthy17(__eliscript_value_3) ? ((__eliscript_value_4) => __eliscript_truthy17(__eliscript_value_4) ? ((__eliscript_value_5) => __eliscript_truthy17(__eliscript_value_5) ? contains_QMARK_(String(marker), String(body)) : __eliscript_value_5)(to_lowercase(login) === to_lowercase(String(principal))) : __eliscript_value_4)(!__eliscript_truthy17(marker === null)) : __eliscript_value_3)(!__eliscript_truthy17(principal === null)) : __eliscript_value_2)(get(adapter, keyword("carrier-kind"), keyword("none")) === keyword("issue"))) ? found = true : null;
              })(login_of(author));
            })(get(adapter, keyword("marker"), null));
          })(get(adapter, keyword("principal"), null));
        })(nth(adapters, index));
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(get(config, keyword("adapters"), vector()), 0, false);
}
function source_skip(config, kind, source, body, author) {
  return __eliscript_truthy17(((__eliscript_value_6) => __eliscript_truthy17(__eliscript_value_6) ? !__eliscript_truthy17(labelled_for_publication_QMARK_(source, body)) : __eliscript_value_6)(kind === keyword("issues"))) ? String("the issue is not labelled ") + String(get(source, keyword("label"), "")) : __eliscript_truthy17(((__eliscript_value_7) => __eliscript_truthy17(__eliscript_value_7) ? !__eliscript_truthy17(allowed_category_QMARK_(source, body)) : __eliscript_value_7)(kind === keyword("discussions"))) ? "the discussion is in a category that is not published" : __eliscript_truthy17(carrier_shaped_QMARK_(config, author, body_of(body))) ? "the record is a comment carrier" : __eliscript_truthy17(!__eliscript_truthy17(authorized_author_QMARK_(publisher_set(get(config, keyword("publishing"), hashMap())), author))) ? String("the author ") + String(login_of(author)) + String(" is not a publisher") : "";
}
function record_skip(config, record, repository) {
  return ((kind) => {
    return ((body) => {
      return ((author) => {
        return ((source) => {
          return __eliscript_truthy17(!__eliscript_truthy17((body["pull_request"] ?? null) === null)) ? "the record is a pull request, not an article" : __eliscript_truthy17(source === null) ? String("no enabled ") + String(name_of(kind)) + String(" source selects ") + String(repository) : source_skip(config, kind, source, body, author);
        })(matching_source(config, kind, repository));
      })(record_field(record, keyword("author")));
    })(record_field(record, keyword("record")));
  })(record_field(record, keyword("kind")));
}
function skip_decision(config, classification2) {
  return ((event_name) => {
    return ((payload) => {
      return ((record) => {
        return ((detail) => {
          return __eliscript_truthy17(blank_QMARK_(detail)) ? hashMap(keyword("skip"), false) : hashMap(keyword("skip"), true, keyword("detail"), detail);
        })(__eliscript_truthy17(record === null) ? "" : record_skip(config, record, repository_name(payload)));
      })(event_record(event_name, payload));
    })(get(classification2, keyword("payload"), hashMap()));
  })(get(classification2, keyword("event"), ""));
}
function body_of(body) {
  return ((text) => {
    return __eliscript_truthy17(text === null) ? "" : String(text);
  })(body["body"] ?? null);
}
function login_of(author) {
  return __eliscript_truthy17(author === null) ? "" : String(author["login"] ?? "");
}
function name_of(kind) {
  return __eliscript_truthy17(kind === keyword("discussions")) ? "discussions" : "issues";
}

// examples/dogfood/dist/src/builder/sources.mjs
var __eliscript_truthy18 = (value) => value !== false && value != null;
function enabled_sources(config) {
  return filter((source) => {
    return get(source, keyword("enabled"), false);
  }, get(config, keyword("sources"), vector()));
}
function identity_list(posts) {
  return ((result, index) => {
    (() => {
      while (__eliscript_truthy18(index < count(posts))) {
        ((post) => {
          return ((aliases) => {
            return ((alias_index) => {
              return (() => {
                result = conj(result, post["id"]);
                return (() => {
                  while (__eliscript_truthy18(alias_index < count(aliases))) {
                    result = conj(result, nth(aliases, alias_index));
                    alias_index = alias_index + 1;
                  }
                  return null;
                })();
              })();
            })(0);
          })(post["aliases"]);
        })(nth(posts, index));
        index = index + 1;
      }
      return null;
    })();
    return result;
  })(vector(), 0);
}
async function source_posts(root, config, source, transport, identities) {
  return await (async (kind) => {
    return __eliscript_truthy18(kind === keyword("markdown")) ? hashMap(keyword("posts"), read_posts(root, get(source, keyword("directory"), "content/posts")), keyword("carriers"), 0, keyword("unauthorized"), 0) : __eliscript_truthy18(kind === keyword("issues")) ? await collect_issues(hashMap(keyword("source"), source, keyword("publishing"), get(config, keyword("publishing")), keyword("adapters"), get(config, keyword("adapters"), vector()), keyword("identities"), identities, keyword("comments"), get(config, keyword("comments"), hashMap()), keyword("transport"), transport)) : __eliscript_truthy18(kind === keyword("discussions")) ? await collect_discussions(hashMap(keyword("source"), source, keyword("publishing"), get(config, keyword("publishing")), keyword("adapters"), get(config, keyword("adapters"), vector()), keyword("identities"), identities, keyword("comments"), get(config, keyword("comments"), hashMap()), keyword("transport"), transport)) : fail2("DOGFOOD-SOURCE-001", String("unsupported source kind: ") + String(kind));
  })(get(source, keyword("kind"), keyword("markdown")));
}

// examples/dogfood/dist/src/support/config.mjs
var import_node_fs2 = require("node:fs");
var __eliscript_truthy19 = (value) => value !== false && value != null;
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
  return ((index) => {
    return __eliscript_truthy19(index < reader["length"]) ? char_code(reader["source"], index) : null;
  })(reader["index"]);
}
function advance_reader(reader) {
  return reader["index"] = reader["index"] + 1;
}
function whitespace_code_QMARK_(code) {
  return ((__eliscript_value_1) => __eliscript_truthy19(__eliscript_value_1) ? __eliscript_value_1 : ((__eliscript_value_2) => __eliscript_truthy19(__eliscript_value_2) ? __eliscript_value_2 : ((__eliscript_value_3) => __eliscript_truthy19(__eliscript_value_3) ? __eliscript_value_3 : code === 13)(code === 10))(code === 9))(code === 32);
}
function delimiter_code_QMARK_(code) {
  return ((__eliscript_value_4) => __eliscript_truthy19(__eliscript_value_4) ? __eliscript_value_4 : ((__eliscript_value_5) => __eliscript_truthy19(__eliscript_value_5) ? __eliscript_value_5 : ((__eliscript_value_6) => __eliscript_truthy19(__eliscript_value_6) ? __eliscript_value_6 : ((__eliscript_value_7) => __eliscript_truthy19(__eliscript_value_7) ? __eliscript_value_7 : ((__eliscript_value_8) => __eliscript_truthy19(__eliscript_value_8) ? __eliscript_value_8 : ((__eliscript_value_9) => __eliscript_truthy19(__eliscript_value_9) ? __eliscript_value_9 : ((__eliscript_value_10) => __eliscript_truthy19(__eliscript_value_10) ? __eliscript_value_10 : ((__eliscript_value_11) => __eliscript_truthy19(__eliscript_value_11) ? __eliscript_value_11 : ((__eliscript_value_12) => __eliscript_truthy19(__eliscript_value_12) ? __eliscript_value_12 : code === semicolon)(code === double_quote2))(code === close_bracket))(code === open_bracket))(code === close_brace))(code === open_brace))(code === close_paren))(code === open_paren))(whitespace_code_QMARK_(code)))(code === null);
}
function skip_space(reader) {
  return ((done) => {
    return (() => {
      while (__eliscript_truthy19(!__eliscript_truthy19(done))) {
        ((code) => {
          return __eliscript_truthy19(code === null) ? done = true : __eliscript_truthy19(whitespace_code_QMARK_(code)) ? advance_reader(reader) : __eliscript_truthy19(code === semicolon) ? (() => {
            while (__eliscript_truthy19(((__eliscript_value_13) => __eliscript_truthy19(__eliscript_value_13) ? !__eliscript_truthy19(reader_code(reader) === 10) : __eliscript_value_13)(!__eliscript_truthy19(reader_code(reader) === null)))) {
              advance_reader(reader);
            }
            return null;
          })() : done = true;
        })(reader_code(reader));
      }
      return null;
    })();
  })(false);
}
function read_failure(reader, message) {
  return fail2("DOGFOOD-CONFIG-001", String("configuration at offset ") + String(reader["index"]) + String(": ") + String(message));
}
function read_delimited(reader, open, close, kind) {
  advance_reader(reader);
  return ((items, done) => {
    (() => {
      while (__eliscript_truthy19(!__eliscript_truthy19(done))) {
        skip_space(reader);
        ((code) => {
          return __eliscript_truthy19(code === null) ? read_failure(reader, String("unterminated ") + String(kind)) : __eliscript_truthy19(code === close) ? (() => {
            advance_reader(reader);
            return done = true;
          })() : items = conj(items, read_value(reader));
        })(reader_code(reader));
      }
      return null;
    })();
    return items;
  })(vector(), false);
}
function read_map_value(reader) {
  return ((items) => {
    return ((total) => {
      return (() => {
        __eliscript_truthy19(total % 2 === 1) && read_failure(reader, "map literal needs an even number of forms");
        return ((result, index) => {
          (() => {
            while (__eliscript_truthy19(index < total)) {
              result = assoc(result, nth(items, index), nth(items, index + 1)), index = index + 2;
            }
            return null;
          })();
          return result;
        })(hashMap(), 0);
      })();
    })(count(items));
  })(read_delimited(reader, open_brace, close_brace, "map"));
}
function read_vector_value(reader) {
  return read_delimited(reader, open_bracket, close_bracket, "vector");
}
function read_list_value(reader) {
  return read_delimited(reader, open_paren, close_paren, "list");
}
function read_escaped(reader) {
  advance_reader(reader);
  return ((code) => {
    __eliscript_truthy19(code === null) && read_failure(reader, "unterminated string literal");
    advance_reader(reader);
    return __eliscript_truthy19(code === 110) ? `
` : __eliscript_truthy19(code === 116) ? "\t" : __eliscript_truthy19(code === 114) ? "\r" : __eliscript_truthy19(code === double_quote2) ? '"' : __eliscript_truthy19(code === backslash) ? "\\" : read_failure(reader, "unsupported string escape");
  })(reader_code(reader));
}
function read_string_value(reader) {
  advance_reader(reader);
  return ((result, done) => {
    (() => {
      while (__eliscript_truthy19(!__eliscript_truthy19(done))) {
        ((code) => {
          return __eliscript_truthy19(code === null) ? read_failure(reader, "unterminated string literal") : __eliscript_truthy19(code === double_quote2) ? (() => {
            advance_reader(reader);
            return done = true;
          })() : __eliscript_truthy19(code === backslash) ? result = String(result) + String(read_escaped(reader)) : (() => {
            result = String(result) + String(String.fromCharCode(code));
            return advance_reader(reader);
          })();
        })(reader_code(reader));
      }
      return null;
    })();
    return result;
  })("", false);
}
function read_keyword_value(reader) {
  advance_reader(reader);
  return ((name) => {
    __eliscript_truthy19(blank_QMARK_(name)) && read_failure(reader, "empty keyword");
    return keyword(name);
  })(read_token(reader));
}
function token_end_QMARK_(code) {
  return delimiter_code_QMARK_(code);
}
function read_token(reader) {
  return ((result, done) => {
    (() => {
      while (__eliscript_truthy19(!__eliscript_truthy19(done))) {
        ((code) => {
          return __eliscript_truthy19(token_end_QMARK_(code)) ? done = true : (() => {
            result = String(result) + String(String.fromCharCode(code));
            return advance_reader(reader);
          })();
        })(reader_code(reader));
      }
      return null;
    })();
    return result;
  })("", false);
}
function numeric_token_QMARK_(text) {
  return ((start, index, ok) => {
    __eliscript_truthy19(((__eliscript_value_14) => __eliscript_truthy19(__eliscript_value_14) ? char_code(text, 0) === minus_sign : __eliscript_value_14)(ok)) && (start = 1, index = 1);
    (() => {
      while (__eliscript_truthy19(index < text_length(text))) {
        __eliscript_truthy19(!__eliscript_truthy19(digit_code_QMARK_(char_code(text, index)))) && (ok = false);
        index = index + 1;
      }
      return null;
    })();
    return ((__eliscript_value_15) => __eliscript_truthy19(__eliscript_value_15) ? text_length(text) > start : __eliscript_value_15)(ok);
  })(0, 0, text_length(text) > 0);
}
function read_atom(reader) {
  return ((token) => {
    return __eliscript_truthy19(token === "t") ? true : __eliscript_truthy19(token === "false") ? false : __eliscript_truthy19(token === "nil") ? null : __eliscript_truthy19(numeric_token_QMARK_(token)) ? Number(token) : __eliscript_truthy19(blank_QMARK_(token)) ? read_failure(reader, "unexpected character") : { "config-symbol": token };
  })(read_token(reader));
}
function read_value(reader) {
  skip_space(reader);
  return ((code) => {
    return __eliscript_truthy19(code === null) ? read_failure(reader, "unexpected end of configuration") : __eliscript_truthy19(code === open_paren) ? read_list_value(reader) : __eliscript_truthy19(code === open_brace) ? read_map_value(reader) : __eliscript_truthy19(code === open_bracket) ? read_vector_value(reader) : __eliscript_truthy19(code === double_quote2) ? read_string_value(reader) : __eliscript_truthy19(code === colon) ? read_keyword_value(reader) : read_atom(reader);
  })(reader_code(reader));
}
function read_forms(reader) {
  return ((forms) => {
    skip_space(reader);
    (() => {
      while (__eliscript_truthy19(!__eliscript_truthy19(reader_code(reader) === null))) {
        forms = conj(forms, read_value(reader));
        skip_space(reader);
      }
      return null;
    })();
    return forms;
  })(vector());
}
function symbol_named_QMARK_(value, name) {
  return ((__eliscript_value_16) => __eliscript_truthy19(__eliscript_value_16) ? ((__eliscript_value_17) => __eliscript_truthy19(__eliscript_value_17) ? ((__eliscript_value_18) => __eliscript_truthy19(__eliscript_value_18) ? (value["config-symbol"] ?? null) === name : __eliscript_value_18)(!__eliscript_truthy19(isVector(value))) : __eliscript_value_17)(!__eliscript_truthy19(isMap(value))) : __eliscript_value_16)(!__eliscript_truthy19(value === null));
}
function list_starting_with_QMARK_(value, name) {
  return ((__eliscript_value_19) => __eliscript_truthy19(__eliscript_value_19) ? ((__eliscript_value_20) => __eliscript_truthy19(__eliscript_value_20) ? ((__eliscript_value_21) => __eliscript_truthy19(__eliscript_value_21) ? symbol_named_QMARK_(nth(value, 0), name) : __eliscript_value_21)(count(value) > 1) : __eliscript_value_20)(isVector(value)) : __eliscript_value_19)(!__eliscript_truthy19(value === null));
}
function find_child_declaration(children, name) {
  return ((index, found) => {
    (() => {
      while (__eliscript_truthy19(index < count(children))) {
        ((child) => {
          return __eliscript_truthy19(((__eliscript_value_22) => __eliscript_truthy19(__eliscript_value_22) ? list_starting_with_QMARK_(child, name) : __eliscript_value_22)(found === null)) ? found = child : null;
        })(nth(children, index));
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(0, null);
}
function find_declaration2(forms, name) {
  return ((index, found) => {
    (() => {
      while (__eliscript_truthy19(index < count(forms))) {
        ((form) => {
          return __eliscript_truthy19(found === null) ? __eliscript_truthy19(list_starting_with_QMARK_(form, name)) ? found = form : __eliscript_truthy19(list_starting_with_QMARK_(form, "module")) ? found = find_child_declaration(form, name) : null : null;
        })(nth(forms, index));
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(0, null);
}
function load_config_value(path) {
  return ((source) => {
    return ((reader) => {
      return ((forms) => {
        return ((declaration) => {
          return (() => {
            __eliscript_truthy19(declaration === null) && fail2("DOGFOOD-CONFIG-002", String(path) + String(": no (defconst config ...) declaration found"));
            __eliscript_truthy19(count(declaration) < 3) && fail2("DOGFOOD-CONFIG-002", String(path) + String(": defconst must bind a value"));
            return nth(declaration, 2);
          })();
        })(find_declaration2(forms, "defconst"));
      })(read_forms(reader));
    })(make_reader(source));
  })(import_node_fs2.readFileSync(path, "utf8"));
}
function scalar_value_QMARK_(value) {
  return ((__eliscript_value_23) => __eliscript_truthy19(__eliscript_value_23) ? __eliscript_value_23 : ((__eliscript_value_24) => __eliscript_truthy19(__eliscript_value_24) ? __eliscript_value_24 : ((__eliscript_value_25) => __eliscript_truthy19(__eliscript_value_25) ? __eliscript_value_25 : ((__eliscript_value) => {
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
  })(value) === "keyword")(((__eliscript_value) => {
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
  })(value) === "boolean"))(((__eliscript_value) => {
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
  })(value) === "number"))(((__eliscript_value) => {
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
  })(value) === "string");
}
function data_only_QMARK_(value) {
  return __eliscript_truthy19(value === null) ? true : __eliscript_truthy19(((__eliscript_value_26) => __eliscript_truthy19(__eliscript_value_26) ? __eliscript_value_26 : scalar_value_QMARK_(value))(value === undefined)) ? !__eliscript_truthy19(value === undefined) : __eliscript_truthy19(isVector(value)) ? ((index, ok) => {
    (() => {
      while (__eliscript_truthy19(index < count(value))) {
        __eliscript_truthy19(!__eliscript_truthy19(data_only_QMARK_(nth(value, index)))) && (ok = false);
        index = index + 1;
      }
      return null;
    })();
    return ok;
  })(0, true) : __eliscript_truthy19(isMap(value)) ? ((keys, index, ok) => {
    (() => {
      while (__eliscript_truthy19(index < count(keys))) {
        __eliscript_truthy19(!__eliscript_truthy19(((__eliscript_value_27) => __eliscript_truthy19(__eliscript_value_27) ? data_only_QMARK_(get(value, nth(keys, index))) : __eliscript_value_27)(((__eliscript_value) => {
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
        })(nth(keys, index)) === "keyword"))) && (ok = false);
        index = index + 1;
      }
      return null;
    })();
    return ok;
  })(collect_keys(value), 0, true) : null;
}
function map_value_QMARK_(value) {
  return isMap(value);
}
function require_map(value, label) {
  __eliscript_truthy19(!__eliscript_truthy19(map_value_QMARK_(value))) && fail2("DOGFOOD-CONFIG-003", String(label) + String(" must be a map"));
  return value;
}
function require_string(value, label) {
  __eliscript_truthy19(!__eliscript_truthy19(((__eliscript_value_28) => __eliscript_truthy19(__eliscript_value_28) ? ((__eliscript_value) => {
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
  })(value) === "string" : __eliscript_value_28)(!__eliscript_truthy19(value === null)))) && fail2("DOGFOOD-CONFIG-003", String(label) + String(" must be a string"));
  return value;
}
function require_key(map2, key, label) {
  return ((value) => {
    __eliscript_truthy19(empty_value_QMARK_(value)) && fail2("DOGFOOD-CONFIG-003", String(label) + String(" is required"));
    return value;
  })(get(map2, key, null));
}
function relative_path_QMARK_(text) {
  return ((__eliscript_value_29) => __eliscript_truthy19(__eliscript_value_29) ? ((__eliscript_value_30) => __eliscript_truthy19(__eliscript_value_30) ? ((__eliscript_value_31) => __eliscript_truthy19(__eliscript_value_31) ? !__eliscript_truthy19(starts_with_QMARK_("..", text)) : __eliscript_value_31)(!__eliscript_truthy19(starts_with_QMARK_("~", text))) : __eliscript_value_30)(!__eliscript_truthy19(starts_with_QMARK_("/", text))) : __eliscript_value_29)(!__eliscript_truthy19(blank_QMARK_(text)));
}
function collect_keys(map2) {
  return reduceKV(map2, (accumulator, key, value) => {
    return conj(accumulator, key);
  }, vector());
}
function known_key_QMARK_(key) {
  return ((index, found) => {
    (() => {
      while (__eliscript_truthy19(((__eliscript_value_32) => __eliscript_truthy19(__eliscript_value_32) ? !__eliscript_truthy19(found) : __eliscript_value_32)(index < count(known_keys)))) {
        __eliscript_truthy19(nth(known_keys, index) === key) && (found = true);
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(0, false);
}
function check_source(source, index) {
  require_map(source, String("sources[") + String(index) + String("]"));
  return ((label) => {
    return ((kind) => {
      return (() => {
        require_key(source, keyword("id"), label);
        return __eliscript_truthy19(kind === keyword("markdown")) ? check_contained(require_string(require_key(source, keyword("directory"), String(label) + String(" markdown")), String(label) + String(".directory")), String(label) + String(".directory")) : __eliscript_truthy19(kind === keyword("issues")) ? (() => {
          check_repository(source, label);
          check_visibility(source, label);
          return check_optional_string(source, keyword("label"), label);
        })() : __eliscript_truthy19(kind === keyword("discussions")) ? (() => {
          check_repository(source, label);
          check_visibility(source, label);
          return require_string(require_key(source, keyword("category"), String(label) + String(" discussions")), String(label) + String(".category"));
        })() : fail2("DOGFOOD-CONFIG-009", String(label) + String(".kind must be markdown, issues, or discussions"));
      })();
    })(require_key(source, keyword("kind"), label));
  })(String("sources[") + String(index) + String("]"));
}
function check_contained(value, label) {
  __eliscript_truthy19(!__eliscript_truthy19(relative_path_QMARK_(value))) && fail2("DOGFOOD-CONFIG-004", String(label) + String(" must be a contained repository-relative path"));
  return value;
}
function check_repository(source, label) {
  return ((repository) => {
    __eliscript_truthy19(!__eliscript_truthy19(((__eliscript_value_33) => __eliscript_truthy19(__eliscript_value_33) ? ((__eliscript_value_34) => __eliscript_truthy19(__eliscript_value_34) ? !__eliscript_truthy19(blank_QMARK_(nth(split_on("/", repository), 1))) : __eliscript_value_34)(!__eliscript_truthy19(blank_QMARK_(nth(split_on("/", repository), 0)))) : __eliscript_value_33)(count(split_on("/", repository)) === 2))) && fail2("DOGFOOD-CONFIG-010", String(label) + String(".repository must be owner/name"));
    return repository;
  })(require_string(require_key(source, keyword("repository"), label), String(label) + String(".repository")));
}
function check_visibility(source, label) {
  return ((value) => {
    __eliscript_truthy19(!__eliscript_truthy19(((__eliscript_value_35) => __eliscript_truthy19(__eliscript_value_35) ? __eliscript_value_35 : ((__eliscript_value_36) => __eliscript_truthy19(__eliscript_value_36) ? __eliscript_value_36 : value === keyword("private"))(value === keyword("public")))(value === null))) && fail2("DOGFOOD-CONFIG-016", String(label) + String(".visibility must be public or private"));
    return value;
  })(get(source, keyword("visibility"), null));
}
function check_optional_string(source, key, label) {
  return ((value) => {
    return __eliscript_truthy19(((__eliscript_value_37) => __eliscript_truthy19(__eliscript_value_37) ? !__eliscript_truthy19(((__eliscript_value) => {
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
    })(value) === "string") : __eliscript_value_37)(!__eliscript_truthy19(value === null))) ? fail2("DOGFOOD-CONFIG-003", String(label) + String(".") + String(String(key)) + String(" must be a string")) : null;
  })(get(source, key, null));
}
function check_sources(sources) {
  __eliscript_truthy19(!__eliscript_truthy19(isVector(sources))) && fail2("DOGFOOD-CONFIG-003", "sources must be a vector");
  __eliscript_truthy19(count(sources) === 0) && fail2("DOGFOOD-CONFIG-003", "at least one article source is required");
  return ((index, enabled) => {
    (() => {
      while (__eliscript_truthy19(index < count(sources))) {
        ((source) => {
          check_source(source, index);
          return __eliscript_truthy19(get(source, keyword("enabled"), false)) ? enabled = enabled + 1 : null;
        })(nth(sources, index));
        index = index + 1;
      }
      return null;
    })();
    __eliscript_truthy19(enabled === 0) && fail2("DOGFOOD-CONFIG-003", "at least one article source must be enabled");
    return check_unique_field(sources, keyword("id"), "provider id");
  })(0, 0);
}
function check_unique_field(values, key, label) {
  return ((collected, index) => {
    (() => {
      while (__eliscript_truthy19(index < count(values))) {
        ((value) => {
          return __eliscript_truthy19(!__eliscript_truthy19(value === null)) ? collected = conj(collected, value) : null;
        })(get(nth(values, index), key, null));
        index = index + 1;
      }
      return null;
    })();
    return check_unique_values(collected, label);
  })(vector(), 0);
}
function check_unique_values(values, label) {
  return ((seen, index) => {
    (() => {
      while (__eliscript_truthy19(index < count(values))) {
        ((value) => {
          __eliscript_truthy19(member_of_QMARK_(seen, value)) && fail2("DOGFOOD-CONFIG-011", String(label) + String(" ") + String(String(value)) + String(" is declared more than once"));
          return seen = conj(seen, value);
        })(nth(values, index));
        index = index + 1;
      }
      return null;
    })();
    return seen;
  })(vector(), 0);
}
function member_of_QMARK_(values, needle) {
  return ((index, found) => {
    (() => {
      while (__eliscript_truthy19(((__eliscript_value_38) => __eliscript_truthy19(__eliscript_value_38) ? !__eliscript_truthy19(found) : __eliscript_value_38)(index < count(values)))) {
        __eliscript_truthy19(nth(values, index) === needle) && (found = true);
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(0, false);
}
function check_comments(config) {
  return ((comments) => {
    return __eliscript_truthy19(!__eliscript_truthy19(comments === null)) ? (() => {
      require_map(comments, "config.comments");
      return ((channels) => {
        __eliscript_truthy19(!__eliscript_truthy19(isVector(channels))) && fail2("DOGFOOD-CONFIG-003", "comments.channels must be a vector");
        ((index) => {
          return (() => {
            while (__eliscript_truthy19(index < count(channels))) {
              require_map(nth(channels, index), String("comments.channels[") + String(index) + String("]"));
              require_key(nth(channels, index), keyword("id"), String("comments.channels[") + String(index) + String("]"));
              require_key(nth(channels, index), keyword("kind"), String("comments.channels[") + String(index) + String("]"));
              check_mode(nth(channels, index), String("comments.channels[") + String(index) + String("]"));
              index = index + 1;
            }
            return null;
          })();
        })(0);
        return check_unique_field(channels, keyword("id"), "channel id");
      })(get(comments, keyword("channels"), vector()));
    })() : null;
  })(get(config, keyword("comments"), null));
}
function check_private_input(config) {
  return ((private_sources, sources, index) => {
    (() => {
      while (__eliscript_truthy19(index < count(sources))) {
        ((source) => {
          __eliscript_truthy19(((__eliscript_value_39) => __eliscript_truthy19(__eliscript_value_39) ? get(source, keyword("visibility"), keyword("public")) === keyword("private") : __eliscript_value_39)(get(source, keyword("enabled"), false))) && (private_sources = conj(private_sources, source));
          return index = index + 1;
        })(nth(sources, index));
      }
      return null;
    })();
    return __eliscript_truthy19(count(private_sources) > 0) ? (() => {
      ((publishing) => {
        return __eliscript_truthy19(!__eliscript_truthy19(get(publishing, keyword("private-input"), keyword("open")) === keyword("acknowledged"))) ? fail2("DOGFOOD-CONFIG-017", String("a private source publishes into public output; declare ") + String("publishing.private-input :acknowledged to accept it")) : null;
      })(get(config, keyword("publishing"), hashMap()));
      return ((channels, channel_index) => {
        return (() => {
          while (__eliscript_truthy19(channel_index < count(channels))) {
            ((channel) => {
              return ((kind) => {
                return ((mode) => {
                  return __eliscript_truthy19(((__eliscript_value_40) => __eliscript_truthy19(__eliscript_value_40) ? ((__eliscript_value_41) => __eliscript_truthy19(__eliscript_value_41) ? ((__eliscript_value_43) => __eliscript_truthy19(__eliscript_value_43) ? __eliscript_value_43 : mode === keyword("hybrid"))(mode === keyword("live")) : __eliscript_value_41)(((__eliscript_value_42) => __eliscript_truthy19(__eliscript_value_42) ? __eliscript_value_42 : kind === keyword("discussion"))(kind === keyword("issue"))) : __eliscript_value_40)(get(channel, keyword("enabled"), false))) ? fail2("DOGFOOD-CONFIG-018", String("a private source cannot serve ") + String(String(mode)) + String(" comments: the reader holds no credential")) : null;
                })(get(channel, keyword("mode"), keyword("snapshot")));
              })(get(channel, keyword("kind"), null));
            })(nth(channels, channel_index));
            channel_index = channel_index + 1;
          }
          return null;
        })();
      })(get(get(config, keyword("comments"), hashMap()), keyword("channels"), vector()), 0);
    })() : null;
  })(vector(), get(config, keyword("sources"), vector()), 0);
}
function check_refresh(config) {
  return ((refresh) => {
    return __eliscript_truthy19(!__eliscript_truthy19(refresh === null)) ? (() => {
      require_map(refresh, "config.refresh");
      check_policy(refresh, keyword("articles"), refresh_article_policies, "articles");
      check_policy(refresh, keyword("comments"), refresh_comment_policies, "comments");
      return check_policy(refresh, keyword("no-change"), refresh_no_change_policies, "no-change");
    })() : null;
  })(get(config, keyword("refresh"), null));
}
function check_policy(declaration, key, allowed, label) {
  return ((value) => {
    return __eliscript_truthy19(((__eliscript_value_44) => __eliscript_truthy19(__eliscript_value_44) ? !__eliscript_truthy19(member_of_QMARK_(allowed, value)) : __eliscript_value_44)(!__eliscript_truthy19(value === null))) ? fail2("DOGFOOD-CONFIG-015", String("refresh.") + String(label) + String(" must be one of ") + String(join_keywords(allowed))) : null;
  })(get(declaration, key, null));
}
function join_keywords(values) {
  return ((parts, index) => {
    (() => {
      while (__eliscript_truthy19(index < count(values))) {
        parts = conj(parts, collection_name(nth(values, index)));
        index = index + 1;
      }
      return null;
    })();
    return join(", ", parts);
  })(vector(), 0);
}
function collection_name(value) {
  return ((text) => {
    return __eliscript_truthy19(((__eliscript_value_45) => __eliscript_truthy19(__eliscript_value_45) ? char_code(text, 0) === 58 : __eliscript_value_45)(text_length(text) > 0)) ? slice(1, text_length(text), text) : text;
  })(String(value));
}
function check_adapters(config) {
  return ((adapters) => {
    __eliscript_truthy19(!__eliscript_truthy19(isVector(adapters))) && fail2("DOGFOOD-CONFIG-003", "adapters must be a vector");
    ((index) => {
      return (() => {
        while (__eliscript_truthy19(index < count(adapters))) {
          ((label) => {
            return ((adapter) => {
              return (() => {
                require_map(adapter, label);
                require_key(adapter, keyword("id"), label);
                return ((kind) => {
                  __eliscript_truthy19(!__eliscript_truthy19(carrier_kind_QMARK_(kind))) && fail2("DOGFOOD-CONFIG-012", String(label) + String(".carrier-kind must be issue, discussion, ") + String("external, or none"));
                  __eliscript_truthy19(((__eliscript_value_46) => __eliscript_truthy19(__eliscript_value_46) ? __eliscript_value_46 : kind === keyword("discussion"))(kind === keyword("issue"))) && (() => {
                    require_key(adapter, keyword("principal"), String(label) + String(" native carrier"));
                    return require_key(adapter, keyword("marker"), String(label) + String(" native carrier"));
                  })();
                  return ((mode) => {
                    return __eliscript_truthy19(((__eliscript_value_47) => __eliscript_truthy19(__eliscript_value_47) ? ((__eliscript_value_48) => __eliscript_truthy19(__eliscript_value_48) ? mode === keyword("snapshot") : __eliscript_value_48)(((__eliscript_value_49) => __eliscript_truthy19(__eliscript_value_49) ? __eliscript_value_49 : kind === keyword("none"))(kind === keyword("external"))) : __eliscript_value_47)(!__eliscript_truthy19(mode === null))) ? fail2("DOGFOOD-CONFIG-013", String(label) + String(" is browser-only and cannot snapshot")) : null;
                  })(get(adapter, keyword("mode"), null));
                })(require_key(adapter, keyword("carrier-kind"), label));
              })();
            })(nth(adapters, index));
          })(String("adapters[") + String(index) + String("]"));
          index = index + 1;
        }
        return null;
      })();
    })(0);
    return check_unique_field(adapters, keyword("id"), "adapter id");
  })(get(config, keyword("adapters"), vector()));
}
function check_mode(declaration, label) {
  return ((mode) => {
    return __eliscript_truthy19(((__eliscript_value_50) => __eliscript_truthy19(__eliscript_value_50) ? !__eliscript_truthy19(comment_mode_QMARK_(mode)) : __eliscript_value_50)(!__eliscript_truthy19(mode === null))) ? fail2("DOGFOOD-CONFIG-014", String(label) + String(".mode must be snapshot, live, hybrid, or embed")) : null;
  })(get(declaration, keyword("mode"), null));
}
function comment_mode_QMARK_(mode) {
  return ((__eliscript_value_51) => __eliscript_truthy19(__eliscript_value_51) ? __eliscript_value_51 : ((__eliscript_value_52) => __eliscript_truthy19(__eliscript_value_52) ? __eliscript_value_52 : ((__eliscript_value_53) => __eliscript_truthy19(__eliscript_value_53) ? __eliscript_value_53 : mode === keyword("embed"))(mode === keyword("hybrid")))(mode === keyword("live")))(mode === keyword("snapshot"));
}
function carrier_kind_QMARK_(kind) {
  return ((__eliscript_value_54) => __eliscript_truthy19(__eliscript_value_54) ? __eliscript_value_54 : ((__eliscript_value_55) => __eliscript_truthy19(__eliscript_value_55) ? __eliscript_value_55 : ((__eliscript_value_56) => __eliscript_truthy19(__eliscript_value_56) ? __eliscript_value_56 : kind === keyword("none"))(kind === keyword("external")))(kind === keyword("discussion")))(kind === keyword("issue"));
}
function check_publishing(config) {
  return ((publishing) => {
    return __eliscript_truthy19(!__eliscript_truthy19(publishing === null)) ? (() => {
      require_map(publishing, "config.publishing");
      ((owner) => {
        return ((logins) => {
          return (() => {
            ((coauthors) => {
              return ((index) => {
                return (() => {
                  __eliscript_truthy19(!__eliscript_truthy19(isVector(coauthors))) && fail2("DOGFOOD-CONFIG-003", "publishing.coauthors must be a vector");
                  return (() => {
                    while (__eliscript_truthy19(index < count(coauthors))) {
                      ((coauthor) => {
                        return logins = conj(logins, login_of2(coauthor, String("publishing.coauthors[") + String(index) + String("]")));
                      })(require_map(nth(coauthors, index), String("publishing.coauthors[") + String(index) + String("]")));
                      index = index + 1;
                    }
                    return null;
                  })();
                })();
              })(0);
            })(get(publishing, keyword("coauthors"), vector()));
            return check_unique_values(logins, "publisher login");
          })();
        })(vector(login_of2(owner, "config.publishing.owner")));
      })(require_map(require_key(publishing, keyword("owner"), "config.publishing.owner"), "config.publishing.owner"));
      return require_map(get(publishing, keyword("owner"), null), "config.publishing.owner");
    })() : null;
  })(get(config, keyword("publishing"), null));
}
function login_of2(publisher, label) {
  return to_lowercase(require_string(require_key(publisher, keyword("login"), String(label) + String(".login")), String(label) + String(".login")));
}
function validate_config(config, path) {
  require_map(config, "config");
  __eliscript_truthy19(!__eliscript_truthy19(data_only_QMARK_(config))) && fail2("DOGFOOD-CONFIG-005", String(path) + String(": configuration must contain data only, never code"));
  ((keys, index) => {
    return (() => {
      while (__eliscript_truthy19(index < count(keys))) {
        __eliscript_truthy19(!__eliscript_truthy19(known_key_QMARK_(nth(keys, index)))) && fail2("DOGFOOD-CONFIG-006", String(path) + String(": unknown configuration key ") + String(nth(keys, index)));
        index = index + 1;
      }
      return null;
    })();
  })(collect_keys(config), 0);
  ((version) => {
    return __eliscript_truthy19(!__eliscript_truthy19(version === 1)) ? fail2("DOGFOOD-CONFIG-007", String(path) + String(": unsupported schema version ") + String(version)) : null;
  })(require_key(config, keyword("schema-version"), "config.schema-version"));
  return ((site) => {
    return ((base_url) => {
      return (() => {
        require_string(require_key(site, keyword("title"), "config.site.title"), "site.title");
        __eliscript_truthy19(!__eliscript_truthy19(starts_with_QMARK_("https://", base_url))) && fail2("DOGFOOD-CONFIG-008", "site.base-url must be an absolute https URL for production");
        check_sources(require_key(config, keyword("sources"), "config.sources"));
        check_private_input(config);
        check_refresh(config);
        check_adapters(config);
        check_comments(config);
        check_publishing(config);
        ((output) => {
          return ((directory) => {
            return __eliscript_truthy19(!__eliscript_truthy19(relative_path_QMARK_(directory))) ? fail2("DOGFOOD-CONFIG-004", "output.directory must be a contained repository-relative path") : null;
          })(require_string(require_key(output, keyword("directory"), "config.output.directory"), "output.directory"));
        })(require_map(require_key(config, keyword("output"), "config.output"), "output"));
        return config;
      })();
    })(require_string(require_key(site, keyword("base-url"), "config.site.base-url"), "site.base-url"));
  })(require_map(require_key(config, keyword("site"), "config.site"), "site"));
}
function load_config(path) {
  return validate_config(load_config_value(path), path);
}

// examples/dogfood/dist/src/builder/main.mjs
var __eliscript_truthy20 = (value) => value !== false && value != null;
var program_arguments = process.argv;
var environment = process.env;
var fetch_implementation = globalThis.fetch;
var set_exit_code = (code) => {
  process.exitCode = code;
};
var to_native_array2 = (value) => Array.from(value);
function env_value(name) {
  return ((value) => {
    return __eliscript_truthy20(((__eliscript_value_1) => __eliscript_truthy20(__eliscript_value_1) ? __eliscript_value_1 : value === "")(value === null)) ? null : value;
  })(environment[name] ?? null);
}
function truthy_input_QMARK_(value) {
  return ((__eliscript_value_2) => __eliscript_truthy20(__eliscript_value_2) ? __eliscript_value_2 : ((__eliscript_value_3) => __eliscript_truthy20(__eliscript_value_3) ? __eliscript_value_3 : value === "yes")(value === "1"))(value === "true");
}
function action_input(name) {
  return __eliscript_truthy20(name === "config-file") ? first_value(env_value("INPUT_CONFIG-FILE"), env_value("INPUT_CONFIG_FILE")) : __eliscript_truthy20(name === "output-directory") ? first_value(env_value("INPUT_OUTPUT-DIRECTORY"), env_value("INPUT_OUTPUT_DIRECTORY")) : __eliscript_truthy20(name === "force") ? env_value("INPUT_FORCE") : __eliscript_truthy20(name === "preview") ? env_value("INPUT_PREVIEW") : __eliscript_truthy20(name === "event-file") ? first_value(env_value("INPUT_EVENT-FILE"), env_value("INPUT_EVENT_FILE")) : __eliscript_truthy20(name === "previous-manifest") ? first_value(env_value("INPUT_PREVIOUS-MANIFEST"), env_value("INPUT_PREVIOUS_MANIFEST")) : __eliscript_truthy20(name === "github-token") ? first_value(env_value("INPUT_GITHUB-TOKEN"), env_value("INPUT_GITHUB_TOKEN")) : null;
}
function first_value(first, second) {
  return __eliscript_truthy20(first === null) ? second : first;
}
function flag_present_QMARK_(arguments$, name) {
  return ((index, found, total) => {
    (() => {
      while (__eliscript_truthy20(index < total)) {
        __eliscript_truthy20(nth(arguments$, index) === name) && (found = true);
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(0, null, count(arguments$));
}
function option_value(arguments$, name, fallback) {
  return ((index, found, total) => {
    (() => {
      while (__eliscript_truthy20(index < total)) {
        __eliscript_truthy20(((__eliscript_value_4) => __eliscript_truthy20(__eliscript_value_4) ? index + 1 < total : __eliscript_value_4)(nth(arguments$, index) === name)) && (found = nth(arguments$, index + 1));
        index = index + 1;
      }
      return null;
    })();
    return found;
  })(2, fallback, count(arguments$));
}
function absolute_path(root, value) {
  return __eliscript_truthy20(slice(0, 1, value) === "/") ? value : Path2.join(root, value);
}
function prepare_staging(staging) {
  __eliscript_truthy20(import_node_fs3.existsSync(staging)) && import_node_fs3.rmSync(staging, { recursive: true, force: true });
  return import_node_fs3.mkdirSync(staging, { recursive: true });
}
function write_document(staging, document2) {
  return ((relative) => {
    return ((target) => {
      return (() => {
        import_node_fs3.mkdirSync(Path2.dirname(target), { recursive: true });
        return import_node_fs3.writeFileSync(target, get(document2, keyword("content")));
      })();
    })(Path2.join(staging, relative));
  })(get(document2, keyword("path")));
}
function canonical_channel(channel) {
  return { id: String(get(channel, keyword("id"), null)), kind: String(get(channel, keyword("kind"), null)), mode: String(get(channel, keyword("mode"), null)), count: get(channel, keyword("count"), null), updatedAt: get(channel, keyword("updated-at"), null), binding: String(channel_binding_text(channel)), items: canonical_items(get(channel, keyword("items"), vector())) };
}
function channel_binding_text(channel) {
  return ((binding) => {
    return __eliscript_truthy20(binding === null) ? "" : String(get(binding, keyword("repository"), "")) + String("#") + String(get(binding, keyword("number"), null));
  })(get(channel, keyword("binding"), null));
}
function canonical_items(items) {
  return ((result, index) => {
    (() => {
      while (__eliscript_truthy20(index < count(items))) {
        ((item) => {
          return result["push"]({ id: String(get(item, keyword("id"), null)), author: String(get(get(item, keyword("author"), hashMap()), keyword("login"), "")), body: get(item, keyword("body"), ""), createdAt: get(item, keyword("created-at"), null), updatedAt: get(item, keyword("updated-at"), null), replies: canonical_items(get(item, keyword("replies"), vector())) });
        })(nth(items, index));
        index = index + 1;
      }
      return null;
    })();
    return result;
  })([], 0);
}
function canonical_post(post) {
  return { id: post["id"], slug: post["slug"], title: post["title"], summary: post["summary"], body: post["body"], publishedAt: post["published-at"], updatedAt: post["updated-at"], authors: values__GT_array(post["authors"]), tags: values__GT_array(post["tags"]), cover: post["cover"] ?? null, draft: post["draft"], pinnedWeight: post["pinned-weight"], provenance: { provider: get(post["provenance"], keyword("provider"), ""), path: get(post["provenance"], keyword("path"), "") }, aliases: values__GT_array(post["aliases"]), channels: channels__GT_array(post["comment-channels"]) };
}
function channels__GT_array(channels) {
  return ((result, index) => {
    (() => {
      while (__eliscript_truthy20(index < count(channels))) {
        result["push"](canonical_channel(nth(channels, index)));
        index = index + 1;
      }
      return null;
    })();
    return result;
  })([], 0);
}
function values__GT_array(values) {
  return ((result, index) => {
    (() => {
      while (__eliscript_truthy20(index < count(values))) {
        result["push"](nth(values, index));
        index = index + 1;
      }
      return null;
    })();
    return result;
  })([], 0);
}
function publishable_inputs(config, site, posts, browser_text, renderer) {
  return { site: { title: get(site, keyword("title"), ""), baseUrl: get(site, keyword("base-url"), ""), language: get(site, keyword("language"), ""), theme: String(get(site, keyword("theme"), keyword("system"))), preview: get(site, keyword("preview"), false) }, presentation: String(get(get(config, keyword("comments"), hashMap()), keyword("presentation"), keyword("tabs"))), posts: posts__GT_array(posts), browserAsset: digest_of_text(browser_text), renderer: renderer_digest(renderer) };
}
function posts__GT_array(posts) {
  return ((result, index) => {
    (() => {
      while (__eliscript_truthy20(index < count(posts))) {
        result["push"](canonical_post(nth(posts, index)));
        index = index + 1;
      }
      return null;
    })();
    return result;
  })([], 0);
}
function digest_of_text(text) {
  return import_node_crypto.createHash("sha256")["update"](text)["digest"]("hex");
}
function renderer_module_path() {
  return ((entry) => {
    return ((sibling) => {
      return __eliscript_truthy20(import_node_fs3.existsSync(sibling)) ? sibling : entry;
    })(Path2.join(Path2.dirname(entry), "../renderer/server.mjs"));
  })(program_arguments[1] ?? "");
}
function renderer_digest() {
  return ((path) => {
    return __eliscript_truthy20(import_node_fs3.existsSync(path)) ? digest_of_text(import_node_fs3.readFileSync(path, "utf8")) : "unknown";
  })(renderer_module_path());
}
function input_digest(inputs) {
  return digest_of_text(JSON.stringify(inputs));
}
function no_change_policy(config) {
  return get(get(config, keyword("refresh"), hashMap()), keyword("no-change"), keyword("skip"));
}
function report_no_change(output, posts, inputs) {
  ((count2) => {
    console.log(String("dogfood: no change; ") + String(count2) + String(" published posts produce the fingerprint already on disk"));
    console.log(String("dogfood: output ") + String(output));
    console.log(String("dogfood: fingerprint ") + String(inputs));
    set_output("built", "false");
    set_output("reason", "no-change");
    set_output("content-fingerprint", inputs);
    set_output("output-directory", output);
    set_output("post-count", String(count2));
    set_output("comment-snapshot-count", String(snapshot_count(posts)));
    return set_output("manifest", Path2.join(output, "_dogfood/build.json"));
  })(count(posts));
  return inputs;
}
function previous_input_digest(output) {
  return ((manifest) => {
    return __eliscript_truthy20(import_node_fs3.existsSync(manifest)) ? get(JSON.parse(import_node_fs3.readFileSync(manifest, "utf8")), "inputDigest", null) : null;
  })(Path2.join(output, "_dogfood/build.json"));
}
function fingerprint(documents) {
  return ((hash, index) => {
    (() => {
      while (__eliscript_truthy20(index < count(documents))) {
        ((document2) => {
          hash["update"](get(document2, keyword("path")));
          hash["update"](`
`);
          hash["update"](get(document2, keyword("content")));
          return hash["update"](`
`);
        })(nth(documents, index));
        index = index + 1;
      }
      return null;
    })();
    return hash["digest"]("hex");
  })(import_node_crypto.createHash("sha256"), 0);
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
  return __eliscript_truthy20(!__eliscript_truthy20(previous_manifest === null)) ? ((expected_path) => {
    return ((current_path) => {
      return ((current) => {
        return ((expected) => {
          return __eliscript_truthy20(current === null) ? null : __eliscript_truthy20(expected === null) ? fail2("DOGFOOD-BUILD-005", String("previous manifest is missing or unreadable: ") + String(expected_path)) : __eliscript_truthy20(!__eliscript_truthy20(current === expected)) ? fail2("DOGFOOD-BUILD-004", String("output ") + String(output) + String(" was not produced by the recorded build: ") + String(String(current)) + String(" does not match ") + String(String(expected))) : null;
        })(__eliscript_truthy20(import_node_fs3.existsSync(expected_path)) ? manifest_fingerprint(expected_path) : null);
      })(__eliscript_truthy20(import_node_fs3.existsSync(current_path)) ? manifest_fingerprint(current_path) : null);
    })(Path2.join(output, "_dogfood/build.json"));
  })(absolute_path(".", previous_manifest)) : null;
}
function publish(staging, output) {
  return ((backup) => {
    __eliscript_truthy20(import_node_fs3.existsSync(backup)) && import_node_fs3.rmSync(backup, { recursive: true, force: true });
    __eliscript_truthy20(import_node_fs3.existsSync(output)) && import_node_fs3.renameSync(output, backup);
    (() => {
      try {
        return import_node_fs3.renameSync(staging, output);
      } catch (error) {
        __eliscript_truthy20(import_node_fs3.existsSync(backup)) && import_node_fs3.renameSync(backup, output);
        return ((__eliscript_value_5) => {
          throw __eliscript_value_5;
        })(error);
      }
    })();
    return __eliscript_truthy20(import_node_fs3.existsSync(backup)) ? import_node_fs3.rmSync(backup, { recursive: true, force: true }) : null;
  })(String(output) + String(".backup"));
}
function publishable_QMARK_(post, preview) {
  return ((__eliscript_value_6) => __eliscript_truthy20(__eliscript_value_6) ? __eliscript_value_6 : !__eliscript_truthy20(post["draft"]))(preview);
}
function preview_site(site) {
  return assoc(site, keyword("preview"), true);
}
function defined_values(values) {
  return ((result, index) => {
    (() => {
      while (__eliscript_truthy20(index < count(values))) {
        ((value) => {
          return __eliscript_truthy20(!__eliscript_truthy20(value === null)) ? result = conj(result, value) : null;
        })(nth(values, index));
        index = index + 1;
      }
      return null;
    })();
    return result;
  })(vector(), 0);
}
function browser_bundle_candidates(root, override) {
  return ((from_entry) => {
    return defined_values(vector(override, env_value("DOGFOOD_BROWSER_BUNDLE"), String(root) + String("/dist/site/browser.js"), from_entry));
  })(String(Path2.dirname(program_arguments[1] ?? ".")) + String("/../site/browser.js"));
}
function browser_bundle(root, override) {
  return ((candidates, index, found) => {
    (() => {
      while (__eliscript_truthy20(((__eliscript_value_7) => __eliscript_truthy20(__eliscript_value_7) ? found === null : __eliscript_value_7)(index < count(candidates)))) {
        ((candidate) => {
          return __eliscript_truthy20(((__eliscript_value_8) => __eliscript_truthy20(__eliscript_value_8) ? import_node_fs3.existsSync(candidate) : __eliscript_value_8)(!__eliscript_truthy20(candidate === null))) ? found = candidate : null;
        })(nth(candidates, index));
        index = index + 1;
      }
      return null;
    })();
    return __eliscript_truthy20(found === null) ? fail2("DOGFOOD-BUILD-003", String("browser bundle not found; looked in ") + String(join(", ", candidates))) : import_node_fs3.readFileSync(found, "utf8");
  })(browser_bundle_candidates(root, override), 0, null);
}
function append_all4(target, values) {
  return reduce(values, (accumulator, value) => {
    return conj(accumulator, value);
  }, target);
}
function request_headers(token) {
  return __eliscript_truthy20(token === null) ? { accept: "application/vnd.github+json", "user-agent": "dogfood" } : { accept: "application/vnd.github+json", "user-agent": "dogfood", authorization: String("Bearer ") + String(token) };
}
function request_field(request, name, fallback) {
  return __eliscript_truthy20(isMap(request)) ? get(request, keyword(name), fallback) : ((value) => {
    return __eliscript_truthy20(value === undefined) ? fallback : value;
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
                __eliscript_truthy20(blank_QMARK_(url)) && fail2("DOGFOOD-GITHUB-002", "a provider request carried no URL");
                __eliscript_truthy20(!__eliscript_truthy20(body === null)) && (init["body"] = body);
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
          })(__eliscript_truthy20(plain) ? null : request_field(request, "body", null));
        })(__eliscript_truthy20(plain) ? "GET" : request_field(request, "method", "GET"));
      })(__eliscript_truthy20(plain) ? request : request_field(request, "url", ""));
    })(string_value_QMARK_(request));
  })(first_value(env_value("GITHUB_TOKEN"), action_input("github-token")));
}
function set_output(name, value) {
  return ((destination) => {
    return __eliscript_truthy20(!__eliscript_truthy20(destination === null)) ? import_node_fs3.appendFileSync(destination, String(name) + String("=") + String(value) + String(`
`)) : null;
  })(env_value("GITHUB_OUTPUT"));
}
function report(output, documents, posts, reason, fingerprint_value, inputs) {
  return ((post_count) => {
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
  })(count(posts));
}
function output_directory_of(root, config, override) {
  return Path2.join(root, __eliscript_truthy20(override === null) ? get(get(config, keyword("output")), keyword("directory"), "_site") : override);
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
    })(__eliscript_truthy20(preview) ? preview_site(get(config, keyword("site"))) : get(config, keyword("site")));
  })(load_config(config_path));
}
async function collect_sources(root, config, sources) {
  return await (async (collected, carriers, unauthorized, index) => {
    await (async () => {
      while (__eliscript_truthy20(index < count(sources))) {
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
  return ((collected_posts) => {
    return ((carriers) => {
      return ((unauthorized) => {
        return ((posts) => {
          return ((bundle) => {
            return ((inputs) => {
              return (() => {
                check_identity(posts);
                return __eliscript_truthy20(unchanged_inputs_QMARK_(config, output, inputs, reason)) ? report_no_change(output, posts, inputs) : render_and_publish(output, staging, config, site, posts, bundle, inputs, carriers, unauthorized, reason);
              })();
            })(input_digest(publishable_inputs(config, site, posts, bundle, renderer_digest())));
          })(browser_bundle(root, browser_override));
        })(sort_posts(attach_configured_channels(config, filter((post) => {
          return publishable_QMARK_(post, preview);
        }, resolve_identity(config, collected_posts)))));
      })(get(collected, keyword("unauthorized"), 0));
    })(get(collected, keyword("carriers"), 0));
  })(get(collected, keyword("posts"), vector()));
}
function unchanged_inputs_QMARK_(config, output, inputs, reason) {
  return ((__eliscript_value_9) => __eliscript_truthy20(__eliscript_value_9) ? ((__eliscript_value_10) => __eliscript_truthy20(__eliscript_value_10) ? inputs === previous_input_digest(output) : __eliscript_value_10)(!__eliscript_truthy20(reason === "forced")) : __eliscript_value_9)(no_change_policy(config) === keyword("skip"));
}
function render_and_publish(output, staging, config, site, posts, bundle, inputs, carriers, unauthorized, reason) {
  return ((documents) => {
    return ((digest) => {
      return ((index) => {
        return (() => {
          prepare_staging(staging);
          (() => {
            while (__eliscript_truthy20(index < count(documents))) {
              write_document(staging, nth(documents, index));
              index = index + 1;
            }
            return null;
          })();
          write_manifests(staging, documents, posts, config, carriers, unauthorized, inputs);
          publish(staging, output);
          report(output, documents, posts, reason, digest, inputs);
          return digest;
        })();
      })(0);
    })(fingerprint(documents));
  })(conj(render_site(site, posts), hashMap(keyword("path"), "assets/browser.js", keyword("content"), bundle)));
}
function keyword_name(value) {
  return ((text) => {
    return ((size) => {
      return __eliscript_truthy20(((__eliscript_value_11) => __eliscript_truthy20(__eliscript_value_11) ? text.charCodeAt(0) === 58 : __eliscript_value_11)(size > 0)) ? slice(1, size, text) : text;
    })(text_length(text));
  })(String(value));
}
function skip(decision) {
  return ((detail) => {
    console.log(String("dogfood: skipped; ") + String(detail));
    set_output("built", "false");
    set_output("reason", "skipped");
    return set_output("subject", "articles");
  })(get(decision, keyword("detail"), ""));
}
function defer(decision) {
  return ((subject, event) => {
    console.log(String("dogfood: deferred; ") + String(subject) + String(" event ") + String(__eliscript_truthy20(event === "") ? "(none)" : event) + String(" cannot change the site"));
    set_output("built", "false");
    set_output("reason", "deferred");
    return set_output("subject", subject);
  })(keyword_name(get(decision, keyword("subject"), keyword("unknown"))), String(get(decision, keyword("event"), "")));
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
                                  return __eliscript_truthy20(!__eliscript_truthy20(get(decision, keyword("build"), null))) ? defer(decision) : await (async (preflight) => {
                                    return __eliscript_truthy20(get(preflight, keyword("skip"), false)) ? skip(preflight) : await (async () => {
                                      verify_previous_manifest(previous_manifest, output_directory_of(root, config, output_override));
                                      return await build_site(root, config_path, output_override, browser_override, preview, get(decision, keyword("reason"), "changed"));
                                    })();
                                  })(skip_decision(config, classification2));
                                })(build_decision(config, classification2, forced));
                              })(load_config(config_path));
                            })(__eliscript_truthy20(event_file === null) ? requested_event() : classify_event(first_value(env_value("GITHUB_EVENT_NAME"), "workflow_dispatch"), JSON.parse(import_node_fs3.readFileSync(absolute_path(root, event_file), "utf8"))));
                          } catch (error) {
                            console.log(String("dogfood: ") + String(error["code"] ?? "DOGFOOD") + String(": ") + String(error["message"]));
                            set_output("built", "false");
                            set_output("reason", "failed");
                            return set_exit_code(1);
                          }
                        })();
                      })(first_value(option_value(arguments$, "--previous-manifest", null), action_input("previous-manifest")));
                    })(first_value(option_value(arguments$, "--event-file", null), first_value(action_input("event-file"), env_value("GITHUB_EVENT_PATH"))));
                  })(((__eliscript_value_13) => __eliscript_truthy20(__eliscript_value_13) ? __eliscript_value_13 : truthy_input_QMARK_(action_input("preview")))(flag_present_QMARK_(arguments$, "--preview")));
                })(option_value(arguments$, "--browser-bundle", null));
              })(((__eliscript_value_12) => __eliscript_truthy20(__eliscript_value_12) ? __eliscript_value_12 : truthy_input_QMARK_(action_input("force")))(flag_present_QMARK_(arguments$, "--force")));
            })(first_value(option_value(arguments$, "--output", null), action_input("output-directory")));
          })(absolute_path(root, config_file));
        })(__eliscript_truthy20(config_input === null) ? "dogfood.config.eli" : config_input);
      })(first_value(option_value(arguments$, "--config", null), action_input("config-file")));
    })(option_value(arguments$, "--root", first_value(env_value("GITHUB_WORKSPACE"), ".")));
  })(program_arguments);
}
main();

//# debugId=907557D3AC0B179E64756E2164756E21
