# Phase 7 Proposal: Tooling, Performance, and Release

## Decision requested

Approve the release bar for editor behavior, expansion inspection, performance,
compatibility, and package safety.

## Outcome

Users can understand macro expansion and work in macro-enabled files without
treating generated TypeScript as the primary source. Build overhead and
incremental invalidation have published measurements.

## Step-by-step work

1. Serve expanded virtual files through a TypeScript language-service host.
2. Implement bidirectional mapping for diagnostics, hover, definitions,
   references, rename, and completion.
3. Add expansion preview and `explain` output for a selected invocation.
4. Expose matched rule, captures, nested expansion stack, and hygiene events.
5. Add syntax highlighting and structural navigation data for macro definitions
   and invocations.
6. Implement incremental reader reuse and subtree expansion caches where
   profiles justify them.
7. Benchmark macro-free overhead, dense expansion, the playground suite, and a
   large TypeScript application.
8. Stress adversarial patterns, recursive macros, large output, and malformed
   input under resource limits.
9. Run compatibility tests against the oldest and newest supported TypeScript
   versions.
10. Write the macro-language specification, package format, security model, and
    migration guide.
11. Validate two sample projects outside the compiler repository.
12. Publish an alpha with versioned syntax semantics and documented editor gaps.

## Performance review metrics

- reader and matcher throughput;
- cold expansion overhead against plain TypeScript;
- warm no-change latency;
- leaf-edit and macro-definition-edit latency;
- expanded-file cache hit rate;
- number of invalidated files;
- peak and retained memory;
- language-service p50 and p95 update latency.

Use the budgets in `docs/design/testing-performance.md` as hypotheses. Adjust
them from recorded corpus results before alpha.

## Tooling acceptance

The editor must provide correct diagnostics, hover, and navigation for copied
syntax. Rename must preserve hygiene and refuse operations that cross an origin
mapping it cannot represent. Generated-only regions link to an expansion view.

## Release gate

- The accepted playground ports use the public declarative layer.
- The specification covers pattern matching, repetition, syntax classes,
  templates, binding clauses, hygiene, phases, operators, and generated macros.
- Clean and incremental builds agree across the project test matrix.
- Resource limits stop adversarial fixtures with stable diagnostics.
- The benchmark report includes commands, hardware, versions, and raw samples.
- Two external sample projects complete check, build, watch, and editor workflows.

## Work after alpha

Evaluate a procedural macro API only after declarative users identify a syntactic
transformation that finite patterns, refinements, and template folds cannot
express. That evaluation must preserve deterministic caching or introduce a
separate trusted package class with declared capabilities.
