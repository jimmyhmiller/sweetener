import type { MissingToken, Syntax, TokenSyntax } from "@sweetener/syntax";

type PrintItem = Syntax | MissingToken | string;

function pushToken(pending: PrintItem[], token: TokenSyntax): void {
  for (let index = token.trailingTrivia.length - 1; index >= 0; index -= 1) {
    const trivia = token.trailingTrivia[index];
    if (trivia !== undefined) pending.push(trivia.raw);
  }
  pending.push(token.raw);
  for (let index = token.leadingTrivia.length - 1; index >= 0; index -= 1) {
    const trivia = token.leadingTrivia[index];
    if (trivia !== undefined) pending.push(trivia.raw);
  }
}

function pushChildren(pending: PrintItem[], children: readonly Syntax[]): void {
  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];
    if (child !== undefined) pending.push(child);
  }
}

export function printLossless(syntax: Syntax): string {
  const chunks: string[] = [];
  const pending: PrintItem[] = [syntax];
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === undefined) continue;
    if (typeof item === "string") {
      chunks.push(item);
      continue;
    }
    switch (item.tag) {
      case "missing":
        break;
      case "token":
        pushToken(pending, item);
        break;
      case "group":
        pending.push(item.close);
        pushChildren(pending, item.children);
        pending.push(item.open);
        break;
      case "protected":
      case "root":
        pushChildren(pending, item.children);
        break;
    }
  }
  return chunks.join("");
}

export function printLosslessSequence(sequence: readonly Syntax[]): string {
  const chunks: string[] = [];
  for (const syntax of sequence) chunks.push(printLossless(syntax));
  return chunks.join("");
}
