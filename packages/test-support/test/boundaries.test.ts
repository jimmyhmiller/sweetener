import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../../../", import.meta.url)),
);

describe("package boundary checker", () => {
  function check(root: string) {
    return spawnSync(
      process.execPath,
      [resolve(repositoryRoot, "scripts/check-boundaries.mjs"), "--root", root],
      { encoding: "utf8" },
    );
  }

  it("accepts the workspace package graph", () => {
    const result = check(repositoryRoot);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Package boundary check passed.");
  });

  it("rejects internal package imports", () => {
    const fixture = resolve(
      repositoryRoot,
      "fixtures/tooling/boundaries/internal-import",
    );
    const result = check(fixture);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "packages/one/src/index.ts imports internal package path @sweet-rewrite/two/internal",
    );
  });

  it("rejects workspace package cycles", () => {
    const fixture = resolve(
      repositoryRoot,
      "fixtures/tooling/boundaries/cycle",
    );
    const result = check(fixture);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "workspace package cycle: @sweet-rewrite/one -> @sweet-rewrite/two -> @sweet-rewrite/one",
    );
  });
});
