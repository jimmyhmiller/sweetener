import type { InvocationId, OriginId, SourceId } from "./ids.js";

declare const diagnosticCodeBrand: unique symbol;

export type DiagnosticCode = string & {
  readonly [diagnosticCodeBrand]: "DiagnosticCode";
};

export type DiagnosticSeverity = "error" | "warning" | "info";

export type CompilerStage =
  | "reader"
  | "syntax"
  | "pattern"
  | "macro-definition"
  | "hygiene"
  | "binding"
  | "expansion"
  | "enforestation"
  | "modules"
  | "phases"
  | "typescript-host"
  | "source-maps"
  | "resource-limits"
  | "internal";

export type DiagnosticOwner =
  | "reader-syntax"
  | "pattern-definition"
  | "hygiene-binding"
  | "expansion-enforestation"
  | "modules-phases"
  | "typescript-host-maps"
  | "resources-internal";

export type DiagnosticMessageArgument = string | number | boolean;

export interface SourceSpan {
  readonly sourceId: SourceId;
  readonly start: number;
  readonly end: number;
  readonly originId?: OriginId;
}

export interface RelatedDiagnosticOrigin {
  readonly message: string;
  readonly origin: SourceSpan;
}

export interface ExpansionFrame {
  readonly invocationId: InvocationId;
  readonly macroName: string;
  readonly origin: SourceSpan;
}

export interface Diagnostic {
  readonly code: DiagnosticCode;
  readonly stage: CompilerStage;
  readonly severity: DiagnosticSeverity;
  readonly primaryOrigin: SourceSpan;
  readonly messageArguments: readonly DiagnosticMessageArgument[];
  readonly relatedOrigins: readonly RelatedDiagnosticOrigin[];
  readonly expansionStack: readonly ExpansionFrame[];
}

export interface DiagnosticDefinition {
  readonly code: DiagnosticCode;
  readonly owner: DiagnosticOwner;
  readonly stage: CompilerStage;
  readonly severity: DiagnosticSeverity;
  readonly documentation: string;
  readonly format: (arguments_: readonly DiagnosticMessageArgument[]) => string;
}

export interface CreateDiagnosticOptions {
  readonly primaryOrigin: SourceSpan;
  readonly messageArguments?: readonly DiagnosticMessageArgument[];
  readonly relatedOrigins?: readonly RelatedDiagnosticOrigin[];
  readonly expansionStack?: readonly ExpansionFrame[];
}

const codePattern = /^SWR([1-7])\d{3}$/;

const ownerByPrefix: Readonly<Record<string, DiagnosticOwner>> = Object.freeze({
  "1": "reader-syntax",
  "2": "pattern-definition",
  "3": "hygiene-binding",
  "4": "expansion-enforestation",
  "5": "modules-phases",
  "6": "typescript-host-maps",
  "7": "resources-internal",
});

const ownerByStage: Readonly<Record<CompilerStage, DiagnosticOwner>> =
  Object.freeze({
    reader: "reader-syntax",
    syntax: "reader-syntax",
    pattern: "pattern-definition",
    "macro-definition": "pattern-definition",
    hygiene: "hygiene-binding",
    binding: "hygiene-binding",
    expansion: "expansion-enforestation",
    enforestation: "expansion-enforestation",
    modules: "modules-phases",
    phases: "modules-phases",
    "typescript-host": "typescript-host-maps",
    "source-maps": "typescript-host-maps",
    "resource-limits": "resources-internal",
    internal: "resources-internal",
  });

export function diagnosticCode(value: string): DiagnosticCode {
  if (!codePattern.test(value)) {
    throw new RangeError(
      `Diagnostic code must match SWR1xxx through SWR7xxx: ${value}`,
    );
  }
  return value as DiagnosticCode;
}

export function ownerForDiagnosticCode(code: DiagnosticCode): DiagnosticOwner {
  const owner = ownerByPrefix[code[3] ?? ""];
  if (owner === undefined) {
    throw new RangeError(`Diagnostic code has no registered owner: ${code}`);
  }
  return owner;
}

export function validateSourceSpan(span: SourceSpan): void {
  if (
    !Number.isSafeInteger(span.start) ||
    !Number.isSafeInteger(span.end) ||
    span.start < 0 ||
    span.end < span.start
  ) {
    throw new RangeError(
      `Invalid source span: [${String(span.start)}, ${String(span.end)})`,
    );
  }
}

