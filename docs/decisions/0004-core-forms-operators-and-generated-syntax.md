# ADR-0004: Core Forms, Operators, and Generated Syntax

Status: accepted  
Date: 2026-08-02  
Owners: Jimmy Miller

## Decision

Support lexical core-form interception. A definition declares `shadows core`,
and each importing scope repeats that opt-in. An ordinary syntax import cannot
replace `if`, `function`, `typeof`, `class`, `var`, or a built-in operator.

Support imported punctuation operators, identifier operators at item scope, and
generated syntax bindings in the first public release. Each operator declares a
category, fixity, associativity, and precedence. The reader preserves unknown
punctuation; the environment decides whether a visible binding gives it syntax.

Generated syntax definitions enter the current lexical scope and phase after
their producing expansion completes. Their templates must contain declarative
IR and pass the same definition checks as source definitions.

## Context

Implicit return, currying, rewritten `if`, and the core-rewrite contract require
core interception. CSP and the operator suite require punctuation heads.
Protocols use `implements` at item scope. Multi-part methods generate a local
syntax binding from a captured declaration name.

A project can support these examples only if parser precedence yields to lexical
syntax lookup at defined extension points. Unrestricted replacement would make
imports change core grammar without a visible warning.

## Options measured

### Definition and import opt-in

Both the macro library and its consumer state the grammar change. Expansion
traces can point to both declarations. The extra import clause adds source text
to each interception scope.

### Definition-only opt-in

Consumers could import a binding without seeing that it replaces core syntax.
Renaming or reorganizing imports could change parse behavior with little local
evidence.

### Defer generated syntax

Deferral would remove the multi-part method contract from the first complete
suite and force a second binding-registration design later. The contract uses
the same declarative validation required for source definitions.

## Consequences

- Enforestation consults lexical syntax bindings before the corresponding core
  parser branch only when both opt-ins exist.
- Import conflicts and equal-precedence operator conflicts produce structured
  diagnostics.
- The trace records interception, operator grouping, and generated binding
  registration.
- The reader cannot reject punctuation based only on the TypeScript grammar.
- Generated definitions consume expansion budget and must make phase progress.

## Reversal condition

Revisit first-release scope if the reader or enforestation prototypes cannot
preserve TypeScript parser equivalence for macro-free files, or if generated
bindings prevent deterministic incremental invalidation.
