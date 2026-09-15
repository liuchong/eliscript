(() => {
  // platform/browser.mjs
  var browserCapabilityKinds = Object.freeze([
    "clock",
    "document",
    "network",
    "randomness",
    "timers"
  ]);
  var capabilityState = new WeakMap;
  var knownCapabilities = new Set(browserCapabilityKinds);

  class BrowserCapabilityError extends Error {
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
    if (!Array.isArray(grants) || grants.some((grant) => typeof grant !== "string" || grant.length === 0)) {
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
      fail("unavailable-capability", `browser host does not provide ${capability}`, capability);
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
              fail("unavailable-capability", "browser host does not provide document", grant);
            }
            operations.document = () => document;
          }
          break;
        case "network":
          operations.network = requireFunction(scope, "fetch", grant);
          break;
        case "randomness":
          operations.randomness = requireFunction(scope.crypto, "getRandomValues", grant);
          break;
        case "timers":
          operations.setTimeout = requireFunction(scope, "setTimeout", grant);
          operations.clearTimeout = requireFunction(scope, "clearTimeout", grant);
          break;
      }
    }
    return Object.freeze(operations);
  }
  function browserCapabilities(scope, grants = []) {
    if (scope === null || typeof scope !== "object" && typeof scope !== "function") {
      fail("invalid-host", "browser host must be an object or function");
    }
    const normalized = normalizeGrants(grants);
    const capabilities = Object.freeze({
      format: "eliscript-browser-capabilities",
      version: 1,
      grants: Object.freeze(normalized)
    });
    capabilityState.set(capabilities, operationTable(scope, normalized));
    return capabilities;
  }
  function isBrowserCapabilities(value) {
    return value !== null && typeof value === "object" && capabilityState.has(value);
  }
  function stateFor(capabilities) {
    const state = isBrowserCapabilities(capabilities) ? capabilityState.get(capabilities) : undefined;
    if (state === undefined) {
      fail("invalid-capabilities", "expected Eliscript browser capabilities");
    }
    return state;
  }
  function operationFor(capabilities, operation, capability = operation) {
    const operation_ = stateFor(capabilities)[operation];
    if (operation_ === undefined) {
      fail("missing-capability", `browser capability ${capability} was not granted`, capability);
    }
    return operation_;
  }
  function browserDocument(capabilities) {
    return operationFor(capabilities, "document")();
  }
  function browserSetTimeout(capabilities, callback, delay, ...arguments_) {
    return operationFor(capabilities, "setTimeout", "timers")(callback, delay, ...arguments_);
  }

  // examples/dogfood/dist/dogfood-browser/src/renderer/browser.mjs
  var __eliscript_truthy = (value) => value !== false && value != null;
  function to_lowercase(text) {
    return text["toLowerCase"]();
  }
  function trim_text(text) {
    return text["trim"]();
  }
  function contains_QMARK_(needle, text) {
    return text["includes"](needle);
  }
  function blank_QMARK_(text) {
    return (trim_text(text) ?? []).length === 0;
  }
  function split_on(separator, text) {
    return text["split"](separator);
  }
  var theme_key = "dogfood-theme";
  var result_limit = 25;
  var search_delay = 80;
  var storage = typeof localStorage === "undefined" ? null : localStorage;
  var capabilities = browserCapabilities(globalThis, ["document", "network", "timers"]);
  var page = browserDocument(capabilities);
  var index_value = null;
  function node(id) {
    return page["getElementById"](id);
  }
  function root() {
    return page["documentElement"];
  }
  function meta_content(name) {
    return ((element) => {
      return __eliscript_truthy(element === null) ? "" : element["content"] ?? "";
    })(page["querySelector"](String('meta[name="') + String(name) + String('"]')));
  }
  function stored_theme() {
    return __eliscript_truthy(storage === null) ? "system" : ((value) => {
      return __eliscript_truthy(((__eliscript_value_1) => __eliscript_truthy(__eliscript_value_1) ? __eliscript_value_1 : value === "")(value === null)) ? "system" : value;
    })(storage["getItem"](theme_key));
  }
  function apply_theme(name) {
    return __eliscript_truthy(name === "system") ? root()["removeAttribute"]("data-theme") : root()["setAttribute"]("data-theme", name);
  }
  function next_theme(name) {
    return __eliscript_truthy(name === "system") ? "light" : __eliscript_truthy(name === "light") ? "dark" : "system";
  }
  function remember_theme(name) {
    return __eliscript_truthy(!__eliscript_truthy(storage === null)) ? storage["setItem"](theme_key, name) : null;
  }
  function label_theme(name) {
    return ((button) => {
      return __eliscript_truthy(!__eliscript_truthy(button === null)) ? (() => {
        button["textContent"] = String("Theme: ") + String(name);
        return button["setAttribute"]("aria-label", String("Theme ") + String(name) + String(", switch to ") + String(next_theme(name)));
      })() : null;
    })(node("theme-toggle"));
  }
  function toggle_theme() {
    return ((next) => {
      remember_theme(next);
      apply_theme(next);
      return label_theme(next);
    })(next_theme(stored_theme()));
  }
  async function load_index() {
    __eliscript_truthy(index_value === null) && await (async (url) => {
      return await (async (response) => {
        return await (async () => {
          __eliscript_truthy(!__eliscript_truthy(response["ok"] ?? false)) && ((__eliscript_value_2) => {
            throw __eliscript_value_2;
          })(new globalThis.Error(String("search index unavailable: ") + String(url)));
          return index_value = await response["json"]();
        })();
      })(await globalThis["fetch"](url));
    })(meta_content("dogfood-search-index"));
    return index_value;
  }
  function entry_haystack(entry) {
    return to_lowercase(String(entry["title"] ?? "") + String(" ") + String(entry["summary"] ?? "") + String(" ") + String(entry["text"] ?? "") + String(" ") + String([]["concat"](entry["tags"] ?? [])));
  }
  function matches_QMARK_(entry, query) {
    return ((haystack, terms, index, found) => {
      (() => {
        while (__eliscript_truthy(index < (terms ?? []).length)) {
          ((term) => {
            return __eliscript_truthy(((__eliscript_value_3) => __eliscript_truthy(__eliscript_value_3) ? !__eliscript_truthy(contains_QMARK_(term, haystack)) : __eliscript_value_3)(!__eliscript_truthy(blank_QMARK_(term)))) ? found = false : null;
          })(trim_text((terms ?? [])[index] ?? null));
          index = index + 1;
        }
        return null;
      })();
      return found;
    })(entry_haystack(entry), split_on(" ", query), 0, true);
  }
  function matching_entries(entries, query) {
    return ((results, index) => {
      (() => {
        while (__eliscript_truthy(((__eliscript_value_4) => __eliscript_truthy(__eliscript_value_4) ? (results ?? []).length < result_limit : __eliscript_value_4)(index < (entries ?? []).length))) {
          ((entry) => {
            return __eliscript_truthy(matches_QMARK_(entry, query)) ? results["push"](entry) : null;
          })((entries ?? [])[index] ?? null);
          index = index + 1;
        }
        return null;
      })();
      return results;
    })([], 0);
  }
  function escape_text(text) {
    return ((element) => {
      element["textContent"] = text;
      return element["innerHTML"] ?? "";
    })(page["createElement"]("span"));
  }
  function render_entry(entry) {
    return String('<li><a class="title" href="') + String(escape_text(entry["url"] ?? "")) + String('">') + String(escape_text(entry["title"] ?? "")) + String("</a>") + String('<p class="summary">') + String(escape_text(entry["summary"] ?? "")) + String("</p></li>");
  }
  function render_results(entries, query) {
    return ((container) => {
      return __eliscript_truthy(!__eliscript_truthy(container === null)) ? __eliscript_truthy(blank_QMARK_(query)) ? container["innerHTML"] = "" : ((count_value) => {
        return container["innerHTML"] = String('<p class="comment-note">') + String(count_value) + String(__eliscript_truthy(count_value === 1) ? " result" : " results") + String(' for "') + String(escape_text(query)) + String('"</p>') + String(__eliscript_truthy(count_value === 0) ? '<p class="empty">No article matches.</p>' : ((markup, index) => {
          (() => {
            while (__eliscript_truthy(index < count_value)) {
              markup = String(markup) + String(render_entry((entries ?? [])[index] ?? null));
              index = index + 1;
            }
            return null;
          })();
          return String(markup) + String("</ul>");
        })('<ul class="list">', 0));
      })((entries ?? []).length) : null;
    })(node("search-results"));
  }
  function read_query() {
    return ((parameters) => {
      return parameters["get"]("q");
    })(new globalThis.URLSearchParams(globalThis.location["search"]));
  }
  function query_value() {
    return ((element) => {
      return __eliscript_truthy(element === null) ? "" : ((value) => {
        return __eliscript_truthy(value === null) ? ((__eliscript_value_5) => __eliscript_truthy(__eliscript_value_5) ? __eliscript_value_5 : "")(read_query()) : value;
      })(element["value"] ?? null);
    })(node("search-input"));
  }
  function search_once() {
    return run_search()["catch"]((error) => {
      return ((container) => {
        return __eliscript_truthy(!__eliscript_truthy(container === null)) ? container["innerHTML"] = String('<p class="empty">') + String(escape_text(error["message"] ?? "")) + String("</p>") : null;
      })(node("search-results"));
    });
  }
  async function run_search() {
    return await (async (input) => {
      return __eliscript_truthy(!__eliscript_truthy(input === null)) ? await (async () => {
        input["value"] = query_value();
        return ((index) => {
          return ((entries) => {
            return (() => {
              render_results(matching_entries(entries, query_value()), query_value());
              return input["addEventListener"]("input", (event) => {
                return browserSetTimeout(capabilities, () => {
                  return render_results(matching_entries(entries, query_value()), query_value());
                }, search_delay);
              });
            })();
          })(index["entries"] ?? []);
        })(await load_index());
      })() : null;
    })(node("search-input"));
  }
  apply_theme(stored_theme());
  function on_ready() {
    ((button) => {
      return __eliscript_truthy(!__eliscript_truthy(button === null)) ? (() => {
        label_theme(stored_theme());
        return button["addEventListener"]("click", (event) => {
          event["preventDefault"]();
          return toggle_theme();
        });
      })() : null;
    })(node("theme-toggle"));
    return search_once();
  }
  __eliscript_truthy(globalThis.document["readyState"] === "loading") ? globalThis.document["addEventListener"]("DOMContentLoaded", (event) => {
    return on_ready();
  }) : on_ready();
})();
