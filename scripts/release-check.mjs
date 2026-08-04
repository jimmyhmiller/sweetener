#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const releaseRoot = join(root, "artifacts", "release");
const release = JSON.parse(
  await readFile(join(releaseRoot, "release.json"), "utf8"),
);
const problems = [];
if (release.release !== "0.1.0-alpha.0")
  problems.push("unexpected alpha version");
for (const field of [
  "languageVersion",
  "specificationVersion",
  "macroModuleFormatVersion",
  "originMapSchemaVersion",
  "expansionTraceSchemaVersion",
  "fixtureVersion",
])
  if (release[field] === undefined) problems.push(`missing ${field}`);
const expectedPackageNames = new Set(
  await Promise.all(
    (await readdir(join(root, "packages"), { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const manifest = JSON.parse(
          await readFile(
            join(root, "packages", entry.name, "package.json"),
            "utf8",
          ),
        );
        return manifest.name;
      }),
  ),
);
const releasedPackageNames = new Set(release.packages.map((item) => item.name));
if (
  expectedPackageNames.size !== releasedPackageNames.size ||
  [...expectedPackageNames].some((name) => !releasedPackageNames.has(name))
)
  problems.push("release package set does not match the workspace");
for (const item of release.packages) {
  const bytes = await readFile(join(releaseRoot, item.file));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== item.sha256 || bytes.byteLength !== item.bytes)
    problems.push(`tarball integrity mismatch for ${item.name}`);
  const manifest = JSON.parse(
    await readFile(
      join(releaseRoot, "staging", item.name.split("/").at(-1), "package.json"),
      "utf8",
    ),
  );
  if (manifest.private === true || manifest.version !== release.release)
    problems.push(`invalid publish manifest for ${item.name}`);
  if (
    Object.values(manifest.dependencies ?? {}).some(
      (value) => typeof value === "string" && value.startsWith("workspace:"),
    )
  )
    problems.push(`workspace dependency in ${item.name}`);
}
for (const document of [
  "0.1.0-alpha.0.md",
  "compatibility-matrix.md",
  "external-samples.md",
  "known-limitations.md",
  "versioning.md",
])
  try {
    await readFile(join(root, "docs", "release", document), "utf8");
  } catch {
    problems.push(`missing release document ${document}`);
  }

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`${problem}\n`);
  process.exitCode = 1;
} else
  process.stdout.write("Alpha release artifacts and documents are current.\n");
