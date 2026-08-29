#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
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
    // Recording a baseline and checking against one must agree, or the
    // comparison measures the sampling difference. Both go through these
    // defaults rather than passing their own flags. Fifteen samples keeps the
    // median steady across runs on an otherwise busy machine.
    warmups: 2,
    samples: 15,
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
    else if (argument === "--baseline")
      options.baseline = value === "auto" ? "auto" : resolve(value);
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

function majorVersion(version) {
  const major = /^v?(\d+)\./u.exec(String(version ?? ""))?.[1];
  return major === undefined ? undefined : Number(major);
}

/** The baseline recorded on the running Node major, so `--baseline auto`
 * compares like with like on whichever runtime is in use. */
function baselineForRuntime(version) {
  const major = majorVersion(version);
  if (major === undefined)
    throw new Error(`Cannot read a Node major version from ${String(version)}`);
  return resolve(repositoryRoot, `benchmarks/baselines/node${major}.json`);
}

const options = parseArguments(process.argv.slice(2));
const scenarios = selectBenchmarkScenarios(
  await defineBenchmarkScenarios(repositoryRoot),
  options.scenarios,
);
const startingEnvironment = benchmarkEnvironment(ts.version);
if (startingEnvironment.loadAverage > startingEnvironment.logicalCpus / 2)
  process.stderr.write(
    `Warning: load average is ${startingEnvironment.loadAverage.toFixed(2)} on ` +
      `${String(startingEnvironment.logicalCpus)} logical CPUs. Timings taken now vary ` +
      `far more between runs than most real regressions do, so treat both baselines ` +
      `and comparisons from this run as provisional.\n`,
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
  const baselinePath =
    options.baseline === "auto"
      ? baselineForRuntime(report.environment.node)
      : options.baseline;
  if (!existsSync(baselinePath))
    throw new Error(
      `No benchmark baseline at ${baselinePath}. Record one with ` +
        `--output ${baselinePath}, or pass --baseline with an existing file.`,
    );
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  // Timings move enough between Node majors to swamp any change in this
  // repository: the same commit is 43% slower reading TypeScript on Node 26
  // than on Node 24, and 58% faster building hygiene scope chains. Comparing
  // across them reports invented regressions and hides real ones, so refuse.
  const baselineMajor = majorVersion(baseline.environment?.node);
  const candidateMajor = majorVersion(report.environment.node);
  if (baselineMajor !== candidateMajor)
    throw new Error(
      `Baseline ${baselinePath} was recorded on Node ${baseline.environment?.node ?? "unknown"}, ` +
        `but these samples ran on Node ${report.environment.node}. ` +
        `Run under Node ${baselineMajor ?? "?"}, or record a baseline for Node ${candidateMajor ?? "?"} ` +
        `at benchmarks/baselines/node${candidateMajor ?? "?"}.json.`,
    );
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
