# Implementation Roadmap

The review-oriented replacement for this summary lives in
[Phase Proposals](proposals/README.md). Those proposals make the playground
expressiveness suite and the public declarative layer mandatory phase gates.

## Milestone 0: Acceptance corpus and decisions

Deliver:

- playground examples copied into versioned fixtures;
- expected TypeScript expansions and type assertions;
- supported TypeScript and Node versions;
- decision records for source extension, macro keyword, repetition notation,
  and trusted-code policy;
- benchmark corpus and machine profile.

Gate: ten representative examples cover at least expression, statement, item,
binding, and type positions. `do` notation includes nested binds, destructuring,
early failure, and hygiene collisions.

## Milestone 1: Lossless reader

Deliver:

- `syntax` and `reader` packages in strict TypeScript;
- delimiter token trees for TS and TSX;
- exact read/print round trips;
- structured reader diagnostics;
- TypeScript scanner differential harness;
- baseline throughput and memory report.

Gate: the selected TypeScript corpus passes, known lexical deviations are
documented, and the data model supports stable origins and later incremental
reuse.

## Milestone 2: Hygiene and declarative token-tree macros

Deliver:

- scope-set kernel and formal examples;
- macro/item discovery at file scope;
- literal, `token`, `tt`, delimiter, repetition, and template support;
- compile-time imports for declarative macro modules;
- canonical TypeScript printing and expansion traces.

Gate: macros that do not need `expr`, `type`, or other parsed classes compile
across files; hygiene property tests pass; a clean rebuild is deterministic.

## Milestone 3: Context-directed syntax

Deliver:

- `SyntaxConsumer` interface;
- `expr`, `stmt`, `item`, `type`, `binding`, and `classElement` consumers;
- prefix macros and protected parsed captures;
- recursion, local macro scope, checkpoints, and failure memoization;
- `do`-notation acceptance suite.

Gate: the playground corpus expands with the declarative language and TypeScript
accepts every successful expansion. No fixture relies on a procedural macro.

## Milestone 4: TypeScript project integration

Deliver:

- compiler-host wrapper and CLI build/check/watch commands;
- runtime and macro dependency graphs;
- content-addressed expansion cache;
- JavaScript, declaration, source-map, and declaration-map output;
- remapped TypeScript diagnostics;
- clean versus incremental equivalence suite.

Gate: a multi-project fixture with project references builds and watches; changing
one macro invalidates exactly its transitive expansion users.

## Milestone 5: Operators and complete categories

Deliver:

- prefix/infix/postfix operator declarations;
- precedence and associativity validation;
- JSX-child and remaining category integration;
- conflicts and category-specific binding diagnostics;
- adversarial matcher and expansion limits.

Gate: operator examples compose with TypeScript operators and other macros
without grouping changes; performance stays within measured budgets.

## Milestone 6: Language service

Deliver:

- virtual expanded-file service;
- bidirectional mapping API;
- editor diagnostics, hover, definitions, references, and rename where sound;
- expansion preview and invocation trace command;
- documented behavior for generated-only code.

Gate: the editor contract suite passes on the acceptance corpus with latency
budgets set from measurements.

## Milestone 7: Public alpha

Deliver:

- specification for syntax, phases, categories, matching, templates, and hygiene;
- versioned macro package format;
- CLI and build-tool adapter API;
- compatibility matrix;
- security and reproducibility documentation;
- migration notes for Sweet.js users;
- published benchmark report.

Gate: two nontrivial external sample projects use the system without private
APIs. Alpha means semantics may evolve through explicit versioning, not that
core hygiene or cache behavior is unspecified.

## Work order rationale

Reader fidelity, hygiene, and syntax extent carry the largest technical risk.
The roadmap tests them before build adapters and editor polish. Declarative
macros arrive before a public procedural API so the core remains deterministic
and optimizable.

## Deferred tracks

Evaluate these after the alpha:

- trusted procedural transformer API;
- sandboxed or capability-based transformer execution;
- type-aware post-check macros;
- user-defined syntax categories/spaces;
- indentation-sensitive macro bodies;
- distributed cache and precompiled macro packages;
- direct integration with TypeScript 7's native implementation if its public
  extension points differ from the current compiler.

Each deferred track needs a decision document and a compatibility story. None
should change version 1 hygiene or declarative matching semantics.
