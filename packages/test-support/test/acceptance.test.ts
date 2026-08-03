import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  AcceptanceIntentError,
  loadAcceptanceIntent,
  validateAcceptanceIntent,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function intent(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    fixtureId: "acceptance/example",
    status: "proposed",
    legacySources: ["example.sjs"],
    summary: "Expand an example form.",
    capabilities: [
      { id: "EXAMPLE-CAPABILITY", requirement: "Match the example form." },
    ],
    syntaxNotes: ["The semicolon terminates the form."],
    artifacts: {
      definition: "declarative.sts",
      input: "input.sts",
      expansion: "expected.ts",
      types: "types.ts",
      runtime: "expected.runtime.json",
      hygiene: { input: "hygiene.sts", expansion: "expected.hygiene.ts" },
      malformed: [
        {
          input: "malformed.sts",
          diagnostics: "expected.malformed.diagnostics.json",
        },
      ],
    },
    openDecisions: [
      { id: "OPEN-TEST-001", question: "Retain the terminator?" },
    ],
    ...overrides,
  };
}

async function createAcceptanceCase(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "sweet-acceptance-"));
  temporaryDirectories.push(directory);
  await writeFile(
    path.join(directory, "case.json"),
    JSON.stringify({
      id: "acceptance/example",
      languageVersion: "0.1",
      typescriptVersion: "pinned",
      compilerOptions: {},
      capabilities: ["EXAMPLE-CAPABILITY"],
      entry: "input.sts",
      expect: {
        expansion: false,
        bindings: false,
        trace: false,
        diagnostics: false,
        types: false,
        runtime: false,
      },
      limits: {},
    }),
  );
  await writeFile(
    path.join(directory, "intent.json"),
    JSON.stringify(intent()),
  );
  for (const name of [
    "declarative.sts",
    "input.sts",
    "expected.ts",
    "types.ts",
    "expected.runtime.json",
    "hygiene.sts",
    "expected.hygiene.ts",
    "malformed.sts",
    "expected.malformed.diagnostics.json",
  ]) {
    await writeFile(path.join(directory, name), "fixture\n");
  }
  return directory;
}

describe("acceptance intent", () => {
  it("validates the complete acceptance contract", () => {
    expect(validateAcceptanceIntent(intent())).toMatchObject({
      schemaVersion: 1,
      fixtureId: "acceptance/example",
      status: "proposed",
    });
  });

  it("rejects traversal, duplicate capabilities, and malformed decisions", () => {
    const invalid = intent();
    const artifacts = invalid.artifacts;
    artifacts.definition = "../definition.sts";
    invalid.capabilities.push({
      id: "EXAMPLE-CAPABILITY",
      requirement: "Duplicate",
    });
    invalid.openDecisions = [{ id: "decision", question: "" }];
    expect(() => validateAcceptanceIntent(invalid)).toThrow(
      AcceptanceIntentError,
    );
  });

  it("loads every referenced artifact and checks the fixture ID", async () => {
    const directory = await createAcceptanceCase();
    const loaded = await loadAcceptanceIntent(directory);
    expect(Object.keys(loaded.artifactPaths).sort()).toHaveLength(9);

    await writeFile(
      path.join(directory, "intent.json"),
      JSON.stringify(intent({ fixtureId: "acceptance/other" })),
    );
    await expect(loadAcceptanceIntent(directory)).rejects.toThrow(
      /does not match case id/,
    );
  });

  it("reports every absent referenced artifact", async () => {
    const directory = await createAcceptanceCase();
    await rm(path.join(directory, "declarative.sts"));
    await rm(path.join(directory, "malformed.sts"));
    await expect(loadAcceptanceIntent(directory)).rejects.toThrow(
      /missing referenced artifact declarative\.sts/,
    );
    await expect(loadAcceptanceIntent(directory)).rejects.toThrow(
      /missing referenced artifact malformed\.sts/,
    );
  });

  it("requires the case and intent capability ledgers to agree", async () => {
    const directory = await createAcceptanceCase();
    await writeFile(
      path.join(directory, "intent.json"),
      JSON.stringify(
        intent({
          capabilities: [
            { id: "INTENT-ONLY", requirement: "Missing from case.json" },
          ],
        }),
      ),
    );
    await expect(loadAcceptanceIntent(directory)).rejects.toThrow(
      /case capability EXAMPLE-CAPABILITY has no intent requirement/,
    );
    await expect(loadAcceptanceIntent(directory)).rejects.toThrow(
      /intent capability INTENT-ONLY is absent from case\.json/,
    );
  });

  it("rejects directories in place of artifacts", async () => {
    const directory = await createAcceptanceCase();
    await rm(path.join(directory, "types.ts"));
    await mkdir(path.join(directory, "types.ts"));
    await expect(loadAcceptanceIntent(directory)).rejects.toThrow(
      /types\.ts is not a file/,
    );
  });
});
