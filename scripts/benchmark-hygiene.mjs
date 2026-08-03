#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { defineScopeStoreBenchmarks } from "../benchmarks/scope-store.mjs";
import { ScopeStore } from "../packages/hygiene/dist/src/index.js";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = join(
  repositoryRoot,
  "artifacts/benchmarks/scope-store.json",
);
const warmups = 2;
const sampleCount = 7;

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  ];
}

function run(workload) {
  const store = new ScopeStore();
  workload.execute(store, workload.operations);
  return store.stats;
}

function measure(workload) {
  for (let index = 0; index < warmups; index += 1) run(workload);
  const durationsMs = [];
  const retainedHeapDeltaBytes = [];
  let facts;
  for (let index = 0; index < sampleCount; index += 1) {
    globalThis.gc?.();
    const before = process.memoryUsage().heapUsed;
    const start = performance.now();
    facts = run(workload);
    durationsMs.push(performance.now() - start);
    globalThis.gc?.();
    retainedHeapDeltaBytes.push(process.memoryUsage().heapUsed - before);
  }
  const medianMs = percentile(durationsMs, 0.5);
  return {
    id: workload.id,
    description: workload.description,
    operationsPerSample: workload.operations,
    warmups,
    sampleCount,
    durationsMs,
    medianMs,
    p95Ms: percentile(durationsMs, 0.95),
    operationsPerSecond: workload.operations / (medianMs / 1000),
    retainedHeapDeltaBytes,
    storeStats: facts,
  };
}

const results = defineScopeStoreBenchmarks().map(measure);
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commit: execFileSync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim(),
  dirty:
    execFileSync("git", ["status", "--porcelain"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    }).trim().length > 0,
  command: "pnpm benchmark:hygiene",
  environment: {
    platform: process.platform,
    release: os.release(),
    architecture: process.arch,
    cpu: os.cpus()[0]?.model ?? "unknown",
    node: process.version,
  },
  results,
};
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
for (const result of results) {
  process.stdout.write(
    `${result.id}: ${Math.round(result.operationsPerSecond)} ops/s, median ${result.medianMs.toFixed(2)} ms\n`,
  );
}
process.stdout.write(`Wrote ${outputPath}\n`);
