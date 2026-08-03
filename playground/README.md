# Sweet Rewrite Playground

The browser playground runs the production Sweet Rewrite expansion provider in
a Web Worker over an in-memory project filesystem. It does not use a server,
saved output, or a fallback transformer.

From the repository root:

```bash
pnpm playground
```

Open `http://localhost:4173`.

The example selector loads the same twelve macro families used by the
production acceptance suite. Both `macros.sts` and `main.sts` are editable;
every edit recompiles the complete virtual project and updates the generated
TypeScript or real compiler diagnostics.

Build and exercise all twelve examples through the generated browser worker:

```bash
pnpm playground:build
```
