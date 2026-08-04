import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import rspack, { type Stats as RspackStats } from "@rspack/core";
import webpack from "webpack";
import { describe, expect, test } from "vitest";

function fixture(host: string) {
  const root = mkdtempSync(join(tmpdir(), `sweet-loader-${host}-`));
  const entry = join(root, "main.sts");
  const config = join(root, "tsconfig.json");
  writeFileSync(
    join(root, "macros.sts"),
    `export syntax twice:expr { rule { twice($x:tt) } => { [$x, $x] } }\n`,
  );
  writeFileSync(
    entry,
    `import { twice } from "./macros.sts" for syntax;\nexport const answer = twice(21);\n`,
  );
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: { module: "ESNext" },
      files: ["main.sts", "macros.sts"],
    }),
  );
  return { root, entry, config };
}

const loader = resolve("packages/webpack-loader/dist/src/index.js");

describe("native webpack loader", () => {
  test("runs in webpack with maps and dependency tracking", async () => {
    const project = fixture("webpack");
    const output = join(project.root, "dist");
    const compiler = webpack({
      mode: "development",
      devtool: "source-map",
      entry: project.entry,
      output: { path: output, filename: "bundle.js" },
      module: {
        rules: [
          {
            test: /\.sts$/u,
            use: [{ loader, options: { configFile: project.config } }],
          },
        ],
      },
    });
    const stats = await new Promise<webpack.Stats>((resolveStats, reject) =>
      compiler.run((error, result) =>
        error != null
          ? reject(error)
          : result === undefined
            ? reject(new Error("No stats"))
            : resolveStats(result),
      ),
    );
    await new Promise<void>((done, reject) =>
      compiler.close((error) => (error == null ? done() : reject(error))),
    );
    expect(stats.hasErrors(), stats.toString({ errors: true })).toBe(false);
    expect(readFileSync(join(output, "bundle.js"), "utf8")).toContain("21,21");
    expect(readFileSync(join(output, "bundle.js.map"), "utf8")).toContain(
      "main.sts",
    );
  });

  test("runs unchanged in Rspack", async () => {
    const project = fixture("rspack");
    const output = join(project.root, "dist");
    const compiler = rspack({
      mode: "development",
      entry: project.entry,
      output: { path: output, filename: "bundle.js" },
      module: {
        rules: [
          {
            test: /\.sts$/u,
            use: [{ loader, options: { configFile: project.config } }],
          },
        ],
      },
    });
    const stats = await new Promise<RspackStats>((resolveStats, reject) =>
      compiler.run((error, result) =>
        error != null
          ? reject(error)
          : result === undefined
            ? reject(new Error("No stats"))
            : resolveStats(result),
      ),
    );
    await new Promise<void>((done, reject) =>
      compiler.close((error) => (error == null ? done() : reject(error))),
    );
    expect(stats.hasErrors(), stats.toString({ errors: true })).toBe(false);
    expect(readFileSync(join(output, "bundle.js"), "utf8")).toContain("21,21");
  });
});
