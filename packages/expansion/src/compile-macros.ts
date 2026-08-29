import { createBinding, type Phase } from "@sweetener/hygiene";
import {
  compileParsedBindingContracts,
  compileParsedSyntaxClasses,
  compileParsedTemplates,
  type ParseMacroDefinitionsResult,
  type MacroDefinition,
  type DefinitionClause,
} from "@sweetener/macro-language";
import {
  compileMatcherProgram,
  createBindingLiteralKey,
  createChoicePattern,
  createGroupPattern,
  createLiteralPattern,
  createOptionalPattern,
  createRepeatPattern,
  createSequencePattern,
  inferCaptureShapes,
  type PatternNode,
  type SyntaxClassRegistry,
} from "@sweetener/pattern";
import type {
  BindingId,
  Diagnostic,
  OriginId,
  ScopeSetId,
  SourceId,
} from "@sweetener/shared";
import type { Span } from "@sweetener/syntax";
import type { TokenSyntax } from "@sweetener/syntax";
import {
  expansionDiagnosticRegistry,
  invalidMacroContextCode,
  invalidCoreShadowCode,
  invalidOperatorConfigurationCode,
} from "./diagnostics.js";
import { isCoreForm } from "./core-shadowing.js";
import { syntaxSpaceForCategory } from "./environment.js";
import type { OperatorBinding } from "./environment.js";
import type {
  ExpansionEnvironment,
  ExpansionEnvironmentStore,
} from "./environment.js";
import type {
  CompiledMacroBinding,
  CompiledMacroRule,
  MacroContext,
} from "./invocation.js";

function compileRuleContexts(
  clauses: readonly DefinitionClause[],
  options: CompileParsedMacrosOptions,
  diagnostics: Diagnostic[],
): readonly MacroContext[] {
  const contexts: MacroContext[] = [];
  for (const clause of clauses) {
    if (clause.kind !== "property" || clause.keyword !== "context") continue;
    const name = clause.syntax.find(
      (syntax, index): syntax is TokenSyntax =>
        index > 0 && syntax.tag === "token" && syntax.raw !== ";",
    );
    if (name?.raw !== "generator") {
      const span = options.spanForOrigin(name?.origin ?? clause.origin);
      diagnostics.push(
        expansionDiagnosticRegistry.create(invalidMacroContextCode, {
          primaryOrigin: {
            sourceId: options.sourceId,
            start: span.start,
            end: span.end,
            originId: name?.origin ?? clause.origin,
          },
          messageArguments: [name?.raw ?? "missing"],
        }),
      );
      continue;
    }
    if (!contexts.includes("generator")) contexts.push("generator");
  }
  return Object.freeze(contexts);
}

export interface CompileParsedMacrosOptions {
  readonly sourceId: SourceId;
  readonly phase: Phase;
  readonly definitionScopes: ScopeSetId;
  readonly spanForOrigin: (origin: OriginId) => Span;
  readonly allocateBindingId: () => BindingId;
}

export interface CompileParsedMacrosResult {
  readonly macros: readonly CompiledMacroBinding[];
  readonly definitions: readonly {
    readonly definition: Exclude<
      MacroDefinition,
      { readonly kind: "syntax-class" }
    >;
    readonly macro: CompiledMacroBinding;
    readonly operator: OperatorBinding | undefined;
  }[];
  readonly operators: readonly OperatorBinding[];
  readonly bindingLiterals: readonly CompiledBindingLiteral[];
  readonly syntaxClasses: SyntaxClassRegistry;
  readonly diagnostics: readonly Diagnostic[];
  classId(
    name: string,
  ):
    ParseMacroDefinitionsResult["classBindings"][number]["classId"] | undefined;
  get(
    spelling: string,
    category?: CompiledMacroBinding["category"],
  ): CompiledMacroBinding | undefined;
}

export interface CompiledBindingLiteral {
  readonly binding: BindingId;
  readonly alias: string;
  readonly reference: string;
  readonly origin: OriginId;
}

