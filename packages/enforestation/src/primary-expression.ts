import type { SyntaxId } from "@sweetener/shared";
import {
  createPrecedence,
  createProtectedSyntax,
  spanEnvelope,
  type OriginStore,
  type Precedence,
  type Syntax,
  type SyntaxCursor,
  type TokenSyntax,
} from "@sweetener/syntax";
import {
  createConsumerFailure,
  type ConsumerAttempt,
  type ConsumerContext,
  type SyntaxConsumer,
} from "./consumer.js";
import { consumeBalancedTypeArguments } from "./type-class-element.js";

export const primaryExpressionPrecedence: Precedence = createPrecedence(1_000);

export interface PrimaryExpressionConsumerOptions {
  readonly allocateSyntaxId: () => SyntaxId;
  readonly origins: OriginStore;
}

const literalKinds = new Set<TokenSyntax["kind"]>([
  "identifier",
  "private-identifier",
  "numeric-literal",
  "bigint-literal",
  "string-literal",
  "regular-expression-literal",
  "no-substitution-template",
]);

const literalKeywords = new Set([
  "this",
  "super",
  "null",
  "true",
  "false",
  "async",
  "import",
  "new",
]);

function isPrimaryAtom(syntax: Syntax | undefined): boolean {
  if (syntax?.tag === "protected") return syntax.category === "expr";
  if (syntax?.tag === "group") {
    if (syntax.delimiter === "parenthesis") return syntax.children.length > 0;
    return (
      syntax.delimiter === "bracket" ||
      syntax.delimiter === "brace" ||
      syntax.delimiter === "template" ||
      syntax.delimiter === "jsx-element" ||
      syntax.delimiter === "jsx-fragment"
    );
  }
  return (
    syntax?.tag === "token" &&
    (literalKinds.has(syntax.kind) ||
      (syntax.kind === "keyword" && literalKeywords.has(syntax.raw)))
  );
}

function functionExpressionWidth(cursor: SyntaxCursor): number | undefined {
  let offset = 0;
  const first = cursor.peek(offset);
  if (first?.tag === "token" && first.raw === "async") offset += 1;
  const keyword = cursor.peek(offset);
  if (keyword?.tag !== "token" || keyword.raw !== "function") return undefined;
  offset += 1;
  const star = cursor.peek(offset);
  if (star?.tag === "token" && star.raw === "*") offset += 1;
  let parametersOffset: number | undefined;
  for (let candidate = offset; candidate < offset + 32; candidate += 1) {
    const node = cursor.peek(candidate);
    if (node === undefined) return undefined;
    if (node.tag === "group" && node.delimiter === "parenthesis") {
      parametersOffset = candidate;
      break;
    }
  }
  if (parametersOffset === undefined) return undefined;
  for (
    let candidate = parametersOffset + 1;
    candidate < parametersOffset + 33;
    candidate += 1
  ) {
    const node = cursor.peek(candidate);
    if (node === undefined) return undefined;
    if (node.tag === "group" && node.delimiter === "brace")
      return candidate + 1;
  }
  return undefined;
}

function classExpressionWidth(cursor: SyntaxCursor): number | undefined {
  const first = cursor.peek();
  if (first?.tag !== "token" || first.raw !== "class") return undefined;
  for (let candidate = 1; candidate < 33; candidate += 1) {
    const node = cursor.peek(candidate);
    if (node === undefined) return undefined;
    if (node.tag === "group" && node.delimiter === "brace")
      return candidate + 1;
  }
  return undefined;
}

function genericArrowWidth(
  cursor: SyntaxCursor,
  context: ConsumerContext,
): number | undefined {
  const typeParameters = consumeBalancedTypeArguments(cursor, context);
  if (typeParameters === undefined) return undefined;
  let offset = typeParameters.width;
  const parameters = cursor.peek(offset);
  if (parameters?.tag !== "group" || parameters.delimiter !== "parenthesis")
    return undefined;
  offset += 1;
  while (offset < typeParameters.width + 65) {
    const node = cursor.peek(offset);
    if (node === undefined) return undefined;
    if (node.tag === "token" && node.raw === "=>") {
      const body = cursor.peek(offset + 1);
      return body === undefined ? undefined : offset + 2;
    }
    offset += 1;
  }
  return undefined;
}

function isPropertyName(syntax: Syntax | undefined): boolean {
  return (
    syntax?.tag === "token" &&
    (syntax.kind === "identifier" ||
      syntax.kind === "private-identifier" ||
      syntax.kind === "keyword")
  );
}

function isPunctuation(syntax: Syntax | undefined, raw: string): boolean {
  return (
    syntax?.tag === "token" &&
    syntax.kind === "punctuation" &&
    syntax.raw === raw
  );
}

function failure(
  cursor: SyntaxCursor,
  start: number,
  expectations: readonly string[],
  specificity: number,
): ConsumerAttempt {
  return Object.freeze({
    matched: false,
    failure: createConsumerFailure({
      category: "expr",
      cursor: cursor.identity,
      progress: cursor.index - start,
      specificity,
      expectations,
    }),
  });
}

