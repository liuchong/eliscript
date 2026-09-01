import { createHash } from "node:crypto";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export const watchEventFormat = "eliscript-watch-event";
export const watchEventVersion = 1;
export const defaultWatchInterval = 250;
export const minimumWatchInterval = 25;
export const maximumWatchInterval = 60_000;

function freeze(value) {
  return Object.freeze(value);
}

function watchError(message, filename = undefined) {
  const error = new Error(message);
  error.eliscriptDiagnostic = {
    format: "eliscript-diagnostic",
    version: 1,
    code: "ELI-W0001",
    severity: "error",
    phase: "project-watch",
    message,
    ...(filename ? { location: { file: filename } } : {}),
  };
  return error;
}

function containedPath(file, root) {
  const fromRoot = relative(root, file);
  return fromRoot === "" ||
    (fromRoot !== ".." && !fromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(fromRoot));
}

function digestBytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function snapshotDigest(files) {
  const hash = createHash("sha256");
  for (const [file, digest] of [...files].sort(([left], [right]) =>
    left.localeCompare(right))) {
    hash.update(file);
    hash.update("\0");
    hash.update(digest);
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function canonicalDirectory(directory) {
  const expanded = resolve(directory);
  try {
    if (!(await stat(expanded)).isDirectory()) {
      throw watchError("watch root is not a directory", expanded);
    }
    return await realpath(expanded);
  } catch (error) {
    if (error?.eliscriptDiagnostic) throw error;
    throw watchError("watch root does not exist", expanded);
  }
}

async function canonicalConfiguration(filename) {
  if (filename === null || filename === undefined) return null;
  const expanded = resolve(filename);
  try {
    if (!(await stat(expanded)).isFile()) {
      throw watchError("watch configuration is not a file", expanded);
    }
    return await realpath(expanded);
  } catch (error) {
    if (error?.eliscriptDiagnostic) throw error;
    throw watchError("watch configuration does not exist", expanded);
  }
}

function watchInterval(value) {
  const interval = value ?? defaultWatchInterval;
  if (!Number.isSafeInteger(interval) || interval < minimumWatchInterval ||
      interval > maximumWatchInterval) {
    throw watchError(
      `watch interval must be an integer between ${minimumWatchInterval} and ` +
        `${maximumWatchInterval} milliseconds`,
    );
  }
  return interval;
}

async function readDigest(filename) {
  try {
    return digestBytes(await readFile(filename));
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return null;
    throw error;
  }
}

async function collectSources(directory, files) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT" || error?.code === "ENOTDIR") return;
    throw error;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) {
      await collectSources(filename, files);
    } else if (entry.isFile() && entry.name.endsWith(".eli")) {
      const digest = await readDigest(filename);
      if (digest !== null) files.set(filename, digest);
    }
  }
}

async function projectSnapshot(root, configuration) {
  const files = new Map();
  await collectSources(root, files);
  if (configuration !== null && !files.has(configuration)) {
    const digest = await readDigest(configuration);
    if (digest !== null) files.set(configuration, digest);
  }
  return freeze({ files, digest: snapshotDigest(files) });
}

function changesBetween(previous, current, root) {
  const files = new Set([...previous.files.keys(), ...current.files.keys()]);
  return [...files].sort().flatMap((file) => {
    const before = previous.files.get(file);
    const after = current.files.get(file);
    if (before === after) return [];
    const kind = before === undefined
      ? "create"
      : after === undefined ? "delete" : "modify";
    return [freeze({
      file,
      ...(containedPath(file, root) ? { path: relative(root, file) } : {}),
      kind,
    })];
  });
}

function eventRecord(sequence, event, root, fields = {}) {
  return freeze({
    format: watchEventFormat,
    version: watchEventVersion,
    sequence,
    event,
    root,
    ...fields,
  });
}

export class ProjectWatcher {
  static async create(options = {}) {
    if (!options || typeof options !== "object") {
      throw watchError("watch options must be an object");
    }
    if (typeof options.root !== "string" || options.root.length === 0) {
      throw watchError("watch root must be a non-empty string");
    }
    const root = await canonicalDirectory(options.root);
    const configuration = await canonicalConfiguration(options.configuration);
    const interval = watchInterval(options.interval);
    const snapshot = await projectSnapshot(root, configuration);
    return new ProjectWatcher(root, configuration, interval, snapshot);
  }

  constructor(root, configuration, interval, snapshot) {
    this.root = root;
    this.configuration = configuration;
    this.interval = interval;
    this.snapshot = snapshot;
    this.sequence = 0;
    this.timer = null;
    this.scanning = false;
    this.scanPromise = null;
    this.closed = false;
  }

  ready() {
    return eventRecord(0, "ready", this.root, {
      changes: freeze([]),
      digest: this.snapshot.digest,
    });
  }

  async scan() {
    if (this.closed) throw watchError("watch session is closed", this.root);
    const next = await projectSnapshot(this.root, this.configuration);
    const changes = changesBetween(this.snapshot, next, this.root);
    this.snapshot = next;
    if (changes.length === 0) return null;
    this.sequence += 1;
    return eventRecord(this.sequence, "change", this.root, {
      changes: freeze(changes),
      digest: next.digest,
    });
  }

  error(error) {
    this.sequence += 1;
    const diagnostic = error?.eliscriptDiagnostic ?? {
      format: "eliscript-diagnostic",
      version: 1,
      code: "ELI-W0002",
      severity: "error",
      phase: "project-watch",
      message: error instanceof Error ? error.message : String(error),
      location: { file: this.root },
    };
    return eventRecord(this.sequence, "error", this.root, {
      diagnostic: freeze(diagnostic),
    });
  }

  start(onEvent) {
    if (typeof onEvent !== "function") {
      throw watchError("watch event handler must be a function");
    }
    if (this.closed) throw watchError("watch session is closed", this.root);
    if (this.timer !== null) return this;
    this.timer = setInterval(async () => {
      if (this.scanning || this.closed) return;
      this.scanning = true;
      this.scanPromise = this.scan();
      try {
        const event = await this.scanPromise;
        if (!this.closed && event !== null) onEvent(event);
      } catch (error) {
        if (!this.closed) onEvent(this.error(error));
      } finally {
        this.scanning = false;
        this.scanPromise = null;
      }
    }, this.interval);
    onEvent(this.ready());
    return this;
  }

  async close() {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.closed = true;
    if (this.scanPromise !== null) {
      try {
        await this.scanPromise;
      } catch {
        // A closing watcher suppresses the final recoverable scan failure.
      }
    }
  }
}

export async function snapshotProject(options) {
  const watcher = await ProjectWatcher.create(options);
  try {
    return watcher.ready();
  } finally {
    await watcher.close();
  }
}
