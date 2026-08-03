import {
  createProtectedSyntax,
  type OriginStore,
  type ProtectedSyntax,
  type Syntax,
  type SyntaxCategory,
  type SyntaxCursor,
  type TokenSyntax,
} from "@sweet-rewrite/syntax";
import {
  createConsumerFailure,
  type ConsumerAttempt,
  type ConsumerContext,
  type SyntaxConsumer,
} from "./consumer.js";
import {
  createPrattExpressionConsumer,
  type PrattExpressionConsumerOptions,
} from "./pratt-expression.js";
import { StopSet } from "./stop-set.js";
import { createBindingConsumer } from "./binding-parameter.js";
import { createTypeConsumer } from "./type-class-element.js";

export type StatementItemMacroResolver = (
  category: "stmt" | "item",
  cursor: SyntaxCursor,
  context: ConsumerContext,
) => ConsumerAttempt | undefined;

export interface StatementItemConsumerOptions extends PrattExpressionConsumerOptions {
  readonly resolveMacro?: StatementItemMacroResolver | undefined;
}

const statementStarts = new Set([
  "abstract",
  "async",
  "break",
  "class",
  "const",
  "continue",
  "debugger",
  "declare",
  "do",
  "enum",
  "export",
  "for",
  "function",
  "if",
  "import",
  "interface",
  "let",
  "namespace",
  "operator",
  "rec",
  "return",
  "switch",
  "syntax",
  "throw",
  "try",
  "type",
  "var",
  "while",
  "with",
]);

const itemStarts = new Set([
  "abstract",
  "class",
  "const",
  "declare",
  "enum",
  "export",
  "function",
  "import",
  "interface",
  "let",
  "module",
  "namespace",
  "operator",
  "rec",
  "syntax",
  "type",
  "var",
]);

const blockItemHeads = new Set([
  "class",
  "enum",
  "function",
  "interface",
  "module",
  "namespace",
  "operator",
  "rec",
  "syntax",
]);

function raw(syntax: Syntax | undefined): string | undefined {
  return syntax?.tag === "token" ? syntax.raw : undefined;
}

function token(
  syntax: Syntax | undefined,
  spelling: string,
): syntax is TokenSyntax {
  return syntax?.tag === "token" && syntax.raw === spelling;
}

function braceGroup(syntax: Syntax | undefined): boolean {
  return syntax?.tag === "group" && syntax.delimiter === "brace";
}

function leadingLineBreak(syntax: Syntax | undefined): boolean {
  const first = syntax?.tag === "group" ? syntax.open : syntax;
  return (
    first?.tag === "token" &&
    first.leadingTrivia.some((trivia) => trivia.hasLineBreak)
  );
}

function originFor(origins: OriginStore, children: readonly Syntax[]) {
  const unique = [...new Set(children.map(({ origin }) => origin))];
  return unique.length === 1 ? unique[0]! : origins.composed(unique);
}

function protect(
  category: SyntaxCategory,
  options: StatementItemConsumerOptions,
  children: readonly Syntax[],
): ProtectedSyntax {
  const first = children[0];
  const last = children.at(-1);
  if (first === undefined || last === undefined) {
    throw new RangeError(`Cannot protect an empty ${category}`);
  }
  return createProtectedSyntax({
    id: options.allocateSyntaxId(),
    span: {
      start: Math.min(...children.map(({ span }) => span.start)),
      end: Math.max(...children.map(({ span }) => span.end)),
    },
    origin: originFor(options.origins, children),
    scopes: first.scopes,
    category,
    children,
  });
}

