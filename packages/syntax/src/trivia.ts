import type { Span } from "./span.js";
import { createSpan } from "./span.js";

export type TriviaKind =
  | "whitespace"
  | "line-comment"
  | "block-comment"
  | "shebang"
  | "conflict-marker";

export interface Trivia {
  readonly kind: TriviaKind;
  readonly raw: string;
  readonly span: Span;
  readonly hasLineBreak: boolean;
}

export interface CreateTriviaOptions {
  readonly kind: TriviaKind;
  readonly raw: string;
  readonly span: Span;
}

export function createTrivia(options: CreateTriviaOptions): Trivia {
  if (options.raw.length === 0) {
    throw new RangeError("Trivia raw text must not be empty");
  }
  return Object.freeze({
    kind: options.kind,
    raw: options.raw,
    span: createSpan(options.span.start, options.span.end),
    hasLineBreak: /[\r\n\u2028\u2029]/u.test(options.raw),
  });
}
