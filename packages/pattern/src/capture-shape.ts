import type {
  CaptureId,
  CardinalityGroupId,
  SyntaxClassId,
} from "@sweet-rewrite/shared";

export interface CapturePathSegment {
  readonly name: string;
  readonly capture: CaptureId;
}

export interface CapturePath {
  readonly rootName: string;
  readonly root: CaptureId;
  readonly fields: readonly CapturePathSegment[];
}

export interface LeafShape {
  readonly kind: "leaf";
  readonly classId: SyntaxClassId;
  readonly fields: CaptureShapeRecord;
}

export interface SequenceShape {
  readonly kind: "sequence";
  readonly depth: number;
  readonly element: CaptureShape;
  readonly cardinalityGroup: CardinalityGroupId;
  readonly minimum: number;
  readonly maximum: number | undefined;
}

export type CaptureShape = LeafShape | SequenceShape;

const pathNamePattern = /^[$_\p{ID_Start}][$_\u200c\u200d\p{ID_Continue}]*$/u;

function validateName(name: string, field: string): void {
  if (!pathNamePattern.test(name)) {
    throw new RangeError(`Invalid ${field}: ${name}`);
  }
}

function validateBound(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer`);
  }
}

export function createCapturePath(
  rootName: string,
  root: CaptureId,
  fields: readonly CapturePathSegment[] = [],
): CapturePath {
  validateName(rootName, "capture path root name");
  const normalized = fields.map((field) => {
    validateName(field.name, "capture path field name");
    return Object.freeze({ ...field });
  });
  return Object.freeze({
    rootName,
    root,
    fields: Object.freeze(normalized),
  });
}

export function captureShapeDepth(shape: CaptureShape): number {
  return shape.kind === "leaf" ? 0 : shape.depth;
}

export function createLeafShape(
  classId: SyntaxClassId,
  fields: CaptureShapeRecord = CaptureShapeRecord.empty,
): LeafShape {
  if (!Object.isFrozen(fields)) {
    throw new TypeError("Leaf shape fields must be immutable");
  }
  return Object.freeze({ kind: "leaf", classId, fields });
}

export function createSequenceShape(options: {
  readonly element: CaptureShape;
  readonly cardinalityGroup: CardinalityGroupId;
  readonly minimum: number;
  readonly maximum?: number | undefined;
}): SequenceShape {
  if (!Object.isFrozen(options.element)) {
    throw new TypeError("Sequence element shape must be immutable");
  }
  validateBound(options.minimum, "Sequence minimum");
  if (options.maximum !== undefined) {
    validateBound(options.maximum, "Sequence maximum");
    if (options.maximum < options.minimum) {
      throw new RangeError("Sequence maximum must be at least its minimum");
    }
  }
  return Object.freeze({
    kind: "sequence",
    depth: captureShapeDepth(options.element) + 1,
    element: options.element,
    cardinalityGroup: options.cardinalityGroup,
    minimum: options.minimum,
    maximum: options.maximum,
  });
}

export class CaptureShapeRecord {
  static readonly empty = new CaptureShapeRecord();

  readonly #values: ReadonlyMap<CaptureId, CaptureShape>;

  constructor(entries: readonly (readonly [CaptureId, CaptureShape])[] = []) {
    const values = new Map<CaptureId, CaptureShape>();
    for (const [capture, shape] of entries) {
      if (values.has(capture)) {
        throw new RangeError(`Duplicate capture shape ${String(capture)}`);
      }
      if (!Object.isFrozen(shape)) {
        throw new TypeError("Capture shapes must be immutable");
      }
      values.set(capture, shape);
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

  get(capture: CaptureId): CaptureShape | undefined {
    return this.#values.get(capture);
  }

  set(capture: CaptureId, shape: CaptureShape): CaptureShapeRecord {
    if (!Object.isFrozen(shape)) {
      throw new TypeError("Capture shape must be immutable");
    }
    const entries = this.entries().filter(([id]) => id !== capture);
    entries.push(Object.freeze([capture, shape] as const));
    return new CaptureShapeRecord(entries);
  }

  entries(): readonly (readonly [CaptureId, CaptureShape])[] {
    return Object.freeze(
      [...this.#values.entries()]
        .sort(([left], [right]) => left - right)
        .map(([capture, shape]) => Object.freeze([capture, shape] as const)),
    );
  }
}
