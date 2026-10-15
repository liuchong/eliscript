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
            const document2 = scope.document;
            if (document2 === null || typeof document2 !== "object") {
              fail("unavailable-capability", "browser host does not provide document", grant);
            }
            operations.document = () => document2;
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
  var __eliscript_number_intrinsic = globalThis.Number;
  var __eliscript_bigint_intrinsic = globalThis.BigInt;
  var __eliscript_numeric_apply = globalThis.Reflect.apply;
  var __eliscript_numeric_symbol = globalThis.Symbol.toPrimitive;
  var __eliscript_numeric_error = globalThis.TypeError;
  var __eliscript_numeric_trim = globalThis.String.prototype.trim;
  var __eliscript_numeric_slice = globalThis.String.prototype.slice;
  var __eliscript_numeric_exec = globalThis.RegExp.prototype.exec;
  var __eliscript_numeric_radix = /^(?:0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+)$/;
  var __eliscript_numeric_object = (value) => value !== null && (typeof value === "object" || typeof value === "function" || typeof value === "undefined" && value !== undefined);
  var __eliscript_numeric_primitive = (value) => {
    if (!__eliscript_numeric_object(value))
      return value;
    const exotic = value[__eliscript_numeric_symbol];
    if (exotic !== undefined && exotic !== null) {
      const result = __eliscript_numeric_apply(exotic, value, ["number"]);
      if (!__eliscript_numeric_object(result))
        return result;
      throw new __eliscript_numeric_error("Cannot convert object to primitive value");
    }
    for (let index = 0;index < 2; index++) {
      const method = value[index === 0 ? "valueOf" : "toString"];
      if (typeof method === "function" || typeof method === "undefined" && method !== undefined) {
        const result = __eliscript_numeric_apply(method, value, []);
        if (!__eliscript_numeric_object(result))
          return result;
      }
    }
    throw new __eliscript_numeric_error("Cannot convert object to primitive value");
  };
  var __eliscript_to_number = (value) => {
    const primitive = __eliscript_numeric_primitive(value);
    if (typeof primitive === "string") {
      const text = __eliscript_numeric_apply(__eliscript_numeric_trim, primitive, []);
      if (__eliscript_numeric_apply(__eliscript_numeric_exec, __eliscript_numeric_radix, [text]) !== null) {
        let first = 2;
        while (first < text.length && text[first] === "0")
          first++;
        if (first === text.length)
          return 0;
        const prefix = text[1];
        const limit = prefix === "x" || prefix === "X" ? 256 : prefix === "b" || prefix === "B" ? 1024 : 342;
        if (text.length - first > limit)
          return 1 / 0;
        const token = __eliscript_numeric_apply(__eliscript_numeric_slice, text, [0, 2]) + __eliscript_numeric_apply(__eliscript_numeric_slice, text, [first]);
        return __eliscript_number_intrinsic(__eliscript_bigint_intrinsic(token));
      }
    }
    return __eliscript_number_intrinsic(primitive);
  };
  var __eliscript_numeric = (value) => {
    if (typeof value === "number" || typeof value === "bigint")
      return value;
    const primitive = __eliscript_numeric_primitive(value);
    if (typeof primitive === "number" || typeof primitive === "bigint")
      return primitive;
    return typeof primitive === "string" ? __eliscript_to_number(primitive) : +primitive;
  };
  var __eliscript_numeric_relation = (operator, left, right) => {
    if (typeof left === "number" && typeof right === "number") {
      if (operator === "<")
        return left < right;
      if (operator === "<=")
        return left <= right;
      if (operator === ">")
        return left > right;
      return left >= right;
    }
    let a = __eliscript_numeric_primitive(left);
    let b = __eliscript_numeric_primitive(right);
    const x = typeof a, y = typeof b;
    if (!(x === "string" && y === "string" || x === "bigint" && y === "string" || x === "string" && y === "bigint")) {
      a = __eliscript_numeric(a);
      b = __eliscript_numeric(b);
    }
    if (operator === "<")
      return a < b;
    if (operator === "<=")
      return a <= b;
    if (operator === ">")
      return a > b;
    return a >= b;
  };
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
    {
      const __eliscript_value_1 = page["querySelector"](String('meta[name="') + String(name) + String('"]'));
      {
        let element = __eliscript_value_1;
        if (element === null) {
          return "";
        } else {
          return element["content"] ?? "";
        }
      }
    }
  }
  function stored_theme() {
    if (storage === null) {
      return "system";
    } else {
      {
        const __eliscript_value_2 = storage["getItem"](theme_key);
        {
          let value = __eliscript_value_2;
          if (value === null || value === "") {
            return "system";
          } else {
            return value;
          }
        }
      }
    }
  }
  function apply_theme(name) {
    if (name === "system") {
      return root()["removeAttribute"]("data-theme");
    } else {
      return root()["setAttribute"]("data-theme", name);
    }
  }
  function next_theme(name) {
    if (name === "system") {
      return "light";
    } else {
      if (name === "light") {
        return "dark";
      } else {
        return "system";
      }
    }
  }
  function remember_theme(name) {
    if (!(storage === null)) {
      return storage["setItem"](theme_key, name);
    } else {
      return null;
    }
  }
  function label_theme(name) {
    {
      const __eliscript_value_3 = node("theme-toggle");
      {
        let button = __eliscript_value_3;
        if (!(button === null)) {
          button["textContent"] = String("Theme: ") + String(name);
          return button["setAttribute"]("aria-label", String("Theme ") + String(name) + String(", switch to ") + String(next_theme(name)));
        } else {
          return null;
        }
      }
    }
  }
  function toggle_theme() {
    {
      const __eliscript_value_4 = next_theme(stored_theme());
      {
        let next = __eliscript_value_4;
        remember_theme(next);
        apply_theme(next);
        return label_theme(next);
      }
    }
  }
  async function load_index() {
    index_value === null && await (async (url) => {
      return await (async (response) => {
        return await (async () => {
          if (!__eliscript_truthy(response["ok"] ?? false)) {
            ((__eliscript_value_5) => {
              throw __eliscript_value_5;
            })(new globalThis.Error(String("search index unavailable: ") + String(url)));
          }
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
    {
      const __eliscript_value_6 = entry_haystack(entry);
      const __eliscript_value_7 = split_on(" ", query);
      const __eliscript_value_8 = 0;
      const __eliscript_value_9 = true;
      {
        let haystack = __eliscript_value_6;
        let terms = __eliscript_value_7;
        let index = __eliscript_value_8;
        let found = __eliscript_value_9;
        while (__eliscript_numeric_relation("<", index, (terms ?? []).length)) {
          {
            const __eliscript_value_10 = trim_text((terms ?? [])[index] ?? null);
            {
              let term = __eliscript_value_10;
              if (!__eliscript_truthy(blank_QMARK_(term)) && !__eliscript_truthy(contains_QMARK_(term, haystack))) {
                found = false;
              }
            }
          }
          index = index + 1;
        }
        return found;
      }
    }
  }
  function matching_entries(entries, query) {
    {
      const __eliscript_value_11 = [];
      const __eliscript_value_12 = 0;
      {
        let results = __eliscript_value_11;
        let index = __eliscript_value_12;
        while (__eliscript_numeric_relation("<", index, (entries ?? []).length) && __eliscript_numeric_relation("<", (results ?? []).length, result_limit)) {
          {
            const __eliscript_value_13 = (entries ?? [])[index] ?? null;
            {
              let entry = __eliscript_value_13;
              if (__eliscript_truthy(matches_QMARK_(entry, query))) {
                results["push"](entry);
              }
            }
          }
          index = index + 1;
        }
        return results;
      }
    }
  }
  function escape_text(text) {
    {
      const __eliscript_value_14 = page["createElement"]("span");
      {
        let element = __eliscript_value_14;
        element["textContent"] = text;
        return element["innerHTML"] ?? "";
      }
    }
  }
  function render_entry(entry) {
    return String('<li><a class="title" href="') + String(escape_text(entry["url"] ?? "")) + String('">') + String(escape_text(entry["title"] ?? "")) + String("</a>") + String('<p class="summary">') + String(escape_text(entry["summary"] ?? "")) + String("</p></li>");
  }
  function render_results(entries, query) {
    {
      const __eliscript_value_15 = node("search-results");
      {
        let container = __eliscript_value_15;
        if (!(container === null)) {
          if (__eliscript_truthy(blank_QMARK_(query))) {
            return container["innerHTML"] = "";
          } else {
            {
              const __eliscript_value_16 = (entries ?? []).length;
              {
                let count_value = __eliscript_value_16;
                return container["innerHTML"] = String('<p class="comment-note">') + String(count_value) + String(count_value === 1 ? " result" : " results") + String(' for "') + String(escape_text(query)) + String('"</p>') + String(count_value === 0 ? '<p class="empty">No article matches.</p>' : ((markup, index) => {
                  while (__eliscript_numeric_relation("<", index, count_value)) {
                    markup = String(markup) + String(render_entry((entries ?? [])[index] ?? null));
                    index = index + 1;
                  }
                  return String(markup) + String("</ul>");
                })('<ul class="list">', 0));
              }
            }
          }
        } else {
          return null;
        }
      }
    }
  }
  function read_query() {
    {
      const __eliscript_value_17 = new globalThis.URLSearchParams(globalThis.location["search"]);
      {
        let parameters = __eliscript_value_17;
        return parameters["get"]("q");
      }
    }
  }
  function query_value() {
    {
      const __eliscript_value_18 = node("search-input");
      {
        let element = __eliscript_value_18;
        if (element === null) {
          return "";
        } else {
          {
            const __eliscript_value_19 = element["value"] ?? null;
            {
              let value = __eliscript_value_19;
              if (value === null) {
                return ((__eliscript_value_20) => __eliscript_truthy(__eliscript_value_20) ? __eliscript_value_20 : "")(read_query());
              } else {
                return value;
              }
            }
          }
        }
      }
    }
  }
  function search_once() {
    return run_search()["catch"]((error) => {
      {
        const __eliscript_value_21 = node("search-results");
        {
          let container = __eliscript_value_21;
          if (!(container === null)) {
            return container["innerHTML"] = String('<p class="empty">') + String(escape_text(error["message"] ?? "")) + String("</p>");
          } else {
            return null;
          }
        }
      }
    });
  }
  async function run_search() {
    return await (async (input) => {
      return !(input === null) ? await (async () => {
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
  var menu_breakpoint = 600;
  var set_menu_marker = (value) => {
    document.documentElement.setAttribute("data-menu", value);
  };
  var clear_menu_marker = () => {
    document.documentElement.removeAttribute("data-menu");
  };
  function narrow_QMARK_() {
    return !__eliscript_numeric_relation(">", globalThis.innerWidth, menu_breakpoint);
  }
  function mark_menu_state() {
    if (__eliscript_truthy(narrow_QMARK_())) {
      return set_menu_marker("collapsed");
    } else {
      return clear_menu_marker();
    }
  }
  var set_open = (element, value) => {
    element.open = value;
  };
  function bind_menu() {
    {
      const __eliscript_value_22 = document.querySelector(".menu");
      {
        let menu = __eliscript_value_22;
        if (!(menu === null)) {
          set_open(menu, !__eliscript_truthy(narrow_QMARK_()));
          return menu["addEventListener"]("toggle", (event) => {
            if (__eliscript_truthy(((__eliscript_value_23) => __eliscript_truthy(__eliscript_value_23) ? !__eliscript_truthy(menu["open"]) : __eliscript_value_23)(narrow_QMARK_()))) {
              return set_menu_marker("collapsed");
            } else {
              return clear_menu_marker();
            }
          });
        } else {
          return null;
        }
      }
    }
  }
  var comment_endpoint = (kind, binding) => {
    const [repository, number] = binding.split("#");
    const path = kind === "discussion" ? "discussions" : "issues";
    return `https://api.github.com/repos/${repository}/${path}/${number}/comments?per_page=100`;
  };
  var set_text = (element, value) => {
    element.textContent = value;
  };
  function refresh_notes() {
    return Array.from(document.querySelectorAll("[data-comment-refresh]"));
  }
  function verdict_element(note) {
    return note["querySelector"](".refresh-verdict");
  }
  async function report_freshness(note, url) {
    return await (async (verdict) => {
      return !(verdict === null) ? await (async () => {
        try {
          return await (async (response) => {
            return ((payload) => {
              return __eliscript_truthy(Array["isArray"](payload)) ? ((before, now) => {
                return set_text(verdict, __eliscript_numeric_relation(">", now, parse_count(before)) ? String(" ") + String(now) + String(" comments now; ") + String(before) + String(" when this snapshot was taken.") : String(" ") + String(now) + String(" comments; this snapshot is current."));
              })(note["getAttribute"]("data-comment-count"), (payload ?? []).length) : set_text(verdict, " Newer comments could not be checked.");
            })(__eliscript_truthy(response["ok"]) ? await response["json"]() : []);
          })(await globalThis["fetch"](url, { headers: { accept: "application/vnd.github+json" } }));
        } catch (error) {
          return set_text(verdict, " Newer comments could not be checked.");
        }
      })() : null;
    })(verdict_element(note));
  }
  function parse_count(value) {
    {
      const __eliscript_value_24 = Number.parseInt;
      {
        let parsed = __eliscript_value_24;
        if (value === null) {
          return 0;
        } else {
          return parsed(value, 10);
        }
      }
    }
  }
  async function refresh_comment_freshness() {
    return await (async (notes) => {
      return await (async (index) => {
        return await (async () => {
          while (__eliscript_numeric_relation("<", index, (notes ?? []).length)) {
            await (async (note) => {
              return await (async (binding) => {
                return await (async (kind) => {
                  return !__eliscript_truthy(blank_QMARK_(binding)) ? await report_freshness(note, comment_endpoint(kind, binding)) : null;
                })(note["getAttribute"]("data-comment-kind"));
              })(note["getAttribute"]("data-comment-binding"));
            })((notes ?? [])[index] ?? null);
            index = index + 1;
          }
          return null;
        })();
      })(0);
    })(refresh_notes());
  }
  apply_theme(stored_theme());
  mark_menu_state();
  function on_ready() {
    {
      const __eliscript_value_25 = node("theme-toggle");
      {
        let button = __eliscript_value_25;
        if (!(button === null)) {
          label_theme(stored_theme());
          button["addEventListener"]("click", (event) => {
            event["preventDefault"]();
            return toggle_theme();
          });
        }
      }
    }
    bind_menu();
    globalThis["addEventListener"]("load", (event) => {
      return refresh_comment_freshness();
    });
    globalThis["addEventListener"]("resize", (event) => {
      return bind_menu();
    });
    return search_once();
  }
  globalThis.document["readyState"] === "loading" ? globalThis.document["addEventListener"]("DOMContentLoaded", (event) => {
    return on_ready();
  }) : on_ready();
})();
