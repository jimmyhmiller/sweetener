import {
  CancellationSource,
  createResourceBudget,
  ResourceLimitError,
  type ScopeSetId,
  type SourceId,
} from "@sweetener/shared";
import { describe, expect, it } from "vitest";
import { printLossless, readSyntax } from "../src/index.js";

const sourceId = 7 as SourceId;
const scopes = 0 as ScopeSetId;

describe("delimiter reader", () => {
  it("builds an immutable file root with source origins", () => {
    const source = "const answer = call(1, [2, { value: 3 }]);\n";
    const result = readSyntax(source, { sourceId, scopes });
    expect(result.diagnostics).toEqual([]);
    expect(result.root.tag).toBe("root");
    expect(result.root.children.at(-1)?.tag).toBe("token");
    expect(result.root.children.at(-1)).toMatchObject({ kind: "end-of-file" });
    expect(printLossless(result.root)).toBe(source);
    expect(Object.isFrozen(result.root)).toBe(true);
    expect(Object.isFrozen(result.root.children)).toBe(true);
    expect(
      result.origins.selectPrimarySource(result.root.origin),
    ).toMatchObject({
      sourceId,
      span: { start: 0, end: source.length },
    });
  });

  it("groups ordinary delimiters at arbitrary nesting", () => {
    const result = readSyntax("fn(a[0], { x: (b) })", { sourceId, scopes });
    const call = result.root.children.find(
      (syntax) => syntax.tag === "group" && syntax.delimiter === "parenthesis",
    );
    expect(call).toMatchObject({ tag: "group", delimiter: "parenthesis" });
    if (call?.tag !== "group") throw new Error("expected call group");
    expect(
      call.children
        .filter((syntax) => syntax.tag === "group")
        .map((syntax) => (syntax.tag === "group" ? syntax.delimiter : "")),
    ).toEqual(["bracket", "brace"]);
    expect(printLossless(result.root)).toBe("fn(a[0], { x: (b) })");
  });

  it("recovers intervening missing closes before a matching closer", () => {
    const source = "([)]";
    const result = readSyntax(source, { sourceId, scopes });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "SWR1003",
      "SWR1002",
    ]);
    const outer = result.root.children[0];
    expect(outer).toMatchObject({ tag: "group", delimiter: "parenthesis" });
    if (outer?.tag !== "group") throw new Error("expected outer group");
    expect(outer.children[0]).toMatchObject({
      tag: "group",
      delimiter: "bracket",
      close: { tag: "missing", expectedRaw: "]" },
    });
    expect(printLossless(result.root)).toBe(source);
  });

  it("closes every unterminated group at EOF without recursion", () => {
    const depth = 2_000;
    const source = "(".repeat(depth);
    const result = readSyntax(source, {
      sourceId,
      scopes,
      budget: createResourceBudget({ maxNestingDepth: depth + 1 }),
    });
    expect(result.diagnostics).toHaveLength(depth);
    expect(
      result.diagnostics.every((diagnostic) => diagnostic.code === "SWR1003"),
    ).toBe(true);
    expect(printLossless(result.root)).toBe(source);
  });

  it("groups substitution templates while retaining compound scanner tokens", () => {
    const source = "`before ${value} after`";
    const result = readSyntax(source, { sourceId, scopes });
    expect(result.root.children[0]).toMatchObject({
      tag: "group",
      delimiter: "template",
      open: { kind: "template-head", raw: "`before ${" },
      close: { kind: "template-tail", raw: "} after`" },
    });
    expect(printLossless(result.root)).toBe(source);
  });

  it("groups JSX elements, fragments, and nested self-closing elements", () => {
    const source = "<>before<View><Icon /></View>after</>";
    const result = readSyntax(source, { sourceId, scopes, variant: "jsx" });
    expect(result.diagnostics).toEqual([]);
    expect(result.root.children[0]).toMatchObject({
      tag: "group",
      delimiter: "jsx-fragment",
    });
    expect(printLossless(result.root)).toBe(source);
  });

  it("retains unexpected closers as source tokens", () => {
    const source = "value ) next";
    const result = readSyntax(source, { sourceId, scopes });
    expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "SWR1002",
    ]);
    expect(printLossless(result.root)).toBe(source);
  });

  it("represents an empty file with only its lossless EOF token", () => {
    const result = readSyntax("", { sourceId, scopes });
    expect(result.diagnostics).toEqual([]);
    expect(result.root.span).toEqual({ start: 0, end: 0 });
    expect(result.root.children).toHaveLength(1);
    expect(result.root.children[0]).toMatchObject({
      tag: "token",
      kind: "end-of-file",
      raw: "",
    });
    expect(printLossless(result.root)).toBe("");
  });

  it("uses synthesized origins for missing close tokens", () => {
    const result = readSyntax("call(value", { sourceId, scopes });
    const group = result.root.children.find((syntax) => syntax.tag === "group");
    if (group?.tag !== "group" || group.close.tag !== "missing") {
      throw new Error("expected recovered group");
    }
    expect(group.close).toMatchObject({
      expectedRaw: ")",
      span: { start: 10, end: 10 },
    });
    expect(result.origins.get(group.close.origin)).toMatchObject({
      kind: "synthesized",
      reason: "missing-token",
    });
  });

  it("recovers unterminated template and JSX containers at EOF", () => {
    const template = readSyntax("`value ${missing", { sourceId, scopes });
    expect(
      template.diagnostics.some((diagnostic) => diagnostic.code === "SWR1003"),
    ).toBe(true);
    expect(template.root.children[0]).toMatchObject({
      tag: "group",
      delimiter: "template",
      close: { tag: "missing", expectedRaw: "`" },
    });
    expect(printLossless(template.root)).toBe("`value ${missing");

    const jsx = readSyntax("<View>content", {
      sourceId,
      scopes,
      variant: "jsx",
    });
    expect(
      jsx.diagnostics.some((diagnostic) => diagnostic.code === "SWR1003"),
    ).toBe(true);
    expect(jsx.root.children[0]).toMatchObject({
      tag: "group",
      delimiter: "jsx-element",
      close: { tag: "missing", expectedRaw: ">" },
    });
    expect(printLossless(jsx.root)).toBe("<View>content");
  });

  it("enforces input-token and nesting budgets", () => {
    expect(() =>
      readSyntax("a b", {
        sourceId,
        scopes,
        budget: createResourceBudget({ maxInputTokens: 3 }),
      }),
    ).toThrow(ResourceLimitError);
    expect(() => readSyntax("(".repeat(1_025), { sourceId, scopes })).toThrow(
      /nesting-depth/,
    );
  });

  it("honors cancellation and deadline checks", () => {
    const cancellation = new CancellationSource();
    cancellation.cancel();
    expect(() =>
      readSyntax("const value = 1", {
        sourceId,
        scopes,
        cancellation: cancellation.token,
      }),
    ).toThrow(/cancelled/);
    expect(() =>
      readSyntax("const value = 1", {
        sourceId,
        scopes,
        budget: createResourceBudget({ deadlineMs: 0 }),
      }),
    ).toThrow(/deadline/);
  });
});
