#!/usr/bin/env node

import {
  assertSupportedToolchain,
  compatibilityDiagnostics,
} from "../packages/typescript-host/dist/src/index.js";
import ts from "typescript";

const versions = { node: process.version, typescript: ts.version };
const diagnostics = compatibilityDiagnostics(versions);
for (const diagnostic of diagnostics)
  process.stderr.write(`${diagnostic.code}: ${diagnostic.message}\n`);
if (diagnostics.length > 0) process.exitCode = 1;
else {
  assertSupportedToolchain(versions);
  process.stdout.write(
    `Supported toolchain: Node ${process.version}, TypeScript ${ts.version}\n`,
  );
}
