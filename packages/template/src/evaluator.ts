import type {
  CaptureLeaf,
  CapturePath,
  CaptureRecord,
  CaptureValue,
} from "@sweet-rewrite/pattern";
import {
  createResourceBudget,
  neverCancelled,
  ResourceTracker,
  type CancellationToken,
  type CaptureId,
  type OriginId,
  type ResourceBudget,
  type ScopeSetId,
} from "@sweet-rewrite/shared";
import type {
  DelimiterKind,
  MissingToken,
  SyntaxSequence,
  TokenSyntax,
} from "@sweet-rewrite/syntax";
import type {
  ConditionalPredicate,
  HygieneOperation,
  SequenceTemplate,
  TemplateNode,
} from "./ast.js";

export interface EvaluatedSyntax {
  readonly kind: "syntax";
  readonly origin: OriginId;
  readonly syntax: SyntaxSequence;
  readonly source: "template" | "capture";
  readonly capture: CaptureId | undefined;
}

export interface EvaluatedGroup {
  readonly kind: "group";
  readonly origin: OriginId;
  readonly delimiter: DelimiterKind;
  readonly body: readonly EvaluatedTemplate[];
  readonly open: TokenSyntax | undefined;
  readonly close: TokenSyntax | MissingToken | undefined;
  readonly scopes: ScopeSetId | undefined;
}

export type EvaluatedOperation =
  | {
      readonly kind: "operation";
      readonly origin: OriginId;
      readonly operation: "fresh";
      readonly hint: string;
      readonly ordinal: number;
    }
  | {
      readonly kind: "operation";
      readonly origin: OriginId;
      readonly operation: "metavar";
      readonly hint: string;
      readonly indices: readonly number[];
    }
  | {
      readonly kind: "operation";
      readonly origin: OriginId;
      readonly operation: "callsite" | "definition" | "capture" | "trim";
      readonly syntax: SyntaxSequence;
      readonly capture: CaptureId;
    }
  | {
      readonly kind: "operation";
      readonly origin: OriginId;
      readonly operation: "text";
      readonly text: string;
    }
  | {
      readonly kind: "operation";
      readonly origin: OriginId;
      readonly operation: "index" | "count";
      readonly value: number;
    };

export type EvaluatedTemplate =
  EvaluatedSyntax | EvaluatedGroup | EvaluatedOperation;

export interface TemplateOperationTrace {
  readonly operation: HygieneOperation["kind"];
  readonly origin: OriginId;
  readonly capture: CaptureId | undefined;
  readonly repetitionIndices: readonly number[];
  readonly detail: string | number | undefined;
}

export interface EvaluateTemplateOptions {
  readonly captures: CaptureRecord;
  readonly selectedAlternatives?: ReadonlyMap<CaptureId, string> | undefined;
  readonly budget?: Partial<ResourceBudget> | undefined;
  readonly tracker?: ResourceTracker | undefined;
  readonly cancellation?: CancellationToken | undefined;
}

export interface EvaluateTemplateResult {
  readonly output: readonly EvaluatedTemplate[];
  readonly templateSteps: number;
  readonly trace: readonly TemplateOperationTrace[];
}

export class TemplateCardinalityError extends Error {
  override readonly name = "TemplateCardinalityError";

  constructor(
    readonly depth: number,
    readonly lengths: readonly number[],
  ) {
    super(
      `Template repetition at depth ${String(depth)} has cardinalities ${lengths.join(", ")}`,
    );
  }
}

export class TemplateCaptureError extends Error {
  override readonly name = "TemplateCaptureError";

  constructor(message: string) {
    super(message);
  }
}

