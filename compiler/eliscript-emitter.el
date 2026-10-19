;;; eliscript-emitter.el --- ECMAScript emitter for Eliscript -*- lexical-binding: t; -*-

;;; Commentary:

;; The version-zero emitter compiles a deliberately small Lisp language to
;; readable ECMAScript modules.  It preserves Lisp truthiness: false, null, and
;; undefined are false; every other JavaScript value is true.

;;; Code:

(require 'cl-lib)
(require 'json)
(require 'subr-x)
(require 'eliscript-diagnostic)
(require 'eliscript-parameters)
(require 'eliscript-ir)

(declare-function eliscript-ir-emitter--binding-initializer "eliscript-ir-emitter" (node))
(declare-function eliscript-ir-emitter--children "eliscript-ir-emitter" (node))
(declare-function eliscript-ir-emitter--split-counted-children "eliscript-ir-emitter" (node property))

;; Identical capsules share cycle guards and deterministic Number method
;; formatting without replacing global prototypes or native function values.
(defconst eliscript-emitter--array-text-import
  "import { c as __eliscript_at, d as __eliscript_at_direct } from \"data:text/javascript;base64,dmFyIG09UmVmbGVjdC5hcHBseSx0dD1OdW1iZXIucHJvdG90eXBlLnZhbHVlT2Ysaj1OdW1iZXIucHJvdG90eXBlLnRvU3RyaW5nLFU9TnVtYmVyLG50PU9iamVjdC5jcmVhdGUsaD1CaWdJbnQsZXQ9RGF0YVZpZXcsb3Q9QXJyYXlCdWZmZXIsaXQ9RGF0YVZpZXcucHJvdG90eXBlLnNldEZsb2F0NjQsSj1EYXRhVmlldy5wcm90b3R5cGUuZ2V0VWludDMyLHJ0PVJhbmdlRXJyb3I7ZnVuY3Rpb24gY3QodCxuKXtsZXQgZT1oKG4pLG89aCh0KSxpPSIiO2lmKG88MG4pbz0tbztkb3tsZXQgZj1vJWU7aT0iMDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6IltVKGYpXStpLG8vPWV9d2hpbGUobyE9PTBuKTtyZXR1cm4gdDwwPyItIitpOml9ZnVuY3Rpb24gc3QodCxuKXtsZXQgZT1uZXcgZXQobmV3IG90KDgpKTttKGl0LGUsWzAsdCwhMV0pO2xldCBvPW0oSixlLFswLCExXSksaT1tKEosZSxbNCwhMV0pLGY9bz4+PjIwJjIwNDcsYj1vJjEwNDg1NzUscD1vPj4+MzEscj1oKGIpPDwzMm58aChpKTtpZihmIT09MClyKz0xbjw8NTJuO3I8PD0ybjtsZXQgbD00bix1PWY+MSYmYj09PTAmJmk9PT0wPzFuOjJuLGs9Mm47aWYoZj49MTA3NSl7bGV0IGM9aChmLTEwNzUpO3I8PD1jLHU8PD1jLGs8PD1jfWVsc2UgbDw8PWgoZj09PTA/MTA3NDoxMDc1LWYpO2xldCBkPWgobiksZz1udChudWxsKSxhPTAsUz0wLEQ9MDtpZihyPGwpd2hpbGUocjxsKXtpZihyKjJuPmwmJnIraz5sKWJyZWFrO3IqPWQsdSo9ZCxrKj1kLFMtLX1lbHNlIHdoaWxlKHI+PWwqZClsKj1kLFMrKztmb3IoOzspe2xldCBjPVUoci9sKTtyJT1sO2xldCBJPXI8dSx4PXIraz5sO2dbYSsrXT1jLEQ9RCoobiYxKStjJjE7bGV0IHE9cioybixQPXE+bHx8cT09PWwmJkQ9PT0xO2lmKFAmJnh8fCFQJiZJKXtpZihQKXtsZXQgUj1hLEI9ITA7d2hpbGUoUj4wJiZCKXtSLS07bGV0IEg9Z1tSXSsxO2lmKEg9PT1uKWdbUl09MDtlbHNlIGdbUl09SCxCPSExfWlmKEIpZ1swXT0xLFMrK31icmVha31pZihhPj02NCl0aHJvdyBuZXcgcnQoIm51bWJlciByYWRpeCBmb3JtYXR0aW5nIGRpZCBub3QgY29udmVyZ2UiKTtyKj1kLHUqPWQsayo9ZH13aGlsZShhPjEmJmdbYS0xXT09PTApYS0tO2xldCB3PSIiO2lmKFM8MCl7dz0iMC4iO2ZvcihsZXQgYz0wO2M8LTEtUztjKyspdys9IjAiO2ZvcihsZXQgYz0wO2M8YTtjKyspdys9IjAxMjM0NTY3ODlhYmNkZWZnaGlqa2xtbm9wcXJzdHV2d3h5eiJbZ1tjXV19ZWxzZXtsZXQgYz1TKzEsST1jPmE/YzphO2ZvcihsZXQgeD0wO3g8STt4Kyspe2lmKHg9PT1jJiZjPGEpdys9Ii4iO3crPXg8YT8iMDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1ub3BxcnN0dXZ3eHl6IltnW3hdXToiMCJ9fXJldHVybiBwPyItIit3Ond9ZnVuY3Rpb24gRyh0LG4pe2xldCBlO3RyeXtlPW0odHQsdCxbXSl9Y2F0Y2h7cmV0dXJuIG0oaix0LFtuXSl9bGV0IG89MTA7aWYobiE9PXZvaWQgMCl7bGV0IGk9K247aWYobz1pIT09aT8wOmktaSUxLG88Mnx8bz4zNnx8byE9PW8pcmV0dXJuIG0oaixlLFtvXSl9aWYobz09PTEwfHxlPT09MHx8ZSE9PWV8fGU9PT0xLzB8fGU9PT0tMS8wKXJldHVybiBtKGosZSxbMTBdKTtyZXR1cm4gZSUxPT09MD9jdChlLG8pOnN0KGUsbyl9dmFyIHM9UmVmbGVjdC5hcHBseSxNPUZ1bmN0aW9uLnByb3RvdHlwZS5jYWxsLE49RnVuY3Rpb24ucHJvdG90eXBlLmFwcGx5LEU9RnVuY3Rpb24ucHJvdG90eXBlLmJpbmQsVD1PYmplY3QuZGVmaW5lUHJvcGVydHksbHQ9T2JqZWN0LmdldE93blByb3BlcnR5RGVzY3JpcHRvcixmdD1PYmplY3QuZ2V0UHJvdG90eXBlT2YsdXQ9T2JqZWN0LnNldFByb3RvdHlwZU9mLGF0PVJlZmxlY3Qub3duS2V5cyxwdD1TeW1ib2wuaGFzSW5zdGFuY2UsVj1BcnJheS5pc0FycmF5LEs9QXJyYXkucHJvdG90eXBlLmpvaW4sej1BcnJheS5wcm90b3R5cGUudG9TdHJpbmcseXQ9T2JqZWN0LnByb3RvdHlwZS50b1N0cmluZyxidD1TdHJpbmcsQz1UeXBlRXJyb3IsZHQ9U3ltYm9sLnRvUHJpbWl0aXZlLGd0PVdlYWtTZXQucHJvdG90eXBlLmhhcyx3dD1XZWFrU2V0LnByb3RvdHlwZS5hZGQseHQ9V2Vha1NldC5wcm90b3R5cGUuZGVsZXRlLEY9bmV3IFdlYWtTZXQsTz1udWxsLFc9KHQpPT50IT09bnVsbCYmKHR5cGVvZiB0PT09Im9iamVjdCJ8fHR5cGVvZiB0PT09ImZ1bmN0aW9uInx8dHlwZW9mIHQ+InUiJiZ0IT09dm9pZCAwKSxBPSh0KT0+dHlwZW9mIHQ9PT0iZnVuY3Rpb24ifHx0eXBlb2YgdD4idSImJnQhPT12b2lkIDA7ZnVuY3Rpb24gaHQoKXtsZXQgbj1uZXcgQygiY3ljbGljIGFycmF5IHRleHQgY29udmVyc2lvbiIpO3Rocm93IG4uZWxpc2NyaXB0RGlhZ25vc3RpYz17Zm9ybWF0OiJlbGlzY3JpcHQtZGlhZ25vc3RpYyIsdmVyc2lvbjoxLGNvZGU6IkVMSS1SVDAwMDkiLHNldmVyaXR5OiJlcnJvciIscGhhc2U6InJ1bnRpbWUiLG1lc3NhZ2U6ImN5Y2xpYyBhcnJheSB0ZXh0IGNvbnZlcnNpb24ifSxufWZ1bmN0aW9uIG10KHQpe2lmKCFXKHQpKXJldHVybiB0O2xldCBuPXRbZHRdO2lmKG4hPT12b2lkIDAmJm4hPT1udWxsKXtsZXQgZT1zKG4sdCxbInN0cmluZyJdKTtpZighVyhlKSlyZXR1cm4gZTt0aHJvdyBuZXcgQygiQ2Fubm90IGNvbnZlcnQgb2JqZWN0IHRvIHByaW1pdGl2ZSB2YWx1ZSIpfWZvcihsZXQgZT0wO2U8MjtlKyspe2xldCBvPXRbZT09PTA/InRvU3RyaW5nIjoidmFsdWVPZiJdO2lmKEEobykpe2xldCBpPW89PT16JiZWKHQpP3YodCk6cyhvLHQsW10pO2lmKCFXKGkpKXJldHVybiBpfX10aHJvdyBuZXcgQygiQ2Fubm90IGNvbnZlcnQgb2JqZWN0IHRvIHByaW1pdGl2ZSB2YWx1ZSIpfWZ1bmN0aW9uIFEodCl7bGV0IG49bXQodCk7aWYodHlwZW9mIG49PT0ic3ltYm9sIil0aHJvdyBuZXcgQygiQ2Fubm90IGNvbnZlcnQgYSBTeW1ib2wgdmFsdWUgdG8gYSBzdHJpbmciKTtyZXR1cm4gYnQobil9ZnVuY3Rpb24gXyh0LG4pe2xldCBlPSt0Lmxlbmd0aCxvPWUhPT1lfHxlPD0wPzA6ZT49OTAwNzE5OTI1NDc0MDk5MT85MDA3MTk5MjU0NzQwOTkxOmUtZSUxLGk9bj09PXZvaWQgMD8iLCI6UShuKSxmPU89PT1udWxsO2lmKGYpTz10O2Vsc2V7aWYodD09PU98fHMoZ3QsRixbdF0pKWh0KCk7cyh3dCxGLFt0XSl9dHJ5e2xldCBiPSIiO2ZvcihsZXQgcD0wO3A8bztwKyspe2lmKHApYis9aTtsZXQgcj10W3BdO2lmKHIhPT1udWxsJiZyIT09dm9pZCAwKWIrPVEocil9cmV0dXJuIGJ9ZmluYWxseXtpZihmKU89bnVsbDtlbHNlIHMoeHQsRixbdF0pfX1mdW5jdGlvbiB2KHQpe2xldCBuPXQuam9pbjtyZXR1cm4gQShuKT9uPT09Sz9fKHQsdm9pZCAwKTpzKG4sdCxbXSk6cyh5dCx0LFtdKX1mdW5jdGlvbiB5KHQsbil7cmV0dXJuIG48dC5sZW5ndGg/dFtuXTp2b2lkIDB9ZnVuY3Rpb24gWCh0LG4pe2xldCBlPVtdO2ZvcihsZXQgbz1uO288dC5sZW5ndGg7bysrKVQoZSxlLmxlbmd0aCx7dmFsdWU6dFtvXSx3cml0YWJsZTohMCxlbnVtZXJhYmxlOiEwLGNvbmZpZ3VyYWJsZTohMH0pO3JldHVybiBlfWZ1bmN0aW9uIFN0KHQsbil7bGV0IGU9W107Zm9yKGxldCBvPTA7bzx0Lmxlbmd0aCtuLmxlbmd0aDtvKyspVChlLG8se3ZhbHVlOm88dC5sZW5ndGg/dFtvXTpuW28tdC5sZW5ndGhdLHdyaXRhYmxlOiEwLGVudW1lcmFibGU6ITAsY29uZmlndXJhYmxlOiEwfSk7cmV0dXJuIGV9ZnVuY3Rpb24gWSguLi50KXtyZXR1cm4gdH1mdW5jdGlvbiBaKHQsbil7cmV0dXJuIG4/cyhOLFksW3ZvaWQgMCx0XSk6cyhZLHZvaWQgMCx0KX1mdW5jdGlvbiBMKHQsbixlKXtmb3IoOzspe2lmKHQ9PT1qKXJldHVybiBHKG4seShlLDApKTtpZih0PT09SyYmVihuKSlyZXR1cm4gXyhuLHkoZSwwKSk7aWYodD09PXomJlYobikpcmV0dXJuIHYobik7aWYodD09PU0pe2lmKCFBKG4pKXJldHVybiBzKHQsbixlKTtsZXQgbz1uLGk9eShlLDApO2U9WChlLDEpLHQ9byxuPWk7Y29udGludWV9aWYodD09PU4pe2lmKCFBKG4pKXJldHVybiBzKHQsbixlKTtsZXQgbz1uLGk9eShlLDApO2U9Wih5KGUsMSksITApLHQ9byxuPWk7Y29udGludWV9aWYodD09PXMpe2xldCBvPXkoZSwwKSxpPXkoZSwxKTtpZighQShvKSlyZXR1cm4gcyh0LG4sZSk7ZT1aKHkoZSwyKSwhMSksdD1vLG49aTtjb250aW51ZX1pZih0PT09RSl7bGV0IG89cyh0LG4sZSk7aWYobiE9PWomJm4hPT1LJiZuIT09eiYmbiE9PU0mJm4hPT1OJiZuIT09cyYmbiE9PUUpcmV0dXJuIG87bGV0IGk9bixmPXkoZSwwKSxiPVgoZSwxKSxwPSguLi51KT0+TChpLGYsU3QoYix1KSk7VChwLHB0LHt2YWx1ZToodSk9PnUgaW5zdGFuY2VvZiBpLGNvbmZpZ3VyYWJsZTohMH0pO2xldCByPXMoRSxwLFt2b2lkIDBdKTt1dChyLGZ0KG8pKTtsZXQgbD1hdChvKTtmb3IobGV0IHU9MDt1PGwubGVuZ3RoO3UrKylUKHIsbFt1XSxsdChvLGxbdV0pKTtyZXR1cm4gcn1yZXR1cm4gcyh0LG4sZSl9fWZ1bmN0aW9uIFJ0KHQsbil7bGV0IGU9dFtuXTtyZXR1cm4oLi4ubyk9PkwoZSx0LG8pfWZ1bmN0aW9uIEF0KHQsbiwuLi5lKXtsZXQgbz10W25dO3JldHVybiBMKG8sdCxlKX1leHBvcnR7UnQgYXMgYyxBdCBhcyBkfTs=\";\n")

(defconst eliscript-emitter--number-conversion-intrinsics
    "const __eliscript_number_intrinsic = globalThis.Number;\nconst __eliscript_bigint_intrinsic = globalThis.BigInt;\nconst __eliscript_numeric_apply = globalThis.Reflect.apply;\nconst __eliscript_numeric_symbol = globalThis.Symbol.toPrimitive;\nconst __eliscript_numeric_error = globalThis.TypeError;\nconst __eliscript_numeric_trim = globalThis.String.prototype.trim;\nconst __eliscript_numeric_slice = globalThis.String.prototype.slice;\nconst __eliscript_numeric_exec = globalThis.RegExp.prototype.exec;\n")
  (defconst eliscript-emitter--number-conversion-capsule
    "import { __eliscript_number_intrinsic, __eliscript_bigint_intrinsic, __eliscript_numeric_apply, __eliscript_numeric_symbol, __eliscript_numeric_error, __eliscript_numeric_trim, __eliscript_numeric_slice, __eliscript_numeric_exec } from \"data:text/javascript;base64,ZXhwb3J0IGNvbnN0IF9fZWxpc2NyaXB0X251bWJlcl9pbnRyaW5zaWMgPSBnbG9iYWxUaGlzLk51bWJlcjsKZXhwb3J0IGNvbnN0IF9fZWxpc2NyaXB0X2JpZ2ludF9pbnRyaW5zaWMgPSBnbG9iYWxUaGlzLkJpZ0ludDsKZXhwb3J0IGNvbnN0IF9fZWxpc2NyaXB0X251bWVyaWNfYXBwbHkgPSBnbG9iYWxUaGlzLlJlZmxlY3QuYXBwbHk7CmV4cG9ydCBjb25zdCBfX2VsaXNjcmlwdF9udW1lcmljX3N5bWJvbCA9IGdsb2JhbFRoaXMuU3ltYm9sLnRvUHJpbWl0aXZlOwpleHBvcnQgY29uc3QgX19lbGlzY3JpcHRfbnVtZXJpY19lcnJvciA9IGdsb2JhbFRoaXMuVHlwZUVycm9yOwpleHBvcnQgY29uc3QgX19lbGlzY3JpcHRfbnVtZXJpY190cmltID0gZ2xvYmFsVGhpcy5TdHJpbmcucHJvdG90eXBlLnRyaW07CmV4cG9ydCBjb25zdCBfX2VsaXNjcmlwdF9udW1lcmljX3NsaWNlID0gZ2xvYmFsVGhpcy5TdHJpbmcucHJvdG90eXBlLnNsaWNlOwpleHBvcnQgY29uc3QgX19lbGlzY3JpcHRfbnVtZXJpY19leGVjID0gZ2xvYmFsVGhpcy5SZWdFeHAucHJvdG90eXBlLmV4ZWM7Cg==\";\n")
  (defconst eliscript-emitter--number-conversion-body
    "const __eliscript_numeric_radix = /^(?:0[xX][0-9a-fA-F]+|0[oO][0-7]+|0[bB][01]+)$/;\nconst __eliscript_numeric_object = (value) => value !== null && (typeof value === \"object\" || typeof value === \"function\" || (typeof value === \"undefined\" && value !== void 0));\nconst __eliscript_numeric_primitive = (value) => {\n  if (!__eliscript_numeric_object(value)) return value;\n  const exotic = value[__eliscript_numeric_symbol];\n  if (exotic !== void 0 && exotic !== null) {\n    const result = __eliscript_numeric_apply(exotic, value, [\"number\"]);\n    if (!__eliscript_numeric_object(result)) return result;\n    throw new __eliscript_numeric_error(\"Cannot convert object to primitive value\");\n  }\n  for (let index = 0; index < 2; index++) {\n    const method = value[index === 0 ? \"valueOf\" : \"toString\"];\n    if (typeof method === \"function\" || (typeof method === \"undefined\" && method !== void 0)) {\n      const result = __eliscript_numeric_apply(method, value, []);\n      if (!__eliscript_numeric_object(result)) return result;\n    }\n  }\n  throw new __eliscript_numeric_error(\"Cannot convert object to primitive value\");\n};\nconst __eliscript_to_number = (value) => {\n  const primitive = __eliscript_numeric_primitive(value);\n  if (typeof primitive === \"string\") {\n    const text = __eliscript_numeric_apply(__eliscript_numeric_trim, primitive, []);\n    if (__eliscript_numeric_apply(__eliscript_numeric_exec, __eliscript_numeric_radix, [text]) !== null) {\n      let first = 2;\n      while (first < text.length && text[first] === \"0\") first++;\n      if (first === text.length) return 0;\n      const prefix = text[1];\n      const limit = prefix === \"x\" || prefix === \"X\" ? 256 : prefix === \"b\" || prefix === \"B\" ? 1024 : 342;\n      if (text.length - first > limit) return 1 / 0;\n      const token = __eliscript_numeric_apply(__eliscript_numeric_slice, text, [0, 2]) + __eliscript_numeric_apply(__eliscript_numeric_slice, text, [first]);\n      return __eliscript_number_intrinsic(__eliscript_bigint_intrinsic(token));\n    }\n  }\n  return __eliscript_number_intrinsic(primitive);\n};\n")
  (defconst eliscript-emitter--number-conversion-helper
    (concat eliscript-emitter--number-conversion-intrinsics eliscript-emitter--number-conversion-body)
  "Generated helper for exact nondecimal Number conversion across JS hosts.")
(defconst eliscript-emitter--numeric-operator-helper
  "const __eliscript_numeric = (value) => {\n  if (typeof value === \"number\" || typeof value === \"bigint\") return value;\n  const primitive = __eliscript_numeric_primitive(value);\n  if (typeof primitive === \"number\" || typeof primitive === \"bigint\") return primitive;\n  return typeof primitive === \"string\" ? __eliscript_to_number(primitive) : +primitive;\n};\nconst __eliscript_implicit_number = (value) => {\n  if (typeof value === \"number\") return value;\n  const primitive = __eliscript_numeric_primitive(value);\n  if (typeof primitive === \"bigint\") throw new __eliscript_numeric_error(\"Cannot convert a BigInt value to a number\");\n  return typeof primitive === \"string\" ? __eliscript_to_number(primitive) : +primitive;\n};\nconst __eliscript_numeric_decrement = (value) => __eliscript_implicit_number(value) - 1;\nconst __eliscript_numeric_sub = (a, b) => { if (typeof a === \"number\" && typeof b === \"number\") return a - b; return __eliscript_numeric(a) - __eliscript_numeric(b); };\nconst __eliscript_numeric_mul = (a, b) => { if (typeof a === \"number\" && typeof b === \"number\") return a * b; return __eliscript_numeric(a) * __eliscript_numeric(b); };\nconst __eliscript_numeric_div = (a, b) => { if (typeof a === \"number\" && typeof b === \"number\") return a / b; return __eliscript_numeric(a) / __eliscript_numeric(b); };\nconst __eliscript_numeric_rem = (a, b) => { if (typeof a === \"number\" && typeof b === \"number\") return a % b; return __eliscript_numeric(a) % __eliscript_numeric(b); };\nconst __eliscript_numeric_and = (a, b) => { if (typeof a === \"number\" && typeof b === \"number\") return a & b; return __eliscript_numeric(a) & __eliscript_numeric(b); };\nconst __eliscript_numeric_or = (a, b) => { if (typeof a === \"number\" && typeof b === \"number\") return a | b; return __eliscript_numeric(a) | __eliscript_numeric(b); };\nconst __eliscript_numeric_xor = (a, b) => { if (typeof a === \"number\" && typeof b === \"number\") return a ^ b; return __eliscript_numeric(a) ^ __eliscript_numeric(b); };\nconst __eliscript_numeric_shl = (a, b) => { if (typeof a === \"number\" && typeof b === \"number\") return a << b; return __eliscript_numeric(a) << __eliscript_numeric(b); };\nconst __eliscript_numeric_shr = (a, b) => { if (typeof a === \"number\" && typeof b === \"number\") return a >> b; return __eliscript_numeric(a) >> __eliscript_numeric(b); };\nconst __eliscript_numeric_ushr = (a, b) => { if (typeof a === \"number\" && typeof b === \"number\") return a >>> b; return __eliscript_numeric(a) >>> __eliscript_numeric(b); };\nconst __eliscript_numeric_neg = (a) => typeof a === \"number\" ? -a : -__eliscript_numeric(a);\nconst __eliscript_numeric_int32 = (a) => typeof a === \"number\" ? a | 0 : __eliscript_numeric(a) | 0;\nconst __eliscript_numeric_uint32 = (a) => typeof a === \"number\" ? a >>> 0 : __eliscript_numeric(a) >>> 0;\nconst __eliscript_numeric_not = (a) => typeof a === \"number\" ? ~a : ~__eliscript_numeric(a);\nconst __eliscript_numeric_relation = (operator, left, right) => {\n  if (typeof left === \"number\" && typeof right === \"number\") {\n    if (operator === \"<\") return left < right;\n    if (operator === \"<=\") return left <= right;\n    if (operator === \">\") return left > right;\n    return left >= right;\n  }\n  let a = __eliscript_numeric_primitive(left);\n  let b = __eliscript_numeric_primitive(right);\n  const x = typeof a, y = typeof b;\n  if (!((x === \"string\" && y === \"string\") || (x === \"bigint\" && y === \"string\") || (x === \"string\" && y === \"bigint\"))) {\n    a = __eliscript_numeric(a);\n    b = __eliscript_numeric(b);\n  }\n  if (operator === \"<\") return a < b;\n  if (operator === \"<=\") return a <= b;\n  if (operator === \">\") return a > b;\n  return a >= b;\n};\n"
  "Generated primitive numeric operators with exact coercion ordering.")
  (defconst eliscript-emitter--imul-intrinsic
    "const __eliscript_numeric_imul_intrinsic = globalThis.Math.imul;\n")
  (defconst eliscript-emitter--imul-capsule
    "import { __eliscript_numeric_imul_intrinsic } from \"data:text/javascript;base64,ZXhwb3J0IGNvbnN0IF9fZWxpc2NyaXB0X251bWVyaWNfaW11bF9pbnRyaW5zaWMgPSBnbG9iYWxUaGlzLk1hdGguaW11bDsK\";\n")
  (defconst eliscript-emitter--imul-operator-helper
    "const __eliscript_numeric_imul = (a, b) => __eliscript_numeric_imul_intrinsic(__eliscript_implicit_number(a), __eliscript_implicit_number(b));\n")
(defconst eliscript-emitter--host-identity-token-helper
  "const __eliscript_host_identity_token = (() => { const objects = new WeakMap(); const symbols = new Map(); let next = 1; return (value) => { const type = typeof value; if ((type !== \"object\" || value === null) && type !== \"function\" && type !== \"symbol\") throw new TypeError(\"host-identity-token expects an object, function, or symbol\"); const identities = type === \"symbol\" ? symbols : objects; const cached = identities.get(value); if (cached !== undefined) return cached; if (next > Number.MAX_SAFE_INTEGER) throw new RangeError(\"host identity token space exhausted\"); const token = next; next += 1; identities.set(value, token); return token; }; })();\n"
  "Generated module helper for process-local opaque host identities.")
(defconst eliscript-emitter--literal-runtime-import
  "import { hashMap as __eliscript_hash_map, hashSet as __eliscript_hash_set, keyword as __eliscript_keyword, list as __eliscript_list, queue as __eliscript_queue, symbol as __eliscript_symbol, vector as __eliscript_vector } from \"eliscript/runtime/literals.mjs\";\n"
  "Generated import for canonical language literal construction.")
(defconst eliscript-emitter--collection-runtime-import
  "import { count as __eliscript_count, nth as __eliscript_nth } from \"eliscript/runtime/core/collection.mjs\";\n"
  "Generated import for protocol-driven collection operations.")
(defconst eliscript-emitter--list-runtime-import
  "import { cons as __eliscript_cons, first as __eliscript_first, rest as __eliscript_rest } from \"eliscript/runtime/core/list.mjs\";\n"
  "Generated import for canonical persistent List operations.")
(defconst eliscript-emitter--value-runtime-import
  "import { equalValues as __eliscript_equal } from \"eliscript/runtime/core/value.mjs\";\n"
  "Generated import for canonical language value equality.")
(require 'eliscript-symbol)

(defalias 'eliscript-emitter--munge-segment
  #'eliscript-symbol-munge-segment)
(defalias 'eliscript-emitter--binding-name
  #'eliscript-symbol-binding-name)
(defalias 'eliscript-emitter--reference-name
  #'eliscript-symbol-reference-name)

(defvar eliscript-emitter--temporary-counter 0)
(defconst eliscript-emitter--tdz-import "import { tdz as __eliscript_tdz_error, immutable as __eliscript_const_error } from \"data:text/javascript;base64,Y29uc3QgRSA9IFJlZmVyZW5jZUVycm9yOyBjb25zdCBUID0gVHlwZUVycm9yOyBleHBvcnQgZnVuY3Rpb24gdGR6KG5hbWUpIHsgdGhyb3cgbmV3IEUoIkNhbm5vdCBhY2Nlc3MgJyIgKyBuYW1lICsgIicgYmVmb3JlIGluaXRpYWxpemF0aW9uIik7IH0gZXhwb3J0IGZ1bmN0aW9uIGltbXV0YWJsZSgpIHsgdGhyb3cgbmV3IFQoIkFzc2lnbm1lbnQgdG8gY29uc3RhbnQgdmFyaWFibGUuIik7IH0K\";\n")
;; Private module initialization state is separate from public ESM bindings.
(defvar eliscript-emitter--tdz-state nil)
(defconst eliscript-emitter--tdz-read-tag (make-symbol "eliscript-tdz-read"))
(defconst eliscript-emitter--tdz-write-tag (make-symbol "eliscript-tdz-write"))
(defconst eliscript-emitter--tdz-assignment-tag (make-symbol "eliscript-tdz-assignment"))
(defun eliscript-emitter--tdz-ready-name (record)
  (format "__eliscript_tdz_ready_%d" (plist-get record :index)))
(defun eliscript-emitter--tdz-reader-name (record)
  (format "__eliscript_tdz_read_%d" (plist-get record :index)))
(defun eliscript-emitter--tdz-writer-name (record)
  (format "__eliscript_tdz_write_%d" (plist-get record :index)))
(defun eliscript-emitter--tdz-root (name)
  ;; Resolve the established emitted binding namespace, just like the
  ;; self-hosted emitter. Distinct source spellings can share a JS binding.
  ;; Reference mapping also accepts literal symbols, which are never bindings.
  (eliscript-emitter--reference-name
   (intern (car (split-string (symbol-name name) "[./]")))))
(defun eliscript-emitter--tdz-read-text (record reference)
  (if (null record) (eliscript-emitter--reference-name reference)
    (let* ((name (eliscript-emitter--binding-name (plist-get record :name)))
           (text (eliscript-emitter--reference-name reference)))
      (concat "(" (eliscript-emitter--tdz-reader-name record) "())" (substring text (length name))))))
(defun eliscript-emitter--tdz-write-text (record name value)
  (if record (concat (eliscript-emitter--tdz-writer-name record) "(" value ")")
    (format "(%s = %s)" (eliscript-emitter--binding-name name) value)))
(defun eliscript-emitter--tdz-prologue (state)
  (when (plist-get state :variables)
    (concat eliscript-emitter--tdz-import
      (mapconcat
        (lambda (record)
          (let* ((ready (eliscript-emitter--tdz-ready-name record))
                 (name (eliscript-emitter--binding-name (plist-get record :name)))
                 (argument (format "__eliscript_tdz_value_%d" (plist-get record :index)))
                 (quoted (eliscript-emitter--json-string name)))
            (concat "var " ready ";\n"
              "function " (eliscript-emitter--tdz-reader-name record) "() { if (" ready
              " !== true) __eliscript_tdz_error(" quoted "); return " name "; }\n"
              "function " (eliscript-emitter--tdz-writer-name record) "(" argument ") { if (" ready
              " !== true) __eliscript_tdz_error(" quoted "); "
              (if (plist-get record :mutable) (concat "return (" name " = " argument ");") "return __eliscript_const_error();") " }\n")))
        (plist-get state :variables) ""))))



(defun eliscript-emitter--tdz-legacy-shadow (pattern scope)
  (let ((pending (list pattern)))
    (while pending
      (let ((item (pop pending)))
        (cond ((and item (symbolp item) (not (keywordp item))
                    (not (string-prefix-p "&" (symbol-name item))))
               (puthash (eliscript-emitter--binding-name item) nil scope))
              ((vectorp item)
               (let ((index (1- (length item))))
                 (while (>= index 0) (push (aref item index) pending) (setq index (1- index))))))))))

(defun eliscript-emitter--tdz-legacy-parameters (parameters scope)
  (dolist (parameter parameters) (eliscript-emitter--tdz-legacy-shadow parameter scope)))
(defun eliscript-emitter--tdz-legacy-predeclare (forms scope state)
  (dolist (form forms)
    (when (consp form)
      (pcase (car form)
        ('module (eliscript-emitter--tdz-legacy-predeclare (cddr form) scope state))
        ((or 'defvar 'defconst)
         (let ((record (list :index (length (plist-get state :variables)) :name (cadr form) :mutable (eq (car form) 'defvar))))
           (setf (plist-get state :variables) (append (plist-get state :variables) (list record)))
           (puthash form record (plist-get state :declarations))
           (puthash (eliscript-emitter--binding-name (cadr form)) record scope)))
        ((or 'defun 'defn 'defasync) (puthash (eliscript-emitter--binding-name (cadr form)) nil scope))
        ((or 'import 'import-portable)
         (dolist (name (cddr form))
           (when (and name (symbolp name) (not (keywordp name)))
             (puthash (eliscript-emitter--binding-name name) nil scope))))))))
(defun eliscript-emitter--tdz-legacy-sequence (forms scope)
  (mapcar (lambda (form) (eliscript-emitter--tdz-legacy-expression form scope)) forms))
(defun eliscript-emitter--tdz-legacy-expression (form scope)
  "Rewrite ordinary TDZ expression trees using explicit continuations."
  (eliscript-emitter--run-depth-plan #'eliscript-emitter--tdz-depth-plan :expression form scope))

(defun eliscript-emitter--tdz-depth-plan (mode value scope)
  (pcase mode
    (:sequence
     (list :children (mapcar (lambda (form) (list :expression form scope)) value)
           (lambda (results) (list :value results))))
    (:bindings
     (let ((remaining (nth 0 value)) (original (nth 1 value)) (reversed (nth 2 value))
           (operator (nth 3 value)) (body (nth 4 value)) (child (nth 5 value)) (sequential (nth 6 value)))
       (if remaining
           (let* ((binding (car remaining)) (parsed (eliscript-emitter--parse-binding binding)) (target (car parsed)))
             (list :children (list (list :expression (cadr parsed) (if sequential child scope)))
                   (lambda (results)
                     (when sequential (eliscript-emitter--tdz-legacy-shadow target child))
                     (list :children
                           (list (list :bindings
                                       (list (cdr remaining) original
                                             (cons (if (or (symbolp binding) (vectorp binding)) binding (list target (car results))) reversed)
                                             operator body child sequential) scope))
                           (lambda (tail) (list :value (car tail)))))))
         (unless sequential
           (dolist (binding original)
             (eliscript-emitter--tdz-legacy-shadow (car (eliscript-emitter--parse-binding binding)) child)))
         (list :children (list (list :sequence body child))
               (lambda (results) (list :value (cons operator (cons (nreverse reversed) (car results)))))))))
    (:expression
     (cond
      ((vectorp value)
       (list :children (list (list :sequence (append value nil) scope))
             (lambda (results) (list :value (vconcat (car results))))))
      ((and (consp value) (memq (car value) '(let let* loop)))
       (list :children (list (list :bindings (list (cadr value) (cadr value) nil (car value) (cddr value)
                                                  (copy-hash-table scope) (eq (car value) 'let*)) scope))
             (lambda (results) (list :value (car results)))))
      ((and (consp value) (memq (car value) '(lambda fn async)))
       (let ((child (copy-hash-table scope)))
         (eliscript-emitter--tdz-legacy-parameters (cadr value) child)
         (list :children (list (list :sequence (cddr value) child))
               (lambda (results) (list :value (cons (car value) (cons (cadr value) (car results))))))))
      ((and (consp value) (not (memq (car value) '(quote js* setq set! try cond js-object))))
       (let* ((operator (car value))
              (fixed (memq operator '(if when unless progn do while recur and or not
                + * - / % mod = /= not= < <= > >= 1+ 1- eq equal null nil? undefined? nullish?
                int32 uint32 imul32 bit-and bit-or bit-xor bit-not bit-shift-left bit-shift-right unsigned-bit-shift-right
                value-type host-identity-token string-code-unit-at string-from-code-unit string-to-number string-to-bigint number-float64-words
                list vector hash-map hash-set queue js-array car cdr cons js-cons nth js-nth aref length js-length
                new print str object-keys object-has? object-assoc __eliscript_arity_error funcall apply get put js-call await throw))))
         (list :children
               (append (unless fixed (list (list :expression operator scope)))
                       (mapcar (lambda (form) (list :expression form scope)) (cdr value)))
               (lambda (results) (list :value (if fixed (cons operator results) results))))))
      (t (list :value (eliscript-emitter--tdz-legacy-expression-recursive value scope)))))
    (_ (error "unknown TDZ continuation mode: %S" mode))))

(defun eliscript-emitter--tdz-legacy-expression-recursive (form scope)
  (cond
   ((and form (symbolp form) (not (keywordp form)))
    (let ((record (gethash (eliscript-emitter--tdz-root form) scope)))
      (if record (list eliscript-emitter--tdz-read-tag record form) form)))
   ((vectorp form) (vconcat (eliscript-emitter--tdz-legacy-sequence (append form nil) scope)))
   ((consp form)
    (let ((operator (car form)) (arguments (cdr form)))
      (pcase operator
        ((or 'quote 'js*) form)
        ((or 'lambda 'fn 'async)
         (let ((child (copy-hash-table scope)))
           (eliscript-emitter--tdz-legacy-parameters (car arguments) child)
           (cons operator (cons (car arguments) (eliscript-emitter--tdz-legacy-sequence (cdr arguments) child)))))
        ((or 'let 'let* 'loop)
         (let ((child (copy-hash-table scope)) (sequential (eq operator 'let*)) bindings)
           (dolist (binding (car arguments))
             (let* ((parsed (eliscript-emitter--parse-binding binding))
                    (target (car parsed))
                    (value (eliscript-emitter--tdz-legacy-expression (cadr parsed) (if sequential child scope))))
               (push (if (or (symbolp binding) (vectorp binding)) binding (list target value)) bindings)
               (when sequential (eliscript-emitter--tdz-legacy-shadow target child))))
           (unless sequential
             (dolist (binding (car arguments))
               (eliscript-emitter--tdz-legacy-shadow (car (eliscript-emitter--parse-binding binding)) child)))
           (cons operator (cons (nreverse bindings) (eliscript-emitter--tdz-legacy-sequence (cdr arguments) child)))))
        ((or 'setq 'set!)
         (if (eq operator 'set!) (eliscript-emitter--require-arity "set!" arguments 2 2)
           (when (or (null arguments) (= (% (length arguments) 2) 1))
             (eliscript-emitter--fail "setq expects one or more name/value pairs")))
         (let ((pending arguments) pairs original-pairs guarded)
           (while pending
             (let* ((name (pop pending)) (value (pop pending))
                    (record (and (symbolp name) (gethash (eliscript-emitter--tdz-root name) scope)))
                    (rewritten (eliscript-emitter--tdz-legacy-expression value scope)))
               (when record (setq guarded t))
               (push (list name rewritten) original-pairs)
               (push (list eliscript-emitter--tdz-write-tag record name rewritten) pairs)))
           (if guarded
               (list eliscript-emitter--tdz-assignment-tag operator (nreverse pairs))
             (cons operator (apply #'append (nreverse original-pairs))))))
        ('try
         (cons operator
           (mapcar (lambda (clause)
             (cond
              ((and (consp clause) (eq (car clause) 'catch))
               (let ((child (copy-hash-table scope)))
                 (eliscript-emitter--tdz-legacy-shadow (cadr clause) child)
                 (cons 'catch (cons (cadr clause) (eliscript-emitter--tdz-legacy-sequence (cddr clause) child)))))
              ((and (consp clause) (eq (car clause) 'finally))
               (cons 'finally (eliscript-emitter--tdz-legacy-sequence (cdr clause) scope)))
              (t (eliscript-emitter--tdz-legacy-expression clause scope)))) arguments)))
        ('cond
         (cons operator (mapcar (lambda (clause) (eliscript-emitter--tdz-legacy-sequence clause scope)) arguments)))
        ('js-object
         (let ((pending arguments) fields)
           (while pending
             (let ((key (pop pending)) (value (pop pending)))
               (push (if (or (symbolp key) (stringp key)) key (eliscript-emitter--tdz-legacy-expression key scope)) fields)
               (push (eliscript-emitter--tdz-legacy-expression value scope) fields)))
           (cons operator (nreverse fields))))
        (_
         (cons
          (if (memq operator '(if when unless progn do while recur and or not
                + * - / % mod = /= not= < <= > >= 1+ 1- eq equal null nil? undefined? nullish?
                int32 uint32 imul32 bit-and bit-or bit-xor bit-not bit-shift-left bit-shift-right unsigned-bit-shift-right
                value-type host-identity-token string-code-unit-at string-from-code-unit string-to-number string-to-bigint number-float64-words
                list vector hash-map hash-set queue js-array car cdr cons js-cons nth js-nth aref length js-length
                new print str object-keys object-has? object-assoc __eliscript_arity_error funcall apply get put js-call await throw))
              operator (eliscript-emitter--tdz-legacy-expression operator scope))
          (eliscript-emitter--tdz-legacy-sequence arguments scope))))))
   (t form)))
(defun eliscript-emitter--tdz-legacy-top (form scope state)
  (if (not (consp form)) (eliscript-emitter--tdz-legacy-expression form scope)
    (pcase (car form)
      ('module (cons 'module (cons (cadr form) (mapcar (lambda (child) (eliscript-emitter--tdz-legacy-top child scope state)) (cddr form)))))
      ((or 'import 'import-portable 'export) form)
      ((or 'defvar 'defconst)
       (let ((copy (cons (car form) (cons (cadr form) (eliscript-emitter--tdz-legacy-sequence (cddr form) scope)))))
         (puthash copy (gethash form (plist-get state :declarations)) (plist-get state :declarations)) copy))
      ((or 'defun 'defn 'defasync)
       (let ((child (copy-hash-table scope)))
         (eliscript-emitter--tdz-legacy-parameters (nth 2 form) child)
         (append (list (car form) (cadr form) (nth 2 form)) (eliscript-emitter--tdz-legacy-sequence (nthcdr 3 form) child))))
      ('export-default (cons 'export-default (eliscript-emitter--tdz-legacy-sequence (cdr form) scope)))
      (_ (eliscript-emitter--tdz-legacy-expression form scope)))))

(defun eliscript-emitter--fail (format-string &rest arguments)
  "Signal a compiler error using FORMAT-STRING and ARGUMENTS."
  (apply #'eliscript-diagnostic-signal
         'eliscript-compile-error "ELI-E0001" "emission"
         nil nil format-string arguments))

(defun eliscript-emitter--json-string (value)
  "Encode string VALUE as an ECMAScript string literal."
  (cl-labels
      ((encode (text)
         (let* ((encoded (json-serialize text))
                (decoded
           ;; Emacs 30 returns UTF-8 JSON strings as unibyte data. Decode
           ;; before composing them with multibyte emitter fragments.
                 (if (multibyte-string-p encoded) encoded
                   (decode-coding-string encoded 'utf-8-unix)))
                (index 0))
           ;; Jansson uses uppercase escape digits; JSON.stringify uses
           ;; lowercase. Skip escaped backslashes so literal text such as
           ;; "\\u00AB" retains its exact original spelling.
           (while (< index (length decoded))
             (if (= (aref decoded index) ?\\)
                 (if (= (aref decoded (1+ index)) ?u)
                     (progn
                       (dotimes (digit 4)
                         (let* ((at (+ index 2 digit)) (unit (aref decoded at)))
                           (when (<= ?A unit ?F) (aset decoded at (+ unit 32)))))
                       (setq index (+ index 6)))
                   (setq index (+ index 2)))
               (setq index (1+ index))))
           decoded)))
    (if (or (not (stringp value))
            (not (cl-find-if (lambda (unit) (<= #xd800 unit #xdfff)) value)))
        (encode value)
      ;; Emacs can represent raw UTF16 surrogate code units in a string, but
      ;; json-serialize accepts Unicode scalar values only. JSON.stringify
      ;; emits isolated halves as lowercase escapes and paired halves as one
      ;; scalar. Preserve the serializer's rejection of non-Unicode Emacs
      ;; characters rather than treating them as additional UTF16 code units.
      (when (cl-find-if (lambda (unit) (> unit #x10ffff)) value)
        (encode value))
      (with-temp-buffer
        (insert "\"")
        (let ((start 0) (index 0) (size (length value)))
          (while (< index size)
            (let ((unit (aref value index)))
              (if (<= #xd800 unit #xdfff)
                  (progn
                    (when (< start index)
                      (insert (substring (encode (substring value start index)) 1 -1)))
                    (if (and (<= unit #xdbff) (< (1+ index) size)
                             (<= #xdc00 (aref value (1+ index)) #xdfff))
                        (let ((point (+ #x10000 (ash (- unit #xd800) 10)
                                        (- (aref value (1+ index)) #xdc00))))
                          (insert (substring (encode (char-to-string point)) 1 -1))
                          (setq index (+ index 2)))
                      (insert (format "\\u%04x" unit))
                      (setq index (1+ index)))
                    (setq start index))
                (setq index (1+ index)))))
          (when (< start size)
            (insert (substring (encode (substring value start size)) 1 -1))))
        (insert "\"")
        (buffer-string)))))

(defun eliscript-emitter--fresh-name ()
  "Return a fresh internal ECMAScript identifier."
  (setq eliscript-emitter--temporary-counter
        (1+ eliscript-emitter--temporary-counter))
  (format "__eliscript_value_%d" eliscript-emitter--temporary-counter))

(defun eliscript-emitter--indent (text &optional level)
  "Indent every non-empty line in TEXT by LEVEL two-space units."
  (let ((prefix (make-string (* 2 (or level 1)) ?\s)))
    (mapconcat (lambda (line)
                 (if (string-empty-p line) line (concat prefix line)))
               (split-string text "\n")
               "\n")))

(defun eliscript-emitter--require-arity (name arguments minimum &optional maximum)
  "Validate that NAME receives an allowed number of ARGUMENTS."
  (let ((count (length arguments)))
    (when (or (< count minimum)
              (and maximum (> count maximum)))
      (eliscript-emitter--fail
       "%s expects %s argument%s, got %d"
       name
       (if (and maximum (= minimum maximum))
           (number-to-string minimum)
         (format "%d%s" minimum
                 (if maximum (format "..%d" maximum) "+")))
       (if (and maximum (= minimum maximum) (= minimum 1)) "" "s")
       count))))

(defun eliscript-emitter--emit-arguments (arguments)
  "Emit comma-separated ARGUMENTS."
  (mapconcat #'eliscript-emitter-emit-expression arguments ", "))

(defun eliscript-emitter--qualified-apply-callee-p (form)
  "Whether FORM reads a qualified apply property in call position.
Keep references themselves unchanged: custom namespace objects and aliases
must retain their ordinary property identity and receiver."
  (let ((reference (if (and (consp form)
                            (eq (car form) eliscript-emitter--tdz-read-tag))
                       (nth 2 form) form)))
    (and (symbolp reference)
         (string-match-p "[./]apply[./]*\\'" (symbol-name reference)))))

(defun eliscript-emitter--emit-callee (form)
  "Emit FORM in a position where ECMAScript expects a callable value."
  (let ((output (eliscript-emitter-emit-expression form)))
    (cond
     ((eliscript-emitter--qualified-apply-callee-p form)
      ;; The already emitted reference retains its lexical/TDZ root lookup.
      ;; Capture the actual property before arguments, then let the shared
      ;; dispatcher recognize intrinsic Reflect.apply by identity only.
      (format "__eliscript_at(%s, \"apply\")" (substring output 0 -6)))
     ((symbolp form) output)
     (t (format "(%s)" output)))))

(defun eliscript-emitter--binding-pattern-p (form)
  "Return non-nil when FORM is a vector binding pattern."
  (vectorp (eliscript-form-value form)))

(defun eliscript-emitter--emit-binding-target (form)
  "Emit symbol or vector binding FORM as JavaScript syntax."
  (let ((value (eliscript-form-value form)))
    (cond
     ((and value (symbolp value))
      (eliscript-emitter--binding-name value))
     ((vectorp value)
      (let (parts rest-next last-hole)
        (dolist (element (append value nil))
          (let ((element-value (eliscript-form-value element)))
            (cond
             ((eq element-value '&rest) (setq rest-next t))
             (t
              (setq last-hole (null element-value))
              (push
               (if rest-next
                   (concat "..."
                           (eliscript-emitter--emit-binding-target element))
                 (if last-hole
                     ""
                   (eliscript-emitter--emit-binding-target element)))
               parts)
              (setq rest-next nil)))))
        (format "[%s%s]"
                (string-join (nreverse parts) ", ")
                (if last-hole "," ""))))
     (t (eliscript-emitter--fail
         "invalid binding pattern: %S" (eliscript-form-strip form))))))

(defun eliscript-emitter--boolean-p (form)
  "Whether FORM is proven to return a JavaScript boolean."
  (or (memq form '(t false))
      (and (consp form)
           (or (and (eq (car form) 'js*) (= (length form) 2)
                    (stringp (cadr form))
                    (string-match-p "\\`!![A-Za-z_$][A-Za-z0-9_$]*\\'" (string-trim (cadr form))))
               (memq (car form)
                     '(not = /= not= < <= > >= eq equal nil? undefined? null nullish?))
               (and (memq (car form) '(and or)) (cdr form)
                    (cl-every #'eliscript-emitter--boolean-p (cdr form)))))))

(defun eliscript-emitter--emit-test (form)
  "Emit FORM as a condition preserving Lisp truth semantics."
  (let ((output (eliscript-emitter-emit-expression form)))
    (if (eliscript-emitter--boolean-p form) output
      (format "__eliscript_truthy(%s)" output))))

(defun eliscript-emitter--context-sequential-safe-p (bindings)
  "Whether parsed BINDINGS can share a scope without observing a TDZ."
  (when (> (length bindings) 1)
    (let ((names (make-hash-table :test #'equal)) (index 0) (safe t))
      (dolist (binding bindings)
        (let ((name (eliscript-emitter--binding-name (car binding))))
          (if (gethash name names) (setq safe nil)
            (puthash name (1+ index) names)))
        (setq index (1+ index)))
      (cl-labels
          ((walk-pattern (pattern)
             (cond
              ((vectorp pattern)
               (mapc #'walk-pattern (append pattern nil)))
              ((eliscript-binding-map-pattern-p pattern)
               (let ((spec (eliscript-binding-map-spec
                            pattern (lambda (_form message)
                                      (eliscript-emitter--fail "%s" message)))))
                 (dolist (entry (plist-get spec :entries))
                   (walk-pattern (plist-get entry :target))
                   (unless (memq (plist-get entry :key-kind) '(keys strs syms))
                     (walk (plist-get entry :key)))
                   (when (plist-member entry :default)
                     (walk (plist-get entry :default))))))))
           (walk-bindings (nested)
             (dolist (binding nested)
               (if (or (symbolp binding) (vectorp binding)
                       (eliscript-binding-map-pattern-p binding))
                   (walk-pattern binding)
                 (walk-pattern (car binding))
                 (walk (cadr binding)))))
           (walk (form)
             ;; Match references and assignment targets, not syntax names.
             ;; References inside a shadowing function remain conservative, as
             ;; in the independent IR proof; declaration names do not count.
             (when safe
               (cond
                ((and (symbolp form) form (not (keywordp form))
                      (not (memq form '(t false undefined))))
                 (let* ((name (eliscript-emitter--reference-name form))
                        (position (gethash (car (split-string name "\\.")) names)))
                   (when (and position (> position index)) (setq safe nil))))
                ((vectorp form) (mapc #'walk (append form nil)))
                ((consp form)
                 (let ((operator (car form)) (arguments (cdr form)))
                   (cond
                    ((eq operator 'js*) (setq safe nil))
                    ((eq operator 'quote) nil)
                    ((memq operator '(lambda fn async))
                     (dolist (parameter
                              (eliscript-parameters-parse
                               (car arguments)
                               (lambda (_form message)
                                 (eliscript-emitter--fail "%s" message))))
                       (walk-pattern (eliscript-parameter-form parameter)))
                     (mapc #'walk (cdr arguments)))
                    ((memq operator '(let let* loop))
                     (walk-bindings (car arguments))
                     (mapc #'walk (cdr arguments)))
                    ((eq operator 'try)
                     (dolist (clause arguments)
                       (pcase (car-safe clause)
                         ('catch (walk-pattern (cadr clause))
                                 (mapc #'walk (cddr clause)))
                         ('finally (mapc #'walk (cdr clause)))
                         (_ (walk clause)))))
                    ((eq operator 'cond)
                     (dolist (clause arguments) (mapc #'walk clause)))
                    ((eq operator 'js-object)
                     (while arguments
                       (let ((key (pop arguments)) (value (pop arguments)))
                         (unless (or (keywordp key) (stringp key) (symbolp key))
                           (walk key))
                         (walk value))))
                    ((memq operator
                           '(await throw if when unless progn do recur setq set!
                             while and or vector hash-map hash-set queue list js-array
                             not + * - / % mod = /= not= < <= > >= 1+ 1-
                             int32 uint32 imul32 bit-and bit-or bit-xor bit-not
                             bit-shift-left bit-shift-right unsigned-bit-shift-right
                             value-type host-identity-token string-code-unit-at
                             string-from-code-unit string-to-number string-to-bigint
                             number-float64-words eq equal null nil? undefined? nullish?
                             car cdr cons js-cons nth js-nth aref length js-length
                             object-keys object-has? object-assoc __eliscript_arity_error
                             get put js-call new print str funcall apply))
                     (mapc #'walk arguments))
                    (t (mapc #'walk form)))))))))
        (setq index 0)
        (dolist (binding bindings)
          (walk (cadr binding))
          (setq index (1+ index))))
      safe)))

(defun eliscript-emitter--emit-context-let (bindings body sequential returning)
  "Emit parsed simple BINDINGS and BODY without a closure.
Keep initializer and binding scopes separate, including sequential shadowing."
  (if (null bindings)
      (if returning (eliscript-emitter--emit-returning-body body)
        (eliscript-emitter--emit-statement-body body))
    (if (and sequential (eliscript-emitter--context-sequential-safe-p bindings))
        (concat "{\n" (eliscript-emitter--indent
         (string-join
          (append (mapcar (lambda (binding)
                            (concat "let " (eliscript-emitter--emit-binding-target (car binding))
                                    " = " (eliscript-emitter-emit-expression (cadr binding)) ";")) bindings)
                  (list (if returning (eliscript-emitter--emit-returning-body body)
                          (eliscript-emitter--emit-statement-body body)))) "\n")) "\n}")
    (let* ((group (if sequential (list (car bindings)) bindings))
           (temporaries (mapcar (lambda (_) (eliscript-emitter--fresh-name)) group))
           initializers declarations)
      (cl-mapc
       (lambda (binding temporary)
         (push (format "const %s = %s;" temporary
                       (eliscript-emitter-emit-expression (cadr binding)))
               initializers)) group temporaries)
      (cl-mapc
       (lambda (binding temporary)
         (push (format "let %s = %s;"
                       (eliscript-emitter--emit-binding-target (car binding)) temporary)
               declarations)) group temporaries)
      (push (eliscript-emitter--emit-context-let
             (and sequential (cdr bindings)) body sequential returning) declarations)
      (concat "{\n"
              (eliscript-emitter--indent
               (string-join
                (append (nreverse initializers)
                        (list (concat "{\n"
                                      (eliscript-emitter--indent
                                       (string-join (nreverse declarations) "\n"))
                                      "\n}"))) "\n"))
              "\n}")))))

(defun eliscript-emitter--emit-context-cond (clauses returning)
  "Emit CLAUSES as statements or RETURNING values."
  (let ((result (if returning "return null;" "")) frames)
    (while clauses
      (let* ((clause (pop clauses)) (test (car clause)) (body (cdr clause)))
        (if (eq test t)
            (setq result (if returning (eliscript-emitter--emit-returning-body body)
                           (eliscript-emitter--emit-statement-body body))
                  clauses nil)
          (let ((condition (eliscript-emitter--emit-test test))
                (consequent (if returning (eliscript-emitter--emit-returning-body body)
                              (eliscript-emitter--emit-statement-body body))))
            (push (list condition consequent) frames)))))
    (dolist (frame frames)
      (setq result (concat "if (" (car frame) ") {\n"
                           (eliscript-emitter--indent (cadr frame))
                           "\n} else {\n" (eliscript-emitter--indent result) "\n}")))
    result))

(defun eliscript-emitter--run-depth-plan (adapter mode value options)
  "Run ADAPTER's emission continuations without nesting host Lisp calls.
Children finish in source order; a continuation may schedule another stage
when temporary allocation or binding setup must occur between child groups."
  (let* ((result (list nil))
         (pending (list (list :visit mode value options result))))
    (while pending
      (let ((job (pop pending)))
        (pcase (car job)
          (:visit
           (push (list :plan (funcall adapter (nth 1 job) (nth 2 job) (nth 3 job))
                       (nth 4 job)) pending))
          (:plan
           (let ((plan (nth 1 job)) (output (nth 2 job)))
             (if (eq (car plan) :value)
                 (setcar output (nth 1 plan))
               (let* ((specs (nth 1 plan))
                      (cells (mapcar (lambda (_spec) (list nil)) specs)))
                 (push (list :combine (nth 2 plan) cells output) pending)
                 (let ((pairs (cl-mapcar #'cons specs cells)))
                   (dolist (pair (nreverse pairs))
                     (let ((spec (car pair)))
                       (push (list :visit (nth 0 spec) (nth 1 spec) (nth 2 spec) (cdr pair))
                             pending))))))))
          (:combine
           (push (list :plan (funcall (nth 1 job) (mapcar #'car (nth 2 job)))
                       (nth 3 job)) pending)))))
    (car result)))

(defun eliscript-emitter--emit-context (form returning)
  "Emit FORM using explicit continuations for ordinary conditional trees."
  (if (and (consp form) (memq (car form) '(if let let* progn do))
           (not (eliscript-emitter--contains-await-p form)))
      (eliscript-emitter--run-depth-plan #'eliscript-emitter--depth-plan :context form returning)
    (eliscript-emitter--emit-context-recursive form returning)))

(defun eliscript-emitter--depth-plan (mode value options)
  "Describe an ordinary form emission step without recursing into its tree."
  (pcase mode
    (:value (list :value value))
    (:expression
     (if (and (consp value) (eq (car value) 'if))
         (let ((arguments (cdr value)))
           (eliscript-emitter--require-arity "if" arguments 2 3)
           (list :children (mapcar (lambda (form) (list :expression form nil))
                                   (list (nth 0 arguments) (nth 1 arguments) (nth 2 arguments)))
                 (lambda (results)
                   (list :value (format "(%s ? %s : %s)"
                                         (if (eliscript-emitter--boolean-p (car arguments)) (nth 0 results)
                                           (format "__eliscript_truthy(%s)" (nth 0 results)))
                                         (nth 1 results) (nth 2 results))))))
       (list :value (eliscript-emitter--emit-expression-recursive value))))
    (:body
     (if (null value) (list :value (if options "return null;" ""))
       (let ((remaining value) specs)
         (while remaining
           (push (list :context (car remaining) (and options (null (cdr remaining)))) specs)
           (setq remaining (cdr remaining)))
         (list :children (nreverse specs)
               (lambda (results) (list :value (string-join results "\n")))))))
    (:declaration
     (let ((name (eliscript-emitter--emit-binding-target (car value))))
       (list :children (list (list :expression (cadr value) nil))
             (lambda (results) (list :value (concat "let " name " = " (car results) ";"))))))
    (:context-let
     (let ((bindings (nth 0 value)) (body (nth 1 value)) (sequential (nth 2 value)))
       (cond
        ((null bindings) (list :children (list (list :body body options))
                               (lambda (results) (list :value (car results)))))
        ((and sequential (eliscript-emitter--context-sequential-safe-p bindings))
         (list :children (append (mapcar (lambda (binding) (list :declaration binding nil)) bindings)
                                 (list (list :body body options)))
               (lambda (results)
                 (list :value (concat "{\n" (eliscript-emitter--indent (string-join results "\n")) "\n}")))))
        (t
         (let* ((group (if sequential (list (car bindings)) bindings))
                (temporaries (mapcar (lambda (_binding) (eliscript-emitter--fresh-name)) group)))
           (list :children (mapcar (lambda (binding) (list :expression (cadr binding) nil)) group)
                 (lambda (results)
                   (let ((initializers (cl-mapcar (lambda (temporary text) (format "const %s = %s;" temporary text)) temporaries results))
                         (declarations (cl-mapcar (lambda (binding temporary)
                                                  (format "let %s = %s;" (eliscript-emitter--emit-binding-target (car binding)) temporary)) group temporaries)))
                     (list :children (list (list :context-let (list (and sequential (cdr bindings)) body sequential) options))
                           (lambda (tail)
                             (list :value
                                   (concat "{\n" (eliscript-emitter--indent
                                                   (string-join
                                                    (append initializers
                                                            (list (concat "{\n" (eliscript-emitter--indent
                                                                                 (string-join (append declarations tail) "\n")) "\n}"))) "\n")) "\n}"))))))))))))
    (:context
     (let ((operator (and (consp value) (car value))) (arguments (and (consp value) (cdr value))))
       (cond
        ((eliscript-emitter--contains-await-p value)
         (list :value (eliscript-emitter--emit-context-recursive value options)))
        ((memq operator '(progn do))
         (list :children (list (list :body arguments options))
               (lambda (results) (list :value (car results)))))
        ((eq operator 'if)
         (list :children
               (list (list :expression (nth 0 arguments) nil)
                     (list :context (nth 1 arguments) options)
                     (if (nthcdr 2 arguments) (list :context (nth 2 arguments) options)
                       (list :value (if options "return null;" "") nil)))
               (lambda (results)
                 (list :value
                       (concat "if (" (if (eliscript-emitter--boolean-p (car arguments)) (nth 0 results)
                                          (format "__eliscript_truthy(%s)" (nth 0 results))) ") {\n"
                               (eliscript-emitter--indent (nth 1 results)) "\n}"
                               (if (or options (nthcdr 2 arguments))
                                   (concat " else {\n" (eliscript-emitter--indent (nth 2 results)) "\n}") ""))))))
        ((and (memq operator '(let let*))
              (let ((parsed (mapcar #'eliscript-emitter--parse-binding (car arguments))))
                (cl-every (lambda (binding) (symbolp (car binding))) parsed)))
         (list :children
               (list (list :context-let
                           (list (mapcar #'eliscript-emitter--parse-binding (car arguments))
                                 (cdr arguments) (eq operator 'let*)) options))
               (lambda (results) (list :value (car results)))))
        (t (list :value (eliscript-emitter--emit-context-recursive value options))))))
    (_ (error "unknown form emission continuation mode: %S" mode))))

(defun eliscript-emitter--emit-context-recursive (form returning)
  "Emit FORM as a statement or a RETURNING body value."
  (let ((operator (and (consp form) (car form)))
        (arguments (and (consp form) (cdr form))))
    (cond
     ((eliscript-emitter--contains-await-p form)
      (concat (if returning "return " "") (eliscript-emitter-emit-expression form) ";"))
     ((memq operator '(progn do))
      (if returning (eliscript-emitter--emit-returning-body arguments)
        (eliscript-emitter--emit-statement-body arguments)))
     ((eq operator 'if)
      (concat "if (" (eliscript-emitter--emit-test (car arguments)) ") {\n"
              (eliscript-emitter--indent
               (eliscript-emitter--emit-context (nth 1 arguments) returning))
              "\n}"
              (if (or returning (nthcdr 2 arguments))
                  (concat " else {\n" (eliscript-emitter--indent
                   (if (nthcdr 2 arguments)
                       (eliscript-emitter--emit-context (nth 2 arguments) returning)
                     "return null;")) "\n}") "")))
     ((memq operator '(when unless))
      (concat "if ("
              (if (eq operator 'when) (eliscript-emitter--emit-test (car arguments))
                (concat "(!" (eliscript-emitter--emit-test (car arguments)) ")"))
              ") {\n"
              (eliscript-emitter--indent
               (if returning (eliscript-emitter--emit-returning-body (cdr arguments))
                 (eliscript-emitter--emit-statement-body (cdr arguments))))
              "\n}" (if returning " else {\n  return null;\n}" "")))
     ((eq operator 'cond)
      (eliscript-emitter--emit-context-cond arguments returning))
     ((eq operator 'while)
      (eliscript-emitter--require-arity "while" arguments 1)
      (concat "while (" (eliscript-emitter--emit-test (car arguments)) ") {\n"
              (eliscript-emitter--indent
               (eliscript-emitter--emit-statement-body (cdr arguments)))
              "\n}" (if returning "\nreturn null;" "")))
     ((and (memq operator '(let let*))
           (let ((parsed (mapcar #'eliscript-emitter--parse-binding (car arguments))))
             (cl-every (lambda (binding) (symbolp (car binding))) parsed)))
      (eliscript-emitter--emit-context-let
       (mapcar #'eliscript-emitter--parse-binding (car arguments))
       (cdr arguments) (eq operator 'let*) returning))
     (t (concat (if returning "return " "")
                (eliscript-emitter-emit-expression form) ";")))))

(defun eliscript-emitter--emit-returning-body (forms)
  "Emit FORMS as a block body that returns its final value."
  (if (null forms) "return null;"
    (string-join
     (append (mapcar (lambda (form) (eliscript-emitter--emit-context form nil))
                     (butlast forms))
             (list (eliscript-emitter--emit-context (car (last forms)) t)))
     "\n")))

(defun eliscript-emitter--emit-statement-body (forms)
  "Emit FORMS as statements whose values are discarded."
  (mapconcat (lambda (form) (eliscript-emitter--emit-context form nil)) forms "\n"))

(defun eliscript-emitter--some-form (forms predicate &optional excluded)
  "Find PREDICATE in source preorder without recursive host calls.
EXCLUDED operators prune their complete forms after the node predicate."
  (let ((pending (list (cons :sequence forms))) found)
    (while (and pending (not found))
      (let* ((job (pop pending)) (value (cdr job)))
        (if (eq (car job) :sequence)
            (when value
              (unless (consp value) (signal 'wrong-type-argument (list 'listp value)))
              (push (cons :sequence (cdr value)) pending)
              (push (cons :node (car value)) pending))
          (setq found (funcall predicate value))
          (unless found
            (cond ((vectorp value) (push (cons :sequence (append value nil)) pending))
                  ((and (consp value) (not (memq (car value) excluded)))
                   (push (cons :sequence value) pending)))))))
    found))

(defun eliscript-emitter--contains-await-p (form)
  "Return non-nil when FORM contains await outside nested functions."
  (eliscript-emitter--some-form (list form)
    (lambda (node) (and (consp node) (eq (car node) 'await))) '(lambda fn async)))

(defun eliscript-emitter--emit-iife
    (parameters body arguments asynchronous)
  "Emit an IIFE with PARAMETERS, BODY, ARGUMENTS, and ASYNCHRONOUS mode."
  (if asynchronous
      (format "(await (async (%s) => {\n%s\n})(%s))"
              parameters body arguments)
    (format "((%s) => {\n%s\n})(%s)" parameters body arguments)))

(defun eliscript-emitter--emit-do (forms)
  "Emit FORMS as one value-producing expression."
  (pcase (length forms)
    (0 "null")
    (1 (eliscript-emitter-emit-expression (car forms)))
    (_ (eliscript-emitter--emit-iife
        ""
        (eliscript-emitter--indent
         (eliscript-emitter--emit-returning-body forms))
        ""
        (eliscript-emitter--contains-await-p forms)))))

(defun eliscript-emitter--parse-binding (binding)
  "Return the name and initializer represented by BINDING."
  (cond
   ((or (symbolp binding) (vectorp binding)) (list binding nil))
   ((and (listp binding) (<= 1 (length binding)) (<= (length binding) 2)
         (or (symbolp (car binding)) (vectorp (car binding))))
    (list (car binding) (cadr binding)))
   (t (eliscript-emitter--fail "invalid let binding: %S" binding))))

(defun eliscript-emitter--emit-let (arguments sequential)
  "Emit let ARGUMENTS, using sequential semantics when SEQUENTIAL is non-nil."
  (eliscript-emitter--require-arity (if sequential "let*" "let") arguments 1)
  (let ((bindings (car arguments))
        (body (cdr arguments)))
    (unless (listp bindings)
      (eliscript-emitter--fail "let bindings must be a list"))
    (if sequential
        (if (null bindings)
            (eliscript-emitter--emit-do body)
          (eliscript-emitter--emit-let
           (list (list (car bindings))
                 (cons 'let* (cons (cdr bindings) body)))
           nil))
      (let* ((parsed (mapcar #'eliscript-emitter--parse-binding bindings))
             (names (mapcar (lambda (item)
                              (eliscript-emitter--emit-binding-target
                               (car item)))
                            parsed))
             (values (mapcar (lambda (item)
                               (if (and (null (cadr item))
                                        (eliscript-emitter--binding-pattern-p
                                         (car item)))
                                   "[]"
                                 (eliscript-emitter-emit-expression
                                  (cadr item))))
                             parsed)))
        (eliscript-emitter--emit-iife
         (string-join names ", ")
         (eliscript-emitter--indent
          (eliscript-emitter--emit-returning-body body))
         (string-join values ", ")
         (eliscript-emitter--contains-await-p body))))))

(defun eliscript-emitter--emit-function (arguments body &optional asynchronous)
  "Emit a function with ARGUMENTS and BODY.

Prefix the function with `async' when ASYNCHRONOUS is non-nil."
  (let ((parameters
         (eliscript-parameters-parse
          arguments
          (lambda (_form message) (eliscript-emitter--fail "%s" message)))))
    (format "(%s(%s) => {\n%s\n})"
            (if asynchronous "async " "")
            (mapconcat #'eliscript-emitter--emit-parameter parameters ", ")
            (eliscript-emitter--indent
             (eliscript-emitter--emit-function-body parameters body)))))

(defun eliscript-emitter--contains-function-recur-p (form)
  "Return non-nil when FORM recurs outside nested functions or loops."
  (eliscript-emitter--some-form (list form)
    (lambda (node) (and (consp node) (eq (car node) 'recur))) '(lambda fn async loop)))

(defun eliscript-emitter--emit-rebinding-target (binding temporary)
  "Assign TEMPORARY to mutable BINDING, including a vector pattern."
  (let ((target (eliscript-emitter--emit-binding-target binding)))
    (if (eliscript-emitter--binding-pattern-p binding)
        (format "(%s = %s);" target temporary)
      (format "%s = %s;" target temporary))))

(defun eliscript-emitter--emit-recur-tail (arguments target)
  "Emit tail recur ARGUMENTS for TARGET."
  (let ((bindings (plist-get target :bindings)))
    (unless (= (length arguments) (length bindings))
      (eliscript-emitter--fail
       "recur expects %d arguments, got %d"
       (length bindings) (length arguments)))
    (let ((temporaries
           (mapcar (lambda (_argument) (eliscript-emitter--fresh-name))
                   arguments))
          parts)
      (cl-mapc
       (lambda (temporary argument)
         (push (format "const %s = %s;"
                       temporary
                       (eliscript-emitter-emit-expression argument))
               parts))
       temporaries arguments)
      (cl-mapc
       (lambda (binding temporary)
         (push (eliscript-emitter--emit-rebinding-target binding temporary)
               parts))
       bindings temporaries)
      (push (format "continue %s;" (plist-get target :label)) parts)
      (string-join (nreverse parts) "\n"))))

(defun eliscript-emitter--emit-tail-body (forms target)
  "Emit FORMS so their final value returns or recurs to TARGET."
  (if (null forms)
      "return null;"
    (string-join
     (append
      (mapcar
       (lambda (form)
         (concat (eliscript-emitter-emit-expression form) ";"))
       (butlast forms))
      (list (eliscript-emitter--emit-tail-form (car (last forms)) target)))
     "\n")))

(defun eliscript-emitter--emit-tail-cond (clauses target)
  "Emit conditional CLAUSES in recur-aware tail position for TARGET."
  (let ((result "return null;") frames)
    (while clauses
      (let ((clause (pop clauses)))
      (unless (and (listp clause) clause)
        (eliscript-emitter--fail "cond clause must be a non-empty list"))
      (let ((test (car clause))
            (body (cdr clause)))
        (if (eq test t)
            (setq result (eliscript-emitter--emit-tail-body body target) clauses nil)
          (let ((condition (eliscript-emitter-emit-expression test))
                (consequent (eliscript-emitter--emit-tail-body body target)))
            (push (list condition consequent) frames))))))
    (dolist (frame frames)
      (setq result (format "if (__eliscript_truthy(%s)) {\n%s\n} else {\n%s\n}"
                           (car frame) (eliscript-emitter--indent (cadr frame))
                           (eliscript-emitter--indent result))))
    result))

(defun eliscript-emitter--emit-tail-let (arguments sequential target)
  "Emit lexical ARGUMENTS in tail position for TARGET."
  (eliscript-emitter--require-arity (if sequential "let*" "let") arguments 1)
  (let ((bindings (car arguments))
        (body (cdr arguments))
        parts)
    (unless (listp bindings)
      (eliscript-emitter--fail "let bindings must be a list"))
    (let ((parsed (mapcar #'eliscript-emitter--parse-binding bindings)))
      (if sequential
          (dolist (binding parsed)
            (let ((target-form (car binding))
                  (initializer (cadr binding)))
              (push
               (format "let %s = %s;"
                       (eliscript-emitter--emit-binding-target target-form)
                       (if initializer
                           (eliscript-emitter-emit-expression initializer)
                         (if (eliscript-emitter--binding-pattern-p target-form)
                             "[]" "null")))
               parts)))
        (let ((temporaries
               (mapcar (lambda (_binding) (eliscript-emitter--fresh-name))
                       parsed)))
          (cl-mapc
           (lambda (binding temporary)
             (let ((target-form (car binding))
                   (initializer (cadr binding)))
               (push
                (format "const %s = %s;"
                        temporary
                        (if initializer
                            (eliscript-emitter-emit-expression initializer)
                          (if (eliscript-emitter--binding-pattern-p target-form)
                              "[]" "null")))
                parts)))
           parsed temporaries)
          (cl-mapc
           (lambda (binding temporary)
             (push
              (format "let %s = %s;"
                      (eliscript-emitter--emit-binding-target (car binding))
                      temporary)
              parts))
           parsed temporaries)))
      (push (eliscript-emitter--emit-tail-body body target) parts)
      (format "{\n%s\n}"
              (eliscript-emitter--indent
               (string-join (nreverse parts) "\n"))))))

(defun eliscript-emitter--assemble-tail-short-circuit (frames kind result)
  "Assemble emitted FRAMES and final RESULT of tail short-circuit KIND.
FRAMES are in reverse evaluation order.  Indent each fragment at its final
depth once, rather than copying and reindenting the growing nested suffix."
  (if (null frames) result
    (with-temp-buffer
      (let ((depth 0))
        (cl-labels ((line (level text)
                     (unless (= (point) (point-min)) (insert "\n"))
                     (insert (if (= level 0) text
                               (eliscript-emitter--indent text level)))))
          (dolist (frame (reverse frames))
            (let ((temporary (car frame)))
              (line depth (format "const %s = %s;" temporary (cadr frame)))
              (line depth (format "if (__eliscript_truthy(%s)) {" temporary))
              (when (eq kind 'or)
                (line (1+ depth) (format "return %s;" temporary))
                (line depth "} else {"))
              (setq depth (1+ depth))))
          (line depth result)
          (dolist (frame frames)
            (setq depth (1- depth))
            (when (eq kind 'and)
              (line depth "} else {")
              (line (1+ depth) (format "return %s;" (car frame))))
            (line depth "}"))))
      (buffer-string))))

(defun eliscript-emitter--emit-tail-short-circuit (arguments kind target)
  "Emit recur-aware short-circuit ARGUMENTS of KIND for TARGET."
  (let (frames result)
    (while (cdr arguments)
      (let ((temporary (eliscript-emitter--fresh-name))
            (first (eliscript-emitter-emit-expression (pop arguments))))
        (push (list temporary first) frames)))
    (setq result (if arguments (eliscript-emitter--emit-tail-form (car arguments) target)
                   (format "return %s;" (if (eq kind 'and) "true" "null"))))
    (eliscript-emitter--assemble-tail-short-circuit frames kind result)))

(defun eliscript-emitter--emit-tail-form (form target)
  "Emit FORM in a tail position controlled by TARGET."
  (if (not (consp form))
      (format "return %s;" (eliscript-emitter-emit-expression form))
    (let ((operator (car form))
          (arguments (cdr form)))
      (pcase operator
        ('recur (eliscript-emitter--emit-recur-tail arguments target))
        ('if
         (eliscript-emitter--require-arity "if" arguments 2 3)
         (format "if (__eliscript_truthy(%s)) {\n%s\n} else {\n%s\n}"
                 (eliscript-emitter-emit-expression (nth 0 arguments))
                 (eliscript-emitter--indent
                  (eliscript-emitter--emit-tail-form
                   (nth 1 arguments) target))
                 (eliscript-emitter--indent
                  (if (nth 2 arguments)
                      (eliscript-emitter--emit-tail-form
                       (nth 2 arguments) target)
                    "return null;"))))
        ((or 'when 'unless)
         (eliscript-emitter--require-arity (symbol-name operator) arguments 1)
         (format "if (%s__eliscript_truthy(%s)) {\n%s\n} else {\n  return null;\n}"
                 (if (eq operator 'when) "" "!")
                 (eliscript-emitter-emit-expression (car arguments))
                 (eliscript-emitter--indent
                  (eliscript-emitter--emit-tail-body
                   (cdr arguments) target))))
        ('cond (eliscript-emitter--emit-tail-cond arguments target))
        ((or 'progn 'do)
         (eliscript-emitter--emit-tail-body arguments target))
        ('let (eliscript-emitter--emit-tail-let arguments nil target))
        ('let* (eliscript-emitter--emit-tail-let arguments t target))
        ('and
         (eliscript-emitter--emit-tail-short-circuit arguments 'and target))
        ('or
         (eliscript-emitter--emit-tail-short-circuit arguments 'or target))
        (_ (format "return %s;"
                   (eliscript-emitter-emit-expression form)))))))

(defvar eliscript-emitter--numeric-profile nil)

(defun eliscript-emitter--scalar-proof-plan (model mode value context)
  "Prove scalar operations with explicit scope and short-circuit actions."
  (let ((scope (car context)) (state (cadr context)))
    (pcase mode
      (:value (list :value value))
      (:every
       (if (null value) (list :value t)
         (list :children (list (list :node (car value) context))
               (lambda (results)
                 (if (car results)
                     (list :children (list (list :every (cdr value) context))
                           (lambda (tail) (list :value (car tail))))
                   (list :value nil))))))
      (:bindings
       (let ((remaining (nth 0 value)) (inner (nth 1 value)) (forms (nth 2 value))
             (sequential (nth 3 value)) (valid (nth 4 value)))
         (if (null remaining)
             (if valid (list :children (list (list :every forms (list inner state)))
                             (lambda (results) (list :value (car results)))) (list :value nil))
           (let* ((binding (car remaining))
                  (target (if (eq model 'ir) (eliscript-ir-node-value binding)
                            (if (consp binding) (car binding) binding)))
                  (initializer (if (eq model 'ir) (eliscript-ir-emitter--binding-initializer binding)
                                 (and (consp binding) (cadr binding))))
                  (shape (if (eq model 'ir)
                             (and (eq (eliscript-ir-node-kind binding) 'lexical-binding)
                                  (not (eliscript-ir-property binding :pattern)))
                           (and (symbolp target) (or (symbolp binding)
                                (and (proper-list-p binding) (<= 1 (length binding) 2)))))))
             (list :children (list (if shape (list :node initializer (list (if sequential inner scope) state))
                                    (list :value nil context)))
                   (lambda (results)
                     (list :children (list (list :bindings
                              (list (cdr remaining) (cons target inner) forms sequential (and valid (car results))) context))
                           (lambda (tail) (list :value (car tail))))))))))
      (:pairs
       (if (null value) (list :value t)
         (let* ((ir (eq model 'ir)) (pair (if ir (car value) value))
                (target (if ir (eliscript-ir-node-value pair) (car pair)))
                (shape (and (or (not ir) (eq (eliscript-ir-node-kind pair) 'assignment-pair)) (memq target scope)))
                (operand (if ir (car (eliscript-ir-node-children pair)) (cadr pair))))
           (list :children (list (if shape (list :node operand context) (list :value nil context)))
                 (lambda (results)
                   (if (and ir (not (car results))) (list :value nil)
                     (list :children (list (list :pairs (if ir (cdr value) (cddr value)) context))
                           (lambda (tail) (list :value (and (car results) (car tail)))))))))))
      (:node
       (if (eq model 'ir)
           (if (null value) (list :value t)
             (let ((kind (eliscript-ir-node-kind value)) (datum (eliscript-ir-node-value value))
                   (children (eliscript-ir-emitter--children value)))
               (pcase kind
                 ('literal (list :value (or (numberp datum) (memq datum '(nil t false undefined)))))
                 ('reference (list :value (memq datum scope)))
                 ('lexical-bindings
                  (let ((split (eliscript-ir-emitter--split-counted-children value :binding-count)))
                    (list :children (list (list :bindings (list (car split) scope (cadr split)
                                        (eliscript-ir-property value :sequential) t) context))
                          (lambda (results) (list :value (car results))))))
                 ('assignment (list :children (list (list :pairs children context))
                                    (lambda (results) (list :value (car results)))))
                 ((or 'intrinsic 'conditional 'conditional-sugar 'short-circuit 'sequence 'loop)
                  (when (eq kind 'loop) (setcar state t))
                  (if (and (or (not (eq kind 'intrinsic))
                               (memq datum '(+ - * / % mod 1+ 1- = eq < <= > >= /= not= not)))
                           (or (not (and (eq kind 'intrinsic) (memq datum '(< <= > >=)))) (= (length children) 2)))
                      (list :children (list (list :every children context)) (lambda (results) (list :value (car results))))
                    (list :value nil)))
                 (_ (list :value nil)))))
         (cond
          ((or (numberp value) (memq value '(nil t false undefined))) (list :value t))
          ((symbolp value) (list :value (memq value scope)))
          ((consp value)
           (let ((operator (car value)) (arguments (cdr value)))
             (cond
              ((memq operator '(let let*))
               (list :children (list (list :bindings (list (car arguments) scope (cdr arguments) (eq operator 'let*) t) context))
                     (lambda (results) (list :value (car results)))))
              ((memq operator '(setq set!)) (list :children (list (list :pairs arguments context))
                                                (lambda (results) (list :value (car results)))))
              ((memq operator '(+ - * / % mod 1+ 1- = eq < <= > >= /= not= not and or if when unless progn do while))
               (when (eq operator 'while) (setcar state t))
               (if (or (not (memq operator '(< <= > >=))) (= (length arguments) 2))
                   (list :children (list (list :every arguments context)) (lambda (results) (list :value (car results))))
                 (list :value nil)))
              (t (list :value nil)))))
          (t (list :value nil)))))
      (_ (error "unknown scalar proof continuation: %S" mode)))))

(defun eliscript-emitter--closed-scalar-loop-p (names body)
  "Prove the original scalar subset without recursive expression scans."
  (when names
    (let* ((state (list nil))
           (valid (eliscript-emitter--run-depth-plan
                   (lambda (mode value context) (eliscript-emitter--scalar-proof-plan 'form mode value context))
                   :every body (list names state))))
      (and valid (car state)))))

(defun eliscript-emitter--emit-function-body (parameters body)
  "Version closed scalar loops behind one Number guard per parameter."
  (let ((names (mapcar #'eliscript-parameter-form parameters)))
    (if (and (not eliscript-emitter--numeric-profile)
             (cl-every (lambda (p) (eq (eliscript-parameter-kind p) 'required)) parameters)
             (cl-every #'symbolp names)
             (eliscript-emitter--closed-scalar-loop-p names body))
        (let ((fast (let ((eliscript-emitter--numeric-profile t))
                      (eliscript-emitter--emit-function-body-unversioned parameters body)))
              (slow (eliscript-emitter--emit-function-body-unversioned parameters body)))
          (format "if (%s) {\n%s\n} else {\n%s\n}"
                  (mapconcat (lambda (name) (format "typeof %s === \"number\""
                                                    (eliscript-emitter--binding-name name))) names " && ")
                  (eliscript-emitter--indent fast) (eliscript-emitter--indent slow)))
      (eliscript-emitter--emit-function-body-unversioned parameters body))))

(defun eliscript-emitter--emit-function-body-unversioned (parameters body)
  "Emit function BODY with recur-aware PARAMETER rebinding when required."
  (if (not (eliscript-emitter--contains-function-recur-p body))
      (eliscript-emitter--emit-returning-body body)
    (let* ((label (eliscript-emitter--fresh-name))
           (target
            (list :bindings
                  (mapcar #'eliscript-parameter-form parameters)
                  :label label)))
      (format "%s: while (true) {\n%s\n}"
              label
              (eliscript-emitter--indent
               (eliscript-emitter--emit-tail-body body target))))))

(defun eliscript-emitter--emit-binding-loop (arguments)
  "Emit recur-capable lexical binding loop ARGUMENTS."
  (eliscript-emitter--require-arity "loop" arguments 1)
  (let ((bindings (car arguments))
        (body (cdr arguments)))
    (unless (listp bindings)
      (eliscript-emitter--fail "loop bindings must be a list"))
    (let (targets initializers)
      (dolist (binding bindings)
        (unless (and (listp binding) (= (length binding) 2)
                     (or (symbolp (car binding)) (vectorp (car binding))))
          (eliscript-emitter--fail
           "loop binding must contain a target and initializer: %S" binding))
        (push (car binding) targets)
        (push (cadr binding) initializers))
      (setq targets (nreverse targets)
            initializers (nreverse initializers))
      (let* ((label (eliscript-emitter--fresh-name))
             (target (list :bindings targets :label label)))
        (eliscript-emitter--emit-iife
         (mapconcat #'eliscript-emitter--emit-binding-target targets ", ")
         (eliscript-emitter--indent
          (format "%s: while (true) {\n%s\n}"
                  label
                  (eliscript-emitter--indent
                   (eliscript-emitter--emit-tail-body body target))))
         (mapconcat #'eliscript-emitter-emit-expression initializers ", ")
         (eliscript-emitter--contains-await-p body))))))

(defun eliscript-emitter--emit-parameter (parameter)
  "Emit parsed function PARAMETER."
  (let* ((form (eliscript-parameter-form parameter))
         (name (eliscript-emitter--emit-binding-target form))
         (pattern (eliscript-emitter--binding-pattern-p form)))
    (pcase (eliscript-parameter-kind parameter)
      ('optional (format "%s = %s" name (if pattern "[]" "null")))
      ('rest (format "...%s" name))
      (_ name))))

(defun eliscript-emitter--emit-if (arguments)
  "Emit an if expression from ARGUMENTS."
  (eliscript-emitter--require-arity "if" arguments 2 3)
  (format "(%s ? %s : %s)"
          (eliscript-emitter--emit-test (nth 0 arguments))
          (eliscript-emitter-emit-expression (nth 1 arguments))
          (eliscript-emitter-emit-expression (nth 2 arguments))))

(defun eliscript-emitter--emit-cond (clauses)
  "Emit nested conditional expressions for CLAUSES."
  (let ((result "null") frames)
    (while clauses
      (let ((clause (pop clauses)))
      (unless (and (listp clause) clause)
        (eliscript-emitter--fail "invalid cond clause: %S" clause))
      (let ((test (car clause))
            (body (cdr clause)))
        (if (eq test t)
            (setq result (eliscript-emitter--emit-do body) clauses nil)
          (let ((condition (eliscript-emitter--emit-test test))
                (consequent (eliscript-emitter--emit-do body)))
            (push (list condition consequent) frames))))))
    (dolist (frame frames)
      (setq result (format "(%s ? %s : %s)" (car frame) (cadr frame) result)))
    result))

(defun eliscript-emitter--try-clause-operator (form)
  "Return FORM's try clause operator, or nil."
  (and (proper-list-p form)
       form
       (symbolp (car form))
       (car form)))

(defun eliscript-emitter--emit-throw (arguments)
  "Emit a throw expression from ARGUMENTS."
  (eliscript-emitter--require-arity "throw" arguments 1 1)
  (let ((temporary (eliscript-emitter--fresh-name)))
    (format "((%s) => { throw %s; })(%s)"
            temporary temporary
            (eliscript-emitter-emit-expression (car arguments)))))

(defun eliscript-emitter--emit-try (arguments)
  "Emit value-producing try ARGUMENTS."
  (let (body catch-name catch-body finally-body
             clauses-started catch-seen finally-seen)
    (dolist (argument arguments)
      (pcase (eliscript-emitter--try-clause-operator argument)
        ('catch
         (when catch-seen
           (eliscript-emitter--fail
            "try accepts at most one catch clause"))
         (when finally-seen
           (eliscript-emitter--fail "catch must precede finally"))
         (unless (and (cdr argument)
                      (let ((binding (cadr argument)))
                        (or (and binding (symbolp binding))
                            (vectorp binding))))
           (eliscript-emitter--fail
            "catch requires a binding symbol or vector"))
         (setq clauses-started t
               catch-seen t
               catch-name (cadr argument)
               catch-body (cddr argument)))
        ('finally
         (when finally-seen
           (eliscript-emitter--fail
            "try accepts at most one finally clause"))
         (setq clauses-started t
               finally-seen t
               finally-body (cdr argument)))
        (_
         (if clauses-started
             (eliscript-emitter--fail
              "try body forms must precede catch and finally clauses")
           (setq body (append body (list argument)))))))
    (unless (or catch-seen finally-seen)
      (eliscript-emitter--fail "try requires a catch or finally clause"))
    (let ((try-block
           (concat
            "try {\n"
            (eliscript-emitter--indent
             (eliscript-emitter--emit-returning-body body))
            "\n}"
            (if catch-seen
                (concat
                 " catch ("
                 (eliscript-emitter--emit-binding-target catch-name)
                 ") {\n"
                 (eliscript-emitter--indent
                  (eliscript-emitter--emit-returning-body catch-body))
                 "\n}")
              "")
            (if finally-seen
                (concat
                 " finally {\n"
                 (eliscript-emitter--indent
                  (eliscript-emitter--emit-statement-body finally-body))
                 "\n}")
              ""))))
      (eliscript-emitter--emit-iife
       "" (eliscript-emitter--indent try-block) ""
       (eliscript-emitter--contains-await-p arguments)))))

(defun eliscript-emitter--emit-while (arguments)
  "Emit a value-producing while expression from ARGUMENTS."
  (eliscript-emitter--require-arity "while" arguments 1)
  (let ((test (car arguments))
        (body (cdr arguments)))
    (eliscript-emitter--emit-iife
     ""
     (eliscript-emitter--indent
      (concat
       (format "while (%s) {\n"
               (eliscript-emitter--emit-test test))
       (eliscript-emitter--indent
        (eliscript-emitter--emit-statement-body body))
       "\n}\nreturn null;"))
     ""
     (eliscript-emitter--contains-await-p arguments))))

(defun eliscript-emitter--emit-setq (arguments)
  "Emit assignments represented by setq ARGUMENTS."
  (when (or (null arguments) (= (% (length arguments) 2) 1))
    (eliscript-emitter--fail "setq expects one or more name/value pairs"))
  (let (assignments)
    (while arguments
      (let ((name (pop arguments))
            (value (pop arguments)))
        (push (format "(%s = %s)"
                      (eliscript-emitter--binding-name name)
                      (eliscript-emitter-emit-expression value))
              assignments)))
    (format "(%s)" (string-join (nreverse assignments) ", "))))

(defun eliscript-emitter--emit-short-circuit (arguments kind)
  "Emit Lisp-style short-circuit ARGUMENTS for KIND, either and or or."
  (let (frames result done)
    (while (not done)
      (cond
       ((null arguments) (setq result (if (eq kind 'and) "true" "null") done t))
       ((null (cdr arguments))
        (setq result (eliscript-emitter-emit-expression (car arguments)) done t))
       ((and (cl-every #'eliscript-emitter--boolean-p arguments)
             (not (eliscript-emitter--contains-await-p arguments)))
        (setq result (format "(%s)" (mapconcat #'eliscript-emitter-emit-expression arguments
                                               (if (eq kind 'and) " && " " || ")))
              done t))
       (t
        (let ((temporary (eliscript-emitter--fresh-name))
              (first (eliscript-emitter-emit-expression (car arguments))))
          (setq arguments (cdr arguments))
          (push (list temporary first arguments) frames)))))
    (dolist (frame frames)
      (let ((temporary (car frame)))
        (setq result
              (format (if (eliscript-emitter--contains-await-p (nth 2 frame))
                          "(await (async (%s) => (__eliscript_truthy(%s) ? %s : %s))(%s))"
                        "((%s) => (__eliscript_truthy(%s) ? %s : %s))(%s)")
                      temporary temporary
                      (if (eq kind 'and) result temporary)
                      (if (eq kind 'and) temporary result)
                      (cadr frame)))))
    result))

(defun eliscript-emitter--numeric-tag (operator)
  "Return the primitive helper tag for OPERATOR."
  (cdr (assoc operator '(("-" . "sub") ("*" . "mul") ("/" . "div")
                        ("%" . "rem") ("&" . "and") ("|" . "or")
                        ("^" . "xor") ("<<" . "shl") (">>" . "shr")
                        (">>>" . "ushr") ("imul" . "imul")))))
(defun eliscript-emitter--relational-p (operator)
  "Return non-nil for a relational OPERATOR."
  (member operator '("<" "<=" ">" ">=")))
(defun eliscript-emitter--numeric-coercion-p (name)
  "Return non-nil when intrinsic NAME needs numeric conversion."
  (memq name '(- * / % mod < <= > >= 1- int32 uint32 imul32 bit-not bit-and
              bit-or bit-xor bit-shift-left bit-shift-right unsigned-bit-shift-right)))
(defun eliscript-emitter--numeric-binary (operator left right)
  "Emit OPERATOR over already emitted LEFT and RIGHT, preserving conversions."
  (cond (eliscript-emitter--numeric-profile (format "(%s %s %s)" left operator right))
        ((and (equal operator "-") (equal right "1"))
         (format "__eliscript_numeric_decrement(%s)" left))
        ((eliscript-emitter--relational-p operator)
         (format "__eliscript_numeric_relation(\"%s\", %s, %s)" operator left right))
        ((eliscript-emitter--numeric-tag operator)
         (format "__eliscript_numeric_%s(%s, %s)"
                 (eliscript-emitter--numeric-tag operator) left right))
        (t (format "(%s %s %s)" left operator right))))
(defun eliscript-emitter--numeric-fold (operator expressions)
  "Left-fold emitted EXPRESSIONS with OPERATOR."
  (if (and (not eliscript-emitter--numeric-profile)
           (eliscript-emitter--numeric-tag operator) (cdr expressions))
      (let ((result (car expressions)))
        (dolist (right (cdr expressions))
          (setq result (eliscript-emitter--numeric-binary operator result right))) result)
    (format "(%s)" (string-join expressions (format " %s " operator)))))
(defun eliscript-emitter--emit-infix (name arguments operator &optional minimum)
  "Emit ARGUMENTS joined by OPERATOR for Lisp function NAME."
  (eliscript-emitter--require-arity name arguments (or minimum 2))
  (eliscript-emitter--numeric-fold operator (mapcar #'eliscript-emitter-emit-expression arguments)))

(defun eliscript-emitter--emit-binary-infix (name arguments operator)
  "Emit exact binary NAME over ARGUMENTS using JavaScript OPERATOR."
  (eliscript-emitter--require-arity name arguments 2 2)
  (eliscript-emitter--numeric-binary operator
    (eliscript-emitter-emit-expression (nth 0 arguments)) (eliscript-emitter-emit-expression (nth 1 arguments))))

(defun eliscript-emitter--emit-comparison (name arguments operator)
  "Emit one-evaluation n-ary comparison NAME using OPERATOR."
  (eliscript-emitter--require-arity name arguments 2)
  (if (= (length arguments) 2)
      (eliscript-emitter--numeric-binary operator
        (eliscript-emitter-emit-expression (nth 0 arguments)) (eliscript-emitter-emit-expression (nth 1 arguments)))
    (let ((parameters (mapcar (lambda (_argument)
                                (eliscript-emitter--fresh-name))
                              arguments))
          comparisons)
      (cl-loop for left on parameters
               while (cdr left)
               do (push (if (eliscript-emitter--relational-p operator)
                            (eliscript-emitter--numeric-binary operator (car left) (cadr left))
                          (format "%s %s %s" (car left) operator (cadr left)))
                        comparisons))
      (format "((%s) => (%s))(%s)"
              (string-join parameters ", ")
              (string-join (nreverse comparisons) " && ")
              (eliscript-emitter--emit-arguments arguments)))))

(defun eliscript-emitter--emit-distinct (name arguments)
  "Emit a one-evaluation pairwise distinct comparison for NAME ARGUMENTS."
  (eliscript-emitter--require-arity name arguments 2)
  (let ((parameters (mapcar (lambda (_argument)
                              (eliscript-emitter--fresh-name))
                            arguments))
        comparisons)
    (cl-loop for left-index from 0 below (length parameters)
             do (cl-loop for right-index from (1+ left-index)
                         below (length parameters)
                         do (push
                             (format "%s !== %s"
                                     (nth left-index parameters)
                                     (nth right-index parameters))
                             comparisons)))
    (format "((%s) => (%s))(%s)"
            (string-join parameters ", ")
            (string-join (nreverse comparisons) " && ")
            (eliscript-emitter--emit-arguments arguments))))

(defun eliscript-emitter--emit-object (arguments)
  "Emit an object literal from alternating key/value ARGUMENTS."
  (when (= (% (length arguments) 2) 1)
    (eliscript-emitter--fail "object expects key/value pairs"))
  (let (properties)
    (while arguments
      (let ((key (pop arguments))
            (value (pop arguments)))
        (push
         (format "%s: %s"
                 (cond
                  ((keywordp key)
                   (eliscript-emitter--json-string
                    (substring (symbol-name key) 1)))
                  ((stringp key) (eliscript-emitter--json-string key))
                  ((symbolp key)
                   (eliscript-emitter--json-string (symbol-name key)))
                  (t (format "[%s]"
                             (eliscript-emitter-emit-expression key))))
                 (eliscript-emitter-emit-expression value))
         properties)))
    (format "({%s})" (string-join (nreverse properties) ", "))))

(defun eliscript-emitter--emit-property-key (key)
  "Emit KEY for bracket-style JavaScript property access."
  (cond
   ((keywordp key)
    (eliscript-emitter--json-string (substring (symbol-name key) 1)))
   ((stringp key) (eliscript-emitter--json-string key))
   (t (eliscript-emitter-emit-expression key))))

(defun eliscript-emitter--emit-get (arguments)
  "Emit property access from get ARGUMENTS."
  (eliscript-emitter--require-arity "get" arguments 2 3)
  (let ((access (format "(%s)[%s]"
                        (eliscript-emitter-emit-expression (nth 0 arguments))
                        (eliscript-emitter--emit-property-key (nth 1 arguments)))))
    (if (= (length arguments) 3)
        (format "(%s ?? %s)"
                access
                (eliscript-emitter-emit-expression (nth 2 arguments)))
      access)))

(defun eliscript-emitter--array-text-key-p (key)
  "Return non-nil for text and borrowed-call methods or computed KEY."
  (if (or (keywordp key) (stringp key) (numberp key) (memq key '(nil t false undefined)))
      (member (if (keywordp key) (substring (symbol-name key) 1) key)
              '("join" "toString" "call" "apply" "bind"))
    t))

(defun eliscript-emitter--primitive-literal-p (form)
  "Return non-nil for primitive literal FORM, excluding allocated tagged values."
  (or (numberp form) (stringp form) (memq form '(nil t false undefined))))

(defun eliscript-emitter--emit-js-call (arguments)
  "Emit a receiver-preserving JavaScript method call from ARGUMENTS."
  (eliscript-emitter--require-arity "js-call" arguments 2)
  (format (if (eliscript-emitter--array-text-key-p (nth 1 arguments))
              (if (cl-every #'eliscript-emitter--primitive-literal-p (nthcdr 2 arguments))
                  (if (nthcdr 2 arguments) "__eliscript_at_direct(%s, %s, %s)"
                    "__eliscript_at_direct(%s, %s%s)")
                "__eliscript_at(%s, %s)(%s)")
            "(%s)[%s](%s)")
          (eliscript-emitter-emit-expression (nth 0 arguments))
          (eliscript-emitter--emit-property-key (nth 1 arguments))
          (eliscript-emitter--emit-arguments (nthcdr 2 arguments))))

(defun eliscript-emitter--number-text (value)
  "Spell numeric VALUE as the same binary64 literal as the JavaScript emitter.

Use Emacs's shortest round-tripping digits, then change only decimal-point
placement and exponent spelling. No rounded decimal arithmetic is involved."
  (let* ((float-output-format nil)
         ;; Eliscript Numbers have the same binary64 conversion as Number in
         ;; the self-hosted reader, including Emacs integers beyond 2^53.
         (text (number-to-string (float value))))
    (when (string-match-p "INF\\|NaN" text)
      (eliscript-emitter--fail "non-finite numbers are not supported: %S" value))
    (if (zerop value)
        (if (string-prefix-p "-" text) "-0.0" "0")
      (let* ((negative (string-prefix-p "-" text))
             (unsigned (if negative (substring text 1) text))
             (exponent-at (string-match "[eE]" unsigned))
             (mantissa (if exponent-at (substring unsigned 0 exponent-at) unsigned))
             (exponent (if exponent-at (string-to-number (substring unsigned (1+ exponent-at))) 0))
             (point (or (string-match "\\." mantissa) (length mantissa)))
             (digits (replace-regexp-in-string "\\." "" mantissa t t))
             (position (+ point exponent)))
        (while (and (> (length digits) 1) (= (aref digits 0) ?0))
          (setq digits (substring digits 1) position (1- position)))
        (while (and (> (length digits) 1) (= (aref digits (1- (length digits))) ?0))
          (setq digits (substring digits 0 -1)))
        (concat
         (if negative "-" "")
         (cond
          ((and (> position 0) (<= position 21))
           (if (>= position (length digits))
               (concat digits (make-string (- position (length digits)) ?0))
             (concat (substring digits 0 position) "." (substring digits position))))
          ((and (> position -6) (<= position 0))
           (concat "0." (make-string (- position) ?0) digits))
          (t
           (concat (substring digits 0 1)
                   (if (> (length digits) 1) (concat "." (substring digits 1)) "")
                   "e" (if (> position 0) "+" "")
                   (number-to-string (1- position))))))))))

(defun eliscript-emitter--emit-quoted (value)
  "Emit quoted Eliscript VALUE as canonical persistent data."
  (cond
   ((null value) "__eliscript_list()")
   ((eq value t) "true")
   ((eq value 'undefined) "undefined")
   ((numberp value) (eliscript-emitter--number-text value))
   ((stringp value) (eliscript-emitter--json-string value))
   ((keywordp value)
    (format "__eliscript_keyword(%s)"
            (eliscript-emitter--json-string
             (substring (symbol-name value) 1))))
   ((symbolp value)
    (format "__eliscript_symbol(%s)"
            (eliscript-emitter--json-string (symbol-name value))))
   ((vectorp value)
    (format "__eliscript_vector(%s)"
            (mapconcat #'eliscript-emitter--emit-quoted (append value nil) ", ")))
   ((consp value)
    (unless (proper-list-p value)
      (eliscript-emitter--fail "dotted quoted lists are not supported yet"))
    (format "__eliscript_list(%s)"
            (mapconcat #'eliscript-emitter--emit-quoted value ", ")))
   (t (eliscript-emitter--fail "cannot quote value: %S" value))))

(defun eliscript-emitter--quoted-uses-literal-runtime-p (value)
  "Return non-nil when quoted VALUE constructs a persistent runtime value."
  (cond
   ((null value) t)
   ((or (eq value t) (eq value 'undefined)
        (numberp value) (stringp value)) nil)
   ((or (keywordp value) (symbolp value)
        (vectorp value) (consp value)) t)
   (t nil)))

(defun eliscript-emitter--emit-call (form)
  "Emit list FORM as an expression."
  (let ((operator (car form))
        (arguments (cdr form)))
    (pcase operator
      ((or 'lambda 'fn)
       (eliscript-emitter--require-arity (symbol-name operator) arguments 1)
       (eliscript-emitter--emit-function (car arguments) (cdr arguments)))
      ('async
       (eliscript-emitter--require-arity "async" arguments 1)
       (eliscript-emitter--emit-function
        (car arguments) (cdr arguments) t))
      ('await
       (eliscript-emitter--require-arity "await" arguments 1 1)
       (format "await (%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('throw (eliscript-emitter--emit-throw arguments))
      ('try (eliscript-emitter--emit-try arguments))
      ((or 'catch 'finally)
       (eliscript-emitter--fail
        "%s is only valid as a try clause" operator))
      ('if (eliscript-emitter--emit-if arguments))
      ('when
       (eliscript-emitter--require-arity "when" arguments 1)
       (eliscript-emitter--emit-if
        (list (car arguments) (cons 'progn (cdr arguments)) nil)))
      ('unless
       (eliscript-emitter--require-arity "unless" arguments 1)
       (eliscript-emitter--emit-if
        (list (list 'not (car arguments)) (cons 'progn (cdr arguments)) nil)))
      ('cond (eliscript-emitter--emit-cond arguments))
      ((or 'progn 'do) (eliscript-emitter--emit-do arguments))
      ('let (eliscript-emitter--emit-let arguments nil))
      ('let* (eliscript-emitter--emit-let arguments t))
      ('setq (eliscript-emitter--emit-setq arguments))
      ('set!
       (eliscript-emitter--require-arity "set!" arguments 2 2)
       (format "(%s = %s)"
               (eliscript-emitter--binding-name (car arguments))
               (eliscript-emitter-emit-expression (cadr arguments))))
      ('while (eliscript-emitter--emit-while arguments))
      ('loop (eliscript-emitter--emit-binding-loop arguments))
      ('recur
       (eliscript-emitter--fail "recur is only valid in tail position"))
      ('and (eliscript-emitter--emit-short-circuit arguments 'and))
      ('or (eliscript-emitter--emit-short-circuit arguments 'or))
      ('not
       (eliscript-emitter--require-arity "not" arguments 1 1)
       (format "(!%s)"
               (eliscript-emitter--emit-test (car arguments))))
      ('quote
       (eliscript-emitter--require-arity "quote" arguments 1 1)
       (eliscript-emitter--emit-quoted (car arguments)))
      ('+ (if arguments
              (format "(%s)" (mapconcat #'eliscript-emitter-emit-expression
                                         arguments " + "))
            "0"))
      ('* (if arguments
              (eliscript-emitter--emit-infix "*" arguments "*" 1)
            "1"))
      ('-
       (eliscript-emitter--require-arity "-" arguments 1)
       (if (= (length arguments) 1)
           (format (if eliscript-emitter--numeric-profile "(-%s)" "__eliscript_numeric_neg(%s)") (eliscript-emitter-emit-expression (car arguments)))
         (eliscript-emitter--emit-infix "-" arguments "-")))
      ('/
       (eliscript-emitter--require-arity "/" arguments 1)
       (if (= (length arguments) 1)
           (eliscript-emitter--numeric-binary "/" "1" (eliscript-emitter-emit-expression (car arguments)))
         (eliscript-emitter--emit-infix "/" arguments "/")))
      ((or '% 'mod) (eliscript-emitter--emit-infix (symbol-name operator)
                                                    arguments "%"))
      ('int32
       (eliscript-emitter--require-arity "int32" arguments 1 1)
       (format "__eliscript_numeric_int32(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('uint32
       (eliscript-emitter--require-arity "uint32" arguments 1 1)
       (format "__eliscript_numeric_uint32(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('imul32
       (eliscript-emitter--require-arity "imul32" arguments 2 2)
       (format "__eliscript_numeric_imul(%s, %s)"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('bit-and
       (eliscript-emitter--emit-binary-infix "bit-and" arguments "&"))
      ('bit-or
       (eliscript-emitter--emit-binary-infix "bit-or" arguments "|"))
      ('bit-xor
       (eliscript-emitter--emit-binary-infix "bit-xor" arguments "^"))
      ('bit-not
       (eliscript-emitter--require-arity "bit-not" arguments 1 1)
       (format "__eliscript_numeric_not(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('bit-shift-left
       (eliscript-emitter--emit-binary-infix
        "bit-shift-left" arguments "<<"))
      ('bit-shift-right
       (eliscript-emitter--emit-binary-infix
        "bit-shift-right" arguments ">>"))
      ('unsigned-bit-shift-right
       (eliscript-emitter--emit-binary-infix
        "unsigned-bit-shift-right" arguments ">>>"))
      ('value-type
       (eliscript-emitter--require-arity "value-type" arguments 1 1)
       (format
        "((__eliscript_value) => { if (__eliscript_value === null) return \"null\"; const __eliscript_host_type = typeof __eliscript_value; if (__eliscript_host_type !== \"object\" && __eliscript_host_type !== \"function\") return __eliscript_host_type; try { const __eliscript_type = Object.getOwnPropertyDescriptor(__eliscript_value, Symbol.for(\"eliscript.value.type\")); if (__eliscript_type && Object.prototype.hasOwnProperty.call(__eliscript_type, \"value\") && (__eliscript_type.value === \"keyword\" || __eliscript_type.value === \"symbol\")) return __eliscript_type.value; const __eliscript_kind = Object.getOwnPropertyDescriptor(__eliscript_value, \"kind\"); if (__eliscript_kind && Object.prototype.hasOwnProperty.call(__eliscript_kind, \"value\")) { if (__eliscript_kind.value === \"eliscript/keyword\") return \"keyword\"; if (__eliscript_kind.value === \"eliscript/symbol\") return \"symbol\"; } return __eliscript_host_type; } catch { return __eliscript_host_type; } })(%s)"
        (eliscript-emitter-emit-expression (car arguments))))
      ('host-identity-token
       (eliscript-emitter--require-arity
        "host-identity-token" arguments 1 1)
       (format "__eliscript_host_identity_token(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('string-code-unit-at
       (eliscript-emitter--require-arity
        "string-code-unit-at" arguments 2 2)
       (format "(%s).charCodeAt(%s)"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('string-from-code-unit
       (eliscript-emitter--require-arity
        "string-from-code-unit" arguments 1 1)
       (format "String.fromCharCode(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('string-to-number
       (eliscript-emitter--require-arity "string-to-number" arguments 1 1)
       (format "__eliscript_to_number(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('string-to-bigint
       (eliscript-emitter--require-arity "string-to-bigint" arguments 1 1)
       (format
        "((__eliscript_text) => { try { return BigInt(__eliscript_text); } catch { return null; } })(%s)"
        (eliscript-emitter-emit-expression (car arguments))))
      ('number-float64-words
       (eliscript-emitter--require-arity
        "number-float64-words" arguments 1 1)
       (format
        "((__eliscript_number) => { const __eliscript_bytes = new DataView(new ArrayBuffer(8)); __eliscript_bytes.setFloat64(0, __eliscript_number === 0 ? 0 : __eliscript_number, true); return [__eliscript_bytes.getUint32(0, true), __eliscript_bytes.getUint32(4, true)]; })(%s)"
        (eliscript-emitter-emit-expression (car arguments))))
      ('= (eliscript-emitter--emit-comparison "=" arguments "==="))
      ((or '/= 'not=)
       (eliscript-emitter--emit-distinct (symbol-name operator) arguments))
      ('< (eliscript-emitter--emit-comparison "<" arguments "<"))
      ('<= (eliscript-emitter--emit-comparison "<=" arguments "<="))
      ('> (eliscript-emitter--emit-comparison ">" arguments ">"))
      ('>= (eliscript-emitter--emit-comparison ">=" arguments ">="))
      ('1+
       (eliscript-emitter--require-arity "1+" arguments 1 1)
       (format "(%s + 1)" (eliscript-emitter-emit-expression (car arguments))))
      ('1-
       (eliscript-emitter--require-arity "1-" arguments 1 1)
       (eliscript-emitter--numeric-binary "-" (eliscript-emitter-emit-expression (car arguments)) "1"))
      ('eq
       (eliscript-emitter--require-arity (symbol-name operator) arguments 2 2)
       (format "(%s === %s)"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('equal
       (eliscript-emitter--require-arity "equal" arguments 2 2)
       (format "__eliscript_equal(%s, %s)"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('nil?
       (eliscript-emitter--require-arity "nil?" arguments 1 1)
       (format "(%s === null)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('undefined?
       (eliscript-emitter--require-arity "undefined?" arguments 1 1)
       (format "(%s === undefined)"
               (eliscript-emitter-emit-expression (car arguments))))
      ((or 'null 'nullish?)
       (eliscript-emitter--require-arity
        (symbol-name operator) arguments 1 1)
       (format "(%s == null)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('vector
       (format "__eliscript_vector(%s)"
               (eliscript-emitter--emit-arguments arguments)))
      ('hash-map
       (when (= (% (length arguments) 2) 1)
         (eliscript-emitter--fail
          "hash-map expects complete key/value pairs"))
       (format "__eliscript_hash_map(%s)"
               (eliscript-emitter--emit-arguments arguments)))
      ('hash-set
       (format "__eliscript_hash_set(%s)"
               (eliscript-emitter--emit-arguments arguments)))
      ('queue
       (format "__eliscript_queue(%s)"
               (eliscript-emitter--emit-arguments arguments)))
      ('list
       (format "__eliscript_list(%s)"
               (eliscript-emitter--emit-arguments arguments)))
      ('js-array
       (format "[%s]" (eliscript-emitter--emit-arguments arguments)))
      ('car
       (eliscript-emitter--require-arity "car" arguments 1 1)
       (format "__eliscript_first(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('cdr
       (eliscript-emitter--require-arity "cdr" arguments 1 1)
       (format "__eliscript_rest(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('cons
       (eliscript-emitter--require-arity "cons" arguments 2 2)
       (format "__eliscript_cons(%s, %s)"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('js-cons
       (eliscript-emitter--require-arity "js-cons" arguments 2 2)
       (format "[%s, ...((%s) ?? [])]"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('nth
       (eliscript-emitter--require-arity "nth" arguments 2 2)
       (format "__eliscript_nth(%s, %s, null)"
               (eliscript-emitter-emit-expression (nth 1 arguments))
               (eliscript-emitter-emit-expression (nth 0 arguments))))
      ('js-nth
       (eliscript-emitter--require-arity "js-nth" arguments 2 2)
       (format "((((%s) ?? [])[%s]) ?? null)"
               (eliscript-emitter-emit-expression (nth 1 arguments))
               (eliscript-emitter-emit-expression (nth 0 arguments))))
      ('aref
       (eliscript-emitter--require-arity "aref" arguments 2 2)
       (format "(%s)[%s]"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter--emit-property-key (nth 1 arguments))))
      ('length
       (eliscript-emitter--require-arity "length" arguments 1 1)
       (format "__eliscript_count(%s)"
               (eliscript-emitter-emit-expression (car arguments))))
      ('js-length
       (eliscript-emitter--require-arity "js-length" arguments 1 1)
       (format "((%s) ?? []).length"
               (eliscript-emitter-emit-expression (car arguments))))
      ('__eliscript_arity_error
       (eliscript-emitter--require-arity
        "__eliscript_arity_error" arguments 2 2)
       (format
        "((label, arity) => { throw new TypeError(label + \" received unsupported arity: \" + arity); })(%s, %s)"
        (eliscript-emitter-emit-expression (nth 0 arguments))
        (eliscript-emitter-emit-expression (nth 1 arguments))))
      ('object-keys
       (eliscript-emitter--require-arity "object-keys" arguments 1 1)
       (format "Object.keys((%s) ?? {})"
               (eliscript-emitter-emit-expression (car arguments))))
      ('object-has?
       (eliscript-emitter--require-arity "object-has?" arguments 2 2)
       (format "Object.prototype.hasOwnProperty.call((%s) ?? {}, %s)"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter--emit-property-key (nth 1 arguments))))
      ('object-assoc
       (eliscript-emitter--require-arity "object-assoc" arguments 3 3)
       (format "({...((%s) ?? {}), [%s]: %s})"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter--emit-property-key (nth 1 arguments))
               (eliscript-emitter-emit-expression (nth 2 arguments))))
      ('js-object
       (eliscript-emitter--emit-object arguments))
      ('get (eliscript-emitter--emit-get arguments))
      ('put
       (eliscript-emitter--require-arity "put" arguments 3 3)
       (format "((%s)[%s] = %s)"
               (eliscript-emitter-emit-expression (nth 0 arguments))
               (eliscript-emitter--emit-property-key (nth 1 arguments))
               (eliscript-emitter-emit-expression (nth 2 arguments))))
      ('js-call (eliscript-emitter--emit-js-call arguments))
      ('new
       (eliscript-emitter--require-arity "new" arguments 1)
       (format "new %s(%s)"
               (eliscript-emitter-emit-expression (car arguments))
               (eliscript-emitter--emit-arguments (cdr arguments))))
      ('js*
       (eliscript-emitter--require-arity "js*" arguments 1 1)
       (unless (stringp (car arguments))
         (eliscript-emitter--fail "js* expects a string literal"))
       (car arguments))
      ('print
       (format "console.log(%s)"
               (eliscript-emitter--emit-arguments arguments)))
      ('str
       (if (null arguments)
           "\"\""
         (format "(%s)"
                 (mapconcat
                  (lambda (argument)
                    (format "String(%s)"
                            (eliscript-emitter-emit-expression argument)))
                  arguments " + "))))
      ('funcall
       (eliscript-emitter--require-arity "funcall" arguments 1)
       (format "%s(%s)"
               (eliscript-emitter--emit-callee (car arguments))
               (eliscript-emitter--emit-arguments (cdr arguments))))
      ('apply
       (eliscript-emitter--require-arity "apply" arguments 2 2)
       (format "%s(...%s)"
               (eliscript-emitter--emit-callee (car arguments))
               (eliscript-emitter-emit-expression (cadr arguments))))
      (_
       (when (memq operator '(defun defn defvar defconst export import module))
         (eliscript-emitter--fail "%s is only valid at module top level" operator))
       (format "%s(%s)"
               (eliscript-emitter--emit-callee operator)
               (eliscript-emitter--emit-arguments arguments))))))

(defun eliscript-emitter-emit-expression (form)
  "Emit FORM with explicit continuations for ordinary if expression trees."
  (if (and (consp form) (eq (car form) 'if))
      (eliscript-emitter--run-depth-plan #'eliscript-emitter--depth-plan :expression form nil)
    (eliscript-emitter--emit-expression-recursive form)))

(defun eliscript-emitter--emit-expression-recursive (form)
  "Emit Eliscript FORM as an ECMAScript expression."
  (cond
   ((and (consp form) (eq (car form) eliscript-emitter--tdz-assignment-tag))
    (let ((outputs (mapcar #'eliscript-emitter-emit-expression (nth 2 form))))
      (if (eq (nth 1 form) 'set!) (car outputs)
        (format "(%s)" (string-join outputs ", ")))))
   ((and (consp form) (eq (car form) eliscript-emitter--tdz-read-tag))
    (eliscript-emitter--tdz-read-text (nth 1 form) (nth 2 form)))
   ((and (consp form) (eq (car form) eliscript-emitter--tdz-write-tag))
    (eliscript-emitter--tdz-write-text (nth 1 form) (nth 2 form)
      (eliscript-emitter-emit-expression (nth 3 form))))
   ((null form) "null")
   ((eq form t) "true")
   ((numberp form) (eliscript-emitter--number-text form))
   ((stringp form) (eliscript-emitter--json-string form))
   ((keywordp form)
    (format "__eliscript_keyword(%s)"
            (eliscript-emitter--json-string
             (substring (symbol-name form) 1))))
   ((eq form 'false) "false")
   ((eq form 'undefined) "undefined")
   ((symbolp form) (eliscript-emitter--reference-name form))
   ((vectorp form)
    (format "__eliscript_vector(%s)"
            (mapconcat #'eliscript-emitter-emit-expression
                       (append form nil) ", ")))
   ((consp form)
    (unless (proper-list-p form)
      (eliscript-emitter--fail "dotted call forms are not supported: %S" form))
    (eliscript-emitter--emit-call form))
   (t (eliscript-emitter--fail "unsupported form: %S" form))))

(defun eliscript-emitter--emit-import (arguments)
  "Emit an ESM import declaration from ARGUMENTS."
  (eliscript-emitter--require-arity "import" arguments 1)
  (let ((module-name (car arguments))
        (specifiers (cdr arguments))
        default-binding
        namespace-binding
        named-bindings)
    (unless (stringp module-name)
      (eliscript-emitter--fail "import module must be a string"))
    (while specifiers
      (let ((specifier (pop specifiers)))
        (pcase specifier
          (:default
           (unless specifiers
             (eliscript-emitter--fail ":default requires a binding"))
           (setq default-binding
                 (eliscript-emitter--binding-name (pop specifiers))))
          (:as
           (unless specifiers
             (eliscript-emitter--fail ":as requires a namespace binding"))
           (setq namespace-binding
                 (eliscript-emitter--binding-name (pop specifiers))))
          ((pred symbolp)
           (push (eliscript-emitter--binding-name specifier) named-bindings))
          (_ (eliscript-emitter--fail "invalid import specifier: %S" specifier)))))
    (when (and namespace-binding named-bindings)
      (eliscript-emitter--fail "namespace and named imports cannot be combined"))
    (let ((clause
           (string-join
            (delq nil
                  (list default-binding
                        (and namespace-binding (concat "* as " namespace-binding))
                        (and named-bindings
                             (format "{%s}"
                                     (string-join (nreverse named-bindings) ", ")))))
            ", ")))
      (if (string-empty-p clause)
          (format "import %s;" (eliscript-emitter--json-string module-name))
        (format "import %s from %s;"
                clause (eliscript-emitter--json-string module-name))))))

(defun eliscript-emitter-emit-top-level (form)
  "Emit top-level Eliscript FORM as an ECMAScript declaration or statement."
  (if (not (consp form))
      (concat (eliscript-emitter-emit-expression form) ";")
    (let ((operator (car form))
          (arguments (cdr form)))
      (pcase operator
        ('module
         (eliscript-emitter--require-arity "module" arguments 1)
         (unless (symbolp (car arguments))
           (eliscript-emitter--fail "module name must be a symbol"))
         (mapconcat #'eliscript-emitter-emit-top-level (cdr arguments) "\n"))
        ((or 'import 'import-portable)
         (eliscript-emitter--emit-import arguments))
        ((or 'defvar 'defconst)
         (eliscript-emitter--require-arity (symbol-name operator) arguments 1 2)
         (concat
          (format "%s %s = %s;"
                  (if (eq operator 'defconst) "const" "let")
                  (eliscript-emitter--binding-name (car arguments))
                  (eliscript-emitter-emit-expression (cadr arguments)))
          (let ((record (and eliscript-emitter--tdz-state
                         (gethash form (plist-get eliscript-emitter--tdz-state :declarations)))))
            (when record (concat "\n" (eliscript-emitter--tdz-ready-name record) " = true;")))))
        ((or 'defun 'defn 'defasync)
         (eliscript-emitter--require-arity (symbol-name operator) arguments 2)
         (let ((name (nth 0 arguments))
               (parameter-forms (nth 1 arguments))
               (body (nthcdr 2 arguments)))
           (unless (symbolp name)
             (eliscript-emitter--fail "function name must be a symbol"))
           (let ((parameters
                  (eliscript-parameters-parse
                   parameter-forms
                   (lambda (_form message)
                     (eliscript-emitter--fail "%s" message)))))
             (format "%sfunction %s(%s) {\n%s\n}"
                     (if (eq operator 'defasync) "async " "")
                     (eliscript-emitter--binding-name name)
                     (mapconcat
                      #'eliscript-emitter--emit-parameter parameters ", ")
                     (eliscript-emitter--indent
                      (eliscript-emitter--emit-function-body
                       parameters body))))))
        ('export
         (eliscript-emitter--require-arity "export" arguments 1)
         (format "export {%s};"
                 (mapconcat #'eliscript-emitter--binding-name arguments ", ")))
        ('export-default
         (eliscript-emitter--require-arity "export-default" arguments 1 1)
         (format "export default %s;"
                 (eliscript-emitter-emit-expression (car arguments))))
        (_ (concat (eliscript-emitter-emit-expression form) ";"))))))

(defun eliscript-emitter--uses-number-conversion-p (forms)
  "Find the corresponding unquoted runtime operation without host recursion."
  (eliscript-emitter--some-form forms
    (lambda (node) (and (consp node) (memq (car node) '(string-to-number)) t)) '(quote)))

(defun eliscript-emitter--uses-numeric-coercion-p (forms)
  "Find unquoted dynamic numeric operations without host recursion."
  (eliscript-emitter--some-form forms
    (lambda (node) (and (consp node)
                       (eliscript-emitter--numeric-coercion-p (car node))
                       (or (not (eq (car node) '*)) (> (length (cdr node)) 1)))) '(quote)))

(defun eliscript-emitter--uses-host-identity-token-p (forms)
  "Retain the original host-token scan, including its quoted-form traversal."
  (eliscript-emitter--some-form forms
    (lambda (node) (and (consp node) (eq (car node) 'host-identity-token)))))

(defun eliscript-emitter--uses-literal-runtime-p (forms)
  "Find canonical literal construction without recursive ordinary-tree walks."
  (cl-some #'eliscript-emitter--form-uses-literal-runtime-p forms))

(defun eliscript-emitter--form-uses-literal-runtime-p (form)
  (let ((pending (list form)) found)
    (while (and pending (not found))
      (let ((item (pop pending)))
        (cond
         ((keywordp item) (setq found t))
         ((vectorp item) (setq found t))
         ((consp item)
          (let ((operator (car item)) (arguments (cdr item)))
            (cond
             ((eq operator 'quote) (setq found (eliscript-emitter--quoted-uses-literal-runtime-p (car arguments))))
             ((memq operator '(import import-portable)) nil)
             ((memq operator '(list vector hash-map hash-set queue)) (setq found t))
             ((eq operator 'js-object)
              ;; Retain the original complete pair traversal of object fields.
              (while arguments
                (let ((key (pop arguments)) (value (pop arguments)))
                  (when (or (and (not (or (keywordp key) (stringp key) (symbolp key)))
                                 (eliscript-emitter--form-uses-literal-runtime-p key))
                            (eliscript-emitter--form-uses-literal-runtime-p value)) (setq found t)))))
             (t
              (let ((index 0) selected)
                (dolist (child (if (memq operator '(get put js-call aref object-has? object-assoc)) arguments item))
                  (unless (and (memq operator '(get put js-call aref object-has? object-assoc)) (= index 1) (keywordp child))
                    (push child selected))
                  (setq index (1+ index)))
                (dolist (child selected) (push child pending))))))))))
    found))

(defun eliscript-emitter--uses-collection-runtime-p (forms)
  "Find the corresponding unquoted runtime operation without host recursion."
  (eliscript-emitter--some-form forms
    (lambda (node) (and (consp node) (memq (car node) '(nth length)) t)) '(quote)))

(defun eliscript-emitter--uses-list-runtime-p (forms)
  "Find the corresponding unquoted runtime operation without host recursion."
  (eliscript-emitter--some-form forms
    (lambda (node) (and (consp node) (memq (car node) '(car cdr cons)) t)) '(quote)))

(defun eliscript-emitter--uses-value-runtime-p (forms)
  "Find the corresponding unquoted runtime operation without host recursion."
  (eliscript-emitter--some-form forms
    (lambda (node) (and (consp node) (memq (car node) '(equal)) t)) '(quote)))

(defun eliscript-emitter--forms-name-global-root-p (forms)
  "Find the unquoted global root binding without host recursion."
  (eliscript-emitter--some-form forms (lambda (node) (eq node 'globalThis)) '(quote)))

(defun eliscript-emitter--number-conversion-prologue (shadowed)
  "Capture intrinsics independently of a SHADOWED global root binding."
  (if shadowed
      (concat eliscript-emitter--number-conversion-capsule
              eliscript-emitter--number-conversion-body)
    eliscript-emitter--number-conversion-helper))

(defun eliscript-emitter--uses-imul-p (forms)
  "Find the corresponding unquoted runtime operation without host recursion."
  (eliscript-emitter--some-form forms
    (lambda (node) (and (consp node) (memq (car node) '(imul32)) t)) '(quote)))

(defun eliscript-emitter--imul-prologue (shadowed)
  "Capture Math.imul only when required, outside SHADOWED global bindings."
  (concat (if shadowed eliscript-emitter--imul-capsule eliscript-emitter--imul-intrinsic)
          eliscript-emitter--imul-operator-helper))

(defconst eliscript-emitter--unicode-runtime-import
  "import \"eliscript/runtime/unicode-case.mjs\";\n")

(defun eliscript-emitter--unicode-capsule-p (filename module-name)
  "Recognize bootstrap capsules by full source and module identity."
  (let ((name (if (symbolp module-name) (symbol-name module-name) module-name)))
    (and (stringp filename)
         (cl-some
          (lambda (entry)
            (and (equal name (cdr entry))
                 (or (equal filename (car entry))
                     (and (file-name-absolute-p filename)
                          (string-suffix-p (concat "/" (car entry)) filename)))))
          '(("runtime/unicode-case.eli" . "eliscript.runtime.unicode-case")
            ("runtime/unicode-case-data.eli" . "eliscript.runtime.unicode-case-data"))))))

(defun eliscript-emitter--forms-unicode-capsule-p (forms filename)
  "Require a single exact module as well as its compilation source context."
  (and (= (length forms) 1) (consp (car forms))
       (eq (caar forms) 'module)
       (eliscript-emitter--unicode-capsule-p filename (cadar forms))))

(defconst eliscript-emitter--math-runtime-import
  "import \"eliscript/runtime/math.mjs\";\n")

(defun eliscript-emitter--math-reference-p (value)
  "Recognize explicit references to the real Math namespace."
  (let ((name (if (symbolp value) (symbol-name value) value)))
    (and (stringp name)
         (or (member name '("Math" "globalThis/Math" "globalThis.Math"))
             (cl-some (lambda (prefix) (string-prefix-p prefix name))
                      '("Math/" "Math." "globalThis/Math/" "globalThis/Math."
                        "globalThis.Math/" "globalThis.Math."))))))

(defun eliscript-emitter--uses-math-runtime-p (forms)
  "Find unquoted Math references, including the existing raw namespace form."
  (eliscript-emitter--some-form forms
    (lambda (node)
      (or (and (symbolp node) (eliscript-emitter--math-reference-p node))
          (and (consp node) (eq (car node) 'js*)
               (member (cadr node) '("Math" "globalThis.Math"))))) '(quote)))

(defun eliscript-emitter--uses-array-text-p (forms)
  "Find unquoted guarded method calls without host recursion."
  (eliscript-emitter--some-form forms
    (lambda (node)
      (and (consp node)
           (or (and (eq (car node) 'js-call)
                    (eliscript-emitter--array-text-key-p (nth 2 node)))
               (eliscript-emitter--qualified-apply-callee-p (car node))
               (and (memq (car node) '(funcall apply))
                    (eliscript-emitter--qualified-apply-callee-p (nth 1 node)))))) '(quote)))

(defun eliscript-emit-module (forms &optional filename)
  "Emit FORMS as one ECMAScript module."
  (let* ((eliscript-emitter--tdz-state (list :variables nil :declarations (make-hash-table :test #'eq)))
         (scope (make-hash-table :test #'equal)))
    (eliscript-emitter--tdz-legacy-predeclare forms scope eliscript-emitter--tdz-state)
    (eliscript-emitter--emit-module-ready
      (mapcar (lambda (form) (eliscript-emitter--tdz-legacy-top form scope eliscript-emitter--tdz-state)) forms) forms filename)))

(defun eliscript-emitter--emit-module-ready (forms &optional source-forms filename)
  (let ((eliscript-emitter--temporary-counter 0)
        (prologue-forms (or source-forms forms)))
    (concat
     "// Generated by Eliscript. Do not edit.\n"
     (eliscript-emitter--tdz-prologue eliscript-emitter--tdz-state)
     (if (eliscript-emitter--forms-unicode-capsule-p prologue-forms filename)
         "" eliscript-emitter--unicode-runtime-import)
     (if (eliscript-emitter--uses-math-runtime-p prologue-forms) eliscript-emitter--math-runtime-import "")
     (if (eliscript-emitter--uses-array-text-p prologue-forms) eliscript-emitter--array-text-import "")
     (if (eliscript-emitter--uses-literal-runtime-p prologue-forms)
         eliscript-emitter--literal-runtime-import
       "")
     (if (eliscript-emitter--uses-collection-runtime-p prologue-forms)
         eliscript-emitter--collection-runtime-import
       "")
     (if (eliscript-emitter--uses-list-runtime-p prologue-forms)
         eliscript-emitter--list-runtime-import
       "")
     (if (eliscript-emitter--uses-value-runtime-p prologue-forms)
         eliscript-emitter--value-runtime-import
       "")
     "const __eliscript_truthy = (value) => value !== false && value != null;\n"
     (if (or (eliscript-emitter--uses-number-conversion-p prologue-forms)
             (eliscript-emitter--uses-numeric-coercion-p prologue-forms))
         (eliscript-emitter--number-conversion-prologue
          (eliscript-emitter--forms-name-global-root-p prologue-forms))
       "")
     (if (eliscript-emitter--uses-numeric-coercion-p prologue-forms)
         eliscript-emitter--numeric-operator-helper "")
     (if (eliscript-emitter--uses-imul-p prologue-forms)
         (eliscript-emitter--imul-prologue
          (eliscript-emitter--forms-name-global-root-p prologue-forms)) "")
     (if (eliscript-emitter--uses-host-identity-token-p prologue-forms)
         eliscript-emitter--host-identity-token-helper
       "")
     "\n"
     (mapconcat #'eliscript-emitter-emit-top-level forms "\n\n")
     "\n")))

(provide 'eliscript-emitter)

;;; eliscript-emitter.el ends here
