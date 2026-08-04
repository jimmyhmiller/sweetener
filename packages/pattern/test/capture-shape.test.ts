import type {
  CaptureId,
  CardinalityGroupId,
  SyntaxClassId,
} from "@sweetener/shared";
import { describe, expect, it } from "vitest";
import {
  CaptureShapeRecord,
  captureShapeDepth,
  createCapturePath,
  createLeafShape,
  createSequenceShape,
} from "../src/index.js";

const capture = 1 as CaptureId;
const nestedCapture = 2 as CaptureId;
const classId = 3 as SyntaxClassId;
const outerGroup = 4 as CardinalityGroupId;
const innerGroup = 5 as CardinalityGroupId;

describe("capture paths and shapes", () => {
  it("keeps source names and resolved IDs in immutable capture paths", () => {
    const path = createCapturePath("method", capture, [
      { name: "parameters", capture: nestedCapture },
    ]);
    expect(path).toEqual({
      rootName: "method",
      root: capture,
      fields: [{ name: "parameters", capture: nestedCapture }],
    });
    expect(Object.isFrozen(path)).toBe(true);
    expect(Object.isFrozen(path.fields)).toBe(true);
    expect(Object.isFrozen(path.fields[0])).toBe(true);
  });

  it("rejects malformed path segments", () => {
    expect(() => createCapturePath("two words", capture)).toThrow(/root name/);
    expect(() =>
      createCapturePath("method", capture, [
        { name: "field.name", capture: nestedCapture },
      ]),
    ).toThrow(/field name/);
  });

  it("derives nested repetition depth and retains each cardinality group", () => {
    const leaf = createLeafShape(classId);
    const inner = createSequenceShape({
      element: leaf,
      cardinalityGroup: innerGroup,
      minimum: 0,
      maximum: 1,
    });
    const outer = createSequenceShape({
      element: inner,
      cardinalityGroup: outerGroup,
      minimum: 1,
    });
    expect(captureShapeDepth(leaf)).toBe(0);
    expect(inner).toMatchObject({ depth: 1, minimum: 0, maximum: 1 });
    expect(outer).toMatchObject({ depth: 2, minimum: 1, maximum: undefined });
    expect(outer.element).toBe(inner);
  });

  it("validates sequence bounds and immutable elements", () => {
    const leaf = createLeafShape(classId);
    expect(() =>
      createSequenceShape({
        element: leaf,
        cardinalityGroup: outerGroup,
        minimum: -1,
      }),
    ).toThrow(/minimum/);
    expect(() =>
      createSequenceShape({
        element: leaf,
        cardinalityGroup: outerGroup,
        minimum: 2,
        maximum: 1,
      }),
    ).toThrow(/maximum/);
    expect(() =>
      createSequenceShape({
        element: { ...leaf },
        cardinalityGroup: outerGroup,
        minimum: 0,
      }),
    ).toThrow(/immutable/);
  });

  it("stores shapes by stable capture ID with deterministic persistent updates", () => {
    const leaf = createLeafShape(classId);
    const repeated = createSequenceShape({
      element: leaf,
      cardinalityGroup: outerGroup,
      minimum: 0,
    });
    const record = new CaptureShapeRecord([
      [nestedCapture, repeated],
      [capture, leaf],
    ]);
    expect(record.entries().map(([id]) => id)).toEqual([
      capture,
      nestedCapture,
    ]);
    expect(record.get(capture)).toBe(leaf);
    const updated = record.set(capture, repeated);
    expect(updated.get(capture)).toBe(repeated);
    expect(record.get(capture)).toBe(leaf);
    expect(Object.isFrozen(record)).toBe(true);
    expect(
      () =>
        new CaptureShapeRecord([
          [capture, leaf],
          [capture, repeated],
        ]),
    ).toThrow(/Duplicate/);
  });
});
