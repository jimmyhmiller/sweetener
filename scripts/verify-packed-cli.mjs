#!/usr/bin/env node

// Runs the command line out of the packed tarballs.
//
// Everything else about the release is checked by reading it: the tarballs
// hash to what the manifest says, the manifests carry no workspace ranges, the
// documents exist. None of that runs the thing being shipped, which is how a
// tarball that declared a `sweetener` command while containing no such file
// passed every check. This installs what would be published and uses it.

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync } from "node:fs";
import {
  mkdir,
  readFile,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const releaseRoot = join(root, "artifacts", "release");
const release = JSON.parse(
  await readFile(join(releaseRoot, "release.json"), "utf8"),
);

const problems = [];
const directory = mkdtempSync(join(tmpdir(), "sweetener-packed-"));
const modules = join(directory, "node_modules");

try {
  // Unpack every package as a consumer would receive it. They depend on each
  // other by name, so they all have to be present for any of them to load.
  for (const item of release.packages) {
    const target = join(modules, item.name);
    await mkdir(target, { recursive: true });
    execFileSync(
      "tar",
      [
        "-xzf",
        join(releaseRoot, item.file),
        "-C",
        target,
        "--strip-components=1",
      ],
      { stdio: "pipe" },
    );
    const manifest = JSON.parse(
      await readFile(join(target, "package.json"), "utf8"),
    );
    // A package that lists what it ships must actually ship it.
    for (const entry of manifest.files ?? []) {
      try {
        await stat(join(target, entry));
      } catch {
        problems.push(`${item.name} declares files["${entry}"] but omits it`);
      }
    }
    for (const [command, file] of Object.entries(manifest.bin ?? {})) {
      try {
        await readFile(join(target, file), "utf8");
      } catch {
        problems.push(
          `${item.name} declares the ${command} command as ${file}, which the tarball does not contain`,
        );
      }
    }
  }

  // TypeScript comes from the registry for a real consumer. Borrowing the copy
  // already installed here keeps this check off the network.
  const require = createRequire(join(root, "package.json"));
  let typescriptRoot = dirname(require.resolve("typescript"));
  while (typescriptRoot !== dirname(typescriptRoot)) {
    try {
      await readFile(join(typescriptRoot, "package.json"), "utf8");
      break;
    } catch {
      typescriptRoot = dirname(typescriptRoot);
    }
  }
  await symlink(typescriptRoot, join(modules, "typescript"), "dir");

  // A project of the shape the README describes.
  await writeFile(
    join(directory, "macros.sts"),
    `export syntax twice:expr {\n  rule { twice($value:expr) } => { [$value, $value] }\n}\n`,
    "utf8",
  );
  await writeFile(
    join(directory, "main.sts"),
    `import { twice } from "./macros.sts" for syntax;\nexport const doubled = twice(21);\n`,
    "utf8",
  );
  await writeFile(
    join(directory, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
        },
        sweet: { macroExtensions: [".sts"] },
        files: ["macros.sts", "main.sts"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const cli = release.packages.find(({ name }) => name === "@sweetener/cli");
  if (cli === undefined) problems.push("no @sweetener/cli in the release");
  else {
    const manifest = JSON.parse(
      await readFile(join(modules, cli.name, "package.json"), "utf8"),
    );
    const command = manifest.bin?.sweetener;
    if (command === undefined)
      problems.push("@sweetener/cli publishes no sweetener command");
    else {
      // Through the command the manifest names, which is what a package
      // manager links, rather than through the built file behind it.
      const entry = join(modules, cli.name, command);
      const run = (arguments_) =>
        execFileSync(process.execPath, [entry, ...arguments_], {
          cwd: directory,
          encoding: "utf8",
          stdio: "pipe",
        });
      // Compared without regard to layout: this is checking that the macro
      // ran, not how the printer spaces an array.
      const expanded = (text) =>
        text.replaceAll(/\s+/gu, "").includes("[21,21]");
      try {
        const printed = run(["expand", "main.sts"]);
        if (!expanded(printed))
          problems.push(
            `the packed command printed unexpected expansion: ${JSON.stringify(printed)}`,
          );
        run(["emit", "macros.sts", "main.sts", "--out-dir", ".sweetener"]);
        const emitted = await readFile(
          join(directory, ".sweetener", "main.ts"),
          "utf8",
        );
        if (!expanded(emitted))
          problems.push(
            `the packed command emitted unexpected TypeScript: ${JSON.stringify(emitted)}`,
          );
      } catch (error) {
        const detail =
          error instanceof Error && "stderr" in error
            ? String(error.stderr ?? error.message)
            : String(error);
        problems.push(`the packed command failed to expand a file: ${detail}`);
      }
    }
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`${problem}\n`);
  process.exitCode = 1;
} else
  process.stdout.write(
    "The packed command line installs and expands a project.\n",
  );
