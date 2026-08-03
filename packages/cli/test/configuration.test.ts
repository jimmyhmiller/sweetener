import { describe, expect, test } from "vitest";
import { parseSweetCompilerOptions } from "../src/index.js";

describe("sweet project configuration", () => {
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
