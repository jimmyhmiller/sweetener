#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import inspector from "node:inspector";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import {
  createReader,
  printLossless,
} from "../packages/reader/dist/src/index.js";
import { defineReaderBenchmarks } from "../benchmarks/reader.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const outputPath = join(
  repositoryRoot,
  "artifacts",
  "benchmarks",
  "reader.json",
);
const warmups = 3;
const sampleCount = 7;

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  ];
}

function countTokens(root) {
  let count = 0;
  const pending = [root];
  while (pending.length > 0) {
    const syntax = pending.pop();
    if (!syntax) continue;
    if (syntax.tag === "token") {
      count += 1;
    } else if (syntax.tag === "group") {
      if (syntax.close.tag === "token") count += 1;
      for (const child of syntax.children) pending.push(child);
      count += 1;
    } else {
      for (const child of syntax.children) pending.push(child);
    }
  }
  return count;
}

function execute(workload, validate = false) {
  const reader = createReader();
  let bytes = 0;
  let tokens = 0;
  let diagnostics = 0;
  let peakHeapBytes = process.memoryUsage().heapUsed;
  let typescriptVersion;
  let sourceNumber = 1;
  for (let repetition = 0; repetition < workload.repetitions; repetition += 1) {
    for (const file of workload.files) {
      const result = reader.read(
        {
          sourceId: sourceNumber,
          fileName: file.name,
          text: file.source,
          version: String(repetition),
        },
        { scopes: 0, variant: file.variant },
      );
      sourceNumber += 1;
      bytes += Buffer.byteLength(file.source);
      if (validate) {
        if (printLossless(result.root) !== file.source) {
          throw new Error(`Lossless reader mismatch: ${file.name}`);
        }
        tokens += countTokens(result.root);
      }
      diagnostics += result.diagnostics.length;
      typescriptVersion ??= result.typescriptVersion;
      peakHeapBytes = Math.max(peakHeapBytes, process.memoryUsage().heapUsed);
    }
  }
  return { bytes, tokens, diagnostics, peakHeapBytes, typescriptVersion };
}

function post(session, method, parameters = {}) {
  return new Promise((resolve_, reject) => {
    session.post(method, parameters, (error, result) => {
      if (error) reject(error);
      else resolve_(result);
    });
  });
}

function sampledBytes(node) {
  return (
    node.selfSize +
    node.children.reduce((sum, child) => sum + sampledBytes(child), 0)
  );
}

async function profileAllocations(workload) {
  const session = new inspector.Session();
  session.connect();
  try {
    await post(session, "HeapProfiler.startSampling", {
      samplingInterval: 32768,
    });
    execute(workload);
    const { profile } = await post(session, "HeapProfiler.stopSampling");
    return sampledBytes(profile.head);
  } finally {
    session.disconnect();
  }
}

async function measure(workload) {
  const facts = execute(workload, true);
  for (let index = 0; index < warmups; index += 1) execute(workload);
  const durationsMs = [];
  const retainedHeapDeltaBytes = [];
  let peakHeapBytes = facts.peakHeapBytes;
  for (let index = 0; index < sampleCount; index += 1) {
    globalThis.gc?.();
    const heapBefore = process.memoryUsage().heapUsed;
    const start = performance.now();
    const timed = execute(workload);
    durationsMs.push(performance.now() - start);
    peakHeapBytes = Math.max(peakHeapBytes, timed.peakHeapBytes);
    globalThis.gc?.();
    retainedHeapDeltaBytes.push(process.memoryUsage().heapUsed - heapBefore);
  }
  const medianMs = percentile(durationsMs, 0.5);
  return {
    id: workload.id,
    description: workload.description,
    uniqueFiles: workload.files.length,
    repetitions: workload.repetitions,
    sourceBytesPerSample: facts.bytes,
    tokensPerSample: facts.tokens,
    diagnosticsPerSample: facts.diagnostics,
    warmups,
    sampleCount,
    durationsMs,
    medianMs,
    p95Ms: percentile(durationsMs, 0.95),
    minMs: Math.min(...durationsMs),
    maxMs: Math.max(...durationsMs),
    throughputMiBPerSecond: facts.bytes / 1_048_576 / (medianMs / 1000),
    tokensPerSecond: facts.tokens / (medianMs / 1000),
    peakHeapBytes,
    retainedHeapDeltaBytes,
    sampledAllocationBytes: await profileAllocations(workload),
    allocationSamplingIntervalBytes: 32768,
    validationIncludedInTiming: false,
    typescriptVersion: facts.typescriptVersion,
  };
}

const workloads = await defineReaderBenchmarks(repositoryRoot);
const results = [];
for (const workload of workloads) results.push(await measure(workload));
const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).trim();
const dirty =
  execFileSync("git", ["status", "--porcelain"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim().length > 0;
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  commit,
  dirty,
  command: "pnpm benchmark:reader",
  environment: {
    platform: process.platform,
    release: os.release(),
    architecture: process.arch,
    cpu: os.cpus()[0]?.model ?? "unknown",
    logicalCpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    node: process.version,
    gcExposed: typeof globalThis.gc === "function",
  },
  initialThroughputBudgetMiBPerSecond: 25,
  results,
};
for (const result of report.results) {
  result.meetsInitialThroughputBudget =
    result.throughputMiBPerSecond >= report.initialThroughputBudgetMiBPerSecond;
}
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
for (const result of results) {
  process.stdout.write(
    `${result.id}: ${result.throughputMiBPerSecond.toFixed(2)} MiB/s, ${Math.round(result.tokensPerSecond)} tokens/s, median ${result.medianMs.toFixed(2)} ms\n`,
  );
}
process.stdout.write(`Wrote ${outputPath}\n`);
