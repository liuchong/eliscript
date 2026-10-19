import {beforeAll, afterAll, test} from 'bun:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {buildBackends} from '../tools/backends/build.mjs';
import {definition} from '../tools/compiler/controlled-baseline.mjs';
import {instantiateManagedRuntime} from '../tools/backends/managed-runtime.mjs';
import {temporaryRootSource, temporaryRootOptions, initializeTemporaryRootRuntime,
  exerciseTemporaryRootPressure, exerciseTemporaryRootValues, closeTemporaryRootRuntime} from './helpers/managed-temporary-roots.mjs';

const depths = [8, 16, 32, 64];
function nested(depth) {
  let value = '(js-array -0.0)';
  for (let index = 0; index < depth; index++) value = `(let* ((a (js-array)) (b ${value})) b)`;
  return value;
}
const boundarySource = `
(defun branch-rhs (flag)
 (let ((out (if flag (let* ((a (js-array -0.0)) (b (js-array a))) (get b 0))
                         (let* ((a (js-array 7)) (b a)) b))))
  (js-array (get out 0) (get out :length))))
(defun short-rhs (flag)
 (let ((out (or (and flag (let* ((a (js-array -0.0)) (b a)) b))
                 (let* ((a (js-array 9)) (b a)) b))))
  (js-array (get out 0) (get out :length))))
(defun recur-rhs (count)
 (let ((out (loop ((index count) (value (js-array -0.0)))
              (if (= index 0) value
                (let* ((next (js-array (+ (get value 0) 1))))
                 (recur (1- index) next))))))
  (js-array (get out 0) (get out :length))))
(defun while-rhs (count)
 (let ((out (let ((index count) (value (js-array -0.0)))
              (while (> index 0)
               (let* ((next (js-array (+ (get value 0) 1))))
                (setq value next index (1- index)))) value)))
  (js-array (get out 0) (get out :length))))
(defun caught-rhs (flag)
 (let* ((out (try
              (let* ((inner (js-array (js-array 7) (if flag (throw false) -0.0)))
                     (result (js-array inner))) result)
              (catch error (js-array error))))
        (stress (make-large)))
  (js-array (get out :length) (get stress :length))))
(defun global-rhs ()
 (let* ((out (setq saved (let* ((a (js-array -0.0)) (b a)) b)))
        (stress (make-large))) out))
(export branch-rhs short-rhs recur-rhs while-rhs caught-rhs global-rhs)
`;
let directory, backend, privateHelpers, lowered, bytes, reference;
beforeAll(async () => {
  directory = await mkdtemp(resolve(tmpdir(), 'eliscript-root-cleanup-'));
  backend = await buildBackends({outputRoot: directory});
  const production = await readFile('bootstrap/backends/managed.eli', 'utf8');
  const names = ['managed-fail', 'word-node', 'word-constant', 'word-local', 'word-set', 'word-sequence',
    'word-compare', 'word-if', 'append-managed', 'runtime-call', 'runtime-arguments', 'capture-error',
    'managed-guard', 'checked-control', 'managed-temporary-root-count', 'managed-temporary-root-barrier-p',
    'enter-managed-temporary-root-rhs', 'clear-managed-temporary-roots'];
  const helpers = '(module root.cleanup.helpers\n(import ' +
    JSON.stringify(pathToFileURL(resolve(directory, 'backends/numeric.mjs')).href) + ' backend-fail find-function)\n' +
    names.map(name => definition(production, name + ' ')).join('\n') +
    '\n(export managed-temporary-root-count managed-temporary-root-barrier-p enter-managed-temporary-root-rhs clear-managed-temporary-roots))';
  privateHelpers = await import('data:text/javascript;base64,' + Buffer.from(backend.compiler.compile_string(helpers, 'root-cleanup-helpers.eli')).toString('base64'));
  const source = temporaryRootSource + boundarySource + depths.map(depth =>
    `\n(defun cleanup-depth-${depth} () ${nested(depth)})\n(export cleanup-depth-${depth})`).join('');
  const program = backend.compiler.compile_ir_string(source, 'root-cleanup.eli'), saved = JSON.stringify(program);
  const runtime = backend.compiler.compile_ir_string(await readFile('bootstrap/runtime/memory.eli', 'utf8'), 'runtime.eli');
  lowered = backend.managed.lower_managed_program(program, runtime);
  assert.equal(JSON.stringify(program), saved);
  const raw = backend.wasm.emit_typed_memory_wasm(lowered.typed, {initialPages: 1, maximumPages: 8});
  bytes = Uint8Array.from(backend.wasm.append_metadata_section(raw, 'eliscript-managed-control', JSON.stringify(lowered.descriptor)));
  assert.deepEqual(WebAssembly.Module.imports(new WebAssembly.Module(bytes)), []);
  reference = await import('data:text/javascript;base64,' + Buffer.from(backend.compiler.emit_ir_string(program)).toString('base64'));
}, 120000);
afterAll(async () => {lowered = undefined;backend = undefined;privateHelpers = undefined;if (directory) await rm(directory, {recursive: true, force: true});});

