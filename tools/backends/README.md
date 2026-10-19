# Direct backends and the managed WASM runtime

The standalone backend CLI supports the experimental `numeric-f64` and
`memory-u32` capability subsets. The complete compiler still runs as JavaScript.
The implementation and remaining acceptance gates are tracked in
[the backend plan](../../docs/native-wasm-feasibility.md).

Node's native memory bridge transfers read/write payloads in blocks of at most
64 KiB. Reads still return one complete independent byte array; writes retain
one complete snapshot before checking the remote range or dispatching blocks.
Both paths validate the complete range first, and an empty operation still
crosses the remote boundary. This bounds temporary base64 data without changing
the public byte-array contract.

Streaming compiler metadata also quotes long strings in bounded blocks rather
than building a complete escaped copy first. Blocks preserve surrogate pairs,
so JSON text, UTF-8 file bytes and product hashes retain their original spelling.
The discardable quote cache remains bounded across keys and values. These
changes await the unified gate; they do not establish the full compiler's peak
memory budget.

Compiler sessions can explicitly request `responseStringChunks: true` with an
event response mode when the actual driver advertises that capability. Long
strings then cross the existing event protocol in chunks of at most 8,192
UTF-16 code units. The caller still receives the complete ordinary strings,
including lone surrogates; default responses and older drivers keep their
original contract. Cached IR fields are generated and consumed in order, and
completion, cancellation and failure release temporary cursor references.
The complete response protocol file passes 25 regressions. The full source
archive memory and deadline gate remains open.

The inverse string decoder uses a fixed 8 KiB buffer and decoded pieces,
without joining a complete escaped token before parsing it. Invalid string
escapes still fail at the closing quote, and malformed UTF-8 is rejected.
Direct builds own their fresh seed products and use the existing streaming
metadata writer; public producer responses retain their snapshot contract.
Private transport and IR wrapper references are dropped after their original
persistence points without removing any saved IR, debug data or identity field.

Original-case source archives snapshot and validate the full recipe before
I/O, then hash and write IR and source assets in bounded blocks. Assets retain
their ordinal paths, version-1 manifest and exact bytes, including lone UTF16
surrogates encoded as JSON. Reads use 64 KiB blocks and defer parse/UTF8 errors
until the original complete asset identity check succeeds. The seven archive
streaming regressions and 34 metadata regressions pass, including independent
Node cases with small heaps. Full compiler resource and semantic acceptance
remains pending; a public producer's retained graph still requires isolation
before asynchronous persistence.

Package and local-artifact loaders stream runtime and literal source assets in
64 KiB blocks, caching the required decoded strings rather than an additional
complete byte image. Multiple declared encodings of one package source share
one read; complete resource identities still precede decoding errors. The local
artifact loader verifies JavaScript modules incrementally; both loaders verify
native images incrementally before the platform loader opens them. WASM instantiation still receives complete verified
bytes, and the package releases its extra byte reference after instantiation.
Source archives capture their required input fields synchronously, then write
and read exact UTF16 data in bounded blocks. Five package source-loading and
buffer-lifetime regressions pass across real JS, WASM and native transports,
including an independent Node process. These transport fixtures do not replace
the complete compiler package or full browser acceptance gates.

Unicode property aliases and all 519 character-range rows now use checked-in
packed data instead of large generated conditional trees. The offline tools in
`tools/runtime` retain exact extracted records, original-source hashes and
Unicode license information. Name lookup retains the original exact/prefix
terminals; a compact decision table preserves effectful private string readers.
Runtime range lookup reuses one 7,236-byte buffer across rows and heaps. This
instance-private constant buffer contains no managed references and survives
retirement without allocating another copy. Both backends copy literals into
owned memory and use the same lookup code. All nine offline generation and
original-data provenance regressions pass. Seed and self-hosted compilation of
the complete runtime now produce identical JavaScript, including packed lone
UTF16 surrogate units. Backend execution and complete compiler resource gates
remain open.

`bootstrap/runtime/memory.eli` emits a module with owned, growable linear memory
and zero imports. Its managed heap implements Numbers, UTF-16 strings, byte
arrays, reference arrays, fixed records, mutable Map/Set tables, live iterators,
root frames and collection in WASM.
`instantiateManagedRuntime(bytes, options)` from `managed-runtime.mjs` supplies
bulk host transfer and branded handles. A returned handle owns one root; release
it with `release`, and call `collect` to reclaim unreachable objects. `auto(n)`
enables collection at allocation safepoints after a byte debt of `n`; zero
disables automatic collection. Handles and frames belong to one instance.

## Managed text and encoding

Strings preserve UTF-16 code units, including NUL and unpaired surrogates. The
following operations execute in WASM; the bridge only transfers inputs/results
and validates handles and parameters.

| Bridge method | Behavior |
| --- | --- |
| `string(text)` / `readString(handle)` | Transfer a sealed UTF-16 string in bulk |
| `concatStrings(left, right)` | Return a new sealed concatenation |
| `sliceString(value, start, end = length)` | Copy the checked interval `0 <= start <= end <= length`, including split surrogate pairs |
| `compareStrings(left, right)` | Lexicographic UTF-16 order: `-1`, `0` or `1` |
| `findString(value, needle, start = 0)` | Return a code-unit index or `-1`; an empty needle returns `start` |
| `codePoint(value, index)` | Combine a valid surrogate pair; otherwise return its code unit; require `index < length` |
| `encodeUtf8(value, {strict = false})` | Return managed bytes; replace unpaired surrogates with U+FFFD, or reject them in strict mode |
| `decodeUtf8(value, {strict = false, preserveBOM = false})` | Return a sealed string; use maximal-subpart replacement or strict rejection; strip only the first BOM by default |

Indices must be unsigned integers; negative zero and coercions are rejected.
Codec flags must be booleans. These are checked internal runtime primitives;
full language/JavaScript interop index coercion and out-of-range conventions
still require dynamic lowering.

```javascript
const value = runtime.string('中文😀');
const bytes = runtime.encodeUtf8(value, {strict: true});
const text = runtime.decodeUtf8(bytes, {strict: true});
console.log(runtime.readString(text));
for (const handle of [value, bytes, text]) runtime.release(handle);
runtime.collect();
```

Encoding first validates/counts and then allocates exactly one result. Invalid
strict input allocates no result. Allocating operations temporarily root their
operands and refresh addresses after pool growth; successful and failed calls
return borrowed roots. Search uses constant auxiliary space and linear scanning
to handle long repeated prefixes without allocating temporary heap objects.

