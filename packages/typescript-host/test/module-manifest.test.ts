import type { SourceId } from "@sweet-rewrite/shared";
import { describe, expect, test } from "vitest";
import {
  macroModuleFormatVersion,
  parseMacroModuleManifest,
} from "../src/index.js";

const sourceId = 900 as SourceId;

function validManifest() {
  return {
    formatVersion: macroModuleFormatVersion,
    name: "@example/macros",
    languageVersion: "1.0.0",
    compiler: { minimum: "0.1.0", maximum: "0.1.x" },
    entry: "./macros.sts",
    exports: {
      thread: { source: "thread", category: "expr", phase: 1 },
    },
    dependencies: [
      { specifier: "./shared", kind: "macro", exports: ["helper"] },
      { specifier: "./runtime", kind: "runtime", exports: [] },
    ],
  };
}

describe("macro module manifests", () => {
  test("normalizes and deeply freezes a valid versioned manifest", () => {
    const result = parseMacroModuleManifest(validManifest(), { sourceId });
    expect(result.diagnostics).toEqual([]);
    expect(result.manifest).toMatchObject({
      name: "@example/macros",
      exports: { thread: { category: "expr", phase: 1 } },
      dependencies: [
        { kind: "macro", exports: ["helper"] },
        { kind: "runtime", exports: [] },
      ],
    });
    expect(Object.isFrozen(result.manifest)).toBe(true);
    expect(Object.isFrozen(result.manifest?.dependencies)).toBe(true);
    expect(Object.isFrozen(result.manifest?.exports["thread"])).toBe(true);
  });

  test("returns stable diagnostics for every invalid closed field", () => {
    const result = parseMacroModuleManifest(
      {
        ...validManifest(),
        formatVersion: 2,
        name: "",
        compiler: {},
        exports: { broken: { source: "", category: "nope", phase: -1 } },
        dependencies: [{ specifier: "", kind: "host", exports: "all" }],
      },
      { sourceId, label: "broken.json" },
    );
    expect(result.manifest).toBeUndefined();
    expect(result.diagnostics.map(({ code }) => code)).toEqual([
      "SWR5001",
      "SWR5001",
      "SWR5001",
      "SWR5001",
      "SWR5001",
    ]);
    expect(
      result.diagnostics.every(
        ({ stage, severity }) => stage === "modules" && severity === "error",
      ),
    ).toBe(true);
  });

  test("rejects unknown keys and malformed compatibility versions", () => {
    const result = parseMacroModuleManifest(
      {
        ...validManifest(),
        compiler: { minimum: "latest", maximum: "forever", extra: true },
        hostCallback: "load.js",
      },
      { sourceId },
    );
    expect(result.manifest).toBeUndefined();
    expect(result.diagnostics).toHaveLength(3);
    expect(
      result.diagnostics.map(({ messageArguments }) => messageArguments[1]),
    ).toEqual([
      "unknown field hostCallback",
      "compiler minimum and maximum must be semantic versions",
      "unknown compiler field extra",
    ]);
  });
});
