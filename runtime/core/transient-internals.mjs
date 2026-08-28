import {
  defineProtocol,
  protocolMethod,
  protocolSlot,
} from "./protocol.mjs";

export const I_EDITABLE = defineProtocol("IEditable", ["transient"]);
export const I_TRANSIENT_COLLECTION = defineProtocol(
  "ITransientCollection",
  ["conj!", "assoc!", "dissoc!", "persistent!"],
);

export const EDITABLE_TRANSIENT = protocolSlot(I_EDITABLE, "transient");
export const TRANSIENT_CONJ = protocolSlot(I_TRANSIENT_COLLECTION, "conj!");
export const TRANSIENT_ASSOC = protocolSlot(I_TRANSIENT_COLLECTION, "assoc!");
export const TRANSIENT_DISSOC = protocolSlot(I_TRANSIENT_COLLECTION, "dissoc!");
export const TRANSIENT_PERSISTENT = protocolSlot(
  I_TRANSIENT_COLLECTION,
  "persistent!",
);

export const dispatchEditableTransient = protocolMethod(I_EDITABLE, "transient");
export const dispatchTransientConj = protocolMethod(
  I_TRANSIENT_COLLECTION,
  "conj!",
);
export const dispatchTransientAssoc = protocolMethod(
  I_TRANSIENT_COLLECTION,
  "assoc!",
);
export const dispatchTransientDissoc = protocolMethod(
  I_TRANSIENT_COLLECTION,
  "dissoc!",
);
export const dispatchTransientPersistent = protocolMethod(
  I_TRANSIENT_COLLECTION,
  "persistent!",
);
