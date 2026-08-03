import type { OriginId, SyntaxClassId } from "@sweet-rewrite/shared";
import type { CursorIdentity, DelimiterKind } from "@sweet-rewrite/syntax";
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
