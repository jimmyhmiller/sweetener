import type { Phase } from "@sweetener/hygiene";
import { parseMacroDefinitions } from "@sweetener/macro-language";
import type {
  BindingId,
  Diagnostic,
  ScopeSetId,
  SourceId,
  SourceSpan,
  SyntaxId,
  EnvironmentEpoch,
  OriginId,
} from "@sweetener/shared";
import {
  createRootSyntax,
  type GroupSyntax,
  type OriginStore,
  type SyntaxSequence,
  type TokenSyntax,
} from "@sweetener/syntax";
import {
  compileParsedMacros,
  type CompileParsedMacrosResult,
} from "./compile-macros.js";
import {
  processDefinitionContext,
  type ProcessDefinitionContextResult,
  type ValidatePreparedDefinition,
} from "./definition-context.js";
import {
  expansionDiagnosticRegistry,
  malformedGeneratedDefinitionCode,
} from "./diagnostics.js";
import type {
  ExpansionEnvironment,
  ExpansionEnvironmentStore,
} from "./environment.js";

export interface ProcessGeneratedDefinitionsOptions {
  readonly syntax: SyntaxSequence;
  readonly sourceId: SourceId;
  readonly phase: Phase;
  readonly definitionScopes: ScopeSetId;
  readonly origins: OriginStore;
  readonly store: ExpansionEnvironmentStore;
  readonly environment: ExpansionEnvironment;
  readonly allocateSyntaxId: () => SyntaxId;
  readonly allocateBindingId: () => BindingId;
  readonly diagnosticOrigin: (origin: TokenSyntax["origin"]) => SourceSpan;
  readonly validate?: ValidatePreparedDefinition | undefined;
}

export interface ProcessGeneratedDefinitionsResult {
  readonly accepted: boolean;
  readonly environment: ExpansionEnvironment;
  readonly compiled: CompileParsedMacrosResult | undefined;
  readonly context: ProcessDefinitionContextResult | undefined;
  readonly diagnostics: readonly Diagnostic[];
  readonly trace: GeneratedDefinitionsTrace;
}

export interface GeneratedDefinitionsTrace {
  readonly markerOrigin: OriginId;
  readonly bodyOrigin: OriginId | undefined;
  readonly definitionOrigins: readonly OriginId[];
  readonly registeredBindings: readonly BindingId[];
  readonly environmentBefore: EnvironmentEpoch;
  readonly environmentAfter: EnvironmentEpoch;
  readonly accepted: boolean;
}

function marker(
  syntax: SyntaxSequence,
): { readonly token: TokenSyntax; readonly body: GroupSyntax } | undefined {
  const token = syntax[0];
  const body = syntax[1];
  return syntax.length === 2 &&
    token?.tag === "token" &&
    token.raw === "#syntax" &&
    body?.tag === "group" &&
    body.delimiter === "brace"
    ? { token, body }
    : undefined;
}

export function processGeneratedDefinitions(
  options: ProcessGeneratedDefinitionsOptions,
): ProcessGeneratedDefinitionsResult {
  const generated = marker(options.syntax);
  const markerOrigin = options.syntax[0]?.origin;
  if (markerOrigin === undefined) {
    throw new RangeError("Generated definition output cannot be empty");
  }
  const trace = (input: {
    readonly accepted: boolean;
    readonly bodyOrigin?: OriginId | undefined;
    readonly definitionOrigins?: readonly OriginId[] | undefined;
    readonly registeredBindings?: readonly BindingId[] | undefined;
    readonly environment?: ExpansionEnvironment | undefined;
  }): GeneratedDefinitionsTrace =>
    Object.freeze({
      markerOrigin,
      bodyOrigin: input.bodyOrigin,
      definitionOrigins: Object.freeze([...(input.definitionOrigins ?? [])]),
      registeredBindings: Object.freeze([...(input.registeredBindings ?? [])]),
      environmentBefore: options.environment.epoch,
      environmentAfter: (input.environment ?? options.environment).epoch,
      accepted: input.accepted,
    });
  if (generated === undefined) {
    return Object.freeze({
      accepted: false,
      environment: options.environment,
      compiled: undefined,
      context: undefined,
      diagnostics: Object.freeze([
        expansionDiagnosticRegistry.create(malformedGeneratedDefinitionCode, {
          primaryOrigin: options.diagnosticOrigin(markerOrigin),
        }),
      ]),
      trace: trace({ accepted: false }),
    });
  }
  const root = createRootSyntax({
    id: options.allocateSyntaxId(),
    span: generated.body.span,
    origin: generated.body.origin,
    scopes: generated.body.scopes,
    children: generated.body.children,
  });
  const parsed = parseMacroDefinitions(root, { sourceId: options.sourceId });
  const compiled = compileParsedMacros(parsed, {
    sourceId: options.sourceId,
    phase: options.phase,
    definitionScopes: options.definitionScopes,
    allocateBindingId: options.allocateBindingId,
    spanForOrigin: (origin) =>
      options.origins.selectPrimarySource(origin)?.span ??
      options.diagnosticOrigin(origin),
  });
  if (compiled.diagnostics.some(({ severity }) => severity === "error")) {
    return Object.freeze({
      accepted: false,
      environment: options.environment,
      compiled,
      context: undefined,
      diagnostics: compiled.diagnostics,
      trace: trace({
        accepted: false,
        bodyOrigin: generated.body.origin,
        definitionOrigins: parsed.definitions.map(({ origin }) => origin),
      }),
    });
  }
  const byDefinition = new Map(
    compiled.definitions.map((entry) => [entry.definition.id, entry]),
  );
  const context = processDefinitionContext({
    store: options.store,
    environment: options.environment,
    items: Object.freeze(
      parsed.definitions.flatMap((definition) => {
        if (definition.kind === "syntax-class") return [];
        const entry = byDefinition.get(definition.id);
        return entry === undefined
          ? []
          : [
              Object.freeze({
                kind: "macro-definition" as const,
                definition,
                binding: entry.macro.binding,
                operator: entry.operator,
                generated: true,
              }),
            ];
      }),
    ),
    validate:
      options.validate ??
      (() => Object.freeze({ diagnostics: Object.freeze([]) })),
    diagnosticOrigin: options.diagnosticOrigin,
  });
  return Object.freeze({
    accepted: !context.diagnostics.some(({ severity }) => severity === "error"),
    environment: context.environment,
    compiled,
    context,
    diagnostics: context.diagnostics,
    trace: trace({
      accepted: !context.diagnostics.some(
        ({ severity }) => severity === "error",
      ),
      bodyOrigin: generated.body.origin,
      definitionOrigins: parsed.definitions.map(({ origin }) => origin),
      registeredBindings: context.steps.flatMap(({ registeredBinding }) =>
        registeredBinding === undefined ? [] : [registeredBinding],
      ),
      environment: context.environment,
    }),
  });
}
