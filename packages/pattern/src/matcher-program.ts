import type {
  CaptureId,
  CaptureSlotId,
  CardinalityGroupId,
  OriginId,
  ProgramCounter,
  RepetitionId,
  RuleId,
  SyntaxClassId,
} from "@sweet-rewrite/shared";
import type { DelimiterKind } from "@sweet-rewrite/syntax";
import type { LiteralKey, LookaheadPredicate } from "./ast.js";

interface InstructionBase {
  readonly origin: OriginId;
}

export type MatcherInstruction =
  | (InstructionBase & {
      readonly op: "literal";
      readonly literal: LiteralKey;
      readonly next: ProgramCounter;
    })
  | (InstructionBase & {
      readonly op: "class";
      readonly classId: SyntaxClassId;
      readonly capture: CaptureSlotId | undefined;
      readonly next: ProgramCounter;
    })
  | (InstructionBase & {
      readonly op: "group";
      readonly delimiter: DelimiterKind;
      readonly body: ProgramCounter;
      readonly next: ProgramCounter;
    })
  | (InstructionBase & {
      readonly op: "lookahead";
      readonly predicate: LookaheadPredicate;
      readonly next: ProgramCounter;
    })
  | (InstructionBase & {
      readonly op: "split";
      readonly first: ProgramCounter;
      readonly second: ProgramCounter;
    })
  | (InstructionBase & {
      readonly op: "repeat-enter";
      readonly repetition: RepetitionId;
      readonly cardinalityGroup: CardinalityGroupId;
      readonly body: ProgramCounter;
      readonly separator: ProgramCounter | undefined;
      readonly exit: ProgramCounter;
      readonly minimum: number;
      readonly maximum: number | undefined;
      readonly captures: readonly CaptureSlotId[];
    })
  | (InstructionBase & {
      readonly op: "repeat-commit";
      readonly repetition: RepetitionId;
      readonly loop: ProgramCounter;
      readonly exit: ProgramCounter;
    })
  | (InstructionBase & { readonly op: "group-accept" })
  | (InstructionBase & { readonly op: "accept" });

export interface CaptureSlot {
  readonly slot: CaptureSlotId;
  readonly capture: CaptureId;
  readonly name: string;
  readonly depth: number;
}

export interface MatcherProgram {
  readonly rule: RuleId;
  readonly entry: ProgramCounter;
  readonly instructions: readonly MatcherInstruction[];
  readonly captureSlots: readonly CaptureSlot[];
}
