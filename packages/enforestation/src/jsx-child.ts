import type { SyntaxId } from "@sweetener/shared";
import {
  createProtectedSyntax,
  spanEnvelope,
  type OriginStore,
  type Syntax,
  type SyntaxCursor,
} from "@sweetener/syntax";
import {
  createConsumerFailure,
  type ConsumerAttempt,
  type ConsumerContext,
  type SyntaxConsumer,
} from "./consumer.js";

export interface JsxChildConsumerOptions {
  readonly allocateSyntaxId: () => SyntaxId;
  readonly origins: OriginStore;
}

/**
 * Text between elements that only lays the source out. JSX discards it, so a
 * pattern should not have to mention it: a child carries the layout around it
 * along with the node itself.
 */
function isLayoutText(syntax: Syntax | undefined): boolean {
  return (
    syntax?.tag === "token" &&
    syntax.kind === "jsx-text" &&
    syntax.raw.trim().length === 0
  );
}

function isChild(syntax: Syntax | undefined): boolean {
  if (syntax === undefined) return false;
  if (syntax.tag === "protected") return syntax.category === "jsxChild";
  if (syntax.tag === "group") {
    return (
      syntax.delimiter === "brace" ||
      syntax.delimiter === "jsx-element" ||
      syntax.delimiter === "jsx-fragment"
    );
  }
  return syntax.tag === "token" && syntax.kind === "jsx-text";
}

/**
 * Consumes one child of a JSX element: a nested element, a fragment, an
 * expression container, or a run of text.
 */
class JsxChildConsumer implements SyntaxConsumer {
  constructor(readonly options: JsxChildConsumerOptions) {
    Object.freeze(this);
  }

  consume(cursor: SyntaxCursor, context: ConsumerContext): ConsumerAttempt {
    const start = cursor.index;
    while (isLayoutText(cursor.peek()) && !context.stopSet.matches(cursor)) {
      cursor.advance();
    }
    if (!isChild(cursor.peek()) || context.stopSet.matches(cursor)) {
      return Object.freeze({
        matched: false,
        failure: createConsumerFailure({
          category: "jsxChild",
          cursor: cursor.identity,
          progress: cursor.index - start,
          specificity: 1,
          expectations: ["element, fragment, expression container, or text"],
        }),
      });
    }
    cursor.advance();
    while (isLayoutText(cursor.peek()) && !context.stopSet.matches(cursor)) {
      cursor.advance();
    }
    const children = cursor
      .fork()
      .remainingRange()
      .sequence.slice(start, cursor.index);
    const first = children[0]!;
    return Object.freeze({
      matched: true,
      syntax: createProtectedSyntax({
        id: this.options.allocateSyntaxId(),
        span: spanEnvelope(children.map(({ span }) => span)),
        origin:
          new Set(children.map(({ origin }) => origin)).size === 1
            ? first.origin
            : this.options.origins.composed(
                children.map(({ origin }) => origin),
              ),
        scopes: first.scopes,
        category: "jsxChild",
        children,
      }),
      cursor,
    });
  }
}

export function createJsxChildConsumer(
  options: JsxChildConsumerOptions,
): SyntaxConsumer {
  return Object.freeze(new JsxChildConsumer(options));
}
