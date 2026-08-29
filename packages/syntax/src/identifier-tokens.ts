import type { TokenSyntax } from "./syntax.js";

/**
 * Words TypeScript never lets a program use as a plain identifier, including
 * the ones reserved only under strict mode — every module is strict.
 *
 * TypeScript's scanner labels contextual keywords such as `type`, `of` and
 * `undefined` as keywords too, even though they are ordinary identifiers
 * wherever a binding or reference is expected. Listing what is forbidden rather
 * than what is allowed keeps later contextual keywords working on their own.
 */
const reservedWords: ReadonlySet<string> = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "let",
  "new",
  "null",
  "package",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

export function isReservedWord(spelling: string): boolean {
  return reservedWords.has(spelling);
}

/** Whether this token may stand where TypeScript expects an identifier. */
export function isIdentifierToken(token: TokenSyntax): boolean {
  if (token.kind === "identifier") return true;
  return token.kind === "keyword" && !reservedWords.has(token.raw);
}
