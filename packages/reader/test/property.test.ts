import type { ScopeSetId, SourceId } from "@sweetener/shared";
import { syntaxStructuralEquals } from "@sweetener/syntax";
import { describe, expect, it } from "vitest";
import { printLossless, readSyntax } from "../src/index.js";

const sourceId = 3_000 as SourceId;
const scopes = 0 as ScopeSetId;

function generator(seed: number) {
  let state = seed >>> 0;
  return (limit: number): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state % limit;
  };
}

function generatedSource(seed: number): string {
  const next = generator(seed);
  const atoms = [
    "alpha",
    "beta42",
    "0x2a",
    "'text'",
    " ",
    "\n",
    "/* note */",
    "// line\n",
    "|>>",
    "<-",
    "::",
    "@",
    "#",
    ",",
    ";",
    "+",
    "=",
  ];
  const opens = ["(", "[", "{"] as const;
  const closeFor = { "(": ")", "[": "]", "{": "}" } as const;
  const stack: (keyof typeof closeFor)[] = [];
  let source = "";
  const count = 20 + next(80);
  for (let index = 0; index < count; index += 1) {
    const choice = next(12);
    if (choice < 2 && stack.length < 8) {
      const open = opens[next(opens.length)] ?? "(";
      stack.push(open);
      source += open;
    } else if (choice === 2 && stack.length > 0) {
      const open = stack.pop();
      if (open !== undefined) source += closeFor[open];
    } else if (choice === 3) {
      source += [")", "]", "}"][next(3)] ?? ")";
    } else if (choice === 4) {
      source += "`value ${alpha} tail`";
    } else {
      source += atoms[next(atoms.length)] ?? "x";
    }
  }
  while (stack.length > 0 && next(2) === 1) {
    const open = stack.pop();
    if (open !== undefined) source += closeFor[open];
  }
  return source;
}

describe("reader fixed-seed properties", () => {
  it("retains bytes and stable structure across generated delimiter streams", () => {
    for (let seed = 1; seed <= 250; seed += 1) {
      const source = generatedSource(seed);
      const first = readSyntax(source, { sourceId, scopes });
      const printed = printLossless(first.root);
      const second = readSyntax(printed, { sourceId, scopes });
      expect(printed, `seed ${String(seed)}`).toBe(source);
      expect(
        syntaxStructuralEquals(first.root, second.root),
        `seed ${String(seed)}`,
      ).toBe(true);
      expect(
        second.diagnostics.map((diagnostic) => diagnostic.code),
        `seed ${String(seed)}`,
      ).toEqual(first.diagnostics.map((diagnostic) => diagnostic.code));
    }
  });
});
