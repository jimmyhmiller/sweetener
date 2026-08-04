import { createPhase } from "@sweetener/hygiene";
import { printLosslessSequence, readSyntax } from "@sweetener/reader";
import {
  createIdAllocator,
  createResourceBudget,
  ResourceTracker,
  type BindingId,
  type EnvironmentEpoch,
  type ScopeSetId,
  type SourceId,
  type SyntaxId,
} from "@sweetener/shared";
import {
  createPrecedence,
  createProtectedSyntax,
  createSyntaxCursor,
  OriginStore,
  type ProtectedSyntax,
  type Syntax,
} from "@sweetener/syntax";
import ts from "typescript";
import { describe, expect, test } from "vitest";
import {
  ConsumerRegistry,
  coreExpressionOperators,
  createPrattExpressionConsumer,
  StopSet,
  type MacroOperatorExpansionInput,
  type MacroOperatorResolver,
} from "../src/index.js";

const sourceId = 89 as SourceId;

function parse(
  source: string,
  resolveMacroOperator?: MacroOperatorResolver,
  allowComma = false,
) {
  const origins = new OriginStore();
  const read = readSyntax(source, {
    sourceId,
    scopes: 0 as ScopeSetId,
    originStore: origins,
  });
  expect(read.diagnostics).toEqual([]);
  const syntax = read.root.children.filter(
    (node) => node.tag !== "token" || node.kind !== "end-of-file",
  );
  const ids = createIdAllocator<SyntaxId>(20_000);
  const registry = new ConsumerRegistry([
    {
      category: "expr",
      consumer: createPrattExpressionConsumer({
        origins,
        allocateSyntaxId: () => ids.allocate(),
        resolveMacroOperator,
        allowComma,
      }),
    },
  ]);
  const cursor = createSyntaxCursor(syntax);
  const result = registry.consume("expr", {
    cursor,
    phase: createPhase(0),
    environmentEpoch: 0 as EnvironmentEpoch,
    tracker: new ResourceTracker(createResourceBudget()),
  });
  return { result, cursor, origins, syntax, ids };
}

function output(source: string, resolver?: MacroOperatorResolver): string {
  const { result } = parse(source, resolver);
  if (!result.matched) {
    throw new Error(result.failure.expectations.join(", "));
  }
  return printLosslessSequence(result.syntax.children);
}

function operatorAt(syntax: ProtectedSyntax, index = 1): string | undefined {
  const child = syntax.children[index];
  return child?.tag === "token" ? child.raw : undefined;
}

