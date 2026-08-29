import type {
  CaptureId,
  Diagnostic,
  OriginId,
  SourceId,
  SyntaxClassId,
} from "@sweetener/shared";
import type { Span } from "@sweetener/syntax";
import type { PatternNode } from "./ast.js";
import {
  CaptureShapeRecord,
  createLeafShape,
  createSequenceShape,
  type CaptureShape,
  type LeafShape,
} from "./capture-shape.js";
import {
  duplicateCaptureCode,
  incompatibleClassFieldsCode,
  inconsistentAlternativeCode,
  patternDiagnosticRegistry,
  zeroWidthRepetitionCode,
} from "./diagnostics.js";

export interface CaptureShapeBinding {
  readonly capture: CaptureId;
  readonly name: string;
  readonly origin: OriginId;
  readonly shape: CaptureShape;
}

export interface InferCaptureShapesOptions {
  readonly sourceId: SourceId;
  readonly spanForOrigin: (origin: OriginId) => Span;
  readonly fieldsForClass?:
    ((classId: SyntaxClassId) => CaptureShapeRecord | undefined) | undefined;
}

export interface CaptureShapeInferenceResult {
  readonly shapes: CaptureShapeRecord;
  readonly bindings: readonly CaptureShapeBinding[];
  readonly diagnostics: readonly Diagnostic[];
  readonly canMatchEmpty: boolean;
}

export interface ClassFieldRequirement {
  readonly name: string;
  readonly classId: SyntaxClassId;
  readonly repeated: boolean;
  /** An optional field may be left unbound by a rule that does not match it. */
  readonly optional?: boolean | undefined;
  readonly origin: OriginId;
}

interface State {
  readonly bindings: ReadonlyMap<CaptureId, CaptureShapeBinding>;
  readonly nullable: boolean;
}

function emptyState(nullable: boolean): State {
  return { bindings: new Map(), nullable };
}

function shapeRecordsEqual(
  left: CaptureShapeRecord,
  right: CaptureShapeRecord,
): boolean {
  const leftEntries = left.entries();
  const rightEntries = right.entries();
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(
      ([capture, shape], index) =>
        capture === rightEntries[index]?.[0] &&
        shapeEqual(shape, rightEntries[index]![1]),
    )
  );
}

function leafFieldsEqual(left: LeafShape, right: LeafShape): boolean {
  return shapeRecordsEqual(left.fields, right.fields);
}

export function shapeEqual(left: CaptureShape, right: CaptureShape): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "leaf" && right.kind === "leaf") {
    return left.classId === right.classId && leafFieldsEqual(left, right);
  }
  if (left.kind === "sequence" && right.kind === "sequence") {
    return (
      left.depth === right.depth &&
      left.cardinalityGroup === right.cardinalityGroup &&
      left.minimum === right.minimum &&
      left.maximum === right.maximum &&
      shapeEqual(left.element, right.element)
    );
  }
  return false;
}

function leafAtBase(shape: CaptureShape): LeafShape {
  let current = shape;
  while (current.kind === "sequence") current = current.element;
  return current;
}

