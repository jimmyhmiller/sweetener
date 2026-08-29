import type { SyntaxId } from "@sweetener/shared";
import {
  createProtectedSyntax,
  createSyntaxSequence,
  spanEnvelope,
  type GroupSyntax,
  type OriginStore,
  type ProtectedSyntax,
  type Syntax,
  type SyntaxCursor,
  type TokenSyntax,
} from "@sweetener/syntax";
import {
  createConsumerFailure,
  type ConsumerAttempt,
  type ConsumerContext,
  type SyntaxConsumer,
} from "./consumer.js";

export type TypeClassMacroResolver = (
  category: "type" | "classElement",
  cursor: SyntaxCursor,
  context: ConsumerContext,
) => ConsumerAttempt | undefined;

export type TypeClassElementMacroResolver = TypeClassMacroResolver;

export interface TypeClassConsumerOptions {
  readonly allocateSyntaxId: () => SyntaxId;
  readonly origins: OriginStore;
  readonly resolveMacro?: TypeClassMacroResolver | undefined;
  /**
   * Enforests a class element's brace body as a statement list. Without it the
   * body stays an opaque token tree and macros inside a method never expand.
   */
  readonly enforestStatementBlock?:
    | ((
        block: GroupSyntax,
        context: ConsumerContext,
        allowYield: boolean,
      ) => Syntax)
    | undefined;
}

const prefixTypeWords = new Set([
  "abstract",
  "asserts",
  "infer",
  "keyof",
  "new",
  "readonly",
  "typeof",
  "unique",
]);

const typeAtoms = new Set([
  "any",
  "bigint",
  "boolean",
  "false",
  "import",
  "never",
  "null",
  "number",
  "object",
  "string",
  "symbol",
  "this",
  "true",
  "undefined",
  "unknown",
  "void",
]);

const continuationOperators = new Set(["&", "=>", "extends", "is", "|"]);
const hardTypeStops = new Set([",", ";", "="]);
const continuationLineTokens = new Set([
  ".",
  "&",
  "|",
  "?",
  ":",
  "=",
  "=>",
  ",",
]);
const classModifiers = new Set([
  "abstract",
  "accessor",
  "declare",
  "override",
  "private",
  "protected",
  "public",
  "readonly",
  "static",
]);

function token(
  syntax: Syntax | undefined,
  raw?: string,
): syntax is TokenSyntax {
  return syntax?.tag === "token" && (raw === undefined || syntax.raw === raw);
}

function leadingLineBreak(syntax: Syntax | undefined): boolean {
  const first = syntax?.tag === "group" ? syntax.open : syntax;
  return (
    first?.tag === "token" &&
    first.leadingTrivia.some((trivia) => trivia.hasLineBreak)
  );
}

function checkWork(context: ConsumerContext): void {
  context.cancellation.throwIfCancellationRequested();
  context.tracker.checkDeadline();
  context.tracker.chargeMatcherSteps();
}

function originFor(origins: OriginStore, children: readonly Syntax[]) {
  const unique = [...new Set(children.map(({ origin }) => origin))];
  return unique.length === 1 ? unique[0]! : origins.composed(unique);
}

function protect(
  category: "type" | "classElement",
  options: TypeClassConsumerOptions,
  children: readonly Syntax[],
): ProtectedSyntax {
  const first = children[0];
  if (first === undefined)
    throw new RangeError(`Cannot protect an empty ${category}`);
  return createProtectedSyntax({
    id: options.allocateSyntaxId(),
    span: spanEnvelope(children.map(({ span }) => span)),
    origin: originFor(options.origins, children),
    scopes: first.scopes,
    category,
    children,
  });
}

function failure(
  category: "type" | "classElement",
  cursor: SyntaxCursor,
  start: number,
  expectations: readonly string[],
  specificity: number,
): ConsumerAttempt {
  return Object.freeze({
    matched: false,
    failure: createConsumerFailure({
      category,
      cursor: cursor.identity,
      progress: cursor.index - start,
      specificity,
      expectations,
    }),
  });
}

function validateMacro(
  attempt: ConsumerAttempt,
  category: "type" | "classElement",
  start: number,
): ConsumerAttempt {
  if (
    attempt.matched &&
    (attempt.syntax.category !== category || attempt.cursor.index <= start)
  ) {
    throw new TypeError(
      `Macro resolver returned an invalid ${category} extent`,
    );
  }
  return attempt;
}

function angleWidth(raw: string, character: "<" | ">") {
  return [...raw].every((item) => item === character) ? raw.length : 0;
}

/**
 * Reads one balanced TypeScript angle-delimited region without committing the
 * caller's cursor on failure. Expressions use this to distinguish a generic
 * call such as `useState<number>(0)` from relational operators.
 */
