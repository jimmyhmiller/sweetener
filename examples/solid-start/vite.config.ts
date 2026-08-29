import { solidStart } from "@solidjs/start/config";
import sweetener from "@sweetener/unplugin/vite";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [
    ...sweetener({ configFile: "../sweetener.json" }),
    solidStart(),
    nitro(),
  ],
});