describe("Pratt expression consumer", () => {
  test("publishes one deterministic entry per core fixity and spelling", () => {
    const keys = coreExpressionOperators.map(
      ({ fixity, spelling }) => `${fixity}|${spelling}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("infix|**");
    expect(keys).toContain("infix|??=");
    expect(keys).toContain("prefix|typeof");
    expect(keys).toContain("postfix|++");
    expect(Object.isFrozen(coreExpressionOperators)).toBe(true);
  });

  test.each([
    "a + b * c",
    "a * b + c",
    "a ** b ** c",
    "a - b - c",
    "a && b || c",
    "a ?? b",
    "a ? b + c : d * e",
    "a = b = c",
    "a += b * c",
    "x => x + 1",
    "typeof value === 'string'",
    "new Factory().value",
    "++counter + value--",
    "value as Model",
    "value satisfies Model",
  ])("consumes full core expression losslessly: %s", (source) => {
    expect(output(source)).toBe(source);
  });

  test("builds left- and right-associative trees from binding powers", () => {
    const left = parse("a - b - c").result;
    if (!left.matched) throw new Error("expected subtraction");
    expect(operatorAt(left.syntax)).toBe("-");
    const leftOperand = left.syntax.children[0];
    expect(leftOperand?.tag).toBe("protected");
    expect(operatorAt(leftOperand as ProtectedSyntax)).toBe("-");

    const right = parse("a = b = c").result;
    if (!right.matched) throw new Error("expected assignment");
    expect(operatorAt(right.syntax)).toBe("=");
    const rightOperand = right.syntax.children[2];
    expect(rightOperand?.tag).toBe("protected");
    expect(operatorAt(rightOperand as ProtectedSyntax)).toBe("=");
  });

  test("keeps conditional branches at their required precedence", () => {
    const result = parse("test ? yes, also : no = fallback").result;
    if (!result.matched)
      throw new Error(result.failure.expectations.join(", "));
    expect(operatorAt(result.syntax)).toBe("?");
    expect(operatorAt(result.syntax.children[2] as ProtectedSyntax)).toBe(",");
    expect(operatorAt(result.syntax.children[4] as ProtectedSyntax)).toBe("=");
    expect(output("test ? yes, also : no = fallback")).toBe(
      "test ? yes, also : no = fallback",
    );
  });

  test("rejects yield when the lexical context is not a generator", () => {
    const origins = new OriginStore();
    const read = readSyntax("yield value", {
      sourceId,
      scopes: 0 as ScopeSetId,
      originStore: origins,
    });
    const syntax = read.root.children.filter(
      (node) => node.tag !== "token" || node.kind !== "end-of-file",
    );
    const consumer = createPrattExpressionConsumer({
      origins,
      allocateSyntaxId: createIdAllocator<SyntaxId>(25_000).allocate,
    });
    const registry = new ConsumerRegistry([{ category: "expr", consumer }]);
    const rejected = registry.consume("expr", {
      cursor: createSyntaxCursor(syntax),
      phase: createPhase(0),
      environmentEpoch: 0 as EnvironmentEpoch,
      tracker: new ResourceTracker(createResourceBudget()),
      allowYield: false,
    });
    expect(rejected.matched).toBe(false);
    if (rejected.matched) throw new Error("yield unexpectedly matched");
    expect(rejected.failure.expectations).toEqual(["yield inside a generator"]);
    const accepted = registry.consume("expr", {
      cursor: createSyntaxCursor(syntax),
      phase: createPhase(0),
      environmentEpoch: 0 as EnvironmentEpoch,
      tracker: new ResourceTracker(createResourceBudget()),
      allowYield: true,
    });
    expect(accepted.matched).toBe(true);
  });

  test("uses assignment-expression extent by default at comma boundaries", () => {
    const result = parse("first, second").result;
    if (!result.matched) throw new Error("expected first expression");
    expect(printLosslessSequence(result.syntax.children)).toBe("first");
    expect(result.cursor.peek()).toMatchObject({ raw: "," });
    const full = parse("first, second", undefined, true).result;
    if (!full.matched) throw new Error("expected comma expression");
    expect(printLosslessSequence(full.syntax.children)).toBe("first, second");
    expect(full.cursor.atEnd).toBe(true);
  });

  test.each([
    ["a +", "identifier, literal"],
    ["!", "identifier, literal"],
    ["test ? yes", "':' in conditional"],
    ["test ? : no", "identifier, literal"],
    ["value++++", "repeated postfix"],
    ["-value ** power", "unary expression before '**'"],
    ["a ?? b || c", "mixing '??'"],
    ["a && b ?? c", "mixing '??'"],
  ])(
    "rejects malformed or parenthesis-sensitive expression %s",
    (source, expected) => {
      const { result, cursor } = parse(source);
      expect(result.matched).toBe(false);
      if (result.matched) throw new Error("expected failure");
      expect(result.failure.expectations.join(" ")).toContain(expected);
      expect(cursor.index).toBe(0);
    },
  );

  test("does not consume postfix updates across a line break", () => {
    const { result } = parse("value\n++next");
    if (!result.matched) throw new Error("expected first expression");
    expect(printLosslessSequence(result.syntax.children)).toBe("value");
    expect(result.cursor.peek()).toMatchObject({ raw: "++" });
  });

  test("expands a multi-token nonassociative macro operator through the hook", () => {
    let expansions = 0;
    const origins = new OriginStore();
    const ids = createIdAllocator<SyntaxId>(30_000);
    const resolver: MacroOperatorResolver = (cursor, fixity) => {
      const first = cursor.peek();
      const second = cursor.peek(1);
      const width =
        first?.tag === "token" && first.raw === "|>"
          ? 1
          : first?.tag === "token" &&
              second?.tag === "token" &&
              `${first.raw}${second.raw}` === "|>"
            ? 2
            : 0;
      if (fixity !== "infix" || width === 0) return undefined;
      return Object.freeze({
        binding: 700 as BindingId,
        spelling: "|>",
        fixity: "infix",
        precedence: 125,
        associativity: "none",
        width,
        expand: ({ left, operator, right }: MacroOperatorExpansionInput) => {
          expansions += 1;
          const children: Syntax[] = [left!, ...operator, right!];
          return createProtectedSyntax({
            id: ids.allocate(),
            span: {
              start: children[0]!.span.start,
              end: children.at(-1)!.span.end,
            },
            origin: origins.composed([
              ...new Set(children.map(({ origin }) => origin)),
            ]),
            scopes: children[0]!.scopes,
            category: "expr",
            precedence: createPrecedence(125),
            children,
          });
        },
      });
    };
    // Use the parse helper's origin store inside expansion by deriving the origin
    // from operands when the test-local store does not own them.
    const safeResolver: MacroOperatorResolver = (cursor, fixity, context) => {
      const candidate = resolver(cursor, fixity, context);
      if (candidate === undefined) return undefined;
      return Object.freeze({
        ...candidate,
        expand: ({
          left,
          operator,
          right,
          context: expansionContext,
        }: MacroOperatorExpansionInput) => {
          expansions += 1;
          const children: Syntax[] = [left!, ...operator, right!];
          return createProtectedSyntax({
            id: ids.allocate(),
            span: {
              start: children[0]!.span.start,
              end: children.at(-1)!.span.end,
            },
            origin: children[0]!.origin,
            scopes: children[0]!.scopes,
            category: expansionContext.category,
            precedence: createPrecedence(125),
            children,
          });
        },
      });
    };
    expect(output("value |> transform", safeResolver)).toBe(
      "value |> transform",
    );
    expect(expansions).toBe(1);
    const repeated = parse("a |> b |> c", safeResolver).result;
    expect(repeated.matched).toBe(false);
    if (!repeated.matched) {
      expect(repeated.failure.expectations.join(" ")).toContain(
        "nonassociative '|>'",
      );
    }
  });

  test("requires explicit authorization before a macro operator replaces core syntax", () => {
    let expansions = 0;
    const ids = createIdAllocator<SyntaxId>(35_000);
    const resolver =
      (shadowsCore: boolean): MacroOperatorResolver =>
      (cursor, fixity) => {
        const first = cursor.peek();
        if (fixity !== "infix" || first?.tag !== "token" || first.raw !== "+")
          return undefined;
        return Object.freeze({
          binding: 701 as BindingId,
          spelling: "+",
          fixity: "infix" as const,
          precedence: 130,
          associativity: "left" as const,
          width: 1,
          shadowsCore,
          expand: ({
            left,
            operator,
            right,
            context,
          }: MacroOperatorExpansionInput) => {
            expansions += 1;
            const children: Syntax[] = [left!, ...operator, right!];
            return createProtectedSyntax({
              id: ids.allocate(),
              span: {
                start: children[0]!.span.start,
                end: children.at(-1)!.span.end,
              },
              origin: children[0]!.origin,
              scopes: children[0]!.scopes,
              category: context.category,
              precedence: createPrecedence(130),
              children,
            });
          },
        });
      };

    expect(output("left + right", resolver(false))).toBe("left + right");
    expect(expansions).toBe(0);
    expect(output("left + right", resolver(true))).toBe("left + right");
    expect(expansions).toBe(1);
  });

  test.each([
    "a + b * c",
    "a ** b ** c",
    "test ? yes : no",
    "a = b = c",
    "x => x + 1",
    "typeof value === 'string'",
    "new Factory().value",
    "a ?? b",
  ])("matches pinned TypeScript acceptance for %s", (source) => {
    const printed = output(source);
    const transpiled = ts.transpileModule(`const result = (${printed});`, {
      compilerOptions: { strict: true, target: ts.ScriptTarget.ESNext },
      reportDiagnostics: true,
    });
    expect(
      (transpiled.diagnostics ?? []).filter(
        ({ category }) => category === ts.DiagnosticCategory.Error,
      ),
    ).toEqual([]);
  });

  test("stops before an external expression boundary", () => {
    const origins = new OriginStore();
    const read = readSyntax("a + b; next", {
      sourceId,
      scopes: 0 as ScopeSetId,
      originStore: origins,
    });
    const syntax = read.root.children.filter(
      (node) => node.tag !== "token" || node.kind !== "end-of-file",
    );
    const ids = createIdAllocator<SyntaxId>(40_000);
    const registry = new ConsumerRegistry([
      {
        category: "expr",
        consumer: createPrattExpressionConsumer({
          origins,
          allocateSyntaxId: () => ids.allocate(),
        }),
      },
    ]);
    const result = registry.consume("expr", {
      cursor: createSyntaxCursor(syntax),
      phase: createPhase(0),
      environmentEpoch: 0 as EnvironmentEpoch,
      tracker: new ResourceTracker(createResourceBudget()),
      stopSet: new StopSet([{ kind: "token", raw: ";" }]),
    });
    if (!result.matched) throw new Error("expected expression");
    expect(printLosslessSequence(result.syntax.children)).toBe("a + b");
    expect(result.cursor.peek()).toMatchObject({ raw: ";" });
  });
});
