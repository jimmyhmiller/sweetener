#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  benchmarkEnvironment,
  compareBenchmarkReports,
  runBenchmarkScenario,
  selectBenchmarkScenarios,
} from "../packages/test-support/dist/src/index.js";
import { defineBenchmarkScenarios } from "../benchmarks/scenarios.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function parseArguments(arguments_) {
  const options = {
    scenarios: [],
    warmups: 1,
    samples: 7,
    output: resolve(repositoryRoot, "artifacts/benchmarks/suite.json"),
    baseline: undefined,
    relative: 0.15,
    absoluteMs: 2,
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    const value = arguments_[++index];
    if (value === undefined)
      throw new TypeError(`${argument} requires a value`);
    if (argument === "--scenario") options.scenarios.push(value);
    else if (argument === "--warmups") options.warmups = Number(value);
    else if (argument === "--samples") options.samples = Number(value);
    else if (argument === "--output") options.output = resolve(value);
    else if (argument === "--baseline") options.baseline = resolve(value);
    else if (argument === "--relative") options.relative = Number(value);
    else if (argument === "--absolute-ms") options.absoluteMs = Number(value);
    else throw new TypeError(`Unknown benchmark argument ${argument}`);
  }
  if (!Number.isSafeInteger(options.warmups) || options.warmups < 0)
    throw new RangeError("warmups must be a non-negative integer");
  if (!Number.isSafeInteger(options.samples) || options.samples < 5)
    throw new RangeError("samples must be an integer of at least five");
  if (!Number.isFinite(options.relative) || options.relative < 0)
    throw new RangeError("relative regression budget must be non-negative");
  if (!Number.isFinite(options.absoluteMs) || options.absoluteMs < 0)
    throw new RangeError("absolute regression budget must be non-negative");
  return options;
}

const options = parseArguments(process.argv.slice(2));
const scenarios = selectBenchmarkScenarios(
  await defineBenchmarkScenarios(repositoryRoot),
  options.scenarios,
);
const results = [];
for (const scenario of scenarios) {
  const result = await runBenchmarkScenario(scenario, {
    warmups: options.warmups,
    samples: options.samples,
    collectGarbage: globalThis.gc,
  });
  results.push(result);
  process.stdout.write(
    `${result.id}: p50 ${result.statistics.p50Ms.toFixed(2)} ms, p95 ${result.statistics.p95Ms.toFixed(2)} ms\n`,
  );
}
const git = (arguments_) =>
  execFileSync("git", arguments_, {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
const report = Object.freeze({
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commit: git(["rev-parse", "--short", "HEAD"]),
  dirty: git(["status", "--porcelain"]).length > 0,
  command: process.argv.join(" "),
  environment: benchmarkEnvironment(ts.version),
  results: Object.freeze(results),
});
await mkdir(dirname(options.output), { recursive: true });
await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
if (options.baseline !== undefined) {
  const baseline = JSON.parse(await readFile(options.baseline, "utf8"));
  const regressions = compareBenchmarkReports({
    baseline,
    candidate: report,
    allowedRelativeChange: options.relative,
    allowedAbsoluteChangeMs: options.absoluteMs,
  });
  if (regressions.length > 0) {
    process.stderr.write(`${JSON.stringify(regressions, null, 2)}\n`);
    process.exitCode = 1;
  }
}
process.stdout.write(`Wrote ${options.output}\n`);
