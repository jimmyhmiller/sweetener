# External sample projects

These projects are deliberately outside `pnpm-workspace.yaml`. They import only
package-root build artifacts and exercise the same contracts an installed
consumer receives.

- `project-graph` validates dependency ordering, check, declaration/JavaScript
  build, macro-dependency watch invalidation, and downstream invalidation.
- `macro-editor` validates mapped diagnostics, hover, definition, references,
  and hygienically safe rename from an `.sts` source projection.
- `default-project` invokes the installed `sweet-rewrite` executable without an
  injected provider and validates expression, statement, and type macro
  imports, JavaScript/declaration emit, and runtime behavior.

Run all three through `pnpm samples:check`. Release validation records timings and
any packaging defect in `docs/release/external-samples.md`.
