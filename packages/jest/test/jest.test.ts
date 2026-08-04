import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const execute = promisify(execFile);

test("Jest executes .sts through its real async transformer API", async () => {
  const root = mkdtempSync(join(tmpdir(), "sweet-jest-"));
  const config = join(root, "sweetener.json");
  writeFileSync(
    join(root, "macros.sts"),
    `export syntax twice:expr { rule { twice($x:tt) } => { [$x, $x] } }\n`,
  );
  writeFileSync(
    join(root, "value.sts"),
    `import { twice } from "./macros.sts" for syntax;\nexport const answer: number[] = twice(21);\n`,
  );
  writeFileSync(
    join(root, "value.test.mjs"),
    `import { answer } from "./value.sts";\ntest("expanded", () => expect(answer).toEqual([21, 21]));\n`,
  );
  writeFileSync(
    config,
    JSON.stringify({
      compilerOptions: { module: "ESNext" },
      files: ["value.sts", "macros.sts"],
    }),
  );
  const transformer = resolve("packages/jest/dist/src/index.js");
  const jestConfig = join(root, "jest.config.mjs");
  writeFileSync(
    jestConfig,
    `export default { rootDir: ${JSON.stringify(root)}, testEnvironment: "node", testMatch: ["**/*.test.mjs"], extensionsToTreatAsEsm: [".sts"], transform: { "\\.sts$": [${JSON.stringify(transformer)}, { configFile: ${JSON.stringify(config)} }] } };\n`,
  );
  const binary = resolve("packages/jest/node_modules/jest/bin/jest.js");
  const result = await execute(
    process.execPath,
    [
      "--experimental-vm-modules",
      binary,
      "--runInBand",
      "--config",
      jestConfig,
    ],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
      timeout: 60_000,
    },
  );
  expect(result.stderr).toMatch(/1 passed/u);
});
