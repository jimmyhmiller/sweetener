import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";
import { describe, expect, test } from "vitest";
import plugin, { formatSweetener } from "../src/index.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");

describe("Sweetener Prettier plugin", () => {
  test("registers and formats .sts files through Prettier", async () => {
    const source = `export syntax unless:stmt {
rule { unless ($condition:expr) $body:stmt } => {
if (!($condition)) $body
}
}
`;
    const formatted = await format(source, {
      filepath: "macros.sts",
      plugins: [plugin],
    });

    expect(formatted).toBe(`export syntax unless:stmt {
  rule { unless ($condition:expr) $body:stmt } => {
    if (!($condition)) $body
  }
}
`);
  });

  test("is idempotent across the language-tour corpus", async () => {
    const tourRoot = resolve(repositoryRoot, "examples/language-tour");
    const names = (await readdir(tourRoot, { recursive: true }))
      .filter((name) => /\.stsx?$/u.test(name))
      .sort();

    for (const name of names) {
      const source = await readFile(resolve(tourRoot, name), "utf8");
      const once = await format(source, {
        filepath: name,
        plugins: [plugin],
      });
      const twice = await format(once, {
        filepath: name,
        plugins: [plugin],
      });
      expect(twice, name).toBe(once);
    }
  });

  test("preserves whitespace with runtime meaning", () => {
    const source =
      "const template = `first\\n  second`;\nconst view = <pre>  exact  </pre>;\n";
    expect(formatSweetener(source, { filepath: "view.stsx" })).toBe(source);
  });

  test("rejects structurally malformed input", () => {
    expect(() =>
      formatSweetener("syntax broken {", { filepath: "bad.sts" }),
    ).toThrow(/malformed source/u);
  });
});
