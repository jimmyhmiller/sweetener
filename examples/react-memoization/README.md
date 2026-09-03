# React Compiler fixture, reproduced with macros

This standalone multi-page Vite example demonstrates two authoring surfaces for
the same React Compiler-style cache lowering:

- [`src/memoized.stsx`](src/memoized.stsx) uses an explicit `memoized function`.
- [`src/function-shadow.stsx`](src/function-shadow.stsx) opts into a shadow of
  the ordinary `function` keyword.

Both recognize the source shape from React's
[`repro-separate-scopes-for-divs`](https://github.com/facebook/react/blob/0bbf02475c7b61a618551f1cf10c9bebf336f285/compiler/packages/babel-plugin-react-compiler/src/__tests__/fixtures/compiler/repro-separate-scopes-for-divs.expect.md)
fixture and invoke the shared lowering in `src/fine-jsx-implementation.stsx`.
The revision is pinned so that “matches React Compiler” has a stable meaning.

Like the fixture's generated code, the expansion imports `c` from
`react/compiler-runtime`, allocates `_c(9)`, and emits the same four reactive
scopes in the same slot order:

1. slots 0–1 cache the class calculation that depends on `id`;
2. slots 2–3 cache the first `div` from that class value;
3. slots 4–5 cache the conditional `div` from `cond`;
4. slots 6–8 cache the fragment from the two child identities.

Sweetener's printer and hygienic temporary names differ from Babel's printer
(`cache`/`conditionInput` versus `$`/`t1`, for example). The executable
operations, dependency guards, cache slots, write ordering, and returned value
are the same. The integration test locks down that correspondence.

Each page has controls for changing the ID dependency, toggling the independent
conditional branch, and causing an unrelated parent render. The demo does not
mutate refs during render or add observer components to the optimized JSX; that
would no longer be the compiler fixture being demonstrated.

Run `pnpm build`, or use `pnpm --filter @sweetener-example/react-memoization dev`
from the repository root and open `/memoized.html` or `/function.html`.

This is deliberately a shape-specific proof of concept, not a general React
compiler. A shared syntax class recognizes this one fixture shape; both public
authoring forms delegate to one lowering implementation.