function resolvePath(
  captures: CaptureRecord,
  path: CapturePath,
  indices: readonly number[],
): CaptureValue {
  const initial = captures.get(path.root);
  if (initial === undefined) {
    throw new TemplateCaptureError(`Missing capture $${path.rootName}`);
  }
  let value: CaptureValue = initial;
  let fieldIndex = 0;
  let dimension = 0;
  while (true) {
    if (value.kind === "sequence") {
      if (dimension >= indices.length) return value;
      const index = indices[dimension]!;
      const selected = value.elements[index];
      if (selected === undefined) {
        throw new TemplateCaptureError(
          `Capture $${path.rootName} has no element ${String(index)} at dimension ${String(dimension + 1)}`,
        );
      }
      value = selected;
      dimension += 1;
      continue;
    }
    const field = path.fields[fieldIndex];
    if (field === undefined) return value;
    const selected = value.fields.get(field.capture);
    if (selected === undefined) {
      throw new TemplateCaptureError(
        `Capture $${path.rootName} has no field ${field.name}`,
      );
    }
    value = selected;
    fieldIndex += 1;
  }
}

function finalCaptureId(path: CapturePath): CaptureId {
  return path.fields.at(-1)?.capture ?? path.root;
}

function isPresent(value: CaptureValue): boolean {
  return value.kind === "leaf" || value.elements.length > 0;
}

function selectFields(
  initial: CaptureValue,
  fields: readonly { readonly capture: CaptureId; readonly name: string }[],
  label: string,
): CaptureValue {
  let value = initial;
  for (const field of fields) {
    if (value.kind !== "leaf") {
      throw new TemplateCaptureError(
        `${label} requires an element before field ${field.name}`,
      );
    }
    const selected = value.fields.get(field.capture);
    if (selected === undefined) {
      throw new TemplateCaptureError(`${label} has no field ${field.name}`);
    }
    value = selected;
  }
  return value;
}

function stableSyntaxText(syntax: SyntaxSequence): string {
  type Item = SyntaxSequence[number] | string;
  const pending: Item[] = [...syntax].reverse();
  const chunks: string[] = [];
  while (pending.length > 0) {
    const item = pending.pop()!;
    if (typeof item === "string") {
      chunks.push(item);
      continue;
    }
    if (item.tag === "token") {
      for (let index = item.trailingTrivia.length - 1; index >= 0; index -= 1) {
        pending.push(item.trailingTrivia[index]!.raw);
      }
      pending.push(item.raw);
      for (let index = item.leadingTrivia.length - 1; index >= 0; index -= 1) {
        pending.push(item.leadingTrivia[index]!.raw);
      }
    } else if (item.tag === "group") {
      if (item.close.tag === "token") pending.push(item.close);
      pending.push(...[...item.children].reverse());
      pending.push(item.open);
    } else {
      pending.push(...[...item.children].reverse());
    }
  }
  // Captures retain call-site trivia so ordinary substitution can stay
  // lossless. Text conversion is a semantic operation, however: indentation
  // before or after the captured form must not become part of a generated
  // identifier, tag, or property name. Preserve internal trivia and normalize
  // only the capture boundary.
  return chunks.join("").trim();
}

interface FoldLocals {
  readonly accumulator: readonly EvaluatedTemplate[];
  readonly element: CaptureValue;
  readonly index: number;
}

class Evaluator {
  readonly #captures: CaptureRecord;
  readonly #alternatives: ReadonlyMap<CaptureId, string>;
  readonly #tracker: ResourceTracker;
  readonly #cancellation: CancellationToken;
  readonly #trace: TemplateOperationTrace[] = [];
  #freshOrdinal = 0;

  constructor(options: EvaluateTemplateOptions) {
    this.#captures = options.captures;
    this.#alternatives = options.selectedAlternatives ?? new Map();
    this.#tracker =
      options.tracker ??
      new ResourceTracker(createResourceBudget(options.budget ?? {}));
    this.#cancellation = options.cancellation ?? neverCancelled;
  }