function bindingLiteralDeclarations(
  definition: Exclude<MacroDefinition, { readonly kind: "syntax-class" }>,
  allocateBindingId: () => BindingId,
): readonly CompiledBindingLiteral[] {
  return Object.freeze(
    definition.clauses.flatMap((clause) => {
      if (clause.kind !== "property" || clause.keyword !== "literal") return [];
      const tokens = clause.syntax.filter(
        (syntax): syntax is TokenSyntax =>
          syntax.tag === "token" && syntax.raw !== ";",
      );
      const asIndex = tokens.findIndex(({ raw }) => raw === "as");
      const alias = tokens[asIndex + 1];
      if (asIndex < 2 || alias === undefined) return [];
      return [
        Object.freeze({
          binding: allocateBindingId(),
          alias: alias.raw,
          reference: tokens
            .slice(1, asIndex)
            .map(({ raw }) => raw)
            .join(""),
          origin: clause.origin,
        }),
      ];
    }),
  );
}

function lowerBindingLiterals(
  pattern: PatternNode,
  literals: ReadonlyMap<string, CompiledBindingLiteral>,
): PatternNode {
  switch (pattern.kind) {
    case "literal": {
      const declaration =
        pattern.literal.kind === "token"
          ? literals.get(pattern.literal.raw)
          : undefined;
      return declaration === undefined
        ? pattern
        : createLiteralPattern(
            pattern.origin,
            createBindingLiteralKey(declaration.binding, declaration.alias),
          );
    }
    case "sequence":
      return createSequencePattern(
        pattern.origin,
        pattern.elements.map((element) =>
          lowerBindingLiterals(element, literals),
        ),
      );
    case "group":
      return createGroupPattern(
        pattern.origin,
        pattern.delimiter,
        lowerBindingLiterals(pattern.body, literals) as typeof pattern.body,
      );
    case "choice":
      return createChoicePattern(
        pattern.origin,
        pattern.alternatives.map((alternative) =>
          lowerBindingLiterals(alternative, literals),
        ),
      );
    case "repeat":
      return createRepeatPattern({
        ...pattern,
        body: lowerBindingLiterals(pattern.body, literals),
        separator:
          pattern.separator === undefined
            ? undefined
            : lowerBindingLiterals(pattern.separator, literals),
      });
    case "optional":
      return createOptionalPattern({
        ...pattern,
        body: lowerBindingLiterals(pattern.body, literals),
      });
    default:
      return pattern;
  }
}

function operatorProperty(
  definition: Extract<MacroDefinition, { readonly kind: "operator" }>,
  keyword: string,
): TokenSyntax | undefined {
  const tokens = definition.clauses.flatMap(({ syntax }) =>
    syntax.filter((item): item is TokenSyntax => item.tag === "token"),
  );
  const index = tokens.findIndex(({ raw }) => raw === keyword);
  return index < 0 ? undefined : tokens[index + 1];
}

function ruleFailureDescription(
  clauses: readonly DefinitionClause[],
): string | undefined {
  const clause = clauses.find(({ kind }) => kind === "diagnostic");
  const value = clause?.syntax.find(
    (syntax): syntax is TokenSyntax =>
      syntax.tag === "token" && syntax.kind === "string-literal",
  );
  return typeof value?.value === "string" ? value.value : undefined;
}

