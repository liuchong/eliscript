export {
  WorkerValueCodecError,
  decodeWorkerValue,
  decodeWorkerValues,
  encodeWorkerValue,
  encodeWorkerValues,
  workerValueEncoding,
  workerValueLimits,
} from "../runtime/worker-value-codec.mjs";
export {
  WorkerValueStreamDecoder,
  WorkerValueStreamError,
  decodeWorkerValueChunks,
  encodeWorkerValueChunks,
  encodeWorkerValueEvents,
  workerValueFraming,
  workerValueStreamLimits,
} from "../runtime/worker-value-stream.mjs";

export const workerCapabilityKinds = Object.freeze([
  "cancellation",
  "progress",
]);

const capabilityState = new WeakMap();
const knownCapabilities = new Set(workerCapabilityKinds);

export class WorkerCapabilityError extends Error {
  constructor(code, message, capability) {
    super(message);
    this.name = "WorkerCapabilityError";
    this.code = code;
    this.capability = capability;
  }
}

function fail(code, message, capability) {
  throw new WorkerCapabilityError(code, message, capability);
}

function normalizeGrants(grants) {
  if (!Array.isArray(grants) || grants.some(
    (grant) => typeof grant !== "string" || grant.length === 0,
  )) {
    fail("invalid-grants", "worker grants must be an array of non-empty strings");
  }
  const normalized = [...new Set(grants)].sort();
  if (normalized.length !== grants.length) {
    fail("duplicate-grant", "worker grants must not contain duplicates");
  }
  for (const grant of normalized) {
    if (!knownCapabilities.has(grant)) {
      fail("unknown-grant", `unknown worker capability ${grant}`, grant);
    }
  }
  return normalized;
}

function operationTable(context, grants) {
  const operations = Object.create(null);
  for (const grant of grants) {
    if (grant === "progress") {
      if (typeof context.progress !== "function") {
        fail(
          "unavailable-capability",
          "worker context does not provide progress",
          grant,
        );
      }
      operations.progress = (value) => Reflect.apply(
        context.progress,
        context,
        [value],
      );
    } else if (grant === "cancellation") {
      const signal = context.signal;
      if (signal === null || typeof signal !== "object" ||
          typeof signal.aborted !== "boolean" ||
          typeof signal.addEventListener !== "function") {
        fail(
          "unavailable-capability",
          "worker context does not provide an AbortSignal",
          grant,
        );
      }
      operations.signal = () => signal;
    }
  }
  return Object.freeze(operations);
}

export function workerCapabilities(context, grants = []) {
  if (context === null || typeof context !== "object") {
    fail("invalid-host", "worker context must be an object");
  }
  const normalized = normalizeGrants(grants);
  const capabilities = Object.freeze({
    format: "eliscript-worker-capabilities",
    version: 1,
    grants: Object.freeze(normalized),
  });
  capabilityState.set(capabilities, operationTable(context, normalized));
  return capabilities;
}

export function isWorkerCapabilities(value) {
  return value !== null && typeof value === "object" && capabilityState.has(value);
}

function stateFor(capabilities) {
  const state = isWorkerCapabilities(capabilities)
    ? capabilityState.get(capabilities)
    : undefined;
  if (state === undefined) {
    fail("invalid-capabilities", "expected Eliscript worker capabilities");
  }
  return state;
}

export function workerCapabilityDescriptor(capabilities) {
  stateFor(capabilities);
  return Object.freeze({
    format: capabilities.format,
    version: capabilities.version,
    grants: Object.freeze([...capabilities.grants]),
  });
}

export function hasWorkerCapability(capabilities, capability) {
  stateFor(capabilities);
  return typeof capability === "string" && capabilities.grants.includes(capability);
}

function operationFor(capabilities, operation, capability) {
  const operation_ = stateFor(capabilities)[operation];
  if (operation_ === undefined) {
    fail(
      "missing-capability",
      `worker capability ${capability} was not granted`,
      capability,
    );
  }
  return operation_;
}

export function workerProgress(capabilities, value) {
  return operationFor(capabilities, "progress", "progress")(value);
}

export function workerSignal(capabilities) {
  return operationFor(capabilities, "signal", "cancellation")();
}

export function workerCancelled(capabilities) {
  return workerSignal(capabilities).aborted;
}

export function throwIfWorkerCancelled(capabilities) {
  if (workerCancelled(capabilities)) {
    fail(
      "worker-cancelled",
      "worker operation has been cancelled",
      "cancellation",
    );
  }
}
