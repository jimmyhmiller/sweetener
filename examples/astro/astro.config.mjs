import { defineConfig } from "astro/config";
import sweetener from "@sweetener/unplugin/vite";
export default defineConfig({
  vite: { plugins: [...sweetener({ configFile: "../sweetener.json" })] },
});
