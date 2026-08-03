import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { discoverFixtures, loadAcceptanceIntent } from "../src/index.js";

interface CorpusEntry {
  readonly fixtureId: string;
  readonly source: string;
  readonly imported: string;
  readonly sourceSha256: string;
  readonly importedSha256: string;
}

interface CorpusManifest {
  readonly schemaVersion: number;
  readonly normalization: string;
  readonly entries: readonly CorpusEntry[];
}

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");
const playgroundRoot = path.join(
  repositoryRoot,
  "fixtures/acceptance/playground",
);
const contractedFixtures = [
  "adt",
  "core-rewrites",
  "csp",
  "currying",
  "do-notation",
  "implicit-return",
  "multi-part-methods",
  "new-language",
  "operators",
  "protocols",
  "rewritten-if",
  "threading",
] as const;

function compileTypeScript(files: readonly string[]): readonly string[] {
  const program = ts.createProgram([...files], {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2024,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    skipLibCheck: false,
  });
  return ts
    .getPreEmitDiagnostics(program)
    .map((diagnostic) =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    );
}

async function readCorpus(): Promise<CorpusManifest> {
  return JSON.parse(
    await readFile(path.join(playgroundRoot, "corpus.json"), "utf8"),
  ) as CorpusManifest;
}

describe("playground acceptance corpus", () => {
  it("loads every classified fixture through the public harness", async () => {
    const fixtures = await discoverFixtures(playgroundRoot);
    expect(fixtures.map(({ manifest }) => manifest.id)).toEqual([
      "playground/adt",
      "playground/core-rewrites",
      "playground/csp",
      "playground/currying",
      "playground/do-notation",
      "playground/implicit-return",
      "playground/multi-part-methods",
      "playground/new-language",
      "playground/operators",
      "playground/protocols",
      "playground/rewritten-if",
      "playground/threading",
    ]);
  });

  it("loads complete contracts for dependency-driving examples", async () => {
    for (const name of contractedFixtures) {
      const loaded = await loadAcceptanceIntent(
        path.join(playgroundRoot, name),
      );
      expect(loaded.intent.status).toBe("proposed");
      expect(loaded.intent.capabilities.length).toBeGreaterThan(1);
    }
  });

  it(
    "typechecks proposed expansions for dependency-driving examples",
    { timeout: 30_000 },
    () => {
      const primaryFiles = contractedFixtures.flatMap((name) => {
        const directory = path.join(playgroundRoot, name);
        return [
          path.join(directory, "expected.ts"),
          path.join(directory, "types.ts"),
        ];
      });
      const hygieneFiles = contractedFixtures.map((name) =>
        path.join(playgroundRoot, name, "expected.hygiene.ts"),
      );
      expect(compileTypeScript(primaryFiles), "primary expansions").toEqual([]);
      expect(compileTypeScript(hygieneFiles), "hygiene expansions").toEqual([]);
    },
  );

  it("detects changes to imported legacy sources", async () => {
    const corpus = await readCorpus();
    expect(corpus.schemaVersion).toBe(1);
    expect(corpus.normalization).toBe("LF content with one final newline");
    for (const entry of corpus.entries) {
      const contents = await readFile(
        path.join(repositoryRoot, entry.imported),
      );
      const digest = createHash("sha256").update(contents).digest("hex");
      expect(digest, entry.imported).toBe(entry.importedSha256);
      expect(entry.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("records provenance for every fixture and auxiliary macro source", async () => {
    const corpus = await readCorpus();
    const provenanceByFixture = Map.groupBy(
      corpus.entries,
      ({ fixtureId }) => fixtureId,
    );
    const fixtures = await discoverFixtures(playgroundRoot);
    for (const fixture of fixtures) {
      expect(
        provenanceByFixture.get(fixture.manifest.id)?.length,
      ).toBeGreaterThan(0);
    }
    expect(
      provenanceByFixture
        .get("playground/rewritten-if")
        ?.map(({ source }) => source),
    ).toEqual(["new/if.sjs", "new/helpers.sjs"]);
  });
});
