import { createBinding, createPhase, type Binding } from "@sweetener/hygiene";
import {
  parseMacroDefinitions,
  type MacroDefinition,
} from "@sweetener/macro-language";
import { readSyntax } from "@sweetener/reader";
import type {
  BindingId,
  OriginId,
  ScopeSetId,
  SourceId,
  SourceSpan,
} from "@sweetener/shared";
import type { SyntaxCategory } from "@sweetener/syntax";
import { describe, expect, test } from "vitest";
import {
  coreFormIdentities,
  CoreShadowRegistry,
  ExpansionEnvironmentStore,
  resolveCoreDispatch,
  syntaxSpaceForCategory,
} from "../src/index.js";

const sourceId = 91 as SourceId;
const phase = createPhase(1);
const span = (origin: OriginId): SourceSpan => ({
  sourceId,
  start: Number(origin),
  end: Number(origin) + 1,
});

function definition(source: string): MacroDefinition {
  const parsed = parseMacroDefinitions(
    readSyntax(source, { sourceId, scopes: 0 as ScopeSetId }).root,
    { sourceId },
  );
  expect(parsed.diagnostics).toEqual([]);
  return parsed.definitions[0]!;
}

function binding(
  id: number,
  spelling: string,
  category: SyntaxCategory,
): Binding {
  return createBinding({
    id: id as BindingId,
    spelling,
    scopes: 0 as ScopeSetId,
    phase,
    space: syntaxSpaceForCategory(category),
    declaration: id as OriginId,
    kind: "macro",
  });
}

function dispatch(
  store: ExpansionEnvironmentStore,
  environment: ReturnType<ExpansionEnvironmentStore["createRoot"]>,
  shadows: CoreShadowRegistry,
  spelling: string,
  category: SyntaxCategory,
) {
  return resolveCoreDispatch({
    environments: store,
    environment,
    shadows,
    spelling,
    category,
    phase,
    origin: 99 as OriginId,
    diagnosticOrigin: span,
  });
}

