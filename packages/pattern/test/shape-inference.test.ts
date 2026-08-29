import type {
  CaptureId,
  CardinalityGroupId,
  OriginId,
  RepetitionId,
  SourceId,
  SyntaxClassId,
} from "@sweetener/shared";
import { describe, expect, it } from "vitest";
import {
  createCapturePattern,
  createChoicePattern,
  createLiteralPattern,
  createOptionalPattern,
  createRepeatPattern,
  createSequencePattern,
  createTokenLiteralKey,
  inferCaptureShapes,
  type PatternNode,
  validateClassRuleFields,
} from "../src/index.js";

const sourceId = 1 as SourceId;
const origin = 2 as OriginId;
const expressionClass = 3 as SyntaxClassId;
const identifierClass = 4 as SyntaxClassId;
const group = 5 as CardinalityGroupId;
const repetition = 6 as RepetitionId;
const firstCapture = 7 as CaptureId;
const secondCapture = 8 as CaptureId;
const options = {
  sourceId,
  spanForOrigin: () => ({ start: 10, end: 20 }),
};

const capture = (id: CaptureId, name: string, classId = expressionClass) =>
  createCapturePattern({ origin, capture: id, name, classId });

describe("capture-shape inference", () => {
  it("derives nested dimensions and shared cardinality groups bottom-up", () => {
    const inner = createRepeatPattern({
      origin,
      repetition,
      body: capture(firstCapture, "value"),
      minimum: 1,
      depth: 1,
      cardinalityGroup: group,
    });
    const outer = createOptionalPattern({
      origin,
      repetition,
      body: inner,
      depth: 2,
      cardinalityGroup: 9 as CardinalityGroupId,
    });
    const result = inferCaptureShapes(outer, options);
    expect(result.diagnostics).toEqual([]);
    expect(result.shapes.get(firstCapture)).toMatchObject({
      kind: "sequence",
      depth: 2,
      minimum: 0,
      maximum: 1,
      element: {
        kind: "sequence",
        depth: 1,
        minimum: 1,
        cardinalityGroup: group,
      },
    });
    expect(result.canMatchEmpty).toBe(true);
  });

  it("reports duplicate captures in one sequence", () => {
    const pattern = createSequencePattern(origin, [
      capture(firstCapture, "value"),
      capture(firstCapture, "value"),
    ]);
    const result = inferCaptureShapes(pattern, options);
    expect(result.diagnostics.map((item) => item.code)).toEqual(["SWR2004"]);
  });

  it("accepts compatible choices and rejects missing or differently shaped captures", () => {
    const compatible = createChoicePattern(origin, [
      capture(firstCapture, "value"),
      capture(firstCapture, "value"),
    ]);
    expect(inferCaptureShapes(compatible, options).diagnostics).toEqual([]);

    const missing = createChoicePattern(origin, [
      capture(firstCapture, "value"),
      createLiteralPattern(origin, createTokenLiteralKey("identifier", "none")),
    ]);
    expect(
      inferCaptureShapes(missing, options).diagnostics.map((item) => item.code),
    ).toEqual(["SWR2005"]);

    const different = createChoicePattern(origin, [
      capture(firstCapture, "value"),
      createRepeatPattern({
        origin,
        repetition,
        body: capture(firstCapture, "value"),
        minimum: 0,
        depth: 1,
        cardinalityGroup: group,
      }),
    ]);
    expect(
      inferCaptureShapes(different, options).diagnostics.map(
        (item) => item.code,
      ),
    ).toEqual(["SWR2005"]);
  });

  it("rejects a looping body that can match without consuming input", () => {
    const empty = createSequencePattern(origin, []);
    const repeated = createRepeatPattern({
      origin,
      repetition,
      body: createOptionalPattern({
        origin,
        repetition,
        body: empty,
        depth: 1,
        cardinalityGroup: group,
      }),
      minimum: 0,
      depth: 1,
      cardinalityGroup: group,
    });
    const result = inferCaptureShapes(repeated, options);
    expect(result.diagnostics.map((item) => item.code)).toEqual(["SWR2006"]);
  });

  it("validates required syntax-class field class and repetition shapes", () => {
    const inference = inferCaptureShapes(
      createSequencePattern(origin, [
        capture(firstCapture, "name", identifierClass),
        capture(secondCapture, "parameters", identifierClass),
      ]),
      options,
    );
    const diagnostics = validateClassRuleFields(
      [
        {
          name: "name",
          classId: identifierClass,
          repeated: false,
          origin,
        },
        {
          name: "parameters",
          classId: identifierClass,
          repeated: true,
          origin,
        },
        {
          name: "result",
          classId: expressionClass,
          repeated: false,
          origin,
        },
      ],
      inference,
      options,
    );
    expect(diagnostics.map((item) => item.code)).toEqual([
      "SWR2007",
      "SWR2007",
    ]);
  });

  it("uses an explicit work stack for deeply nested patterns", () => {
    let pattern: PatternNode = capture(firstCapture, "value");
    for (let depth = 0; depth < 5_000; depth += 1) {
      pattern = createSequencePattern(origin, [pattern]);
    }
    const result = inferCaptureShapes(pattern, options);
    expect(result.diagnostics).toEqual([]);
    expect(result.shapes.has(firstCapture)).toBe(true);
  });
});
