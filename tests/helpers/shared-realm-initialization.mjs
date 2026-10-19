import assert from 'node:assert/strict';

export const sharedRealmDeclarations = `
 (defun realm-read (kind)
  (cond ((= kind 0) (js* "Object")) ((= kind 1) (js* "Number")) (t (js* "Array"))))
 (defun realm-shared-observation ()
  (let* ((object (realm-read 0)) (number (realm-read 1)) (array (realm-read 2))
         (object-prototype (get object :prototype)) (number-prototype (get number :prototype))
         (array-prototype (get array :prototype)) (keys (get object :keys))
         (finite (get number :isFinite)) (is-array (get array :isArray)))
   (try
    (put object-prototype "eliscript-shared-realm-probe" -0.0)
    (put number-prototype "eliscript-shared-realm-probe" 7)
    (put array-prototype "eliscript-shared-realm-probe" 9)
    (let ((again-object (realm-read 0)) (again-number (realm-read 1)) (again-array (realm-read 2)))
     (JSON/stringify (js-array
      (Object/is again-object object) (Object/is again-number number) (Object/is again-array array)
      (Object/is (get again-object :prototype) object-prototype)
      (Object/is (get again-number :prototype) number-prototype)
      (Object/is (get again-array :prototype) array-prototype)
      (Object/is (get (get again-object :prototype) "eliscript-shared-realm-probe") -0.0)
      (get (get again-number :prototype) "eliscript-shared-realm-probe")
      (get (get again-array :prototype) "eliscript-shared-realm-probe")
      (Object/is (get again-object :keys) keys) (Object/is (get again-number :isFinite) finite)
      (Object/is (get again-array :isArray) is-array)
      (Object/is (get object-prototype :constructor) object)
      (Object/is (get number-prototype :constructor) number)
      (Object/is (get array-prototype :constructor) array))))
    (finally
     (Reflect/deleteProperty object-prototype "eliscript-shared-realm-probe")
     (Reflect/deleteProperty number-prototype "eliscript-shared-realm-probe")
     (Reflect/deleteProperty array-prototype "eliscript-shared-realm-probe")))))
 (defun realm-clean ()
  (JSON/stringify (js-array
   (Object/hasOwn (get (realm-read 0) :prototype) "eliscript-shared-realm-probe")
   (Object/hasOwn (get (realm-read 1) :prototype) "eliscript-shared-realm-probe")
   (Object/hasOwn (get (realm-read 2) :prototype) "eliscript-shared-realm-probe"))))
 (defun realm-first-error () (realm-read 0) (throw false) (realm-read 1))`;

function* walk(body) {
  const pending = [body];
  while (pending.length) {
    const node = pending.pop();yield node;
    for (let i = node.children.length - 1; i >= 0; i--) pending.push(node.children[i]);
  }
}

