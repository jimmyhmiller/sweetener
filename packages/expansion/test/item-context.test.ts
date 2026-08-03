import { createBinding, createPhase } from "@sweet-rewrite/hygiene";
import { createItemConsumer } from "@sweet-rewrite/enforestation";
import { parseMacroDefinitions } from "@sweet-rewrite/macro-language";
import { printLosslessSequence, readSyntax } from "@sweet-rewrite/reader";
import {
  createIdAllocator,
  createResourceBudget,
  ResourceTracker,
  type BindingId,
  type ScopeSetId,
  type SourceId,
  type SyntaxId,
} from "@sweet-rewrite/shared";
import {
  createSyntaxCursor,
  createSyntaxSequence,
  OriginStore,
} from "@sweet-rewrite/syntax";
import { describe, expect, test } from "vitest";
import { ExpansionEnvironmentStore, processItemContext } from "../src/index.js";

const sourceId = 107 as SourceId;
const phase = createPhase(1);

function setup(source: string) {
  const origins = new OriginStore();
  const read = readSyntax(source, {
    sourceId,
    scopes: 0 as ScopeSetId,
    originStore: origins,
  });
  expect(read.diagnostics).toEqual([]);
  const parsed = parseMacroDefinitions(read.root, { sourceId });
  const definition = parsed.definitions.find(
    (candidate) => candidate.kind === "syntax",
  );
  const ids = createIdAllocator<SyntaxId>(40_000);
  const syntax = read.root.children.filter(
    (node) => node.tag !== "token" || node.kind !== "end-of-file",
  );
  return {
    origins,
    definition,
    ids,
    syntax,
    cursor: createSyntaxCursor(syntax),
    consumer: createItemConsumer({ origins, allocateSyntaxId: ids.allocate }),
  };
}

describe("source-ordered item definition contexts", () => {
  test("re-enforests each item under the environment produced by prior items", () => {
    const source = `const before = 1;
syntax later:expr { rule { later } => { before } }
const after = 2;`;
    const prepared = setup(source);
    if (prepared.definition?.kind !== "syntax") {
      throw new Error("missing parsed macro definition");
    }
    const store = new ExpansionEnvironmentStore();
    const root = store.createRoot();
    const binding = createBinding({
      id: 700 as BindingId,
      spelling: "later",
      scopes: 0 as ScopeSetId,
      phase,
      space: "syntax-expr",
      declaration: prepared.definition.origin,
      kind: "macro",
    });
    const visibleBeforeItems: boolean[] = [];
    const result = processItemContext({
      store,
      environment: root,
      cursor: prepared.cursor,
      consumer: prepared.consumer,
      phase,
      tracker: new ResourceTracker(createResourceBudget()),
      classify: ({ syntax, environment, index }) => {
        visibleBeforeItems.push(
          store.lookupBindings(environment, {
            spelling: "later",
            phase,
            category: "expr",
          }).length > 0,
        );
        if (index === 1) {
          return Object.freeze({
            kind: "macro-definition" as const,
            definition: prepared.definition!,
            binding,
          });
        }
        return Object.freeze({
          kind: "runtime" as const,
          origin: syntax.origin,
          syntax: createSyntaxSequence(syntax.children),
          bindings: Object.freeze([]),
        });
      },
      validate: () => Object.freeze({ diagnostics: Object.freeze([]) }),
    });
    expect(result.matched).toBe(true);
    expect(result.cursor.atEnd).toBe(true);
    expect(result.items).toHaveLength(3);
    expect(result.steps.map(({ index }) => index)).toEqual([0, 1, 2]);
    expect(result.steps.map(({ kind }) => kind)).toEqual([
      "runtime",
      "macro-definition",
      "runtime",
    ]);
    expect(visibleBeforeItems).toEqual([false, false, true]);
    expect(
      store.lookupBindings(result.environment, {
        spelling: "later",
        phase,
        category: "expr",
      }),
    ).toEqual([binding]);
    const emitted = printLosslessSequence(result.emitted);
    expect(emitted).toContain("const before = 1;");
    expect(emitted).toContain("const after = 2;");
    expect(emitted).not.toContain("syntax later");
  });

  test("retains completed prior items but isolates a malformed next attempt", () => {
    const prepared = setup("const accepted = 1; if value");
    const store = new ExpansionEnvironmentStore();
    const original = prepared.cursor;
    const result = processItemContext({
      store,
      environment: store.createRoot(),
      cursor: original,
      consumer: prepared.consumer,
      phase,
      tracker: new ResourceTracker(createResourceBudget()),
      classify: ({ syntax }) =>
        Object.freeze({
          kind: "runtime" as const,
          origin: syntax.origin,
          syntax: createSyntaxSequence(syntax.children),
          bindings: Object.freeze([]),
        }),
      validate: () => Object.freeze({ diagnostics: Object.freeze([]) }),
    });
    expect(result.matched).toBe(false);
    expect(result.items).toHaveLength(1);
    expect(printLosslessSequence(result.emitted)).toBe("const accepted = 1;");
    expect(result.cursor.index).toBeGreaterThan(0);
    expect(original.index).toBe(0);
  });
});
