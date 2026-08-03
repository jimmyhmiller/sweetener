import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverFixtures,
  FixtureManifestError,
  loadFixture,
  validateFixtureManifest,
} from "../src/index.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function manifest(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    languageVersion: "0.1",
    typescriptVersion: "pinned",
    compilerOptions: { strict: true },
    capabilities: ["HARNESS-SELF-TEST"],
    entry: "input.sts",
    expect: {
      expansion: false,
      bindings: false,
      trace: false,
      types: false,
      runtime: false,
    },
    limits: {},
    ...overrides,
  };
}

async function createCase(root: string, relative: string, id: string) {
  const directory = path.join(root, relative);
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "case.json"),
    JSON.stringify(manifest(id)),
  );
  await writeFile(path.join(directory, "input.sts"), "const answer = 42;\n");
  return directory;
}

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "sweet-fixtures-"));
  temporaryDirectories.push(root);
  return root;
}

describe("fixture manifests", () => {
  it("validates required fields and rejects unknown fields", () => {
    expect(validateFixtureManifest(manifest("harness/valid"))).toMatchObject({
      id: "harness/valid",
      entry: "input.sts",
    });
    expect(() =>
      validateFixtureManifest({
        ...manifest("harness/invalid"),
        surprise: true,
        capabilities: ["BAD value", "BAD value"],
      }),
    ).toThrow(FixtureManifestError);
  });

  it("loads entry source and optional artifacts", async () => {
    const root = await temporaryRoot();
    const directory = await createCase(root, "case", "harness/load");
    await writeFile(path.join(directory, "macros.sts"), "macro example {}\n");
    const fixture = await loadFixture(directory);
    expect(fixture.entrySource).toBe("const answer = 42;\n");
    expect(fixture.artifacts["macros.sts"]).toBe("macro example {}\n");
    expect(fixture.artifacts["expected.ts"]).toBeUndefined();
  });

  it("requires each enabled expectation artifact", async () => {
    const root = await temporaryRoot();
    const directory = await createCase(root, "case", "harness/missing");
    await writeFile(
      path.join(directory, "case.json"),
      JSON.stringify(
        manifest("harness/missing", {
          expect: {
            expansion: true,
            bindings: false,
            trace: false,
            diagnostics: true,
            types: false,
            runtime: false,
          },
        }),
      ),
    );
    await expect(loadFixture(directory)).rejects.toThrow(
      /expect\.expansion requires expected\.ts/,
    );
    await expect(loadFixture(directory)).rejects.toThrow(
      /expect\.diagnostics requires expected\.diagnostics\.json/,
    );
  });

  it("discovers cases in ID order and rejects duplicate IDs", async () => {
    const root = await temporaryRoot();
    await createCase(root, "z", "harness/zeta");
    await createCase(root, "a", "harness/alpha");
    expect(
      (await discoverFixtures(root)).map(({ manifest: { id } }) => id),
    ).toEqual(["harness/alpha", "harness/zeta"]);
    await createCase(root, "duplicate", "harness/alpha");
    await expect(discoverFixtures(root)).rejects.toThrow(
      /duplicate fixture id harness\/alpha/,
    );
  });

  it("reports malformed JSON and missing entry files as manifest errors", async () => {
    const root = await temporaryRoot();
    const malformed = path.join(root, "malformed");
    await mkdir(malformed);
    await writeFile(path.join(malformed, "case.json"), "{");
    await expect(loadFixture(malformed)).rejects.toBeInstanceOf(
      FixtureManifestError,
    );

    const missing = await createCase(root, "missing", "harness/no-entry");
    await rm(path.join(missing, "input.sts"));
    await expect(loadFixture(missing)).rejects.toThrow(/cannot read entry/);
  });
});
