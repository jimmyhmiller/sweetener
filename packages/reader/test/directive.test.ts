import { describe, expect, test } from "vitest";
import {
  findSweetenerDirective,
  readDirectivePrologue,
  sweetenerDirective,
} from "../src/directive.js";

describe("directive prologue", () => {
  test("finds the directive at the start of a file", () => {
    const source = `"use sweetener";\nexport const a = 1;\n`;
    expect(findSweetenerDirective(source)).toEqual({
      value: sweetenerDirective,
      start: 0,
      end: 16,
    });
  });

  test("accepts single quotes and a missing semicolon", () => {
    expect(
      findSweetenerDirective(`'use sweetener'\nconst a = 1;`),
    ).toMatchObject({ start: 0, end: 15 });
  });

  test("accepts the directive after other directives", () => {
    const source = `"use strict";\n"use sweetener";\nconst a = 1;`;
    expect(findSweetenerDirective(source)).toMatchObject({ start: 14 });
    expect(readDirectivePrologue(source).map(({ value }) => value)).toEqual([
      "use strict",
      sweetenerDirective,
    ]);
  });

  test("skips a shebang and leading comments", () => {
    const source = `#!/usr/bin/env node\n// a comment\n/* another */\n"use sweetener";\n`;
    expect(findSweetenerDirective(source)).toBeDefined();
  });

  test("rejects the directive after a statement", () => {
    expect(
      findSweetenerDirective(`const a = 1;\n"use sweetener";`),
    ).toBeUndefined();
  });

  test("rejects a string that only heads an expression", () => {
    expect(findSweetenerDirective(`"use sweetener" + tail;`)).toBeUndefined();
    expect(findSweetenerDirective(`"use sweetener".length;`)).toBeUndefined();
  });

  test("rejects a mention inside a comment or a later string", () => {
    expect(
      findSweetenerDirective(`// use sweetener\nconst a = 1;`),
    ).toBeUndefined();
    expect(
      findSweetenerDirective(`const a = "use sweetener";`),
    ).toBeUndefined();
  });

  test("does not scan past an unterminated block comment", () => {
    expect(
      findSweetenerDirective(`/* unterminated\n"use sweetener";`),
    ).toBeUndefined();
  });

  test("reports no directives for an empty file", () => {
    expect(readDirectivePrologue("")).toEqual([]);
    expect(findSweetenerDirective("")).toBeUndefined();
  });
});
