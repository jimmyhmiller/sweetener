import type { CaptureId } from "@sweetener/shared";
import type { DelimiterKind, TokenKind, TokenSyntax } from "@sweetener/syntax";
import type { LiteralKey } from "./ast.js";
import type { CaptureRecord, CaptureValue } from "./capture-record.js";

export type LengthComparison =
  "equal" | "less-than" | "at-most" | "greater-than" | "at-least";

export type RefinementPredicate =
  | { readonly kind: "token-kind"; readonly tokenKinds: readonly TokenKind[] }
  | { readonly kind: "spelling-equals"; readonly spelling: string }
  | { readonly kind: "spelling-in"; readonly spellings: readonly string[] }
  | { readonly kind: "starts-with-lowercase" }
  | { readonly kind: "starts-with-uppercase" }
  | {
      readonly kind: "boundary";
      readonly side: "preceding" | "following";
      readonly literal: LiteralKey;
    }
  | { readonly kind: "selected-alternative"; readonly alternative: number }
  | {
      readonly kind: "repetition-length";
      readonly comparison: LengthComparison;
      readonly length: number;
    }
  | { readonly kind: "delimiter"; readonly delimiter: DelimiterKind };

export interface CaptureRefinement {
  readonly target: CaptureId;
  readonly predicate: RefinementPredicate;
}

export interface RefinementEvaluationContext {
  readonly selectedAlternatives?: ReadonlyMap<CaptureId, number> | undefined;
  readonly precedingTokens?: ReadonlyMap<CaptureId, TokenSyntax> | undefined;
  readonly followingTokens?: ReadonlyMap<CaptureId, TokenSyntax> | undefined;
}

function sortedUnique(values: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(values)].sort((left, right) => left.localeCompare(right)),
  );
}

export function createRefinement(
  target: CaptureId,
  predicate: RefinementPredicate,
): CaptureRefinement {
  let normalized: RefinementPredicate;
  switch (predicate.kind) {
    case "token-kind":
      if (predicate.tokenKinds.length === 0)
        throw new RangeError(
          "Token-kind refinement requires at least one kind",
        );
      normalized = Object.freeze({
        ...predicate,
        tokenKinds: sortedUnique(predicate.tokenKinds) as readonly TokenKind[],
      });
      break;
    case "spelling-equals":
      if (predicate.spelling.length === 0)
        throw new RangeError("Spelling refinement must not be empty");
      normalized = Object.freeze({ ...predicate });
      break;
    case "spelling-in":
      if (predicate.spellings.length === 0)
        throw new RangeError("Spelling-set refinement must not be empty");
      normalized = Object.freeze({
        ...predicate,
        spellings: sortedUnique(predicate.spellings),
      });
      break;
    case "selected-alternative":
      if (
        !Number.isSafeInteger(predicate.alternative) ||
        predicate.alternative < 0
      )
        throw new RangeError(
          "Alternative index must be a non-negative safe integer",
        );
      normalized = Object.freeze({ ...predicate });
      break;
    case "repetition-length":
      if (!Number.isSafeInteger(predicate.length) || predicate.length < 0)
        throw new RangeError(
          "Repetition length must be a non-negative safe integer",
        );
      normalized = Object.freeze({ ...predicate });
      break;
    case "boundary":
      if (!Object.isFrozen(predicate.literal))
        throw new TypeError("Boundary literal must be immutable");
      normalized = Object.freeze({ ...predicate });
      break;
    default:
      normalized = Object.freeze({ ...predicate });
      break;
  }
  return Object.freeze({ target, predicate: normalized });
}

function leaves(
  value: CaptureValue,
): readonly Extract<CaptureValue, { kind: "leaf" }>[] {
  const result: Extract<CaptureValue, { kind: "leaf" }>[] = [];
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    if (current.kind === "leaf") result.push(current);
    else pending.push(...current.elements);
  }
  return result;
}

function capturedTokens(value: CaptureValue): readonly TokenSyntax[] {
  return leaves(value).flatMap((leaf) => {
    const token = leaf.syntax.find(
      (syntax): syntax is TokenSyntax => syntax.tag === "token",
    );
    return token === undefined ? [] : [token];
  });
}

