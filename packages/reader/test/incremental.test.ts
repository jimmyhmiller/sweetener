import type { ScopeSetId, SourceId } from "@sweet-rewrite/shared";
import { createSpan, syntaxStructuralEquals } from "@sweet-rewrite/syntax";
import { describe, expect, it } from "vitest";
import {
  createReader,
  printLossless,
  type SourceInput,
  type TextChangeRange,
} from "../src/index.js";

const sourceId = 31 as SourceId;
const scopes = 0 as ScopeSetId;

function source(text: string, version: string): SourceInput {
  return { sourceId, fileName: "module.sts", text, version };
}

function change(
  start: number,
  end: number,
  newLength: number,
): TextChangeRange {
  return { span: createSpan(start, end), newLength };
}

describe("incremental reader baseline", () => {
  it("exposes immutable clean read results", () => {
    const input = source("const value = 1;\n", "1");
    const file = createReader().read(input, { scopes });
    expect(file.source).toEqual(input);
    expect(file.source).not.toBe(input);
    expect(file.incremental).toBeUndefined();
    expect(printLossless(file.root)).toBe(input.text);
    expect(Object.isFrozen(file)).toBe(true);
    expect(Object.isFrozen(file.source)).toBe(true);
  });

  it("updates through a clean read with explicit zero-reuse metadata", () => {
    const reader = createReader();
    const first = reader.read(source("const value = 1;\n", "1"), { scopes });
    const nextInput = source("const value = answer();\n", "2");
    const updated = reader.update(first, nextInput, change(14, 15, 8), {
      scopes,
    });
    expect(printLossless(updated.root)).toBe(nextInput.text);
    expect(updated.incremental).toEqual({
      strategy: "clean-read",
      previousVersion: "1",
      change: { span: { start: 14, end: 15 }, newLength: 8 },
      reusedSyntaxNodes: 0,
    });
    expect(Object.isFrozen(updated.incremental)).toBe(true);
    expect(Object.isFrozen(updated.incremental?.change)).toBe(true);
  });

  it.each([
    ["replacement", "let value = one;", "let value = two;", change(12, 15, 3)],
    ["insertion", "fn(a)", "fn(a, b)", change(4, 4, 3)],
    ["deletion", "fn(a, b)", "fn(a)", change(4, 7, 0)],
  ] as const)(
    "matches an independent clean read after %s",
    (_, before, after, range) => {
      const reader = createReader();
      const previous = reader.read(source(before, "1"), { scopes });
      const updated = reader.update(previous, source(after, "2"), range, {
        scopes,
      });
      const clean = createReader().read(source(after, "2"), { scopes });
      expect(syntaxStructuralEquals(updated.root, clean.root)).toBe(true);
      expect(updated.diagnostics).toEqual(clean.diagnostics);
      expect(updated.typescriptVersion).toBe(clean.typescriptVersion);
    },
  );

  it("supports chained updates and JSX lexical options", () => {
    const reader = createReader();
    const first = reader.read(source("<View />", "1"), {
      scopes,
      variant: "jsx",
    });
    const second = reader.update(
      first,
      source("<View>text</View>", "2"),
      change(5, 7, 11),
      { scopes, variant: "jsx" },
    );
    const third = reader.update(
      second,
      source("<View>next</View>", "3"),
      change(6, 10, 4),
      { scopes, variant: "jsx" },
    );
    expect(printLossless(third.root)).toBe("<View>next</View>");
    expect(third.incremental?.previousVersion).toBe("2");
  });

  it("rejects inaccurate or cross-source change descriptions", () => {
    const reader = createReader();
    const previous = reader.read(source("abcdef", "1"), { scopes });
    expect(() =>
      reader.update(previous, source("abXYef", "2"), change(2, 4, 1), {
        scopes,
      }),
    ).toThrow(/length/);
    expect(() =>
      reader.update(previous, source("xbXYef", "2"), change(2, 4, 2), {
        scopes,
      }),
    ).toThrow(/prefix/);
    expect(() =>
      reader.update(previous, source("abXYex", "2"), change(2, 4, 2), {
        scopes,
      }),
    ).toThrow(/suffix/);
    expect(() =>
      reader.update(previous, source("abcdef", "2"), change(4, 7, 2), {
        scopes,
      }),
    ).toThrow(/exceeds/);
    expect(() =>
      reader.update(previous, source("abcdef", "2"), change(2, 4, -1), {
        scopes,
      }),
    ).toThrow(/newLength/);
    expect(() =>
      reader.update(
        previous,
        { ...source("abcdef", "2"), sourceId: 99 as SourceId },
        change(0, 0, 0),
        { scopes },
      ),
    ).toThrow(/source ID/);
    expect(() =>
      reader.update(
        previous,
        { ...source("abcdef", "2"), fileName: "other.sts" },
        change(0, 0, 0),
        { scopes },
      ),
    ).toThrow(/file name/);
  });

  it("rejects empty file names and versions", () => {
    const reader = createReader();
    expect(() =>
      reader.read({ ...source("", "1"), fileName: "" }, { scopes }),
    ).toThrow(/file name/);
    expect(() => reader.read(source("", ""), { scopes })).toThrow(/version/);
  });
});
