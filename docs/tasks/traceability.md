# Requirements Traceability

## Compiler principles

| Requirement                   | Specification                    | Primary tasks                      | Required evidence                                   |
| ----------------------------- | -------------------------------- | ---------------------------------- | --------------------------------------------------- |
| Lossless syntax data          | syntax/hygiene sections 1–3      | SYN-001, SYN-002, RDR-001–RDR-005  | byte round-trip, origin tests                       |
| Scope-set hygiene             | syntax/hygiene sections 4–12     | HYG-001–HYG-006                    | binding-ID fixtures, alpha-renaming properties      |
| Declarative matching          | patterns/templates sections 1–8  | PAT-001–PAT-008                    | matcher unit matrix, structural playground fixtures |
| Declarative templates         | patterns/templates sections 9–13 | TPL-001–TPL-005                    | repetition/fold fixtures, definition-time failures  |
| Context-directed parsing      | expansion sections 3–10          | ENF-001–ENF-007                    | TypeScript differential tests                       |
| Phase separation              | expansion sections 1–2 and 11    | EXP-001, EXP-002, CMP-001, CMP-002 | local/generated macro fixtures                      |
| Termination and limits        | expansion section 6              | EXP-004                            | recursion, growth, cancellation tests               |
| Official TypeScript semantics | architecture and host proposal   | TSH-001–TSH-008                    | project build and incremental equivalence           |
| Diagnostics and mappings      | architecture section 8           | SYN-002, TSH-004, TSH-005          | structured diagnostic and token-boundary map tests  |
| Deterministic macro packages  | architecture sections 7 and 10   | PAT-003, TSH-001, TSH-006          | serialization and cache-key tests                   |

## Playground capabilities

| Capability                  | Source examples                     | Tasks            | Acceptance assertions                        |
| --------------------------- | ----------------------------------- | ---------------- | -------------------------------------------- |
| User syntax classes         | `do-notation`, `protocol`           | PAT-006, PAT-008 | exported fields and alternatives             |
| Expression extent           | `do`, `threading`, `csp`            | ENF-002, ENF-003 | cursor rest and grouping                     |
| Recursive rules             | `do`, `threading`                   | EXP-004, CMP-001 | progress and base-case traces                |
| Nested repetition           | `adt`, `protocol`, `methods`        | PAT-002, TPL-002 | capture dimensions and cardinality           |
| New binding forms           | `do`, `adt/match`, `protocol`       | HYG-005, ENF-005 | binding graph and scope limits               |
| Generated macros            | `methods`                           | CMP-002          | visibility after declaration                 |
| Core shadowing              | `implicit`, `ideas`, rewritten `if` | EXP-005          | intercepted-use trace and lexical boundary   |
| Custom operators            | `csp`, `ideas`, `newlang`           | CMP-003          | precedence and associativity                 |
| Mixfix syntax               | `methods`                           | CMP-004          | segment extent and argument order            |
| Token text/refinement       | `adt`, `ideas`                      | PAT-007, TPL-003 | stable text and identifier-case alternatives |
| Template folds/indices      | `adt`                               | TPL-003          | positional expansion without host code       |
| Cooperating language layers | `newlang`                           | CMP-005, TSH-001 | module expansion order and runtime result    |

## Test obligations by phase

| Phase | Unit                      | Conformance                   | Property/fuzz                       | Benchmark                      |
| ----- | ------------------------- | ----------------------------- | ----------------------------------- | ------------------------------ |
| 0     | manifest validation       | harness smoke                 | invalid schema generation           | none                           |
| 1     | syntax, cursor, reader    | lexical fixtures              | read/print/read, reader fuzz        | reader throughput/memory       |
| 2     | compiler and matcher      | syntax-class/repetition       | restore-state, matcher fuzz         | matcher throughput             |
| 3     | scope, resolver, template | hygiene and binding contracts | alpha-renaming, IR round-trip       | scope/template allocation      |
| 4     | consumers and expander    | do/threading/implicit         | extent differential, recursion fuzz | dense expansion                |
| 5     | generated/local/operator  | remaining playground          | composition permutations            | operator/composition overhead  |
| 6     | host, cache, maps         | project fixtures              | edit-sequence equivalence           | cold/warm/incremental builds   |
| 7     | mappings and service      | editor workflows              | mapping queries under edits         | editor latency and full report |

## Traceability maintenance

Each pull request that adds a public feature updates one row or records why the
existing row covers it. Each accepted fixture lists capability IDs in its
manifest. CI should report specification requirements with no linked test after
the capability registry exists.