export function inferCaptureShapes(
  pattern: PatternNode,
  options: InferCaptureShapesOptions,
): CaptureShapeInferenceResult {
  const diagnostics: Diagnostic[] = [];
  const states = new Map<PatternNode, State>();
  const stack: { readonly node: PatternNode; readonly visited: boolean }[] = [
    { node: pattern, visited: false },
  ];

  const diagnostic = (
    code:
      | typeof duplicateCaptureCode
      | typeof inconsistentAlternativeCode
      | typeof zeroWidthRepetitionCode
      | typeof incompatibleClassFieldsCode,
    origin: OriginId,
    name?: string,
  ): void => {
    const span = options.spanForOrigin(origin);
    diagnostics.push(
      patternDiagnosticRegistry.create(code, {
        primaryOrigin: {
          sourceId: options.sourceId,
          start: span.start,
          end: span.end,
          originId: origin,
        },
        messageArguments: name === undefined ? [] : [name],
      }),
    );
  };

  const mergeSequence = (
    nodes: readonly PatternNode[],
    origin: OriginId,
  ): State => {
    const bindings = new Map<CaptureId, CaptureShapeBinding>();
    let nullable = true;
    for (const node of nodes) {
      const state = states.get(node);
      if (state === undefined) throw new Error("Missing inferred child state");
      nullable &&= state.nullable;
      for (const [capture, binding] of state.bindings) {
        const previous = bindings.get(capture);
        if (previous !== undefined) {
          diagnostic(duplicateCaptureCode, origin, binding.name);
          continue;
        }
        bindings.set(capture, binding);
      }
    }
    return { bindings, nullable };
  };

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) break;
    const node = frame.node;
    if (!frame.visited) {
      stack.push({ node, visited: true });
      switch (node.kind) {
        case "sequence":
          for (let index = node.elements.length - 1; index >= 0; index -= 1) {
            stack.push({ node: node.elements[index]!, visited: false });
          }
          break;
        case "choice":
          for (
            let index = node.alternatives.length - 1;
            index >= 0;
            index -= 1
          ) {
            stack.push({ node: node.alternatives[index]!, visited: false });
          }
          break;
        case "group":
        case "repeat":
        case "optional":
          stack.push({ node: node.body, visited: false });
          break;
        default:
          break;
      }
      continue;
    }

    switch (node.kind) {
      case "literal":
      case "class-call":
        states.set(node, emptyState(false));
        break;
      case "lookahead":
        states.set(node, emptyState(true));
        break;
      case "capture": {
        const fields =
          options.fieldsForClass?.(node.classId) ?? CaptureShapeRecord.empty;
        const shape = createLeafShape(node.classId, fields);
        states.set(node, {
          bindings: new Map([
            [
              node.capture,
              Object.freeze({
                capture: node.capture,
                name: node.name,
                origin: node.origin,
                shape,
              }),
            ],
          ]),
          nullable: false,
        });
        break;
      }
      case "group": {
        const child = states.get(node.body);
        if (child === undefined) throw new Error("Missing group body state");
        states.set(node, { bindings: child.bindings, nullable: false });
        break;
      }
      case "sequence":
        states.set(node, mergeSequence(node.elements, node.origin));
        break;
      case "repeat":
      case "optional": {
        const child = states.get(node.body);
        if (child === undefined)
          throw new Error("Missing repetition body state");
        if (node.kind === "repeat" && child.nullable)
          diagnostic(zeroWidthRepetitionCode, node.origin);
        const minimum = node.kind === "repeat" ? node.minimum : 0;
        const maximum = node.kind === "repeat" ? node.maximum : 1;
        const bindings = new Map<CaptureId, CaptureShapeBinding>();
        for (const [capture, binding] of child.bindings) {
          const shape = createSequenceShape({
            element: binding.shape,
            cardinalityGroup: node.cardinalityGroup,
            minimum,
            maximum,
          });
          bindings.set(capture, Object.freeze({ ...binding, shape }));
        }
        states.set(node, {
          bindings,
          nullable:
            node.kind === "optional" || node.minimum === 0 || child.nullable,
        });
        break;
      }
      case "choice": {
        const first = states.get(node.alternatives[0]!);
        if (first === undefined) throw new Error("Missing alternative state");
        const bindings = new Map(first.bindings);
        for (let index = 1; index < node.alternatives.length; index += 1) {
          const alternative = states.get(node.alternatives[index]!);
          if (alternative === undefined)
            throw new Error("Missing alternative state");
          const captures = new Set([
            ...bindings.keys(),
            ...alternative.bindings.keys(),
          ]);
          for (const capture of captures) {
            const expected = bindings.get(capture);
            const actual = alternative.bindings.get(capture);
            const name = expected?.name ?? actual?.name ?? "unknown";
            if (expected === undefined || actual === undefined) {
              diagnostic(inconsistentAlternativeCode, node.origin, name);
            } else if (!shapeEqual(expected.shape, actual.shape)) {
              const expectedLeaf = leafAtBase(expected.shape);
              const actualLeaf = leafAtBase(actual.shape);
              diagnostic(
                expectedLeaf.classId === actualLeaf.classId &&
                  !leafFieldsEqual(expectedLeaf, actualLeaf)
                  ? incompatibleClassFieldsCode
                  : inconsistentAlternativeCode,
                node.origin,
                name,
              );
            }
          }
        }
        states.set(node, {
          bindings,
          nullable: node.alternatives.some(
            (alternative) => states.get(alternative)?.nullable === true,
          ),
        });
        break;
      }
    }
  }

  const state = states.get(pattern);
  if (state === undefined) throw new Error("Pattern inference did not finish");
  const bindings = Object.freeze(
    [...state.bindings.values()].sort(
      (left, right) => left.capture - right.capture,
    ),
  );
  return Object.freeze({
    shapes: new CaptureShapeRecord(
      bindings.map((binding) => [binding.capture, binding.shape] as const),
    ),
    bindings,
    diagnostics: Object.freeze(diagnostics),
    canMatchEmpty: state.nullable,
  });
}

export function validateClassRuleFields(
  fields: readonly ClassFieldRequirement[],
  inference: CaptureShapeInferenceResult,
  options: Pick<InferCaptureShapesOptions, "sourceId" | "spanForOrigin">,
): readonly Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const bindings = new Map(
    inference.bindings.map((binding) => [binding.name, binding]),
  );
  for (const field of fields) {
    const binding = bindings.get(field.name);
    if (binding === undefined && field.optional === true) continue;
    const leaf = binding === undefined ? undefined : leafAtBase(binding.shape);
    const repeated = binding?.shape.kind === "sequence";
    if (
      binding !== undefined &&
      leaf?.classId === field.classId &&
      repeated === field.repeated
    )
      continue;
    const span = options.spanForOrigin(field.origin);
    diagnostics.push(
      patternDiagnosticRegistry.create(incompatibleClassFieldsCode, {
        primaryOrigin: {
          sourceId: options.sourceId,
          start: span.start,
          end: span.end,
          originId: field.origin,
        },
        messageArguments: [field.name],
      }),
    );
  }
  return Object.freeze(diagnostics);
}
