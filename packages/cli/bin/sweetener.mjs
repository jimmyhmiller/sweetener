#!/usr/bin/env node
// The `sweetener` command, kept in the repository rather than generated.
//
// A package manager creates the link for a command while it installs, and in
// this workspace nothing is built at that point, so a link pointing straight
// into `dist/` could not be created and every example that runs `sweetener`
// was left with no such command. This file always exists, so the link always
// can be, and running it before a build says so plainly.
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const entry = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "dist",
  "src",
  "bin.js",
);

if (!existsSync(entry)) {
  process.stderr.write(
    `@sweetener/cli has not been built: ${entry} does not exist.\n` +
      `Run \`pnpm build\` in the repository root, then try again.\n`,
  );
  process.exit(1);
}

await import(pathToFileURL(entry).href);
