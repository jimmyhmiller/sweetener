import sweetener from "@sweetener/unplugin/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
export default defineConfig({
  plugins: [...sweetener({ configFile: "../sweetener.json" }), solid()],
});
