import {expect, test} from 'bun:test';
import {execFileSync, spawn} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {collectOwnedProcesses, evaluateResourceUsage, parseProcessSnapshot, resourceLimits,
  startResourceSupervisor, TREE_RSS_LIMIT, TOTAL_RSS_LIMIT, SAMPLE_MS} from '../tools/testing/resource-supervisor.mjs';
import {isExclusiveTestFile, scheduleTestFiles} from '../tools/testing/file-workers.mjs';
import {parseProtectedCommandArgs} from '../tools/testing/guarded-command.mjs';

const birth = 'Fri Oct 16 08:00:00 2026';
const row = (pid, ppid, pgid, rss, command, born = birth) => `${pid} ${ppid} ${pgid} ${rss} ${born} ${command}`;
const root = (pid, token, id = String(pid)) => ({pid, token, id, known: new Map()});
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

test('generic protected commands preserve arguments and cannot raise resource ceilings', () => {
  expect(parseProtectedCommandArgs(['--', 'bun', 'test', 'a.test.mjs', '--', '-1'], {}))
    .toEqual({command: 'bun', args: ['test', 'a.test.mjs', '--', '-1'],
      limits: {treeBytes: TREE_RSS_LIMIT, totalBytes: TOTAL_RSS_LIMIT}});
  expect(parseProtectedCommandArgs(['--tree-rss-bytes', '1024', '--total-rss-bytes', '2048', '--', 'make', 'test'], {}))
    .toEqual({command: 'make', args: ['test'], limits: {treeBytes: 1024, totalBytes: 2048}});
  for (const args of [[], ['bun', 'test'], ['--'], ['--unguarded', '--', 'node'],
    ['--tree-rss-bytes', '0', '--', 'node'], ['--tree-rss-bytes', String(TREE_RSS_LIMIT + 1), '--', 'node'],
    ['--tree-rss-bytes', '1', '--tree-rss-bytes', '2', '--', 'node']])
    expect(() => parseProtectedCommandArgs(args, {})).toThrow();
  expect(() => parseProtectedCommandArgs(['--tree-rss-bytes', '2048', '--', 'node'],
    {ELISCRIPT_TEST_TREE_RSS_BYTES: '1024'})).toThrow();
  expect(parseProtectedCommandArgs(['--', 'make', 'test'], {ELISCRIPT_TEST_TREE_RSS_BYTES: '1024'}).limits.treeBytes).toBe(1024);
});

async function waitFor(read, description) {
  const deadline = Date.now() + 4000;
  while (Date.now() < deadline) {
    try {const value = await read();if (value) return value;} catch {}
    await pause(25);
  }
  throw new Error(`timed out waiting for ${description}`);
}

