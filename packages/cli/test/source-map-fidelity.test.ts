import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SourceMapConsumer } from "@jridgewell/source-map";
import { describe, expect, test } from "vitest";
import {
  createDefaultProjectExpansionProvider,
  loadSweetProject,
} from "../src/index.js";

/**
 * Source maps, read the way a debugger reads them.
 *
 * Everything else that checks a source map compares its encoded mappings to a
 * string, which says the map is well formed and nothing about whether it is
 * right: a map can encode a perfectly valid position that is the wrong one.
 * These decode what the compiler produced and ask where a position in the
 * generated TypeScript actually came from.
 */
function expand(macros: string, main: string) {
  const directory = mkdtempSync(join(tmpdir(), "sweet-map-"));
  writeFileSync(join(directory, "macros.sts"), macros, "utf8");
  writeFileSync(join(directory, "main.sts"), main, "utf8");
  writeFileSync(
    join(directory, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
      },
      sweet: { macroExtensions: [".sts"] },
      files: ["macros.sts", "main.sts"],
    }),
    "utf8",
  );
  const provider = createDefaultProjectExpansionProvider();
  provider.expandProject(loadSweetProject(join(directory, "tsconfig.json")));
  const inspected = provider.inspectSource(join(directory, "main.sts"));
  if (inspected?.sourceMap === undefined)
    throw new Error("main.sts produced no source map");
  return {
    generated: inspected.generated.text,
    map: new SourceMapConsumer(inspected.sourceMap as never),
  };
}

/** Where the given text in the generated output came from, one-based. */
function originOf(
  generated: string,
  map: SourceMapConsumer,
  needle: string,
): { line: number | null; column: number | null; source: string | null } {
  const offset = generated.indexOf(needle);
  expect(offset, `${needle} is not in the generated output`).toBeGreaterThan(
    -1,
  );
  const before = generated.slice(0, offset);
  const line = before.split("\n").length;
  const column = offset - (before.lastIndexOf("\n") + 1);
  const found = map.originalPositionFor({ line, column });
  return { line: found.line, column: found.column, source: found.source };
}

const macros = `export syntax twice:expr {
  rule { twice($value:expr) } => { [$value, $value] }
}
`;

describe("source map fidelity", () => {
  test("maps captured syntax back to where it was written", () => {
    // `seed` is written once on line 4 and appears twice in the output. Both
    // copies have to name the line the author wrote, not the template.
    const main = `import { twice } from "./macros.sts" for syntax;

const other = 1;
const seed = 41;
export const doubled = twice(seed);
`;
    const { generated, map } = expand(macros, main);
    const first = generated.indexOf("seed", generated.indexOf("doubled"));
    expect(first).toBeGreaterThan(-1);
    const before = generated.slice(0, first);
    const found = map.originalPositionFor({
      line: before.split("\n").length,
      column: first - (before.lastIndexOf("\n") + 1),
    });
    expect(found.source).toContain("main.sts");
    // Line 5 of main.sts is the invocation, where `seed` is written.
    expect(found.line).toBe(5);
  });

  test("maps an untouched declaration to its own line", () => {
    const main = `import { twice } from "./macros.sts" for syntax;

const first = 1;
const second = 2;
const third = 3;
export const doubled = twice(third);
`;
    const { generated, map } = expand(macros, main);
    expect(originOf(generated, map, "second").line).toBe(4);
    expect(originOf(generated, map, "third").line).toBe(5);
  });

  test("names the source file it came from", () => {
    const main = `import { twice } from "./macros.sts" for syntax;
export const doubled = twice(7);
`;
    const { generated, map } = expand(macros, main);
    const found = originOf(generated, map, "doubled");
    expect(found.source).toContain("main.sts");
    expect(found.line).toBe(2);
  });

  test("does not claim a position it cannot account for", () => {
    // Every mapped position must name a real line of the source. A map that
    // points past the end of the file would still decode.
    const main = `import { twice } from "./macros.sts" for syntax;

const seed = 3;
export const doubled = twice(seed);
`;
    const lines = main.split("\n").length;
    const { generated, map } = expand(macros, main);
    for (const needle of ["seed", "doubled"]) {
      const found = originOf(generated, map, needle);
      expect(found.line).not.toBeNull();
      expect(found.line!).toBeGreaterThan(0);
      expect(found.line!).toBeLessThanOrEqual(lines);
    }
  });
});
