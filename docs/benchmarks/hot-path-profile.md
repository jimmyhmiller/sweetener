# Hot-path profile

Date: 2026-08-03

This record accompanies `PRF-002`. Raw reports live under
`artifacts/benchmarks/`; timings are local development evidence and are not
release claims.

## Initial measurements

| Scenario                                              |       p50 |       p95 | Observation                                                   |
| ----------------------------------------------------- | --------: | --------: | ------------------------------------------------------------- |
| matcher/dense-choice                                  |  52.58 ms |  58.80 ms | 1,000 matches across 32 late-matching alternatives            |
| cache/content-addressed-invalidation                  |  28.70 ms |  30.94 ms | 10,000 hashes, commits, hits, then one 100-entry invalidation |
| host/language-service-edit                            |   4.22 ms |   6.04 ms | virtual snapshot update plus semantic query                   |
| mapping/bidirectional-origin-queries before           | 306.76 ms | 314.18 ms | index construction plus 20,000 bidirectional queries          |
| mapping/bidirectional-origin-queries after            |  23.09 ms |  26.68 ms | identical workload; 92.5% p50 reduction                       |
| expansion/threading-end-to-end                        |   7.05 ms |   7.33 ms | compile declarative macro and expand 100 calls                |
| printer/generated-origin-map                          |   6.40 ms |   8.30 ms | print and map 10,000 copied-origin tokens                     |
| hygiene/persistent-add-chain after cached append keys |  55.98 ms |  58.16 ms | 5,000 persistent additions                                    |

Each result uses one warmup and five measured samples. The hot-path report was
collected with Node 26.5.0; the release baseline remains Node 24.

## Origin-query index change

Reverse source mapping previously scanned every region belonging to a source
for every queried offset. A dense source with `n` disjoint mapped regions and
`n` reverse queries therefore performed Θ(n²) containment checks.

The origin index now sorts intervals per source and stores the maximum interval
end through every index position. Lookup binary-searches the last possible
start and walks backward only while an earlier interval can still contain the
offset. Disjoint dense maps become O(log n + k) per query, while overlapping,
repeated, composed, and zero-width origins still return all `k` matches in
generated order. Construction deduplicates regions with identity sets instead
of scanning each growing per-source list; that scan was the remaining
profile-dominant quadratic operation.

Focused conformance covers sparse, overlapping, repeated, and zero-width
intervals. The ten-thousand-region scenario completes five samples and validates
all twenty thousand expected hits per sample. Its p50 fell from 306.76 ms to
23.09 ms on the identical Node 26 workload.

## Scope-set append fast path

The pre-change CPU profile attributes most persistent-chain samples to
`scopeSetKey` and `ScopeStore.add`. Monotonically allocated scopes are normally
appended to sorted scope sets, but every append rebuilt and serialized the
complete key. The store now retains each interned key and derives an append key
from the prior key. General insertion, removal, union, canonical ordering, and
interning retain their existing paths and fixed-seed model tests.

The 5,000-add p50 fell from 834.93 ms on the Node 24 baseline to 55.98 ms in the
profiled Node 26 run. Cross-runtime timing is not a release comparison, but the
profile attribution and order-of-magnitude change justify retaining the fast
path. The representation remains immutable sorted arrays; no representation ADR
is required.

## Remaining profile coverage

Before `PRF-002` closes, refresh the complete Node 24 baseline with all new
scenarios and verify the full semantic gate. CPU profiles remain under
`artifacts/profiles/` for mapping, expansion, and scope-chain workloads.
