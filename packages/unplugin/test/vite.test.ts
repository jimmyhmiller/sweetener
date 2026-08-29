import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, createServer } from "vite";
import { describe, expect, test } from "vitest";
import sweetener from "../src/vite.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "sweet-vite-"));
  const entry = join(root, "main.sts");
  const macros = join(root, "macros.sts");
  const config = join(root, "tsconfig.json");
  writeFileSync(
    macros,
    `export syntax duplicate:expr { rule { duplicate($value:tt) } => { [$value, $value] } }\n`,
  );
  writeFileSync(
    entry,
    `import { duplicate } from "./macros.sts" for syntax;\nexport interface Answer { readonly values: number[] }\nexport const answer: Answer = { values: duplicate(21) };\n`,
  );
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: { module: "ESNext", target: "ES2022" },
      files: ["macros.sts", "main.sts"],
    }),
  );
  return { root, entry, macros, config };
}

describe("Vite adapter", () => {
  test("transforms Sweetener through the real development plugin container", async () => {
    const project = fixture();
    const server = await createServer({
      root: project.root,
      configFile: false,
      logLevel: "silent",
      plugins: [sweetener({ configFile: project.config })],
      server: { middlewareMode: true },
    });
    try {
      const result = await server.transformRequest("/main.sts");
      expect(result?.code).toContain("[21, 21]");
      expect(result?.code).not.toContain("interface Answer");
      expect(result?.code).not.toContain("for syntax");
      expect(
        result?.map !== null &&
          result?.map !== undefined &&
          "sources" in result.map &&
          result.map.sources.some((source: string) =>
            source.endsWith("main.sts"),
          ),
      ).toBe(true);
      expect(server.watcher.getWatched()).not.toEqual({});
    } finally {
      await server.close();
    }
  });

  test("produces an executable production bundle", async () => {
    const project = fixture();
    const built = await build({
      root: project.root,
      configFile: false,
      logLevel: "silent",
      plugins: [sweetener({ configFile: project.config })],
      build: {
        lib: { entry: project.entry, formats: ["es"] },
        outDir: "dist",
        emptyOutDir: true,
        sourcemap: true,
        write: false,
      },
    });
    const builds = Array.isArray(built) ? built : [built];
    if (!builds.every((output) => "output" in output))
      throw new Error("Expected completed Vite build");
    const output = builds
      .flatMap((result) => ("output" in result ? result.output : []))
      .filter((item) => item.type === "chunk")
      .map((item) => item.code)
      .join("\n");
    expect(output).toContain("21");
    expect(output).not.toContain("duplicate");
    const mapAsset = builds
      .flatMap((result) => ("output" in result ? result.output : []))
      .find((item) => item.type === "asset" && item.fileName.endsWith(".map"));
    expect(mapAsset?.type).toBe("asset");
    if (mapAsset?.type !== "asset") throw new Error("Missing source map asset");
    const map = JSON.parse(String(mapAsset.source)) as {
      sources: readonly string[];
      mappings: string;
    };
    expect(map.sources.some((source) => source.endsWith("main.sts"))).toBe(
      true,
    );
    expect(map.mappings.length).toBeGreaterThan(0);
  });
});