function lowerOperator(
  definition: Extract<MacroDefinition, { readonly kind: "operator" }>,
  macro: CompiledMacroBinding,
  options: CompileParsedMacrosOptions,
  diagnostics: Diagnostic[],
): OperatorBinding | undefined {
  const fixity = operatorProperty(definition, "fixity")?.raw;
  const associativityToken = operatorProperty(definition, "associativity");
  const associativity =
    associativityToken?.raw ??
    (fixity === "prefix" || fixity === "postfix" ? "none" : undefined);
  const precedenceToken = operatorProperty(definition, "precedence");
  const precedence =
    typeof precedenceToken?.value === "number"
      ? precedenceToken.value
      : Number(precedenceToken?.raw);
  let problem: string | undefined;
  if (fixity !== "prefix" && fixity !== "infix" && fixity !== "postfix")
    problem = "fixity must be prefix, infix, or postfix";
  else if (
    associativity !== "left" &&
    associativity !== "right" &&
    associativity !== "none"
  )
    problem = "associativity must be left, right, or none";
  else if (fixity !== "infix" && associativity !== "none")
    problem = "prefix and postfix operators must be nonassociative";
  else if (!Number.isSafeInteger(precedence) || precedence < 1)
    problem = "precedence must be a positive safe integer";
  if (problem !== undefined) {
    const span = options.spanForOrigin(definition.origin);
    diagnostics.push(
      expansionDiagnosticRegistry.create(invalidOperatorConfigurationCode, {
        primaryOrigin: {
          sourceId: options.sourceId,
          start: span.start,
          end: span.end,
          originId: definition.origin,
        },
        messageArguments: [definition.spelling, problem],
      }),
    );
    return undefined;
  }
  return Object.freeze({
    binding: macro.binding.id,
    spelling: definition.spelling,
    phase: options.phase,
    category: definition.category,
    fixity,
    associativity,
    precedence,
    origin: definition.origin,
  } as OperatorBinding);
}

/**
 * Lowers the declarative front-end IR into the complete, executable macro IR.
 * This is deliberately the only orchestration point that joins pattern,
 * template, binding-contract, and hygiene compilation.
 */
