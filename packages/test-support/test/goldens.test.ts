import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { acceptGoldenCandidate, writeGoldenCandidate } from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("golden candidates", () => {
  it("keeps candidate creation separate from explicit acceptance", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sweet-goldens-"));
    temporaryDirectories.push(root);
    const caseDirectory = path.join(root, "case");
    const candidateRoot = path.join(root, "candidates");
    await mkdir(caseDirectory);
    await writeFile(
      path.join(caseDirectory, "case.json"),
      JSON.stringify({
        id: "harness/golden",
        languageVersion: "0.1",
        typescriptVersion: "pinned",
        compilerOptions: {},
        capabilities: ["HARNESS-GOLDEN"],
        entry: "input.sts",
        expect: {
          expansion: false,
          bindings: false,
          trace: false,
          types: false,
          runtime: false,
        },
        limits: {},
      }),
    );
    await writeFile(path.join(caseDirectory, "input.sts"), "input\n");
    const actual = path.join(root, "actual.ts");
    await writeFile(actual, "expanded\n");

    const candidate = await writeGoldenCandidate(
      caseDirectory,
      "expected.ts",
      actual,
      candidateRoot,
    );
    expect(await readFile(candidate.candidatePath, "utf8")).toBe("expanded\n");
    await expect(readFile(candidate.goldenPath, "utf8")).rejects.toThrow();

    await acceptGoldenCandidate(caseDirectory, "expected.ts", candidateRoot);
    expect(await readFile(candidate.goldenPath, "utf8")).toBe("expanded\n");
  });

  it("rejects artifact names outside the golden allowlist", async () => {
    await expect(
      writeGoldenCandidate("case", "input.sts", "actual"),
    ).rejects.toThrow(/Unsupported golden artifact/);
  });
});
