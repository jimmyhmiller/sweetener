import { describe, expect, test } from "vitest";
import {
  auditAcceptanceMacros,
  auditDeclarativeSource,
} from "../../../scripts/declarative-boundary.mjs";

describe("declarative acceptance boundary", () => {
  test("accepts declarative patterns, templates, and emitted runtime calls", () => {
    expect(
      auditDeclarativeSource(`
        export syntax pair:expr {
          rule { pair($left:expr, $right:expr) }
          => { globalThis.Object.is($left, $right) }
        }
      `),
    ).toEqual([]);
  });

  test.each([
    [
      "compiler-import",
      'import { invokeMacro } from "@sweet-rewrite/expansion";',
    ],
    ["compiler-import", 'import fs from "node:fs";'],
    ["compiler-helper", "createSyntax(value)"],
    ["compiler-helper", "executeMatcher(program, input)"],
    ["host-execution", "eval(source)"],
    ["host-execution", "process.env.SECRET"],
    ["syntax-object-literal", 'const value = { tag: "token" };'],
  ])("rejects %s access", (rule, source) => {
    expect(auditDeclarativeSource(source, "bad.sts")).toMatchObject([
      { path: "bad.sts", line: 1, rule },
    ]);
  });

  test("audits every checked-in acceptance definition", async () => {
    expect(await auditAcceptanceMacros(process.cwd())).toEqual([]);
  });
});
