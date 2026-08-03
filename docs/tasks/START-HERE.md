# Start Implementation Here

## First implementation slice

The first slice creates infrastructure and proves lossless reading. It does not
commit the project to macro surface syntax beyond data types required by later
work.

Complete these tasks in order:

1. `FND-001`: create the workspace and package shells.
2. `FND-002`: add branded IDs, cancellation, and resource budgets.
3. `FND-003`: add structured diagnostics and the code registry.
4. `FND-004`: add the fixture manifest schema and loader.
5. `SYN-001`: implement tokens, trivia, groups, protected syntax, and spans.
6. `SYN-002`: implement the origin DAG and interning.
7. `SYN-003`: implement constant-time cursor checkpoints.
8. `RDR-001`: isolate the TypeScript scanner adapter.
9. `RDR-002`: cover template lexical modes.
10. `RDR-003`: cover TSX lexical modes.
11. `RDR-004`: construct delimiter trees with recovery.
12. `RDR-005`: prove byte-exact read/print behavior.

## Tooling decision

ADR-0001 records:

- package manager;
- supported Node version;
- pinned TypeScript version;
- test runner;
- formatter and linter.

Selected baseline:

```text
package manager: pnpm 11.18.0
Node: 24.18.0 LTS
TypeScript API: @typescript/typescript6 6.0.2
test runner: Vitest 4.1.10
formatter: Prettier
linter: ESLint with type-aware rules kept out of hot edit loops
```

TypeScript 7.0 ships without a programmatic API. ADR-0001 records the TypeScript
6 compatibility API and a review point for the TypeScript 7.1 API.

## First pull request boundary

The first pull request should contain `FND-001` through `FND-004`. It should not
contain reader or macro logic.

Required commands:

```text
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm check:boundaries
```

Required evidence:

- clean checkout succeeds with the documented Node version;
- package cycles and internal imports fail a dedicated fixture;
- malformed fixture manifests produce `SWR7xxx` diagnostics;
- test output remains deterministic across two clean runs.

## Second pull request boundary

The second pull request should contain `SYN-001` through `SYN-003`.

Required evidence:

- syntax objects expose immutable public types;
- origins reject cycles;
- structural hashes remain stable;
- cursor mark/reset tests cover nested and empty groups;
- no syntax package depends on TypeScript compiler types.

## Third pull request boundary

The third pull request should contain `RDR-001` through `RDR-005` for plain
TypeScript before TSX support if the team wants a smaller review. TSX remains a
Phase 1 exit requirement.

Required evidence:

- representative `.ts` files round-trip byte for byte;
- scanner differential tests record token kinds and spans;
- malformed delimiters return diagnostics and partial trees;
- reader benchmarks record source size, tokens, time, and memory.

## Work that can wait

The first slice does not need final macro-definition syntax, scope-set hygiene,
operator precedence extensions, TypeScript project hosting, or editor support.
The reader representation must preserve the data those features require.

## Review checkpoint

After Phase 1, review real syntax-tree dumps for:

- `do-notation.sweet.js`;
- `methods.sweet.js`;
- `ideas.sjs`;
- one generic-heavy TypeScript file;
- one TSX file with templates inside JSX expressions.

Approve the syntax representation before starting `PAT-001`.
