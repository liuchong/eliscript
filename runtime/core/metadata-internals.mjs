import {
  defineProtocol,
  protocolMethod,
  protocolSlot,
} from "./protocol.mjs";

export const I_META = defineProtocol("IMeta", ["meta"]);
export const I_WITH_META = defineProtocol("IWithMeta", ["withMeta"]);

export const METADATA_READ = protocolSlot(I_META, "meta");
export const METADATA_WITH = protocolSlot(I_WITH_META, "withMeta");

export const dispatchMetadataRead = protocolMethod(I_META, "meta");
export const dispatchMetadataWith = protocolMethod(I_WITH_META, "withMeta");
