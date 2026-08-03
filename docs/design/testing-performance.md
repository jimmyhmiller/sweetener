# Testing and Performance Plan

## Test layers

### Reader conformance

Run the reader against TypeScript's valid parser corpus and representative
DefinitelyTyped packages. Assert token kind, raw span, trivia, delimiter tree,
and lossless reconstruction. Cover `.ts`, `.tsx`, `.mts`, `.cts`, `.d.ts`, and
Unicode identifiers.

Targeted lexical cases include regex versus division, template substitutions,
JSX text/tags/expressions, generic angle brackets, shift operators, comments,
automatic semicolon insertion boundaries, decorators, and unterminated input.

### Matcher unit tests

Use table and property tests for literals, typed variables, alternatives,
checkpoints, optional patterns, separators, greedy extent, nested repetition,
template cardinality, and failure ranking. Assert captures, cursor positions, and
printed output.

### Hygiene tests

For every binding form, test definition-site references, call-site captures,
shadowing, nested macros, local macros, generated bindings, recursive expansion,
macro-generating macros, imports, labels, type parameters, namespaces, properties,
and JSX identifiers.

Each test should inspect binding identities before printing and then compile the
printed program. Include negative tests for deliberate capture APIs.

### Expansion golden tests

Each fixture contains:

```text
input.sts
expected.ts
expected.trace.json
expected.diagnostics.json (optional)
runtime.test.ts (optional)
types.test.ts (optional)
```

Normalize only platform paths and line endings. Review output changes as compiler
changes, not generic snapshot updates.

### TypeScript differential tests

For a macro-free file, expansion must preserve TypeScript behavior. Compile the
original and round-tripped source with the same options and compare diagnostics,
declaration output, and runtime behavior. Printed formatting may differ.

For macro files, compile expected hand-written TypeScript and generated
TypeScript, then compare diagnostics, `.d.ts`, and execution.

### Property and fuzz tests

- Generate balanced token trees and assert read/print/read stability.
- Generate pattern/capture shapes and assert template repetition invariants.
- Alpha-rename user bindings and assert expansion remains alpha-equivalent.
- Insert irrelevant whitespace/comments and assert semantic equivalence.
- Mutate one subtree and assert incremental output matches a clean rebuild.
- Feed malformed input and assert bounded time, bounded memory, and stable errors.

Use TypeScript parser fuzz cases as seeds. Store minimized regressions.

### Project and module tests

Cover project references, path aliases, package exports, NodeNext, macro-only
imports, runtime-plus-macro packages, declaration emit, watch invalidation,
symlinks, case sensitivity, and macro dependency cycles.

### Mapping and tooling tests

Assert original-to-generated and generated-to-original mapping at token
boundaries. Test TypeScript errors inside captures, introduced templates, and
multi-origin output. Compose maps through JavaScript and declaration emit.

Language-service contract tests should cover diagnostics, hover,
go-to-definition, references, rename, completion, formatting, and generated-only
regions. Mark unsupported operations as explicit expected failures.

## Performance benchmarks

### Workloads

1. Macro-free TypeScript corpus: measures reader/host overhead.
2. Dense synthetic macro file: measures matcher and expansion throughput.
3. Real playground corpus: measures representative expressiveness.
4. Large application: measures project graph, TypeScript handoff, and caching.
5. Adversarial matcher cases: measures backtracking controls and limits.

### Scenarios

- cold clean build;
- warm build with no changes;
- single leaf-file edit;
- macro-definition edit with 1, 10, 100, and 1,000 dependents;
- whitespace-only edit;
- language-service keystroke update;
- source-map and trace enabled/disabled.

### Metrics

- wall-clock p50, p95, and p99;
- CPU time by reader, matcher, expander, printer, mapping, and TypeScript;
- peak and retained heap;
- tokens read, matched, copied, and emitted per second;
- syntax-tree reuse percentage;
- cache hit rate and invalidated file count;
- TypeScript overhead ratio versus the same expanded `.ts` project;
- diagnostic and editor-update latency.

### Initial budgets

These budgets are hypotheses to test during the prototype:

- Macro-free clean build adds at most 20% wall time before TypeScript checking.
- Warm no-change build adds less than 100 ms for a medium project.
- A leaf edit re-expands one file plus compile-time dependents only.
- Reader throughput exceeds 25 MB/s on the project benchmark machine.
- Dense declarative expansion exceeds 250,000 input tokens/s.
- Default expansion limits stop adversarial cases within one second per file.

Record hardware, Node version, TypeScript version, corpus commit, command, and
five or more samples. Do not publish a single best run.

## Continuous integration

Required lanes:

- unit and golden tests on supported Node platforms;
- oldest and newest supported TypeScript versions;
- TS and TSX conformance shards;
- fuzz smoke tests with fixed seeds;
- clean/incremental equivalence;
- benchmark regression check on a pinned runner;
- package API and generated declaration checks.

Run long fuzzing, memory profiles, and the full TypeScript corpus on a schedule.

## Definition of correctness

For accepted input, the expander terminates within configured limits and produces
valid TypeScript whose binding behavior matches the hygienic specification. A
clean build and any sequence of incremental builds produce equivalent output,
diagnostics, declarations, and runtime behavior.
