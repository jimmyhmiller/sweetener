import type { MissingToken, Syntax, TokenSyntax } from "./syntax.js";
import type { Trivia } from "./trivia.js";

declare const structuralHashBrand: unique symbol;

export type StructuralHash = string & {
  readonly [structuralHashBrand]: "StructuralHash";
};

class StableHasher {
  #left = 0x811c9dc5;
  #right = 0x9e3779b9;

  add(value: string | number | undefined): void {
    const text = value === undefined ? "u" : `${typeof value}:${String(value)}`;
    this.#mix(String(text.length));
    this.#mix(":");
    this.#mix(text);
    this.#mix(";");
  }

  digest(): StructuralHash {
    return `${this.#left.toString(16).padStart(8, "0")}${this.#right
      .toString(16)
      .padStart(8, "0")}` as StructuralHash;
  }

  #mix(text: string): void {
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      this.#left = Math.imul(this.#left ^ code, 0x01000193) >>> 0;
      this.#right =
        (Math.imul(this.#right ^ code, 0x85ebca6b) + 0xc2b2ae35) >>> 0;
    }
  }
}

function addTrivia(hasher: StableHasher, trivia: readonly Trivia[]): void {
  hasher.add(trivia.length);
  for (const item of trivia) {
    hasher.add(item.kind);
    hasher.add(item.raw);
    hasher.add(item.hasLineBreak ? 1 : 0);
  }
}

function addBase(hasher: StableHasher, syntax: Syntax | MissingToken): void {
  hasher.add(syntax.origin);
  hasher.add(syntax.scopes);
}

function addToken(hasher: StableHasher, token: TokenSyntax): void {
  addBase(hasher, token);
  hasher.add(token.kind);
  hasher.add(token.raw);
  hasher.add(token.value);
  hasher.add(token.lexicalMode);
  addTrivia(hasher, token.leadingTrivia);
  addTrivia(hasher, token.trailingTrivia);
}

function addSyntax(hasher: StableHasher, syntax: Syntax): void {
  hasher.add(syntax.tag);
  switch (syntax.tag) {
    case "token":
      addToken(hasher, syntax);
      return;
    case "group":
      addBase(hasher, syntax);
      hasher.add(syntax.delimiter);
      addToken(hasher, syntax.open);
      hasher.add(syntax.children.length);
      for (const child of syntax.children) addSyntax(hasher, child);
      hasher.add(syntax.close.tag);
      if (syntax.close.tag === "token") addToken(hasher, syntax.close);
      else {
        addBase(hasher, syntax.close);
        hasher.add(syntax.close.expectedRaw);
      }
      return;
    case "protected":
      addBase(hasher, syntax);
      hasher.add(syntax.category);
      hasher.add(syntax.precedence);
      hasher.add(syntax.children.length);
      for (const child of syntax.children) addSyntax(hasher, child);
      return;
    case "root":
      addBase(hasher, syntax);
      hasher.add(syntax.children.length);
      for (const child of syntax.children) addSyntax(hasher, child);
  }
}

export function syntaxStructuralHash(syntax: Syntax): StructuralHash {
  const hasher = new StableHasher();
  addSyntax(hasher, syntax);
  return hasher.digest();
}

export function syntaxSequenceStructuralHash(
  sequence: readonly Syntax[],
): StructuralHash {
  const hasher = new StableHasher();
  hasher.add(sequence.length);
  for (const syntax of sequence) addSyntax(hasher, syntax);
  return hasher.digest();
}

function triviaEqual(
  left: readonly Trivia[],
  right: readonly Trivia[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (item, index) =>
        item.kind === right[index]?.kind &&
        item.raw === right[index]?.raw &&
        item.hasLineBreak === right[index]?.hasLineBreak,
    )
  );
}

function tokenStructureEqual(left: TokenSyntax, right: TokenSyntax): boolean {
  return (
    left.kind === right.kind &&
    left.raw === right.raw &&
    left.value === right.value &&
    left.lexicalMode === right.lexicalMode &&
    left.origin === right.origin &&
    left.scopes === right.scopes &&
    triviaEqual(left.leadingTrivia, right.leadingTrivia) &&
    triviaEqual(left.trailingTrivia, right.trailingTrivia)
  );
}

export function tokenLiteralEquals(
  left: TokenSyntax,
  right: TokenSyntax,
): boolean {
  return (
    left.kind === right.kind &&
    left.raw === right.raw &&
    left.value === right.value
  );
}

export function syntaxStructuralEquals(left: Syntax, right: Syntax): boolean {
  if (left.tag !== right.tag) return false;
  if (left.tag === "token" && right.tag === "token") {
    return tokenStructureEqual(left, right);
  }
  if (left.origin !== right.origin || left.scopes !== right.scopes)
    return false;
  if (left.tag === "protected" && right.tag === "protected") {
    return (
      left.category === right.category &&
      left.precedence === right.precedence &&
      syntaxSequenceStructuralEquals(left.children, right.children)
    );
  }
  if (left.tag === "root" && right.tag === "root") {
    return syntaxSequenceStructuralEquals(left.children, right.children);
  }
  if (left.tag === "group" && right.tag === "group") {
    const closesEqual =
      left.close.tag === "token" && right.close.tag === "token"
        ? tokenStructureEqual(left.close, right.close)
        : left.close.tag === "missing" && right.close.tag === "missing"
          ? left.close.expectedRaw === right.close.expectedRaw &&
            left.close.origin === right.close.origin &&
            left.close.scopes === right.close.scopes
          : false;
    return (
      left.delimiter === right.delimiter &&
      tokenStructureEqual(left.open, right.open) &&
      closesEqual &&
      syntaxSequenceStructuralEquals(left.children, right.children)
    );
  }
  return false;
}

export function syntaxSequenceStructuralEquals(
  left: readonly Syntax[],
  right: readonly Syntax[],
): boolean {
  return (
    left.length === right.length &&
    left.every((syntax, index) =>
      right[index] === undefined
        ? false
        : syntaxStructuralEquals(syntax, right[index]),
    )
  );
}
