import { fileURLToPath, URL } from "node:url";
import { createRequire } from "node:module";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const packageSource = (name: string) => `${root}packages/${name}/src/index.ts`;

export default defineConfig({
  base: process.env["PLAYGROUND_BASE_PATH"] ?? "/",
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: "node:fs",
        replacement: fileURLToPath(
          new URL("./src/worker/virtual-fs.ts", import.meta.url),
        ),
      },
      {
        find: "node:path",
        replacement: fileURLToPath(
          new URL("./src/worker/path-shim.ts", import.meta.url),
        ),
      },
      {
        find: "node:crypto",
        replacement: fileURLToPath(
          new URL("./src/worker/crypto-shim.ts", import.meta.url),
        ),
      },
      {
        find: "typescript",
        replacement: require.resolve("@typescript/typescript6"),
      },
      ...[
        "shared",
        "syntax",
        "reader",
        "pattern",
        "macro-language",
        "hygiene",
        "template",
        "enforestation",
        "expansion",
        "printer",
        "typescript-host",
      ].map((name) => ({
        find: `@sweet-rewrite/${name}`,
        replacement: packageSource(name),
      })),
    ],
  },
  worker: { format: "es" },
  server: { port: 4173, fs: { allow: [root] } },
});
