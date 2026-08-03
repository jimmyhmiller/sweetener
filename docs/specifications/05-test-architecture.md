# Test Architecture Specification

## 1. Test layers

```text
unit              one package and one semantic rule
conformance       public macro-language behavior
acceptance        playground-derived transformations
differential      comparison with official TypeScript
project           module graph, emit, watch, caching
mapping           origins, diagnostics, source maps
property          generated inputs and semantic invariants
fuzz              malformed and adversarial input
benchmark         time, allocation, memory, invalidation
```

Tests MUST assert the lowest-level stable representation relevant to the rule.
A hygiene test asserts binding IDs. A matcher test asserts captures and rest
cursor. A printer test asserts text and origins.

## 2. Fixture layout

```text
fixtures/conformance/<feature>/<case>/
  case.json
  macros.sts
  input.sts
  expected.ts
  expected.bindings.json
  expected.trace.json
  expected.diagnostics.json
  expected.runtime.json
  types.ts
```

Files absent from a case do not participate. `case.json` controls behavior:

```json
{
  "$schema": "../../../../schemas/case.schema.json",
  "id": "patterns/repetition/nested-zip",
  "languageVersion": "0.1",
  "typescriptVersion": "pinned",
  "compilerOptions": { "strict": true },
  "capabilities": ["PAT-REP-NESTED", "TPL-REP-ZIP"],
  "entry": "input.sts",
  "expect": {
    "expansion": true,
    "bindings": true,
    "trace": true,
    "types": true,
    "runtime": false
  },
  "limits": {}
}
```

The fixture loader validates the manifest before running the compiler.

## 3. Golden update policy

The test command does not update goldens. A separate review command writes
candidate files under `artifacts/golden-candidates/`. A maintainer compares and
moves each candidate through an explicit command.

Create a candidate from compiler output:

```sh
pnpm golden:candidate -- \
  --case fixtures/conformance/patterns/repetition/nested-zip \
  --artifact expected.ts \
  --actual artifacts/actual/nested-zip.ts
```

After comparing the files, accept that candidate with an approval string that
names the fixture and artifact:

```sh
pnpm golden:accept -- \
  --case fixtures/conformance/patterns/repetition/nested-zip \
  --artifact expected.ts \
  --approve patterns/repetition/nested-zip/expected.ts
```

Normalize path roots, platform line endings, timing fields, and session-local
IDs. Preserve diagnostic codes, origins, binding relationships, rule IDs, and
capture shapes.

## 4. Unit-test matrices

### Reader

- token kind and raw spelling;
- trivia attachment;
- delimiter nesting;
- templates and JSX modes;
- regex/division ambiguity;
- Unicode and escapes;
- malformed input recovery;
- full-read/update equivalence.

### Pattern compiler

- capture shape inference;
- alternatives and unreachable rules;
- optional fields;
- repetition dimensions;
- zero-width rejection;
- binding-clause path validation;
- template depth and cardinality validation;
- deterministic IR serialization.

### Matcher

- cursor restoration after failure;
- source-order rule selection;
- nested group matching;
- syntax-class calls;
- separated repetition;
- failure ranking;
- environment-sensitive memoization;
- budget exhaustion.

### Hygiene

- scope-set interning operations;
- subset and maximal-candidate resolution;
- ambiguous resolution;
- introduction and call-site scopes;
- binding clauses across repetitions;
- value/type space separation;
- generated definitions;
- explicit capture operations;
- deterministic printing.

### Expansion

- category lookup;
- phase separation;
- recursive progress;
- local definition visibility;
- core shadowing;
- prefix and infix precedence;
- generated macro registration;
- cancellation and output limits.

## 5. Playground traceability

| Fixture family     | Required assertions                                                                                         |
| ------------------ | ----------------------------------------------------------------------------------------------------------- |
| threading          | recursive rule sequence, expression grouping, runtime result                                                |
| do notation        | syntax-class fields, sequential bindings, inferred result type, rejected malformed bind                     |
| implicit return    | statement/final-expression boundary, core shadowing, function return type                                   |
| ADT                | nested repetition, constructor bindings, match branch bindings, exhaustive-failure behavior chosen by macro |
| protocols          | method class fields, correlated repetition, implementation parameters                                       |
| multi-part methods | mixfix extent, generated macro visibility, flattened argument order                                         |
| CSP                | punctuation operators, `yield` placement, binding introduction                                              |
| ideas/operators    | prefix/infix overloading, precedence, lexical shadowing, punctuation heads                                  |
| new language       | cooperating macro modules and composition order                                                             |
| rewritten if       | core interception and block pattern extraction                                                              |

