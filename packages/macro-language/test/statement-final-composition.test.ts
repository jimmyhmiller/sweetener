import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBindingConsumer,
  createPrattExpressionConsumer,
  createStatementConsumer,
  StopSet,
  type ConsumerContext,
} from "@sweet-rewrite/enforestation";
import { createPhase } from "@sweet-rewrite/hygiene";
import {
  compileMatcherProgram,
  createSyntaxClassConsumer,
  executeMatcher,
  inferCaptureShapes,
  type CaptureValue,
} from "@sweet-rewrite/pattern";
import { printLosslessSequence, readSyntax } from "@sweet-rewrite/reader";
import {
  createIdAllocator,
  createResourceBudget,
  neverCancelled,
  ResourceTracker,
  type EnvironmentEpoch,
  type ScopeSetId,
  type SourceId,
  type SyntaxId,
} from "@sweet-rewrite/shared";
import { createSyntaxCursor, OriginStore } from "@sweet-rewrite/syntax";
import { describe, expect, test } from "vitest";
import {
  compileParsedSyntaxClasses,
  parseMacroDefinitions,
} from "../src/index.js";

const sourceId = 131 as SourceId;
const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function capturedText(value: CaptureValue | undefined): readonly string[] {
  if (value === undefined) return [];
  if (value.kind === "leaf") return [printLosslessSequence(value.syntax)];
  return value.elements.flatMap(capturedText);
}

describe("declarative statement/final-expression composition", () => {
  test.each([
    {
      ruleIndex: 0,
      source: "{ const doubled = value * 2; return doubled + 1; }",
      result: " doubled + 1",
    },
    {
      ruleIndex: 1,
      source: "{ const doubled = value * 2; doubled + 1 }",
      result: " doubled + 1",
    },
  ])(
    "executes fixture rule $ruleIndex with production consumers",
    async (fixture) => {
      const origins = new OriginStore();
      const definitionSource = await readFile(
        path.join(
          repositoryRoot,
          "fixtures/acceptance/playground/implicit-return/declarative.sts",
        ),
        "utf8",
      );
      const definitionRead = readSyntax(definitionSource, {
        sourceId,
        scopes: 0 as ScopeSetId,
        originStore: origins,
      });
      const parsed = parseMacroDefinitions(definitionRead.root, { sourceId });
      const classes = compileParsedSyntaxClasses(parsed, {
        sourceId,
        spanForOrigin: (origin) =>
          origins.selectPrimarySource(origin)?.span ?? { start: 0, end: 0 },
      });
      expect(parsed.diagnostics).toEqual([]);
      expect(classes.diagnostics).toEqual([]);
      const definition = parsed.definitions.find(
        (candidate) =>
          candidate.kind === "syntax-class" &&
          candidate.name === "FunctionBody",
      );
      if (definition?.kind !== "syntax-class")
        throw new Error("missing fixture syntax class");
      const rule = definition.rules[fixture.ruleIndex];
      if (rule === undefined) throw new Error("missing fixture rule");
      const inference = inferCaptureShapes(rule.pattern, {
        sourceId,
        spanForOrigin: (origin) =>
          origins.selectPrimarySource(origin)?.span ?? { start: 0, end: 0 },
        fieldsForClass: (classId) => classes.registry.shapeForClass(classId),
      });
      expect(inference.diagnostics).toEqual([]);
      const program = compileMatcherProgram(rule.pattern, {
        rule: rule.id,
        inference,
      });

      const invocation = readSyntax(fixture.source, {
        sourceId,
        scopes: 0 as ScopeSetId,
        originStore: origins,
      });
      const syntax = invocation.root.children.filter(
        (node) => node.tag !== "token" || node.kind !== "end-of-file",
      );
      const ids = createIdAllocator<SyntaxId>(80_000);
      const tracker = new ResourceTracker(createResourceBudget());
      const baseContext = Object.freeze({
        category: "tt" as const,
        phase: createPhase(0),
        environmentEpoch: 0 as EnvironmentEpoch,
        stopSet: StopSet.empty,
        tracker,
        cancellation: neverCancelled,
      });
      const consumerOptions = { origins, allocateSyntaxId: ids.allocate };
      const statement = createStatementConsumer(consumerOptions);
      const expression = createPrattExpressionConsumer(consumerOptions);
      const binding = createBindingConsumer(consumerOptions);
      const classIds = new Map(
        parsed.classBindings.map(({ name, classId }) => [name, classId]),
      );
      const tokenClass = classIds.get("token");
      const ttClass = classIds.get("tt");
      const identClass = classIds.get("ident");
      if (
        tokenClass === undefined ||
        ttClass === undefined ||
        identClass === undefined
      ) {
        throw new Error("missing core classes");
      }
      const external = new Map([
        [classIds.get("stmt"), statement],
        [classIds.get("expr"), expression],
        [classIds.get("binding"), binding],
      ]);
      const consumeClass = createSyntaxClassConsumer(classes.registry, {
        builtins: { token: tokenClass, tt: ttClass, ident: identClass },
        tracker,
        environmentEpoch: baseContext.environmentEpoch,
        externalConsumer: (classId, cursor) => {
          const consumer = external.get(classId);
          if (consumer === undefined) return undefined;
          const category =
            classId === classIds.get("stmt")
              ? "stmt"
              : classId === classIds.get("expr")
                ? "expr"
                : "binding";
          const attempt = consumer.consume(
            cursor,
            Object.freeze({
              ...baseContext,
              category,
            }) as ConsumerContext,
          );
          return attempt.matched
            ? Object.freeze({
                cursor: attempt.cursor,
                syntax: Object.freeze([attempt.syntax]),
                origin: attempt.syntax.origin,
              })
            : undefined;
        },
      });
      const result = executeMatcher(program, createSyntaxCursor(syntax), {
        consumeClass,
        tracker,
        environmentEpoch: baseContext.environmentEpoch,
      });
      expect(result.matched).toBe(true);
      if (!result.matched) throw new Error("fixture rule did not match");
      expect(result.cursor.atEnd).toBe(true);
      const captureByName = new Map(
        program.captureSlots.map(({ name, capture }) => [name, capture]),
      );
      expect(
        capturedText(result.captures.get(captureByName.get("statements")!)),
      ).toHaveLength(1);
      expect(
        capturedText(result.captures.get(captureByName.get("result")!)),
      ).toEqual([fixture.result]);
    },
  );
});
