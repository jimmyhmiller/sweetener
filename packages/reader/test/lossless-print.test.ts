import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createResourceBudget,
  type ScopeSetId,
  type SourceId,
} from "@sweet-rewrite/shared";
import {
  createSyntaxCursor,
  syntaxStructuralEquals,
  type RootSyntax,
  type Syntax,
} from "@sweet-rewrite/syntax";
import { describe, expect, it } from "vitest";
import { printLossless, readSyntax } from "../src/index.js";

const sourceId = 21 as SourceId;
const scopes = 0 as ScopeSetId;
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function syntaxCount(root: RootSyntax): number {
  let count = 0;
  const pending: Syntax[] = [...root.children];
  while (pending.length > 0) {
    const syntax = pending.pop();
    if (syntax === undefined) continue;
    count += 1;
    if (syntax.tag === "group") pending.push(...syntax.children);
  }
  return count;
}

function cursorCount(root: RootSyntax): number {
  let count = 0;
  let cursor = createSyntaxCursor(root.children);
  while (true) {
    if (cursor.atEnd) {
      const parent = cursor.exitGroup();
      if (parent === undefined) return count;
      cursor = parent;
      continue;
    }
    const syntax = cursor.peek();
    if (syntax === undefined) throw new Error("cursor lost its current syntax");
    count += 1;
    if (syntax.tag === "group") cursor = cursor.enterGroup();
    else cursor.advance();
  }
}

describe("lossless syntax printer", () => {
  it.each([
    [
      "ordinary TypeScript",
      "#!/usr/bin/env node\r\nconst x = fn<T>({ value: 0x2a }); // end\n",
      "standard",
    ],
    ["templates", "const x = `a ${`nested ${value}`} z`;\n", "standard"],
    ["JSX", "const x = <><View data-id='x'>{value}</View></>;\n", "jsx"],
    ["recovered delimiters", "([)] { value", "standard"],
    ["unterminated template", "`value ${missing", "standard"],
    ["unterminated JSX", "<View>content", "jsx"],
  ] as const)(
    "round-trips %s and rereads to equal structure",
    (_, source, variant) => {
      const first = readSyntax(source, { sourceId, scopes, variant });
      const printed = printLossless(first.root);
      const second = readSyntax(printed, { sourceId, scopes, variant });
      expect(printed).toBe(source);
      expect(syntaxStructuralEquals(second.root, first.root)).toBe(true);
      expect(second.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
        first.diagnostics.map((diagnostic) => diagnostic.code),
      );
    },
  );

  it("prints deeply nested trees iteratively", () => {
    const depth = 5_000;
    const source = `${"(".repeat(depth)}value${")".repeat(depth)}`;
    const result = readSyntax(source, {
      sourceId,
      scopes,
      budget: createResourceBudget({ maxNestingDepth: depth + 1 }),
    });
    expect(result.diagnostics).toEqual([]);
    expect(printLossless(result.root)).toBe(source);
  });

  it("round-trips every imported playground source byte-for-byte", async () => {
    const directory = path.join(repositoryRoot, "fixtures/legacy/sweetjs");
    const names = (await readdir(directory))
      .filter((name) => /\.(?:js|sjs)$/u.test(name))
      .sort();
    expect(names.length).toBeGreaterThan(0);
    const diagnosticsByFile: Record<string, readonly string[]> = {};
    for (const [index, name] of names.entries()) {
      const source = await readFile(path.join(directory, name), "utf8");
      const result = readSyntax(source, {
        sourceId: (100 + index) as SourceId,
        scopes,
      });
      expect(printLossless(result.root), name).toBe(source);
      expect(cursorCount(result.root), name).toBe(syntaxCount(result.root));
      if (result.diagnostics.length > 0) {
        diagnosticsByFile[name] = result.diagnostics.map(
          (diagnostic) => diagnostic.code,
        );
      }
    }
    expect(diagnosticsByFile).toEqual({ "adt.sweet.js": ["SWR1003"] });
  });
});
