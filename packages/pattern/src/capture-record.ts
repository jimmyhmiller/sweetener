import type {
  CaptureId,
  CardinalityGroupId,
  OriginId,
  SyntaxClassId,
} from "@sweetener/shared";
import { createSyntaxSequence, type SyntaxSequence } from "@sweetener/syntax";

export interface CaptureLeaf {
  readonly kind: "leaf";
  readonly id: CaptureId;
  readonly classId: SyntaxClassId;
  readonly syntax: SyntaxSequence;
  readonly fields: CaptureRecord;
  readonly origin: OriginId;
}

export interface CaptureSequence {
  readonly kind: "sequence";
  readonly depth: number;
  readonly cardinalityGroup: CardinalityGroupId;
  readonly elements: readonly CaptureValue[];
}

export type CaptureValue = CaptureLeaf | CaptureSequence;

export function captureValueDepth(value: CaptureValue): number {
  return value.kind === "leaf" ? 0 : value.depth;
}

export function createCaptureLeaf(options: {
  readonly id: CaptureId;
  readonly classId: SyntaxClassId;
  readonly syntax: SyntaxSequence;
  readonly fields?: CaptureRecord | undefined;
  readonly origin: OriginId;
}): CaptureLeaf {
  const fields = options.fields ?? CaptureRecord.empty;
  if (!Object.isFrozen(fields)) {
    throw new TypeError("Capture leaf fields must be immutable");
  }
  return Object.freeze({
    kind: "leaf",
    id: options.id,
    classId: options.classId,
    syntax: createSyntaxSequence(options.syntax),
    fields,
    origin: options.origin,
  });
}

export function createCaptureSequence(options: {
  readonly depth: number;
  readonly cardinalityGroup: CardinalityGroupId;
  readonly elements: readonly CaptureValue[];
}): CaptureSequence {
  if (!Number.isSafeInteger(options.depth) || options.depth < 1) {
    throw new RangeError(
      "Capture sequence depth must be a positive safe integer",
    );
  }
  for (const element of options.elements) {
    if (!Object.isFrozen(element)) {
      throw new TypeError("Capture sequence elements must be immutable");
    }
    if (captureValueDepth(element) !== options.depth - 1) {
      throw new RangeError(
        `Capture sequence depth ${String(options.depth)} requires elements at depth ${String(options.depth - 1)}`,
      );
    }
  }
  return Object.freeze({
    kind: "sequence",
    depth: options.depth,
    cardinalityGroup: options.cardinalityGroup,
    elements: Object.freeze([...options.elements]),
  });
}

export class CaptureRecord {
  static readonly empty = new CaptureRecord();

  readonly #values: ReadonlyMap<CaptureId, CaptureValue>;

  constructor(entries: readonly (readonly [CaptureId, CaptureValue])[] = []) {
    const values = new Map<CaptureId, CaptureValue>();
    for (const [capture, value] of entries) {
      if (values.has(capture)) {
        throw new RangeError(`Duplicate capture value ${String(capture)}`);
      }
      if (!Object.isFrozen(value)) {
        throw new TypeError("Capture values must be immutable");
      }
      values.set(capture, value);
    }
    this.#values = values;
    Object.freeze(this);
  }

  get size(): number {
    return this.#values.size;
  }

  has(capture: CaptureId): boolean {
    return this.#values.has(capture);
  }

  get(capture: CaptureId): CaptureValue | undefined {
    return this.#values.get(capture);
  }

  set(capture: CaptureId, value: CaptureValue): CaptureRecord {
    if (!Object.isFrozen(value)) {
      throw new TypeError("Capture value must be immutable");
    }
    const entries = this.entries().filter(([id]) => id !== capture);
    entries.push(Object.freeze([capture, value] as const));
    return new CaptureRecord(entries);
  }

  delete(capture: CaptureId): CaptureRecord {
    if (!this.#values.has(capture)) return this;
    return new CaptureRecord(this.entries().filter(([id]) => id !== capture));
  }

  entries(): readonly (readonly [CaptureId, CaptureValue])[] {
    return Object.freeze(
      [...this.#values.entries()]
        .sort(([left], [right]) => left - right)
        .map(([capture, value]) => Object.freeze([capture, value] as const)),
    );
  }
}
