import type { EditorState } from "@codemirror/state";
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type ViewUpdate,
} from "@codemirror/view";

/**
 * Highlighting for `.sts`, which is TypeScript plus a macro language.
 *
 * Reading it as TypeScript leaves the parts that make it Sweetener — the
 * metavariables, the template operations, the words that declare a macro —
 * looking like ordinary identifiers, which is exactly backwards: those are the
 * parts a reader has not seen before.
 */
export type TokenKind =
  | "comment"
  | "string"
  | "number"
  | "keyword"
  | "macro"
  | "meta"
  | "operation"
  | "type"
  | "punctuation"
  | "plain";

export interface Token {
  readonly text: string;
  readonly kind: TokenKind;
}

/** Words that declare or configure a macro, rather than ordinary TypeScript. */
const macroWords = new Set([
  "syntax",
  "operator",
  "rule",
  "rec",
  "fields",
  "fixity",
  "infix",
  "prefix",
  "postfix",
  "associativity",
  "precedence",
  "expect",
  "refine",
  "bind",
  "fallback",
  "shadows",
  "core",
  "literal",
  "context",
  "lexical",
  "following",
]);

const keywords = new Set([
  "as",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "constructor",
  "continue",
  "declare",
  "default",
  "delete",
  "do",
  "else",
  "export",
  "extends",
  "false",
  "for",
  "from",
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
  "of",
  "readonly",
  "return",
  "static",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "type",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "yield",
]);

const builtinTypes = new Set([
  "any",
  "bigint",
  "boolean",
  "never",
  "number",
  "object",
  "string",
  "symbol",
  "unknown",
]);

const identifierStart = /[A-Za-z_]/u;
const identifierPart = /[A-Za-z0-9_]/u;

interface State {
  block: boolean;
  template: boolean;
}

/**
 * One token from the front of `text`, or undefined at the end of it.
 *
 * Line-oriented, with the two constructs that survive a line break carried in
 * `state` so a block comment or a template literal stays one colour.
 */
function next(
  text: string,
  state: State,
): { readonly length: number; readonly kind: TokenKind } | undefined {
  if (text.length === 0) return undefined;

  if (state.block) {
    const close = text.indexOf("*/");
    if (close < 0) return { length: text.length, kind: "comment" };
    state.block = false;
    return { length: close + 2, kind: "comment" };
  }

  if (state.template) {
    // `${` hands the rest of the line back to ordinary tokenizing.
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === "\\") {
        index += 1;
        continue;
      }
      if (text.startsWith("${", index))
        return { length: index === 0 ? 2 : index, kind: "string" };
      if (text[index] === "`") {
        state.template = false;
        return { length: index + 1, kind: "string" };
      }
    }
    return { length: text.length, kind: "string" };
  }

  const character = text[0]!;

  if (text.startsWith("//")) return { length: text.length, kind: "comment" };
  if (text.startsWith("/*")) {
    const close = text.indexOf("*/", 2);
    if (close < 0) {
      state.block = true;
      return { length: text.length, kind: "comment" };
    }
    return { length: close + 2, kind: "comment" };
  }

  if (character === "`") {
    state.template = true;
    return { length: 1, kind: "string" };
  }

  if (character === '"' || character === "'") {
    for (let index = 1; index < text.length; index += 1) {
      if (text[index] === "\\") {
        index += 1;
        continue;
      }
      if (text[index] === character)
        return { length: index + 1, kind: "string" };
    }
    return { length: text.length, kind: "string" };
  }

  // A metavariable, and the field access that may follow it: `$arm.body`.
  if (character === "$") {
    let index = 1;
    while (index < text.length && identifierPart.test(text[index]!)) index += 1;
    if (text[index] === "." && identifierStart.test(text[index + 1] ?? "")) {
      index += 1;
      while (index < text.length && identifierPart.test(text[index]!))
        index += 1;
    }
    return { length: Math.max(index, 1), kind: "meta" };
  }

  // A template operation: `#text`, `#if`, `#core`.
  if (character === "#" && identifierStart.test(text[1] ?? "")) {
    let index = 1;
    while (index < text.length && identifierPart.test(text[index]!)) index += 1;
    return { length: index, kind: "operation" };
  }

  if (/[0-9]/u.test(character)) {
    let index = 0;
    while (index < text.length && /[0-9._a-zA-Z]/u.test(text[index]!))
      index += 1;
    return { length: index, kind: "number" };
  }

  if (identifierStart.test(character)) {
    let index = 0;
    while (index < text.length && identifierPart.test(text[index]!)) index += 1;
    const word = text.slice(0, index);
    return {
      length: index,
      kind: macroWords.has(word)
        ? "macro"
        : keywords.has(word)
          ? "keyword"
          : builtinTypes.has(word)
            ? "type"
            : "plain",
    };
  }

  if (/\s/u.test(character)) {
    let index = 0;
    while (index < text.length && /\s/u.test(text[index]!)) index += 1;
    return { length: index, kind: "plain" };
  }

  return { length: 1, kind: "punctuation" };
}

/** The whole of a snippet, for rendering it outside an editor. */
export function tokenize(source: string): readonly Token[] {
  const state: State = { block: false, template: false };
  const tokens: Token[] = [];
  for (const [index, line] of source.split("\n").entries()) {
    if (index > 0) tokens.push({ text: "\n", kind: "plain" });
    let rest = line;
    while (rest.length > 0) {
      const token = next(rest, state);
      if (token === undefined) break;
      tokens.push({ text: rest.slice(0, token.length), kind: token.kind });
      rest = rest.slice(token.length);
    }
  }
  return tokens;
}

/**
 * The same rules, as CodeMirror decorations.
 *
 * Decorations rather than a stream language so the classes are exactly the
 * ones the stylesheet names, instead of going through a tag mapping and
 * hoping. The documents here are a screen or two, so the whole of one is
 * marked at once.
 */
function decorationsFor(state: EditorState): DecorationSet {
  const marks: ReturnType<typeof Decoration.mark>[] = [];
  const from: number[] = [];
  const to: number[] = [];
  let offset = 0;
  for (const token of tokenize(state.doc.toString())) {
    const end = offset + token.text.length;
    if (token.kind !== "plain" && token.kind !== "punctuation") {
      marks.push(Decoration.mark({ class: `tok-${token.kind}` }));
      from.push(offset);
      to.push(end);
    }
    offset = end;
  }
  return Decoration.set(
    marks.map((mark, index) => mark.range(from[index]!, to[index]!)),
  );
}

export const sweetHighlighting = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = decorationsFor(view.state);
    }

    update(update: ViewUpdate) {
      if (update.docChanged) this.decorations = decorationsFor(update.state);
    }
  },
  { decorations: (value) => value.decorations },
);
