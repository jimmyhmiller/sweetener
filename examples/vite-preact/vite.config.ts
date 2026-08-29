import preact from "@preact/preset-vite";
import sweetener from "@sweetener/unplugin/vite";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [...sweetener({ configFile: "../sweetener.json" }), preact()],
});