Runtime errors carry an `eliscriptDiagnostic`: `ELI-RT0001` for invalid/foreign
handles or kinds, `0002` for capacity exhaustion, `0003` for arguments/bounds,
`0004` for invalid strict UTF-8, `0005` for strict unpaired UTF-16 and `0006` for
string sealing violations. Raw loads/stores perform explicit width checks with
unsigned 64-bit arithmetic and raise `WebAssembly.RuntimeError` before a host
memory fault. Store operand effects and memory growth finish before checking.

The internal `memory32` ABI includes `f64-abs`, `f64-neg`, `f64-ceil`,
`f64-floor`, `f64-trunc`, `f64-nearest` and `f64-sqrt`. Each consumes one f64
operand and returns f64 without a host import. `f64-nearest` rounds ties to even;
it differs from source `Math.round`. ARM64 emission locally saves and restores
the caller's floating-point control while selecting IEEE rounding and gradual
underflow for these instructions. Managed `Math.sqrt` performs the ordinary
Number conversion once and uses `f64-sqrt`, retaining signed zero, subnormals,
NaN and infinities. Its entry uses the same native function identity and method
dispatch as other Math members. The remaining transcendental family now has
owned f64 kernels for exp/expm1, log/log1p/log2/log10, pow, cbrt, trigonometric,
inverse trigonometric, hyperbolic and inverse hyperbolic methods. The kernels
retain fdlibm/OpenLibm coefficients and compensated reconstruction, with their
source and license notices in `bootstrap/runtime/memory.eli`. Trigonometric
range reduction includes the full finite binary64 range. Ordinary calls,
borrowed methods, bound functions and callbacks enter the same builtin thunks;
observable argument conversion completes before numerical work begins.

Kernels borrow a fixed 4 KiB workspace, lazily created once per heap. They
neither allocate nor call source functions, so coercion can reenter Math before
the workspace is borrowed without corrupting an outer calculation. The buffer
is traced and its root is cleared on module close. `hypot` retains one packed
f64 per converted argument, then uses maximum-magnitude scaling and compensated
summation. It converts every argument in order, including arguments following
NaN or infinity; an actual conversion throw is preserved, and otherwise
infinity takes precedence over NaN.

`Math.random` draws from an owned xoshiro128** state per heap. The standard
loaders obtain 16 entropy bytes once during initialization; draws do not call
host Math or request additional entropy. `randomSeed: [a, b, c, d]` (also a
four-element Uint32Array) snapshots an explicit nonzero u32 seed for reproducible
WASM/native replay. The raw ABI exposes `runtime-random-seed` before `heap-new`;
reseeding a live raw runtime is rejected. A heap's 16-byte state survives GC and
is unrooted on module close. Legacy artifacts without that export remain
loadable with default options and reject an explicit seed.

The complete Math batch and its permanent tests await unified execution.
Numerical accuracy, cross-target behavior and production budgets remain
unaccepted until their original gates run.

Eliscript functions using the internal word ABI must root parameters across the
first frame allocation and keep live locals in frames across allocating calls.
The text pipeline fixture demonstrates this explicitly. Automatic insertion of
these roots into the full compiler and complete dynamic lowering remain open.
Pool growth also retains prior arena regions; local collection tests do not
establish the complete compiler's peak-memory budget.

## Internal Map/Set keys

`keyEqual(left, right)` and `keyHash(value)` implement the internal mutable
Map/Set key foundation. Equality uses SameValueZero: all NaN payloads compare
equal, positive/negative zero compare equal, and null, false, true and undefined
remain distinct categories. Arithmetic `compare(..., 0)` keeps IEEE equality,
including false for NaN. Sealed strings compare UTF-16 code units; Number,
string and immediate hashes exactly match the existing primitive value runtime.

Bytes, mutable reference arrays and fixed records use their managed identity.
Two wrappers for the same underlying value form the same key; equal contents in
separate objects do not. Identity/hash survives mutation, resize and pool moves.
Different heaps/instances must use their own branded handles. Private frames and
unsealed builders are rejected, and expired values never become valid keys.
Comparison and hashing perform no allocation or GC and do not alter input data.

The raw APIs are `value-key-equal(heap, left, right)` returning word 0/1 and
`value-key-hash(heap, value)` returning a full u32. A zero hash is valid; inspect
`last-error` to distinguish failure. `word-xor` is an explicit memory32 capability
and preserves all 32 bits; it cannot silently narrow ordinary f64 values.
The key APIs are also used by the managed tables below. Persistent collection
IEquiv/IHash protocols and complete compiler lowering remain open.

## Managed Map/Set and live iterators

The checked APIs operate on managed handles; ordinary JS numbers require
`number(...)`. All storage, lookup, mutation, iteration and GC execute in WASM.

| Bridge method | Behavior |
| --- | --- |
| `map(capacity = 4)` / `setTable(capacity = 4)` | Create a mutable table, rounding capacity up to a power of two with minimum 4 |
| `tableSize(table)` / `tableHas(table, key)` | Query either kind without allocating |
| `tableGet(map, key)` | Return an individually rooted value; missing is `undefined`, so use `tableHas` to distinguish a stored `undefined` |
| `tableSet(map, key, value)` | Insert/update and return the original map handle; updates retain key/order |
| `tableAdd(set, key)` | Insert and return the original set handle; duplicates retain the original key/order |
| `tableDelete(table, key)` | Remove and return a boolean; reinsertions move to the end |
| `tableClear(table)` | Remove all entries and their references |
| `tableIterator(table)` | Return an individually rooted live iterator |
| `iteratorNext(iterator)` | Return `{done: true}` or `{done: false, key, value}`; each returned key/value handle owns a separate root, including Set pairs |
| `closeIterator(iterator)` | Permanently finish and release its table/current-value references |

Map-only and Set-only methods reject the other kind. SameValueZero applies;
new negative-zero keys become positive zero, while negative-zero Map values
keep their bits. Full hash collisions use key equality, and zero hashes/nil
keys remain valid. Tables and iterators use opaque identity when used as keys.
An iterator sees later insertions, skips unseen deletions and survives clear,
growth and compaction. Once it returns `done`, later inserts never revive it.

```javascript
const map = runtime.map();
runtime.tableSet(map, null, true);
const iterator = runtime.tableIterator(map);
try {
  for (;;) {
    const step = runtime.iteratorNext(iterator);
    if (step.done) break;
    console.log(step.key, step.value);
    runtime.release(step.key);
    runtime.release(step.value);
  }
} finally {
  runtime.closeIterator(iterator);
  runtime.release(iterator);
  runtime.release(map);
  runtime.collect();
}
```

Raw `value-table-*` and `value-iterator-*` exports provide the same operations.
`value-table-new(heap, kind, capacity)` accepts kinds 10/11; kind 12 is an iterator.
Raw lookup/current values are borrowed references; `value-iterator-next` returns
word 0/1, and current-value access before first advance or after done is rejected.
Like all raw calls, inspect `last-error` to distinguish valid zero results.

