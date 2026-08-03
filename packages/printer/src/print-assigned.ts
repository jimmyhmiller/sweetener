import type { MissingToken, Syntax, TokenSyntax } from "@sweet-rewrite/syntax";
import type { NameAssignmentPlan } from "./name-assignment.js";

type PrintItem = Syntax | MissingToken | string;

function pushToken(
  pending: PrintItem[],
  token: TokenSyntax,
  replacements: ReadonlyMap<number, string>,
): void {
  for (let index = token.trailingTrivia.length - 1; index >= 0; index -= 1) {
    pending.push(token.trailingTrivia[index]!.raw);
  }
  pending.push(replacements.get(token.id) ?? token.raw);
  for (let index = token.leadingTrivia.length - 1; index >= 0; index -= 1) {
    pending.push(token.leadingTrivia[index]!.raw);
  }
}

function pushChildren(pending: PrintItem[], children: readonly Syntax[]): void {
  for (let index = children.length - 1; index >= 0; index -= 1) {
    pending.push(children[index]!);
  }
}

/** Prints existing trivia and structure while applying only the planned names. */
export function printWithAssignedNames(
  syntax: Syntax,
  plan: NameAssignmentPlan,
): string {
  const replacements = new Map<number, string>();
  for (const rewrite of plan.rewrites) {
    if (replacements.has(rewrite.syntax)) {
      throw new RangeError(
        `Duplicate rewrite for syntax ${String(rewrite.syntax)}`,
      );
    }
    replacements.set(rewrite.syntax, rewrite.replacement);
  }
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
        pushToken(pending, item, replacements);
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
