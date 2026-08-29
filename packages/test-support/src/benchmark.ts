import { performance } from "node:perf_hooks";
import { cpus, release, totalmem } from "node:os";

export interface BenchmarkScenario {
  readonly id: string;
  readonly description: string;
  readonly run: () =>
    | void
    | Readonly<Record<string, number>>
    | Promise<void | Readonly<Record<string, number>>>;
}

export interface BenchmarkSample {
  readonly durationMs: number;
  readonly cpuUserMicros: number;
  readonly cpuSystemMicros: number;
  readonly heapBeforeBytes: number;
  readonly heapAfterBytes: number;
  readonly retainedHeapDeltaBytes: number;
  readonly counters: Readonly<Record<string, number>>;
}

export interface BenchmarkStatistics {
  readonly samples: number;
  readonly minMs: number;
  readonly maxMs: number;
  readonly meanMs: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
}

export interface BenchmarkResult {
  readonly id: string;
  readonly description: string;
  readonly warmups: number;
  readonly statistics: BenchmarkStatistics;
  readonly rawSamples: readonly BenchmarkSample[];
}

export interface BenchmarkEnvironment {
  readonly platform: NodeJS.Platform;
  readonly release: string;
  readonly architecture: string;
  readonly cpu: string;
  readonly logicalCpus: number;
  readonly totalMemoryBytes: number;
  readonly node: string;
  readonly typescript: string;
  readonly gcExposed: boolean;
}

export interface BenchmarkReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly commit: string;
  readonly dirty: boolean;
  readonly command: string;
  readonly environment: BenchmarkEnvironment;
  readonly results: readonly BenchmarkResult[];
}

export interface BenchmarkRegression {
  readonly scenario: string;
  readonly metric: "p50Ms" | "p95Ms" | "p99Ms";
  readonly baseline: number;
  readonly candidate: number;
  readonly relativeChange: number;
  readonly allowedRelativeChange: number;
  readonly allowedAbsoluteChangeMs: number;
}

function percentile(values: readonly number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[
    Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
  ]!;
}

export function summarizeDurations(
  values: readonly number[],
): BenchmarkStatistics {
  if (values.length === 0)
    throw new RangeError("Benchmark requires measured samples");
  if (values.some((value) => !Number.isFinite(value) || value < 0))
    throw new RangeError("Benchmark durations must be finite and non-negative");
  return Object.freeze({
    samples: values.length,
    minMs: Math.min(...values),
    maxMs: Math.max(...values),
    meanMs: values.reduce((sum, value) => sum + value, 0) / values.length,
    p50Ms: percentile(values, 0.5),
    p95Ms: percentile(values, 0.95),
    p99Ms: percentile(values, 0.99),
  });
}

export function selectBenchmarkScenarios(
  scenarios: readonly BenchmarkScenario[],
  selected: readonly string[] = [],
): readonly BenchmarkScenario[] {
  const byId = new Map(scenarios.map((scenario) => [scenario.id, scenario]));
  if (byId.size !== scenarios.length)
    throw new RangeError("Duplicate benchmark scenario ID");
  const ids =
    selected.length === 0 ? [...byId.keys()].sort() : [...new Set(selected)];
  return Object.freeze(
    ids.map((id) => {
      const scenario = byId.get(id);
      if (scenario === undefined)
        throw new RangeError(`Unknown benchmark scenario ${id}`);
      return scenario;
    }),
  );
}