function outputOrigin(origins: OriginStore, syntax: readonly Syntax[]) {
  const unique = [...new Set(syntax.map((node) => node.origin))];
  return unique.length === 1 ? unique[0]! : origins.composed(unique);
}

function consumePostfix(
  cursor: SyntaxCursor,
  context: ConsumerContext,
  start: number,
  optionalChain: boolean,
): ConsumerAttempt | undefined {
  const next = cursor.peek();
  if (context.stopSet.matches(cursor) || next === undefined) return undefined;
  if (isPunctuation(next, ".")) {
    cursor.advance();
    if (!isPropertyName(cursor.peek())) {
      return failure(cursor, start, ["property name after '.'"], 20);
    }
    cursor.advance();
    return undefined;
  }
  if (isPunctuation(next, "?.")) {
    cursor.advance();
    const target = cursor.peek();
    if (
      isPropertyName(target) ||
      (target?.tag === "group" &&
        (target.delimiter === "parenthesis" ||
          (target.delimiter === "bracket" && target.children.length > 0)))
    ) {
      cursor.advance();
      return undefined;
    }
    return failure(cursor, start, ["property, index, or call after '?.'"], 20);
  }
  if (next.tag === "group" && next.delimiter === "bracket") {
    if (next.children.length === 0) {
      cursor.advance();
      return failure(cursor, start, ["expression inside index access"], 20);
    }
    cursor.advance();
    return undefined;
  }
  if (isPunctuation(next, "<")) {
    const typeArguments = consumeBalancedTypeArguments(cursor, context);
    const following =
      typeArguments === undefined
        ? undefined
        : cursor.peek(typeArguments.width);
    if (
      typeArguments !== undefined &&
      following?.tag === "group" &&
      (following.delimiter === "parenthesis" ||
        following.delimiter === "template")
    ) {
      cursor.advance(typeArguments.width + 1);
      return undefined;
    }
  }
  if (
    next.tag === "group" &&
    (next.delimiter === "parenthesis" || next.delimiter === "template")
  ) {
    if (next.delimiter === "template" && optionalChain) {
      return failure(
        cursor,
        start,
        ["tagged template outside an optional chain"],
        20,
      );
    }
    cursor.advance();
    return undefined;
  }
  if (isPunctuation(next, "!")) {
    cursor.advance();
    return undefined;
  }
  if (next.tag === "token" && next.kind === "no-substitution-template") {
    if (optionalChain) {
      return failure(
        cursor,
        start,
        ["tagged template outside an optional chain"],
        20,
      );
    }
    cursor.advance();
    return undefined;
  }
  return undefined;
}

class PrimaryExpressionConsumer implements SyntaxConsumer {
  constructor(readonly options: PrimaryExpressionConsumerOptions) {
    Object.freeze(this);
  }

  consume(cursor: SyntaxCursor, context: ConsumerContext): ConsumerAttempt {
    const start = cursor.index;
    const protectedExpression = cursor.peek();
    if (
      protectedExpression?.tag === "protected" &&
      protectedExpression.category === "expr"
    ) {
      cursor.advance();
      return Object.freeze({
        matched: true,
        syntax: protectedExpression,
        cursor,
      });
    }
    const functionWidth = functionExpressionWidth(cursor);
    const classWidth = classExpressionWidth(cursor);
    const arrowWidth = genericArrowWidth(cursor, context);
    if (
      functionWidth === undefined &&
      classWidth === undefined &&
      arrowWidth === undefined &&
      !isPrimaryAtom(cursor.peek())
    ) {
      return failure(
        cursor,
        start,
        [
          "identifier, literal, function, array, object, template, or parenthesized expression",
        ],
        1,
      );
    }
    cursor.advance(functionWidth ?? classWidth ?? arrowWidth ?? 1);
    let optionalChain = false;
    while (!cursor.atEnd && !context.stopSet.matches(cursor)) {
      const before = cursor.index;
      const beginsOptional = isPunctuation(cursor.peek(), "?.");
      const failed = consumePostfix(cursor, context, start, optionalChain);
      if (failed !== undefined) return failed;
      if (cursor.index === before) break;
      if (beginsOptional) optionalChain = true;
    }
    const consumed = cursor
      .fork()
      .remainingRange()
      .sequence.slice(start, cursor.index);
    const first = consumed[0]!;
    return Object.freeze({
      matched: true,
      syntax: createProtectedSyntax({
        id: this.options.allocateSyntaxId(),
        span: spanEnvelope(consumed.map(({ span }) => span)),
        origin: outputOrigin(this.options.origins, consumed),
        scopes: first.scopes,
        category: "expr",
        precedence: primaryExpressionPrecedence,
        children: consumed,
      }),
      cursor,
    });
  }
}

export function createPrimaryExpressionConsumer(
  options: PrimaryExpressionConsumerOptions,
): SyntaxConsumer {
  return Object.freeze(new PrimaryExpressionConsumer(options));
}
