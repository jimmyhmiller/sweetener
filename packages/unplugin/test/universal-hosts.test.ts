import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import rspack, { type Stats as RspackStats } from "@rspack/core";
import * as esbuild from "esbuild";
import { rolldown } from "rolldown";
import { rollup } from "rollup";
import webpack from "webpack";
import { describe, expect, test } from "vitest";
import esbuildPlugin from "../src/esbuild.js";
import rolldownPlugin from "../src/rolldown.js";
import rollupPlugin from "../src/rollup.js";
import rspackPlugin from "../src/rspack.js";
import webpackPlugin from "../src/webpack.js";
import { expectExpanded, integrationFixture } from "./fixture.js";

describe("universal bundler adapters", () => {
  test("Rollup builds Sweetener and retains its original source map", async () => {
    const fixture = integrationFixture("rollup");
    const bundle = await rollup({
      input: fixture.entry,
      plugins: [rollupPlugin({ configFile: fixture.config })],
    });
    const generated = await bundle.generate({ format: "es", sourcemap: true });
    const chunk = generated.output.find((item) => item.type === "chunk");
    expect(chunk?.type).toBe("chunk");
    if (chunk?.type !== "chunk") return;
    expectExpanded(chunk.code);
    expect(
      chunk.map?.sources.some((source) => source.endsWith("main.sts")),
    ).toBe(true);
    await bundle.close();
  });

  test("Rolldown builds Sweetener", async () => {
    const fixture = integrationFixture("rolldown");
    const bundle = await rolldown({
      input: fixture.entry,
      plugins: [rolldownPlugin({ configFile: fixture.config })],
    });
    const generated = await bundle.generate({ format: "es", sourcemap: true });
    const chunk = generated.output.find((item) => item.type === "chunk");
    expect(chunk?.type).toBe("chunk");
    if (chunk?.type === "chunk") expectExpanded(chunk.code);
    await bundle.close();
  });

  test("esbuild builds Sweetener and watches macro dependencies", async () => {
    const fixture = integrationFixture("esbuild");
    const result = await esbuild.build({
      entryPoints: [fixture.entry],
      bundle: true,
      format: "esm",
      sourcemap: "external",
      outfile: join(fixture.root, "dist-esbuild/bundle.js"),
      write: false,
      plugins: [esbuildPlugin({ configFile: fixture.config })],
    });
    const output = result.outputFiles?.find((file) =>
      file.path.endsWith(".js"),
    );
    expect(output).toBeDefined();
    expectExpanded(output!.text);
    const map = result.outputFiles?.find((file) =>
      file.path.endsWith(".js.map"),
    );
    expect(map?.text).toContain("main.sts");
  });

  test("esbuild rebuilds when only an imported macro changes", async () => {
    const fixture = integrationFixture("esbuild-watch");
    const context = await esbuild.context({
      entryPoints: [fixture.entry],
      bundle: true,
      format: "esm",
      outfile: join(fixture.root, "dist-watch/bundle.js"),
      write: false,
      plugins: [esbuildPlugin({ configFile: fixture.config })],
    });
    try {
      const first = await context.rebuild();
      expectExpanded(first.outputFiles![0]!.text);
      writeFileSync(
        fixture.macros,
        `export syntax duplicate:expr { rule { duplicate($value:tt) } => { [$value, $value, $value] } }\n`,
      );
      const second = await context.rebuild();
      expect(second.outputFiles![0]!.text).toContain("[21, 21, 21]");
    } finally {
      await context.dispose();
    }
  });

  test("webpack builds Sweetener", async () => {
    const fixture = integrationFixture("webpack");
    const outputPath = join(fixture.root, "dist-webpack");
    const compiler = webpack({
      mode: "development",
      devtool: "source-map",
      entry: fixture.entry,
      output: {
        path: outputPath,
        filename: "bundle.js",
        library: { type: "module" },
      },
      experiments: { outputModule: true },
      plugins: [webpackPlugin({ configFile: fixture.config })],
    });
    const stats = await new Promise<webpack.Stats>((resolve, reject) =>
      compiler.run((error, result) =>
        error != null
          ? reject(error)
          : result === undefined
            ? reject(new Error("No webpack stats"))
            : resolve(result),
      ),
    );
    await new Promise<void>((resolve, reject) =>
      compiler.close((error) => (error == null ? resolve() : reject(error))),
    );
    expect(stats.hasErrors(), stats.toString({ errors: true })).toBe(false);
    expectExpanded(readFileSync(join(outputPath, "bundle.js"), "utf8"));
    expect(readFileSync(join(outputPath, "bundle.js.map"), "utf8")).toContain(
      "main.sts",
    );
  });

  test("Rspack builds Sweetener", async () => {
    const fixture = integrationFixture("rspack");
    const outputPath = join(fixture.root, "dist-rspack");
    const compiler = rspack({
      mode: "development",
      devtool: "source-map",
      entry: fixture.entry,
      output: { path: outputPath, filename: "bundle.js" },
      plugins: [rspackPlugin({ configFile: fixture.config })],
    });
    const stats = await new Promise<RspackStats>((resolve, reject) =>
      compiler.run((error, result) =>
        error != null
          ? reject(error)
          : result === undefined
            ? reject(new Error("No Rspack stats"))
            : resolve(result),
      ),
    );
    await new Promise<void>((resolve, reject) =>
      compiler.close((error) => (error == null ? resolve() : reject(error))),
    );
    expect(stats.hasErrors(), stats.toString({ errors: true })).toBe(false);
    expectExpanded(readFileSync(join(outputPath, "bundle.js"), "utf8"));
  });
});