function tokenMatchesLiteral(
  token: TokenSyntax | undefined,
  literal: LiteralKey,
): boolean {
  if (token === undefined || literal.kind === "binding") return false;
  return token.kind === literal.tokenKind && token.raw === literal.raw;
}

function compareLength(
  actual: number,
  comparison: LengthComparison,
  expected: number,
): boolean {
  switch (comparison) {
    case "equal":
      return actual === expected;
    case "less-than":
      return actual < expected;
    case "at-most":
      return actual <= expected;
    case "greater-than":
      return actual > expected;
    case "at-least":
      return actual >= expected;
  }
}

export function evaluateRefinement(
  refinement: CaptureRefinement,
  captures: CaptureRecord,
  context: RefinementEvaluationContext = {},
): boolean {
  const value = captures.get(refinement.target);
  if (value === undefined) return false;
  const predicate = refinement.predicate;
  const tokens = capturedTokens(value);
  switch (predicate.kind) {
    case "token-kind":
      return tokens.every((token) => predicate.tokenKinds.includes(token.kind));
    case "spelling-equals":
      return tokens.every((token) => token.raw === predicate.spelling);
    case "spelling-in":
      return tokens.every((token) => predicate.spellings.includes(token.raw));
    case "starts-with-lowercase":
      return tokens.every((token) => /^\p{Ll}/u.test(token.raw));
    case "starts-with-uppercase":
      return tokens.every((token) => /^\p{Lu}/u.test(token.raw));
    case "boundary":
      return tokenMatchesLiteral(
        predicate.side === "preceding"
          ? context.precedingTokens?.get(refinement.target)
          : context.followingTokens?.get(refinement.target),
        predicate.literal,
      );
    case "selected-alternative":
      return (
        context.selectedAlternatives?.get(refinement.target) ===
        predicate.alternative
      );
    case "repetition-length":
      return (
        value.kind === "sequence" &&
        compareLength(
          value.elements.length,
          predicate.comparison,
          predicate.length,
        )
      );
    case "delimiter":
      return leaves(value).every(
        (leaf) =>
          leaf.syntax.length === 1 &&
          leaf.syntax[0]?.tag === "group" &&
          leaf.syntax[0].delimiter === predicate.delimiter,
      );
  }
}

const lengthComparisonWords: Readonly<Record<LengthComparison, string>> = {
  equal: "exactly",
  "less-than": "fewer than",
  "at-most": "at most",
  "greater-than": "more than",
  "at-least": "at least",
};

/**
 * Says what a refinement was written to accept, in the words a diagnostic can
 * use. A rule turned down by a refinement otherwise reports only that no rule
 * matched, which is the one thing the author already knows.
 */
export function describeRefinement(predicate: RefinementPredicate): string {
  const quoted = (values: readonly string[]) =>
    values.map((value) => `\`${value}\``).join(", ");
  switch (predicate.kind) {
    case "starts-with-lowercase":
      return "a name starting with a lowercase letter";
    case "starts-with-uppercase":
      return "a name starting with an uppercase letter";
    case "spelling-equals":
      return `\`${predicate.spelling}\``;
    case "spelling-in":
      return `one of ${quoted(predicate.spellings)}`;
    case "token-kind":
      return `${quoted(predicate.tokenKinds)} where a token was expected`;
    case "delimiter":
      return `a ${predicate.delimiter} group`;
    case "repetition-length":
      return `${lengthComparisonWords[predicate.comparison]} ${String(
        predicate.length,
      )} repetitions`;
    case "boundary":
      return `a boundary on the ${predicate.side} side`;
    case "selected-alternative":
      return `alternative ${String(predicate.alternative)}`;
  }
}

export function evaluateRefinements(
  refinements: readonly CaptureRefinement[],
  captures: CaptureRecord,
  context: RefinementEvaluationContext = {},
): boolean {
  return refinements.every((refinement) =>
    evaluateRefinement(refinement, captures, context),
  );
}