describe("declarative core shadowing", () => {
  test("publishes a deterministic category-qualified core-form inventory", () => {
    const keys = coreFormIdentities.map(
      ({ spelling, category }) => `${category}|${spelling}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(
      expect.arrayContaining([
        "stmt|if",
        "item|import",
        "type|keyof",
        "classElement|constructor",
        "expr|==",
      ]),
    );
    expect(Object.isFrozen(coreFormIdentities)).toBe(true);
  });

  test("explicit local opt-in intercepts a pinned core form", () => {
    const macro = definition(
      "syntax if:stmt shadows core { rule { if } => { ok } }",
    );
    const macroBinding = binding(1, "if", "stmt");
    const registered = new CoreShadowRegistry().withLocal({
      binding: macroBinding,
      definition: macro,
      diagnosticOrigin: span,
    });
    const store = new ExpansionEnvironmentStore();
    const result = dispatch(
      store,
      store.extendBinding(store.createRoot(), macroBinding),
      registered.registry,
      "if",
      "stmt",
    );
    expect(registered.diagnostics).toEqual([]);
    expect(result.kind).toBe("shadow-macro");
    expect(result.trace).toMatchObject({
      decision: "shadow-macro",
      candidates: [1],
      authorized: [1],
      selected: 1,
      definitionOrigin: macro.origin,
    });
  });

  test("ordinary macros cannot silently replace core forms", () => {
    const macro = definition("syntax if:stmt { rule { if } => { ok } }");
    const macroBinding = binding(1, "if", "stmt");
    const registered = new CoreShadowRegistry().withLocal({
      binding: macroBinding,
      definition: macro,
      diagnosticOrigin: span,
    });
    const store = new ExpansionEnvironmentStore();
    expect(
      dispatch(
        store,
        store.extendBinding(store.createRoot(), macroBinding),
        registered.registry,
        "if",
        "stmt",
      ).kind,
    ).toBe("core");
  });

  test("imports require definition-side and import-side opt-in", () => {
    const macro = definition(
      "export syntax if:stmt shadows core { rule { if } => { ok } }",
    );
    const exported = new CoreShadowRegistry().withLocal({
      binding: binding(1, "if", "stmt"),
      definition: macro,
      diagnosticOrigin: span,
    }).metadata;
    const importedBinding = binding(2, "if", "stmt");
    const no = new CoreShadowRegistry().withImport({
      binding: importedBinding,
      exported,
      importOrigin: 20 as OriginId,
      shadowsCore: false,
      diagnosticOrigin: span,
    });
    const yes = new CoreShadowRegistry().withImport({
      binding: importedBinding,
      exported,
      importOrigin: 21 as OriginId,
      shadowsCore: true,
      diagnosticOrigin: span,
    });
    const store = new ExpansionEnvironmentStore();
    const environment = store.extendBinding(
      store.createRoot(),
      importedBinding,
    );
    expect(dispatch(store, environment, no.registry, "if", "stmt").kind).toBe(
      "core",
    );
    const selected = dispatch(store, environment, yes.registry, "if", "stmt");
    expect(selected.kind).toBe("shadow-macro");
    expect(selected.trace.importOrigin).toBe(21);
  });

  test("rejects import opt-in not authorized by the export", () => {
    const macro = definition("export syntax if:stmt { rule { if } => { ok } }");
    const exported = new CoreShadowRegistry().withLocal({
      binding: binding(1, "if", "stmt"),
      definition: macro,
      diagnosticOrigin: span,
    }).metadata;
    const result = new CoreShadowRegistry().withImport({
      binding: binding(2, "if", "stmt"),
      exported,
      importOrigin: 20 as OriginId,
      shadowsCore: true,
      diagnosticOrigin: span,
    });
    expect(result.metadata.authorized).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(["SWR4003"]);
  });

  test("diagnoses non-core spellings that request interception", () => {
    const macro = definition(
      "syntax custom:expr shadows core { rule { custom } => { ok } }",
    );
    const result = new CoreShadowRegistry().withLocal({
      binding: binding(1, "custom", "expr"),
      definition: macro,
      diagnosticOrigin: span,
    });
    expect(result.metadata.authorized).toBe(false);
    expect(result.diagnostics.map(({ code }) => code)).toEqual(["SWR4002"]);
  });

  test("operator interception is accepted only for a real core operator", () => {
    const core = definition(`
      operator (==):expr shadows core {
        fixity infix; associativity none; precedence 30;
        rule { $left:expr == $right:expr } => { same($left, $right) }
      }
    `);
    const custom = definition(`
      operator (|>):expr shadows core {
        fixity infix; associativity none; precedence 30;
        rule { $left:expr |> $right:expr } => { pipe($left, $right) }
      }
    `);
    const accepted = new CoreShadowRegistry().withLocal({
      binding: binding(10, "==", "expr"),
      definition: core,
      diagnosticOrigin: span,
    });
    const rejected = new CoreShadowRegistry().withLocal({
      binding: binding(11, "|>", "expr"),
      definition: custom,
      diagnosticOrigin: span,
    });
    expect(accepted.metadata.authorized).toBe(true);
    expect(accepted.diagnostics).toEqual([]);
    expect(rejected.metadata.authorized).toBe(false);
    expect(rejected.diagnostics.map(({ code }) => code)).toEqual(["SWR4002"]);
  });

  test("nearest lexical bindings block authorized outer shadows", () => {
    const explicit = definition(
      "syntax if:stmt shadows core { rule { if } => { ok } }",
    );
    const ordinary = definition("syntax if:stmt { rule { if } => { ok } }");
    let shadows = new CoreShadowRegistry();
    shadows = shadows.withLocal({
      binding: binding(1, "if", "stmt"),
      definition: explicit,
      diagnosticOrigin: span,
    }).registry;
    shadows = shadows.withLocal({
      binding: binding(2, "if", "stmt"),
      definition: ordinary,
      diagnosticOrigin: span,
    }).registry;
    const store = new ExpansionEnvironmentStore();
    const root = store.extendBinding(
      store.createRoot(),
      binding(1, "if", "stmt"),
    );
    const environment = store.extendBinding(
      store.child(root),
      binding(2, "if", "stmt"),
    );
    const result = dispatch(store, environment, shadows, "if", "stmt");
    expect(result.kind).toBe("core");
    expect(result.trace.candidates).toEqual([2]);
  });

  test("same-scope ambiguity is diagnosed without a selection", () => {
    const macro = definition(
      "syntax if:stmt shadows core { rule { if } => { ok } }",
    );
    let shadows = new CoreShadowRegistry();
    const store = new ExpansionEnvironmentStore();
    let environment = store.createRoot();
    for (const id of [1, 2]) {
      const candidate = binding(id, "if", "stmt");
      shadows = shadows.withLocal({
        binding: candidate,
        definition: macro,
        diagnosticOrigin: span,
      }).registry;
      environment = store.extendBinding(environment, candidate);
    }
    const result = dispatch(store, environment, shadows, "if", "stmt");
    expect(result.kind).toBe("ambiguous");
    if (result.kind === "ambiguous")
      expect(result.diagnostic.code).toBe("SWR4004");
  });

  test("interception is category-specific", () => {
    const macro = definition(
      "syntax function:expr shadows core { rule { function } => { ok } }",
    );
    const candidate = binding(1, "function", "expr");
    const shadows = new CoreShadowRegistry().withLocal({
      binding: candidate,
      definition: macro,
      diagnosticOrigin: span,
    }).registry;
    const store = new ExpansionEnvironmentStore();
    const environment = store.extendBinding(store.createRoot(), candidate);
    expect(dispatch(store, environment, shadows, "function", "expr").kind).toBe(
      "shadow-macro",
    );
    expect(dispatch(store, environment, shadows, "function", "item").kind).toBe(
      "core",
    );
  });
});
