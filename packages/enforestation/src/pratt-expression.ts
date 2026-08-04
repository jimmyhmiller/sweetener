import type { BindingId } from "@sweetener/shared";
import {
  createPrecedence,
  createProtectedSyntax,
  spanEnvelope,
  type OriginStore,
  type ProtectedSyntax,
  type Syntax,
  type SyntaxCursor,
} from "@sweetener/syntax";
import {
  createConsumerFailure,
  type ConsumerAttempt,
  type ConsumerContext,
  type SyntaxConsumer,
} from "./consumer.js";
import {
  createPrimaryExpressionConsumer,
  type PrimaryExpressionConsumerOptions,
} from "./primary-expression.js";
import { StopSet } from "./stop-set.js";

export type PrattFixity = "prefix" | "infix" | "postfix";
export type PrattAssociativity = "left" | "right" | "none";

export interface CoreOperator {
  readonly spelling: string;
  readonly fixity: PrattFixity;
  readonly precedence: number;
  readonly associativity: PrattAssociativity;
}

function operators(
  spellings: readonly string[],
  fixity: PrattFixity,
  precedence: number,
  associativity: PrattAssociativity,
): CoreOperator[] {
  return spellings.map((spelling) =>
    Object.freeze({ spelling, fixity, precedence, associativity }),
  );
}

export const coreExpressionOperators: readonly CoreOperator[] = Object.freeze([
  ...operators(["++", "--"], "postfix", 170, "none"),
  ...operators(
    [
      "+",
      "-",
      "!",
      "~",
      "typeof",
      "void",
      "delete",
      "await",
      "yield",
      "new",
      "++",
      "--",
    ],
    "prefix",
    160,
    "right",
  ),
  ...operators(["**"], "infix", 150, "right"),
  ...operators(["*", "/", "%"], "infix", 140, "left"),
  ...operators(["+", "-"], "infix", 130, "left"),
  ...operators(["<<", ">>", ">>>"], "infix", 120, "left"),
  ...operators(
    ["<", "<=", ">", ">=", "in", "instanceof", "as", "satisfies"],
    "infix",
    110,
    "left",
  ),
  ...operators(["==", "!=", "===", "!=="], "infix", 100, "left"),
  ...operators(["&"], "infix", 90, "left"),
  ...operators(["^"], "infix", 80, "left"),
  ...operators(["|"], "infix", 70, "left"),
  ...operators(["&&"], "infix", 60, "left"),
  ...operators(["||"], "infix", 50, "left"),
  ...operators(["??"], "infix", 40, "left"),
  ...operators(
    [
      "=",
      "+=",
      "-=",
      "*=",
      "/=",
      "%=",
      "**=",
      "<<=",
      ">>=",
      ">>>=",
      "&=",
      "^=",
      "|=",
      "&&=",
      "||=",
      "??=",
      "=>",
    ],
    "infix",
    20,
    "right",
  ),
  ...operators([","], "infix", 10, "left"),
]);

const coreByKey = new Map(
  coreExpressionOperators.map((operator) => [
    `${operator.fixity}|${operator.spelling}`,
    operator,
  ]),
);

export interface MacroOperatorExpansionInput {
  readonly operator: readonly Syntax[];
  readonly left: ProtectedSyntax | undefined;
  readonly right: ProtectedSyntax | undefined;
  readonly context: ConsumerContext;
}

export interface MacroOperatorCandidate {
  readonly binding: BindingId;
  readonly spelling: string;
  readonly fixity: PrattFixity;
  readonly precedence: number;
  readonly associativity: PrattAssociativity;
  readonly width: number;
  readonly shadowsCore?: boolean | undefined;
  readonly expand: (input: MacroOperatorExpansionInput) => ProtectedSyntax;
}

export type MacroOperatorResolver = (
  cursor: SyntaxCursor,
  fixity: PrattFixity,
  context: ConsumerContext,
) => MacroOperatorCandidate | undefined;

