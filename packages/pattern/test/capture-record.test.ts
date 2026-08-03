import {
  createIdAllocator,
  type CaptureId,
  type CardinalityGroupId,
  type OriginId,
  type ScopeSetId,
  type SyntaxClassId,
  type SyntaxId,
} from "@sweet-rewrite/shared";
import { createSpan, createToken } from "@sweet-rewrite/syntax";
import { describe, expect, it } from "vitest";
import {
  CaptureRecord,
  captureValueDepth,
  createCaptureLeaf,
  createCaptureSequence,
} from "../src/index.js";

const syntaxIds = createIdAllocator<SyntaxId>();
const capture = 1 as CaptureId;
const otherCapture = 2 as CaptureId;
const classId = 3 as SyntaxClassId;
const origin = 4 as OriginId;
const scopes = 0 as ScopeSetId;
const outerGroup = 5 as CardinalityGroupId;
const innerGroup = 6 as CardinalityGroupId;

function token(raw: string) {
  return createToken({
    id: syntaxIds.allocate(),
    span: createSpan(0, raw.length),
    origin,
    scopes,
    kind: "identifier",
    raw,
    value: raw,
  });
}

function leaf(id = capture, raw = "value") {
  return createCaptureLeaf({
    id,
    classId,
    syntax: [token(raw)],
    origin,
  });
}

describe("capture records", () => {
  it("stores immutable leaves with syntax and nested field records", () => {
    const field = leaf(otherCapture, "field");
    const fields = new CaptureRecord([[otherCapture, field]]);
    const value = createCaptureLeaf({
      id: capture,
      classId,
      syntax: [token("whole")],
      fields,
      origin,
    });
    expect(value.fields).toBe(fields);
    expect(value.syntax[0]).toMatchObject({ raw: "whole" });
    expect(captureValueDepth(value)).toBe(0);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.syntax)).toBe(true);
  });

  it("represents optional, repeated, and nested capture dimensions", () => {
    const first = leaf(capture, "first");
    const second = leaf(capture, "second");
    const inner = createCaptureSequence({
      depth: 1,
      cardinalityGroup: innerGroup,
      elements: [first, second],
    });
    const emptyInner = createCaptureSequence({
      depth: 1,
      cardinalityGroup: innerGroup,
      elements: [],
    });
    const outer = createCaptureSequence({
      depth: 2,
      cardinalityGroup: outerGroup,
      elements: [inner, emptyInner],
    });
    expect(inner.depth).toBe(1);
    expect(outer.depth).toBe(2);
    expect(captureValueDepth(outer)).toBe(2);
    expect(Object.isFrozen(outer.elements)).toBe(true);
  });

  it("rejects mutable or dimensionally incompatible sequence elements", () => {
    const value = leaf();
    expect(() =>
      createCaptureSequence({
        depth: 2,
        cardinalityGroup: outerGroup,
        elements: [value],
      }),
    ).toThrow(/depth 1/);
    expect(() =>
      createCaptureSequence({
        depth: 0,
        cardinalityGroup: outerGroup,
        elements: [],
      }),
    ).toThrow(/positive/);
    expect(() =>
      createCaptureSequence({
        depth: 1,
        cardinalityGroup: outerGroup,
        elements: [{ ...value }],
      }),
    ).toThrow(/immutable/);
  });

  it("uses deterministic persistent record updates", () => {
    const first = leaf(capture, "first");
    const second = leaf(otherCapture, "second");
    const record = new CaptureRecord([
      [otherCapture, second],
      [capture, first],
    ]);
    expect(record.entries().map(([id]) => id)).toEqual([capture, otherCapture]);
    const replacement = leaf(capture, "replacement");
    const updated = record.set(capture, replacement);
    expect(updated.get(capture)).toBe(replacement);
    expect(record.get(capture)).toBe(first);
    expect(updated.delete(otherCapture).has(otherCapture)).toBe(false);
    expect(record.delete(99 as CaptureId)).toBe(record);
    expect(Object.isFrozen(record)).toBe(true);
  });

  it("rejects duplicate IDs and mutable values", () => {
    const value = leaf();
    expect(
      () =>
        new CaptureRecord([
          [capture, value],
          [capture, value],
        ]),
    ).toThrow(/Duplicate/);
    expect(() => new CaptureRecord([[capture, { ...value }]])).toThrow(
      /immutable/,
    );
  });
});
