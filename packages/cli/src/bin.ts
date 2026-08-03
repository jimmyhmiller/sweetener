#!/usr/bin/env node
import { runCli } from "./command-line.js";

const result = runCli({
  argv: process.argv.slice(2),
  io: {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text),
  },
});

process.exitCode = result.exitCode;