export interface PrattExpressionConsumerOptions extends PrimaryExpressionConsumerOptions {
  readonly resolveMacroOperator?: MacroOperatorResolver | undefined;
  /** Enables the low-precedence comma operator for full Expression contexts. */
  readonly allowComma?: boolean | undefined;
}

interface PrattOperator {
  readonly spelling: string;
  readonly fixity: PrattFixity;
  readonly precedence: number;
  readonly associativity: PrattAssociativity;
  readonly width: number;
  readonly macro: MacroOperatorCandidate | undefined;
}

interface ParsedExpression {
  readonly syntax: ProtectedSyntax;
  readonly cursor: SyntaxCursor;
  readonly outerPrecedence: number;
  readonly unparenthesizedPrefix: boolean;
  readonly mixingFamily: "logical" | "nullish" | undefined;
}

interface PrattContext {
  readonly consumer: ConsumerContext;
  readonly options: PrattExpressionConsumerOptions;
  readonly primary: SyntaxConsumer;
  readonly start: number;
  readonly allowComma: boolean;
}

function tokenSpelling(cursor: SyntaxCursor): string | undefined {
  const syntax = cursor.peek();
  return syntax?.tag === "token" ? syntax.raw : undefined;
}

function resolveOperator(
  cursor: SyntaxCursor,
  fixity: PrattFixity,
  context: PrattContext,
): PrattOperator | undefined {
  const macro = context.options.resolveMacroOperator?.(
    cursor,
    fixity,
    context.consumer,
  );
  if (macro !== undefined) {
    const actualSpelling = Array.from({ length: macro.width }, (_, index) => {
      const syntax = cursor.peek(index);
      return syntax?.tag === "token" ? syntax.raw : "";
    }).join("");
    if (
      macro.fixity !== fixity ||
      !Number.isSafeInteger(macro.width) ||
      macro.width < 1 ||
      actualSpelling !== macro.spelling ||
      !Number.isSafeInteger(macro.precedence) ||
      macro.precedence < 1 ||
      macro.precedence > 1_000_000
    ) {
      throw new TypeError(
        "Macro operator resolver returned an invalid candidate",
      );
    }
    const core = coreByKey.get(`${fixity}|${macro.spelling}`);
    if (core !== undefined && macro.shadowsCore !== true) {
      return { ...core, width: 1, macro: undefined };
    }
    return { ...macro, macro };
  }
  const spelling = tokenSpelling(cursor);
  if (spelling === undefined) return undefined;
  const core = coreByKey.get(`${fixity}|${spelling}`);
  return core === undefined
    ? undefined
    : { ...core, width: 1, macro: undefined };
}

function consumeOperator(
  cursor: SyntaxCursor,
  operator: PrattOperator,
): readonly Syntax[] {
  const syntax: Syntax[] = [];
  for (let index = 0; index < operator.width; index += 1) {
    syntax.push(cursor.consume()!);
  }
  return Object.freeze(syntax);
}

function operatorHasLeadingLineBreak(operator: Syntax | undefined): boolean {
  return (
    operator?.tag === "token" &&
    operator.leadingTrivia.some((trivia) => trivia.hasLineBreak)
  );
}

function outputOrigin(origins: OriginStore, children: readonly Syntax[]) {
  const unique = [...new Set(children.map((child) => child.origin))];
  return unique.length === 1 ? unique[0]! : origins.composed(unique);
}

function protect(
  options: PrattExpressionConsumerOptions,
  children: readonly Syntax[],
  precedence: number,
): ProtectedSyntax {
  const first = children[0]!;
  return createProtectedSyntax({
    id: options.allocateSyntaxId(),
    span: spanEnvelope(children.map(({ span }) => span)),
    origin: outputOrigin(options.origins, children),
    scopes: first.scopes,
    category: "expr",
    precedence: createPrecedence(precedence),
    children,
  });
}

function fail(
  cursor: SyntaxCursor,
  context: PrattContext,
  expectations: readonly string[],
  specificity: number,
): ConsumerAttempt {
  return Object.freeze({
    matched: false,
    failure: createConsumerFailure({
      category: "expr",
      cursor: cursor.identity,
      progress: cursor.index - context.start,
      specificity,
      expectations,
    }),
  });
}

