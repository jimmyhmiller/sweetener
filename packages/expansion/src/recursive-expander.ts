import type { BindingEnvironment } from "@sweetener/hygiene";
import type { SyntaxClassConsumer } from "@sweetener/pattern";
import type {
  BindingId,
  Diagnostic,
  InvocationId,
  SourceId,
} from "@sweetener/shared";
import {
  createGroup,
  createMissingToken,
  createProtectedSyntax,
  createRootSyntax,
  createSyntaxCursor,
  createSyntaxSequence,
  createToken,
  spanEnvelope,
  type ProtectedSyntax,
  type Syntax,
  type SyntaxCategory,
  type SyntaxSequence,
  type TokenSyntax,
} from "@sweetener/syntax";
import {
  resolveCompiledMacro,
  type CompileParsedMacrosResult,
} from "./compile-macros.js";
import type { CompiledMacroBinding, MacroContext } from "./invocation.js";
import type { CoreDispatchTrace } from "./core-shadowing.js";
import type {
  ExpansionEnvironment,
  ExpansionEnvironmentStore,
} from "./environment.js";
import {
  invokeMacro,
  type InvokeMacroOptions,
  type MacroTraceEvent,
} from "./invocation.js";
import {
  processGeneratedDefinitions,
  type GeneratedDefinitionsTrace,
} from "./generated-definitions.js";

export interface ExpandMacroSyntaxOptions extends Omit<
  InvokeMacroOptions,
  | "macro"
  | "cursor"
  | "category"
  | "consumeClass"
  | "environment"
  | "parentInvocation"
  | "expandReplacement"
> {
  readonly module: CompileParsedMacrosResult;
  /** Additional statically imported modules, in source lookup order. */
  readonly modules?: readonly CompileParsedMacrosResult[] | undefined;
  readonly syntax: SyntaxSequence;
  readonly category: SyntaxCategory;
  readonly consumeClass: SyntaxClassConsumer;
  readonly consumeClassForMacro?:
    ((macro: CompiledMacroBinding) => SyntaxClassConsumer) | undefined;
  readonly resolveMacro?:
    | ((request: {
        readonly spelling: string;
        readonly category: SyntaxCategory;
        readonly modules: readonly CompileParsedMacrosResult[];
        readonly lexicalModule: CompileParsedMacrosResult;
        readonly position: number;
        /**
         * Source the position belongs to. Definition-order visibility is only
         * meaningful within one file, and a macro's replacement mixes template
         * syntax from the defining file with captured syntax from the call
         * site, so the two must be told apart.
         */
        readonly positionSourceId?: SourceId | undefined;
      }) => CompiledMacroBinding | undefined)
    | undefined;
  readonly environment: BindingEnvironment;
  readonly parentInvocation?: InvocationId | undefined;
  readonly expansionStore?: ExpansionEnvironmentStore | undefined;
  readonly expansionEnvironment?: ExpansionEnvironment | undefined;
  readonly generatedDefinitions?: { readonly sourceId: SourceId } | undefined;
  readonly coreInterceptionForMacro?:
    | ((request: {
        readonly macro: CompiledMacroBinding;
        readonly lexicalModule: CompileParsedMacrosResult;
        readonly spelling: string;
        readonly origin: Syntax["origin"];
      }) => CoreDispatchTrace | undefined)
    | undefined;
  readonly enforest: (request: {
    readonly syntax: SyntaxSequence;
    readonly category: SyntaxCategory;
    readonly lexicalModule: CompileParsedMacrosResult;
    readonly contexts: ReadonlySet<MacroContext>;
  }) => ProtectedSyntax;
  /**
   * Enforest a brace body as a statement list, or return undefined when it
   * does not parse as one.
   *
   * A replacement is expanded while it is still raw, so a block spliced into
   * it — a captured statement, for instance — is walked under the enclosing
   * category and its interior expressions are never categorized. Enforesting
   * the block on the way in gives those positions their real categories.
   */
  readonly enforestStatements?:
    | ((request: {
        readonly syntax: SyntaxSequence;
        readonly contexts: ReadonlySet<MacroContext>;
      }) => SyntaxSequence | undefined)
    | undefined;
}