Buckets are separate from the insertion log. Full logs with holes compact in
place, while full tables allocate a replacement block and publish once. Tickets
are two monotonic u32 words, survive deletion/clear and refuse exhaustion.
After a real allocation failure, a no-allocation O(n log n) merge sort orders
live slots by address and packs all active blocks before retrying. It preserves
IDs, roots and exact payloads, and does not itself collect. Refresh raw data
addresses after any allocating call, even if `memory.buffer` stayed unchanged;
failed allocating calls can also move objects. Failure leaves logical entries,
order and tickets intact. Deleted entries stop retaining keys/values; completed
iterators release references, and unrooted table cycles are collectible.

These are internal storage/iteration primitives. General JS interop constructors,
callbacks/iterable protocols, persistent collections, automatic root insertion
and complete language/compiler lowering still require their own acceptance.

## Ordinary managed control programs

`managed-control-v1` is an explicit experimental ABI for ordinary Eliscript
control flow. The `.eli` managed lowering links the checked runtime, emits WASM
directly and adds a versioned export/arity descriptor. It uses zero imports.
The compiler host remains JavaScript, and this profile supports WASM output.

```sh
bun tools/backends/compile.mjs --abi managed-control-v1 --target wasm \
  -o control.wasm tests/fixtures/wasm-managed-control.eli
```

`instantiateManagedRuntime(bytes, options)` reads the descriptor and exposes
`invoke(name, arguments)`. Only declared source exports are callable; raw runtime
exports, incorrect arity, foreign handles and implicit JS numeric coercion are
rejected. Use `number(...)` and `string(...)` for those arguments; nil, booleans
and undefined cross directly. An invocation result handle owns one root.

```javascript
const input = runtime.string('中😀');
const output = runtime.invoke('identity', [input]);
console.log(runtime.readString(output));
runtime.release(output);
runtime.release(input);
runtime.collect();
```

The profile accepts primitive literals, references, `let`/`let*`, assignments,
sequences, `if`/`cond`/`when`/`unless`, `while`, `and`/`or`/`not`, synchronous required/optional/rest
parameters, direct named calls, named/lambda function values, dynamic calls,
`funcall` and `apply` over supported source iterables. Lisp truth preserves Number zero, NaN and empty strings as true;
short-circuit returns preserve actual operand values. Every unsupported node is
rejected even in an unselected branch. Persistent literals, imports, arbitrary
host interop, parameter destructuring, async functions, custom Symbol iterators
and exception expressions remain open; this profile does not represent the complete dynamic
backend.

The managed Symbol constructor represents all fifteen well-known symbols,
including `Symbol.dispose` and `Symbol.asyncDispose`, with immutable own data
properties. Their runtime identity numbers preserve the original thirteen
entries and append the two disposal symbols; constructor property enumeration
uses its own publication order. Static references, dynamic reads, symbol keys
and host transfers share these identities across collection. A host that lacks
a represented well-known symbol rejects its transfer explicitly. Resource
management declarations and disposable-stack algorithms remain separate work.

Function values execute through an owned WASM table and `call_indirect`, with
zero JS imports or callbacks. Named references share identity while live;
evaluating the same lambda creation site again produces a distinct value.
Captured mutable bindings use GC-traced cells, including transitive outer
captures, recursive cycles and separate bindings for each loop iteration.
Uncaptured source locals retain their ordinary representation. Source calls
snapshot the callee before arguments, evaluate all arguments once in order,
evaluate extras even when ignored, and supply undefined for missing required
arguments. Optional undefined defaults to nil, and each rest parameter receives
its own shallow source array. A noncallable fails after its arguments have
executed. `apply` snapshots its callee, evaluates and exhausts its iterable, then
calls the function; nil and undefined are invalid iterables. Source arrays
(including holes), strings (by code point), Map/Set and owned source iterators
are supported. Expansion and rest allocation execute inside WASM.

Source-array callback methods execute through the same owned WASM table:
`map`, `filter`, `forEach`, `some`, `every`, `find`, `findIndex`, `findLast`,
`findLastIndex`, `reduce` and `reduceRight`. Predicate methods use JavaScript
Boolean conversion, so zero, NaN and empty text are false here even though
ordinary Lisp conditions treat them as true. Callbacks receive the original
array and exact index, with an accumulator first for reductions. Length is
captured when iteration begins; later writes and removals are observed, appended
positions beyond that length are ignored, and each method follows its own
hole and early-exit rules. `map` preserves holes and `filter` produces a dense
array. Reductions without an initial value choose the first present position
and reject an empty sequence.

Receiver and method lookup precede all arguments. Own callable method overrides
use the captured function, and argument mutation cannot replace an already
captured builtin. `map` and `filter` retain ordinary constructor validation;
custom Symbol species, arbitrary prototypes and Map/Set callback methods remain
open. Callback errors, capacity failures and actual traps preserve caller roots
and earlier observable effects, without host callbacks or imports.

Host `invoke(name, args)` retains the exact descriptor arity for required-only
entries with plain parameter names. Optional/rest entries and parameter
destructuring use an argument list, including patterns whose parameters are all
required. Those
entries declare `arity: null`, `callingConvention: "argument-list"` and ordered
`parameterKinds` in their descriptor; the adapter checks these fields against
the export signature and transfers one dense owned argument list. The null arity
causes older fixed-arity readers to refuse the artifact rather than call it with
the wrong convention. Every operand
still obeys the existing owned-handle requirements. Getter, capacity and trap
failures release temporary lists and preserve caller frames. Every temporary
root release is attempted even if another cleanup action fails; cleanup cannot
replace the original thrown value, including primitive values.

```lisp
(defun make-counter (n)
  (lambda (delta) (setq n (+ n delta)) n))
(defun call-counter (counter delta) (funcall counter delta))
(export make-counter call-counter)
```

Private kinds 18/19 hold function environments and capture cells. Tracing follows
stable handles through heap growth and cycles; named identity lookup adds no
permanent roots. Errors retain their first code and actual WASM traps unwind
only frames created by the call. Parameter counts, duplicate names and hidden
parameter IR are checked before emission, without modifying canonical input IR.
Function-valued builtin members and general function properties/conversions
remain unsupported.

Single-module top-level `defvar`/`defconst`, expression statements and value
exports use the experimental `managed-module-v1` profile:

```sh
bun tools/backends/compile.mjs --abi managed-module-v1 --target wasm -o module.wasm module.eli
```

