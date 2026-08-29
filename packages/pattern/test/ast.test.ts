import type {
  BindingId,
  CaptureId,
  CardinalityGroupId,
  OriginId,
  RepetitionId,
  SyntaxClassId,
} from "@sweetener/shared";
import { describe, expect, it } from "vitest";
import {
  createBindingLiteralKey,
  createBoundaryLookahead,
  createCapturePattern,
  createChoicePattern,
  createClassCallPattern,
  createDelimiterLookahead,
  createGroupPattern,
  createLiteralPattern,
  createOptionalPattern,
  createRepeatPattern,
  createSequencePattern,
  createTokenLiteralKey,
  createTokenLookahead,
} from "../src/index.js";

const origin = 1 as OriginId;
const capture = 2 as CaptureId;
const classId = 3 as SyntaxClassId;
const repetition = 4 as RepetitionId;
const cardinalityGroup = 5 as CardinalityGroupId;

describe("pattern AST", () => {
  it("constructs every pattern node as immutable declarative data", () => {
    const literal = createLiteralPattern(
      origin,
      createTokenLiteralKey("keyword", "return"),
    );
    const capturePattern = createCapturePattern({
      origin,
      capture,
      name: "result",
      classId,
    });
    const classCall = createClassCallPattern(origin, classId);
    const sequence = createSequencePattern(origin, [
      literal,
      capturePattern,
      classCall,
    ]);
    const group = createGroupPattern(origin, "brace", sequence);
    const choice = createChoicePattern(origin, [literal, group]);
    const separator = createLiteralPattern(
      origin,
      createTokenLiteralKey("punctuation", ","),
    );
    const repeat = createRepeatPattern({
      origin,
      repetition,
      body: choice,
      separator,
      minimum: 1,
      depth: 1,
      cardinalityGroup,
    });
    const optional = createOptionalPattern({
      origin,
      repetition,
      body: literal,
      depth: 1,
      cardinalityGroup,
    });
    const lookaheads = [
      createTokenLookahead(origin, { tokenKind: "identifier" }),
      createBoundaryLookahead(origin, "end-of-group"),
      createDelimiterLookahead(origin, "parenthesis"),
    ];

    for (const node of [
      literal,
      capturePattern,
      classCall,
      sequence,
      group,
      choice,
      repeat,
      optional,
      ...lookaheads,
    ]) {
      expect(Object.isFrozen(node)).toBe(true);
    }
    expect(Object.isFrozen(sequence.elements)).toBe(true);
    expect(Object.isFrozen(choice.alternatives)).toBe(true);
    expect(repeat).toMatchObject({ minimum: 1, maximum: undefined, depth: 1 });
  });

  it("represents spelling and binding literals distinctly", () => {
    const token = createTokenLiteralKey("identifier", "unless");
    const binding = createBindingLiteralKey(8 as BindingId, "unless");
    expect(token).toEqual({
      kind: "token",
      tokenKind: "identifier",
      raw: "unless",
    });
    expect(binding).toEqual({
      kind: "binding",
      binding: 8,
      spelling: "unless",
    });
    expect(Object.isFrozen(token)).toBe(true);
    expect(Object.isFrozen(binding)).toBe(true);
  });

  it("accepts Unicode capture names and rejects malformed names", () => {
    expect(
      createCapturePattern({
        origin,
        capture,
        name: "résultat",
        classId,
      }).name,
    ).toBe("résultat");
    for (const name of ["", "two words", "2fast", "field.name"]) {
      expect(() =>
        createCapturePattern({ origin, capture, name, classId }),
      ).toThrow(/capture name/);
    }
  });

  it("validates literal, choice, repetition, and lookahead invariants", () => {
    const literal = createLiteralPattern(
      origin,
      createTokenLiteralKey("identifier", "x"),
    );
    expect(() => createTokenLiteralKey("identifier", "")).toThrow(/empty/);
    expect(() => createTokenLiteralKey("end-of-file", "x")).toThrow(/empty/);
    expect(() => createBindingLiteralKey(1 as BindingId, "")).toThrow(/empty/);
    expect(() => createChoicePattern(origin, [literal])).toThrow(/two/);
    expect(() =>
      createRepeatPattern({
        origin,
        repetition,
        body: literal,
        minimum: 2,
        maximum: 1,
        depth: 1,
        cardinalityGroup,
      }),
    ).toThrow(/maximum/);
    expect(() =>
      createRepeatPattern({
        origin,
        repetition,
        body: literal,
        minimum: 0,
        depth: 0,
        cardinalityGroup,
      }),
    ).toThrow(/depth/);
    expect(() => createTokenLookahead(origin, {})).toThrow(/requires/);
    expect(() => createTokenLookahead(origin, { raw: "" })).toThrow(/empty/);
  });

  it("rejects mutable nested pattern objects", () => {
    const literal = createLiteralPattern(
      origin,
      createTokenLiteralKey("identifier", "x"),
    );
    const mutable = { ...literal };
    expect(() => createSequencePattern(origin, [mutable])).toThrow(/immutable/);
    expect(() =>
      createRepeatPattern({
        origin,
        repetition,
        body: mutable,
        minimum: 0,
        depth: 1,
        cardinalityGroup,
      }),
    ).toThrow(/immutable/);
  });
});
