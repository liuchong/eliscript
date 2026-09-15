#!/usr/bin/env node
//
// Node entry point for the packaged command line.
//
// The shell wrappers beside this file locate the checkout through their own
// path and default to Bun. An installed package has neither a checkout URL nor
// a guaranteed Bun, so this entry derives the package root from its own
// location, defaults to the Node runtime it is already running under, and
// dispatches on the name the command was invoked as. Every name in `bin` points
// here.

import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

// The generated compiler sits beside the package. The shell wrappers read the
// same variable, so both entry points agree on one location.
process.env.ELISCRIPT_BOOTSTRAP_MODULE_DIR ??= resolve(root, "dist/bootstrap");

const commands = {
  "eliscript": ["bootstrap/host/bun.mjs", "eliscript"],
  "eliscript-build": ["bootstrap/host/project-cli.mjs", "eliscript-build"],
  "eliscript-check": ["bootstrap/host/check-cli.mjs", "eliscript-check"],
  "eliscript-format": ["bootstrap/host/format-cli.mjs", "eliscript-format"],
  "eliscript-eval": ["bootstrap/host/evaluation-cli.mjs", "eliscript-eval"],
  "eliscript-watch": ["bootstrap/host/watch-cli.mjs", "eliscript-watch"],
};

const invoked = basename(process.argv[1] ?? "");
const [entry, commandName] = commands[invoked] ?? commands.eliscript;
process.env.ELISCRIPT_COMMAND_NAME ??= commandName;

const { main } = await import(new URL(`../${entry}`, import.meta.url));
await main(process.argv.slice(2));