Initializers execute once per owned heap, in source order, with hoisted named
functions and the existing lexical shadowing rules. Mutable exports retain live
binding identity; const assignments are refused. Reading a binding before its
initializer completes raises `ELI-RT0008`. Declaration evaluation, binding reads,
closures and function dispatch execute inside WASM with zero imports. Project
imports, linking and the remaining full-compiler dependencies are still open.

The bridge initializes eagerly by default. `{initializeModule:false}` defers
evaluation until `initializeModule()`, which is idempotent after success.
`getExport(name)` returns the current value with an owned root; release returned
handles after use. `invoke(name,args)` snapshots a dynamic function binding before
reading host argument getters. `closeModule()` releases module roots and refuses
future module calls; caller-owned handles and frames retain their lifetimes.
Failed initialization caches its first error, drops partially initialized roots
and preserves existing caller frames, including after actual WASM traps.

The metadata envelope remains version 1, with a distinct module ABI. Logical
UTF-16 export names map to ordinal ASCII `wireName` aliases, including names
containing lone surrogates. Private kind-20 cells and a heap-rooted environment
hold binding identity and initialization state. Old readers explicitly refuse
this profile. Function-only sources keep their original `managed-control-v1`
ABI and physical export names unless the module profile is explicitly requested;
requesting the old profile for module bindings is rejected. Module output is
currently available only for WASM. This capability is not a full WASM compiler
host or completion of the nine-cell bootstrap matrix.

Number operands now support `+`, `-`, `*`, `/`, `1+` and `1-`, including zero-argument
addition/multiplication, unary negation/reciprocal and left-associated variadic
arithmetic. Single-argument `+`/`*` preserve the operand unchanged, matching the JS
emitter. IEEE results retain signed zero, NaN, infinities and subnormal behavior;
no floating-point rearrangement or approximation is used.

`=`, `eq`, `/=` and `not=` implement ordinary strict equality across supported
values: NaN is unequal to itself, positive and negative zero compare equal,
strings compare their UTF-16 contents and opaque values compare by identity.
This is separate from the SameValueZero equality used by Map/Set keys. `eq`
requires two operands. Variadic `=` compares adjacent pairs; `/=` and `not=`
compare every pair. All operands are evaluated once in source order before the
comparisons, even if the first pair is false. `<`, `<=`, `>` and `>=` support
Number pairs and String pairs (UTF-16 code-unit order), with the admitted
nil/boolean/undefined/Number/String coercions for mixed primitives. Object,
Symbol and BigInt ToPrimitive paths remain explicitly refused; no coercion
runs JS on behalf of WASM.

Number operands additionally support `%`/`mod`, `int32`/`uint32`, `imul32`,
`bit-not`, `bit-and`/`bit-or`/`bit-xor`, `bit-shift-left`/`bit-shift-right` and
`unsigned-bit-shift-right`. `%` and `mod` retain the existing truncating remainder
semantics, including the dividend's zero sign, nonfinite cases and exact
subnormal results; variadic remainder stays left-associated. The independent
runtime reduces full binary64 significands with exact two-word subtraction and
shifts, bounded by the binary64 exponent range. It never uses a rounded quotient
or delegates floating remainder to a host import.

Integer conversions truncate toward zero and retain the low 32 bits; NaN,
infinities and either zero become positive zero. Shift counts retain the low
five bits after unsigned conversion, arithmetic and logical right shifts remain
distinct, and `imul32` wraps multiplication exactly in 32 bits. Results are boxed
Numbers; these explicit operations do not narrow other Numbers. Primitive
String/nil/boolean/undefined operands use the shared exact Number conversion.
General object coercion remains unsupported.

Ordinary `js-array` values now use kind 14 with geometric capacity, logical
length and GC-scanned reference cells. This is distinct from the raw kind-7
reference-array ABI, which remains nil-filled and strictly bounded. Source
arrays support `js-length`, `js-nth`, `aref`/`get`/`put`, primitive length conversion
and static `push`/`pop`/`slice` calls. Reads retain actual undefined values;
`js-nth` converts null/undefined to nil and has the same receiver-before-index
order as the current JS emitter. Its nullish receiver uses empty-array semantics,
including Number-zero length, and still refuses unsupported key conversions.
`get` evaluates its default only for nullish
results. Assignment captures receiver/key before its RHS; calls capture receiver
before arguments and compute length after argument effects. Extra pop/slice
arguments are evaluated even when the method ignores them.

Index keys support exact nonnegative integral Numbers (including negative zero)
and canonical decimal strings through 2^32-2. Absent numeric keys return
undefined without truncating or wrapping. Length assignment converts supported
primitives and requires an exact uint32 result; valid lengths beyond configured
allocation capacity fail with ELI-RT0002. New/grown cells are holes, shrinking
clears references, and slices preserve holes and shallow aliases. Slice offsets
use primitive conversion and truncation/clamping, including NaN/infinities.

Source arrays distinguish holes from own undefined values, support named
primitive keys, own-property checks/enumeration and shallow object copies, and
retain method-shadow failures after argument evaluation. Host `sourceArray`
keeps the same own-slot shape even if its input overrides iteration. General
prototype/descriptor/accessor and dynamic method capabilities remain open.
`js-cons` evaluates its head and tail once, in that order, and prepends the
head to the tail iterator. Null and undefined tails become a fresh empty source
array, including its canonical iterator behavior; other invalid iterables throw
source TypeError. Result indices are own data slots, even with frozen inherited
indices. The existing raw spread helper continues to reject nullish tails.

The existing `host-identity-token` intrinsic maintains a private table per
original module, including across linked projects, imported aliases and nested
closures. Object and function entries do not keep keys alive; Symbols remain
strongly held until module close. Tokens are monotonic safe integers, independent
of reusable heap slots. Cached identities remain readable after exhaustion;
unsupported scalar inputs throw the original TypeError, and a new identity after
exhaustion throws RangeError. Cyclic imports retain the helper binding's original
initialization order and reject early calls before evaluating their arguments.

The complete existing `stdlib/persistent-vector.eli` module can now be linked
with a managed entry and executed as zero-import WASM or a native library.
Acceptance covers persistent versions, metadata, append/assoc/pop, reductions,
and tail/tree boundaries through 1057 elements against the original JS module.
Persistent vector literal syntax remains a separate, unimplemented source
capability. The bulk `sourceArray(input = [])` constructor creates kind-14 arrays, protects
earlier operands across later getters and rejects foreign handles. The existing
`array()` constructor retains raw kind 7. The exported setter protects a borrowed child
across allocation even when called without a generated frame.

