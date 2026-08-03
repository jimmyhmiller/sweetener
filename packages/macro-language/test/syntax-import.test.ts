import { readSyntax } from "@sweet-rewrite/reader";
import type { ScopeSetId, SourceId } from "@sweet-rewrite/shared";
import { describe, expect, test } from "vitest";
import { parseCompileTimeSyntaxImports } from "../src/index.js";

const sourceId = 204 as SourceId;
const scopes = 0 as ScopeSetId;

function parse(source: string) {
  const read = readSyntax(source, { sourceId, scopes });
  expect(read.diagnostics).toEqual([]);
  return parseCompileTimeSyntaxImports(read.root, { sourceId });
}

describe("compile-time syntax imports", () => {
  test("parses named and aliased macro bindings without claiming runtime imports", () => {
    const result = parse(`
      import { doForm, optional as maybe, (|>) } from "./language.sts" for syntax;
      import { runtime } from "./runtime.js";
      const answer = doForm(42);
    `);

    expect(result.diagnostics).toEqual([]);
    expect(result.imports).toMatchObject([
      {
        specifier: "./language.sts",
        bindings: [
          { imported: "doForm", local: "doForm" },
          { imported: "optional", local: "maybe" },
          { imported: "|>", local: "|>" },
        ],
      },
    ]);
  });

  test("reports malformed phase-qualified imports structurally", () => {
    const result = parse(`import forms from "./language.sts" for syntax;`);

    expect(result.imports).toEqual([]);
    expect(result.diagnostics).toMatchObject([
      { code: "SWR2004", severity: "error" },
    ]);
  });

  test("records explicit core-form interception opt-in", () => {
    const result = parse(
      `import { if, function } from "./core.sts" for syntax shadows core;`,
    );

    expect(result.diagnostics).toEqual([]);
    expect(result.imports).toMatchObject([
      {
        specifier: "./core.sts",
        shadowsCore: true,
        bindings: [
          { imported: "if", local: "if" },
          { imported: "function", local: "function" },
        ],
      },
    ]);
  });
});
