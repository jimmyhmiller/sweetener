import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";
import { describe, expect, test } from "vitest";
import plugin, {
  formatSweetener,
  formatSweetenerWithPrettier,
} from "../src/index.js";

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

  test("does not indent otherwise blank lines", () => {
    const source = `export syntax class Example {
  fields {
    name: binding;
  }

  rule { $name:binding }
}
`;

    expect(formatSweetener(source, { filepath: "macros.sts" })).toBe(source);
  });

  test("formats TypeScript and JSX inside an imported item macro", async () => {
    const source = `import { memoized } from "./fine-jsx.stsx" for syntax;

interface FixtureProps { readonly cond?: boolean; readonly id: number; }

memoized function Component({ cond = false, id }: FixtureProps) {
  return (<><div className={identity(styles.a, id !== null ? styles.b : {})}></div>{cond === false && (<div className={identity(styles.c, DISPLAY ? styles.d : {})} />)}</>);
}
`;
    const formatted = await formatSweetenerWithPrettier(source, {
      filepath: "main.stsx",
    });

    expect(formatted).toContain(
      `import { memoized } from "./fine-jsx.stsx" for syntax;`,
    );
    expect(formatted).toContain(`memoized function Component(`);
    expect(formatted).toContain("cond = false,\n  id\n");
    expect(formatted).not.toContain("id,\n}: FixtureProps");
    expect(formatted).toContain("return (\n    <>");
    expect(formatted).toContain("{cond === false && (");
    await expect(
      formatSweetenerWithPrettier(formatted, { filepath: "main.stsx" }),
    ).resolves.toBe(formatted);
  });

  test("never changes the token stream seen by macro matchers", async () => {
    const source = `import { wrapped } from "./macros.sts" for syntax;

wrapped const example = { single: 'quoted' };
`;
    const formatted = await formatSweetenerWithPrettier(source, {
      filepath: "main.sts",
    });

    expect(formatted).toContain("{ single: 'quoted' }");
  });

  test("rejects structurally malformed input", () => {
    expect(() =>
      formatSweetener("syntax broken {", { filepath: "bad.sts" }),
    ).toThrow(/malformed source/u);
  });
});