Named `js-object` values use kind 13, a property table and a GC-traced prototype
edge. Object literals (including computed keys), `aref`/`get`/`put`/`js-nth`,
`js-length`, `object-has?`, `object-keys` and `object-assoc` are admitted.
Nullish receivers use the empty-own fallback for keys/has/assoc; other boxed
receiver kinds are explicitly refused for these operators.
Own enumeration sorts canonical array indices through 2^32-2 before other string
keys in insertion order; updates preserve positions. Assoc copies own fields
before evaluating its key and RHS, retains shallow aliases and defines an own
`__proto__` data property. Literal static `__proto__` sets a prototype; computed
keys define own data. Prototype chains support source objects and null, with
shadowing and cycle rejection. Ordinary length reads can return any field value.

Keys support sealed UTF-16 strings, nil/booleans/undefined and all Numbers
through exact primitive text conversion; negative zero becomes `"0"`. Symbols
and general Object ToPrimitive are explicitly refused. Inherited standard
Object prototype functions and an opaque default prototype result remain
unsupported; array or other container prototypes and accessors/descriptors
remain open. Unsupported values fail rather than silently invoke a JS helper.

The bulk `sourceObject(input)` copies own enumerable string fields into kind 13,
protecting values across subsequent host getters and defining own proto data.
`objectGet`, `objectHas`, `objectSet`, `objectKeys` and `objectCopy` expose the same
managed operations; sealed-string reads/own checks allocate no frames. Raw
constructors/setters protect borrowed prototypes/operands across allocating GC.
Private frames unwind to the caller on runtime failures and actual WASM traps.
All object semantics, sorting and collection execute in zero-import WASM.

Ordinary sealed String values now support numeric/canonical-digit indexed reads,
`length`, `get`/`aref`/`js-nth`, and static `at`, `charAt`, `charCodeAt`,
`codePointAt`, `slice`, `substring`, `substr`, `indexOf`, `lastIndexOf`,
`includes`, `startsWith`, `endsWith`, `concat`, `repeat`, `trim`, `trimStart`,
`trimEnd`, `isWellFormed`, `toWellFormed`, `toString` and `valueOf` calls.
Indices are UTF-16 code units; codePointAt combines a valid surrogate pair,
while interval operations can retain lone surrogates. Missing property reads,
character/code-point reads, and js-nth retain their distinct undefined/empty/NaN/
nil results. Slice dispatch is shared with source arrays without changing array
copy, capacity or alias semantics.

Positions/counts currently accept Number, nil, booleans and undefined. Full
binary64 positions use truncation and the method's own relative/clamp rules;
lastIndexOf treats NaN as the final possible position. String-to-Number and
object/Symbol conversions remain explicit refusals. Search needles and concat
arguments accept String, nil/booleans/undefined and all Numbers through exact
binary64 parsing/formatting and primitive conversions. Dynamic methods, function-valued property access, String prototype
overrides, general named properties/writes, regex, split/replace, case mapping
and normalization remain unimplemented and explicitly refused.

Receiver and every argument are captured before method conversions; unused extra
arguments still run. Zero-argument concat and omitted arguments have their own
actual source lowering cases. Forward and reverse searches share nonallocating
Two-Way critical factorization over original UTF-16 memory, without reversing or
copying the haystack. Repeat performs capacity/overflow preflight; trim uses the
complete admitted whitespace set, and repair replaces only unpaired surrogates.
Raw exported text operations protect borrowed inputs during allocating GC;
unfinished String keys fail rather than expose mutable builder data. Failure and
actual WASM traps preserve caller frames and original errors. These operations
execute in zero-import WASM; this slice is not a complete compiler runtime.

Ordinary source Map/Set values use kinds 15/16, with kind-17 live source
iterators. Static unshadowed constructors admit source arrays, strings by code
point, Map/Set values and source iterators. `get`/`set`/`add`/`has`/`delete`/
`clear`, `size`, `entries`/`keys`/`values` and `next` preserve SameValueZero keys,
insertion order and live iteration across mutation and collection. Source
function values are identity keys; source own fields remain distinct from table
entries. Callback methods and function-valued builtin member reads remain
explicitly unsupported.

The bulk entry protects earlier arguments across later getters. Generated frames
retain parameters, lexical variables and temporaries; each argument is captured
before later argument effects. Internal calls return borrowed values and install
them in the parent frame before further allocation. The raw entry caller must
retain parameter roots until return and pin its borrowed result before allocating.
No transient root counts are left inside generated functions. Runtime errors
skip later evaluation, clean only their own frames and retain the original code;
the bulk host unwinds a real WASM trap only to its pre-call frame. Direct property-reader leaves whose receiver and key are plain parameter
references avoid a generated frame. Full IR validation still precedes selection;
effectful keys, literal construction, defaults, assignments and larger bodies keep
the ordinary rooting path. Callers retain parameter roots, and allocating runtime
operations retain their own operands until the borrowed result is returned.
The current root strategy otherwise conservatively retains temporaries until function return; compiler
peak-memory and throughput acceptance remain separate, open gates.

## Verification

```sh
bun test tests/wasm-managed-callables.test.mjs tests/wasm-memory-runtime.test.mjs tests/wasm-managed-runtime.test.mjs tests/wasm-managed-tables.test.mjs tests/wasm-managed-control.test.mjs tests/wasm-managed-arithmetic.test.mjs tests/wasm-managed-word.test.mjs tests/wasm-managed-arrays.test.mjs tests/wasm-managed-objects.test.mjs tests/wasm-managed-strings.test.mjs
bun test tests/direct-wasm-backend.test.mjs
ELISCRIPT_TEST_BROWSER=firefox bun test tests/direct-wasm-backend.test.mjs
ELISCRIPT_TEST_BROWSER=webkit bun test tests/direct-wasm-backend.test.mjs
```

The tests include independent Node/Bun execution, Seed and three-generation
IR/byte fixed points, random codec/Unicode differentials, allocation failure,
moving collection, explicit root cleanup and real Chromium/Firefox/WebKit.
Numeric production reports retain their original inputs and per-case thresholds;
they do not establish complete compiler performance or any missing 3×3 host cell.

## Experimental managed projects

The pure compiler session provides `analyze`, `query`, and `edit-preview` on
the same source request protocol for all three compiler hosts. Semantic reports
include a text `sourceIdentity` with format `eliscript-source-identity`, version
1, filename, UTF-16 unit count and SHA-256 of the original UTF-16LE code units.
This text identity preserves BOMs and unmatched surrogates. Hashing reads the
source in fixed-size blocks without making a whole-source byte array. Diagnostic
reports retain the text identity too. It identifies source text, while the
browser/Worker transport separately binds macro inputs, IR and source revisions.
Worker request and source digests consume the same canonical UTF-16LE bytes in
one reusable 64 KiB buffer. They preserve the asynchronous API and cancellation
boundaries without allocating a second whole-message byte array. The static
browser distribution carries the same incremental SHA-256 module as packages.