export function consumeBalancedTypeArguments(
  cursor: SyntaxCursor,
  context: ConsumerContext,
) {
  const working = cursor.fork();
  const children: Syntax[] = [];
  const first = working.peek();
  if (!token(first) || angleWidth(first.raw, "<") === 0) return undefined;
  if (!consumeAngles(working, context, children)) return undefined;
  return Object.freeze({
    syntax: createSyntaxSequence(children),
    width: working.index - cursor.index,
  });
}

function consumeAngles(
  cursor: SyntaxCursor,
  context: ConsumerContext,
  children: Syntax[],
): boolean {
  let depth = 0;
  while (!cursor.atEnd) {
    checkWork(context);
    const next = cursor.consume()!;
    children.push(next);
    if (!token(next)) continue;
    depth += angleWidth(next.raw, "<");
    depth -= angleWidth(next.raw, ">");
    if (depth === 0) return true;
    if (depth < 0) return false;
  }
  return false;
}

class TypeConsumer implements SyntaxConsumer {
  constructor(readonly options: TypeClassConsumerOptions) {
    Object.freeze(this);
  }

  consume(cursor: SyntaxCursor, context: ConsumerContext): ConsumerAttempt {
    const start = cursor.index;
    checkWork(context);
    const macro = this.options.resolveMacro?.("type", cursor, context);
    if (macro !== undefined) return validateMacro(macro, "type", start);
    const children: Syntax[] = [];
    let expectingOperand = true;
    let conditionalDepth = 0;
    let genericFunctionHead = false;
    let invalidAdjacency = false;

    while (!cursor.atEnd) {
      checkWork(context);
      if (
        children.length > 0 &&
        conditionalDepth === 0 &&
        context.stopSet.matches(cursor)
      )
        break;
      const next = cursor.peek()!;
      if (next.tag === "group") {
        if (expectingOperand) {
          if (
            next.delimiter !== "parenthesis" &&
            next.delimiter !== "bracket" &&
            next.delimiter !== "brace" &&
            next.delimiter !== "template"
          )
            break;
          children.push(cursor.consume()!);
          expectingOperand = false;
          continue;
        }
        if (next.delimiter === "bracket") {
          children.push(cursor.consume()!);
          continue;
        }
        const lastWord = [...children].reverse().find((item) => token(item));
        if (
          next.delimiter === "parenthesis" &&
          (lastWord?.raw === "import" || genericFunctionHead)
        ) {
          children.push(cursor.consume()!);
          genericFunctionHead = false;
          continue;
        }
        break;
      }

      if (!token(next)) break;
      const spelling = next.raw;
      if (
        conditionalDepth === 0 &&
        hardTypeStops.has(spelling) &&
        children.length > 0
      )
        break;
      if (spelling === ":") {
        if (conditionalDepth === 0 || expectingOperand) break;
        children.push(cursor.consume()!);
        conditionalDepth -= 1;
        expectingOperand = true;
        continue;
      }
      if (spelling === "?") {
        if (expectingOperand) break;
        children.push(cursor.consume()!);
        conditionalDepth += 1;
        expectingOperand = true;
        continue;
      }
      if (continuationOperators.has(spelling)) {
        if (expectingOperand) break;
        children.push(cursor.consume()!);
        expectingOperand = true;
        continue;
      }
      if (spelling === ".") {
        if (expectingOperand) break;
        children.push(cursor.consume()!);
        expectingOperand = true;
        continue;
      }
      if (spelling.startsWith("<")) {
        const previousWord = [...children]
          .reverse()
          .find((item) => token(item));
        if (
          expectingOperand &&
          children.length > 0 &&
          previousWord?.raw !== "new"
        )
          break;
        const atStart = children.length === 0;
        if (!consumeAngles(cursor, context, children)) {
          return failure(
            "type",
            cursor,
            start,
            ["balanced type arguments"],
            40,
          );
        }
        expectingOperand = false;
        genericFunctionHead = atStart || previousWord?.raw === "new";
        continue;
      }
      if (prefixTypeWords.has(spelling)) {
        if (!expectingOperand) break;
        children.push(cursor.consume()!);
        continue;
      }
      const atom =
        next.kind === "identifier" ||
        next.kind === "string-literal" ||
        next.kind === "numeric-literal" ||
        next.kind === "bigint-literal" ||
        next.kind === "no-substitution-template" ||
        typeAtoms.has(spelling);
      if (!atom) break;
      if (!expectingOperand) {
        invalidAdjacency = true;
        break;
      }
      children.push(cursor.consume()!);
      expectingOperand = false;
    }

    if (
      children.length === 0 ||
      expectingOperand ||
      conditionalDepth !== 0 ||
      invalidAdjacency
    ) {
      return failure(
        "type",
        cursor,
        start,
        ["complete TypeScript type"],
        children.length === 0 ? 1 : 40,
      );
    }
    return Object.freeze({
      matched: true,
      syntax: protect("type", this.options, children),
      cursor,
    });
  }
}