export async function runBenchmarkScenario(
  scenario: BenchmarkScenario,
  options: {
    readonly warmups: number;
    readonly samples: number;
    readonly now?: () => number;
    readonly cpuUsage?: (previous?: NodeJS.CpuUsage) => NodeJS.CpuUsage;
    readonly heapUsed?: () => number;
    readonly collectGarbage?: (() => void) | undefined;
  },
): Promise<BenchmarkResult> {
  if (!Number.isSafeInteger(options.warmups) || options.warmups < 0)
    throw new RangeError("Benchmark warmups must be a non-negative integer");
  if (!Number.isSafeInteger(options.samples) || options.samples < 5)
    throw new RangeError("Benchmark reports require at least five samples");
  for (let index = 0; index < options.warmups; index += 1) await scenario.run();
  const now = options.now ?? performance.now.bind(performance);
  const cpuUsage = options.cpuUsage ?? process.cpuUsage.bind(process);
  const heapUsed = options.heapUsed ?? (() => process.memoryUsage().heapUsed);
  const rawSamples: BenchmarkSample[] = [];
  for (let index = 0; index < options.samples; index += 1) {
    options.collectGarbage?.();
    const heapBeforeBytes = heapUsed();
    const cpuBefore = cpuUsage();
    const start = now();
    const counters = (await scenario.run()) ?? {};
    const durationMs = now() - start;
    const cpu = cpuUsage(cpuBefore);
    options.collectGarbage?.();
    const heapAfterBytes = heapUsed();
    rawSamples.push(
      Object.freeze({
        durationMs,
        cpuUserMicros: cpu.user,
        cpuSystemMicros: cpu.system,
        heapBeforeBytes,
        heapAfterBytes,
        retainedHeapDeltaBytes: heapAfterBytes - heapBeforeBytes,
        counters: Object.freeze({ ...counters }),
      }),
    );
  }
  return Object.freeze({
    id: scenario.id,
    description: scenario.description,
    warmups: options.warmups,
    statistics: summarizeDurations(
      rawSamples.map(({ durationMs }) => durationMs),
    ),
    rawSamples: Object.freeze(rawSamples),
  });
}

export function benchmarkEnvironment(
  typescriptVersion: string,
): BenchmarkEnvironment {
  const processors = cpus();
  return Object.freeze({
    platform: process.platform,
    release: release(),
    architecture: process.arch,
    cpu: processors[0]?.model ?? "unknown",
    logicalCpus: processors.length,
    totalMemoryBytes: totalmem(),
    node: process.version,
    typescript: typescriptVersion,
    gcExposed: typeof globalThis.gc === "function",
  });
}

export function compareBenchmarkReports(options: {
  readonly baseline: BenchmarkReport;
  readonly candidate: BenchmarkReport;
  readonly allowedRelativeChange: number;
  readonly allowedAbsoluteChangeMs: number;
}): readonly BenchmarkRegression[] {
  const baseline = new Map(
    options.baseline.results.map((result) => [result.id, result]),
  );
  const regressions: BenchmarkRegression[] = [];
  for (const candidate of options.candidate.results) {
    const previous = baseline.get(candidate.id);
    if (previous === undefined) continue;
    // A percentile the sample count cannot resolve is just the slowest sample:
    // at fifteen samples both p95 and p99 land on the maximum. Reporting each
    // of them turns one slow run into three regressions, so a metric that
    // repeats a coarser one is only counted once.
    const reported = new Set<number>();
    for (const metric of ["p50Ms", "p95Ms", "p99Ms"] as const) {
      const before = previous.statistics[metric];
      const after = candidate.statistics[metric];
      if (reported.has(after)) continue;
      reported.add(after);
      const absolute = after - before;
      const relative =
        before === 0
          ? after === 0
            ? 0
            : Number.POSITIVE_INFINITY
          : absolute / before;
      if (
        absolute > options.allowedAbsoluteChangeMs &&
        relative > options.allowedRelativeChange
      )
        regressions.push(
          Object.freeze({
            scenario: candidate.id,
            metric,
            baseline: before,
            candidate: after,
            relativeChange: relative,
            allowedRelativeChange: options.allowedRelativeChange,
            allowedAbsoluteChangeMs: options.allowedAbsoluteChangeMs,
          }),
        );
    }
  }
  return Object.freeze(regressions);
}
