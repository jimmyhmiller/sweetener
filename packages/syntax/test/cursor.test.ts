import {
  createIdAllocator,
  type OriginId,
  type ScopeSetId,
  type SyntaxId,
} from "@sweetener/shared";
import { describe, expect, it } from "vitest";
import {
  createGroup,
  createSpan,
  createSyntaxCursor,
  createToken,
  SyntaxRange,
  type Syntax,
} from "../src/index.js";

const syntaxIds = createIdAllocator<SyntaxId>();
const origin = 1 as OriginId;
const scopes = 1 as ScopeSetId;

function token(raw: string) {
  return createToken({
    id: syntaxIds.allocate(),
    span: createSpan(0, raw.length),
    origin,
    scopes,
    kind: "identifier",
    raw,
    value: raw,
  });
}

function parenthesized(children: readonly Syntax[]) {
  return createGroup({
    id: syntaxIds.allocate(),
    span: createSpan(0, 2),
    origin,
    scopes,
    delimiter: "parenthesis",
    open: createToken({
      id: syntaxIds.allocate(),
      span: createSpan(0, 1),
      origin,
      scopes,
      kind: "punctuation",
      raw: "(",
    }),
    children,
    close: createToken({
      id: syntaxIds.allocate(),
      span: createSpan(1, 2),
      origin,
      scopes,
      kind: "punctuation",
      raw: ")",
    }),
  });
}

describe("syntax cursor", () => {
  it("handles an empty sequence", () => {
    const cursor = createSyntaxCursor([]);
    expect(cursor.length).toBe(0);
    expect(cursor.remainingLength).toBe(0);
    expect(cursor.atEnd).toBe(true);
    expect(cursor.peek()).toBeUndefined();
    expect(cursor.consume()).toBeUndefined();
    expect(cursor.remainingRange().toArray()).toEqual([]);
  });

  it("peeks, advances, and consumes without hiding bounds errors", () => {
    const first = token("first");
    const second = token("second");
    const cursor = createSyntaxCursor([first, second]);
    expect(cursor.peek()).toBe(first);
    expect(cursor.peek(1)).toBe(second);
    cursor.advance();
    expect(cursor.consume()).toBe(second);
    expect(cursor.atEnd).toBe(true);
    expect(() => cursor.advance()).toThrow(/with 0 remaining/);
    expect(() => cursor.peek(-1)).toThrow(RangeError);
    expect(() => cursor.advance(0.5)).toThrow(RangeError);
  });

  it("marks and resets one cursor in constant-state operations", () => {
    const cursor = createSyntaxCursor([token("a"), token("b"), token("c")]);
    const startIdentity = cursor.identity;
    const mark = cursor.mark();
    cursor.advance(2);
    expect(cursor.identity).not.toBe(startIdentity);
    cursor.reset(mark);
    expect(cursor.identity).toBe(startIdentity);
    expect(cursor.peek()?.tag).toBe("token");
  });

  it("rejects marks from roots, forks, and nested cursors", () => {
    const syntax = parenthesized([token("child")]);
    const cursor = createSyntaxCursor([syntax]);
    const fork = cursor.fork();
    const nested = cursor.enterGroup();
    expect(() => fork.reset(cursor.mark())).toThrow(/another cursor instance/);
    expect(() => cursor.reset(nested.mark())).toThrow(
      /another cursor instance/,
    );
    expect(() => createSyntaxCursor([syntax]).reset(cursor.mark())).toThrow(
      /another cursor instance/,
    );
  });

  it("forks independent state with equal location identity", () => {
    const cursor = createSyntaxCursor([token("a"), token("b")]);
    cursor.advance();
    const fork = cursor.fork();
    expect(fork.identity).toBe(cursor.identity);
    fork.advance();
    expect(fork.atEnd).toBe(true);
    expect(cursor.atEnd).toBe(false);
  });

  it("enters nested groups and exits after the parent group", () => {
    const leaf = token("leaf");
    const inner = parenthesized([leaf]);
    const outer = parenthesized([inner]);
    const after = token("after");
    const root = createSyntaxCursor([outer, after]);
    const outerCursor = root.enterGroup();
    const innerCursor = outerCursor.enterGroup();
    expect(outerCursor.depth).toBe(1);
    expect(innerCursor.depth).toBe(2);
    expect(innerCursor.peek()).toBe(leaf);
    expect(innerCursor.parentLocation).toMatchObject({
      group: inner,
      index: 0,
      depth: 1,
    });
    const backToOuter = innerCursor.exitGroup();
    expect(backToOuter?.atEnd).toBe(true);
    const backToRoot = backToOuter?.exitGroup();
    expect(backToRoot?.peek()).toBe(after);
    expect(root.index).toBe(0);
    expect(root.exitGroup()).toBeUndefined();
  });

  it("rejects group entry at a token or end position", () => {
    const cursor = createSyntaxCursor([token("leaf")]);
    expect(() => cursor.enterGroup()).toThrow(/token syntax/);
    cursor.advance();
    expect(() => cursor.enterGroup()).toThrow(/at the end/);
  });

  it("returns an immutable constant-view remaining range", () => {
    const first = token("first");
    const second = token("second");
    const cursor = createSyntaxCursor([first, second]);
    cursor.advance();
    const range = cursor.remainingRange();
    expect(range).toBeInstanceOf(SyntaxRange);
    expect(range.start).toBe(1);
    expect(range.end).toBe(2);
    expect(range.length).toBe(1);
    expect(range.at(0)).toBe(second);
    expect(range.at(1)).toBeUndefined();
    expect(range.toArray()).toEqual([second]);
    expect(Object.isFrozen(range)).toBe(true);
    expect(() => range.at(-1)).toThrow(RangeError);
  });

  it("snapshots a mutable root array", () => {
    const first = token("first");
    const input = [first];
    const cursor = createSyntaxCursor(input);
    input.push(token("later"));
    expect(cursor.length).toBe(1);
    expect(Object.isFrozen(cursor.remainingRange().sequence)).toBe(true);
  });

  it("gives independent traversals distinct identities", () => {
    const syntax = [token("same")];
    expect(createSyntaxCursor(syntax).identity).not.toBe(
      createSyntaxCursor(syntax).identity,
    );
  });
});
