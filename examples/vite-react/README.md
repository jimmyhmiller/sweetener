# React hook macros

This example uses real statement macros inside a `.stsx` component for state,
memoized and deferred values, callbacks, effects, reducers, refs, context,
stable React IDs, and boolean toggles. Dependency lists remain explicit where
the underlying hook requires them:

```tsx
state count: number = 0;
memo doubled [count] as number = count * 2;
callback increment [step] () { setCount((value) => value + step); }
effect [count, prefix] { return () => disconnect(count); }
toggle detailsOpen = false; // derives setDetailsOpen and toggleDetailsOpen
deferred deferredCount = count;
reactId stepInputId;
states { page = 1; query = ""; }
latestRef latestStep = step;
transition navigation; // navigationPending and startNavigation
```

`react-hooks.sts` imports hooks from React at definition time. Sweetener
materializes only the runtime imports needed by invoked macros. Captured and
derived names are real hygienic bindings in the following component body.
Independent components can reuse the same state, setter, and toggle spellings
without collisions.

Validation is deliberately layered:

```sh
pnpm check       # Sweetener + TypeScript, then Rules of Hooks on expanded TSX
pnpm build       # all checks followed by the real Vite production build
pnpm lint:hooks  # regenerate .sweetener and run React's hook lints
```

The Vite React plugin explicitly includes `.stsx`; otherwise its default file
filter skips Fast Refresh instrumentation for the custom extension. The
repository integration test runs the Vite development pipeline and asserts that
React Refresh registration survives Sweetener expansion.
