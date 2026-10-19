import assert from 'node:assert/strict';

// Use the existing small managed capacity profile. Construct one 4096-unit
// string directly, without unrelated concatenation growth intermediates.
export const temporaryRootOptions = Object.freeze({maxSlots: 64, initialBytes: 4096, maxBytes: 16384, initializeModule: false});
export const temporaryRootSource = `
(defconst marker 0)
(defvar saved nil)
(defun make-large () (js-call "abcdefgh" :repeat 512))
(defun initializer-release ()
 (let* ((garbage (make-large)) (size (get garbage :length)))
  (setq garbage nil)
  (let ((survivor (make-large))) (+ size (get survivor :length)))))
(defun assignment-release ()
 (let ((garbage nil) (size 0))
  (setq garbage (make-large)) (setq size (get garbage :length)) (setq garbage nil)
  (let ((survivor (make-large))) (+ size (get survivor :length)))))
(defun both-live ()
 (let* ((first (make-large)) (second (make-large)))
  (+ (get first :length) (get second :length))))
(defun assignment-value () (let ((temporary nil)) (setq temporary (make-large))))
(defun assignment-survives ()
 (let ((temporary nil))
  (let* ((result (setq temporary (js-object :zero -0.0))) (stress (make-large)))
   (js-array result temporary (get stress :length)))))
(defun store-global () (setq saved (js-object :zero -0.0)))
(defun read-global () saved)
(defun capture-owner (value)
 (lambda ()
  (let* ((first value) (read (lambda () value)))
   (setq value (+ value 1)) (js-array first (funcall read) value))))
(defun named-temporary ()
 (let* ((temporary (js-object :zero 7)) (read (lambda () temporary))
        (outer (lambda () (lambda () (js-array temporary (funcall read))))))
  (setq temporary (js-object :zero -0.0)) (funcall outer)))
(defun invoke-callback (callback) (funcall callback))
(defun parallel-order ()
 (let ((temporary 7) (trace (js-array nil nil)))
  (let ((temporary (progn (put trace 0 1) 11))
        (outer (progn (put trace 1 temporary) temporary)))
   (js-array temporary outer (aref trace 0) (aref trace 1)))))
(defun assignment-first-error ()
 (let ((value 7))
  (try (setq value (throw false)) (catch error (js-array error value)))))
(defun initializer-first-error ()
 (let ((value 7))
  (try (let* ((first (progn (setq value 8) (throw false))) (second (throw "later"))) second)
   (catch error (js-array error value)))))
(export marker initializer-release assignment-release both-live assignment-value assignment-survives
 store-global read-global capture-owner named-temporary invoke-callback parallel-order assignment-first-error initializer-first-error)
`;

export function initializeTemporaryRootRuntime(a) {
  a.auto(1);
  assert.throws(() => a.getExport('marker'), error => error.eliscriptDiagnostic?.code === 'ELI-RT0008');
  assert.equal(a.stats().frameDepth, 0);a.initializeModule();
}
function primitive(a, value) {return value?.kind === 4 ? a.readNumber(value) : value;}
function values(a, array) {
  return Array.from({length: a.length(array)}, (_, index) => {
    const value = a.get(array, index);try {return primitive(a, value);} finally {a.release(value);}
  });
}
function numeric(a, name) {
  const result = a.invoke(name);try {return a.readNumber(result);} finally {a.release(result);}
}
export function exerciseTemporaryRootPressure(a, reference) {
  for (const name of ['initializer-release', 'assignment-release']) for (let index = 0; index < 3; index++) {
    assert.equal(numeric(a, name), reference[name.replaceAll('-', '_')]());
    a.collect();assert.equal(a.stats().frameDepth, 0);
  }
  assert.equal(reference.both_live(), 8192);
  assert.throws(() => a.invoke('both-live'), error => error.eliscriptDiagnostic?.code === 'ELI-RT0002');
  a.collect();assert.equal(a.stats().frameDepth, 0);
  assert.equal(numeric(a, 'initializer-release'), 8192);
  const text = a.invoke('assignment-value');
  try {
    assert.equal(a.readString(text), reference.assignment_value());
    a.collect();assert.equal(a.readString(text), 'abcdefgh'.repeat(512));
  } finally {a.release(text);}
  a.collect();assert.equal(numeric(a, 'assignment-release'), 8192);
}
function assertZeroProperty(a, object) {
  const key = a.string('zero');let zero;
  try {zero = a.objectGet(object, key);assert(Object.is(a.readNumber(zero), -0));}
  finally {a.release(zero);a.release(key);}
}
export function exerciseTemporaryRootValues(a, reference) {
  const assigned = a.invoke('assignment-survives');let first, alias, size;
  try {
    const expected = reference.assignment_survives();assert.strictEqual(expected[0], expected[1]);assert(Object.is(expected[0].zero, -0));
    first = a.get(assigned, 0);alias = a.get(assigned, 1);size = a.get(assigned, 2);
    assert(a.keyEqual(first, alias));assert.equal(a.readNumber(size), expected[2]);a.collect();assertZeroProperty(a, first);
  } finally {for (const value of [first, alias, size, assigned]) a.release(value);}
  const stored = a.invoke('store-global');let again;
  try {a.collect();again = a.invoke('read-global');assert(a.keyEqual(stored, again));assertZeroProperty(a, again);}
  finally {a.release(again);a.release(stored);}
  const input = a.number(-0), closure = a.invoke('capture-owner', [input]), expected = reference.capture_owner(-0);
  a.release(input);
  try {
    for (let index = 0; index < 3; index++) {
      a.collect();const result = a.invoke('invoke-callback', [closure]);
      try {assert.deepEqual(values(a, result), expected());} finally {a.release(result);}
    }
  } finally {a.release(closure);}
  const nested = a.invoke('named-temporary');
  try {
    const js = reference.named_temporary(), expectedPair = js();assert.strictEqual(expectedPair[0], expectedPair[1]);
    a.collect();const pair = a.invoke('invoke-callback', [nested]);let left, right;
    try {left = a.get(pair, 0);right = a.get(pair, 1);assert(a.keyEqual(left, right));a.collect();assertZeroProperty(a, left);}
    finally {for (const value of [left, right, pair]) a.release(value);}
  } finally {a.release(nested);}
  for (const name of ['parallel-order', 'assignment-first-error', 'initializer-first-error']) {
    const result = a.invoke(name);
    try {assert.deepEqual(values(a, result), reference[name.replaceAll('-', '_')]());} finally {a.release(result);}
    a.collect();assert.equal(a.stats().frameDepth, 0);
  }
  assert.equal(numeric(a, 'initializer-release'), 8192);
}
export function closeTemporaryRootRuntime(a) {
  try {a.closeModule();a.collect();assert.equal(a.live(), 0);assert.equal(a.stats().frameDepth, 0);}
  finally {a.close?.();}
}
