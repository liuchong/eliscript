// Keep the original exception and assertions. Print only scalar heap counters
// when a positive recovery step fails, before the test's cleanup changes them.
export function invokeWithHeapDiagnostic(runtime, name, args = []) {
  const before = runtime.stats();
  try {return runtime.invoke(name, args);}
  catch (error) {
    console.error(JSON.stringify({managedInvocation: name, before, after: runtime.stats()}));
    throw error;
  }
}