function checkWork(context: PrattContext): void {
  context.consumer.cancellation.throwIfCancellationRequested();
  context.consumer.tracker.checkDeadline();
  context.consumer.tracker.chargeMatcherSteps();
}

function parsePrefix(
  cursor: SyntaxCursor,
  context: PrattContext,
): ParsedExpression | ConsumerAttempt {
  checkWork(context);
  const prefix = resolveOperator(cursor, "prefix", context);
  if (prefix !== undefined) {
    if (prefix.spelling === "yield" && context.consumer.allowYield === false) {
      return fail(cursor, context, ["yield inside a generator"], 9);
    }
    const operator = consumeOperator(cursor, prefix);
    const right = parseExpression(cursor, prefix.precedence, context);
    if ("matched" in right) return right;
    const syntax =
      prefix.macro?.expand({
        operator,
        left: undefined,
        right: right.syntax,
        context: context.consumer,
      }) ??
      protect(context.options, [...operator, right.syntax], prefix.precedence);
    if (syntax.category !== "expr") {
      throw new TypeError(
        "Macro prefix operator returned non-expression syntax",
      );
    }
    return {
      syntax,
      cursor: right.cursor,
      outerPrecedence: prefix.precedence,
      unparenthesizedPrefix: true,
      mixingFamily: undefined,
    };
  }
  const attempt = context.primary.consume(cursor, context.consumer);
  if (!attempt.matched) return attempt;
  return {
    syntax: attempt.syntax,
    cursor: attempt.cursor,
    outerPrecedence: attempt.syntax.precedence ?? 1_000,
    unparenthesizedPrefix: false,
    mixingFamily: undefined,
  };
}

function parseConditional(
  left: ParsedExpression,
  cursor: SyntaxCursor,
  context: PrattContext,
): ParsedExpression | ConsumerAttempt {
  const question = cursor.consume()!;
  const consequentContext: PrattContext = {
    ...context,
    allowComma: true,
    consumer: Object.freeze({
      ...context.consumer,
      stopSet: context.consumer.stopSet.union(
        new StopSet([{ kind: "token", raw: ":" }]),
      ),
    }),
  };
  const consequent = parseExpression(cursor, 0, consequentContext);
  if ("matched" in consequent) return consequent;
  const colon = cursor.peek();
  if (colon?.tag !== "token" || colon.raw !== ":") {
    return fail(cursor, context, ["':' in conditional expression"], 30);
  }
  cursor.advance();
  const alternate = parseExpression(cursor, 20, context);
  if ("matched" in alternate) return alternate;
  return {
    syntax: protect(
      context.options,
      [left.syntax, question, consequent.syntax, colon, alternate.syntax],
      30,
    ),
    cursor: alternate.cursor,
    outerPrecedence: 30,
    unparenthesizedPrefix: false,
    mixingFamily: undefined,
  };
}

