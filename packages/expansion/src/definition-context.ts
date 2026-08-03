import type { Binding } from "@sweet-rewrite/hygiene";
import type { MacroDefinition } from "@sweet-rewrite/macro-language";
import type { Diagnostic, OriginId, SourceSpan } from "@sweet-rewrite/shared";
import {
  createSyntaxSequence,
  type Syntax,
  type SyntaxCategory,
  type SyntaxSequence,
} from "@sweet-rewrite/syntax";
import {
  type ExpansionEnvironment,
  type ExpansionEnvironmentStore,
  type OperatorBinding,
  syntaxSpaceForCategory,
} from "./environment.js";
import {
  conflictingOperatorImportCode,
  expansionDiagnosticRegistry,
} from "./diagnostics.js";

export interface PreparedMacroDefinition {
  readonly kind: "macro-definition";
  readonly definition: MacroDefinition;
  readonly binding: Binding;
  readonly operator?: OperatorBinding | undefined;
  readonly generated?: boolean | undefined;
}

export interface RuntimeDefinitionItem {
  readonly kind: "runtime";
  readonly origin: OriginId;
  readonly syntax: SyntaxSequence;
  readonly bindings: readonly Binding[];
}

export type DefinitionContextItem =
  PreparedMacroDefinition | RuntimeDefinitionItem;

export interface ValidatePreparedDefinitionResult {
  readonly diagnostics: readonly Diagnostic[];
}

export type ValidatePreparedDefinition = (
  item: PreparedMacroDefinition,
  environment: ExpansionEnvironment,
) => ValidatePreparedDefinitionResult;

export interface RegisteredDefinition {
  readonly item: PreparedMacroDefinition;
  readonly environmentBefore: ExpansionEnvironment;
  readonly validationEnvironment: ExpansionEnvironment;
  readonly environmentAfter: ExpansionEnvironment;
}

export interface DefinitionContextStep {
  readonly index: number;
  readonly kind: DefinitionContextItem["kind"];
  readonly origin: OriginId;
  readonly generated: boolean;
  readonly environmentBefore: ExpansionEnvironment;
  readonly environmentAfter: ExpansionEnvironment;
  readonly registeredBinding: Binding["id"] | undefined;
  readonly emittedSyntax: number;
  readonly diagnostics: readonly Diagnostic[];
}

export interface ProcessDefinitionContextOptions {
  readonly store: ExpansionEnvironmentStore;
  readonly environment: ExpansionEnvironment;
  readonly items: readonly DefinitionContextItem[];
  readonly validate: ValidatePreparedDefinition;
  readonly diagnosticOrigin?: ((origin: OriginId) => SourceSpan) | undefined;
}

export interface ProcessDefinitionContextResult {
  readonly environment: ExpansionEnvironment;
  readonly emitted: SyntaxSequence;
  readonly runtimeBindings: readonly Binding[];
  readonly definitions: readonly RegisteredDefinition[];
  readonly diagnostics: readonly Diagnostic[];
  readonly steps: readonly DefinitionContextStep[];
}

function recursive(item: PreparedMacroDefinition): boolean {
  return (
    (item.definition.kind === "syntax" ||
      item.definition.kind === "syntax-class") &&
    item.definition.recursive
  );
}

function definitionCategory(
  definition: MacroDefinition,
): SyntaxCategory | undefined {
  return definition.kind === "syntax-class" ? undefined : definition.category;
}

function validatePreparedItem(item: PreparedMacroDefinition): void {
  if (!Object.isFrozen(item.definition) || !Object.isFrozen(item.binding)) {
    throw new TypeError(
      "Prepared macro definition and binding must be immutable",
    );
  }
  if (item.binding.kind !== "macro" && item.binding.kind !== "operator") {
    throw new TypeError(
      "Prepared definition requires a macro or operator binding",
    );
  }
  const category = definitionCategory(item.definition);
  if (
    category !== undefined &&
    item.binding.space !== syntaxSpaceForCategory(category)
  ) {
    throw new TypeError(
      `Definition category ${category} requires ${syntaxSpaceForCategory(category)}`,
    );
  }
  if (item.definition.kind === "operator" && item.operator === undefined) {
    throw new TypeError("Operator definition requires an operator-table entry");
  }
  if (item.definition.kind !== "operator" && item.operator !== undefined) {
    throw new TypeError(
      "Only operator definitions may provide an operator-table entry",
    );
  }
  if (
    item.operator !== undefined &&
    item.operator.binding !== item.binding.id
  ) {
    throw new TypeError(
      "Operator entry and definition binding identities differ",
    );
  }
}

