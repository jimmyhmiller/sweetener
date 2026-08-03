import type { InvocationId, SourceId } from "@sweet-rewrite/shared";
import type {
  OriginQueryIndex,
  OriginQueryResult,
  PrintedExpandedFile,
} from "@sweet-rewrite/printer";
import { describe, expect, test } from "vitest";
import {
  explainOriginalPosition,
  expansionView,
  parseSourcePosition,
  sourceOffset,
} from "../src/index.js";

describe("expand and explain tooling", () => {
  test("parses platform-safe one-based source positions", () => {
    expect(parseSourcePosition("C:/project/file.sts:2:4")).toEqual({
      fileName: "C:/project/file.sts",
      line: 2,
      column: 4,
    });
    expect(sourceOffset("one\ntwo", 2, 2)).toBe(5);
    expect(sourceOffset("one\r\ntwo", 2, 2)).toBe(6);
    expect(() => parseSourcePosition("file.sts:0:1")).toThrow(/one-based/u);
  });

  test("returns exact expansion text and rich invocation details", () => {
    const file: PrintedExpandedFile = {
      text: "generated(value)",
      originMap: { schemaVersion: 1, entries: [] },
      trace: [],
      serializedTrace: "[]\n",
    };
    expect(expansionView(file)).toBe("generated(value)");
    const region = {
      generatedStart: 0,
      generatedEnd: 16,
      origin: 1,
      kind: "introduced",
      primary: {
        id: 1,
        kind: "source",
        sourceId: 10,
        span: { start: 4, end: 9 },
      },
      sources: [],
      expansionStack: [
        {
          invocationId: 7 as InvocationId,
          macroName: "form",
          origin: { sourceId: 10 as SourceId, start: 4, end: 9 },
        },
      ],
    } as unknown as OriginQueryResult;
    const index: OriginQueryIndex = {
      originalToGenerated: () => [region],
      generatedToOriginal: () => [region],
      classifyGenerated: () => "introduced",
      expansionStackAtGenerated: () => region.expansionStack,
      innermostInvocationAtGenerated: () => region.expansionStack.at(-1),
      regions: () => [region],
    } as unknown as OriginQueryIndex;
    const explanation = explainOriginalPosition({
      sourceId: 10 as SourceId,
      offset: 5,
      index,
      trace: [
        {
          invocationId: 7,
          parent: 2,
          category: "expr",
          phase: 1,
          binding: 11,
          attemptedRules: [{ rule: 3, status: "selected" }],
          selectedRule: 3,
          captures: [{ name: "value", values: 1 }],
          bindingsIntroduced: [{ spelling: "temporary" }],
          operations: [{ operation: "fresh" }],
          bindingResolutions: [{ spelling: "value", binding: 12 }],
          cache: "miss",
        },
      ],
      generatedNames: { temporary: "temporary_1" },
    });
    expect(explanation.regions).toEqual([region]);
    expect(explanation.invocations).toMatchObject([
      {
        invocationId: 7,
        parent: 2,
        selectedRule: 3,
        macroBinding: 11,
        captures: [{ name: "value", values: 1 }],
        bindingsIntroduced: [{ spelling: "temporary" }],
        hygieneOperations: [{ operation: "fresh" }],
        bindingResolutions: [{ spelling: "value", binding: 12 }],
        generatedNames: { temporary: "temporary_1" },
      },
    ]);
    const noMacroIndex = {
      ...index,
      originalToGenerated: () => [],
    };
    expect(
      explainOriginalPosition({
        sourceId: 10 as SourceId,
        offset: 0,
        index: noMacroIndex,
        trace: [{ invocationId: 7 }],
      }).invocations,
    ).toEqual([]);
  });
});
