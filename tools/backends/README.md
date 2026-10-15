# Direct backends and the managed WASM runtime

The standalone backend CLI supports the experimental `numeric-f64` and
`memory-u32` capability subsets. The complete compiler still runs as JavaScript.
The implementation and remaining acceptance gates are tracked in
[the backend plan](../../docs/native-wasm-feasibility.md).

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
entries and accepts a variable argument count for optional/rest entries. Those
entries declare `arity: null`, `callingConvention: "argument-list"` and ordered
`parameterKinds` in their descriptor; the adapter checks these fields against
the export signature and transfers one dense owned argument list. The null arity
causes older fixed-arity readers to refuse the artifact rather than call it with
the wrong convention. Every operand
still obeys the existing owned-handle requirements. Getter, capacity and trap
failures release temporary lists and preserve caller frames.

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
Persistent vector literals remain a separate, unimplemented source capability. The bulk `sourceArray(input = [])` constructor creates kind-14 arrays, protects
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
noncapturing groups, alternatives, anchors and word boundaries, greedy/lazy
`*`, `+`, `?`, and the `m`, `s`, `u` flags. Exec returns a source array whose
captures, missing entries, index, input and own undefined groups property match
the existing JS source. Method values and receivers are captured before arguments;
ignored arguments still execute, nullish receivers fail before arguments, and
noncallable ordinary methods fail after their arguments.

RegExp values own private kind-21 program/source references, traced by the common
collector. Temporary capture registers and growable backtracking storage belong
to the entered frame; capacity failures and actual traps preserve caller roots.
The current parser bounds nesting at 256, instructions at 1,048,576 and capture
or progress-register counts at 65,535. The existing heap/word ABI imposes its
normal allocation limits.

Bounded repetitions, backreferences, lookaround, named groups, case folding,
other flags, dynamic RegExp construction, mutable RegExp properties/prototypes,
object ToPrimitive conversion, string replacement/search/split integration and
source exception semantics remain open. Unsupported static forms are rejected
with ELI-B0001 and the original source identity. This experimental capability
does not complete RegExp, the standard library or a compiler host.

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
unsupported conversions currently use the experimental ELI-RT0003 bridge;
source SyntaxError/TypeError identities and full exception behavior remain open.
Output growth, exact surrogate handling, GC, capacity failures and actual WASM
traps are tested independently of host JSON execution.

Callable revivers/replacers and callable `toJSON` transformations are explicitly
refused, rather than silently ignored. Complete callback context, wrapper-object
conversions, arbitrary JSON namespace aliases/mutation and builtin-prototype
reflection remain open. These ordinary data capabilities do not complete JSON,
the standard library, a compiler host or the full backend matrix.
RegExp property-list reads require the still-open reflection path and fail
explicitly; an unavailable property must not be silently replaced by undefined.

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
