import { resolve } from "node:path";
import sweetener from "@sweetener/unplugin/bun";

const result = await Bun.build({
  entrypoints: [resolve(import.meta.dir, "server.ts")],
  outdir: resolve(import.meta.dir, "dist"),
  target: "bun",
  sourcemap: "external",
  plugins: [
    sweetener({ configFile: resolve(import.meta.dir, "../sweetener.json") }),
  ],
});

if (!result.success) {
  for (const message of result.logs) console.error(message);
  process.exitCode = 1;
} else {
  console.log(`Built ${result.outputs.length} Bun artifact(s)`);
}
