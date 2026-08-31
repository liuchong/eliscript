import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { keyword } from "../runtime/core/identifier.mjs";
import { persistentList } from "../runtime/core/list.mjs";
import { persistentHashMap } from "../runtime/core/map.mjs";
import { persistentVector } from "../runtime/core/vector.mjs";
import { equalValues } from "../runtime/core/value.mjs";
import {
  decodeWorkerValue,
  encodeWorkerValue,
  workerValueEncoding,
} from "../runtime/worker-value-codec.mjs";
import {
  WorkerValueStreamDecoder,
  encodeWorkerValueChunks,
  workerValueFraming,
} from "../runtime/worker-value-stream.mjs";

const projectDirectory = resolve(import.meta.dir, "..");
const compilerPath = resolve(projectDirectory, "bin/eliscript");
const workerPath = resolve(projectDirectory, "runtime/worker.mjs");
const fixturePath = resolve(projectDirectory, "tests/fixtures/worker.eli");
const emacs = process.env.EMACS ?? "emacs";

async function runSuccessful(command, options = {}) {
  const child = Bun.spawn(command, {
    cwd: projectDirectory,
    stdout: "pipe",
    stderr: "pipe",
    ...options,
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() ||
      `${command[0]} exited with ${exitCode}`);
  }
  return stdout;
}