export function compileParsedMacros(
  parsed: ParseMacroDefinitionsResult,
  options: CompileParsedMacrosOptions,
): CompileParsedMacrosResult {
  const classes = compileParsedSyntaxClasses(parsed, options);
  const templates = compileParsedTemplates(parsed, {
    ...options,
    syntaxClasses: classes.registry,
  });
  const contracts = compileParsedBindingContracts(parsed, {
    ...options,
    syntaxClasses: classes.registry,
  });
  const templateByRule = new Map(
    templates.templates.map(({ rule, template }) => [rule, template]),
  );
  const contractsByRule = new Map(
    contracts.rules.map(({ rule, contracts: ruleContracts }) => [
      rule,
      ruleContracts,
    ]),
  );
  const diagnostics: Diagnostic[] = [
    ...parsed.diagnostics,
    ...classes.diagnostics,
    ...templates.diagnostics,
    ...contracts.diagnostics,
  ];
  const macros: CompiledMacroBinding[] = [];
  const definitions: {
    readonly definition: Exclude<
      MacroDefinition,
      { readonly kind: "syntax-class" }
    >;
    readonly macro: CompiledMacroBinding;
    readonly operator: OperatorBinding | undefined;
  }[] = [];
  const operators: OperatorBinding[] = [];
  const bindingLiterals: CompiledBindingLiteral[] = [];

  for (const definition of parsed.definitions) {
    if (definition.kind === "syntax-class") continue;
    const spelling =
      definition.kind === "operator" ? definition.spelling : definition.name;
    if (definition.shadowsCore && !isCoreForm(spelling, definition.category)) {
      const span = options.spanForOrigin(definition.origin);
      diagnostics.push(
        expansionDiagnosticRegistry.create(invalidCoreShadowCode, {
          primaryOrigin: {
            sourceId: options.sourceId,
            start: span.start,
            end: span.end,
            originId: definition.origin,
          },
          messageArguments: [spelling, definition.category],
        }),
      );
    }
    const definitionLiterals = bindingLiteralDeclarations(
      definition,
      options.allocateBindingId,
    );
    bindingLiterals.push(...definitionLiterals);
    const literalsByAlias = new Map(
      definitionLiterals.map((literal) => [literal.alias, literal]),
    );
    const rules: CompiledMacroRule[] = [];
    for (const rule of definition.rules) {
      const template = templateByRule.get(rule.id);
      if (template === undefined) continue;
      const inference = inferCaptureShapes(rule.pattern, {
        sourceId: options.sourceId,
        spanForOrigin: options.spanForOrigin,
        fieldsForClass: (classId) => classes.registry.shapeForClass(classId),
      });
      diagnostics.push(...inference.diagnostics);
      if (inference.diagnostics.some(({ severity }) => severity === "error"))
        continue;
      rules.push(
        Object.freeze({
          rule: rule.id,
          origin: rule.origin,
          fallback: rule.fallback,
          matcher: compileMatcherProgram(
            lowerBindingLiterals(rule.pattern, literalsByAlias),
            {
              rule: rule.id,
              inference,
            },
          ),
          template,
          contracts: contractsByRule.get(rule.id) ?? Object.freeze([]),
          requiredContexts: compileRuleContexts(
            rule.clauses,
            options,
            diagnostics,
          ),
          failureDescription: ruleFailureDescription(rule.clauses),
        }),
      );
    }
    // Every rule failed to compile, and its diagnostics are already reported.
    // Registering the name anyway would offer callers a macro that cannot
    // expand, so the definition contributes nothing instead.
    if (rules.length === 0) continue;
    const macro = Object.freeze({
      binding: createBinding({
        id: options.allocateBindingId(),
        spelling:
          definition.kind === "operator"
            ? definition.spelling
            : definition.name,
        scopes: options.definitionScopes,
        phase: options.phase,
        space: syntaxSpaceForCategory(definition.category),
        declaration: definition.origin,
        kind: definition.kind === "operator" ? "operator" : "macro",
      }),
      category: definition.category,
      definitionScopes: options.definitionScopes,
      rules: Object.freeze(rules),
    });
    const operator =
      definition.kind === "operator"
        ? lowerOperator(definition, macro, options, diagnostics)
        : undefined;
    // An operator whose configuration was rejected has its diagnostic already.
    // Registering it anyway would leave a definition with no table entry, which
    // later reads as a broken invariant rather than the error it is.
    if (definition.kind === "operator" && operator === undefined) continue;
    macros.push(macro);
    if (operator !== undefined) operators.push(operator);
    definitions.push(Object.freeze({ definition, macro, operator }));
  }

  const frozenMacros = Object.freeze(macros);
  const frozenDefinitions = Object.freeze(definitions);
  const classIds = new Map(
    parsed.classBindings.map(({ name, classId }) => [name, classId]),
  );
  return Object.freeze({
    macros: frozenMacros,
    definitions: frozenDefinitions,
    operators: Object.freeze(operators),
    bindingLiterals: Object.freeze(bindingLiterals),
    syntaxClasses: classes.registry,
    diagnostics: Object.freeze(diagnostics),
    classId: (name: string) => classIds.get(name),
    get: (spelling: string, category?: CompiledMacroBinding["category"]) =>
      frozenMacros.find(
        (macro) =>
          macro.binding.spelling === spelling &&
          (category === undefined || macro.category === category),
      ),
  });
}

/** Resolves a compiled macro through the nearest lexical expansion frame. */
export function resolveCompiledMacro(options: {
  readonly module: Pick<CompileParsedMacrosResult, "macros">;
  readonly store: ExpansionEnvironmentStore;
  readonly environment: ExpansionEnvironment;
  readonly spelling: string;
  readonly category: CompiledMacroBinding["category"];
  readonly phase: Phase;
}): CompiledMacroBinding | undefined {
  const visible = options.store.lookupBindings(options.environment, options);
  const compiled = visible.flatMap((binding) => {
    const macro = options.module.macros.find(
      (candidate) => candidate.binding.id === binding.id,
    );
    return macro === undefined ? [] : [macro];
  });
  if (compiled.length > 1) {
    throw new RangeError(
      `Ambiguous lexical macro ${options.spelling} in ${options.category}`,
    );
  }
  return compiled[0];
}
