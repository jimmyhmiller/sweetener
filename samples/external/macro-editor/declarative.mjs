import { EnvironmentStore, createPhase, ScopeStore } from "@sweetener/hygiene";
import { parseMacroDefinitions } from "@sweetener/macro-language";
import { createSyntaxClassConsumer } from "@sweetener/pattern";
import { printLosslessSequence, readSyntax } from "@sweetener/reader";
import {
  createIdAllocator,
  createResourceBudget,
  ResourceTracker,
} from "@sweetener/shared";
import {
  createProtectedSyntax,
  createSyntaxSequence,
  OriginStore,
  spanEnvelope,
} from "@sweetener/syntax";
import {
  compileParsedMacros,
  expandMacroSyntax,
  ExpansionGuard,
} from "@sweetener/expansion";
import { printExpandedFile } from "@sweetener/printer";

const definition = `export syntax duplicate:expr {
  rule { duplicate($value:tt) } => { [$value, $value] }
}`;

const withoutEof = (syntax) =>
  createSyntaxSequence(
    syntax.filter(
      (node) => node.tag !== "token" || node.kind !== "end-of-file",
    ),
  );

export function expandDeclarativeInvocation(source) {
  const origins = new OriginStore();
  const scopes = new ScopeStore();
  const phase = createPhase(1);
  const definitionScopes = scopes.singleton(
    scopes.freshScope("lexical", "external-definition"),
  );
  const definitionRead = readSyntax(definition, {
    sourceId: 10,
    scopes: definitionScopes,
    originStore: origins,
  });
  const parsed = parseMacroDefinitions(definitionRead.root, { sourceId: 10 });
  const syntaxIds = createIdAllocator(10_000);
  const bindingIds = createIdAllocator(10_000);
  const invocationIds = createIdAllocator(1);
  const module = compileParsedMacros(parsed, {
    sourceId: 10,
    phase,
    definitionScopes,
    allocateBindingId: bindingIds.allocate,
    spanForOrigin: (origin) =>
      origins.selectPrimarySource(origin)?.span ?? { start: 0, end: 0 },
  });
  if (
    definitionRead.diagnostics.length > 0 ||
    parsed.diagnostics.length > 0 ||
    module.diagnostics.length > 0
  )
    throw new Error("External declarative macro failed to compile");
  const tracker = new ResourceTracker(createResourceBudget());
  const guard = new ExpansionGuard({ tracker });
  const consumeClass = createSyntaxClassConsumer(module.syntaxClasses, {
    builtins: {
      token: module.classId("token"),
      tt: module.classId("tt"),
      ident: module.classId("ident"),
    },
    tracker,
    environmentEpoch: 0,
  });
  const environments = new EnvironmentStore();
  const environment = environments.createRoot();
  const invocationRead = readSyntax(source, {
    sourceId: 20,
    scopes: scopes.singleton(scopes.freshScope("lexical", "external-call")),
    originStore: origins,
  });
  const result = expandMacroSyntax({
    module,
    syntax: withoutEof(invocationRead.root.children),
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
      const originsUsed = [...new Set(syntax.map(({ origin }) => origin))];
      return createProtectedSyntax({
        id: syntaxIds.allocate(),
        span: spanEnvelope(syntax.map(({ span }) => span)),
        origin:
          originsUsed.length === 1
            ? originsUsed[0]
            : origins.composed(originsUsed),
        scopes: syntax[0].scopes,
        category: "expr",
        children: syntax,
      });
    },
    allocateSyntaxId: syntaxIds.allocate,
    allocateBindingId: bindingIds.allocate,
    allocateInvocationId: invocationIds.allocate,
    position: 0,
    admit: () => true,
    diagnosticOrigin: (origin) => {
      const selected = origins.selectPrimarySource(origin);
      return {
        sourceId: selected?.sourceId ?? 20,
        start: selected?.span.start ?? 0,
        end: selected?.span.end ?? 0,
        originId: origin,
      };
    },
  });
  if (invocationRead.diagnostics.length > 0 || result.diagnostics.length > 0)
    throw new Error("External declarative invocation failed to expand");
  const printed = printExpandedFile({
    syntax: result.syntax,
    origins,
    trace: result.traces,
  });
  return {
    source,
    text: printed.text,
    printed,
    origins,
    tracker: tracker.usage,
    trace: result.traces,
    debug: printLosslessSequence(result.syntax),
  };
}
