import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect, test } from "vitest";

const execute = promisify(execFile);

test("Bun builds and directly runs Sweetener through its real plugin API", async () => {
  const binary = resolve("packages/unplugin/node_modules/.bin/bun");
  const runner = resolve("packages/unplugin/test/bun-runner.ts");
  const result = await execute(binary, [runner], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  expect(result.stderr).toBe("");
});
