# JavaScript Interoperation

[Core documentation](README.md) | [Language reference](language-reference.md) |
[Platform packages](../platform/README.md)

## Explicit Imports

JavaScript libraries are consumed through ordinary ECMAScript imports. The
compiler does not infer packages or inject framework runtimes. Named, default,
namespace, side-effect, and combined imports follow the module contract in the
[language reference](language-reference.md).

## Native Containers

`js-array`, `js-object`, and `js-cons` create native mutable JavaScript
containers. `js-nth` and `js-length` perform explicit native indexed access.
The unprefixed `array` and `object` aliases are retired; unbound uses are
compile-time errors.

<!-- eliscript-snippet:host-containers -->
```elisp
(module docs.host-containers
  (defconst values (js-array 1 2 3))
  (defconst result (js-object :kind "host" :values values))
  (print (JSON/stringify result)))
```

## Properties And Calls

`get`, `put`, `object-has?`, `object-keys`, and `object-assoc` expose plain
object operations. `js-call` invokes a host callable or method, `new` invokes a
constructor, and `js*` is the explicit escape hatch for a JavaScript expression.
Use the narrowest interop form that expresses the required host operation.

## Persistent Conversion

The standard interop library converts between persistent values and native
Array, Object, Map, and Set values. Conversion is explicit, shallow by default,
and bounded for deep mixed graphs. Unsupported opaque values, accessors,
cycles, and representation-losing conversions fail with structured paths.

See the generated [library API](pages/api.html) for the current conversion
functions and [specification 0073](../specs/0073-native-javascript-container-interop.md)
for exact semantics.

## Host Capabilities

Browser and worker operations require explicit capability packages. Core
modules do not read ambient browser or worker globals. Applications choose and
grant concrete authority at their boundary; these adapters cannot define core
language maturity.
