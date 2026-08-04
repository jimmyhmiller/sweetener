import { join } from "node:path";
import bunPlugin from "../src/bun.js";
import { expectExpanded, integrationFixture } from "./fixture.js";

const fixture = integrationFixture("bun");
const result = await Bun.build({
  entrypoints: [fixture.entry],
  outdir: join(fixture.root, "dist-bun"),
  plugins: [bunPlugin({ configFile: fixture.config })],
  sourcemap: "external",
});
if (!result.success) throw new Error(result.logs.map(String).join("\n"));
const output = result.outputs.find((file) => file.path.endsWith(".js"));
if (output === undefined) throw new Error("Bun did not emit JavaScript");
expectExpanded(await output.text());
