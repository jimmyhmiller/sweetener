# Phase 6 Proposal: TypeScript Project Integration

## Decision requested

Approve a compiler-host wrapper that expands virtual TypeScript files before the
official compiler parses them. TypeScript retains responsibility for symbols,
types, declarations, JavaScript output, and project references.

## Outcome

A macro-enabled TypeScript project can check, build, and watch through one CLI.
The compiler caches declarative macro modules and expanded files, remaps
diagnostics, and emits standard TypeScript artifacts.

## Step-by-step work

1. Define source opt-in through `.sts`, configuration includes, or both.
2. Implement compile-time import resolution and keep it separate from runtime
   module edges.
3. Compile macro modules into deterministic matcher/template IR.
4. Expand one source file into virtual `.ts`, a source map, an origin table, and
   an expansion trace.
5. Implement a `CompilerHost` that serves virtual files to `createProgram`.
6. Delegate parse, bind, check, declaration emit, and JavaScript emit to the
   supported TypeScript compiler.
7. Remap TypeScript diagnostics to copied, introduced, and synthesized origins.
8. Compose macro maps with JavaScript and declaration maps.
9. Add content-addressed caches for macro modules and source expansion.
10. Connect macro dependency invalidation to incremental builders and watch mode.
11. Test NodeNext, path aliases, package exports, project references, TSX, and
    declaration-only builds.
12. Compare clean and incremental outputs after edit sequences.

## Declarative module policy

Macro packages ship source or versioned declarative IR plus a manifest that
declares compiler compatibility and exported syntax bindings. Loading a
declarative package performs no arbitrary code execution.

Runtime helpers referenced by templates use ordinary TypeScript imports. The
macro package must state those emitted imports in syntax so project tools can see
them in expanded output.

## Diagnostics

- Matcher errors point to the invocation and failed pattern component.
- Hygiene errors include binding and scope details in related information.
- TypeScript errors on copied syntax map to the original capture.
- TypeScript errors on introduced syntax point to the invocation and cite the
  template definition.
- The CLI exposes the generated file and trace when one original span cannot
  explain the error.

## Exit gate

A multi-project acceptance repository builds `.js`, `.d.ts`, source maps, and
declaration maps. TypeScript type assertions for all playground ports pass.
Watch mode invalidates the changed file and its macro dependents. A clean rebuild
matches the incremental result byte for byte where output promises stability.
