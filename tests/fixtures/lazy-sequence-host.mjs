import process from "node:process";
import { pathToFileURL } from "node:url";

const modulePath = process.argv[2];
if (modulePath === undefined) throw new TypeError("expected a compiled module path");
const fixture = await import(pathToFileURL(modulePath).href);
process.stdout.write(`${JSON.stringify(fixture.run())}\n`);
