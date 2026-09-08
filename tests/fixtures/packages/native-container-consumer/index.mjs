export const packageName = "@eliscript-fixtures/native-container-consumer";

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

function requireNative(condition, message) {
  if (!condition) throw new TypeError(message);
}

export function consumeNativeOptions(options) {
  requireNative(isPlainObject(options), "options must be a plain object");
  requireNative(Array.isArray(options.children), "children must be an Array");
  requireNative(options.settings instanceof Map, "settings must be a Map");
  requireNative(options.tags instanceof Set, "tags must be a Set");

  const beforeMutation = {
    title: options.title,
    children: [...options.children],
    ready: options.settings.get("ready"),
    tags: [...options.tags].sort(),
  };

  options.children.push("package-added");
  options.settings.set("package-added", true);
  options.tags.add("package-added");

  return {
    packageName,
    nativeCategories: {
      options: isPlainObject(options),
      children: Array.isArray(options.children),
      settings: options.settings instanceof Map,
      tags: options.tags instanceof Set,
    },
    beforeMutation,
    afterMutation: {
      children: [...options.children],
      settingAdded: options.settings.get("package-added"),
      tags: [...options.tags].sort(),
    },
  };
}
