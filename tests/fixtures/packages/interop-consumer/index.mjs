import {
  hashMap,
  hashSet,
  vector,
} from "eliscript/runtime/literals.mjs";
import { to_js_object } from "eliscript/stdlib/interop/js.mjs";
import {
  consumeNativeOptions,
} from "@eliscript-fixtures/native-container-consumer";

const children = vector("left", "right");
const settings = hashMap("ready", true);
const tags = hashSet("host", "stable");
const source = hashMap(
  "title", "Eliscript",
  "children", children,
  "settings", settings,
  "tags", tags,
);

const nativeOptions = to_js_object(source, { deep: true });
const consumer = consumeNativeOptions(nativeOptions);

console.log(JSON.stringify({
  consumer,
  sourceUnchanged: {
    children: children.toArray(),
    childCount: children.count,
    settingAdded: settings.has("package-added"),
    tagAdded: tags.has("package-added"),
  },
}));
