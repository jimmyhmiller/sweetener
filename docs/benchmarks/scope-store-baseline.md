# Scope Store Allocation Baseline

Date: 2026-08-02  
Machine: Apple M2 Max, arm64, macOS 25.5.0  
Runtime: Node 26.5.0  
Command: `pnpm benchmark:hygiene`

The benchmark runs two warmups and seven measured samples. Timings exclude
validation and explicit garbage collection.

| Workload             | Operations |    Median |       Throughput |
| -------------------- | ---------: | --------: | ---------------: |
| fresh scopes         |    100,000 |   8.15 ms | 12,271,193 ops/s |
| singleton interning  |     40,000 |  12.42 ms |  3,220,342 ops/s |
| persistent add chain |      5,000 | 599.63 ms |      8,338 ops/s |

Fresh allocation and singleton reuse provide the baseline for invocation and
lexical scopes. The add-chain case copies a sorted array for each persistent
set and exposes its linear update cost. Typical identifiers carry small scope
sets; Phase 7 profiling must revisit a chunked bitset or trie if real projects
build large sets or spend material time in set copying.

The raw report lives at `artifacts/benchmarks/scope-store.json` and records all
samples, retained-heap deltas, store counts, the commit, and host details.
