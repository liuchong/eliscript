import {execFile, fork, spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// Complete compiler builds lower more than a million runtime IR nodes and
// exceed the ordinary 4 GiB allowance before emission. Use the bounded build
// allowance for this test runner; runtime commands retain their outer guard.
// One ceiling bounds both a tree and the entire batch; overrides only lower it.
export const TREE_RSS_LIMIT = 8 * 1024 ** 3;
export const TOTAL_RSS_LIMIT = TREE_RSS_LIMIT;
export const SAMPLE_MS = 75;
const GRACE_MS = 150;
const PS_TIMEOUT_MS = 500;
const SELF = fileURLToPath(import.meta.url);
// A guard is a file entry point even when its caller is an eval/module/test
// process. Inheriting --input-type, --eval or loaders can prevent the guard
// from starting at all. Its own small heap limit does not change command args.
const GUARD_EXEC_ARGV = ['--max-old-space-size=64'];

function lowerLimit(value, ceiling, name) {
  const limit = value === undefined ? ceiling : Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > ceiling)
    throw new RangeError(`${name} must be a positive integer no greater than ${ceiling}`);
  return limit;
}

export function resourceLimits(options = {}) {
  return {
    treeBytes: lowerLimit(options.treeBytes, TREE_RSS_LIMIT, 'tree RSS limit'),
    totalBytes: lowerLimit(options.totalBytes, TOTAL_RSS_LIMIT, 'total RSS limit'),
  };
}

// Birth time is part of every retained identity: a recycled PID is never an
// ownership claim. The private launcher token additionally authenticates roots.
export function parseProcessSnapshot(text) {
  const rows = new Map();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\S+\s+\S+\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(.+)$/.exec(line);
    if (!match) throw new Error('resource monitor received an invalid ps row');
    const [, pid, ppid, pgid, rss, birth, command] = match;
    const row = {pid: Number(pid), ppid: Number(ppid), pgid: Number(pgid),
      rssBytes: Number(rss) * 1024, birth: birth.replace(/\s+/g, ' '), command};
    if (![row.pid, row.ppid, row.pgid, row.rssBytes].every(Number.isSafeInteger) ||
        row.pid < 1 || row.ppid < 0 || row.pgid < 0 || row.rssBytes < 0 || rows.has(row.pid))
      throw new Error('resource monitor received invalid process data');
    rows.set(row.pid, row);
  }
  if (!rows.size) throw new Error('resource monitor received an empty process snapshot');
  return rows;
}

export function collectOwnedProcesses(snapshot, root, known = new Map()) {
  const owned = new Map(), currentRoot = snapshot.get(root.pid);
  const rootMatches = currentRoot && currentRoot.command.split(/\s+/).includes(root.token) &&
    (!root.birth || currentRoot.birth === root.birth) && currentRoot.pgid === root.pid;
  if (rootMatches) {
    root.birth ??= currentRoot.birth;
    owned.set(root.pid, currentRoot);
  }
  for (const [pid, birth] of known) {
    const row = snapshot.get(pid);
    if (row?.birth === birth) owned.set(pid, row);
  }
  // The launcher's session/process group is private. A new group with the
  // same number after the launcher has disappeared is not claimed.
  if (rootMatches) for (const row of snapshot.values()) {
    if (row.pgid === root.pid) owned.set(row.pid, row);
  }
  let changed;
  do {
    changed = false;
    for (const row of snapshot.values()) if (!owned.has(row.pid) && owned.has(row.ppid)) {
      owned.set(row.pid, row);changed = true;
    }
  } while (changed);
  for (const row of owned.values()) known.set(row.pid, row.birth);
  return owned;
}

export function evaluateResourceUsage(snapshot, roots, limits) {
  let totalBytes = 0;
  const counted = new Set(), trees = [];
  for (const root of roots) {
    const owned = collectOwnedProcesses(snapshot, root, root.known);
    let rssBytes = 0;
    for (const row of owned.values()) {
      rssBytes += row.rssBytes;
      if (!counted.has(row.pid)) {totalBytes += row.rssBytes;counted.add(row.pid);}
    }
    trees.push({id: root.id, file: root.file, rssBytes});
  }
  const exceeded = trees.find(tree => tree.rssBytes > limits.treeBytes);
  return {trees, totalBytes, violation: exceeded
    ? {kind: 'tree', ...exceeded, limitBytes: limits.treeBytes}
    : totalBytes > limits.totalBytes ? {kind: 'aggregate', rssBytes: totalBytes, limitBytes: limits.totalBytes} : null};
}

