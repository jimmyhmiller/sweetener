import { defineConfig } from "vite";
import sweetener from "@sweetener/unplugin/vite";
export default defineConfig({
  plugins: [...sweetener({ configFile: "../sweetener.json" })],
});