export interface ExpandMacroSyntaxResult {
  readonly syntax: SyntaxSequence;
  readonly environment: BindingEnvironment;
  readonly traces: readonly MacroTraceEvent[];
  readonly diagnostics: readonly Diagnostic[];
  readonly generatedDefinitionTraces: readonly GeneratedDefinitionsTrace[];
  readonly generatedModules: readonly CompileParsedMacrosResult[];
  readonly expansionEnvironment: ExpansionEnvironment | undefined;
}

const itemDispatchPrefixes = new Set([
  "export",
  "default",
  "declare",
  "async",
  "abstract",
]);

/** Whether a spelling is punctuation rather than an identifier. */
function punctuationSpelled(spelling: string): boolean {
  return !/^[\p{ID_Start}_$]/u.test(spelling);
}

function operatorWidthAt(
  syntax: SyntaxSequence,
  index: number,
  spelling: string,
): number | undefined {
  let actual = "";
  for (let width = 1; actual.length <= spelling.length; width += 1) {
    const node = syntax[index + width - 1];
    if (node?.tag !== "token") return undefined;
    actual += node.raw;
    if (actual === spelling) return width;
    if (!spelling.startsWith(actual)) return undefined;
  }
  return undefined;
}

export function expandMacroSyntax(
  options: ExpandMacroSyntaxOptions,
): ExpandMacroSyntaxResult {
  const traces: MacroTraceEvent[] = [];
  const diagnostics: Diagnostic[] = [];
  const generatedDefinitionTraces: GeneratedDefinitionsTrace[] = [];
  const activeModules: CompileParsedMacrosResult[] = [
    ...(options.modules ?? [options.module]),
  ];
  if (activeModules.length === 0)
    throw new RangeError("Expansion requires at least one macro module");
  let activeExpansionEnvironment = options.expansionEnvironment;

  const addScopes = (syntax: Syntax, added: Syntax["scopes"]): Syntax => {
    const scopes = options.scopeStore.union(syntax.scopes, added);
    switch (syntax.tag) {
      case "token":
        return createToken({ ...syntax, scopes });
      case "group":
        return createGroup({
          ...syntax,
          scopes,
          open: addScopes(syntax.open, added) as TokenSyntax,
          children: syntax.children.map((child) => addScopes(child, added)),
          close:
            syntax.close.tag === "token"
              ? (addScopes(syntax.close, added) as TokenSyntax)
              : createMissingToken({ ...syntax.close, scopes }),
        });
      case "protected":
        return createProtectedSyntax({
          ...syntax,
          scopes,
          children: syntax.children.map((child) => addScopes(child, added)),
        });
      case "root":
        return createRootSyntax({
          ...syntax,
          scopes,
          children: syntax.children.map((child) => addScopes(child, added)),
        });
    }
  };

  const enforestSequence = (
    syntax: SyntaxSequence,
    category: SyntaxCategory,
    lexicalModule: CompileParsedMacrosResult,
    contexts: ReadonlySet<MacroContext>,
  ): ProtectedSyntax => {
    if (
      (category === "item" || category === "stmt") &&
      syntax.length > 1 &&
      syntax.every(
        (node) => node.tag === "protected" && node.category === "item",
      )
    ) {
      const origins = [...new Set(syntax.map(({ origin }) => origin))];
      return createProtectedSyntax({
        id: options.allocateSyntaxId(),
        span: spanEnvelope(syntax.map(({ span }) => span)),
        origin:
          origins.length === 1
            ? origins[0]!
            : options.origins.composed(origins),
        scopes: syntax[0]!.scopes,
        category: "item",
        children: syntax,
      });
    }
    return options.enforest({ syntax, category, lexicalModule, contexts });
  };

  const contextsForContainer = (
    node: Extract<Syntax, { readonly tag: "protected" }>,
    inherited: ReadonlySet<MacroContext>,
  ): ReadonlySet<MacroContext> => {
    if (node.category !== "item") return inherited;
    const bodyIndex = node.children.findIndex(
      (child) => child.tag === "protected" && child.category === "stmt",
    );
    const header =
      bodyIndex < 0 ? node.children : node.children.slice(0, bodyIndex);
    const functionIndex = header.findIndex(
      (child) => child.tag === "token" && child.raw === "function",
    );
    const generator =
      functionIndex >= 0 &&
      header
        .slice(functionIndex + 1)
        .some((child) => child.tag === "token" && child.raw === "*");
    return generator
      ? new Set<MacroContext>([...inherited, "generator"])
      : inherited;
  };

  const visit = (
    initialInput: SyntaxSequence,
    environment: BindingEnvironment,
    category: SyntaxCategory,
    parentInvocation: InvocationId | undefined,
    lexicalModule: CompileParsedMacrosResult,
    contexts: ReadonlySet<MacroContext>,
    suppressHead = false,
    recursiveBinding?: BindingId,
  ): {
    readonly syntax: SyntaxSequence;
    readonly environment: BindingEnvironment;
  } => {
    let input = initialInput;
    const output: Syntax[] = [];
    let currentEnvironment = environment;
    let index = 0;
    let suppressPending = suppressHead;
    const suppressEveryHead = suppressHead && category === "item";
    let suppressedHeadIndex: number | undefined;
    while (index < input.length) {
      const node = input[index]!;
      const coreKeyword = input[index + 1];
      const separatedCoreBody = input[index + 2];
      const compactCoreBody = input[index + 1];
      const coreBody =
        node.tag === "token" &&
        node.raw === "#core" &&
        compactCoreBody?.tag === "group" &&
        compactCoreBody.delimiter === "parenthesis"
          ? compactCoreBody
          : node.tag === "token" &&
              node.raw === "#" &&
              coreKeyword?.tag === "token" &&
              coreKeyword.raw === "core" &&
              separatedCoreBody?.tag === "group" &&
              separatedCoreBody.delimiter === "parenthesis"
            ? separatedCoreBody
            : undefined;
      if (coreBody !== undefined) {
        const nested = visit(
          createSyntaxSequence(coreBody.children),
          currentEnvironment,
          category,
          parentInvocation,
          lexicalModule,
          contexts,
          true,
          recursiveBinding,
        );
        if (nested.syntax.length === 0) {
          currentEnvironment = nested.environment;
          index += coreBody === compactCoreBody ? 2 : 3;
          continue;
        }
        const origins = [...new Set(nested.syntax.map(({ origin }) => origin))];
        output.push(
          createProtectedSyntax({
            id: options.allocateSyntaxId(),
            span: spanEnvelope(nested.syntax.map(({ span }) => span)),
            origin:
              origins.length === 1
                ? origins[0]!
                : options.origins.composed(origins),
            scopes: nested.syntax[0]?.scopes ?? node.scopes,
            category,
            children: nested.syntax,
          }),
        );
        currentEnvironment = nested.environment;
        index += coreBody === compactCoreBody ? 2 : 3;
        continue;
      }
      const sourceOf = (syntax: Syntax): SourceId | undefined =>
        options.origins.selectPrimarySource(syntax.origin)?.sourceId;
      const resolveSpelling = (
        spelling: string,
        position: number,
        positionSourceId?: SourceId | undefined,
      ) => {
        const recursiveMacro = lexicalModule.get(spelling, category);
        if (
          recursiveBinding !== undefined &&
          recursiveMacro?.binding.id === recursiveBinding
        )
          return recursiveMacro;
        const generatedMacro = activeModules
          .slice(options.modules?.length ?? 1)
          .reverse()
          .map((module) => module.get(spelling, category))
          .find((macro) => macro !== undefined);
        if (generatedMacro !== undefined) return generatedMacro;
        if (options.resolveMacro !== undefined) {
          return options.resolveMacro({
            spelling,
            category,
            modules: activeModules,
            lexicalModule,
            position,
            positionSourceId,
          });
        }
        return options.expansionStore !== undefined &&
          activeExpansionEnvironment !== undefined
          ? activeModules
              .map((module) =>
                resolveCompiledMacro({
                  module,
                  store: options.expansionStore!,
                  environment: activeExpansionEnvironment!,
                  spelling,
                  category,
                  phase: options.phase,
                }),
              )
              .find((macro) => macro !== undefined)
          : [...activeModules]
              .reverse()
              .map((module) => module.get(spelling, category))
              .find((macro) => macro !== undefined);
      };
      let resolvedHeadIndex = index;
      let resolvedSpelling = node.tag === "token" ? node.raw : "";
      let resolvedMacro =
        node.tag === "token"
          ? resolveSpelling(node.raw, node.span.start, sourceOf(node))
          : undefined;
      if (
        resolvedMacro === undefined &&
        node.tag === "group" &&
        node.delimiter === "parenthesis"
      ) {
        const punctuationHeads = activeModules
          .flatMap(({ macros }) => macros)
          .filter(
            (candidate) =>
              candidate.category === category &&
              candidate.binding.kind === "macro" &&
              // Only a punctuation-spelled macro turns its enclosing
              // parentheses into the invocation. An identifier-spelled macro
              // in this position is just the head of a parenthesized
              // expression, and treating the group as its invocation consumes
              // the parentheses and stops the expander from descending.
              punctuationSpelled(candidate.binding.spelling) &&
              operatorWidthAt(node.children, 0, candidate.binding.spelling) !==
                undefined,
          )
          .sort(
            (left, right) =>
              right.binding.spelling.length - left.binding.spelling.length,
          );
        for (const candidate of punctuationHeads) {
          const visible = resolveSpelling(
            candidate.binding.spelling,
            node.span.start,
            sourceOf(node),
          );
          if (visible?.binding.id !== candidate.binding.id) continue;
          resolvedMacro = visible;
          resolvedSpelling = candidate.binding.spelling;
          break;
        }
      }
      if (resolvedMacro === undefined && node.tag === "token") {
        const punctuationHeads = activeModules
          .flatMap(({ macros }) => macros)
          .filter(
            (candidate) =>
              candidate.category === category &&
              candidate.binding.kind === "macro" &&
              operatorWidthAt(input, index, candidate.binding.spelling) !==
                undefined,
          )
          .sort(
            (left, right) =>
              right.binding.spelling.length - left.binding.spelling.length,
          );
        for (const candidate of punctuationHeads) {
          const visible = resolveSpelling(
            candidate.binding.spelling,
            node.span.start,
            sourceOf(node),
          );
          if (visible?.binding.id !== candidate.binding.id) continue;
          resolvedMacro = visible;
          resolvedSpelling = candidate.binding.spelling;
          break;
        }
      }
      if (
        resolvedMacro === undefined &&
        category === "item" &&
        node.tag === "token" &&
        itemDispatchPrefixes.has(node.raw)
      ) {
        let candidateIndex = index;
        while (true) {
          const prefix = input[candidateIndex];
          if (prefix?.tag !== "token" || !itemDispatchPrefixes.has(prefix.raw))
            break;
          candidateIndex += 1;
        }
        const candidate = input[candidateIndex];
        if (candidate?.tag === "token") {
          resolvedMacro = resolveSpelling(
            candidate.raw,
            candidate.span.start,
            sourceOf(candidate),
          );
          resolvedHeadIndex = candidateIndex;
          resolvedSpelling = candidate.raw;
        }
      }
      if (
        resolvedMacro === undefined &&
        (category === "item" || category === "stmt")
      ) {
        // Infix operators dispatch from the beginning of their complete
        // expression, item, or statement rather than from the operator token.
        // Search only the current top-level comma/semicolon-delimited segment;
        // groups delimit nested operands and are recursively visited later.
        for (
          let candidateIndex = index + 1;
          candidateIndex < input.length;
          candidateIndex += 1
        ) {
          const candidate = input[candidateIndex];
          if (candidate?.tag === "group" || candidate?.tag === "protected")
            break;
          if (candidate?.tag !== "token") continue;
          if (candidate.raw === ";" || candidate.raw === ",") break;
          const matches = activeModules
            .flatMap(({ operators }) => operators)
            .filter(
              ({ category: operatorCategory, fixity }) =>
                operatorCategory === category && fixity === "infix",
            )
            .flatMap((operator) => {
              const width = operatorWidthAt(
                input,
                candidateIndex,
                operator.spelling,
              );
              const candidateMacro =
                width === undefined
                  ? undefined
                  : resolveSpelling(
                      operator.spelling,
                      candidate.span.start,
                      sourceOf(candidate),
                    );
              return candidateMacro === undefined ||
                candidateMacro.binding.id !== operator.binding
                ? []
                : [{ candidateMacro, width: width! }];
            })
            .sort((left, right) => right.width - left.width);
          if (matches.length === 0) continue;
          resolvedMacro = matches[0]!.candidateMacro;
          resolvedHeadIndex = candidateIndex;
          resolvedSpelling = candidate.raw;
          break;
        }
      }
      const macro =
        (suppressEveryHead ||
          suppressPending ||
          suppressedHeadIndex === index) &&
        resolvedMacro !== undefined
          ? undefined
          : resolvedMacro;
      if (
        !suppressEveryHead &&
        suppressPending &&
        resolvedMacro !== undefined
      ) {
        suppressPending = false;
        if (resolvedHeadIndex > index) suppressedHeadIndex = resolvedHeadIndex;
      }
      if (suppressedHeadIndex === index) suppressedHeadIndex = undefined;
      if (macro !== undefined) {
        const macroModule =
          activeModules.find(
            (candidate) =>
              candidate.get(macro.binding.spelling, macro.category) === macro,
          ) ??
          activeModules.find(({ macros }) =>
            macros.some(({ binding }) => binding === macro.binding),
          ) ??
          lexicalModule;
        const cursor = createSyntaxCursor(input);
        cursor.advance(index);
        let replacementEnvironment: BindingEnvironment | undefined;
        let eraseReplacement = false;
        const result = invokeMacro({
          ...options,
          macro,
          cursor,
          category,
          contexts,
          coreInterception:
            options.coreInterceptionForMacro?.({
              macro,
              lexicalModule,
              spelling: resolvedSpelling,
              origin: input[resolvedHeadIndex]?.origin ?? node.origin,
            }) ?? options.coreInterception,
          consumeClass:
            options.consumeClassForMacro?.(macro) ?? options.consumeClass,
          environment: currentEnvironment,
          parentInvocation,
          expandReplacement: (request) => {
            const marker = request.syntax[0];
            const body = request.syntax[1];
            if (
              options.generatedDefinitions !== undefined &&
              options.expansionStore !== undefined &&
              activeExpansionEnvironment !== undefined &&
              request.syntax.length === 2 &&
              marker?.tag === "token" &&
              marker.raw === "#syntax" &&
              body?.tag === "group" &&
              body.delimiter === "brace"
            ) {
              const generated = processGeneratedDefinitions({
                syntax: createSyntaxSequence(request.syntax),
                sourceId: options.generatedDefinitions.sourceId,
                phase: options.phase,
                definitionScopes: marker.scopes,
                origins: options.origins,
                store: options.expansionStore,
                environment: activeExpansionEnvironment,
                allocateSyntaxId: options.allocateSyntaxId,
                allocateBindingId: options.allocateBindingId,
                diagnosticOrigin: options.diagnosticOrigin,
              });
              generatedDefinitionTraces.push(generated.trace);
              diagnostics.push(...generated.diagnostics);
              if (generated.accepted && generated.compiled !== undefined) {
                activeExpansionEnvironment = generated.environment;
                activeModules.push(generated.compiled);
              }
              eraseReplacement = true;
              return createProtectedSyntax({
                id: options.allocateSyntaxId(),
                span: spanEnvelope(request.syntax.map(({ span }) => span)),
                origin: marker.origin,
                scopes: marker.scopes,
                category: request.category,
                children: createSyntaxSequence(request.syntax),
              });
            }
            // Give a statement replacement its interior categories before it
            // is walked, so that a macro spliced into an expression position
            // inside it is recognized as an expression. A replacement that
            // does not yet parse as a statement list — because it still holds
            // an unexpanded invocation the parser cannot place — is walked raw
            // exactly as before.
            const preEnforested =
              request.category === "stmt"
                ? options.enforestStatements?.({
                    syntax: request.syntax,
                    contexts,
                  })
                : undefined;
            const nested = visit(
              createSyntaxSequence(preEnforested ?? request.syntax),
              request.environment,
              request.category,
              request.invocationId,
              macroModule,
              contexts,
              false,
              macroModule.definitions.some(
                ({ definition, macro: candidate }) =>
                  candidate === macro &&
                  definition.kind === "syntax" &&
                  definition.recursive,
              )
                ? macro.binding.id
                : recursiveBinding,
            );
            replacementEnvironment = nested.environment;
            return enforestSequence(
              nested.syntax,
              request.category,
              macroModule,
              contexts,
            );
          },
        });
        // Replacement expansion completes before its enclosing invocation.
        // Prepending retains invocation/preorder order: parent, then descendants.
        traces.unshift(result.trace);
        if (!result.expanded) {
          diagnostics.push(result.diagnostic);
          output.push(node);
          if (resolvedHeadIndex > index)
            suppressedHeadIndex = resolvedHeadIndex;
          index += 1;
          continue;
        }
        if (!eraseReplacement) output.push(...result.syntax.children);
        currentEnvironment = replacementEnvironment ?? result.environment;
        if (options.scopeStore.size(result.followingScopes) > 0) {
          input = createSyntaxSequence([
            ...input.slice(0, result.cursor.index),
            ...input
              .slice(result.cursor.index)
              .map((syntax) => addScopes(syntax, result.followingScopes)),
          ]);
        }
        index = result.cursor.index;
        continue;
      }
      if (node.tag === "group" || node.tag === "protected") {
        if (
          node.tag === "group" &&
          (node.delimiter === "jsx-element" ||
            node.delimiter === "jsx-fragment")
        ) {
          const jsxChildren: Syntax[] = [];
          for (const child of node.children) {
            if (
              child.tag === "group" &&
              (child.delimiter === "brace" ||
                child.delimiter === "jsx-element" ||
                child.delimiter === "jsx-fragment")
            ) {
              const nested = visit(
                createSyntaxSequence([child]),
                currentEnvironment,
                "expr",
                parentInvocation,
                lexicalModule,
                contexts,
                false,
                recursiveBinding,
              );
              currentEnvironment = nested.environment;
              jsxChildren.push(...nested.syntax);
            } else jsxChildren.push(child);
          }
          output.push(
            createGroup({
              ...node,
              id: options.allocateSyntaxId(),
              children: createSyntaxSequence(jsxChildren),
            }),
          );
          index += 1;
          continue;
        }
        if (node.tag === "group" && node.delimiter === "template") {
          const children: Syntax[] = [];
          let substitution: Syntax[] = [];
          const expandSubstitution = () => {
            if (substitution.length === 0) return;
            const enforested = enforestSequence(
              createSyntaxSequence(substitution),
              "expr",
              lexicalModule,
              contexts,
            );
            const nested = visit(
              createSyntaxSequence([enforested]),
              currentEnvironment,
              "expr",
              parentInvocation,
              lexicalModule,
              contexts,
              false,
              recursiveBinding,
            );
            currentEnvironment = nested.environment;
            children.push(...nested.syntax);
            substitution = [];
          };
          for (const child of node.children) {
            if (
              child.tag === "token" &&
              (child.kind === "template-head" ||
                child.kind === "template-middle" ||
                child.kind === "template-tail")
            ) {
              expandSubstitution();
              children.push(child);
            } else substitution.push(child);
          }
          expandSubstitution();
          output.push(
            createGroup({
              ...node,
              id: options.allocateSyntaxId(),
              children: createSyntaxSequence(children),
            }),
          );
          index += 1;
          continue;
        }
        if (
          node.tag === "group" &&
          node.delimiter === "bracket" &&
          category === "expr" &&
          activeModules
            .flatMap(({ operators }) => operators)
            .some(
              (operator) =>
                operator.category === "expr" &&
                node.children.some(
                  (_, childIndex) =>
                    operatorWidthAt(
                      node.children,
                      childIndex,
                      operator.spelling,
                    ) !== undefined,
                ),
            )
        ) {
          const children: Syntax[] = [];
          let segment: Syntax[] = [];
          const expandSegment = () => {
            if (segment.length === 0) return;
            const enforested = enforestSequence(
              createSyntaxSequence(segment),
              "expr",
              lexicalModule,
              contexts,
            );
            const nested = visit(
              createSyntaxSequence([enforested]),
              currentEnvironment,
              "expr",
              parentInvocation,
              lexicalModule,
              contexts,
              false,
              recursiveBinding,
            );
            currentEnvironment = nested.environment;
            children.push(...nested.syntax);
            segment = [];
          };
          for (const child of node.children) {
            if (child.tag === "token" && child.raw === ",") {
              expandSegment();
              children.push(child);
            } else segment.push(child);
          }
          expandSegment();
          output.push(
            createGroup({
              ...node,
              id: options.allocateSyntaxId(),
              children: createSyntaxSequence(children),
            }),
          );
          index += 1;
          continue;
        }
        // A raw brace body reached under a statement or item category is a
        // statement list. Enforesting it here assigns interior categories, so
        // an expression macro inside it is seen as an expression rather than
        // walked as part of the enclosing statement. A body that is already
        // enforested, or that does not parse as a statement list, is left for
        // the ordinary descent below.
        const statementBody =
          node.tag === "group" &&
          node.delimiter === "brace" &&
          (category === "stmt" || category === "item") &&
          node.children.some((child) => child.tag === "token")
            ? options.enforestStatements?.({
                syntax: node.children,
                contexts,
              })
            : undefined;
        const nested = visit(
          createSyntaxSequence(statementBody ?? node.children),
          currentEnvironment,
          node.tag === "protected" ? node.category : category,
          parentInvocation,
          lexicalModule,
          node.tag === "protected"
            ? contextsForContainer(node, contexts)
            : contexts,
          false,
          recursiveBinding,
        );
        currentEnvironment = nested.environment;
        if (node.tag === "protected" && nested.syntax.length === 0) {
          index += 1;
          continue;
        }
        output.push(
          node.tag === "group"
            ? createGroup({
                ...node,
                id: options.allocateSyntaxId(),
                children: nested.syntax,
              })
            : createProtectedSyntax({
                ...node,
                id: options.allocateSyntaxId(),
                children: nested.syntax,
              }),
        );
      } else {
        output.push(node);
      }
      index += 1;
    }
    return Object.freeze({
      syntax: createSyntaxSequence(output),
      environment: currentEnvironment,
    });
  };

  const expanded = visit(
    options.syntax,
    options.environment,
    options.category,
    options.parentInvocation,
    options.module,
    options.contexts ?? new Set(),
  );
  const syntax =
    diagnostics.length === 0
      ? expanded.syntax.length === 0
        ? createSyntaxSequence([])
        : createSyntaxSequence([
            enforestSequence(
              expanded.syntax,
              options.category,
              options.module,
              options.contexts ?? new Set(),
            ),
          ])
      : expanded.syntax;
  return Object.freeze({
    syntax,
    environment: expanded.environment,
    traces: Object.freeze(
      [...traces].sort((left, right) => left.invocationId - right.invocationId),
    ),
    diagnostics: Object.freeze(diagnostics),
    generatedDefinitionTraces: Object.freeze(generatedDefinitionTraces),
    generatedModules: Object.freeze(activeModules.slice(1)),
    expansionEnvironment: activeExpansionEnvironment,
  });
}
