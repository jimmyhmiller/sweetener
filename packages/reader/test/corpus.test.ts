import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ScopeSetId, SourceId } from "@sweet-rewrite/shared";
import { syntaxStructuralEquals } from "@sweet-rewrite/syntax";
import { describe, expect, it } from "vitest";
import { printLossless, readSyntax } from "../src/index.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const scopes = 0 as ScopeSetId;

async function typescriptSources(directory: string): Promise<string[]> {
  const output: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "dist" || entry.name === "test") continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory())
      output.push(...(await typescriptSources(entryPath)));
    else if (entryPath.endsWith(".ts")) output.push(entryPath);
  }
  return output.sort();
}

describe("reader corpus", () => {
  it(
    "reads production workspace TypeScript without diagnostics or byte drift",
    { timeout: 30_000 },
    async () => {
      const paths = await typescriptSources(
        path.join(repositoryRoot, "packages"),
      );
      expect(paths.length).toBeGreaterThan(20);
      for (const [index, sourcePath] of paths.entries()) {
        const source = await readFile(sourcePath, "utf8");
        const first = readSyntax(source, {
          sourceId: (1_000 + index) as SourceId,
          scopes,
        });
        expect(
          first.diagnostics,
          path.relative(repositoryRoot, sourcePath),
        ).toEqual([]);
        expect(printLossless(first.root), sourcePath).toBe(source);
        const second = readSyntax(source, {
          sourceId: (1_000 + index) as SourceId,
          scopes,
        });
        expect(
          syntaxStructuralEquals(first.root, second.root),
          sourcePath,
        ).toBe(true);
      }
    },
  );

  it("reads representative TSX without diagnostics or byte drift", () => {
    const source = `export const View = ({ items }: Props) => (
  <main data-kind="corpus">
    {items.map((item) => <span key={item}>{item}</span>)}
  </main>
);\n`;
    const result = readSyntax(source, {
      sourceId: 2_000 as SourceId,
      scopes,
      variant: "jsx",
    });
    expect(result.diagnostics).toEqual([]);
    expect(printLossless(result.root)).toBe(source);
  });
});
