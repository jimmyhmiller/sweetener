import { describe, expect, test } from "vitest";
import {
  compareBenchmarkReports,
  runBenchmarkScenario,
  selectBenchmarkScenarios,
  summarizeDurations,
  type BenchmarkReport,
} from "../src/index.js";

function report(
  id: string,
  p50Ms: number,
  p95Ms: number,
  p99Ms: number,
): BenchmarkReport {
  return {
    schemaVersion: 1,
    generatedAt: "2026-01-01T00:00:00.000Z",
    commit: "abc",
    dirty: false,
    command: "benchmark",
    environment: {
      platform: "linux",
      release: "test",
      architecture: "x64",
      cpu: "test",
      logicalCpus: 1,
      totalMemoryBytes: 1,
      node: "v24",
      typescript: "6.0.2",
      gcExposed: false,
    },
    results: [
      {
        id,
        description: id,
        warmups: 1,
        statistics: {
          samples: 5,
          minMs: p50Ms,
          maxMs: p99Ms,
          meanMs: p50Ms,
          p50Ms,
          p95Ms,
          p99Ms,
        },
        rawSamples: [],
      },
    ],
  };
}

describe("benchmark runner", () => {
  test("selects scenarios deterministically and validates IDs", () => {
    const scenarios = [
      { id: "b", description: "b", run: () => undefined },
      { id: "a", description: "a", run: () => undefined },
    ];
    expect(selectBenchmarkScenarios(scenarios).map(({ id }) => id)).toEqual([
      "a",
      "b",
    ]);
    expect(
      selectBenchmarkScenarios(scenarios, ["b"]).map(({ id }) => id),
    ).toEqual(["b"]);
    expect(() => selectBenchmarkScenarios(scenarios, ["missing"])).toThrow(
      /Unknown benchmark scenario/u,
    );
  });

  test("records warmups, raw CPU/heap samples, counters, and percentiles", async () => {
    let executions = 0;
    let time = 0;
    let heapCalls = 0;
    const result = await runBenchmarkScenario(
      {
        id: "reader",
        description: "reader",
        run: () => {
          executions += 1;
          return { tokens: 10 };
        },
      },
      {
        warmups: 2,
        samples: 5,
        now: () => time++,
        cpuUsage: (previous) =>
          previous === undefined
            ? { user: 10, system: 20 }
            : { user: 3, system: 4 },
        heapUsed: () => (heapCalls++ % 2 === 0 ? 100 : 110),
      },
    );
    expect(executions).toBe(7);
    expect(result.statistics).toMatchObject({
      samples: 5,
      p50Ms: 1,
      p95Ms: 1,
      p99Ms: 1,
    });
    expect(result.rawSamples[0]).toMatchObject({
      cpuUserMicros: 3,
      cpuSystemMicros: 4,
      retainedHeapDeltaBytes: 10,
      counters: { tokens: 10 },
    });
    await expect(
      runBenchmarkScenario(
        { id: "bad", description: "bad", run: () => undefined },
        { warmups: 0, samples: 4 },
      ),
    ).rejects.toThrow(/at least five/u);
  });

  test("summarizes distributions and applies relative plus absolute budgets", () => {
    expect(summarizeDurations([5, 1, 4, 2, 3])).toMatchObject({
      minMs: 1,
      maxMs: 5,
      p50Ms: 3,
      p95Ms: 5,
      p99Ms: 5,
    });
    expect(
      compareBenchmarkReports({
        baseline: report("reader", 10, 12, 14),
        candidate: report("reader", 13, 14, 18),
        allowedRelativeChange: 0.2,
        allowedAbsoluteChangeMs: 2,
      }).map(({ metric }) => metric),
    ).toEqual(["p50Ms", "p99Ms"]);
  });
});

test("counts a percentile that repeats a coarser one only once", () => {
  // Fifteen samples put both p95 and p99 on the slowest run, so a single slow
  // sample must not be reported as two separate regressions.
  const statistics = (p50: number, tail: number) => ({
    samples: 15,
    minMs: p50,
    maxMs: tail,
    meanMs: p50,
    p50Ms: p50,
    p95Ms: tail,
    p99Ms: tail,
  });
  const report = (p50: number, tail: number) => ({
    schemaVersion: 1 as const,
    generatedAt: "2026-08-29T00:00:00.000Z",
    commit: "abcdef0",
    dirty: false,
    command: "benchmark",
    environment: {
      platform: "darwin" as const,
      release: "25.5.0",
      architecture: "arm64",
      cpu: "Apple M2 Max",
      logicalCpus: 12,
      totalMemoryBytes: 1,
      node: "v26.5.0",
      typescript: "6.0.3",
      gcExposed: true,
    },
    results: [
      {
        id: "scenario",
        description: "one scenario",
        warmups: 2,
        statistics: statistics(p50, tail),
        rawSamples: [],
      },
    ],
  });
  const regressions = compareBenchmarkReports({
    baseline: report(10, 10),
    candidate: report(10, 40),
    allowedRelativeChange: 0.15,
    allowedAbsoluteChangeMs: 2,
  });
  expect(regressions).toHaveLength(1);
  expect(regressions[0]?.metric).toBe("p95Ms");
});