function walk(root, visit) {
  const seen = new Set(), pending = [root];
  while (pending.length) {
    const node = pending.pop();if (seen.has(node)) continue;seen.add(node);visit(node);
    for (let index = node.children.length - 1; index >= 0; index--) pending.push(node.children[index]);
  }
  return seen.size;
}
function state(roots) {
  return {temporaryRoots: roots.slice(), locals: [], roots: 99, heap: {index: 0}, error: {index: 1}, frame: {index: 2},
    runtime: [{name: 'frame-set', index: 101}, {name: 'frame-clear-range', index: 102}, {name: 'last-error', index: 103}]};
}
test('private completed RHS consumption preserves prefix suffix frame indices and snapshot invalidation while barriers retain original cleanup coverage', () => {
  const original = [10, 12, 14, 16], ordinary = state(original);
  const output = privateHelpers.clear_managed_temporary_roots(ordinary, 1, 3);
  assert.deepEqual(ordinary.temporaryRoots, [10, 16], 'a retained assignment result after end remains registered');
  assert.equal(ordinary.roots, 99);assert.equal(ordinary.snapshotRootEpoch, 1);
  const cleared = [];walk(output, node => {if (node.kind === 'call' && node.value === 101) cleared.push(node.children[2].value);});
  assert.deepEqual(cleared, [12, 14]);
  privateHelpers.clear_managed_temporary_roots(ordinary, 1, 2);
  assert.deepEqual(ordinary.temporaryRoots, [10]);assert.equal(ordinary.snapshotRootEpoch, 2);
  privateHelpers.clear_managed_temporary_roots(ordinary, 1, 1);assert.equal(ordinary.snapshotRootEpoch, 2);
  const conservative = state(original);conservative.temporaryRootCleanupBarrier = true;
  assert.deepEqual(privateHelpers.clear_managed_temporary_roots(conservative, 1, 3), output);
  assert.deepEqual(conservative.temporaryRoots, original);assert.equal(conservative.snapshotRootEpoch, 1);
});
test('RHS barrier classification covers every current nonlocal IR family through branches and does not inspect metadata or nested function bodies', () => {
  const node = (kind, children = []) => ({kind, children});
  const state = {};
  for (const kind of ['try-expression', 'throw-expression', 'loop', 'binding-loop', 'recur', 'await-expression']) {
    const branch = node('conditional', [node('literal'), node('short-circuit', [node('literal'), node(kind)]), node('literal')]);
    assert.equal(privateHelpers.managed_temporary_root_barrier_p(state, branch), true, kind);
    const previous = privateHelpers.enter_managed_temporary_root_rhs(state, branch);assert.equal(previous, false);
    assert.equal(privateHelpers.enter_managed_temporary_root_rhs(state, node('literal')), true, 'the barrier reaches nested RHS boundaries');
    state.temporaryRootCleanupBarrier = previous;
  }
  const ordinary = node('lexical-bindings', [node('conditional', [node('literal'), node('literal'), node('literal')])]);
  Object.defineProperty(ordinary, 'source', {get() {throw Error('opaque source metadata must not be read');}});
  Object.defineProperty(ordinary, 'properties', {get() {throw Error('opaque properties must not be read');}});
  assert.equal(privateHelpers.managed_temporary_root_barrier_p({}, ordinary), false);
  assert.equal(privateHelpers.managed_temporary_root_barrier_p({}, node('function-expression', [node('try-expression')])), false);
  let shared = node('literal');for (let depth = 0; depth < 28; depth++) shared = node('conditional', [shared, shared]);
  assert.equal(privateHelpers.managed_temporary_root_barrier_p({}, shared), false, 'memoization handles shared source edges without expanding their paths');
  assert.equal(privateHelpers.managed_temporary_root_barrier_p({}, {kind:'literal',children:null}), true);
});
function exportedFunction(name) {
  const item = lowered.descriptor.functions.find(record => record.name === name);assert(item);
  const alias = lowered.typed.aliases.find(record => record.name === (item.wireName ?? name));assert(alias);
  const fn = lowered.typed.functions.find(record => record.name === alias.function);assert(fn);return fn;
}
test('actual nested let-star lowering emits each completed private root cleanup once and grows linearly with nesting depth', () => {
  const frameSet = lowered.typed.functions.find(fn => fn.name === 'frame-set').index;
  let previous;
  for (const depth of depths) {
    const cleared = new Map();
    const nodes = walk(exportedFunction('cleanup-depth-' + depth).body, node => {
      if (node.kind === 'call' && node.value === frameSet && node.children[3]?.kind === 'literal' && node.children[3].value === 0) {
        const root = node.children[2].value;cleared.set(root, (cleared.get(root) ?? 0) + 1);
      }
    });
    assert(cleared.size >= depth, 'every initialized private array temporary is still cleared');
    for (const [root, count] of cleared) assert.equal(count, 1, 'root ' + root + ' must not be re-cleared by every enclosing RHS');
    if (previous) assert(nodes <= previous * 2 + 128, 'doubling source nesting has linear IR growth, including local-storage resets');
    previous = nodes;
  }
});
function read(a, value) {
  if (value?.kind === 4) return a.readNumber(value);
  if (value?.kind === 5) return a.readString(value);
  if (value?.kind === 14 || value?.kind === 7) {
    const output = [];
    for (let index = 0; index < a.length(value); index++) {
      const child = a.get(value, index);try {output.push(read(a, child));} finally {a.release(child);}
    }
    return output;
  }
  return value;
}
test('original 64-slot pressure capacity recovery captures aliases named temporary bindings and source first errors remain intact', () => {
  const a = instantiateManagedRuntime(bytes, temporaryRootOptions);
  try {initializeTemporaryRootRuntime(a);exerciseTemporaryRootPressure(a, reference);exerciseTemporaryRootValues(a, reference);}
  finally {closeTemporaryRootRuntime(a);}
}, 30000);
test('actual branches short circuits caught throws while loops and recur preserve caller roots under per-allocation GC and recover after errors', () => {
  const a = instantiateManagedRuntime(bytes, temporaryRootOptions);initializeTemporaryRootRuntime(a);
  const zero = a.number(-0), frame = a.frame(1);a.frameSet(frame, 0, zero);
  try {
    for (const name of ['branch-rhs', 'short-rhs', 'caught-rhs']) for (const flag of [false, true]) {
      const value = a.invoke(name, [flag]);try {assert.deepEqual(read(a, value), reference[name.replaceAll('-', '_')](flag));} finally {a.release(value);}
      a.collect();assert(Object.is(a.readNumber(zero), -0));assert.equal(a.stats().frameDepth, 1);
    }
    for (const name of ['while-rhs', 'recur-rhs']) for (const count of [0, 8]) {
      const input = a.number(count);let value;
      try {value = a.invoke(name, [input]);assert.deepEqual(read(a, value), reference[name.replaceAll('-', '_')](count));}
      finally {a.release(value);a.release(input);}
      a.collect();assert(Object.is(a.readNumber(zero), -0));assert.equal(a.stats().frameDepth, 1);
    }
    const stored = a.invoke('global-rhs');let again;
    try {a.collect();again = a.invoke('read-global');assert(a.keyEqual(stored, again));assert.deepEqual(read(a, again), [-0]);}
    finally {a.release(again);a.release(stored);}
    for (const name of ['initializer-first-error', 'assignment-first-error']) {
      const value = a.invoke(name);try {assert.deepEqual(read(a, value), reference[name.replaceAll('-', '_')]());} finally {a.release(value);}
    }
    const recovered = a.invoke('initializer-release');try {assert.equal(a.readNumber(recovered), 8192);} finally {a.release(recovered);}
    assert(Object.is(a.readNumber(zero), -0));assert.equal(a.stats().frameDepth, 1);
  } finally {a.leaveFrame(frame);a.release(zero);closeTemporaryRootRuntime(a);}
}, 30000);
