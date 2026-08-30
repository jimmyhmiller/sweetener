import type { OriginId, SyntaxClassId } from "@sweetener/shared";
import type { CursorIdentity, DelimiterKind } from "@sweetener/syntax";
import type { LiteralKey, LookaheadPredicate } from "./ast.js";

export type MatcherExpectation =
  | { readonly kind: "description"; readonly description: string }
  | { readonly kind: "literal"; readonly literal: LiteralKey }
  | { readonly kind: "class"; readonly classId: SyntaxClassId }
  | { readonly kind: "group"; readonly delimiter: DelimiterKind }
  | { readonly kind: "lookahead"; readonly predicate: LookaheadPredicate }
  | { readonly kind: "end-of-group" };

export interface MatchFailure {
  readonly offset: number;
  readonly cursor: CursorIdentity;
  readonly specificity: number;
  readonly expectations: readonly MatcherExpectation[];
  readonly origins: readonly OriginId[];
}

export function expectationSpecificity(
  expectation: MatcherExpectation,
): number {
  switch (expectation.kind) {
    case "description":
      return 7;
    case "end-of-group":
      return 6;
    case "literal":
      return expectation.literal.kind === "binding" ? 5 : 4;
    case "group":
    case "lookahead":
      return 3;
    case "class":
      return 2;
  }
}

export function expectationKey(expectation: MatcherExpectation): string {
  switch (expectation.kind) {
    case "description":
      return `description:${expectation.description}`;
    case "end-of-group":
      return "end-of-group";
    case "class":
      return `class:${String(expectation.classId)}`;
    case "group":
      return `group:${expectation.delimiter}`;
    case "literal":
      return expectation.literal.kind === "binding"
        ? `literal:binding:${String(expectation.literal.binding)}:${expectation.literal.spelling}`
        : `literal:token:${expectation.literal.tokenKind}:${expectation.literal.raw}`;
    case "lookahead":
      return `lookahead:${JSON.stringify(expectation.predicate)}`;
  }
}

const delimiterPhrases: Readonly<Record<DelimiterKind, string>> = Object.freeze(
  {
    parenthesis: "a parenthesised group",
    bracket: "a bracketed group",
    brace: "a braced group",
    template: "a template literal",
    "jsx-element": "a JSX element",
    "jsx-fragment": "a JSX fragment",
  },
);

function phrase(
  expectation: MatcherExpectation,
  describeClass: ((classId: SyntaxClassId) => string | undefined) | undefined,
): string | undefined {
  switch (expectation.kind) {
    case "description":
      return expectation.description;
    case "literal":
      return expectation.literal.kind === "binding"
        ? `\`${expectation.literal.spelling}\``
        : `\`${expectation.literal.raw}\``;
    case "group":
      return delimiterPhrases[expectation.delimiter];
    case "class": {
      // Written as the author would write it in a pattern, without an article,
      // which would have to agree with a name this code cannot inspect.
      const name = describeClass?.(expectation.classId);
      return name === undefined ? undefined : `\`${name}\``;
    }
    case "end-of-group":
      return "the end of the group";
    // A lookahead constrains what may follow rather than naming something the
    // author could have written, so it says nothing useful on its own.
    case "lookahead":
      return undefined;
  }
}

/**
 * What the closest rule was still waiting for, as a phrase for a person.
 *
 * A macro that matches nothing reports how many rules were tried, which says
 * only that something is wrong. The matcher already records what each rule
 * wanted where it stopped; this is that, in the order it would be written.
 */
export function describeExpectations(
  expectations: readonly MatcherExpectation[],
  describeClass?: (classId: SyntaxClassId) => string | undefined,
): string | undefined {
  const phrases = [
    ...new Set(
      expectations.flatMap((expectation) => {
        const text = phrase(expectation, describeClass);
        return text === undefined ? [] : [text];
      }),
    ),
  ];
  if (phrases.length === 0) return undefined;
  if (phrases.length === 1) return `expected ${phrases[0]!}`;
  const last = phrases.at(-1)!;
  return `expected ${phrases.slice(0, -1).join(", ")} or ${last}`;
}
