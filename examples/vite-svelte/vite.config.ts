import { svelte } from "@sveltejs/vite-plugin-svelte";
import sweetener from "@sweetener/unplugin/vite";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [...sweetener({ configFile: "../sweetener.json" }), svelte()],
});
