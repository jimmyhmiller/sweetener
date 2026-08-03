# ADR-0005: Composition and Acceptance Scope

Status: accepted  
Date: 2026-08-02  
Owners: Jimmy Miller

## Decision

Keep all twelve playground families in the required acceptance suite. Later
phase gates may stage them by dependency, but the first complete release cannot
defer a family.

Allow a declarative expansion to emit nested invocations at the same phase. The
expander processes the result under the updated lexical environment and rejects
cycles that fail to consume input or change the active definition state.

Allow item macros to emit TypeScript overload declarations. Validate each
generated item through the item consumer before committing the expansion.

## Context

The combined-language contract emits record forms inside a module expansion.
Threading and do notation recurse at one phase. Currying emits overloads.
Multi-part methods register syntax for later calls. These behaviors share one
requirement: expansion results re-enter contextual consumption with precise
progress and scope rules.

The playground families cover separate compiler principles. Dropping one would
leave its principle without an end-to-end acceptance test.

## Options measured

### Keep the complete suite

The capability ledger maps each family to distinct pattern, hygiene, expansion,
or operator behavior. Implementation phases can choose smaller vertical slices
without removing the final obligation.

### Defer dense families

Deferring ADTs, generated mixfix syntax, or the combined language would simplify
an early release. It would also postpone nested repetition, generated binding,
and composition architecture until after public APIs had hardened.

### Expand one pass only

A one-pass expander cannot support recursive declarative rules or cooperating
macro output. Authors would need procedural helpers or manual expansion layers.

## Consequences

- Every release candidate runs all twelve acceptance families.
- Phase plans state which family becomes executable at each gate.
- Expansion tracks invocation ancestry, consumed spans, environment epochs, and
  output hashes for progress diagnostics.
- Item consumers validate generated overloads and declarations before the
  TypeScript host receives them.
- Benchmarks include recursive and composition-heavy cases.

## Reversal condition

Revisit one family only if its contract conflicts with TypeScript correctness or
requires a public procedural macro escape. Record any replacement contract with
equal coverage before removing the original.
