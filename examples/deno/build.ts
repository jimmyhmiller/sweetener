import { resolve } from "node:path";
import { emitStandalone } from "@sweetener/cli";

const here = import.meta.dirname!;
const result = emitStandalone({
  fileNames: [
    resolve(here, "../macro-suite/macros.sts"),
    resolve(here, "../macro-suite/showcase.sts"),
  ],
  outDir: resolve(here, ".sweetener"),
});

if (result.diagnostics.length > 0) {
  for (const diagnostic of result.diagnostics)
    console.error(`SWR${diagnostic.code}: ${String(diagnostic.messageText)}`);
  Deno.exit(1);
}

console.log(`Expanded ${result.outputs.size} Sweetener module(s)`);
