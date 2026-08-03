# Implementation Task Index

## How to use this backlog

Complete tasks in dependency order. A task can start when its prerequisites and
open decisions have finished. A task finishes when its code, tests, diagnostics,
and documentation meet the evidence checklist.

Phase packets:

- [Phase 0: repository and acceptance foundation](phase-00-foundation.md)
- [Phase 1: syntax and reader](phase-01-reader.md)
- [Phase 2: declarative patterns](phase-02-patterns.md)
- [Phase 3: templates and hygiene](phase-03-hygiene-templates.md)
- [Phase 4: contextual expansion](phase-04-expansion.md)
- [Phase 5: declarative composition](phase-05-composition.md)
- [Phase 6: TypeScript integration](phase-06-typescript-host.md)
- [Phase 7: tooling and release](phase-07-tooling-release.md)

## Critical path

```text
FND-001 repository
  -> FND-004 fixture harness
  -> SYN-001 syntax types
  -> RDR-001 scanner adapter
  -> RDR-004 delimiter reader
  -> PAT-001 pattern AST
  -> PAT-004 matcher
  -> HYG-001 scope store
  -> HYG-004 resolution
  -> TPL-004 instantiation
  -> EXP-001 environments
  -> ENF-003 expression consumer
  -> EXP-006 do-notation vertical slice
  -> CMP-005 playground completion
  -> TSH-003 CompilerHost
  -> TLS-005 language service
```

## Definition of ready

A task is ready when:

- prerequisite tasks have completion evidence;
- referenced specification sections contain no blocking `OPEN-*` marker;
- expected public interfaces and diagnostic codes have names;
- fixtures or test cases describe success and failure;
- benchmark input exists for work on a hot path.

## Definition of done

A task is done when:

- strict TypeScript compilation passes;
- package-boundary checks pass;
- unit and conformance tests cover success, failure, and limits;
- new diagnostics use stable structured codes;
- clean and incremental paths agree where both exist;
- documentation names deviations from the specification;
- the task records benchmark impact when it changes reader, matcher, expansion,
  printer, or caching code.

## Task record template

```markdown
### ABC-123 Short title

Prerequisites: ABC-100  
Specification: `docs/specifications/file.md`, section N  
Files: `packages/name/src/file.ts`

Work:

1. ...

Tests:

- ...

Evidence:

- [ ] code and public types
- [ ] unit tests
- [ ] conformance fixture
- [ ] diagnostics
- [ ] benchmark or `not applicable` note
```

## Cross-phase rules

- Do not add a public procedural macro API.
- Do not parse printed text to recover hygiene bindings.
- Do not import TypeScript AST types outside `typescript-host` or a named version
  adapter.
- Do not accept a playground port that requires compiler helper calls.
- Do not update goldens through the ordinary test command.
- Keep public semantic changes behind a specification edit and decision record.