function extendPrepared(
  store: ExpansionEnvironmentStore,
  environment: ExpansionEnvironment,
  item: PreparedMacroDefinition,
): ExpansionEnvironment {
  let next = store.extendBinding(environment, item.binding);
  if (item.operator !== undefined)
    next = store.extendOperator(next, item.operator);
  return next;
}

function hasError(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === "error");
}

function validateRuntimeItem(item: RuntimeDefinitionItem): void {
  if (!Object.isFrozen(item.syntax) || !Object.isFrozen(item.bindings)) {
    throw new TypeError(
      "Runtime syntax and binding skeletons must be immutable",
    );
  }
  for (const binding of item.bindings) {
    if (!Object.isFrozen(binding)) {
      throw new TypeError("Runtime binding skeleton must be immutable");
    }
    if (binding.space.startsWith("syntax-")) {
      throw new TypeError(
        "Runtime item cannot register a syntax-space binding",
      );
    }
  }
}

export function processDefinitionContext(
  options: ProcessDefinitionContextOptions,
): ProcessDefinitionContextResult {
  let environment = options.environment;
  const emitted: Syntax[] = [];
  const runtimeBindings: Binding[] = [];
  const definitions: RegisteredDefinition[] = [];
  const diagnostics: Diagnostic[] = [];
  const steps: DefinitionContextStep[] = [];

  options.items.forEach((item, index) => {
    const environmentBefore = environment;
    if (item.kind === "runtime") {
      validateRuntimeItem(item);
      emitted.push(...item.syntax);
      runtimeBindings.push(...item.bindings);
      steps.push(
        Object.freeze({
          index,
          kind: item.kind,
          origin: item.origin,
          generated: false,
          environmentBefore,
          environmentAfter: environment,
          registeredBinding: undefined,
          emittedSyntax: item.syntax.length,
          diagnostics: Object.freeze([]),
        }),
      );
      return;
    }

    validatePreparedItem(item);
    const conflict =
      item.operator === undefined
        ? undefined
        : options.store
            .lookupLocalOperators(environment, {
              spelling: item.operator.spelling,
              phase: item.operator.phase,
              category: item.operator.category,
              fixity: item.operator.fixity,
            })
            .find(({ binding }) => binding !== item.operator!.binding);
    if (conflict !== undefined && options.diagnosticOrigin !== undefined) {
      const conflictDiagnostic = expansionDiagnosticRegistry.create(
        conflictingOperatorImportCode,
        {
          primaryOrigin: options.diagnosticOrigin(item.operator!.origin),
          messageArguments: [item.operator!.spelling, item.operator!.fixity],
          relatedOrigins: [
            {
              message: "previous operator binding",
              origin: options.diagnosticOrigin(conflict.origin),
            },
          ],
        },
      );
      diagnostics.push(conflictDiagnostic);
      steps.push(
        Object.freeze({
          index,
          kind: item.kind,
          origin: item.definition.origin,
          generated: item.generated ?? false,
          environmentBefore,
          environmentAfter: environment,
          registeredBinding: undefined,
          emittedSyntax: 0,
          diagnostics: Object.freeze([conflictDiagnostic]),
        }),
      );
      return;
    }
    const validationEnvironment = recursive(item)
      ? extendPrepared(options.store, environment, item)
      : environment;
    const validation = options.validate(item, validationEnvironment);
    if (!Object.isFrozen(validation.diagnostics)) {
      throw new TypeError(
        "Definition validation diagnostics must be immutable",
      );
    }
    diagnostics.push(...validation.diagnostics);
    const accepted = !hasError(validation.diagnostics);
    if (accepted) {
      environment = recursive(item)
        ? validationEnvironment
        : extendPrepared(options.store, environment, item);
      definitions.push(
        Object.freeze({
          item,
          environmentBefore,
          validationEnvironment,
          environmentAfter: environment,
        }),
      );
    }
    steps.push(
      Object.freeze({
        index,
        kind: item.kind,
        origin: item.definition.origin,
        generated: item.generated ?? false,
        environmentBefore,
        environmentAfter: environment,
        registeredBinding: accepted ? item.binding.id : undefined,
        emittedSyntax: 0,
        diagnostics: Object.freeze([...validation.diagnostics]),
      }),
    );
  });

  return Object.freeze({
    environment,
    emitted: createSyntaxSequence(emitted),
    runtimeBindings: Object.freeze(runtimeBindings),
    definitions: Object.freeze(definitions),
    diagnostics: Object.freeze(diagnostics),
    steps: Object.freeze(steps),
  });
}
