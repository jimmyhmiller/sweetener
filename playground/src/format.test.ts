import { describe, expect, test } from "vitest";
import { formatPlaygroundFile } from "./format.js";

describe("playground formatting", () => {
  test("formats Sweetener source without expanding its macros", async () => {
    const source = `export syntax unless:stmt {
rule { unless ($condition:expr) $body:stmt } => {
if (!($condition)) $body
}
}
`;

    await expect(formatPlaygroundFile("macros.sts", source)).resolves.toBe(
      `export syntax unless:stmt {
  rule { unless ($condition:expr) $body:stmt } => {
    if (!($condition)) $body
  }
}
`,
    );
  });

  test("uses Prettier's TypeScript printer for generated output", async () => {
    await expect(
      formatPlaygroundFile("main.ts", "export const answer={value:42};"),
    ).resolves.toBe("export const answer = { value: 42 };\n");
  });
});
