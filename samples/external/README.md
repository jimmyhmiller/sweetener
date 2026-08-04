# External sample projects

These projects are deliberately outside `pnpm-workspace.yaml`. They import only
package-root build artifacts and exercise the same contracts an installed
consumer receives.

- `project-graph` validates dependency ordering, check, declaration/JavaScript
  build, macro-dependency watch invalidation, and downstream invalidation.
- `macro-editor` validates mapped diagnostics, hover, definition, references,
  and hygienically safe rename from an `.sts` source projection.
- `default-project` invokes the installed `sweetener` executable without an
  injected provider and validates expression, statement, and type macro
  imports, JavaScript/declaration emit, and runtime behavior. Its
  `workflow.sts` example composes a generated domain event, repeated expression
  capture, nested expression expansion, a custom pipeline operator, and a
  macro-expanded optional type in one checked and executable module.

- `javascript-project` validates the JavaScript target: modules opt in with a
  `"use sweetener"` directive rather than a macro extension, keep their `.js`
  names, are parsed and checked as JavaScript, and are checked against their
  JSDoc types under `checkJs`. It also covers a module without the directive
  being left untouched and the config-free `emit` command, which expands
  without a `tsconfig.json` and without running TypeScript.

Run all four through `pnpm samples:check`. Release validation records timings and
any packaging defect in `docs/release/external-samples.md`.
