# Phase 2 Tasks: Declarative Patterns

## Goal

Compile and execute patterns over token trees, including user syntax classes and
nested repetition.

### PAT-001 Define pattern and capture ASTs

Prerequisites: SYN-003  
Files: `packages/pattern/src/{ast,capture-shape,capture-record}.ts`

Implement pattern nodes, capture paths, shapes, dimensions, cardinality groups,
and immutable capture records.

### MCL-001 Parse structural macro definitions

Prerequisites: PAT-001, RDR-004  
Files: `packages/macro-language/src/parser/*`

Parse macro names, categories, rules, literal patterns, captures, groups,
alternatives, and repetition. Return macro-definition syntax with source origins.

### PAT-002 Infer and validate capture shapes

Prerequisites: PAT-001, MCL-001

Infer repetition depth and cardinality groups. Diagnose inconsistent alternatives,
duplicate captures, zero-width repetition, and incompatible class fields.

### PAT-003 Compile matcher programs

Prerequisites: PAT-002

Lower validated ASTs to matcher instructions. Assign stable rule, repetition, and
slot IDs. Serialize programs in deterministic order.

### PAT-004 Execute matcher programs

Prerequisites: PAT-003, SYN-003

Implement the explicit work stack, cursor checkpoints, capture rollback, group
entry, source-order choices, and matcher-step limits.

### PAT-005 Add failure ranking and memoization

Prerequisites: PAT-004

Memoize failed states with environment epochs. Produce farthest-position failure
trees and merged expectations.

### PAT-006 Implement user syntax classes

Prerequisites: PAT-005

Add class fields, alternative rules, nested class calls, returned field records,
and recursion validation. Start with token, token-tree, and identifier built-ins.

### PAT-007 Add declarative refinements

Prerequisites: PAT-006

Implement the fixed refinement IR for token kinds, identifier spelling/case,
boundaries, alternatives, and repetition length.

### PAT-008 Port structural examples

Prerequisites: PAT-007, FND-005

Define structural versions of `Bind`, `BindAll`, protocol methods, ADT
constructors, and multi-part method segments. Use placeholder grammar consumers
with fixed fixtures; record each placeholder for Phase 4.

## Phase exit

- Pattern compiler catches malformed definitions before invocation.
- Matcher tests assert captures and rest cursors.
- Nested repetition and user syntax classes cover playground structure.
- Adversarial matching stops under the configured budget.
- Pattern IR serialization remains deterministic.