`query` and `analyze` optionally accept `expectedSourceIdentity`.
`edit-preview` requires it, `offsetUnit: "unicode-scalar"`, and an `edits` array
of `{start, end, text}` in original-source coordinates. Edits must have distinct
starts in ascending order with no overlapping ranges; adjacent ranges, deletion,
insertion and EOF insertion are supported. The whole batch is validated before
any preview is constructed. The response contains `source`, `sourceIdentity`,
`previousSourceIdentity`, and `readOnly: true`. No compiler cache or registered
document is changed. The caller explicitly registers accepted text. Identity
mismatches return `ELI-T0002` before parsing or expansion; malformed edit batches
use `ELI-T0001`. Browser inline and Worker sessions also reject unregistered or
outdated snapshots before preview dispatch, using their existing revision checks.

Artifact metadata retains the original JSON representation, including the full
native typed IR. File and package loaders decode bounded UTF-8 chunks instead
of constructing a single JSON string; signed zero, property order and resource
hash checks are preserved. This transport handling performs no compilation.
Packaging copies and hashes each resource in bounded buffers and replaces its
destination only after the copied bytes match the declared identity.
Package manifests, artifact metadata and default debug documents use a single
file descriptor or HTTP body reader. Their incremental decoder and SHA-256
verification consume the same chunks; complete byte counts and hashes precede
publication or JSON errors. Browser integrity checks use the bundled bounded
SHA-256 implementation. Failed reads release their resources without replacing
the original error. Fresh, verified default debug documents avoid a second
whole-document clone; caller-supplied debug documents retain snapshot isolation.
For an executing WASM or native compiler, loader option `debug: false` disables only its
own source-frame lookup. Exact machine trap frames remain available, and each
compilation request still independently controls its generated output maps.

`buildIndependentCompiler({onPhase})` optionally reports fixed build phases and
scalar counts. It is silent by default, retains no source or IR in observations,
and observer failures never replace a compiler result or its original error.

`emit_managed_project_wasm(modules, entry, runtimeProgram, options)` links a bulk
array of `{id, program}` records. Each program is ordinary canonical compiler IR;
IDs are canonical relative virtual paths, and imports resolve relative to their
importer. Source filenames and spans remain attached to diagnostics. The pure
Eliscript linker reuses the project planner, retains source import order for
one-time evaluation, instantiates bindings before evaluating cycles, and leaves
all input IR unchanged. Reordering the supplied records does not change bytes.

Named/default imports, reexports, side-effect imports and namespace imports use
one owned module environment. Imports refer to the original cells; default
expressions retain the existing JS snapshot behavior. Namespace objects retain
shared identity, live string properties and a null prototype. Writes fail;
own checks, enumeration and copies retain initialization-before-read errors.
Copies contain current values with ordinary object semantics. Qualified names
and statically linked namespace calls use the existing symbol munging rules;
general dynamic method calls retain the managed profile's restrictions. No JS module executes
on behalf of the resulting zero-import WASM artifact.

Project exports use the public names emitted by the existing JS compiler. For
example, a source `read-value` export is invoked as `read_value`; the ordinary
named binding `default` exports as `default$`, distinct from a true `default`
export. Standalone managed modules keep their existing source-name interface.
Bindings that emit the same JS identifier shadow consistently across accepted
scopes, including captures and assignments. Fresh project names account for
emitted binding keys so munged local names cannot capture generated globals.
Returned values and module lifecycle methods follow `managed-module-v1` above.
The private namespace initializer is accepted only with linker-owned nodes;
private kind-20 cells remain hidden behind namespace reads. Namespace objects
use kind 13 with reserved header flag +20, retaining the existing tracing layout.

The CLI accepts the existing virtual-project request shape in a JSON file:

```json
{
  "mode": "project",
  "entry": "main.eli",
  "files": {
    "state.eli": "(defvar counter 0) (defun tick () (setq counter (1+ counter))) (export counter tick)",
    "main.eli": "(import \"./state.eli\" counter tick) (export counter tick)"
  }
}
```

```sh
bun tools/backends/compile.mjs --abi managed-module-v1 --target wasm --project -o project.wasm request.json
```

The host transfers sources and invokes the compiler; declaration execution,
namespace lookup and function dispatch remain in WASM. Invalid records, missing
modules/exports, path escapes and import assignments are refused before output
publication. This mode remains limited to the admitted managed IR: general
interop, Symbols/descriptors, async/exceptions, remaining compiler dependencies,
full compiler hosts and the complete bootstrap matrix remain open. The existing
browser Worker request/response protocol is unchanged.


Static `String.fromCharCode` and `String.fromCodePoint` calls, including existing
`string-from-code-unit`, construct sealed UTF-16 strings inside WASM memory.
All source arguments are evaluated and snapshotted before conversions. Code-unit
construction uses exact ToUint16; code-point construction accepts integer values
from zero through U+10FFFF, including lone surrogates, and rejects invalid ranges.
Supplementary points produce surrogate pairs. The runtime converts each argument
once and keeps its scratch space and caller-owned inputs alive across collection.

Only statically identified, unshadowed `String` / `globalThis.String` constructors
are accepted. Project linking preserves lexical shadowing of recognized raw
builtin references. Dynamic method lookup, general raw JavaScript and arbitrary
object ToPrimitive conversions remain outside this experimental profile.

Invalid code-point ranges use `ELI-RT0003` at the existing experimental bridge.
Source-level RangeError and catch semantics remain part of the incomplete
exception runtime; this capability does not promote the full backend.


## Experimental RegExp matching

Static RegExp literals compile through `bootstrap/backends/regexp.eli` into a
private word program. Its test and exec methods run inside owned WASM memory
with zero imports. Both methods share ordered backtracking, UTF-16 offsets,
Unicode code-point advancement, capture restoration and automatic roots.
The program is privately copied and structurally checked; guarded backedges
prevent zero-width repetitions from looping without consuming input.

The current capability includes literal characters, dot, character classes and
ranges, common character/control/hex/Unicode escapes, numbered captures,
noncapturing and named groups, alternatives, anchors and word boundaries,
greedy/lazy and bounded repetition, lookaround, backreferences, case folding
and the `d`, `g`, `i`, `m`, `s`, `u`, `v`, `y` flags. Literal and dynamic construction
use the same owned-memory matching program. Exec returns a source array with
captures, missing entries, index, input and groups. Method values and receivers are captured before arguments;
ignored arguments still execute, nullish receivers fail before arguments, and
noncallable ordinary methods fail after their arguments.

