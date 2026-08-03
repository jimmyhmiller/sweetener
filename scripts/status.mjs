#!/usr/bin/env node

import { runStatus } from "./status-lib.mjs";

runStatus().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
