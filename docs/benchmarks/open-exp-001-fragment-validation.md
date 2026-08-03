# OPEN-EXP-001: Type and TSX fragment validation

Status: Prototype complete; provisional strategy selected

Date: 2026-08-02

## Question

Should protected type and TSX-adjacent fragments be validated immediately by
placing each fragment in a synthetic wrapper, or should the compiler validate
the assembled expanded file once?

## Prototype

The type corpus contains conditional, generic, function, query, tuple, mapped,
indexed, intersection, and union types. The class corpus contains fields,
methods, accessors, constructors, static blocks, decorators, index signatures,
and private names.

Both strategies use the repository's pinned
`@typescript/typescript6@6.0.2` package. Its ESM compiler reports version 6.0.3;
the package and lockfile remain pinned to 6.0.2.

Two local runs compared:

| Run                     |                       Work | Wrapper parsing | Full-file parsing | Ratio |
| ----------------------- | -------------------------: | --------------: | ----------------: | ----: |
| mixed type/class corpus | 2,000 rounds, 15 fragments |       128.46 ms |          63.21 ms | 2.03× |
| type corpus with GC     | 10,000 rounds, 8 fragments |       222.72 ms |         175.19 ms | 1.27× |

After forced collection, the second run retained 1,267,752 bytes for wrapper
parsing and 1,269,616 bytes for full-file parsing. The nearly identical retained
heap is compiler initialization/cache state; it does not justify per-fragment
parsing. Both valid corpora produced zero parse diagnostics.

## Diagnostic behavior

Wrappers give a short local coordinate space but require remapping the synthetic
prefix and cannot see neighboring declarations, JSX mode, imports, ambient
context, or interactions introduced during expansion. Full-file parsing reports
real file coordinates and validates the actual context, but it runs later and a
consumer extent bug may initially point at a downstream token.

## Provisional decision

Use one full-file TypeScript parse as the correctness gate for expanded files.
Keep wrapper parsing as a test oracle and an optional diagnostic-recovery probe
after the full-file parse reports an error inside a protected fragment. Do not
run a wrapper parser on every successful type or class-element consumption.

Revisit this choice during TypeScript-host integration after TSX fixtures can
measure diagnostic remapping and incremental reuse with real expanded files.
