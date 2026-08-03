# ADR-0001: Package and Tooling Baseline

Status: accepted  
Date: 2026-08-02  
Owners: project maintainers

## Decision

Use:

- pnpm 11.18.0;
- Node 24.18.0 with an engine range of `>=24 <25`;
- the `@typescript/typescript6` 6.0.2 compatibility package under the local name
  `typescript`;
- Vitest 4.1.10;
- ESLint 10.8.0 with typescript-eslint 8.65.0;
- Prettier 3.9.6;
- ESM packages and TypeScript project references.

Pin exact tool versions in the root manifest and lockfile.

## Context

The compiler requires the TypeScript scanner, parser, `CompilerHost`, and language
service APIs. TypeScript 7.0.2 is the current native compiler, but TypeScript 7.0
does not ship a programmatic API. The TypeScript team plans a new API for 7.1 and
provides `@typescript/typescript6` for tools that need the 6.0 API during the
transition.

Node 24 is the current LTS line. Node 26 remains a Current release. The workspace
uses the LTS line to reduce toolchain churn.

## Options measured

### TypeScript 7.0.2

The native compiler provides faster CLI checking but no API for the host
integration specified by this project. It cannot serve as the implementation
dependency yet.

### TypeScript 6 compatibility API

`@typescript/typescript6` preserves the JavaScript compiler API. It supports the
reader, TypeScript host, and language-service design. This option meets the
current architectural requirements.

### Node 24 and Node 26

Node 24 has LTS status. Node 26 has Current status. The selected tools support
Node 24.

## Consequences

- Compiler code imports from `typescript`, which resolves to the TypeScript 6
  compatibility package.
- Compatibility tests will run generated code through TypeScript 7 as a CLI
  target in Phase 6.
- The project will review the TypeScript 7.1 API after release.
- Contributors need Node 24 and pnpm 11.18.0 for supported local builds.
- CI can add Node 26 as a nonblocking compatibility lane after the workspace
  stabilizes.

## Reversal condition

Review this decision when TypeScript 7.1 publishes its programmatic API. Replace
the compatibility package after an adapter prototype passes reader, host,
language-service, diagnostic, and performance tests.

## Sources

- [Node.js release schedule](https://nodejs.org/en/about/previous-releases)
- [TypeScript 7.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)