With `d`, `hasIndices` is true and successful exec results additionally own an
`indices` array of UTF-16 `[start, end]` pairs. An unmatched capture owns an
`undefined` entry. `indices.groups` has a null prototype for named captures and
shares the corresponding pair objects; it is otherwise an own `undefined`
property. Fresh result fields are defined as writable, enumerable and
configurable data properties, bypassing inherited setters. The no-`d` path has
no own `indices` property. These rules follow
[the match-indices algorithm](https://tc39.es/ecma262/multipage/text-processing.html#sec-makematchindicesindexpairarray).
The new indices paths and original valid-pattern migrations await unified
execution; implementation does not establish acceptance across the three hosts.

RegExp values own private kind-21 program/source references, traced by the common
collector. Temporary capture registers and growable backtracking storage belong
to the entered frame; capacity failures and actual traps preserve caller roots.
The current parser bounds nesting at 256, instructions at 1,048,576 and capture
or progress-register counts at 65,535. The existing heap/word ABI imposes its
normal allocation limits.

The `v` implementation uses nested unions, intersections (`&&`), subtraction
(`--`), code-point ranges/properties and finite strings (`\q{...|...}`). It
applies case folding before set operations, including complemented properties;
`u` and `v` are mutually exclusive. `unicodeSets` reflects `v` while `unicode`
continues to reflect `u`. Candidate strings match longest first with ordinary
backtracking, including reverse matching inside lookbehind. The grammar rejects
reserved unescaped punctuation and complements that may contain strings. These
rules follow [Unicode-set semantics](https://tc39.es/ecma262/multipage/text-processing.html#sec-static-semantics-maycontainstrings).

The seven Unicode properties of strings use checked-in, packed Unicode 15.1,
16.0 and 17.0 emoji data. Each heap loads only its selected immutable profile
on first use (91,000, 91,132 or 97,048 bytes), shares sequence records across
properties, and searches without constructing temporary strings. Ordinary
code-point matching allocates no emoji cache. The collector retains a live
cache, and module close releases its root. Pinned source identities and the
Unicode license are in `tools/runtime/unicode-emoji-inputs.json`; regenerate
with `tools/runtime/unicode-emoji-data.mjs --write`. Runtime builds never fetch
data or expand those tables into per-character instructions. The internal
`copy-static-u16` memory capability accepts a literal and lowers to the same
bounded static-data copy used by ordinary managed literals.

The Unicode-set implementation and its permanent tests await unified execution;
full RegExp compatibility remains open. Unsupported static forms are rejected
with ELI-B0001 and the original source identity. The complete
semantic corpus, all compiler hosts and production resource budgets still require
their original acceptance gates; this experimental capability does not close them.

## Experimental primitive builtin values

The original `Number`, `String`, `Boolean`, `Number.isFinite`, `Number.isNaN`,
`Number.isInteger`, `Number.isSafeInteger`, `Array.isArray`, global `isFinite`
and global `isNaN` references use ordinary WASM function-table entries. Source
code can store, compare, capture, apply and pass these values to callbacks.
Supported direct static method/property reads and qualified references retain
the same identity, including the corresponding `globalThis` spellings.

Number and String distinguish a missing first argument from explicit undefined;
extra arguments still execute before conversion. Boolean uses JS truth, while
ordinary language conditions retain their existing Lisp truth. Number predicates
never coerce; the two global numeric predicates use the shared exact primitive
ToNumber conversion. Integer predicates inspect binary64 words without truncating
to a machine integer or rounding a fractional input.

Internal argument-list adapters preserve method lookup order, local and module
shadowing, linked binding identities, automatic roots and trap cleanup. They do
not replace the original compiler input or change public canonical IR. Mutable
builtin properties/prototypes, reflection on builtin functions, wrapper-object
construction and object ToPrimitive conversions remain open; unsupported forms
are rejected rather than being reported as a complete builtin or compiler host.

## Experimental ordinary JSON data

The original `JSON.parse` and `JSON.stringify` calls and function references run
inside WASM with zero imports. They use ordinary source arrays and objects and
the shared exact Number conversion and decimal formatting. This does not change
the separate strict persistent JSON/Result library.

The data path covers JSON grammar, UTF-16 escapes including unpaired surrogates,
duplicate keys, ordinary object prototypes, own `__proto__` data properties,
integer-key ordering, undefined/function omissions, array holes, nonfinite
numbers, well-formed JSON string escaping, indentation and property-list
replacers. Builtin references use the same callable ABI and binding identity as
other supported builtin values; local and linked namespace shadows keep ordinary
method lookup and argument effects. Empty `String()` results are sealed before
being returned to subsequent source operations.

Parsing and serialization keep text, intermediate containers, growable UTF-16
output, ancestor identity and temporary values in the owned heap and root frames.
Nesting beyond 512 reports the existing capacity error. Invalid JSON, cycles and
unsupported conversions retain their structured runtime diagnostics and source
exception classes. Output growth, exact surrogate handling, GC, capacity failures
and actual WASM traps retain the original independent tests and budgets.

The callback implementation uses source functions for revivers, replacers and
`toJSON`, including the holder as `this` and original key order. Revivers visit
children before their parent; returning undefined deletes a property. Their
third context argument exposes the exact original token as `source` only for an
unchanged primitive whose parse record still applies. No parse-record graph is
built when the reviver is not callable. Stringification applies `toJSON` and the
replacer before unboxing or deciding omission, and snapshots object keys or array
length at the specified stage. Callback mutations and original throws remain
observable.

`JSON.rawJSON(text)` validates a primitive JSON document without leading or
trailing whitespace, using the parser's lexical rules without materializing an
unused decoded representation. It returns a frozen, null-prototype object with its original
`rawJSON` text. Its private brand is independent of public fields or property
copies. `JSON.isRawJSON` does not coerce its argument; stringification emits a
branded object's text after the ordinary transformation steps. This preserves
large numeric tokens and their original spelling. These interfaces follow
[the JSON algorithms](https://tc39.es/ecma262/multipage/structured-data.html#sec-json-object).
The callback, raw-text and RegExp property-list paths have regression source in
the complete selected-compiler replay but await unified execution. They do not
establish JSON compatibility, a compiler host or a full matrix cell.

## Experimental ordinary string replacement

Original `String.replace` calls execute first-occurrence string searches and the
existing stateless RegExp profile entirely in WASM. Replacement templates retain
literal dollars, matched text, prefixes, suffixes, absent captures, one/two-digit
capture fallback and UTF-16 boundaries. Primitive search and replacement values
use the shared exact conversions. Noncallable replacements convert before the
search even when no match exists; callback results are converted after invocation
and are not interpreted as templates.

Callbacks use the ordinary function table, closure roots and argument-list ABI.
They receive the match, available captures, code-unit offset and original input,
and execute only when a match exists. Same-named ordinary object methods retain
lookup before argument effects and their captured callable identity. Temporary
match arguments, output growth and returned text live in the owned heap.

Global/sticky RegExp state, custom Symbol.replace hooks, arbitrary builtin
prototype changes, object ToPrimitive and complete source exception identities
remain open. This does not claim complete RegExp, replacement, standard-library
or compiler-host support; replaceAll remains a separate unimplemented method.

## Ordinary lexical bindings without initializers

Managed WASM now preserves the existing JS behavior of plain `let` and `let*`
bindings without initializers: their initial value is nil. Parallel bindings
still evaluate initialized siblings in the outer scope; sequential bindings see
earlier bindings, including nil defaults. Captured cells retain later writes and
escaped closures keep their cells alive independently of their declaring frame.

Binding shape is checked before reading initializer children. Malformed names,
invalid initializer nodes and unsupported binding patterns report the
existing source-bound ELI-B0001 diagnostic without mutating the original IR.
This does not implement destructuring or change the source language contract.

## Ordinary array text conversion

Managed WASM implements ordinary `join` and array `toString`
inside owned memory. It preserves sparse positions, exact primitive text,
the length captured before separator conversion, and element reads after earlier
conversion effects. Ordinary object conversion calls source `toString` and
`valueOf` functions in order through the existing WASM function table, including
closures. Method lookup precedes argument evaluation, including ignored extras.
Private join frames are unwound after allocation errors and actual WASM traps.

The internal `memory32` capability `call-source` passes heap, function, argument
vector and count through a checked four-word table signature. Explicit internal
`indirectArities` declarations allow an empty table without a matching local
body; undeclared signatures and malformed declarations remain errors. Missing
or incorrectly typed table targets retain WASM bounds and type traps.

Circular array text conversion throws TypeError with ELI-RT0009 in both the JS
and managed WASM paths, following native Emacs string joining's error direction.
Noncircular conversion keeps existing JS rules. JS modules share one immutable
data-URL support module and no global prototype is changed. Its readable source
is `runtime/array-text.mjs`; `bun tools/compiler/array-text-capsule.mjs --write`
refreshes the compact literals in both emitters. This maintenance operation uses
the development bundler; normal compilation by any compiler host emits only the
fixed literal and never invokes a bundler, optimizer or external service.

The shared JS support also handles real `call`, `apply`, `Reflect.apply` and
`bind` method identities, including nested borrowing. It consumes the complete
apply argument list in the original order. User replacements keep ordinary
method behavior. Supported bindings remain genuine native bound functions with
the original descriptors and prototype; their private target preserves live
`instanceof` delegation. Bound calls and callbacks return through the same
number/array rules. No global or prototype method is replaced.

For Number `toString`, nondecimal JS formatting uses the same exact integer and
rounding-interval algorithm as managed execution, including boxed Numbers and
receiver-before-radix validation. Decimal text retains the builtin spelling.
This handling applies to emitted method calls and their bound functions; it
does not rewrite foreign JS that directly calls an original unbound intrinsic.

Represented lexical/module `typeof` identifiers and static member paths now
execute within WASM. They preserve null/undefined, function identity and module
renaming without invoking object conversion hooks. Existing `nil?`, `undefined?`,
`null` and `nullish?` predicates retain their distinct current meanings; `null`
and `nullish?` both accept nil or undefined. Unknown ambient bindings, arbitrary
raw JS expressions and unimplemented primitive prototype values remain explicit
refusals. Full object conversion, function source reflection, arbitrary prototype
changes and complete compiler hosts remain open. See the single backend plan
for remaining acceptance gates.

The compiler's high-level managed WASM product operations lower source IR and
emit their fresh private typed graph in one operation. They return bytes,
descriptor and optional debug information; they do not transfer a mutable typed
graph to callers. Configuration runs after lowering, before emission. The public
typed emitters still snapshot caller-owned input and preserve its reuse.

`compiler-cli.mjs build --root DIRECTORY` reads the complete compiler, runtime
and literal source graph from that directory. `--debug` retains each emitted
JavaScript module's source map and macro origins, including builds produced by
an independent compiler session. Bootstrap commands use the same selected source
root. A missing source root reports its original file error.

Compiler artifact metadata uses the existing exact JSON wire, including signed
zero, shared-subtree visits, BigInt decimal strings and original getter errors.
`forEachCompilerMetadataChunk` synchronously consumes that wire in bounded token
batches. Product hashes consume those batches directly, and metadata files write
the captured chunks with their original trailing newline. All source reads finish
before file I/O yields, preserving the caller's pre-dispatch snapshot while
avoiding a single string containing the entire typed graph.

Native and WASM emitters accept `binaryEncoding: "u16le-chunks"` in their options;
compiler session requests accept the same field. The default remains an array
of byte values. Packed output contains `encoding`, `byteLength` and `chunks`:
each string holds up to 2048 UTF16 units, each unit represents two little-endian
bytes, and an odd final byte has a zero high half. JSON preserves every code
unit, including unpaired surrogates. Mach-O page signatures and debug offsets
refer to the original bytes. Independent binary compiler builds use this form
and `decodeCompilerBinary` validates and decodes it into the actual file bytes.

Sessions advertising `responseModes: ["events-v1"]` also accept the request
option `responseMode: "events-v1"`. The adapter assembles ordered data events
from bounded replies, preserving the original returned value without joining
one enormous JSON document. Tokens isolate the pending cursor; completion,
cancellation, failures and session close release it. Normal requests keep the
existing JSON response protocol. Independent binary builds negotiate this mode
through the producer's actual capabilities.
`graph-events-v1` is a separately advertised mode with version 2 envelopes.
Containers receive consecutive IDs on first traversal; references reuse only
completed containers. This preserves actual object sharing in compiler data
without removing instructions or source metadata. Active-ancestor references
remain cycle errors. Each physical object's properties are visited once in
this explicit mode; ordinary and `events-v1` traversal are unchanged. Binary
builds with `debug: true` prefer graph responses when advertised, preserving
shared source spans throughout the debug mapping. Other builds prefer events;
graph-only producers and legacy JSON producers remain supported. This choice
does not establish that a complete compiler fits its memory or time budget.
Each reply contains at most 256 events. An `array-values` event carries at most
256 consecutive numeric array elements, preserving signed zero and the ordinary
null representation of nonfinite numbers. Mixed elements resume in their
original order without reading an array getter twice. The receiving adapter
validates each bounded run before appending it.

Native runtime loading snapshots the function ABI and complete control
descriptor before asynchronous imports. Function bodies remain in the complete
compiler artifact and its identity; the native loader consumes their emitted
machine code and does not copy those unused bodies into another runtime record.
