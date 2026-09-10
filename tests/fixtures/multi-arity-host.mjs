import { pathToFileURL } from "node:url";

const modulePath = process.argv[2];
if (!modulePath) throw new TypeError("expected compiled module path");

const compiled = await import(pathToFileURL(modulePath).href);
let failure;
try {
  compiled.countdown();
} catch (error) {
  failure = { name: error.name, message: error.message };
}

process.stdout.write(JSON.stringify({
  report: compiled.report(),
  asyncReport: await compiled.async_report(),
  failure,
}));
