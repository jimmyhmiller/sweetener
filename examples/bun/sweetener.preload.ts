import { resolve } from "node:path";
import sweetener from "@sweetener/unplugin/bun";

Bun.plugin(
  sweetener({ configFile: resolve(import.meta.dir, "../sweetener.json") }),
);