  evaluate(template: SequenceTemplate): EvaluateTemplateResult {
    const output = this.#sequence(template, [], undefined);
    return Object.freeze({
      output: Object.freeze(output),
      templateSteps: this.#tracker.usage.templateSteps,
      trace: Object.freeze([...this.#trace]),
    });
  }

  #sequence(
    template: SequenceTemplate,
    indices: readonly number[],
    locals: FoldLocals | undefined,
  ): EvaluatedTemplate[] {
    this.#step();
    const output: EvaluatedTemplate[] = [];
    for (const node of template.elements) {
      output.push(...this.#node(node, indices, locals));
    }
    return output;
  }

  #node(
    node: TemplateNode,
    indices: readonly number[],
    locals: FoldLocals | undefined,
  ): EvaluatedTemplate[] {
    this.#step();
    switch (node.kind) {
      case "literal":
        return [
          Object.freeze({
            kind: "syntax",
            origin: node.origin,
            syntax: Object.freeze([node.syntax]),
            source: "template",
            capture: undefined,
          }),
        ];
      case "capture": {
        const value = resolvePath(this.#captures, node.path, indices);
        if (value.kind !== "leaf") {
          throw new TemplateCaptureError(
            `Capture $${node.path.rootName} still has ${String(value.depth)} unselected dimensions`,
          );
        }
        return [this.#capture(value)];
      }
      case "sequence":
        return this.#sequence(node, indices, locals);
      case "group":
        return this.#nested(() => [
          Object.freeze({
            kind: "group",
            origin: node.origin,
            delimiter: node.delimiter,
            body: Object.freeze(this.#sequence(node.body, indices, locals)),
            open: node.open,
            close: node.close,
            scopes: node.scopes,
          }),
        ]);
      case "repeat":
        return this.#nested(() => {
          const sequences = node.drivers.map((path) => {
            const value = resolvePath(this.#captures, path, indices);
            if (value.kind !== "sequence") {
              throw new TemplateCaptureError(
                `Repetition driver $${path.rootName} is not a sequence`,
              );
            }
            if (
              node.cardinalityGroup !== undefined &&
              value.cardinalityGroup !== node.cardinalityGroup
            ) {
              throw new TemplateCardinalityError(node.depth, [
                value.elements.length,
              ]);
            }
            return value;
          });
          const lengths = sequences.map((sequence) => sequence.elements.length);
          const length = lengths[0] ?? 0;
          if (lengths.some((candidate) => candidate !== length)) {
            throw new TemplateCardinalityError(node.depth, lengths);
          }
          const output: EvaluatedTemplate[] = [];
          for (let index = 0; index < length; index += 1) {
            this.#step();
            if (index > 0 && node.separator !== undefined) {
              output.push(...this.#node(node.separator, indices, locals));
            }
            output.push(
              ...this.#sequence(node.body, [...indices, index], locals),
            );
          }
          return output;
        });
      case "conditional": {
        const branch = this.#predicate(node.predicate, indices)
          ? node.consequent
          : node.alternate;
        return branch === undefined
          ? []
          : this.#nested(() => this.#sequence(branch, indices, locals));
      }
      case "operation":
        return [this.#operation(node.origin, node.operation, indices)];
      case "local": {
        if (locals === undefined) {
          throw new TemplateCaptureError(
            `Fold local $${node.local} used outside a fold`,
          );
        }
        if (node.local === "accumulator") {
          return [...locals.accumulator];
        }
        if (node.local === "index") {
          return [this.#indexOperation(node.origin, locals.index, indices)];
        }
        const value = selectFields(locals.element, node.fields, "Fold element");
        if (value.kind !== "leaf") {
          throw new TemplateCaptureError(
            "Fold element still has unselected dimensions",
          );
        }
        return [this.#capture(value)];
      }
      case "fold":
        return this.#nested(() => {
          const driver = resolvePath(this.#captures, node.driver, indices);
          if (driver.kind !== "sequence") {
            throw new TemplateCaptureError(
              `Fold driver $${node.driver.rootName} is not a sequence`,
            );
          }
          let accumulator: readonly EvaluatedTemplate[] = this.#sequence(
            node.initial,
            indices,
            locals,
          );
          for (let index = 0; index < driver.elements.length; index += 1) {
            this.#step();
            accumulator = this.#sequence(node.body, indices, {
              accumulator,
              element: driver.elements[index]!,
              index,
            });
          }
          return [...accumulator];
        });
    }
  }

  #operation(
    origin: OriginId,
    operation: HygieneOperation,
    indices: readonly number[],
  ): EvaluatedOperation {
    if (operation.kind === "fresh") {
      const ordinal = this.#freshOrdinal;
      this.#freshOrdinal += 1;
      this.#record(operation.kind, origin, undefined, indices, operation.hint);
      return Object.freeze({
        kind: "operation",
        origin,
        operation: "fresh",
        hint: operation.hint,
        ordinal,
      });
    }
    if (operation.kind === "metavar") {
      if (indices.length === 0) {
        throw new TemplateCaptureError("#metavar used outside repetition");
      }
      const value = resolvePath(this.#captures, operation.path, indices);
      if (value.kind !== "leaf") {
        throw new TemplateCaptureError(
          "#metavar driver did not select one repetition element",
        );
      }
      this.#record(
        operation.kind,
        origin,
        finalCaptureId(operation.path),
        indices,
        operation.hint,
      );
      return Object.freeze({
        kind: "operation",
        origin,
        operation: "metavar",
        hint: operation.hint,
        indices: Object.freeze([...indices]),
      });
    }
    if (operation.kind === "index") {
      const value = indices.at(-1);
      if (value === undefined) {
        throw new TemplateCaptureError("#index used outside repetition");
      }
      return this.#indexOperation(origin, value, indices);
    }
    const value = resolvePath(this.#captures, operation.path, indices);
    if (operation.kind === "count") {
      const count = (capture: CaptureValue): number =>
        capture.kind === "leaf"
          ? 1
          : capture.elements.reduce(
              (total, element) => total + count(element),
              0,
            );
      const result = count(value);
      const capture = finalCaptureId(operation.path);
      this.#record(operation.kind, origin, capture, indices, result);
      return Object.freeze({
        kind: "operation",
        origin,
        operation: "count",
        value: result,
      });
    }
    if (value.kind !== "leaf") {
      throw new TemplateCaptureError(
        `Operation #${operation.kind} requires one syntax value`,
      );
    }
    const capture = finalCaptureId(operation.path);
    if (operation.kind === "text") {
      const text = stableSyntaxText(value.syntax);
      this.#record(operation.kind, origin, capture, indices, text);
      return Object.freeze({
        kind: "operation",
        origin,
        operation: operation.kind,
        text,
      });
    }
    this.#record(operation.kind, origin, capture, indices, undefined);
    return Object.freeze({
      kind: "operation",
      origin,
      operation: operation.kind,
      syntax: value.syntax,
      capture,
    });
  }

  #indexOperation(
    origin: OriginId,
    value: number,
    indices: readonly number[],
  ): EvaluatedOperation {
    this.#record("index", origin, undefined, indices, value);
    return Object.freeze({
      kind: "operation",
      origin,
      operation: "index",
      value,
    });
  }