function snapshot() {
  return new Promise((resolve, reject) => {
    execFile('ps', ['-axo', 'pid=,ppid=,pgid=,rss=,lstart=,args='],
      {encoding: 'utf8', timeout: PS_TIMEOUT_MS, maxBuffer: 16 * 1024 ** 2}, (error, stdout) => {
        if (error) {reject(new Error(`resource monitor unavailable: ${error.message}`));return;}
        try {
          const rows = parseProcessSnapshot(stdout);
          if (!rows.has(process.pid)) throw new Error('resource monitor cannot see its own process');
          resolve(rows);
        } catch (failure) {reject(failure);}
      });
  });
}

function send(target, message) {
  if (!target.connected) return false;
  try {target.send(message, () => {});return true;} catch {return false;}
}

function sendConfirmed(target, message) {
  return new Promise(resolve => {
    if (!target.connected) {resolve(false);return;}
    try {target.send(message, error => resolve(!error));} catch {resolve(false);}
  });
}

function signalPid(pid, signal) {
  try {process.kill(pid, signal);} catch (error) {if (error.code !== 'ESRCH') throw error;}
}

async function signalOwned(root, signal, fallbackGroup = false, includeRoot = true) {
  let rows;
  try {rows = await snapshot();} catch (error) {
    // A live launcher can always kill its own private group even when ps is
    // unavailable. Other processes must never signal an unverified stale PID.
    if (fallbackGroup && root.pid === process.pid) signalPid(-process.pid, signal);
    throw error;
  }
  const owned = collectOwnedProcesses(rows, root, root.known);
  const currentRoot = owned.get(root.pid);
  for (const row of owned.values()) if (row.pid !== root.pid) signalPid(row.pid, signal);
  if (includeRoot && currentRoot && currentRoot.pgid === root.pid) signalPid(-root.pid, signal);
}

function startSampling(sample, fail) {
  let busy = false, stopped = false;
  const timer = setInterval(async () => {
    if (busy || stopped) return;
    busy = true;
    try {await sample();} catch (error) {fail(error);} finally {busy = false;}
  }, SAMPLE_MS);
  return () => {stopped = true;clearInterval(timer);};
}

// One independent Node launcher per file stays outside the synchronously
// blocking Bun process. Losing the central guard's IPC triggers group cleanup.
async function launcherMain(token) {
  const root = {pid: process.pid, token, known: new Map()};
  let child, childExited = false, stopping = false, stopSampling = () => {}, outcome, lastHeartbeat = Date.now();
  const killAndReap = async () => {
    try {await signalOwned(root, 'SIGKILL', true, false);} catch {signalPid(-process.pid, 'SIGKILL');}
    if (child && !childExited) await new Promise(resolve => {
      const timeout = setTimeout(resolve, GRACE_MS);
      child.once('exit', () => {clearTimeout(timeout);resolve();});
    });
    signalPid(-process.pid, 'SIGKILL');
  };
  const finish = async (reason, signal = 'SIGKILL') => {
    if (stopping) return;
    stopping = true;stopSampling();outcome ??= reason;
    clearInterval(heartbeat);
    await sendConfirmed(process, {...outcome, type: 'outcome'});
    if (signal !== 'SIGKILL') {
      try {await signalOwned(root, signal, false, false);} catch {}
      setTimeout(() => {void killAndReap();}, GRACE_MS);
    } else {
      await killAndReap();
    }
  };
  process.on('disconnect', () => {void finish({failure: 'guard-disconnected', exitCode: 1});});
  process.on('SIGINT', () => {void finish({failure: 'cancelled', exitCode: 130}, 'SIGINT');});
  process.on('SIGTERM', () => {void finish({failure: 'cancelled', exitCode: 143}, 'SIGTERM');});
  process.on('message', message => {
    if (message?.type === 'heartbeat') {lastHeartbeat = Date.now();return;}
    if (message?.type === 'cancel') {void finish(message.outcome, message.signal ?? 'SIGKILL');return;}
    if (message?.type !== 'start' || child || stopping) return;
    const limits = resourceLimits(message.limits);
    root.id = message.id;root.file = message.file;
    try {
      child = spawn(message.command, message.args, {cwd: message.cwd, env: message.env,
        stdio: ['ignore', 'inherit', 'inherit']});
      child.once('error', error => {void finish({failure: 'spawn-error', message: error.message, exitCode: 1});});
      child.once('exit', (code, signal) => {
        childExited = true;
        // Descendants (including detached browser processes) are reaped even
        // after the test's main process exits successfully.
        void finish({exitCode: code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1), signal});
      });
      stopSampling = startSampling(async () => {
        const rows = await snapshot();
        const usage = evaluateResourceUsage(rows, [root], limits);
        if (usage.violation) await finish({failure: 'resource-limit', exitCode: 1, resource: usage.violation});
      }, error => {void finish({failure: 'monitor-unavailable', exitCode: 1, message: error.message});});
      send(process, {type: 'running', pid: child.pid});
    } catch (error) {void finish({failure: 'spawn-error', exitCode: 1, message: error.message});}
  });
  const heartbeat = setInterval(() => {
    if (Date.now() - lastHeartbeat > 1000)
      void finish({failure: 'monitor-unavailable', exitCode: 1, message: 'central resource guard stopped responding'});
  }, SAMPLE_MS);
  await snapshot();
  send(process, {type: 'launcher-ready', pid: process.pid, token});
}

