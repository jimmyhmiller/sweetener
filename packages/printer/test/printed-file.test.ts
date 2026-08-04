import {
  createIdAllocator,
  type CaptureId,
  type ScopeSetId,
  type SourceId,
  type SyntaxId,
} from "@sweetener/shared";
import {
  createProtectedSyntax,
  createToken,
  OriginStore,
} from "@sweetener/syntax";
import { describe, expect, test } from "vitest";
import {
  createExpansionTraceEnvelope,
  printExpandedFile,
  serializeExpansionTrace,
} from "../src/index.js";

const sourceId = 920 as SourceId;
const scopes = 0 as ScopeSetId;
const syntaxIds = createIdAllocator<SyntaxId>(920);

describe("expanded TypeScript printing", () => {
  test("groups protected expressions and maps every generated range", () => {
    const origins = new OriginStore();
    const leftOrigin = origins.source(sourceId, { start: 0, end: 1 });
    const rightSource = origins.source(sourceId, { start: 4, end: 5 });
    const rightOrigin = origins.copied(1 as CaptureId, rightSource);
    const left = createToken({
      id: syntaxIds.allocate(),
      span: { start: 0, end: 1 },
      origin: leftOrigin,
      scopes,
      kind: "identifier",
      raw: "a",
      value: "a",
      leadingTrivia: [],
    });
    const right = createToken({
      id: syntaxIds.allocate(),
      span: { start: 4, end: 5 },
      origin: rightOrigin,
      scopes,
      kind: "identifier",
      raw: "b",
      value: "b",
      leadingTrivia: [],
    });
    const protectedExpression = createProtectedSyntax({
      id: syntaxIds.allocate(),
      span: { start: 0, end: 5 },
      origin: origins.composed([leftOrigin, rightOrigin]),
      scopes,
      category: "expr",
      children: [left, right],
    });
    const result = printExpandedFile({
      syntax: [protectedExpression],
      origins,
      trace: { rule: 2, macro: "pair" },
      groupProtectedExpression: ({ id }) => id === protectedExpression.id,
    });
    expect(result.text).toBe("(ab)");
    expect(result.originMap.entries).toMatchObject([
      { generatedStart: 0, generatedEnd: 1, kind: "grouping" },
      { generatedStart: 1, generatedEnd: 2, kind: "source" },
      { generatedStart: 2, generatedEnd: 3, kind: "copied" },
      { generatedStart: 3, generatedEnd: 4, kind: "grouping" },
    ]);
  });

  test("uses the host precedence decision for each protected expression", () => {
    const origins = new OriginStore();
    const origin = origins.source(sourceId, { start: 0, end: 1 });
    const token = createToken({
      id: syntaxIds.allocate(),
      span: { start: 0, end: 1 },
      origin,
      scopes,
      kind: "identifier",
      raw: "value",
      value: "value",
      leadingTrivia: [],
    });
    const expression = createProtectedSyntax({
      id: syntaxIds.allocate(),
      span: token.span,
      origin,
      scopes,
      category: "expr",
      children: [token],
    });
    expect(
      printExpandedFile({
        syntax: [expression],
        origins,
        trace: [],
        groupProtectedExpression: () => false,
      }).text,
    ).toBe("value");
  });

  test("serializes traces with stable key order and rejects unsafe values", () => {
    expect(serializeExpansionTrace({ z: 1, a: { y: 2, b: 3 } })).toBe(
      '{\n  "a": {\n    "b": 3,\n    "y": 2\n  },\n  "z": 1\n}\n',
    );
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => serializeExpansionTrace(cyclic)).toThrow(/cyclic/);
    expect(() => serializeExpansionTrace({ value: Number.NaN })).toThrow(
      /finite/,
    );
  });

  test("versions the public expansion trace envelope", () => {
    const envelope = createExpansionTraceEnvelope([{ invocationId: 1 }]);
    expect(envelope).toEqual({
      schemaVersion: 1,
      events: [{ invocationId: 1 }],
    });
    expect(Object.isFrozen(envelope)).toBe(true);
  });
});
