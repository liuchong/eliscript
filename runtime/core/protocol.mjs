export { ProtocolDispatchError } from "./protocol-error.mjs";
export {
  define_protocol as defineProtocol,
  define_protocol_from_definition as defineProtocolFromDefinition,
  extend_protocol_category as extendProtocolCategory,
  extend_protocol_default as extendProtocolDefault,
  extend_protocol_type as extendProtocolType,
  implements_protocol_operation_QMARK_ as implementsProtocolOperation,
  implements_protocol_QMARK_ as implementsProtocol,
  protocol_definition as protocolDefinition,
  protocol_host_category as protocolHostCategory,
  protocol_method as protocolMethod,
  protocol_slot as protocolSlot,
} from "./protocol-impl.mjs";
