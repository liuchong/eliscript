import { sourceMappedFailure } from "../runtime/source-mapping.mjs";

export const browserCapabilityKinds = Object.freeze([
  "clock",
  "document",
  "network",
  "randomness",
  "timers",
]);

const capabilityState = new WeakMap();
const knownCapabilities = new Set(browserCapabilityKinds);

export class BrowserCapabilityError extends Error {
  constructor(code, message, capability) {
    super(message);
    this.name = "BrowserCapabilityError";
    this.code = code;
    this.capability = capability;
  }
}

function fail(code, message, capability) {
  throw new BrowserCapabilityError(code, message, capability);
}

function normalizeGrants(grants) {
  if (!Array.isArray(grants) || grants.some(
    (grant) => typeof grant !== "string" || grant.length === 0,
  )) {
    fail("invalid-grants", "browser grants must be an array of non-empty strings");
  }
  const normalized = [...new Set(grants)].sort();
  if (normalized.length !== grants.length) {
    fail("duplicate-grant", "browser grants must not contain duplicates");
  }
  for (const grant of normalized) {
    if (!knownCapabilities.has(grant)) {
      fail("unknown-grant", `unknown browser capability ${grant}`, grant);
    }
  }
  return normalized;
}

function requireFunction(receiver, name, capability) {
  const operation = receiver?.[name];
  if (typeof operation !== "function") {
    fail(
      "unavailable-capability",
      `browser host does not provide ${capability}`,
      capability,
    );
  }
  return (...arguments_) => Reflect.apply(operation, receiver, arguments_);
}

function operationTable(scope, grants) {
  const operations = Object.create(null);
  for (const grant of grants) {
    switch (grant) {
      case "clock":
        operations.clock = requireFunction(scope.performance, "now", grant);
        break;
      case "document":
        {
          const document = scope.document;
          if (document === null || typeof document !== "object") {
            fail(
              "unavailable-capability",
              "browser host does not provide document",
              grant,
            );
          }
          operations.document = () => document;
        }
        break;
      case "network":
        operations.network = requireFunction(scope, "fetch", grant);
        break;
      case "randomness":
        operations.randomness = requireFunction(
          scope.crypto,
          "getRandomValues",
          grant,
        );
        break;
      case "timers":
        operations.setTimeout = requireFunction(scope, "setTimeout", grant);
        operations.clearTimeout = requireFunction(scope, "clearTimeout", grant);
        break;
    }
  }
  return Object.freeze(operations);
}

export function browserCapabilities(scope, grants = []) {
  if (scope === null || (typeof scope !== "object" && typeof scope !== "function")) {
    fail("invalid-host", "browser host must be an object or function");
  }
  const normalized = normalizeGrants(grants);
  const capabilities = Object.freeze({
    format: "eliscript-browser-capabilities",
    version: 1,
    grants: Object.freeze(normalized),
  });
  capabilityState.set(capabilities, operationTable(scope, normalized));
  return capabilities;
}

export function isBrowserCapabilities(value) {
  return value !== null && typeof value === "object" && capabilityState.has(value);
}

function stateFor(capabilities) {
  const state = isBrowserCapabilities(capabilities)
    ? capabilityState.get(capabilities)
    : undefined;
  if (state === undefined) {
    fail("invalid-capabilities", "expected Eliscript browser capabilities");
  }
  return state;
}

export function browserCapabilityDescriptor(capabilities) {
  stateFor(capabilities);
  return Object.freeze({
    format: capabilities.format,
    version: capabilities.version,
    grants: Object.freeze([...capabilities.grants]),
  });
}

export function hasBrowserCapability(capabilities, capability) {
  stateFor(capabilities);
  return typeof capability === "string" && capabilities.grants.includes(capability);
}

function operationFor(capabilities, operation, capability = operation) {
  const operation_ = stateFor(capabilities)[operation];
  if (operation_ === undefined) {
    fail(
      "missing-capability",
      `browser capability ${capability} was not granted`,
      capability,
    );
  }
  return operation_;
}

export function browserDocument(capabilities) {
  return operationFor(capabilities, "document")();
}

export function browserFetch(capabilities, input, init) {
  return operationFor(capabilities, "network")(input, init);
}

export function browserNow(capabilities) {
  return operationFor(capabilities, "clock")();
}

export function browserRandomValues(capabilities, values) {
  return operationFor(capabilities, "randomness")(values);
}

export function browserSetTimeout(capabilities, callback, delay, ...arguments_) {
  return operationFor(capabilities, "setTimeout", "timers")(
    callback,
    delay,
    ...arguments_,
  );
}

export function browserClearTimeout(capabilities, handle) {
  return operationFor(capabilities, "clearTimeout", "timers")(handle);
}

export function browserEventBoundary(handler, report, sourceMaps = []) {
  if (typeof handler !== "function") {
    fail("invalid-event-handler", "browser event handler must be a function");
  }
  if (typeof report !== "function") {
    fail("invalid-event-reporter", "browser event reporter must be a function");
  }
  if (!Array.isArray(sourceMaps)) {
    fail("invalid-source-maps", "browser event source maps must be an array");
  }
  return function boundedBrowserEvent(...arguments_) {
    const reportFailure = (error) => {
      report(sourceMappedFailure(error, sourceMaps), arguments_[0]);
      return undefined;
    };
    try {
      const result = Reflect.apply(handler, this, arguments_);
      return result !== null &&
          (typeof result === "object" || typeof result === "function") &&
          typeof result.then === "function"
        ? Promise.resolve(result).catch(reportFailure)
        : result;
    } catch (error) {
      return reportFailure(error);
    }
  };
}
