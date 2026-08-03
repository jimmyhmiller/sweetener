# Phase 3 Tasks: Templates and Hygiene

## Goal

Instantiate declarative templates with scope-set hygiene, origins, repetition,
and binding contracts.

### HYG-001 Implement the scope store

Prerequisites: FND-002  
Files: `packages/hygiene/src/{scope,scope-set,scope-store}.ts`

Implement fresh scopes, interned sets, add/remove/union/subset, stable debug
serialization, and allocation benchmarks.

### HYG-002 Implement bindings and environments

Prerequisites: HYG-001

Define bindings, syntax spaces, phases, declaration groups, persistent lexical
environments, and environment epochs.

### HYG-003 Resolve `OPEN-HYG-001`

Prerequisites: HYG-002

Write a small model and executable examples for introduction and use-site scopes,
local macro definitions, and generated definitions. Record the chosen rule in an
ADR and update the hygiene specification.

### HYG-004 Implement resolution

Prerequisites: HYG-003

Implement candidate filtering, scope-subset comparison, maximal-candidate choice,
unbound results, and ambiguity diagnostics. Prove insertion-order independence
through property tests.

### TPL-001 Parse and validate templates

Prerequisites: PAT-002, MCL-001

Parse literal syntax, capture references, field paths, group templates, and
repetition. Validate capture availability and depth.

### TPL-002 Implement repetition and conditionals

Prerequisites: TPL-001

Implement driving captures, cardinality checks, separators, optional handling,
alternative tags, and template-step budgets.

### TPL-003 Implement declarative operations

Prerequisites: TPL-002, HYG-004

Implement `fresh`, `callsite`, `definition`, `capture`, stable syntax text,
repetition indices, and template folds. Add trace events for operations that bend
hygiene.

### TPL-004 Instantiate templates

Prerequisites: TPL-003, SYN-002

Apply introduction scopes, preserve capture scopes, create origins, build groups,
and return immutable syntax sequences.

### HYG-005 Implement binding contracts

Prerequisites: TPL-004

Parse and validate binder/region paths. Apply lexical, recursive, and sequential
contracts across compatible repetition shapes.

### HYG-006 Implement deterministic name assignment

Prerequisites: HYG-005

Assign printed names by binding identity and traversal order. Handle shorthand
properties and collisions. Keep this component separate from full formatting.

### TPL-005 Add hygiene conformance fixtures

Prerequisites: HYG-006

Add all semantic examples from syntax/hygiene section 13, plus `do`, `match`,
constructors, protocol parameters, and generated macro-name scenarios.

## Phase exit

- Binding-identity assertions prove hygiene before printing.
- Template repetition and folds express the playground transformations.
- Binding contracts describe `do` and match-branch scope.
- Explicit capture produces a diagnostic or trace event.
- Alpha-renaming properties pass.
