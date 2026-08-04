import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import commonjs from "@babel/plugin-transform-modules-commonjs";
import typescript from "@babel/preset-typescript";
import { expect, test } from "vitest";
import { transformSweetenerFile } from "../src/index.js";

test("expands before Babel parses and composes source maps", async () => {
  const root = mkdtempSync(join(tmpdir(), "sweet-babel-"));
  const entry = join(root, "main.sts");
  writeFileSync(
    join(root, "macros.sts"),
    `export syntax twice:expr { rule { twice($x:tt) } => { [$x, $x] } }\n`,
  );
  writeFileSync(
    entry,
    `import { twice } from "./macros.sts" for syntax;\nexport const answer: number[] = twice(21);\n`,
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { module: "ESNext" },
      files: ["main.sts", "macros.sts"],
    }),
  );
  const result = await transformSweetenerFile(entry, {
    babel: { presets: [typescript], plugins: [commonjs], sourceMaps: true },
  });
  expect(result.code).toContain("[21, 21]");
  expect(result.code).not.toContain("for syntax");
  expect(result.code).not.toContain(": number[]");
  expect(
    result.map?.sources.some((source) => source?.endsWith("main.sts") === true),
  ).toBe(true);
});
