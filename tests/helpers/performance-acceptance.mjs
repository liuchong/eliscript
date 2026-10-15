// A deferred check is explicitly skipped, never reported as passed. Historical
// report validation and live semantic tests keep using the original runner.
export function currentPerformanceTest(test, environment = process.env) {
  if (environment.ELISCRIPT_DEFER_PERFORMANCE_ACCEPTANCE !== '1') return test;
  return (name, ...arguments_) => test.skip(
    `DEFERRED / NOT ACCEPTED: ${name}`, ...arguments_,
  );
}
