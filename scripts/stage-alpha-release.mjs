#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = join(root, "artifacts", "release");
const staging = join(output, "staging");
const tarballs = join(output, "tarballs");
const version = "0.1.0-alpha.0";
const packageRoot = join(root, "packages");

await rm(output, { recursive: true, force: true });
await mkdir(staging, { recursive: true });
await mkdir(tarballs, { recursive: true });

const packageDirectories = (await readdir(packageRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map(({ name }) => name)
  .sort();
const staged = [];
for (const directory of packageDirectories) {
  const sourceDirectory = join(packageRoot, directory);
  const manifest = JSON.parse(
    await readFile(join(sourceDirectory, "package.json"), "utf8"),
  );
  const targetDirectory = join(staging, directory);
  await mkdir(targetDirectory, { recursive: true });
  await cp(join(sourceDirectory, "dist"), join(targetDirectory, "dist"), {
    recursive: true,
  });
  const dependencies = Object.fromEntries(
    Object.entries(manifest.dependencies ?? {}).map(([name, requirement]) => [
      name,
      typeof requirement === "string" && requirement.startsWith("workspace:")
        ? version
        : requirement,
    ]),
  );
  const publishManifest = {
    name: manifest.name,
    version,
    description: `Sweetener alpha package: ${directory}`,
    type: "module",
    exports: manifest.exports,
    files: ["dist"],
    dependencies,
    engines: { node: ">=24 <25" },
    publishConfig: { access: "public", provenance: true },
  };
  await writeFile(
    join(targetDirectory, "package.json"),
    `${JSON.stringify(publishManifest, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(targetDirectory, "README.md"),
    `# ${manifest.name}\n\nAlpha package from Sweetener language version 1.\n`,
    "utf8",
  );
  const packed = execFileSync(
    "npm",
    ["pack", "--silent", "--pack-destination", tarballs],
    { cwd: targetDirectory, encoding: "utf8" },
  ).trim();
  staged.push({ name: manifest.name, directory, tarball: packed });
}

const packages = [];
for (const item of staged) {
  const path = join(tarballs, item.tarball);
  const bytes = await readFile(path);
  packages.push({
    name: item.name,
    version,
    file: `tarballs/${basename(path)}`,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const release = {
  schemaVersion: 1,
  release: version,
  languageVersion: "1",
  specificationVersion: "1",
  macroModuleFormatVersion: 1,
  originMapSchemaVersion: 1,
  expansionTraceSchemaVersion: 1,
  fixtureVersion: "1",
  node: ">=24 <25",
  typescriptApi: "6.0.x",
  packages,
};
await writeFile(
  join(output, "release.json"),
  `${JSON.stringify(release, null, 2)}\n`,
  "utf8",
);
process.stdout.write(
  `Staged ${String(packages.length)} packages for ${version} in ${output}\n`,
);
