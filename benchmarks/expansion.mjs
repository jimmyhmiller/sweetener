import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createPrattExpressionConsumer,
  StopSet,
} from "../packages/enforestation/dist/src/index.js";
import {
  createPhase,
  EnvironmentStore,
  ScopeStore,
} from "../packages/hygiene/dist/src/index.js";
import { parseMacroDefinitions } from "../packages/macro-language/dist/src/index.js";
import { createSyntaxClassConsumer } from "../packages/pattern/dist/src/index.js";
import {
  printLosslessSequence,
  readSyntax,
} from "../packages/reader/dist/src/index.js";
import {
  createIdAllocator,
  createResourceBudget,
  ResourceTracker,
} from "../packages/shared/dist/src/index.js";
import {
  createSyntaxCursor,
  createSyntaxSequence,
  OriginStore,
} from "../packages/syntax/dist/src/index.js";
import {
  compileParsedMacros,
  expandMacroSyntax,
  ExpansionGuard,
} from "../packages/expansion/dist/src/index.js";

const withoutEof = (syntax) =>
  createSyntaxSequence(
    syntax.filter(
      (node) => node.tag !== "token" || node.kind !== "end-of-file",
    ),
  );

export async function defineExpansionBenchmark(repositoryRoot) {
  const definitionText = await readFile(
    join(
      repositoryRoot,
      "fixtures/acceptance/playground/threading/declarative.sts",
    ),
    "utf8",
  );
  const invocation = "pipe(1, $ + 2, $ * 3, String($))";
  return {
    id: "expansion/threading-end-to-end",
    description:
      "Compile a declarative threading macro and expand one hundred invocations",
    run() {
      const phase = createPhase(1);
      const origins = new OriginStore();
      const scopes = new ScopeStore();
      const definitionScopes = scopes.singleton(
        scopes.freshScope("lexical", "benchmark-definition"),
      );
      const definitionRead = readSyntax(definitionText, {
        sourceId: 30,
        scopes: definitionScopes,
        originStore: origins,
      });
      const parsed = parseMacroDefinitions(definitionRead.root, {
        sourceId: 30,
      });
      const bindingIds = createIdAllocator(1_000);
      const syntaxIds = createIdAllocator(10_000);
      const invocationIds = createIdAllocator(1);
      const module = compileParsedMacros(parsed, {
        sourceId: 30,
        phase,
        definitionScopes,
        allocateBindingId: bindingIds.allocate,
        spanForOrigin: (origin) =>
          origins.selectPrimarySource(origin)?.span ?? { start: 0, end: 0 },
      });
      if (definitionRead.diagnostics.length || module.diagnostics.length)
        throw new Error("Expansion benchmark macro did not compile");
      const tracker = new ResourceTracker(createResourceBudget());
      const guard = new ExpansionGuard({ tracker });
      const expression = createPrattExpressionConsumer({
        origins,
        allocateSyntaxId: syntaxIds.allocate,
      });
      const context = {
        category: "expr",
        phase,
        environmentEpoch: 0,
        stopSet: StopSet.empty,
        tracker,
        cancellation: guard.cancellation,
      };
      const consumeClass = createSyntaxClassConsumer(module.syntaxClasses, {
        builtins: {
          token: module.classId("token"),
          tt: module.classId("tt"),
          ident: module.classId("ident"),
        },
        tracker,
        environmentEpoch: 0,
        externalConsumer: (classId, cursor) => {
          if (classId !== module.classId("expr")) return undefined;
          const start = cursor.index;
          const attempt = expression.consume(cursor, context);
          if (!attempt.matched) return undefined;
          const syntax = cursor
            .remainingRange()
            .sequence.slice(start, attempt.cursor.index);
          return {
            cursor: attempt.cursor,
            syntax: createSyntaxSequence(syntax),
            origin: syntax[0].origin,
          };
        },
      });
      const environments = new EnvironmentStore();
      const environment = environments.createRoot();
      let outputTokens = 0;
      for (let index = 0; index < 100; index += 1) {
        const read = readSyntax(invocation, {
          sourceId: 100 + index,
          scopes: scopes.singleton(
            scopes.freshScope("lexical", `benchmark-call-${String(index)}`),
          ),
          originStore: origins,
        });
        const result = expandMacroSyntax({
          module,
          syntax: withoutEof(read.root.children),
          category: "expr",
          consumeClass,
          phase,
          environmentEpoch: environment.epoch,
          scopeStore: scopes,
          origins,
          environments,
          environment,
          tracker,
          guard,
          enforest: ({ syntax }) => {
            const attempt = expression.consume(
              createSyntaxCursor(syntax),
              context,
            );
            if (!attempt.matched || !attempt.cursor.atEnd)
              throw new Error(
                `Expansion benchmark produced invalid expression: ${printLosslessSequence(syntax)}`,
              );
            return attempt.syntax;
          },
          allocateSyntaxId: syntaxIds.allocate,
          allocateBindingId: bindingIds.allocate,
          allocateInvocationId: invocationIds.allocate,
          position: 0,
          admit: () => true,
          diagnosticOrigin: (origin) => {
            const selected = origins.selectPrimarySource(origin);
            return {
              sourceId: selected?.sourceId ?? 100 + index,
              start: selected?.span.start ?? 0,
              end: selected?.span.end ?? 0,
              originId: origin,
            };
          },
        });
        if (result.diagnostics.length > 0)
          throw new Error("Expansion benchmark produced diagnostics");
        outputTokens += result.syntax.length;
      }
      return {
        invocations: 100,
        outputTokens,
        matcherSteps: tracker.usage.matcherSteps,
        templateSteps: tracker.usage.templateSteps,
      };
    },
  };
}
