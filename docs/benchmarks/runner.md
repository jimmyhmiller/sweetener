# Unified benchmark protocol

Run the production suite with:

```sh
pnpm benchmark
```

The command builds the workspace and writes
`artifacts/benchmarks/suite.json`. Its versioned report records the commit and
dirty state, exact command, OS, CPU, memory, Node and TypeScript versions,
garbage-collector availability, warmups, and every raw measured sample. Each
sample includes wall time, user and system CPU, heap before and after, retained
heap delta, and workload counters. Summaries report mean, p50, p95, p99, and
range.

Scenarios are registered in `benchmarks/scenarios.mjs`. Select one or more for a
focused investigation:

```sh
pnpm benchmark -- --scenario reader/tsx-lexical-modes --samples 9
pnpm benchmark -- --scenario hygiene/persistent-add-chain --warmups 3
```

The runner rejects unknown scenario IDs, duplicate registered IDs, invalid
counts, and fewer than five measured samples. Warmups never appear in measured
statistics.

## Regression check

`benchmarks/baselines/node24.json` is the checked-in Node 24 development-machine
baseline. Run the non-mutating comparison with:

```sh
pnpm benchmark:check
```

The default regression budget requires both a change greater than 15 percent
and an absolute increase greater than 2 ms. It checks p50, p95, and p99 and
exits nonzero with structured regression details. `--relative` and
`--absolute-ms` exist for explicitly documented experiments; comparison never
rewrites the baseline.

This machine baseline proves the protocol and supplies an optimization
reference. Release automation must accept a fresh baseline on pinned hardware
before publishing performance claims.
