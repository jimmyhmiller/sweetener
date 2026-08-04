/**
 * Directive-prologue scanning.
 *
 * A file opts into macro expansion either through its extension or by opening
 * with a `"use sweetener"` directive. Detecting the directive has to happen
 * before the file is read into syntax, because loading a file that never opted
 * in would attribute its diagnostics to a project that does not own it. This
 * module therefore scans the raw prologue directly instead of reusing the
 * token reader.
 */

export const sweetenerDirective = "use sweetener";

export interface SourceDirective {
  /** Directive text without its quotes. */
  readonly value: string;
  /** Offset of the opening quote. */
  readonly start: number;
  /** Offset past the statement, including its terminating semicolon. */
  readonly end: number;
}

const lineTerminators = new Set(["\n", "\r", "\u2028", "\u2029"]);

/**
 * Characters that continue an expression after a string literal. Their
 * presence means the literal heads an ordinary expression statement rather
 * than a directive, so the prologue has ended.
 */
const continuesExpression = new Set([
  "+",
  "-",
  "*",
  "/",
  "%",
  ".",
  ",",
  "?",
  ":",
  "(",
  "[",
  "`",
  "=",
  "<",
  ">",
  "!",
  "&",
  "|",
  "^",
  "~",
]);

function skipTrivia(text: string, from: number): number {
  let index = from;
  while (index < text.length) {
    const char = text[index]!;
    if (char === "/" && text[index + 1] === "/") {
      index += 2;
      while (index < text.length && !lineTerminators.has(text[index]!))
        index += 1;
      continue;
    }
    if (char === "/" && text[index + 1] === "*") {
      const close = text.indexOf("*/", index + 2);
      // An unterminated block comment swallows the rest of the file, so there
      // is no prologue left to find.
      if (close < 0) return text.length;
      index = close + 2;
      continue;
    }
    if (/\s/u.test(char)) {
      index += 1;
      continue;
    }
    return index;
  }
  return index;
}

/**
 * Read one string literal starting at `from`, returning its unescaped value
 * and the offset past the closing quote. Literals containing escapes are
 * rejected: a directive is compared against its source text, and resolving
 * escapes here would let `"use sweetener"` opt a file in through a
 * spelling the reader would not recognize.
 */
function readStringLiteral(
  text: string,
  from: number,
): { readonly value: string; readonly end: number } | undefined {
  const quote = text[from];
  if (quote !== '"' && quote !== "'") return undefined;
  let index = from + 1;
  while (index < text.length) {
    const char = text[index]!;
    if (char === "\\") return undefined;
    if (lineTerminators.has(char)) return undefined;
    if (char === quote)
      return { value: text.slice(from + 1, index), end: index + 1 };
    index += 1;
  }
  return undefined;
}

/** Every directive in the file's opening prologue, in source order. */
export function readDirectivePrologue(
  text: string,
): readonly SourceDirective[] {
  const directives: SourceDirective[] = [];
  let index = 0;
  if (text.startsWith("#!"))
    while (index < text.length && !lineTerminators.has(text[index]!))
      index += 1;
  while (true) {
    const start = skipTrivia(text, index);
    const literal = readStringLiteral(text, start);
    if (literal === undefined) return Object.freeze(directives);
    const after = skipTrivia(text, literal.end);
    const next = text[after];
    if (next !== undefined && continuesExpression.has(next))
      return Object.freeze(directives);
    const end = next === ";" ? after + 1 : literal.end;
    directives.push(Object.freeze({ value: literal.value, start, end }));
    index = end;
  }
}

/** The `"use sweetener"` directive, when the file opens with one. */
export function findSweetenerDirective(
  text: string,
): SourceDirective | undefined {
  // Cheap rejection first: the overwhelming majority of files in a project
  // never mention the directive, and each one would otherwise pay for a
  // prologue scan.
  if (!text.includes(sweetenerDirective)) return undefined;
  return readDirectivePrologue(text).find(
    ({ value }) => value === sweetenerDirective,
  );
}
