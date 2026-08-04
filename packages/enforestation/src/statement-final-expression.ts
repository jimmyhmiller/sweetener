import type { SyntaxId } from "@sweetener/shared";
import {
  createProtectedSyntax,
  type OriginStore,
  type ProtectedSyntax,
  type Syntax,
  type SyntaxCursor,
  type TokenSyntax,
} from "@sweetener/syntax";
import {
  createConsumerFailure,
  type ConsumerContext,
  type ConsumerFailure,
  type SyntaxConsumer,
} from "./consumer.js";

export interface StatementFinalExpressionOptions {
  readonly allocateSyntaxId: () => SyntaxId;
  readonly origins: OriginStore;
  readonly statement: SyntaxConsumer;
  readonly expression: SyntaxConsumer;
}

export interface StatementFinalExpressionSkeleton {
  readonly syntax: ProtectedSyntax;
  readonly statements: readonly ProtectedSyntax[];
  readonly completion: "implicit-expression" | "explicit-return";
  readonly finalExpression: ProtectedSyntax | undefined;
  readonly explicitReturn: ProtectedSyntax | undefined;
}

export interface StatementFinalExpressionSuccess {
  readonly matched: true;
  readonly skeleton: StatementFinalExpressionSkeleton;
  readonly cursor: SyntaxCursor;
}

export interface StatementFinalExpressionFailure {
  readonly matched: false;
  readonly failure: ConsumerFailure;
  readonly cursor: SyntaxCursor;
}

export type StatementFinalExpressionResult =
  StatementFinalExpressionSuccess | StatementFinalExpressionFailure;

function token(
  syntax: Syntax | undefined,
  raw?: string,
): syntax is TokenSyntax {
  return syntax?.tag === "token" && (raw === undefined || syntax.raw === raw);
}

function originFor(origins: OriginStore, children: readonly Syntax[]) {
  const unique = [...new Set(children.map(({ origin }) => origin))];
  return unique.length === 1 ? unique[0]! : origins.composed(unique);
}

function protect(
  options: StatementFinalExpressionOptions,
  children: readonly Syntax[],
): ProtectedSyntax {
  if (children.length === 0)
    throw new RangeError("Cannot protect an empty statement/expression body");
  return createProtectedSyntax({
    id: options.allocateSyntaxId(),
    span: {
      start: Math.min(...children.map(({ span }) => span.start)),
      end: Math.max(...children.map(({ span }) => span.end)),
    },
    origin: originFor(options.origins, children),
    scopes: children[0]!.scopes,
    category: "tt",
    children,
  });
}

function atBoundary(cursor: SyntaxCursor, context: ConsumerContext): boolean {
  return cursor.atEnd || context.stopSet.matches(cursor);
}

function expressionFromReturn(
  statement: ProtectedSyntax,
): ProtectedSyntax | undefined {
  return statement.children.find(
    (child): child is ProtectedSyntax =>
      child.tag === "protected" && child.category === "expr",
  );
}

function finalFailure(
  cursor: SyntaxCursor,
  start: number,
): StatementFinalExpressionFailure {
  return Object.freeze({
    matched: false,
    cursor,
    failure: createConsumerFailure({
      category: "tt",
      cursor: cursor.identity,
      progress: cursor.index - start,
      specificity: 40,
      expectations: ["final expression or return statement"],
    }),
  });
}

export function consumeStatementPrefixFinalExpression(
  input: SyntaxCursor,
  context: ConsumerContext,
  options: StatementFinalExpressionOptions,
): StatementFinalExpressionResult {
  const start = input.index;
  let cursor = input.fork();
  const statements: ProtectedSyntax[] = [];
  while (!atBoundary(cursor, context)) {
    context.cancellation.throwIfCancellationRequested();
    context.tracker.checkDeadline();
    context.tracker.chargeMatcherSteps();

    if (token(cursor.peek(), "return")) {
      const returned = options.statement.consume(cursor.fork(), {
        ...context,
        category: "stmt",
      });
      if (returned.matched && atBoundary(returned.cursor, context)) {
        const original = cursor
          .remainingRange()
          .sequence.slice(start, returned.cursor.index);
        return Object.freeze({
          matched: true,
          cursor: returned.cursor,
          skeleton: Object.freeze({
            syntax: protect(options, original),
            statements: Object.freeze(statements),
            completion: "explicit-return",
            finalExpression: expressionFromReturn(returned.syntax),
            explicitReturn: returned.syntax,
          }),
        });
      }
    }

    const expression = options.expression.consume(cursor.fork(), {
      ...context,
      category: "expr",
    });
    if (expression.matched && atBoundary(expression.cursor, context)) {
      const original = cursor
        .remainingRange()
        .sequence.slice(start, expression.cursor.index);
      return Object.freeze({
        matched: true,
        cursor: expression.cursor,
        skeleton: Object.freeze({
          syntax: protect(options, original),
          statements: Object.freeze(statements),
          completion: "implicit-expression",
          finalExpression: expression.syntax,
          explicitReturn: undefined,
        }),
      });
    }

    const statement = options.statement.consume(cursor.fork(), {
      ...context,
      category: "stmt",
    });
    if (!statement.matched || statement.cursor.index <= cursor.index) {
      return finalFailure(cursor, start);
    }
    statements.push(statement.syntax);
    cursor = statement.cursor;
  }
  return finalFailure(cursor, start);
}
