import { promises as fs } from "node:fs";
import path from "node:path";

export interface FixtureExpectations {
  readonly expansion: boolean;
  readonly bindings: boolean;
  readonly trace: boolean;
  readonly diagnostics?: boolean;
  readonly types: boolean;
  readonly runtime: boolean;
}

export interface FixtureManifest {
  readonly $schema?: string;
  readonly id: string;
  readonly languageVersion: string;
  readonly typescriptVersion: string;
  readonly compilerOptions: Readonly<Record<string, unknown>>;
  readonly capabilities: readonly string[];
  readonly entry: string;
  readonly expect: FixtureExpectations;
  readonly limits: Readonly<Record<string, unknown>>;
}

export type FixtureArtifactName =
  | "macros.sts"
  | "expected.ts"
  | "expected.bindings.json"
  | "expected.trace.json"
  | "expected.diagnostics.json"
  | "expected.runtime.json"
  | "types.ts";

export interface LoadedFixture {
  readonly directory: string;
  readonly manifestPath: string;
  readonly manifest: FixtureManifest;
  readonly entryPath: string;
  readonly entrySource: string;
  readonly artifacts: Readonly<Partial<Record<FixtureArtifactName, string>>>;
}

export class FixtureManifestError extends Error {
  override readonly name = "FixtureManifestError";

  constructor(
    readonly manifestPath: string,
    readonly problems: readonly string[],
  ) {
    super(
      `${manifestPath}:\n${problems.map((problem) => `- ${problem}`).join("\n")}`,
    );
  }
}

const artifactNames: readonly FixtureArtifactName[] = [
  "macros.sts",
  "expected.ts",
  "expected.bindings.json",
  "expected.trace.json",
  "expected.diagnostics.json",
  "expected.runtime.json",
  "types.ts",
];

const manifestKeys = new Set([
  "$schema",
  "id",
  "languageVersion",
  "typescriptVersion",
  "compilerOptions",
  "capabilities",
  "entry",
  "expect",
  "limits",
]);
const expectationKeys = new Set([
  "expansion",
  "bindings",
  "trace",
  "diagnostics",
  "types",
  "runtime",
]);
const requiredExpectations = [
  "expansion",
  "bindings",
  "trace",
  "types",
  "runtime",
] as const;
const fixtureIdPattern = /^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)+$/;
const capabilityPattern = /^[A-Z][A-Z0-9-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateRecord(
  value: unknown,
  field: string,
  problems: string[],
): value is Record<string, unknown> {
  if (!isRecord(value)) {
    problems.push(`${field} must be an object`);
    return false;
  }
  return true;
}

export function validateFixtureManifest(
  value: unknown,
  manifestPath = "case.json",
): FixtureManifest {
  const problems: string[] = [];
  if (!validateRecord(value, "manifest", problems)) {
    throw new FixtureManifestError(manifestPath, problems);
  }

  for (const key of Object.keys(value)) {
    if (!manifestKeys.has(key)) problems.push(`unknown field ${key}`);
  }
  if (typeof value["id"] !== "string" || !fixtureIdPattern.test(value["id"])) {
    problems.push("id must contain at least two lowercase path segments");
  }
  if (
    typeof value["languageVersion"] !== "string" ||
    value["languageVersion"].length === 0
  ) {
    problems.push("languageVersion must be a non-empty string");
  }
  if (
    typeof value["typescriptVersion"] !== "string" ||
    value["typescriptVersion"].length === 0
  ) {
    problems.push("typescriptVersion must be a non-empty string");
  }
  validateRecord(value["compilerOptions"], "compilerOptions", problems);
  validateRecord(value["limits"], "limits", problems);

  if (!Array.isArray(value["capabilities"])) {
    problems.push("capabilities must be an array");
  } else {
    const seen = new Set<string>();
    for (const capability of value["capabilities"]) {
      if (
        typeof capability !== "string" ||
        !capabilityPattern.test(capability)
      ) {
        problems.push(`invalid capability ${String(capability)}`);
      } else if (seen.has(capability)) {
        problems.push(`duplicate capability ${capability}`);
      } else {
        seen.add(capability);
      }
    }
  }

  if (
    typeof value["entry"] !== "string" ||
    !/^[^/\\]+\.sts$/.test(value["entry"])
  ) {
    problems.push("entry must name an .sts file in the case directory");
  }

  if (validateRecord(value["expect"], "expect", problems)) {
    for (const key of Object.keys(value["expect"])) {
      if (!expectationKeys.has(key))
        problems.push(`unknown expect field ${key}`);
    }
    for (const key of requiredExpectations) {
      if (typeof value["expect"][key] !== "boolean") {
        problems.push(`expect.${key} must be boolean`);
      }
    }
    if (
      value["expect"]["diagnostics"] !== undefined &&
      typeof value["expect"]["diagnostics"] !== "boolean"
    ) {
      problems.push("expect.diagnostics must be boolean");
    }
  }

  if (problems.length > 0) {
    throw new FixtureManifestError(manifestPath, problems);
  }
  return value as unknown as FixtureManifest;
}

async function readOptionalFile(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error: unknown) {
    if (
      isRecord(error) &&
      (error["code"] === "ENOENT" || error["code"] === "EISDIR")
    ) {
      return undefined;
    }
    throw error;
  }
}

