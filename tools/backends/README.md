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
sequences, `if`/`cond`/`when`/`unless`, `while`, `and`/`or`/`not`, required synchronous
parameters and direct named calls. Lisp truth preserves Number zero, NaN and
empty strings as true; short-circuit returns preserve actual operand values.
Every unsupported node is rejected even in an unselected branch. Mixed coercion,
persistent literals, closures, imports, interop, async and exception expressions
remain open; this profile does not represent the complete dynamic backend.

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
Number pairs and String pairs (UTF-16 code-unit order); mixed-type coercion is
explicitly refused. Unsupported coercion never runs JS on behalf of WASM.

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
Numbers; these explicit operations do not narrow other Numbers. String/object
coercion remains unsupported and is refused before subsequent evaluation.

Ordinary `js-array` values now use kind 14 with geometric capacity, logical
length and GC-scanned reference cells. This is distinct from the raw kind-7
reference-array ABI, which remains nil-filled and strictly bounded. Source
arrays support `js-length`, `js-nth`, `aref`/`get`/`put`, Number length assignment
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
undefined without truncating or wrapping. Length assignment currently requires
a Number that is an exact uint32; valid lengths beyond configured allocation
capacity fail with ELI-RT0002. New/grown cells read as undefined; shrinking clears
references, and slices preserve shallow aliases. Slice offsets support Numbers,
nil, booleans and undefined with truncation/clamping, including NaN/infinities.

This array slice does not yet implement named properties, prototypes, property
presence/enumeration, hole-presence metadata, overridden methods or generic
ToPrimitive/ToNumber conversions. Non-numeric property names other than length,
non-index writes, dynamic methods and unsupported values are explicitly refused;
none silently invoke JS. Heap inspection reads dense cells, not JS hole-presence
metadata. Persistent vector literals remain a separate, unimplemented source
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

Keys support sealed UTF-16 strings, nil/booleans/undefined, NaN/infinities and
exact signed integer Numbers with magnitude through 2^32-1; negative zero becomes
`"0"`. Other numeric formatting, Symbols and general ToPrimitive are explicitly
refused. Inherited standard Object prototype functions and an opaque default
prototype result remain unsupported; array or other container prototypes,
accessors/descriptors, named array properties and hole/presence semantics remain
open. Unsupported values fail rather than silently invoke a JS helper.

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
arguments accept String, nil/booleans/undefined, NaN/infinities and exact signed
integer Numbers through magnitude 2^32-1; general finite-number formatting is
still open. Dynamic methods, function-valued property access, String prototype
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
bun test tests/wasm-memory-runtime.test.mjs tests/wasm-managed-runtime.test.mjs tests/wasm-managed-tables.test.mjs tests/wasm-managed-control.test.mjs tests/wasm-managed-arithmetic.test.mjs tests/wasm-managed-word.test.mjs tests/wasm-managed-arrays.test.mjs tests/wasm-managed-objects.test.mjs tests/wasm-managed-strings.test.mjs
bun test tests/direct-wasm-backend.test.mjs
ELISCRIPT_TEST_BROWSER=firefox bun test tests/direct-wasm-backend.test.mjs
ELISCRIPT_TEST_BROWSER=webkit bun test tests/direct-wasm-backend.test.mjs
```

The tests include independent Node/Bun execution, Seed and three-generation
IR/byte fixed points, random codec/Unicode differentials, allocation failure,
moving collection, explicit root cleanup and real Chromium/Firefox/WebKit.
Numeric production reports retain their original inputs and per-case thresholds;
they do not establish complete compiler performance or any missing 3×3 host cell.
