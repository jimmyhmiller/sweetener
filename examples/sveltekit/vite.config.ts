import { sveltekit } from "@sveltejs/kit/vite";
import sweetener from "@sweetener/unplugin/vite";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [...sweetener({ configFile: "../sweetener.json" }), sveltekit()],
});
