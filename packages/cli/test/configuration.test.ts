import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { loadSweetProject, parseSweetCompilerOptions } from "../src/index.js";

describe("sweet project configuration", () => {
  test("preserves missing and malformed config-file diagnostics", () => {
    const directory = mkdtempSync(join(tmpdir(), "sweet-config-"));
    const missing = loadSweetProject(join(directory, "missing.json"));
    expect(missing.typescript.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 5083 })]),
    );

    const malformedPath = join(directory, "malformed.json");
    writeFileSync(malformedPath, '{ "compilerOptions": ');
    const malformed = loadSweetProject(malformedPath);
    expect(malformed.typescript.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 1109, file: expect.anything() }),
      ]),
    );
  });

  test("parses every expansion-affecting option deterministically", () => {
    const result = parseSweetCompilerOptions({
      languageVersion: "1",
      typescriptVersionPolicy: "compatible-minor",
      macroExtensions: [".stsx", ".sts", ".sts"],
      allowCoreShadowing: true,
      trace: "full",
      limits: { maxOutputTokens: 1000, maxMatcherSteps: 500 },
    });
    expect(result.problems).toEqual([]);
    expect(result.options).toEqual({
      languageVersion: "1",
      typescriptVersionPolicy: "compatible-minor",
      macroExtensions: [".sts", ".stsx"],
      allowCoreShadowing: true,
      trace: "full",
      limits: { maxMatcherSteps: 500, maxOutputTokens: 1000 },
    });
  });

  test("reports unknown and malformed options with stable paths", () => {
    const result = parseSweetCompilerOptions({
      unknown: true,
      macroExtensions: ["sts"],
      trace: "everything",
      limits: { maxOutputTokens: -1 },
    });
    expect(result.problems).toMatchObject([
      { code: "SWR6001", path: "sweet.unknown" },
      { code: "SWR6001", path: "sweet.macroExtensions" },
      { code: "SWR6001", path: "sweet.trace" },
      { code: "SWR6001", path: "sweet.limits.maxOutputTokens" },
    ]);
  });
});
