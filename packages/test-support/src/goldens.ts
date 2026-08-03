import { promises as fs } from "node:fs";
import path from "node:path";
import {
  loadFixture,
  type FixtureArtifactName,
  type LoadedFixture,
} from "./fixtures.js";

const goldenNames = new Set<FixtureArtifactName>([
  "expected.ts",
  "expected.bindings.json",
  "expected.trace.json",
  "expected.diagnostics.json",
  "expected.runtime.json",
]);

export interface GoldenLocation {
  readonly fixture: LoadedFixture;
  readonly artifactName: FixtureArtifactName;
  readonly candidatePath: string;
  readonly goldenPath: string;
}

function assertGoldenName(value: string): asserts value is FixtureArtifactName {
  if (!goldenNames.has(value as FixtureArtifactName)) {
    throw new RangeError(`Unsupported golden artifact: ${value}`);
  }
}

async function resolveGoldenLocation(
  caseDirectory: string,
  artifactName: string,
  candidateRoot: string,
): Promise<GoldenLocation> {
  assertGoldenName(artifactName);
  const fixture = await loadFixture(caseDirectory);
  return {
    fixture,
    artifactName,
    candidatePath: path.join(
      path.resolve(candidateRoot),
      ...fixture.manifest.id.split("/"),
      artifactName,
    ),
    goldenPath: path.join(fixture.directory, artifactName),
  };
}

export async function writeGoldenCandidate(
  caseDirectory: string,
  artifactName: string,
  actualPath: string,
  candidateRoot = "artifacts/golden-candidates",
): Promise<GoldenLocation> {
  const location = await resolveGoldenLocation(
    caseDirectory,
    artifactName,
    candidateRoot,
  );
  const contents = await fs.readFile(path.resolve(actualPath));
  await fs.mkdir(path.dirname(location.candidatePath), { recursive: true });
  await fs.writeFile(location.candidatePath, contents);
  return location;
}

export async function acceptGoldenCandidate(
  caseDirectory: string,
  artifactName: string,
  candidateRoot = "artifacts/golden-candidates",
): Promise<GoldenLocation> {
  const location = await resolveGoldenLocation(
    caseDirectory,
    artifactName,
    candidateRoot,
  );
  const contents = await fs.readFile(location.candidatePath);
  await fs.writeFile(location.goldenPath, contents);
  return location;
}