function parseExpression(
  cursor: SyntaxCursor,
  minimumPrecedence: number,
  context: PrattContext,
): ParsedExpression | ConsumerAttempt {
  const prefixed = parsePrefix(cursor, context);
  if ("matched" in prefixed) return prefixed;
  let left = prefixed;
  while (!cursor.atEnd && !context.consumer.stopSet.matches(cursor)) {
    checkWork(context);
    const spelling = tokenSpelling(cursor);
    if (spelling === "?" && 30 >= minimumPrecedence) {
      const conditional = parseConditional(left, cursor, context);
      if ("matched" in conditional) return conditional;
      left = conditional;
      continue;
    }
    const postfix = resolveOperator(cursor, "postfix", context);
    if (
      postfix !== undefined &&
      postfix.precedence >= minimumPrecedence &&
      !operatorHasLeadingLineBreak(cursor.peek())
    ) {
      if (
        postfix.associativity === "none" &&
        left.outerPrecedence === postfix.precedence
      ) {
        return fail(
          cursor,
          context,
          [`parentheses around repeated postfix '${postfix.spelling}'`],
          40,
        );
      }
      const operator = consumeOperator(cursor, postfix);
      const syntax =
        postfix.macro?.expand({
          operator,
          left: left.syntax,
          right: undefined,
          context: context.consumer,
        }) ??
        protect(
          context.options,
          [left.syntax, ...operator],
          postfix.precedence,
        );
      if (syntax.category !== "expr") {
        throw new TypeError(
          "Macro postfix operator returned non-expression syntax",
        );
      }
      left = {
        syntax,
        cursor,
        outerPrecedence: postfix.precedence,
        unparenthesizedPrefix: false,
        mixingFamily: left.mixingFamily,
      };
      continue;
    }
    const infix = resolveOperator(cursor, "infix", context);
    if (infix === undefined || infix.precedence < minimumPrecedence) break;
    if (infix.spelling === "," && !context.allowComma) break;
    const mixingFamily =
      infix.spelling === "??"
        ? "nullish"
        : infix.spelling === "&&" || infix.spelling === "||"
          ? "logical"
          : undefined;
    if (
      (mixingFamily === "logical" && left.mixingFamily === "nullish") ||
      (mixingFamily === "nullish" && left.mixingFamily === "logical")
    ) {
      return fail(
        cursor,
        context,
        ["parentheses when mixing '??' with '&&' or '||'"],
        40,
      );
    }
    if (infix.spelling === "**" && left.unparenthesizedPrefix) {
      return fail(
        cursor,
        context,
        ["parentheses around a unary expression before '**'"],
        40,
      );
    }
    if (
      infix.associativity === "none" &&
      left.outerPrecedence === infix.precedence
    ) {
      return fail(
        cursor,
        context,
        [`parentheses around repeated nonassociative '${infix.spelling}'`],
        40,
      );
    }
    const operator = consumeOperator(cursor, infix);
    const rightMinimum =
      infix.associativity === "right" ? infix.precedence : infix.precedence + 1;
    const right = parseExpression(cursor, rightMinimum, context);
    if ("matched" in right) return right;
    if (
      (mixingFamily === "logical" && right.mixingFamily === "nullish") ||
      (mixingFamily === "nullish" && right.mixingFamily === "logical")
    ) {
      return fail(
        cursor,
        context,
        ["parentheses when mixing '??' with '&&' or '||'"],
        40,
      );
    }
    const syntax =
      infix.macro?.expand({
        operator,
        left: left.syntax,
        right: right.syntax,
        context: context.consumer,
      }) ??
      protect(
        context.options,
        [left.syntax, ...operator, right.syntax],
        infix.precedence,
      );
    if (syntax.category !== "expr") {
      throw new TypeError(
        "Macro infix operator returned non-expression syntax",
      );
    }
    left = {
      syntax,
      cursor: right.cursor,
      outerPrecedence: infix.precedence,
      unparenthesizedPrefix: false,
      mixingFamily,
    };
  }
  return left;
}

class PrattExpressionConsumer implements SyntaxConsumer {
  readonly #primary: SyntaxConsumer;

  constructor(readonly options: PrattExpressionConsumerOptions) {
    this.#primary = createPrimaryExpressionConsumer(options);
    Object.freeze(this);
  }

  consume(cursor: SyntaxCursor, consumer: ConsumerContext): ConsumerAttempt {
    const parsed = parseExpression(cursor, 0, {
      consumer,
      options: this.options,
      primary: this.#primary,
      start: cursor.index,
      allowComma: this.options.allowComma ?? false,
    });
    if ("matched" in parsed) return parsed;
    return Object.freeze({
      matched: true,
      syntax: parsed.syntax,
      cursor: parsed.cursor,
    });
  }
}

export function createPrattExpressionConsumer(
  options: PrattExpressionConsumerOptions,
): SyntaxConsumer {
  return Object.freeze(new PrattExpressionConsumer(options));
}
