export async function echo_text(value, context) {
  if (typeof value !== "string") {
    throw new TypeError("echo_text requires one string");
  }
  await context.progress(value.length);
  await new Promise((resolve) => setTimeout(resolve, 100));
  return value;
}
