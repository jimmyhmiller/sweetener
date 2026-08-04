#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const release = JSON.parse(
  await readFile(join(root, "artifacts", "release", "release.json"), "utf8"),
);
const temporary = await mkdtemp(join(tmpdir(), "sweet-alpha-verify-"));
try {
  const dependencies = Object.fromEntries(
    release.packages.map(({ name, file }) => [
      name,
      `file:${join(root, "artifacts", "release", file)}`,
    ]),
  );
  dependencies.typescript = "npm:@typescript/typescript6@6.0.2";
  await writeFile(
    join(temporary, "package.json"),
    `${JSON.stringify(
      {
        name: "sweet-alpha-install-verification",
        private: true,
        type: "module",
        dependencies,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund"],
    { cwd: temporary, stdio: "inherit" },
  );
  for (const { name, version } of release.packages) {
    const manifest = JSON.parse(
      await readFile(
        join(temporary, "node_modules", ...name.split("/"), "package.json"),
        "utf8",
      ),
    );
    if (manifest.version !== version || manifest.private === true)
      throw new Error(`Invalid installed manifest for ${name}`);
    if (
      Object.values(manifest.dependencies ?? {}).some(
        (requirement) =>
          typeof requirement === "string" &&
          requirement.startsWith("workspace:"),
      )
    )
      throw new Error(
        `Installed package retains workspace dependency: ${name}`,
      );
  }
  const samples = join(temporary, "samples");
  await cp(join(root, "samples", "external"), samples, { recursive: true });
  const graph = execFileSync(
    process.execPath,
    [join(samples, "project-graph", "run.mjs")],
    { cwd: temporary, encoding: "utf8" },
  );
  const macro = execFileSync(
    process.execPath,
    [join(samples, "macro-editor", "run.mjs")],
    { cwd: temporary, encoding: "utf8" },
  );
  const defaultProject = execFileSync(
    process.execPath,
    [join(samples, "default-project", "run.mjs")],
    {
      cwd: temporary,
      encoding: "utf8",
      env: { ...process.env, SWEETENER_CONSUMER_ROOT: temporary },
    },
  );
  if (
    !graph.includes('"watch":"pass"') ||
    !macro.includes('"runtime":"pass"') ||
    !defaultProject.includes('"cli":"pass"')
  )
    throw new Error("Installed alpha sample workflows failed");
  process.stdout.write(
    `Verified ${String(release.packages.length)} installed alpha tarballs.\n${graph}${macro}${defaultProject}`,
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
