import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const declarations = await import(pathToFileURL(modulePath).href);

console.log(JSON.stringify(declarations.record_report()));
