import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import sweetener from "@sweetener/unplugin/vite";
import { defineConfig } from "vite";
export default defineConfig({
  plugins: [
    ...sweetener({ configFile: "../sweetener.json" }),
    tanstackStart(),
    react(),
  ],
});
