#!/usr/bin/env node

// Installs and builds what `sweetener init` writes.
//
// The scaffold's own tests expand its files in this process, which says the
// sources are good and nothing about whether the package.json and tsconfig it
// writes describe a project a package manager and the command line will
// actually accept. That is the first thing anyone does with this.

import { execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = mkdtempSync(join(tmpdir(), "sweetener-scaffold-"));
const run = (command, args, cwd = directory) =>
  execFileSync(command, args, { cwd, encoding: "utf8", stdio: "pipe" });

try {
  run(process.execPath, [
    join(root, "packages/cli/bin/sweetener.mjs"),
    "init",
    directory,
    "--yes",
  ]);

  // As a person would: install what the scaffold asked for, then build.
  run("pnpm", ["install", "--ignore-workspace", "--lockfile=false"]);
  const built = run("pnpm", ["run", "build"]);

  const emitted = await readFile(join(directory, "dist", "main.js"), "utf8");
  const problems = [];
  if (!/\[\s*21\s*,\s*21\s*\]/u.test(emitted))
    problems.push(`the macro did not expand: ${JSON.stringify(emitted)}`);
  // The scaffold's sample introduces a binding the call site also uses, so a
  // build that did not apply hygiene would emit two bindings named `total`.
  if (!/total_\d+/u.test(emitted))
    problems.push("hygiene did not rename the introduced binding");
  if (!built.includes("build: success"))
    problems.push(`build did not report success: ${built.trim()}`);

  const declarations = await readFile(
    join(directory, "dist", "main.d.ts"),
    "utf8",
  );
  if (!declarations.includes("doubled"))
    problems.push("no declarations were emitted for the expanded module");

  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`${problem}\n`);
    process.exitCode = 1;
  } else
    process.stdout.write(
      "A scaffolded project installs, builds, and runs its macros.\n",
    );
} finally {
  await rm(directory, { recursive: true, force: true });
}
