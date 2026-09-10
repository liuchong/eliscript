import { pathToFileURL } from "node:url";

const [modulePath] = process.argv.slice(2);
const declarations = await import(pathToFileURL(modulePath).href);

let failure;
try {
  declarations.no_condp_match();
} catch (error) {
  failure = { name: error.name, message: error.message };
}

console.log(JSON.stringify({
  report: declarations.dispatch_report(),
  failure,
}));