function classElementCanEndAtBrace(children: readonly Syntax[]): boolean {
  const brace = children.at(-1);
  if (brace?.tag !== "group" || brace.delimiter !== "brace") return false;
  const before = children.slice(0, -1);
  if (before.some((item) => token(item, "="))) return false;
  const declaration = before.slice(decoratorPrefixLength(before));
  if (declaration.length === 1 && token(declaration[0], "static")) return true;
  return declaration.some(
    (item) => item.tag === "group" && item.delimiter === "parenthesis",
  );
}

function decoratorPrefixLength(children: readonly Syntax[]): number {
  let index = 0;
  while (token(children[index], "@")) {
    index += 1;
    if (!token(children[index])) return index;
    index += 1;
    while (token(children[index], ".") && token(children[index + 1])) {
      index += 2;
    }
    const arguments_ = children[index];
    if (arguments_?.tag === "group" && arguments_.delimiter === "parenthesis")
      index += 1;
  }
  return index;
}

function likelyNextClassElement(syntax: Syntax | undefined): boolean {
  if (token(syntax)) {
    return (
      syntax.raw === "@" ||
      syntax.kind === "identifier" ||
      syntax.kind === "private-identifier" ||
      syntax.kind === "keyword"
    );
  }
  return syntax?.tag === "group" && syntax.delimiter === "bracket";
}

class ClassElementConsumer implements SyntaxConsumer {
  constructor(readonly options: TypeClassConsumerOptions) {
    Object.freeze(this);
  }

  consume(cursor: SyntaxCursor, context: ConsumerContext): ConsumerAttempt {
    const start = cursor.index;
    checkWork(context);
    const macro = this.options.resolveMacro?.("classElement", cursor, context);
    if (macro !== undefined) return validateMacro(macro, "classElement", start);
    const decoratorTarget = cursor.peek(1);
    if (
      token(cursor.peek(), "@") &&
      (!token(decoratorTarget) || decoratorTarget.kind !== "identifier")
    ) {
      return failure(
        "classElement",
        cursor,
        start,
        ["decorator expression after '@'"],
        40,
      );
    }
    const children: Syntax[] = [];
    while (!cursor.atEnd && !context.stopSet.matches(cursor)) {
      checkWork(context);
      const next = cursor.peek()!;
      const previous = children.at(-1);
      const onlyDecorators =
        decoratorPrefixLength(children) === children.length;
      if (
        children.length > 0 &&
        leadingLineBreak(next) &&
        likelyNextClassElement(next) &&
        !onlyDecorators &&
        !continuationLineTokens.has(token(previous) ? previous.raw : "") &&
        !classModifiers.has(token(previous) ? previous.raw : "")
      )
        break;
      children.push(cursor.consume()!);
      if (token(next, ";")) break;
      if (classElementCanEndAtBrace(children)) {
        // The element ended at its body; enforest that body so macros inside a
        // method are reached.
        const enforest = this.options.enforestStatementBlock;
        if (enforest !== undefined && next.tag === "group")
          children[children.length - 1] = enforest(
            next,
            context,
            // A generator method is written `*name() {}`, so the star appears
            // among the tokens scanned before the parameter list.
            children.some((node) => token(node, "*")),
          );
        break;
      }
    }
    if (children.length === 0) {
      return failure("classElement", cursor, start, ["class element"], 1);
    }
    if (
      token(children[0], "@") &&
      (children.length < 3 || token(children[1], ";"))
    ) {
      return failure(
        "classElement",
        cursor,
        start,
        ["complete decorated class element"],
        40,
      );
    }
    const last = children.at(-1);
    const explicit = token(last, ";");
    const body = classElementCanEndAtBrace(children);
    const automatic = cursor.atEnd || leadingLineBreak(cursor.peek());
    if (!explicit && !body && !automatic) {
      return failure(
        "classElement",
        cursor,
        start,
        ["class-element body or terminator"],
        30,
      );
    }
    return Object.freeze({
      matched: true,
      syntax: protect("classElement", this.options, children),
      cursor,
    });
  }
}

export function createTypeConsumer(
  options: TypeClassConsumerOptions,
): SyntaxConsumer {
  return Object.freeze(new TypeConsumer(options));
}

export function createClassElementConsumer(
  options: TypeClassConsumerOptions,
): SyntaxConsumer {
  return Object.freeze(new ClassElementConsumer(options));
}