async function supervisorMain() {
  const active = new Map();
  let limits, stopped = false, stopSampling = () => {};
  async function stopAll(outcome, signal = 'SIGKILL') {
    if (stopped) return;
    stopped = true;stopSampling();send(process, {...outcome, type: 'fatal'});
    for (const entry of active.values()) {
      entry.outcome ??= outcome;
      send(entry.guard, {type: 'cancel', outcome, signal});
    }
    // Guard loss does not depend on a responsive test: its launcher also owns
    // an independent IPC disconnect handler and private process group.
    setTimeout(async () => {
      for (const entry of active.values()) {
        try {await signalOwned(entry.root, 'SIGKILL');} catch {}
        if (entry.guard.connected) entry.guard.disconnect();
      }
      if (!active.size) process.exit(outcome.exitCode || 1);
    }, signal === 'SIGKILL' ? SAMPLE_MS : GRACE_MS + SAMPLE_MS);
  }
  process.on('disconnect', () => {void stopAll({failure: 'runner-disconnected', exitCode: 1});});
  process.on('SIGINT', () => {void stopAll({failure: 'cancelled', exitCode: 130}, 'SIGINT');});
  process.on('SIGTERM', () => {void stopAll({failure: 'cancelled', exitCode: 143}, 'SIGTERM');});
  process.on('message', message => {
    if (message?.type === 'init' && !limits) {
      try {limits = resourceLimits(message.limits);} catch (error) {void stopAll({failure: 'invalid-resource-limit', message: error.message, exitCode: 1});return;}
      snapshot().then(() => {
        if (stopped) return;
        stopSampling = startSampling(async () => {
          const rows = await snapshot();
          const usage = evaluateResourceUsage(rows, [...active.values()].filter(entry => entry.running).map(entry => entry.root), limits);
          if (usage.violation) await stopAll({failure: 'resource-limit', exitCode: 1, resource: usage.violation});
          else {
            for (const entry of active.values()) send(entry.guard, {type: 'heartbeat'});
            send(process, {type: 'health'});
          }
        }, error => {void stopAll({failure: 'monitor-unavailable', message: error.message, exitCode: 1});});
        send(process, {type: 'ready'});
      }, error => {void stopAll({failure: 'monitor-unavailable', message: error.message, exitCode: 1});});
    } else if (message?.type === 'run' && limits && !stopped) {
      const token = randomUUID();
      const guard = fork(SELF, ['--launcher', token], {detached: true, execPath: process.execPath,
        execArgv: GUARD_EXEC_ARGV,
        stdio: ['ignore', 'inherit', 'inherit', 'ipc']});
      const entry = {guard, request: message, root: {id: message.id, file: message.file, pid: guard.pid, token, known: new Map()}};
      active.set(message.id, entry);
      guard.on('message', data => {
        if (data?.type === 'launcher-ready') {
          // The runner records the authenticated group before it can contain
          // a test process. No spawn-before-registration orphan window.
          send(process, {type: 'owned', id: message.id, pid: guard.pid, token});
        } else if (data?.type === 'running') {
          entry.running = true;
          send(process, {type: 'started', id: message.id, pid: data.pid});
        } else if (data?.type === 'outcome') {
          const {type: _type, ...outcome} = data;entry.outcome = outcome;
          if (data.failure === 'resource-limit' || data.failure === 'monitor-unavailable') void stopAll(outcome);
        }
      });
      guard.once('error', error => {
        entry.outcome = {failure: 'guard-start-failed', message: error.message, exitCode: 1};
        void stopAll(entry.outcome);
      });
      guard.once('exit', async () => {
        try {await signalOwned(entry.root, 'SIGKILL');} catch {}
        active.delete(message.id);
        const outcome = entry.outcome ?? {failure: 'guard-exited', exitCode: 1};
        if (!entry.outcome) await stopAll(outcome);
        await sendConfirmed(process, {...outcome, type: 'result', id: message.id});
        if (stopped && !active.size) process.exit(1);
      });
    } else if (message?.type === 'ack' && !stopped) {
      const entry = active.get(message.id);
      if (entry) send(entry.guard, {...entry.request, type: 'start', limits});
    } else if (message?.type === 'cancel') {
      void stopAll(message.outcome, message.signal);
    } else if (message?.type === 'close') {
      if (active.size) void stopAll({failure: 'guard-closed-with-active-tests', exitCode: 1});
      else {stopSampling();process.exit(0);}
    }
  });
}