export function assertSharedRealmOutlining(lowered) {
  const functions = lowered.typed.functions;
  const byIndex = new Map(functions.map(fn => [fn.index, fn]));
  const byName = new Map(functions.map(fn => [fn.name, fn]));
  const registration = functions.find(fn => fn.name === 'value-function-prototype-register');
  const symbolQuery = functions.find(fn => fn.name === 'value-function-symbol-initialization');
  const memberPublication = functions.find(fn => fn.name === 'value-function-initialize-members');
  assert(registration);assert(symbolQuery);assert(memberPublication);
  const names = new Set(['is', 'freeze', 'isFrozen', 'keys', 'hasOwn', 'assign', 'getOwnPropertySymbols',
    'getPrototypeOf', 'getOwnPropertyNames', 'getOwnPropertyDescriptor', 'defineProperty', 'defineProperties',
    'create', 'setPrototypeOf', 'preventExtensions', 'isExtensible', 'fromEntries', 'getOwnPropertyDescriptors', 'seal', 'isSealed']);
  const calls = new Map(), strings = new Map();
  for (const fn of functions) {
    const targets = new Set(), literals = new Set();
    for (const node of walk(fn.body)) {
      if (node.kind === 'call') targets.add(node.value);
      if (node.kind === 'memory-data-copy' && names.has(node.value)) literals.add(node.value);
    }
    calls.set(fn.index, targets);strings.set(fn.index, literals);
  }
  const owners = functions.filter(fn => calls.get(fn.index).has(registration.index));
  assert.equal(owners.length, 1, 'all Function.prototype publication belongs to one shared body, regardless of read count');
  const owner = owners[0];assert.equal(owner.arity, 4, 'shared initialization keeps the existing realm callback ABI');
  assert(calls.get(owner.index).has(symbolQuery.index),
    'the real deferred Symbol handshake identifies the shared body independently of its generated name');

  const table = new Set(lowered.typed.table);
  assert(table.has(owner.index), 'the shared entry uses the actual managed callable table');
  assert(!table.has(registration.index), 'runtime declarations are not private managed initializer entries');
  const publicEntries = new Set(), exported = new Map();
  for (const descriptor of lowered.descriptor.functions) {
    const alias = lowered.typed.aliases.find(entry => entry.name === (descriptor.wireName ?? descriptor.name));
    assert(alias, 'every public source binding has a real typed export alias');
    const fn = byName.get(alias.function);assert(fn);
    publicEntries.add(fn.index);exported.set(descriptor.name, fn.index);
  }
  const privateEntries = new Set([...table].filter(index => !publicEntries.has(index)));
  assert(privateEntries.has(owner.index));

  // Only real direct calls to private table entries may extend this scope.
  // Runtime declarations and ordinary exported readers cannot supply missing
  // names. A child calling back into the common entry is a prerequisite, not
  // evidence that the child itself owns the complete Object assembly.
  function closure(start, excluded = new Set()) {
    const found = new Set(), pending = [start];
    while (pending.length) {
      const index = pending.pop();
      if (found.has(index) || excluded.has(index)) continue;
      assert(byIndex.has(index));found.add(index);
      for (const target of calls.get(index)) if (privateEntries.has(target) && !excluded.has(target)) pending.push(target);
    }
    return found;
  }
  const shared = closure(owner.index);
  assert([...shared].every(index => !publicEntries.has(index)));
  function assembly(scope) {
    const emitted = new Set();let publishes = false;
    for (const index of scope) {
      for (const name of strings.get(index)) emitted.add(name);
      if (calls.get(index).has(memberPublication.index)) publishes = true;
    }
    return publishes && emitted.size === names.size;
  }
  assert(assembly(shared), 'the actual shared call closure must assemble and publish all twenty Object members');
  const scopes = new Map([...shared].map(index => [index,
    closure(index, index === owner.index ? new Set() : new Set([owner.index]))]));
  const candidates = [...scopes].filter(([, scope]) => assembly(scope)).map(([index]) => index);
  const locations = candidates.filter(index => !candidates.some(other => other !== index && scopes.get(index).has(other)));
  assert.equal(locations.length, 1, 'Object member assembly has one private location even when its work is outlined further');
  const directLocations = [...shared].filter(index => assembly(new Set([index])));
  assert(directLocations.length <= 1, 'the complete Object assembly cannot also remain copied in a parent helper');
  if (directLocations.length) assert.equal(directLocations[0], locations[0],
    'an outlined child cannot coexist with a second complete inline Object assembly');
  for (const fn of functions) if (!shared.has(fn.index)) {
    assert(!assembly(closure(fn.index, shared)),
      'an ordinary read point or unrelated private helper must not duplicate the complete Object assembly');
  }
  const reader = exported.get('realm-read');assert.notEqual(reader, undefined);
  assert(!shared.has(reader), 'the source reader cannot become part of private realm assembly');
  assert(closure(reader).has(owner.index), 'the real dynamic Object/Number/Array reader must reach the shared entry through actual calls');
  const sharedCallers = functions.filter(fn => fn.index !== owner.index && calls.get(fn.index).has(owner.index));
  assert(sharedCallers.length > 1, 'multiple genuine builtin read points must call the shared entry');
}

export function exerciseSharedRealm(a, reference) {
  const expected = reference.realm_shared_observation();
  assert.deepEqual(JSON.parse(expected), [true, true, true, true, true, true, true, 7, 9,
    true, true, true, true, true, true]);
  assert.equal(reference.realm_clean(), '[false,false,false]');
  let oracleThrew = false;
  try {reference.realm_first_error();} catch (error) {oracleThrew = true;assert.strictEqual(error, false);}
  assert(oracleThrew);
  const callerDepth = a.stats().frameDepth;
  const keep = a.number(-0), frame = a.frame(1), held = [];
  a.frameSet(frame, 0, keep);
  function report(name) {
    const result = a.invoke(name);
    try {return a.readString(result);} finally {a.release(result);}
  }
  try {
    for (let round = 0; round < 3; round++) {
      for (let kind = 0; kind < 3; kind++) {
        const input = a.number(kind);let current;
        try {current = a.invoke('realm-read', [input]);} finally {a.release(input);}
        if (!round) held.push(current);
        else {try {assert(a.keyEqual(current, held[kind]));} finally {a.release(current);}}
      }
      assert.equal(report('realm-shared-observation'), expected);
      assert.equal(report('realm-clean'), '[false,false,false]');
      let didThrow = false;
      try {a.invoke('realm-first-error');} catch (error) {didThrow = true;assert.strictEqual(error, false);}
      assert(didThrow, 'later native initialization cannot replace the first source throw');
      a.collect();a.initializeModule();
      assert.equal(report('realm-shared-observation'), expected, 'a later request recovers with the same realm');
      assert.equal(report('realm-clean'), '[false,false,false]');
      assert.equal(a.stats().frameDepth, callerDepth + 1);assert(Object.is(a.readNumber(keep), -0));
      const retained = a.frameGet(frame, 0);
      try {assert(Object.is(a.readNumber(retained), -0));} finally {a.release(retained);}
    }
  } finally {
    for (const value of held) a.release(value);
    a.leaveFrame(frame);a.release(keep);
  }
}
