# Phase 0 Tasks: Repository and Acceptance Foundation

## Goal

Create a buildable workspace, a fixture harness, and approved acceptance intent
before compiler implementation begins.

### FND-001 Create the workspace

Prerequisites: none  
Specification: compiler architecture sections 1, 2, and 10

Files:

```text
package.json
pnpm-workspace.yaml or equivalent
tsconfig.base.json
tsconfig.json
packages/*/package.json
packages/*/tsconfig.json
```

Work:

1. Choose the package manager in `ADR-0001`.
2. Create package shells from the specified repository layout.
3. Configure strict TypeScript, ESM, project references, lint, formatting, and
   test commands.
4. Add import-boundary and cycle checks.
5. Add one type-checking smoke test per package.

Tests: root build, clean build, package boundary failure fixture.

### FND-002 Establish shared IDs and results

Prerequisites: FND-001  
Files: `packages/shared/src/{ids,result,cancellation,limits}.ts`

Work:

1. Define branded IDs for sources, syntax, scopes, bindings, definitions, rules,
   captures, origins, and invocations.
2. Define `Result`, cancellation, and resource-budget types.
3. Add deterministic ID allocators scoped to a compilation session.
4. Test allocation, cancellation, and budget exhaustion.

### FND-003 Establish diagnostics

Prerequisites: FND-002  
Files: `packages/shared/src/diagnostics/*`

Work:

1. Define diagnostic records, severities, stages, arguments, and related origins.
2. Create the diagnostic-code registry and duplicate-code test.
3. Implement plain-text and JSON renderers without package-specific logic.
4. Reserve documented code ranges.

### FND-004 Build the fixture harness

Prerequisites: FND-001, FND-003  
Specification: test architecture sections 2 and 3

Files:

```text
packages/test-support/src/fixtures/*
schemas/case.schema.json
fixtures/conformance/harness/smoke/*
```

Work:

1. Define and validate `case.json`.
2. Load optional expansion, binding, trace, diagnostic, type, and runtime files.
3. Normalize session IDs and platform paths.
4. Implement candidate-golden output separate from accepted goldens.
5. Test invalid manifests and missing expected artifacts.

### FND-005 Import the legacy corpus

Prerequisites: FND-004  
Specification: phase 0 expressiveness contract

Work:

1. Copy the external Sweet.js sources into `fixtures/legacy` with a provenance
   README. Preserve their text.
2. Create one acceptance directory per retained example.
3. Write intent, expected TypeScript expansion, runtime expectation, type
   assertions, and malformed uses.
4. Assign capability IDs to each requirement.
5. Mark syntax decisions that await owner approval.

The source-copy step requires approval because the external directory sits
outside this repository and may continue to change.

### FND-006 Resolve blocking decisions

Prerequisites: FND-005

Create decision records for:

- `OPEN-ARCH-001`: test runner;
- source extension and project opt-in;
- repetition notation;
- capture-field notation;
- rule fallback policy from `OPEN-PAT-001`;
- core-shadowing policy;
- accepted versus deferred playground examples.

## Phase exit

- Root build and test commands work from a clean checkout.
- The fixture harness rejects malformed manifests.
- Each approved playground example has expected behavior and capability IDs.
- Blocking syntax decisions have accepted decision records.