function running(pid) {
  try {
    process.kill(pid, 0);
    // A kernel zombie has no executable process tree or RSS; do not confuse
    // an init awaiting reap with a still running test/browser descendant.
    return !execFileSync('ps', ['-p', String(pid), '-o', 'stat='], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim().startsWith('Z');
  } catch {return false;}
}

test('RSS protection defaults are fixed ceilings and overrides can only lower them', () => {
  expect(resourceLimits()).toEqual({treeBytes: 8 * 1024 ** 3, totalBytes: 8 * 1024 ** 3});
  expect(SAMPLE_MS).toBeGreaterThanOrEqual(50);expect(SAMPLE_MS).toBeLessThanOrEqual(100);
  expect(resourceLimits({treeBytes: 1024, totalBytes: 2048})).toEqual({treeBytes: 1024, totalBytes: 2048});
  for (const options of [{treeBytes: TREE_RSS_LIMIT + 1}, {totalBytes: TOTAL_RSS_LIMIT + 1},
    {treeBytes: 0}, {totalBytes: -1}, {treeBytes: 1.1}, {treeBytes: 'invalid'}])
    expect(() => resourceLimits(options)).toThrow();
});

test('process snapshots require complete valid data and retain birth identities', () => {
  expect(parseProcessSnapshot(row(100, 1, 100, 7, 'node guard token')).get(100))
    .toEqual({pid: 100, ppid: 1, pgid: 100, rssBytes: 7168, birth, command: 'node guard token'});
  for (const invalid of ['', '100 1 100 not-a-number', row(100, 1, 100, 1, 'node') + '\n' + row(100, 1, 100, 2, 'node')])
    expect(() => parseProcessSnapshot(invalid)).toThrow();
});

test('owned trees include detached descendants and retain them after reparenting without claiming recycled PIDs', () => {
  const owned = root(100, 'private-token');
  let rows = parseProcessSnapshot([
    row(100, 1, 100, 1, 'node guard private-token'), row(101, 100, 100, 2, 'bun test'),
    row(102, 101, 102, 3, 'browser'), row(900, 1, 900, 4, 'unrelated developer'),
  ].join('\n'));
  expect([...collectOwnedProcesses(rows, owned, owned.known).keys()].sort()).toEqual([100, 101, 102]);
  rows = parseProcessSnapshot([
    row(102, 1, 102, 3, 'browser'), row(100, 1, 100, 50, 'unrelated developer', 'Fri Oct 16 08:00:01 2026'),
    row(103, 100, 100, 50, 'unrelated child'), row(900, 1, 900, 4, 'unrelated developer'),
  ].join('\n'));
  expect([...collectOwnedProcesses(rows, owned, owned.known).keys()]).toEqual([102]);
  rows = parseProcessSnapshot(row(102, 1, 102, 100, 'recycled browser PID', 'Fri Oct 16 08:00:02 2026'));
  expect(collectOwnedProcesses(rows, owned, owned.known).size).toBe(0);
});

test('RSS boundaries preserve equality, enforce both budgets, and count each live PID once', () => {
  const roots = [root(100, 'one'), root(200, 'two')];
  const rows = parseProcessSnapshot([
    row(100, 1, 100, 0, 'node guard one'), row(101, 100, 100, 1, 'bun test'),
    row(200, 1, 200, 0, 'node guard two'), row(201, 200, 200, 1, 'bun test'),
  ].join('\n'));
  expect(evaluateResourceUsage(rows, roots, {treeBytes: 1024, totalBytes: 2048}).violation).toBeNull();
  expect(evaluateResourceUsage(rows, roots, {treeBytes: 1023, totalBytes: 2048}).violation)
    .toMatchObject({kind: 'tree', id: '100', rssBytes: 1024, limitBytes: 1023});
  expect(evaluateResourceUsage(rows, roots, {treeBytes: 1024, totalBytes: 2047}).violation)
    .toMatchObject({kind: 'aggregate', rssBytes: 2048, limitBytes: 2047});
  expect(evaluateResourceUsage(rows, [roots[0], roots[0]], {treeBytes: 1024, totalBytes: 1024}).totalBytes).toBe(1024);
});

test('resource failure stops queued dispatch and preserves completed original file outcomes', async () => {
  const files = ['a.test.mjs', 'b.test.mjs', 'c.test.mjs', 'tests/compiler-browser-session.test.mjs'];
  const starts = [], complete = new Map();
  const supervisor = {failure: null, cancel() {}, run(request) {
    starts.push(request.file);return new Promise(resolve => complete.set(request.file, resolve));
  }};
  const pending = scheduleTestFiles(files, supervisor);
  expect(starts).toEqual(files.slice(0, 2));
  supervisor.failure = {failure: 'resource-limit', exitCode: 1};
  complete.get(files[0])({exitCode: 1, failure: 'resource-limit', resource: {kind: 'tree', rssBytes: 2, limitBytes: 1}});
  complete.get(files[1])({exitCode: 1, failure: 'resource-limit'});
  const result = await pending;
  expect(result.exitCode).toBe(1);expect(starts).toEqual(files.slice(0, 2));
  expect(result.results.map(item => item.file)).toEqual(files.slice(0, 2));
  expect(result.results[0]).toMatchObject({failure: 'resource-limit', resource: {limitBytes: 1}});
  for (const file of ['compiler-package-session', 'compiler-session-tools', 'compiler-browser-session',
    'compiler-matrix-original-gates', 'browser-matrix', 'package-surface', 'wasm-memory-runtime',
    'native-memory-data-copy', 'seed-symbol-reservation', 'managed-stdlib-value-json'])
    expect(isExclusiveTestFile(`tests/${file}.test.mjs`)).toBe(true);
});

test('a one-byte test ceiling kills a real small process without allocating a large buffer', async () => {
  let pid, supervisor;
  try {
    supervisor = await startResourceSupervisor({limits: {treeBytes: 1}, onStart(message) {pid = message.pid;}});
    const result = await supervisor.run({id: 'small-limit', file: 'small-limit.test.mjs', command: 'node',
      args: ['--eval', 'while (true) {}'], cwd: process.cwd(), env: process.env});
    expect(pid).toBeGreaterThan(0);expect(result.exitCode).not.toBe(0);
    expect(result.failure).toBe('resource-limit');expect(result.resource.limitBytes).toBe(1);
    await waitFor(() => !running(pid), 'limited process to be reclaimed');
    expect(supervisor.failure.failure).toBe('resource-limit');
  } finally {await supervisor?.close();}
}, 10000);

test('cancellation and guard loss reclaim blocked test processes and their owned descendants', async () => {
  for (const action of ['SIGINT', 'SIGTERM', 'guard-killed']) {
    const directory = await mkdtemp(join(tmpdir(), 'eliscript-resource-guard-'));
    let supervisor, pids = [];
    try {
      const parentMarker = join(directory, 'parent'), childMarker = join(directory, 'child');
      const descendant = `require('node:fs').writeFileSync(${JSON.stringify(childMarker)},String(process.pid));process.on('SIGINT',()=>{});process.on('SIGTERM',()=>{});while(true){}`;
      const source = `require('node:child_process').spawn('node',['--eval',${JSON.stringify(descendant)}],{stdio:'ignore'});require('node:fs').writeFileSync(${JSON.stringify(parentMarker)},String(process.pid));process.on('SIGINT',()=>{});process.on('SIGTERM',()=>{});while(true){}`;
      supervisor = await startResourceSupervisor();
      const pending = supervisor.run({id: action, file: 'blocked.test.mjs', command: 'node',
        args: ['--eval', source], cwd: process.cwd(), env: process.env});
      pids = await waitFor(async () => Promise.all([parentMarker, childMarker].map(async file => Number(await readFile(file, 'utf8')))), 'both small blocked descendants');
      if (action === 'guard-killed') process.kill(supervisor.pid, 'SIGKILL');else supervisor.cancel(action);
      const result = await pending;
      expect(result.exitCode).not.toBe(0);
      await waitFor(() => pids.every(pid => !running(pid)), 'the entire owned tree to be reclaimed');
      if (action !== 'guard-killed') expect(result.exitCode).toBe(action === 'SIGINT' ? 130 : 143);
      expect(supervisor.failure).not.toBeNull();
    } finally {await supervisor?.close();await rm(directory, {recursive: true, force: true});}
  }
}, 20000);

test('abnormal runner exit disconnects independent guards and leaves no live test tree', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'eliscript-resource-parent-'));
  let driver, pid, driverExit, driverError, stderr = '';
  const diagnostics = () => `driver status=${JSON.stringify(driverExit ?? null)}; spawn error=${driverError?.message ?? 'none'}; stderr:\n${stderr || '(empty)'}`;
  try {
    const marker = join(directory, 'pid');
    const module = new URL('../tools/testing/resource-supervisor.mjs', import.meta.url).href;
    const child = `require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));while(true){}`;
    const source = `import{startResourceSupervisor}from ${JSON.stringify(module)};import{existsSync}from'node:fs';const s=await startResourceSupervisor();let outcome;s.run({id:'owned',file:'owned.test.mjs',command:'node',args:['--eval',${JSON.stringify(child)}],cwd:process.cwd(),env:process.env}).then(value=>{outcome=value});while(!existsSync(${JSON.stringify(marker)})){if(s.failure||outcome)throw new Error('owned command failed before startup: '+JSON.stringify(s.failure??outcome));await new Promise(r=>setTimeout(r,10));}process.kill(process.pid,'SIGKILL');`;
    // --input-type belongs only to this eval entry. Neither of its file-based
    // guards may inherit it; this is also a real nested-launch regression.
    driver = spawn('node', ['--input-type=module', '--eval', source], {stdio: ['ignore', 'ignore', 'pipe']});
    driver.stderr.setEncoding('utf8');
    driver.stderr.on('data', chunk => {stderr = (stderr + chunk).slice(-65536);});
    const ended = new Promise(resolve => {
      driver.once('exit', (code, signal) => {driverExit = {code, signal};resolve();});
      driver.once('error', error => {driverError = error;resolve();});
    });
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      try {pid = Number(await readFile(marker, 'utf8'));if (pid > 0) break;} catch {}
      if (driverExit || driverError) throw new Error('runner exited before owned child startup');
      await pause(25);
    }
    if (!(pid > 0)) throw new Error('timed out waiting for owned child startup');
    await ended;
    expect(driverExit).toEqual({code: null, signal: 'SIGKILL'});
    await waitFor(() => !running(pid), 'runner-disconnected test reclamation');
  } catch (error) {
    throw new Error(`${error.message}\n${diagnostics()}`, {cause: error});
  } finally {driver?.kill('SIGKILL');await rm(directory, {recursive: true, force: true});}
}, 10000);

test('missing external monitor runtime fails closed before starting any test', async () => {
  await expect(startResourceSupervisor({node: 'eliscript-test-node-does-not-exist'})).rejects.toThrow();
});