  #record(
    operation: HygieneOperation["kind"],
    origin: OriginId,
    capture: CaptureId | undefined,
    indices: readonly number[],
    detail: string | number | undefined,
  ): void {
    this.#trace.push(
      Object.freeze({
        operation,
        origin,
        capture,
        repetitionIndices: Object.freeze([...indices]),
        detail,
      }),
    );
  }

  #predicate(
    predicate: ConditionalPredicate,
    indices: readonly number[],
  ): boolean {
    const value = resolvePath(this.#captures, predicate.path, indices);
    if (predicate.kind === "present") return isPresent(value);
    return (
      this.#alternatives.get(finalCaptureId(predicate.path)) ===
      predicate.alternative
    );
  }

  #capture(value: CaptureLeaf): EvaluatedSyntax {
    return Object.freeze({
      kind: "syntax",
      origin: value.origin,
      syntax: value.syntax,
      source: "capture",
      capture: value.id,
    });
  }

  #nested<T>(operation: () => T): T {
    this.#tracker.enterNesting();
    try {
      return operation();
    } finally {
      this.#tracker.leaveNesting();
    }
  }

  #step(): void {
    this.#cancellation.throwIfCancellationRequested();
    this.#tracker.chargeTemplateSteps();
  }
}

export function evaluateTemplate(
  template: SequenceTemplate,
  options: EvaluateTemplateOptions,
): EvaluateTemplateResult {
  return new Evaluator(options).evaluate(template);
}
