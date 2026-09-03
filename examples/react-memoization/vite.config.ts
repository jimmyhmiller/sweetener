import react from "@vitejs/plugin-react";
import sweetener from "@sweetener/unplugin/vite";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    ...sweetener({
      configFile: resolve(import.meta.dirname, "sweetener.json"),
    }),
    react({ include: /\.(?:[jt]sx|stsx)$/u }),
  ],
  build: {
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        memoized: resolve(import.meta.dirname, "memoized.html"),
        function: resolve(import.meta.dirname, "function.html"),
      },
    },
  },
});