export async function startResourceSupervisor(options = {}) {
  const limits = resourceLimits(options.limits ?? {
    treeBytes: process.env.ELISCRIPT_TEST_TREE_RSS_BYTES,
    totalBytes: process.env.ELISCRIPT_TEST_TOTAL_RSS_BYTES,
  });
  const guard = fork(SELF, ['--supervisor'], {execPath: options.node ?? 'node',
    execArgv: GUARD_EXEC_ARGV,
    stdio: ['ignore', 'inherit', 'inherit', 'ipc']});
  const pending = new Map(), owned = new Map();
  let failure = null, closing = false, readyResolve, readyReject, exitedResolve, lastHealth = Date.now();
  const ready = new Promise((resolve, reject) => {readyResolve = resolve;readyReject = reject;});
  const exited = new Promise(resolve => {exitedResolve = resolve;});
  const fail = outcome => {
    failure ??= outcome;
    readyReject(new Error(outcome.message ?? outcome.failure));
    options.onFailure?.(failure);
  };
  guard.on('message', message => {
    lastHealth = Date.now();
    if (message?.type === 'ready') readyResolve();
    else if (message?.type === 'owned') {
      owned.set(message.id, {pid: message.pid, token: message.token, known: new Map()});
      send(guard, {type: 'ack', id: message.id});
    } else if (message?.type === 'started') {
      options.onStart?.(message);
    } else if (message?.type === 'fatal') fail(message);
    else if (message?.type === 'result') {
      const resolve = pending.get(message.id);pending.delete(message.id);owned.delete(message.id);
      resolve?.(message);
    }
  });
  guard.once('error', error => {
    clearInterval(healthTimer);
    fail({failure: 'guard-start-failed', exitCode: 1, message: error.message});exitedResolve();
  });
  guard.once('exit', async (code, signal) => {
    clearInterval(healthTimer);
    if (!closing || pending.size || code !== 0) fail({failure: 'guard-exited', exitCode: 1, code, signal});
    for (const root of owned.values()) {try {await signalOwned(root, 'SIGKILL');} catch {}}
    // Independent launchers also fail closed on IPC loss; give their bounded
    // kill handlers time to complete before reporting a finished test runner.
    if (owned.size) await new Promise(resolve => setTimeout(resolve, GRACE_MS + PS_TIMEOUT_MS));
    for (const resolve of pending.values()) resolve(failure ?? {failure: 'guard-exited', exitCode: 1});
    pending.clear();exitedResolve();
  });
  const healthTimer = setInterval(() => {
    if (Date.now() - lastHealth > 1500) {
      fail({failure: 'monitor-unavailable', exitCode: 1, message: 'external resource guard stopped responding'});
      guard.kill('SIGKILL');
    }
  }, SAMPLE_MS);
  send(guard, {type: 'init', limits});
  await ready;
  return {
    get failure() {return failure;},
    run(request) {
      if (failure || closing) return Promise.resolve(failure ?? {failure: 'guard-closed', exitCode: 1});
      if (pending.has(request.id)) throw new Error('duplicate supervised test id');
      return new Promise(resolve => {
        pending.set(request.id, resolve);
        if (!send(guard, {type: 'run', ...request})) {
          pending.delete(request.id);fail({failure: 'guard-disconnected', exitCode: 1});resolve(failure);
        }
      });
    },
    cancel(signal = 'SIGTERM') {
      const outcome = {failure: 'cancelled', exitCode: signal === 'SIGINT' ? 130 : 143};
      failure ??= outcome;send(guard, {type: 'cancel', signal, outcome});
    },
    async close() {closing = true;send(guard, {type: 'close'});await exited;},
    pid: guard.pid,
  };
}

if (process.argv[1] === SELF) {
  const operation = process.argv[2];
  try {
    if (operation === '--supervisor') await supervisorMain();
    else if (operation === '--launcher' && process.argv[3]) await launcherMain(process.argv[3]);
    else throw new Error('resource supervisor requires its private IPC entry point');
  } catch (error) {
    await sendConfirmed(process, {type: 'fatal', failure: 'monitor-unavailable', exitCode: 1, message: error.message});
    console.error(`[resource-monitor] ${error.message}`);process.exit(1);
  }
}
