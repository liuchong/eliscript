import { pathToFileURL } from "node:url";

const modulePath = process.argv[2];
if (modulePath === undefined) {
  throw new TypeError("language equality host requires a generated module path");
}

const generated = await import(pathToFileURL(modulePath).href);
console.log(JSON.stringify(generated.report()));