function createWorkerClient() {
  const child = Bun.spawn([process.execPath, workerPath], {
    cwd: projectDirectory,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const messages = [];
  const waiters = [];
  const decoder = new TextDecoder();
  let buffer = "";
  let closed = false;

  function deliver(message) {
    const index = waiters.findIndex((waiter) => waiter.predicate(message));
    if (index === -1) {
      messages.push(message);
      return;
    }
    const [waiter] = waiters.splice(index, 1);
    clearTimeout(waiter.timer);
    waiter.resolve(message);
  }

  const outputTask = (async () => {
    for await (const chunk of child.stdout) {
      buffer += decoder.decode(chunk, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (line.length > 0) deliver(JSON.parse(line));
      }
    }
    buffer += decoder.decode();
    closed = true;
    for (const waiter of waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error("worker output closed"));
    }
  })();
  const stderrTask = new Response(child.stderr).text();

  function send(message) {
    child.stdin.write(`${JSON.stringify(message)}\n`);
    child.stdin.flush();
  }

  function sendRaw(line) {
    child.stdin.write(`${line}\n`);
    child.stdin.flush();
  }

  function next(predicate, timeoutMs = 5_000) {
    const index = messages.findIndex(predicate);
    if (index !== -1) return Promise.resolve(messages.splice(index, 1)[0]);
    if (closed) return Promise.reject(new Error("worker output closed"));
    return new Promise((resolve_, reject) => {
      const waiter = {
        predicate,
        resolve: resolve_,
        reject,
        timer: undefined,
      };
      waiter.timer = setTimeout(() => {
        const waiterIndex = waiters.indexOf(waiter);
        if (waiterIndex !== -1) waiters.splice(waiterIndex, 1);
        reject(new Error("timed out waiting for worker message"));
      }, timeoutMs);
      waiters.push(waiter);
    });
  }

  async function close() {
    if (!closed) {
      send({ version: 1, type: "shutdown" });
      await next((message) => message.type === "shutdown");
      child.stdin.end();
    }
    const exitCode = await child.exited;
    await outputTask;
    return { exitCode, stderr: await stderrTask };
  }

  return { child, send, sendRaw, next, close };
}

function scoreValues(values, rounds) {
  let total = 0;
  for (let round = 0; round < rounds; round += 1) {
    for (const value of values) {
      total = (total * 33 + value + round) % 1_000_000_007;
    }
  }
  return total;
}

async function sendChunkedRequest(client, id, fields, arguments_) {
  client.send({
    version: 1,
    type: "request",
    id,
    valueEncoding: workerValueEncoding,
    valueFraming: workerValueFraming,
    ...fields,
  });
  expect(await client.next(
    (message) => message.id === id && message.type === "value-ack",
  )).toMatchObject({ sequence: -1, channel: "arguments", final: false });
  const chunks = [];
  for await (const events of encodeWorkerValueChunks(arguments_, {
    maxChunkBytes: 512,
    maxEventsPerChunk: 5,
    maxTextPartUnits: 7,
  })) {
    chunks.push(events);
  }
  for (let sequence = 0; sequence < chunks.length; sequence += 1) {
    const final = sequence === chunks.length - 1;
    client.send({
      version: 1,
      type: "value-chunk",
      id,
      channel: "arguments",
      sequence,
      final,
      valueEncoding: workerValueEncoding,
      valueFraming: workerValueFraming,
      events: chunks[sequence],
    });
    expect(await client.next(
      (message) => message.id === id && message.type === "value-ack" &&
        message.sequence === sequence,
    )).toMatchObject({ sequence, final });
  }
}

async function receiveChunkedValue(client, id, channel) {
  const decoder = new WorkerValueStreamDecoder();
  let sequence = 0;
  let stream;
  while (true) {
    const message = await client.next((candidate) =>
      candidate.id === id && candidate.type === "value-chunk" &&
      candidate.channel === channel &&
      (stream === undefined || candidate.stream === stream));
    if (stream === undefined) stream = message.stream;
    expect(message).toMatchObject({
      sequence,
      valueEncoding: workerValueEncoding,
      valueFraming: workerValueFraming,
    });
    decoder.write(message.events);
    sequence += 1;
    if (message.final) {
      return { value: decoder.finish(), message };
    }
  }
}

test("worker negotiates the persistent value codec without changing JSON mode", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-codec-worker-"));
  const modulePath = resolve(directory, "codec.mjs");
  const escapePath = resolve(directory, "escape.mjs");
  let client;
  try {
    await writeFile(modulePath, [
      "import { keyword, eliscriptSymbol } from 'eliscript/runtime/core/identifier.mjs';",
      "import { list as persistentList } from 'eliscript/runtime/literals.mjs';",
      "import { persistentHashMap } from 'eliscript/runtime/core/map.mjs';",
      "import { withMeta } from 'eliscript/runtime/core/metadata.mjs';",
      "import { persistentVector } from 'eliscript/runtime/core/vector.mjs';",
      "export function echo(value, context) { context.progress(value); return value; }",
      "export function value() {",
      "  const metadata = persistentHashMap([keyword('source'), 'worker']);",
      "  return withMeta(persistentList(keyword('ready'), eliscriptSymbol('item'), persistentVector(undefined, -0)), metadata);",
      "}",
      "export function unsupported() { return 1n; }",
      "",
    ].join("\n"));
    await writeFile(
      escapePath,
      "import value from 'eliscript/runtime/../package.json';\n" +
        "export function run() { return value; }\n",
    );

    client = createWorkerClient();
    const ready = await client.next((message) => message.type === "ready");
    expect(ready.capabilities).toContain("value-codec-v1");
    expect(ready.capabilities).toContain("value-chunks-v1");
    expect(ready.capabilities).toContain("runtime-resolution");

    const argument = persistentHashMap(
      [keyword("items"), persistentVector(1, undefined, 3)],
    );
    client.send({
      version: 1,
      type: "request",
      id: "codec-echo",
      module: modulePath,
      export: "echo",
      valueEncoding: workerValueEncoding,
      arguments: [encodeWorkerValue(argument)],
    });
    const progress = await client.next(
      (message) => message.id === "codec-echo" && message.type === "progress",
    );
    const response = await client.next(
      (message) => message.id === "codec-echo" && message.type === "response",
    );
    expect(progress.valueEncoding).toBe(workerValueEncoding);
    expect(response.valueEncoding).toBe(workerValueEncoding);
    expect(equalValues(decodeWorkerValue(progress.value), argument)).toBe(true);
    expect(equalValues(decodeWorkerValue(response.value), argument)).toBe(true);

    await sendChunkedRequest(
      client,
      "chunked-echo",
      { module: modulePath, export: "echo" },
      [argument],
    );
    const chunkedProgress = await receiveChunkedValue(
      client,
      "chunked-echo",
      "progress",
    );
    const chunkedResponse = await receiveChunkedValue(
      client,
      "chunked-echo",
      "response",
    );
    expect(equalValues(chunkedProgress.value, argument)).toBe(true);
    expect(equalValues(chunkedResponse.value, argument)).toBe(true);
    expect(chunkedResponse.message.timing).toMatchObject({
      executionMs: expect.any(Number),
      serializationMs: expect.any(Number),
      workerMs: expect.any(Number),
      valueStream: {
        framing: workerValueFraming,
        maxChunkBytes: 256 * 1024,
        maxEventsPerChunk: 512,
        maxTextPartUnits: 8192,
      },
    });
    expect(typeof chunkedResponse.message.timing.valueStream.argumentChunks)
      .toBe("number");
    expect(typeof chunkedResponse.message.timing.valueStream.responseChunks)
      .toBe("number");
    expect(chunkedResponse.message.timing.valueStream.argumentChunks > 0)
      .toBe(true);
    expect(chunkedResponse.message.timing.valueStream.responseChunks > 0)
      .toBe(true);

    client.send({
      version: 1,
      type: "request",
      id: "chunk-order",
      module: modulePath,
      export: "echo",
      valueEncoding: workerValueEncoding,
      valueFraming: workerValueFraming,
    });
    await client.next(
      (message) => message.id === "chunk-order" && message.type === "value-ack",
    );
    client.send({
      version: 1,
      type: "value-chunk",
      id: "chunk-order",
      channel: "arguments",
      sequence: 1,
      final: true,
      valueEncoding: workerValueEncoding,
      valueFraming: workerValueFraming,
      events: [["open", "array", 0]],
    });
    expect(await client.next((message) => message.id === "chunk-order"))
      .toMatchObject({
        ok: false,
        error: { code: "invalid-value-chunk" },
      });

    client.send({
      version: 1,
      type: "request",
      id: "chunk-cancel",
      module: modulePath,
      export: "echo",
      valueEncoding: workerValueEncoding,
      valueFraming: workerValueFraming,
    });
    await client.next(
      (message) => message.id === "chunk-cancel" && message.type === "value-ack",
    );
    client.send({ version: 1, type: "cancel", id: "chunk-cancel" });
    expect(await client.next(
      (message) => message.id === "chunk-cancel" && message.type === "cancel",
    )).toMatchObject({ accepted: true });
    expect(await client.next(
      (message) => message.id === "chunk-cancel" && message.type === "response",
    )).toMatchObject({ ok: false, error: { code: "cancelled" } });

    client.send({
      version: 1,
      type: "request",
      id: "codec-result",
      module: modulePath,
      export: "value",
      valueEncoding: workerValueEncoding,
      arguments: [],
    });
    const codecResult = decodeWorkerValue((await client.next(
      (message) => message.id === "codec-result",
    )).value);
    expect(equalValues(
      codecResult,
      persistentList(keyword("ready"), codecResult.nth(1), persistentVector(undefined, -0)),
    )).toBe(true);

    client.send({
      version: 1,
      type: "request",
      id: "legacy-result",
      module: modulePath,
      export: "value",
      arguments: [],
    });
    expect(await client.next((message) => message.id === "legacy-result"))
      .toMatchObject({ ok: true, value: {} });

    client.send({
      version: 1,
      type: "request",
      id: "unsupported-encoding",
      module: modulePath,
      export: "echo",
      valueEncoding: "future-value-codec",
      arguments: [],
    });
    expect(await client.next(
      (message) => message.id === "unsupported-encoding",
    )).toMatchObject({ ok: false, error: { code: "invalid-request" } });

    client.send({
      version: 1,
      type: "request",
      id: "invalid-value",
      module: modulePath,
      export: "echo",
      valueEncoding: workerValueEncoding,
      arguments: [["unknown"]],
    });
    expect(await client.next((message) => message.id === "invalid-value"))
      .toMatchObject({
        ok: false,
        error: { code: "value-decoding-invalid" },
      });

    client.send({
      version: 1,
      type: "request",
      id: "unsupported-value",
      module: modulePath,
      export: "unsupported",
      valueEncoding: workerValueEncoding,
      arguments: [],
    });
    expect(await client.next((message) => message.id === "unsupported-value"))
      .toMatchObject({
        ok: false,
        error: { code: "value-encoding-unsupported" },
      });

    client.send({
      version: 1,
      type: "request",
      id: "runtime-escape",
      module: escapePath,
      export: "run",
      arguments: [],
    });
    const escape = await client.next(
      (message) => message.id === "runtime-escape",
    );
    expect(escape).toMatchObject({ ok: false });
    expect(escape.error.message).toContain(
      "worker runtime import escapes package runtime",
    );
  } finally {
    if (client) await client.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("long-lived worker implements the versioned NDJSON protocol", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eliscript-worker-"));
  const modulePath = resolve(directory, "worker.mjs");
  const reloadPath = resolve(directory, "reload.mjs");
  const invalidManifestPath = resolve(directory, "invalid-project.json");
  let client;
  try {
    await runSuccessful(
      [compilerPath, "--source-map", "--output", modulePath, fixturePath],
      { env: { ...process.env, EMACS: emacs } },
    );
    await writeFile(reloadPath, "export function value() { return 1; }\n");
    await writeFile(invalidManifestPath, JSON.stringify({
      format: "eliscript-project",
      version: 1,
      entry: "reload.mjs",
      modules: [],
      digest: "0".repeat(64),
    }));
    client = createWorkerClient();
    const ready = await client.next((message) => message.type === "ready");
    expect(ready.version).toBe(1);
    expect(ready.capabilities).toContain("cancel");
    expect(ready.capabilities).toContain("progress");
    expect(ready.capabilities).toContain("module-version");
    expect(ready.capabilities).toContain("project-manifest");
    expect(ready.capabilities).toContain("portable-manifest");

    client.send({
      version: 1,
      type: "request",
      id: "invalid-project-manifest",
      module: reloadPath,
      projectManifest: invalidManifestPath,
      moduleVersion: "0".repeat(64),
      export: "value",
      arguments: [],
    });
    expect(await client.next(
      (message) => message.id === "invalid-project-manifest",
    )).toMatchObject({
      ok: false,
      error: { code: "invalid-project-manifest" },
    });

    client.sendRaw("{not-json");
    expect(await client.next((message) => message.type === "protocol-error"))
      .toMatchObject({ error: { code: "invalid-json" } });
    client.send({ version: 99, type: "request", id: "wrong-version" });
    expect(await client.next((message) => message.id === "wrong-version"))
      .toMatchObject({
        type: "protocol-error",
        error: { code: "version-mismatch" },
      });

    const values = Array.from({ length: 2_000 }, (_, index) => index % 997);
    client.send({
      version: 1,
      type: "request",
      id: "score",
      module: modulePath,
      export: "score_values",
      arguments: [values, 4],
    });
    const score = await client.next((message) => message.id === "score");
    expect(score).toMatchObject({ ok: true, value: scoreValues(values, 4) });
    expect(score.timing).toMatchObject({
      moduleLoadMs: expect.any(Number),
      moduleCacheHit: false,
      moduleVersion: expect.any(String),
      executionMs: expect.any(Number),
      serializationMs: expect.any(Number),
      workerMs: expect.any(Number),
    });

    client.send({
      version: 1,
      type: "request",
      id: "portable-score",
      module: modulePath,
      operation: "score-values",
      arguments: [values, 2],
    });
    expect(await client.next((message) => message.id === "portable-score"))
      .toMatchObject({
        ok: true,
        value: scoreValues(values, 2),
        timing: { moduleCacheHit: true },
      });

    client.send({
      version: 1,
      type: "request",
      id: "source-error",
      module: modulePath,
      operation: "crash-at-source",
      arguments: [1],
    });
    const sourceError = await client.next(
      (message) => message.id === "source-error",
    );
    expect(sourceError).toMatchObject({
      ok: false,
      error: {
        code: "runtime",
        location: {
          file: fixturePath,
          line: expect.any(Number),
          column: expect.any(Number),
        },
      },
    });
    expect(sourceError.error.frames.some(
      (frame) => frame.file === fixturePath,
    )).toBe(true);

    client.send({
      version: 1,
      type: "request",
      id: "reload-cold",
      module: reloadPath,
      export: "value",
      arguments: [],
    });
    expect(await client.next((message) => message.id === "reload-cold"))
      .toMatchObject({ ok: true, value: 1, timing: { moduleCacheHit: false } });
    client.send({
      version: 1,
      type: "request",
      id: "reload-warm",
      module: reloadPath,
      export: "value",
      arguments: [],
    });
    expect(await client.next((message) => message.id === "reload-warm"))
      .toMatchObject({ ok: true, value: 1, timing: { moduleCacheHit: true } });

    await writeFile(reloadPath, "export function value() { return 22; }\n");
    client.send({
      version: 1,
      type: "request",
      id: "reload-changed",
      module: reloadPath,
      export: "value",
      arguments: [],
    });
    expect(await client.next((message) => message.id === "reload-changed"))
      .toMatchObject({
        ok: false,
        error: { code: "module-version-changed" },
      });

    await client.close();
    client = createWorkerClient();
    await client.next((message) => message.type === "ready");
    client.send({
      version: 1,
      type: "request",
      id: "version-one",
      module: reloadPath,
      moduleVersion: "fixed",
      export: "value",
      arguments: [],
    });
    expect(await client.next((message) => message.id === "version-one"))
      .toMatchObject({ ok: true, value: 22, timing: { moduleCacheHit: false } });

    await writeFile(reloadPath, "export function value() { return 3; }\n");
    client.send({
      version: 1,
      type: "request",
      id: "version-one-warm",
      module: reloadPath,
      moduleVersion: "fixed",
      export: "value",
      arguments: [],
    });
    expect(await client.next((message) => message.id === "version-one-warm"))
      .toMatchObject({ ok: true, value: 22, timing: { moduleCacheHit: true } });

    await writeFile(reloadPath, "export function value() { return 4; }\n");
    client.send({
      version: 1,
      type: "request",
      id: "version-two",
      module: reloadPath,
      moduleVersion: "next",
      export: "value",
      arguments: [],
    });
    expect(await client.next((message) => message.id === "version-two"))
      .toMatchObject({
        ok: false,
        error: { code: "module-version-changed" },
      });

    client.send({
      version: 1,
      type: "request",
      id: "missing",
      module: modulePath,
      export: "absent",
      arguments: [],
    });
    expect(await client.next((message) => message.id === "missing"))
      .toMatchObject({ ok: false, error: { code: "missing-export" } });

    client.send({
      version: 1,
      type: "request",
      id: "missing-portable",
      module: modulePath,
      operation: "absent",
      arguments: [],
    });
    expect(await client.next((message) => message.id === "missing-portable"))
      .toMatchObject({ ok: false, error: { code: "missing-portable" } });

    client.send({
      version: 1,
      type: "request",
      id: "inherited-portable",
      module: modulePath,
      operation: "toString",
      arguments: [],
    });
    expect(await client.next((message) => message.id === "inherited-portable"))
      .toMatchObject({ ok: false, error: { code: "missing-portable" } });

    client.send({
      version: 1,
      type: "request",
      id: "cancel-me",
      module: modulePath,
      export: "delayed_echo",
      arguments: ["late", 5_000],
    });
    expect(await client.next(
      (message) => message.type === "progress" && message.id === "cancel-me",
    )).toMatchObject({ value: { stage: "started" } });
    client.send({ version: 1, type: "cancel", id: "cancel-me" });
    expect(await client.next(
      (message) => message.type === "cancel" && message.id === "cancel-me",
    )).toMatchObject({ accepted: true });
    expect(await client.next(
      (message) => message.type === "response" && message.id === "cancel-me",
    )).toMatchObject({ ok: false, error: { code: "cancelled" } });

    client.send({
      version: 1,
      type: "request",
      id: "time-out",
      module: modulePath,
      export: "delayed_echo",
      arguments: ["late", 5_000],
      timeoutMs: 10,
    });
    expect(await client.next(
      (message) => message.type === "response" && message.id === "time-out",
    )).toMatchObject({ ok: false, error: { code: "timeout" } });

    client.send({
      version: 1,
      type: "request",
      id: "unserializable",
      module: modulePath,
      export: "unserializable",
      arguments: [],
    });
    expect(await client.next((message) => message.id === "unserializable"))
      .toMatchObject({ ok: false, error: { code: "serialization" } });

    client.send({
      version: 1,
      type: "request",
      id: "noisy",
      module: modulePath,
      export: "noisy_echo",
      arguments: ["still framed"],
    });
    expect(await client.next((message) => message.id === "noisy"))
      .toMatchObject({ ok: true, value: "still framed" });

    const stopped = await client.close();
    client = undefined;
    expect(stopped.exitCode).toBe(0);
    expect(stopped.stderr).toContain("worker module log");
  } finally {
    if (client) {
      client.child.kill();
      await client.child.exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);
