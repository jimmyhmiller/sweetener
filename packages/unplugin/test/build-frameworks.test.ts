import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { build as farmBuild } from "@farmfe/core";
import { createRsbuild } from "@rsbuild/core";
import { describe, test } from "vitest";
import farmPlugin from "../src/farm.js";
import rsbuildPlugin from "../src/rsbuild.js";
import { expectExpanded, integrationFixture } from "./fixture.js";

function javascriptBelow(directory: string): string {
  const entry = readdirSync(directory, { withFileTypes: true }).find(
    (item) => item.isFile() && item.name.endsWith(".js"),
  );
  if (entry === undefined)
    throw new Error(`No JavaScript output in ${directory}`);
  return readFileSync(join(directory, entry.name), "utf8");
}

describe("build-framework adapters", () => {
  test("Rsbuild builds Sweetener through its real plugin API", async () => {
    const fixture = integrationFixture("rsbuild");
    const output = join(fixture.root, "dist-rsbuild");
    const rsbuild = await createRsbuild({
      cwd: fixture.root,
      config: {
        plugins: [rsbuildPlugin({ configFile: fixture.config })],
        source: { entry: { index: fixture.entry } },
        output: { distPath: { root: output }, sourceMap: { js: "source-map" } },
        html: { outputStructure: "flat" },
      },
    });
    await rsbuild.build();
    expectExpanded(javascriptBelow(join(output, "static/js")));
  });

  test("Farm builds Sweetener through its real JavaScript plugin API", async () => {
    const fixture = integrationFixture("farm");
    const output = join(fixture.root, "dist-farm");
    await farmBuild({
      root: fixture.root,
      plugins: [farmPlugin({ configFile: fixture.config })],
      compilation: {
        input: { index: fixture.entry },
        output: {
          path: output,
          format: "esm",
          targetEnv: "library",
          clean: true,
        },
      },
      minify: false,
      sourcemap: true,
    });
    expectExpanded(javascriptBelow(output));
  });
});