export async function loadFixture(
  caseDirectory: string,
): Promise<LoadedFixture> {
  const directory = path.resolve(caseDirectory);
  const manifestPath = path.join(directory, "case.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(manifestPath, "utf8")) as unknown;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new FixtureManifestError(manifestPath, [message]);
  }
  const manifest = validateFixtureManifest(parsed, manifestPath);
  const entryPath = path.join(directory, manifest.entry);
  let entrySource: string;
  try {
    entrySource = await fs.readFile(entryPath, "utf8");
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new FixtureManifestError(manifestPath, [
      `cannot read entry ${manifest.entry}: ${message}`,
    ]);
  }

  const entries = await Promise.all(
    artifactNames.map(
      async (name) =>
        [name, await readOptionalFile(path.join(directory, name))] as const,
    ),
  );
  const artifacts: Partial<Record<FixtureArtifactName, string>> = {};
  for (const [name, contents] of entries) {
    if (contents !== undefined) artifacts[name] = contents;
  }
  const requiredArtifacts: Array<
    readonly [keyof FixtureExpectations, FixtureArtifactName]
  > = [
    ["expansion", "expected.ts"],
    ["bindings", "expected.bindings.json"],
    ["trace", "expected.trace.json"],
    ["diagnostics", "expected.diagnostics.json"],
    ["types", "types.ts"],
    ["runtime", "expected.runtime.json"],
  ];
  const missingArtifacts = requiredArtifacts
    .filter(([expectation, artifact]) =>
      Boolean(
        manifest.expect[expectation] && artifacts[artifact] === undefined,
      ),
    )
    .map(
      ([expectation, artifact]) => `expect.${expectation} requires ${artifact}`,
    );
  if (missingArtifacts.length > 0) {
    throw new FixtureManifestError(manifestPath, missingArtifacts);
  }
  return Object.freeze({
    directory,
    manifestPath,
    manifest,
    entryPath,
    entrySource,
    artifacts: Object.freeze(artifacts),
  });
}

async function findManifests(
  directory: string,
  output: string[],
): Promise<void> {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await findManifests(entryPath, output);
    else if (entry.isFile() && entry.name === "case.json")
      output.push(entryPath);
  }
}

export async function discoverFixtures(
  root: string,
): Promise<readonly LoadedFixture[]> {
  const manifests: string[] = [];
  await findManifests(path.resolve(root), manifests);
  const fixtures = await Promise.all(
    manifests.map((manifest) => loadFixture(path.dirname(manifest))),
  );
  const ids = new Set<string>();
  for (const fixture of fixtures) {
    if (ids.has(fixture.manifest.id)) {
      throw new FixtureManifestError(fixture.manifestPath, [
        `duplicate fixture id ${fixture.manifest.id}`,
      ]);
    }
    ids.add(fixture.manifest.id);
  }
  return fixtures.sort((left, right) =>
    left.manifest.id.localeCompare(right.manifest.id),
  );
}