export class DiagnosticRegistry {
  readonly #definitions = new Map<DiagnosticCode, DiagnosticDefinition>();

  constructor(definitions: readonly DiagnosticDefinition[] = []) {
    for (const definition of definitions) this.register(definition);
  }

  register(definition: DiagnosticDefinition): void {
    const expectedOwner = ownerForDiagnosticCode(definition.code);
    if (definition.owner !== expectedOwner) {
      throw new RangeError(
        `${definition.code} belongs to ${expectedOwner}, not ${definition.owner}`,
      );
    }
    const stageOwner = ownerByStage[definition.stage];
    if (stageOwner !== definition.owner) {
      throw new RangeError(
        `${definition.stage} diagnostics belong to ${stageOwner}, not ${definition.owner}`,
      );
    }
    if (definition.documentation.trim().length === 0) {
      throw new RangeError(
        `${definition.code} requires a diagnostic documentation entry`,
      );
    }
    if (this.#definitions.has(definition.code)) {
      throw new RangeError(`Duplicate diagnostic code: ${definition.code}`);
    }
    this.#definitions.set(definition.code, Object.freeze({ ...definition }));
  }

  get(code: DiagnosticCode): DiagnosticDefinition | undefined {
    return this.#definitions.get(code);
  }

  list(): readonly DiagnosticDefinition[] {
    return [...this.#definitions.values()].sort((left, right) =>
      left.code.localeCompare(right.code),
    );
  }

  create(code: DiagnosticCode, options: CreateDiagnosticOptions): Diagnostic {
    const definition = this.#definitions.get(code);
    if (definition === undefined) {
      throw new RangeError(`Unknown diagnostic code: ${code}`);
    }
    validateSourceSpan(options.primaryOrigin);
    for (const related of options.relatedOrigins ?? []) {
      validateSourceSpan(related.origin);
    }
    for (const frame of options.expansionStack ?? []) {
      validateSourceSpan(frame.origin);
    }
    return Object.freeze({
      code,
      stage: definition.stage,
      severity: definition.severity,
      primaryOrigin: Object.freeze({ ...options.primaryOrigin }),
      messageArguments: Object.freeze([...(options.messageArguments ?? [])]),
      relatedOrigins: Object.freeze(
        (options.relatedOrigins ?? []).map((related) =>
          Object.freeze({
            ...related,
            origin: Object.freeze({ ...related.origin }),
          }),
        ),
      ),
      expansionStack: Object.freeze(
        (options.expansionStack ?? []).map((frame) =>
          Object.freeze({
            ...frame,
            origin: Object.freeze({ ...frame.origin }),
          }),
        ),
      ),
    });
  }

  format(diagnostic: Diagnostic): string {
    const definition = this.#definitions.get(diagnostic.code);
    if (definition === undefined) {
      throw new RangeError(`Unknown diagnostic code: ${diagnostic.code}`);
    }
    return definition.format(diagnostic.messageArguments);
  }
}

export interface DiagnosticSourceResolver {
  sourceName(sourceId: SourceId): string;
  lineAndColumn?(
    sourceId: SourceId,
    offset: number,
  ): { readonly line: number; readonly column: number };
}

function renderOrigin(
  origin: SourceSpan,
  resolver: DiagnosticSourceResolver,
): string {
  const name = resolver.sourceName(origin.sourceId);
  const location = resolver.lineAndColumn?.(origin.sourceId, origin.start);
  if (location === undefined) return `${name}:${origin.start}-${origin.end}`;
  return `${name}:${location.line}:${location.column}`;
}

export function renderDiagnostic(
  diagnostic: Diagnostic,
  registry: DiagnosticRegistry,
  resolver: DiagnosticSourceResolver,
): string {
  const lines = [
    `${renderOrigin(diagnostic.primaryOrigin, resolver)} - ${diagnostic.severity} ${diagnostic.code}: ${registry.format(diagnostic)}`,
  ];
  for (const related of diagnostic.relatedOrigins) {
    lines.push(
      `  related ${renderOrigin(related.origin, resolver)}: ${related.message}`,
    );
  }
  for (const frame of diagnostic.expansionStack) {
    lines.push(
      `  expanded ${frame.macroName} at ${renderOrigin(frame.origin, resolver)} [invocation ${String(frame.invocationId)}]`,
    );
  }
  return lines.join("\n");
}
