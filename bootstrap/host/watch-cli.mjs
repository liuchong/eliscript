#!/usr/bin/env node

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  diagnosticFromError,
  loadCompiler,
  renderDiagnostic,
} from "./bun.mjs";
import { readProjectConfiguration } from "./project-cli.mjs";
import {
  defaultWatchInterval,
  maximumWatchInterval,
  minimumWatchInterval,
  ProjectWatcher,
} from "./watch.mjs";

const usage = `Usage: eliscript-watch (--root DIRECTORY | --config FILE) [OPTIONS]

Options:
  --root DIRECTORY  Observe regular .eli files below DIRECTORY
  --config FILE     Resolve and observe a versioned project configuration
  --interval MS     Poll every ${defaultWatchInterval} ms by default (${minimumWatchInterval}-${maximumWatchInterval})
  --json            Emit one versioned JSON event per line
  -h, --help        Show this help
`;

export function parseArguments(arguments_) {
  const argumentsList = [...arguments_];
  let root;
  let configuration;
  let interval = defaultWatchInterval;
  let json = false;
  while (argumentsList.length > 0) {
    const argument = argumentsList.shift();
    if (argument === "-h" || argument === "--help") return { help: true };
    if (argument === "--root") {
      if (argumentsList.length === 0) throw new Error("--root requires a directory");
      root = argumentsList.shift();
    } else if (argument === "--config") {
      if (argumentsList.length === 0) throw new Error("--config requires a file");
      configuration = argumentsList.shift();
    } else if (argument === "--interval") {
      if (argumentsList.length === 0) throw new Error("--interval requires milliseconds");
      const text = argumentsList.shift();
      if (!/^[0-9]+$/u.test(text)) throw new Error("--interval requires an integer");
      interval = Number(text);
    } else if (argument === "--json") {
      json = true;
    } else {
      throw new Error(`unknown option: ${argument}`);
    }
  }
  if ((root === undefined) === (configuration === undefined)) {
    throw new Error("choose exactly one of --root or --config");
  }
  return { root, configuration, interval, json };
}

function writeEvent(event, json) {
  if (json) {
    process.stdout.write(`${JSON.stringify(event)}\n`);
    return;
  }
  if (event.event === "ready") {
    process.stdout.write(`watching ${event.root}\n`);
  } else if (event.event === "error") {
    process.stdout.write(`watch error: ${renderDiagnostic(event.diagnostic)}\n`);
  } else {
    for (const change of event.changes) {
      process.stdout.write(`${change.kind} ${change.path ?? change.file}\n`);
    }
  }
}

async function watchOptions(parsed, options) {
  if (parsed.configuration === undefined) {
    return { root: parsed.root, configuration: null, interval: parsed.interval };
  }
  const compiler = await loadCompiler(options.moduleDirectory);
  const request = await readProjectConfiguration(parsed.configuration, compiler);
  return {
    root: request.root,
    configuration: request.configuration,
    interval: parsed.interval,
  };
}

export async function execute(arguments_, options = {}) {
  const parsed = parseArguments(arguments_);
  if (parsed.help) return { help: true };
  const watcher = await ProjectWatcher.create(await watchOptions(parsed, options));
  return { watcher, json: parsed.json };
}

export async function main(arguments_ = process.argv.slice(2)) {
  const execution = await execute(arguments_);
  if (execution.help) {
    process.stdout.write(usage);
    return;
  }
  const { watcher, json } = execution;
  let stop;
  const stopped = new Promise((resolveStopped) => {
    stop = resolveStopped;
  });
  const handleSignal = () => stop();
  process.once("SIGINT", handleSignal);
  process.once("SIGTERM", handleSignal);
  try {
    watcher.start((event) => writeEvent(event, json));
    await stopped;
  } finally {
    process.removeListener("SIGINT", handleSignal);
    process.removeListener("SIGTERM", handleSignal);
    await watcher.close();
  }
}

const isMain = process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    const diagnostic = diagnosticFromError(error);
    console.error(`eliscript-watch: ${renderDiagnostic(diagnostic)}`);
    process.exitCode = 1;
  });
}