Each accepted family contains a hygiene collision case and a malformed-input
case.

## 6. Differential TypeScript tests

### Macro-free equivalence

For each TypeScript corpus file accepted by the supported compiler:

1. read and print through the macro pipeline;
2. compile original and printed sources with equal options;
3. compare diagnostic codes and normalized spans;
4. compare `.d.ts` output where applicable;
5. compare runtime output for selected executable fixtures.

Formatting differences do not fail the test. Binding or diagnostic differences
do.

### Fragment-consumer differential

Generate or extract candidate expressions, types, statements, and bindings.
Compare consumer extent with the official parser under a containing wrapper.
Store disagreements as minimized fixtures.

## 7. Property tests

| Property                                        | Generator                        |
| ----------------------------------------------- | -------------------------------- |
| `read(print(read(x)))` preserves syntax         | balanced TypeScript token trees  |
| incremental read equals clean read              | source plus valid edit sequence  |
| match failure restores state                    | pattern and token-tree pairs     |
| alpha-renaming preserves binding graph          | scoped macro programs            |
| template substitution preserves capture origins | pattern/template/capture shapes  |
| clean expansion equals incremental expansion    | module graph plus edits          |
| serialization preserves IR meaning              | valid compiled macro definitions |

Property failures store the seed, generator version, and minimized case.

## 8. Fuzzing

Fuzz targets:

- reader bytes and Unicode text;
- balanced and unbalanced token trees;
- macro definition parser;
- pattern compiler;
- matcher with bounded programs;
- nested recursive expansion;
- origin-map composition.

Each target treats crashes, hangs, unbounded allocation, invalid internal states,
and nondeterministic output as failures. CI runs fixed seeds. Scheduled jobs run
time-bounded random campaigns and submit minimized cases to a corpus directory.

## 9. Source-map and diagnostic tests

Assert mappings for:

- copied single tokens and ranges;
- introduced template syntax;
- synthesized grouping parentheses;
- repeated captures;
- generated definitions;
- a TypeScript error inside copied syntax;
- a TypeScript error caused by introduced syntax;
- composed `.sts -> .ts -> .js` maps;
- declaration maps.

Tests query mappings at the start and end of each token. They also test positions
inside trivia and generated-only gaps.

## 10. Incremental test protocol

Each project fixture declares an edit sequence. After each edit:

1. run the incremental compiler;
2. record cache hits, misses, and invalidated modules;
3. run a clean compiler in a fresh cache directory;
4. compare expanded text, diagnostics, binding graphs, maps, `.d.ts`, and `.js`;
5. assert the expected invalidation set.

Required edits include call-site text, macro definition, unused macro export,
runtime-only dependency, whitespace, configuration, and TypeScript version.

## 11. Benchmark protocol

Store benchmark definitions as code and output samples as JSON. Record commit,
dirty status, operating system, CPU, memory, Node, TypeScript, command, warmup,
and sample count.

Measure reader, pattern compilation, matching, template instantiation, expansion,
printing, mapping, TypeScript handoff, and total build. Report median, p95, range,
peak heap, retained heap, token counts, and cache behavior.

The benchmark check compares against a committed baseline on a pinned runner.
It flags a regression threshold; it does not rewrite the baseline.

## 12. CI lanes

```text
check          formatting, lint, type tests, package boundaries
unit           package unit tests
conformance    public semantics and playground acceptance
typescript     supported-version and parser-corpus shards
incremental    edit-sequence equivalence
property       fixed seeds and bounded run counts
fuzz-smoke     regression corpus and short campaigns
benchmark      pinned-runner regression report
```

Pull requests require `check`, `unit`, and affected conformance lanes. Merge to
main runs all lanes except long scheduled fuzz campaigns.

## 13. Completion evidence

Each task links:

- normative specification IDs or section anchors;
- test files added;
- fixture capability IDs;
- benchmark delta when it touches a hot path;
- diagnostics added or changed;
- unresolved limitations.