function failure(
  category: "stmt" | "item",
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

function checkWork(context: ConsumerContext): void {
  context.cancellation.throwIfCancellationRequested();
  context.tracker.checkDeadline();
  context.tracker.chargeMatcherSteps();
}

function validateMacroAttempt(
  attempt: ConsumerAttempt,
  category: "stmt" | "item",
  start: number,
): ConsumerAttempt {
  if (
    attempt.matched &&
    (attempt.syntax.category !== category || attempt.cursor.index <= start)
  ) {
    throw new TypeError(
      `Macro ${category} resolver returned an invalid protected extent`,
    );
  }
  return attempt;
}

function consumeExplicitSemicolon(
  cursor: SyntaxCursor,
  children: Syntax[],
): boolean {
  if (!token(cursor.peek(), ";")) return false;
  children.push(cursor.consume()!);
  return true;
}

function asiAllowed(cursor: SyntaxCursor): boolean {
  return cursor.atEnd || leadingLineBreak(cursor.peek());
}

function requireTerminator(
  category: "stmt" | "item",
  cursor: SyntaxCursor,
  start: number,
  children: Syntax[],
): ConsumerAttempt | undefined {
  if (consumeExplicitSemicolon(cursor, children) || asiAllowed(cursor)) {
    return undefined;
  }
  return failure(category, cursor, start, ["';' or automatic terminator"], 30);
}

function consumeHeaderGroup(cursor: SyntaxCursor, children: Syntax[]): boolean {
  const header = cursor.peek();
  if (header?.tag !== "group" || header.delimiter !== "parenthesis") {
    return false;
  }
  children.push(cursor.consume()!);
  return true;
}

class StatementConsumer implements SyntaxConsumer {
  readonly #expression: SyntaxConsumer;

  constructor(readonly options: StatementItemConsumerOptions) {
    this.#expression = createPrattExpressionConsumer({
      ...options,
      allowComma: true,
    });
    Object.freeze(this);
  }

  consume(cursor: SyntaxCursor, context: ConsumerContext): ConsumerAttempt {
    const start = cursor.index;
    checkWork(context);
    const macro = this.options.resolveMacro?.("stmt", cursor, context);
    if (macro !== undefined) return validateMacroAttempt(macro, "stmt", start);
    const first = cursor.peek();
    if (first === undefined || context.stopSet.matches(cursor)) {
      return failure("stmt", cursor, start, ["statement"], 1);
    }
    if (first.tag === "group" && first.delimiter === "brace") {
      cursor.advance();
      return Object.freeze({
        matched: true,
        syntax: protect("stmt", this.options, [first]),
        cursor,
      });
    }
    if (token(first, ";")) {
      cursor.advance();
      return Object.freeze({
        matched: true,
        syntax: protect("stmt", this.options, [first]),
        cursor,
      });
    }
    const keyword = raw(first);
    if (keyword === "if") return this.#consumeIf(cursor, context, start);
    if (keyword === "do") return this.#consumeDo(cursor, context, start);
    if (keyword === "try") return this.#consumeTry(cursor, context, start);
    if (["for", "while", "with"].includes(keyword ?? "")) {
      return this.#consumeHeaderAndBody(cursor, context, start);
    }
    if (keyword === "switch") return this.#consumeSwitch(cursor, start);
    if (
      ["return", "throw", "break", "continue", "debugger"].includes(
        keyword ?? "",
      )
    ) {
      return this.#consumeRestricted(cursor, context, start, keyword!);
    }
    if (["const", "let", "var"].includes(keyword ?? "")) {
      return this.#consumeScanned(cursor, context, start, false);
    }
    if (
      [
        "function",
        "class",
        "enum",
        "interface",
        "namespace",
        "module",
        "operator",
        "rec",
        "syntax",
      ].includes(keyword ?? "")
    ) {
      return this.#consumeScanned(cursor, context, start, true);
    }
    return this.#consumeExpression(cursor, context, start);
  }

  #consumeNested(
    cursor: SyntaxCursor,
    context: ConsumerContext,
  ): ConsumerAttempt {
    return this.consume(cursor, context);
  }

  #consumeIf(
    cursor: SyntaxCursor,
    context: ConsumerContext,
    start: number,
  ): ConsumerAttempt {
    const children: Syntax[] = [cursor.consume()!];
    if (!consumeHeaderGroup(cursor, children)) {
      return failure("stmt", cursor, start, ["parenthesized if condition"], 40);
    }
    const consequent = this.#consumeNested(cursor, context);
    if (!consequent.matched) return consequent;
    children.push(consequent.syntax);
    if (token(cursor.peek(), "else")) {
      children.push(cursor.consume()!);
      const alternate = this.#consumeNested(cursor, context);
      if (!alternate.matched) return alternate;
      children.push(alternate.syntax);
    }
    return Object.freeze({
      matched: true,
      syntax: protect("stmt", this.options, children),
      cursor,
    });
  }

  #consumeHeaderAndBody(
    cursor: SyntaxCursor,
    context: ConsumerContext,
    start: number,
  ): ConsumerAttempt {
    const keyword = cursor.consume()!;
    const children: Syntax[] = [keyword];
    if (!consumeHeaderGroup(cursor, children)) {
      return failure(
        "stmt",
        cursor,
        start,
        [`parenthesized ${raw(keyword)} header`],
        40,
      );
    }
    const body = this.#consumeNested(cursor, context);
    if (!body.matched) return body;
    children.push(body.syntax);
    return Object.freeze({
      matched: true,
      syntax: protect("stmt", this.options, children),
      cursor,
    });
  }

  #consumeSwitch(cursor: SyntaxCursor, start: number): ConsumerAttempt {
    const children: Syntax[] = [cursor.consume()!];
    if (!consumeHeaderGroup(cursor, children)) {
      return failure(
        "stmt",
        cursor,
        start,
        ["parenthesized switch expression"],
        40,
      );
    }
    const body = cursor.peek();
    if (body?.tag !== "group" || body.delimiter !== "brace") {
      return failure("stmt", cursor, start, ["switch block"], 40);
    }
    children.push(cursor.consume()!);
    return Object.freeze({
      matched: true,
      syntax: protect("stmt", this.options, children),
      cursor,
    });
  }

  #consumeDo(
    cursor: SyntaxCursor,
    context: ConsumerContext,
    start: number,
  ): ConsumerAttempt {
    const children: Syntax[] = [cursor.consume()!];
    const body = this.#consumeNested(cursor, context);
    if (!body.matched) return body;
    children.push(body.syntax);
    if (!token(cursor.peek(), "while")) {
      return failure("stmt", cursor, start, ["'while' after do body"], 40);
    }
    children.push(cursor.consume()!);
    if (!consumeHeaderGroup(cursor, children)) {
      return failure(
        "stmt",
        cursor,
        start,
        ["parenthesized do-while condition"],
        40,
      );
    }
    const terminator = requireTerminator("stmt", cursor, start, children);
    if (terminator !== undefined) return terminator;
    return Object.freeze({
      matched: true,
      syntax: protect("stmt", this.options, children),
      cursor,
    });
  }

  #consumeTry(
    cursor: SyntaxCursor,
    _context: ConsumerContext,
    start: number,
  ): ConsumerAttempt {
    const children: Syntax[] = [cursor.consume()!];
    const body = cursor.peek();
    if (body?.tag !== "group" || body.delimiter !== "brace") {
      return failure("stmt", cursor, start, ["try block"], 40);
    }
    children.push(cursor.consume()!);
    let handler = false;
    if (token(cursor.peek(), "catch")) {
      handler = true;
      children.push(cursor.consume()!);
      const parameter = cursor.peek();
      if (parameter?.tag === "group" && parameter.delimiter === "parenthesis") {
        children.push(cursor.consume()!);
      }
      const catchBody = cursor.peek();
      if (catchBody?.tag !== "group" || catchBody.delimiter !== "brace") {
        return failure("stmt", cursor, start, ["catch block"], 40);
      }
      children.push(cursor.consume()!);
    }
    if (token(cursor.peek(), "finally")) {
      handler = true;
      children.push(cursor.consume()!);
      const finallyBody = cursor.peek();
      if (finallyBody?.tag !== "group" || finallyBody.delimiter !== "brace") {
        return failure("stmt", cursor, start, ["finally block"], 40);
      }
      children.push(cursor.consume()!);
    }
    if (!handler)
      return failure("stmt", cursor, start, ["catch or finally clause"], 40);
    return Object.freeze({
      matched: true,
      syntax: protect("stmt", this.options, children),
      cursor,
    });
  }

  #consumeRestricted(
    cursor: SyntaxCursor,
    context: ConsumerContext,
    start: number,
    keyword: string,
  ): ConsumerAttempt {
    const children: Syntax[] = [cursor.consume()!];
    const separated = leadingLineBreak(cursor.peek());
    if (keyword === "throw" && separated) {
      return failure(
        "stmt",
        cursor,
        start,
        ["expression on the same line as 'throw'"],
        50,
      );
    }
    if (
      !["debugger"].includes(keyword) &&
      !separated &&
      !token(cursor.peek(), ";") &&
      !cursor.atEnd
    ) {
      const expressionContext = Object.freeze({
        ...context,
        stopSet: context.stopSet.union(
          new StopSet([{ kind: "token", raw: ";" }]),
        ),
      });
      const expression = this.#expression.consume(cursor, expressionContext);
      if (!expression.matched) {
        if (keyword === "throw")
          return failure(
            "stmt",
            cursor,
            start,
            ["expression after 'throw'"],
            50,
          );
      } else children.push(expression.syntax);
    } else if (keyword === "throw") {
      return failure("stmt", cursor, start, ["expression after 'throw'"], 50);
    }
    const terminator = requireTerminator("stmt", cursor, start, children);
    if (terminator !== undefined) return terminator;
    return Object.freeze({
      matched: true,
      syntax: protect("stmt", this.options, children),
      cursor,
    });
  }

  #consumeScanned(
    cursor: SyntaxCursor,
    context: ConsumerContext,
    start: number,
    endsAtBlock: boolean,
  ): ConsumerAttempt {
    const children: Syntax[] = [];
    while (!cursor.atEnd && !context.stopSet.matches(cursor)) {
      checkWork(context);
      const next = cursor.peek()!;
      if (
        children.length > 0 &&
        leadingLineBreak(next) &&
        statementStarts.has(raw(next) ?? "")
      )
        break;
      children.push(cursor.consume()!);
      if (token(next, ";")) break;
      if (endsAtBlock && next.tag === "group" && next.delimiter === "brace")
        break;
    }
    if (
      endsAtBlock &&
      !token(children.at(-1), ";") &&
      !braceGroup(children.at(-1))
    ) {
      return failure("stmt", cursor, start, ["declaration body"], 40);
    }
    if (!endsAtBlock && !token(children.at(-1), ";") && !asiAllowed(cursor)) {
      return failure("stmt", cursor, start, ["declaration terminator"], 30);
    }
    return Object.freeze({
      matched: true,
      syntax: protect("stmt", this.options, children),
      cursor,
    });
  }

  #consumeExpression(
    cursor: SyntaxCursor,
    context: ConsumerContext,
    start: number,
  ): ConsumerAttempt {
    const expressionContext = Object.freeze({
      ...context,
      stopSet: context.stopSet.union(
        new StopSet([{ kind: "token", raw: ";" }]),
      ),
    });
    const expression = this.#expression.consume(cursor, expressionContext);
    if (!expression.matched) {
      return failure(
        "stmt",
        cursor,
        start,
        expression.failure.expectations,
        expression.failure.specificity,
      );
    }
    const children: Syntax[] = [expression.syntax];
    const terminator = requireTerminator("stmt", cursor, start, children);
    if (terminator !== undefined) return terminator;
    return Object.freeze({
      matched: true,
      syntax: protect("stmt", this.options, children),
      cursor,
    });
  }
}

