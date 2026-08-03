# ADR-0008: Validate assembled TypeScript files

Status: accepted  
Date: 2026-08-03  
Owners: project maintainers

## Decision

Use one official TypeScript parse and semantic check of the assembled expanded
file as the correctness gate. Do not wrapper-parse every successfully consumed
type or class-element fragment. Wrapper parsing remains a test oracle and MAY be
used as a diagnostic-recovery probe after the complete file reports an error.

## Context

Consumers determine structural extent but do not reimplement TypeScript
semantics. `OPEN-EXP-001` required a measured choice between synthetic wrappers
and complete-file validation, including TSX and source-coordinate behavior.

## Options measured

The mixed type/class corpus made wrapper parsing 2.03 times slower. A larger
type-only run made it 1.27 times slower with effectively identical retained
heap. Wrappers lose imports, declarations, JSX mode, neighboring context, and
real file coordinates. Complete-file parsing validates the program actually
handed to TypeScript and feeds the implemented origin remapper.

## Consequences

- syntax consumers own extent and binding structure, not semantic validity;
- TypeScript diagnostics are remapped from the expanded file through origins;
- optional wrapper recovery cannot accept a file rejected by the complete gate;
- incremental compiler-host reuse applies to the same virtual file used for emit.

## Reversal condition

Revisit only if a supported TypeScript API offers context-preserving fragment
parsing with real coordinates and measured lower total latency.
