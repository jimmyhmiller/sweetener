import sweetener from "@sweetener/unplugin/vite";
export default defineNuxtConfig({
  vite: { plugins: [...sweetener({ configFile: "../sweetener.json" })] },
});
