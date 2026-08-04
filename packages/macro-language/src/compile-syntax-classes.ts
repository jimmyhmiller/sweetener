import {
  compileSyntaxClasses,
  invalidRefinementCode,
  patternDiagnosticRegistry,
  type CompileSyntaxClassesResult,
  type RefinementPredicate,
  type SyntaxClassRefinementInput,
} from "@sweetener/pattern";
import type { Diagnostic, OriginId, SourceId } from "@sweetener/shared";
import type { Span, TokenSyntax } from "@sweetener/syntax";
import type { ParseMacroDefinitionsResult } from "./parser/index.js";

export interface CompileParsedSyntaxClassesOptions {
  readonly sourceId: SourceId;
  readonly spanForOrigin: (origin: OriginId) => Span;
}

export function compileParsedSyntaxClasses(
  parsed: ParseMacroDefinitionsResult,
  options: CompileParsedSyntaxClassesOptions,
): CompileSyntaxClassesResult {
  const refinementDiagnostics: Diagnostic[] = [];
  const bindings = new Map(
    parsed.classBindings.map((binding) => [binding.name, binding.classId]),
  );
  const token = bindings.get("token");
  const tt = bindings.get("tt");
  const ident = bindings.get("ident");
  if (token === undefined || tt === undefined || ident === undefined) {
    throw new Error("Parser result is missing core syntax-class bindings");
  }
  const lowerRefinements = (
    clauses: ParseMacroDefinitionsResult["definitions"][number]["rules"][number]["clauses"],
  ): readonly SyntaxClassRefinementInput[] =>
    clauses.flatMap((clause) => {
      if (clause.kind !== "refinement") return [];
      const tokens = clause.syntax.filter(
        (syntax): syntax is TokenSyntax => syntax.tag === "token",
      );
      const targetToken = tokens[1];
      const targetName = targetToken?.raw.startsWith("$")
        ? targetToken.raw.slice(1)
        : undefined;
      const spelling = tokens
        .slice(2)
        .map((item) => item.raw)
        .join("");
      let predicate: RefinementPredicate | undefined;
      if (spelling === "spellingstarts-with-lowercase") {
        predicate = { kind: "starts-with-lowercase" };
      } else if (spelling === "spellingstarts-with-uppercase") {
        predicate = { kind: "starts-with-uppercase" };
      }
      if (targetName !== undefined && predicate !== undefined) {
        return [{ targetName, predicate, origin: clause.origin }];
      }
      const span = options.spanForOrigin(clause.origin);
      refinementDiagnostics.push(
        patternDiagnosticRegistry.create(invalidRefinementCode, {
          primaryOrigin: {
            sourceId: options.sourceId,
            start: span.start,
            end: span.end,
            originId: clause.origin,
          },
          messageArguments: [targetName ?? "unknown"],
        }),
      );
      return [];
    });

  const failureDescription = (
    clauses: ParseMacroDefinitionsResult["definitions"][number]["rules"][number]["clauses"],
  ): string | undefined => {
    const clause = clauses.find(({ kind }) => kind === "diagnostic");
    const value = clause?.syntax.find(
      (syntax): syntax is TokenSyntax =>
        syntax.tag === "token" && syntax.kind === "string-literal",
    );
    return typeof value?.value === "string" ? value.value : undefined;
  };

  const result = compileSyntaxClasses(
    parsed.definitions
      .filter((definition) => definition.kind === "syntax-class")
      .map((definition) => ({
        classId: definition.classId,
        name: definition.name,
        origin: definition.origin,
        fields: definition.fields,
        rules: definition.rules.map((rule) => ({
          rule: rule.id,
          pattern: rule.pattern,
          origin: rule.origin,
          refinements: lowerRefinements(rule.clauses),
          failureDescription: failureDescription(rule.clauses),
        })),
      })),
    {
      ...options,
      builtins: { token, tt, ident },
      externalClassIds: [
        "expr",
        "stmt",
        "item",
        "type",
        "binding",
        "classElement",
        "jsxChild",
      ].flatMap((name) => {
        const classId = bindings.get(name);
        return classId === undefined ? [] : [classId];
      }),
    },
  );
  return Object.freeze({
    registry: result.registry,
    diagnostics: Object.freeze([
      ...refinementDiagnostics,
      ...result.diagnostics,
    ]),
  });
}
