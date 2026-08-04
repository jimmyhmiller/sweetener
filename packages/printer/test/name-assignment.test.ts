import type {
  BindingId,
  OriginId,
  ScopeSetId,
  SyntaxId,
} from "@sweetener/shared";
import { createRootSyntax, createToken } from "@sweetener/syntax";
import { describe, expect, test } from "vitest";
import { assignPrintedNames, printWithAssignedNames } from "../src/index.js";

const binding = (value: number) => value as BindingId;
const syntax = (value: number) => value as SyntaxId;

describe("deterministic printed-name assignment", () => {
  test("uses expanded traversal order to suffix visible collisions", () => {
    const plan = assignPrintedNames({
      declarations: [
        {
          binding: binding(20),
          preferredName: "value",
          conflicts: [binding(10)],
        },
        {
          binding: binding(10),
          preferredName: "value",
          conflicts: [binding(20)],
        },
      ],
      occurrences: [
        { syntax: syntax(9), binding: binding(10), kind: "identifier" },
        { syntax: syntax(2), binding: binding(20), kind: "identifier" },
      ],
    });
    expect(plan.nameFor(binding(10))).toBe("value");
    expect(plan.nameFor(binding(20))).toBe("value_1");
    expect(plan.rewrites.map((rewrite) => rewrite.replacement)).toEqual([
      "value",
      "value_1",
    ]);
  });

  test("does not rename equal spellings that cannot be simultaneously visible", () => {
    const plan = assignPrintedNames({
      declarations: [
        { binding: binding(1), preferredName: "item", conflicts: [] },
        { binding: binding(2), preferredName: "item", conflicts: [] },
      ],
      occurrences: [
        { syntax: syntax(1), binding: binding(1), kind: "identifier" },
        { syntax: syntax(2), binding: binding(2), kind: "identifier" },
      ],
    });
    expect([...plan.names.values()]).toEqual(["item", "item"]);
  });

  test("expands shorthand properties without renaming their keys", () => {
    const plan = assignPrintedNames({
      declarations: [
        { binding: binding(1), preferredName: "x", conflicts: [binding(2)] },
        { binding: binding(2), preferredName: "x", conflicts: [binding(1)] },
      ],
      occurrences: [
        { syntax: syntax(1), binding: binding(1), kind: "identifier" },
        {
          syntax: syntax(2),
          binding: binding(2),
          kind: "shorthand-value",
          propertySpelling: "x",
        },
      ],
    });
    expect(plan.rewrites[1]).toMatchObject({
      printedName: "x_1",
      replacement: "x: x_1",
      expandsShorthand: true,
    });
  });

  test("sanitizes generated hints and avoids unavailable names repeatably", () => {
    const input = {
      declarations: [
        { binding: binding(1), preferredName: "class", conflicts: [] },
        { binding: binding(2), preferredName: "two words", conflicts: [] },
      ],
      occurrences: [
        { syntax: syntax(1), binding: binding(1), kind: "identifier" as const },
        { syntax: syntax(2), binding: binding(2), kind: "identifier" as const },
      ],
      unavailableNames: ["_class"],
    };
    const first = assignPrintedNames(input);
    const second = assignPrintedNames(input);
    expect([...first.names]).toEqual([
      [binding(1), "_class_1"],
      [binding(2), "two_words"],
    ]);
    expect([...second.names]).toEqual([...first.names]);
  });

  test("rejects incomplete identity and shorthand metadata", () => {
    expect(() =>
      assignPrintedNames({
        declarations: [],
        occurrences: [
          { syntax: syntax(1), binding: binding(1), kind: "identifier" },
        ],
      }),
    ).toThrow(/unknown binding/);
    expect(() =>
      assignPrintedNames({
        declarations: [
          { binding: binding(1), preferredName: "x", conflicts: [] },
        ],
        occurrences: [
          { syntax: syntax(1), binding: binding(1), kind: "shorthand-value" },
        ],
      }),
    ).toThrow(/property spelling/);
    expect(() =>
      assignPrintedNames({
        declarations: [
          { binding: binding(1), preferredName: "x", conflicts: [] },
        ],
        occurrences: [],
      }),
    ).toThrow(/no traversal occurrence/);
  });

  test("prints planned names and shorthand expansions without formatting", () => {
    const token = createToken({
      id: syntax(1),
      span: { start: 0, end: 1 },
      origin: 1 as OriginId,
      scopes: 0 as ScopeSetId,
      kind: "identifier",
      raw: "x",
      value: "x",
      leadingTrivia: [
        {
          kind: "whitespace",
          raw: " ",
          span: { start: 0, end: 1 },
          hasLineBreak: false,
        },
      ],
    });
    const root = createRootSyntax({
      id: syntax(2),
      span: { start: 0, end: 1 },
      origin: 1 as OriginId,
      scopes: 0 as ScopeSetId,
      children: [token],
    });
    const plan = assignPrintedNames({
      declarations: [
        { binding: binding(1), preferredName: "x", conflicts: [] },
      ],
      occurrences: [
        {
          syntax: token.id,
          binding: binding(1),
          kind: "shorthand-value",
          propertySpelling: "property",
        },
      ],
      unavailableNames: ["x"],
    });
    expect(printWithAssignedNames(root, plan)).toBe(" property: x_1");
  });
});
