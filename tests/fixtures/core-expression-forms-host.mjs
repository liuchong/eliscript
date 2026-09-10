const modulePath = process.argv[2];
if (!modulePath) throw new TypeError("compiled module path is required");

const module = await import(modulePath);
process.stdout.write(`${JSON.stringify(module.expression_form_report())}\n`);
