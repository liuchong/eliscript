# Language Reference

[Core documentation](README.md) | [Macros](macros.md) |
[JavaScript interoperation](javascript-interop.md) |
[Specifications](../specs/README.md)

## Source Model

Eliscript source is a sequence of Lisp forms compiled to strict ECMAScript
modules. Symbols use lexical or module resolution; an unbound symbol is a
compile-time error. Only `false`, `nil`, and `undefined` are false in condition
positions. `nil` compiles to JavaScript `null`, while `undefined` remains a
separate value.

The checked public-surface registry in
[`contracts/public-surface.json`](../contracts/public-surface.json) is the
authoritative inventory of reader values, declarations, runtime forms, macro
operations, and IR kinds.

## Values And Collections

Numbers and strings use JavaScript scalar representation. Lists, Vectors, Maps,
Sets, Queues, sorted collections, Records, Keywords, and Symbols are immutable
Eliscript values with value equality and deterministic hashing where specified.
Canonical constructors include `list`, `vector`, `hash-map`, `hash-set`, and
`persistent-queue`; Vector, Map, Set, and Queue literals use `[...]`, `{...}`,
`#{...}`, and `#queue [...]`.

`car`, `cdr`, and `cons` operate on persistent Lists. `nth` and `length`
dispatch through collection protocols. Native JavaScript containers are
explicit through forms such as `js-array` and are documented in
[JavaScript interoperation](javascript-interop.md).

`eq` compares identity. `equal` compares Eliscript values recursively:
independently constructed persistent collections can be equal, `NaN` equals
`NaN`, signed zeroes are equal, and opaque host objects remain identity-based.

The default immutable collection implementations use structural sharing rather
than full copying:

| Value | Representation | Principal bound |
| --- | --- | --- |
| List | Singly linked persistent nodes | O(1) front operations and suffix sharing |
| Vector | 32-way bit-partitioned trie with tail | O(log32 n) indexed updates |
| Map | 32-way HAMT with bitmap, array, and collision nodes | O(log32 n) expected lookup and update |
| Set | Persistent HAMT Map membership index | Map-equivalent lookup and update |
| Queue | Persistent front and rear Vectors | Iterative FIFO progression without input mutation |
| Sorted Map / Set | Structurally shared AVL tree | O(log n) update and bounded range traversal |

`transient`, `conj!`, `assoc!`, `dissoc!`, and `persistent!` provide an
owner-token bulk-construction phase for Vector, Map, and Set. Completion is
one-way, and compiler ownership analysis rejects escaping or reused transient
values. Persistent source values remain unchanged throughout construction.
Records, metadata, canonical data text, collection protocols, transducers, and
lazy sequences preserve the same immutable value boundary.

<!-- eliscript-snippet:language-values -->
```elisp
(module docs.language-values
  (defconst values [1 2 3])
  (print (str (nth 1 values) ":" (length values)))
  (print (equal values [1 2 3])))
```

## Bindings And Functions

`defconst` defines an immutable module binding and `defvar` defines a mutable
one. `let` evaluates initializers in the surrounding scope; `let*` exposes each
binding to later initializers. `setq` and `set!` can update only mutable
bindings.

Functions use `defun`, `defn`, `lambda`, or `fn`. Parameters may include
`&optional` and one final `&rest`; macros additionally support `&body`.
`defasync` and `async` create asynchronous functions, and `await` is valid only
inside an asynchronous body. `defportable` defines functions whose complete
dependency closure can execute in the restricted worker environment.

Named `defun`, `defn`, `defportable`, and `defasync` forms and anonymous
`lambda`, `fn`, and `async` forms may instead contain two or more
parameter/body clauses. Calls select one fixed clause by exact argument count,
or one final-rest clause by its minimum count:

```elisp
(defun describe
  (() "empty")
  ((value) (str "one:" value))
  ((left right &rest remaining)
    (+ left right (length remaining))))
```

Each fixed count may appear once, and only one variadic clause is allowed.
Overlapping clauses are rejected. Multi-arity clauses support required,
vector-destructured, map-destructured, and final `&rest` parameters, but not
`&optional` or `&body`. `recur` stays local to the selected clause. A call that
matches no clause throws a named `TypeError` with the supplied argument count.

## Expression Composition

`->` inserts a value after each step operator, while `->>` inserts it after the
existing step arguments. A bare symbol step becomes a one-argument call.
`as->` binds an explicit name and rebinds it after each intermediate form:

```elisp
(-> value (normalize options) validate)
(->> values (map transform) (reduce combine initial))
(as-> response item (get item :body) (decode item))
```

`cond->` and `cond->>` take test/step pairs. Every test runs in source order;
only the step paired with a truthy test changes the accumulated value. The
initial expression and each selected step are evaluated once:

```elisp
(cond-> request
  authenticated? authorize
  compressed? (encode options))
```

`some->` and `some->>` continue threading while the accumulated value is not
`nil`. They stop before the next step when it becomes `nil`; `false` and
`undefined` continue through the pipeline.

`if-let` and `when-let` branch using ordinary Eliscript truthiness.
`if-some` and `when-some` instead accept every value except `nil`, including
`false` and `undefined`. Their initializer is evaluated exactly once:

```elisp
(if-some (item (lookup key))
  (render item)
  (render-missing key))
```

Each binding is a two-item list containing an ordinary symbol and initializer.
The `when-*` variants accept one or more body forms and return the final body
value or `nil`.

`case` evaluates one dispatch expression and compares it with source constants
using Eliscript value equality. Parenthesized constants form a match group;
the final unpaired expression is an optional default:

```elisp
(case status
  :ready (start job)
  (:waiting :blocked) (retain job)
  (reject job))
```

`condp` evaluates a predicate and dispatch expression once, then invokes the
predicate with each test and the dispatch value until one result is truthy. A
`:>>` clause calls its result function with that exact predicate result. With
no default, an unmatched `condp` throws a located `TypeError`.

## Multimethod Definitions

`defmulti` creates a named multimethod from a dispatch function and an optional
default dispatch value. `defmethod` registers a normal function body for one
dispatch value. Both are top-level declarations and compile to the portable
`multi-fn` and `add-method!` APIs rather than a compiler-owned runtime.

```elisp
(import "../stdlib/multimethod.eli" add-method! multi-fn)

(defmulti render (lambda (kind value) kind) :fallback)
(defmethod render :text (kind value) (str "text:" value))
(defmethod render :fallback (kind value) (str "unknown:" value))
```

The imports are explicit: omitting either dependency produces the same unbound
symbol diagnostic as any other missing binding. Method registration follows
source order and retains all exact, hierarchy, preference, and persistent
snapshot behavior from the multimethod standard library.

## Protocol Definitions

`defprotocol` declares an open protocol and binds each operation to its exact
runtime dispatch function. `extend-type`, `extend-category`, and
`extend-default` install exact-constructor, host-category, and fallback
implementations in source order.

```elisp
(import "../stdlib/core/protocol.eli"
        define-protocol extend-protocol-category extend-protocol-default
        protocol-method)

(defprotocol IDescribe describe)
(extend-category "number" IDescribe
  (describe (value) (str "number:" value)))
(extend-default IDescribe
  (describe (_value) "default"))
```

Declarations expand to the corresponding protocol standard-library calls;
they do not add a compiler-owned dispatch engine. Runtime dispatch retains
direct-slot, exact-type, host-category, and default priority. Imports remain
explicit, and method parameter lists and bodies use ordinary lambda semantics.

## Control Flow

The core forms are `if`, `when`, `unless`, `cond`, `case`, `condp`, `and`, `or`,
`progn`, `while`, `loop`, `recur`, `try`, `catch`, `finally`, and `throw`.
`recur` is valid only in a tail position owned by the nearest compatible
function or loop target. Argument evaluation and loop rebinding remain
deterministic.

`recur` is the allocation-free mechanism for stack-safe self recurrence and
lexical loops. The standard-library `trampoline` repeatedly invokes returned
zero-argument thunks and supports dynamic or mutual recurrence without growing
the JavaScript stack. Ordinary function calls retain ordinary JavaScript call
semantics, including calls written in tail position. General automatic
tail-call optimization is future work tracked by
[specification 0180](../specs/0180-general-tail-call-optimization.md).

## Modules

Every maintained source file declares a module. `import` supports named,
default, namespace, side-effect, and combined ECMAScript imports. Local
`.eli` imports participate in project graph construction; external `.mjs` or
package imports remain ordinary host dependencies. `export` names public
bindings and `export-default` emits one default binding.

Project-wide compilation, source containment, and cache behavior are covered
by [Project configuration](project-configuration.md).

## Diagnostics And Source Maps

Reader, macro, analysis, lowering, emission, project, and runtime failures have
source locations where available. Public commands accept
`--diagnostic-format human|json`; JSON diagnostics use the versioned
`eliscript-diagnostic` schema. `--source-map` writes Source Map v3 output for a
named output file.

## Compatibility Status

`Stable` specifications and matching stable conformance features form the
compatibility promise. `Accepted` planning documents govern ongoing direction,
while `Draft` work contributes no implementation or maturity credit. Consult the
[compatibility baseline](../specs/0046-m7-compatibility-baseline.md) instead of
inferring stability from this overview.