class ItemConsumer implements SyntaxConsumer {
  readonly #statement: SyntaxConsumer;
  readonly #expression: SyntaxConsumer;
  readonly #binding: SyntaxConsumer;
  readonly #type: SyntaxConsumer;

  constructor(readonly options: StatementItemConsumerOptions) {
    this.#statement = new StatementConsumer(options);
    this.#expression = createPrattExpressionConsumer({
      ...options,
      allowComma: false,
    });
    const shared = {
      origins: options.origins,
      allocateSyntaxId: options.allocateSyntaxId,
    };
    this.#binding = createBindingConsumer(shared);
    this.#type = createTypeConsumer(shared);
    Object.freeze(this);
  }

  #consumeVariable(
    cursor: SyntaxCursor,
    context: ConsumerContext,
    start: number,
  ): ConsumerAttempt | undefined {
    const children: Syntax[] = [];
    while (raw(cursor.peek()) === "export" || raw(cursor.peek()) === "declare")
      children.push(cursor.consume()!);
    if (!["const", "let", "var"].includes(raw(cursor.peek()) ?? ""))
      return undefined;
    children.push(cursor.consume()!);
    while (!cursor.atEnd && !context.stopSet.matches(cursor)) {
      const binding = this.#binding.consume(cursor, {
        ...context,
        category: "binding",
        stopSet: context.stopSet.union(
          new StopSet(
            [":", "=", ",", ";"].map((value) => ({
              kind: "token" as const,
              raw: value,
            })),
          ),
        ),
      });
      if (!binding.matched)
        return failure("item", cursor, start, ["variable binding"], 40);
      children.push(binding.syntax);
      if (token(cursor.peek(), ":")) {
        children.push(cursor.consume()!);
        const type = this.#type.consume(cursor, {
          ...context,
          category: "type",
          stopSet: context.stopSet.union(
            new StopSet(
              ["=", ",", ";"].map((value) => ({
                kind: "token" as const,
                raw: value,
              })),
            ),
          ),
        });
        if (!type.matched)
          return failure("item", cursor, start, ["variable type"], 40);
        children.push(type.syntax);
      }
      if (token(cursor.peek(), "=")) {
        children.push(cursor.consume()!);
        const expression = this.#expression.consume(cursor, {
          ...context,
          category: "expr",
          stopSet: context.stopSet.union(
            new StopSet(
              [",", ";"].map((value) => ({
                kind: "token" as const,
                raw: value,
              })),
            ),
          ),
        });
        if (!expression.matched)
          return failure("item", cursor, start, ["variable initializer"], 40);
        children.push(expression.syntax);
      }
      if (token(cursor.peek(), ",")) {
        children.push(cursor.consume()!);
        continue;
      }
      break;
    }
    const terminator = requireTerminator("item", cursor, start, children);
    if (terminator !== undefined) return terminator;
    return Object.freeze({
      matched: true,
      syntax: protect("item", this.options, children),
      cursor,
    });
  }

  consume(cursor: SyntaxCursor, context: ConsumerContext): ConsumerAttempt {
    const start = cursor.index;
    checkWork(context);
    const protectedItem = cursor.peek();
    if (
      protectedItem?.tag === "protected" &&
      protectedItem.category === "item"
    ) {
      cursor.advance();
      return Object.freeze({
        matched: true,
        syntax: protectedItem,
        cursor,
      });
    }
    const macro = this.options.resolveMacro?.("item", cursor, context);
    if (macro !== undefined) return validateMacroAttempt(macro, "item", start);
    const first = cursor.peek();
    if (first === undefined || context.stopSet.matches(cursor)) {
      return failure("item", cursor, start, ["module item"], 1);
    }
    const variable = this.#consumeVariable(cursor.fork(), context, start);
    if (variable !== undefined) return variable;
    if (itemStarts.has(raw(first) ?? "")) {
      const children: Syntax[] = [];
      const headWords = Array.from({ length: 4 }, (_, offset) =>
        raw(cursor.peek(offset)),
      ).filter((word): word is string => word !== undefined);
      const endsAtBlock = headWords.some((word) => blockItemHeads.has(word));
      while (!cursor.atEnd && !context.stopSet.matches(cursor)) {
        checkWork(context);
        const next = cursor.peek()!;
        if (
          children.length > 0 &&
          leadingLineBreak(next) &&
          itemStarts.has(raw(next) ?? "")
        ) {
          break;
        }
        children.push(cursor.consume()!);
        if (token(next, ";")) break;
        if (endsAtBlock && next.tag === "group" && next.delimiter === "brace")
          break;
      }
      if (
        endsAtBlock &&
        !token(children.at(-1), ";") &&
        !braceGroup(children.at(-1))
      ) {
        return failure("item", cursor, start, ["declaration body"], 40);
      }
      if (
        !token(children.at(-1), ";") &&
        children.at(-1)?.tag !== "group" &&
        !asiAllowed(cursor)
      ) {
        return failure("item", cursor, start, ["module-item terminator"], 30);
      }
      const body = children.at(-1);
      if (body?.tag === "group" && body.delimiter === "brace") {
        const bodyCategory = headWords.includes("class")
          ? "classElement"
          : headWords.includes("function")
            ? "stmt"
            : headWords.includes("module") || headWords.includes("namespace")
              ? "item"
              : undefined;
        if (bodyCategory !== undefined)
          children[children.length - 1] = protect(bodyCategory, this.options, [
            body,
          ]);
      }
      return Object.freeze({
        matched: true,
        syntax: protect("item", this.options, children),
        cursor,
      });
    }
    const statement = this.#statement.consume(cursor, context);
    if (!statement.matched) {
      return failure(
        "item",
        cursor,
        start,
        statement.failure.expectations,
        statement.failure.specificity,
      );
    }
    return Object.freeze({
      matched: true,
      syntax: protect("item", this.options, [statement.syntax]),
      cursor,
    });
  }
}

export function createStatementConsumer(
  options: StatementItemConsumerOptions,
): SyntaxConsumer {
  return Object.freeze(new StatementConsumer(options));
}

export function createItemConsumer(
  options: StatementItemConsumerOptions,
): SyntaxConsumer {
  return Object.freeze(new ItemConsumer(options));
}
