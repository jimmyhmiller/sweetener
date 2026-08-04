import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const execute = promisify(execFile);

test("Node imports and executes .sts through registration hooks", async () => {
  const root = mkdtempSync(join(tmpdir(), "sweet-node-"));
  writeFileSync(
    join(root, "macros.sts"),
    `export syntax twice:expr { rule { twice($x:tt) } => { [$x, $x] } }\n`,
  );
  writeFileSync(
    join(root, "value.sts"),
    `import { twice } from "./macros.sts" for syntax;\nexport const answer: number[] = twice(21);\n`,
  );
  writeFileSync(
    join(root, "main.mjs"),
    `import { answer } from "./value.sts";\nconsole.log(answer.join(","));\n`,
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { module: "ESNext" },
      files: ["value.sts", "macros.sts"],
    }),
  );
  const result = await execute(
    process.execPath,
    [
      "--import",
      resolve("packages/node/dist/src/register.js"),
      join(root, "main.mjs"),
    ],
    { encoding: "utf8" },
  );
  expect(result.stdout.trim()).toBe("21,21");
});
