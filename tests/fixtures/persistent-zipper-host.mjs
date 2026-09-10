import { pathToFileURL } from "node:url";

const modulePath = process.argv[2];
if (!modulePath) throw new TypeError("expected compiled module path");

const compiled = await import(pathToFileURL(modulePath).href);
const report = compiled.zipper_report();
process.stdout.write(JSON.stringify(report));
