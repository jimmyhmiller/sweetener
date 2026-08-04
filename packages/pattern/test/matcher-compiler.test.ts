import type {
  CaptureId,
  CardinalityGroupId,
  OriginId,
  ProgramCounter,
  RepetitionId,
  RuleId,
  SourceId,
  SyntaxClassId,
} from "@sweetener/shared";
import { describe, expect, it } from "vitest";
import {
  compileMatcherProgram,
  createCapturePattern,
  createChoicePattern,
  createGroupPattern,
  createLiteralPattern,
  createRepeatPattern,
  createSequencePattern,
  createTokenLiteralKey,
  inferCaptureShapes,
  serializeMatcherProgram,
  type MatcherInstruction,
  type PatternNode,
} from "../src/index.js";

const sourceId = 1 as SourceId;
const origin = 2 as OriginId;
const rule = 3 as RuleId;
const classId = 4 as SyntaxClassId;
const captureId = 5 as CaptureId;
const repetition = 6 as RepetitionId;
const cardinalityGroup = 7 as CardinalityGroupId;
const inferenceOptions = {
  sourceId,
  spanForOrigin: () => ({ start: 0, end: 1 }),
};

const literal = (raw: string) =>
  createLiteralPattern(origin, createTokenLiteralKey("punctuation", raw));

function compile(pattern: PatternNode) {
  return compileMatcherProgram(pattern, {
    rule,
    inference: inferCaptureShapes(pattern, inferenceOptions),
  });
}

function referencedPcs(instruction: MatcherInstruction): readonly number[] {
  switch (instruction.op) {
    case "literal":
    case "class":
    case "lookahead":
      return [instruction.next];
    case "group":
      return [instruction.body, instruction.next];
    case "split":
      return [instruction.first, instruction.second];
    case "repeat-enter":
      return [instruction.body, instruction.separator, instruction.exit].filter(
        (value): value is ProgramCounter => value !== undefined,
      );
    case "repeat-commit":
      return [instruction.loop, instruction.exit];
    case "group-accept":
    case "accept":
      return [];
  }
}

describe("matcher-program compiler", () => {
  it("assigns capture slots by stable capture ID and emits deterministic bytes", () => {
    const pattern = createSequencePattern(origin, [
      createCapturePattern({
        origin,
        capture: captureId,
        name: "value",
        classId,
      }),
      literal(";"),
    ]);
    const first = compile(pattern);
    const second = compile(pattern);
    expect(first.captureSlots).toEqual([
      { slot: 0, capture: captureId, name: "value", depth: 0 },
    ]);
    expect(first.instructions[first.entry]).toMatchObject({
      op: "class",
      capture: 0,
    });
    expect(serializeMatcherProgram(first)).toBe(
      serializeMatcherProgram(second),
    );
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.instructions)).toBe(true);
    expect(first.instructions.every(Object.isFrozen)).toBe(true);
  });

  it("lowers groups and source-ordered choices with explicit control flow", () => {
    const choice = createChoicePattern(origin, [literal("a"), literal("b")]);
    const pattern = createGroupPattern(
      origin,
      "parenthesis",
      createSequencePattern(origin, [choice]),
    );
    const program = compile(pattern);
    expect(program.instructions[program.entry]).toMatchObject({
      op: "group",
      delimiter: "parenthesis",
    });
    expect(program.instructions.some((item) => item.op === "split")).toBe(true);
    expect(
      program.instructions.some((item) => item.op === "group-accept"),
    ).toBe(true);
  });

  it("lowers separated repetition with stable repetition identity and bounds", () => {
    const pattern = createRepeatPattern({
      origin,
      repetition,
      body: literal("item"),
      separator: literal(","),
      minimum: 1,
      maximum: 4,
      depth: 1,
      cardinalityGroup,
    });
    const program = compile(pattern);
    expect(program.instructions[program.entry]).toMatchObject({
      op: "repeat-enter",
      repetition,
      minimum: 1,
      maximum: 4,
    });
    expect(program.instructions).toContainEqual(
      expect.objectContaining({ op: "repeat-commit", repetition }),
    );
  });

  it("produces only in-bounds program-counter references", () => {
    const pattern = createSequencePattern(origin, [
      literal("start"),
      createRepeatPattern({
        origin,
        repetition,
        body: literal("body"),
        minimum: 0,
        depth: 1,
        cardinalityGroup,
      }),
      literal("end"),
    ]);
    const program = compile(pattern);
    for (const instruction of program.instructions) {
      for (const pc of referencedPcs(instruction)) {
        expect(pc).toBeGreaterThanOrEqual(0);
        expect(pc).toBeLessThan(program.instructions.length);
      }
    }
  });

  it("rejects invalid inference and compiles deep trees without recursion", () => {
    const duplicate = createSequencePattern(origin, [
      createCapturePattern({ origin, capture: captureId, name: "x", classId }),
      createCapturePattern({ origin, capture: captureId, name: "x", classId }),
    ]);
    expect(() => compile(duplicate)).toThrow(/shape diagnostics/);

    let deep: PatternNode = literal("leaf");
    for (let index = 0; index < 5_000; index += 1) {
      deep = createSequencePattern(origin, [deep]);
    }
    const program = compile(deep);
    expect(program.instructions[program.entry]).toMatchObject({
      op: "literal",
    });
  });
});
