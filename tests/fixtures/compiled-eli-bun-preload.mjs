import { plugin } from "bun";

plugin({
  name: "compiled-eliscript-module",
  setup(build) {
    build.onLoad({ filter: /\.eli$/ }, async ({ path }) => ({
      contents: await Bun.file(path).text(),
      loader: "js",
    }));
  },
});
