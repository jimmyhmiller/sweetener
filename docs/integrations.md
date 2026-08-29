# Build-tool integrations

Sweetener expands source before TypeScript, JSX, minification, and bundling.
Every adapter delegates to `@sweetener/compiler`; compile-time macro imports
never enter the runtime module graph.

## Universal plugin

`@sweetener/unplugin` provides these entry points:

| Entry point | Verified host                                           |
| ----------- | ------------------------------------------------------- |
| `/vite`     | Vite development and production builds                  |
| `/rollup`   | Rollup production build                                 |
| `/rolldown` | Rolldown production build                               |
| `/esbuild`  | esbuild build and macro-only incremental rebuild        |
| `/webpack`  | webpack production build                                |
| `/rspack`   | Rspack production build                                 |
| `/rsbuild`  | Rsbuild production build                                |
| `/bun`      | Bun runtime loading and production builds               |
| `/farm`     | Farm native load/transform adapter and production build |

Vite-based frameworks such as Astro, SvelteKit, SolidStart, Vitest, and Nuxt
use the Vite entry. webpack- and Rspack-based frameworks use their respective
entry. Farm has a native implementation because its generic plugin bridge
cannot assign a module type after attempting to load an unknown `.sts` file.

```ts
// vite.config.ts
import { defineConfig } from "vite";
import sweetener from "@sweetener/unplugin/vite";

export default defineConfig({ plugins: [...sweetener()] });
```

### React and Fast Refresh

React hook macros work in `.stsx`, but `@vitejs/plugin-react` does not include
custom extensions in its default transform filter. Include `.stsx` explicitly
so the expanded module receives Fast Refresh instrumentation:

```ts
export default defineConfig({
  plugins: [
    ...sweetener({ configFile }),
    react({ include: /\.(?:[jt]sx|stsx)$/u }),
  ],
});
```

The React example emits an ignored `.sweetener/main.tsx` for
`eslint-plugin-react-hooks`. This makes the official Rules of Hooks inspect the
real expanded hook calls rather than attempting to parse macro syntax. Normal
Sweetener checking remaps TypeScript diagnostics from generated hook calls back
to their captured `.stsx` source regions.

## Bun runtime and bundler

The Bun entry is a native synchronous-setup plugin, so the same adapter works
with both `Bun.plugin()` at runtime and the `plugins` option of `Bun.build()`.
For direct `.sts` imports, preload a small registration module from
`bunfig.toml`:

```toml
preload = ["./sweetener.preload.ts"]
```

```ts
// sweetener.preload.ts
import sweetener from "@sweetener/unplugin/bun";

Bun.plugin(sweetener());
```

Typed `.sts` and `.stsx` output is handed back through Bun's TypeScript loaders.
Macro dependencies participate in the compiler session's content-aware cache,
so Bun watch-mode reloads see changes made only to an imported macro module.

## Deno tasks

Deno does not currently provide a custom module-loader hook for arbitrary file
extensions. The checked-in Deno example therefore uses Deno-native tasks to
expand `.sts` into an ignored `.sweetener` tree before Deno checks or runs it:

```sh
deno task check
deno task start
deno task dev
```

`deno task dev` watches the macro sources, re-expands them, and restarts the
Deno server. This keeps the generated boundary explicit while preserving
Deno's native checker, permission model, watcher, test runner, and HTTP server.

## webpack, Rspack, and Turbopack loader

`@sweetener/webpack-loader` implements the webpack loader API, including source
maps and macro dependency registration. It is verified with webpack, Rspack,
and a Next production build using Turbopack.

```js
export default {
  module: {
    rules: [
      {
        test: /\.sts$/,
        use: [{ loader: "@sweetener/webpack-loader" }],
      },
    ],
  },
};
```

For Next/Turbopack, add a `turbopack.rules["*.sts"]` loader rule with
`as: "*.ts"`. Use a separate Sweetener project configuration if Next's own
TypeScript checker owns `tsconfig.json`, and provide declarations for runtime
exports imported from `.sts` modules.

## Other native integrations

- `@sweetener/parcel-transformer` is a Parcel 2 transformer.
- `@sweetener/babel` expands a file before Babel parses it and passes the
  Sweetener map as Babel's input map.
- `@sweetener/jest` is an asynchronous Jest ESM transformer with dependency-
  aware cache keys.
- `@sweetener/node/register` installs Node module customization hooks, expands
  `.sts`, strips TypeScript with the official compiler, and executes it as ESM.
- `@sweetener/cli` and `@sweetener/compiler` remain the full-project TypeScript
  check/build/declaration path.

Tools such as Turborepo, Nx, Storybook, Electron, tsup, and unbuild orchestrate
or embed one of the verified hosts above; select the adapter for their chosen
builder. SWC and Oxc AST plugins cannot parse arbitrary Sweetener syntax, so
Sweetener must run before them.

## Test policy

Adapters are tested against real host APIs, not only mocked hook objects. The
suite covers production output, compile-time import removal, source maps where
the host exposes them, macro dependency registration, macro-only incremental
rebuilds, and direct runtime execution. Versions are pinned in each adapter's
development dependencies to make the compatibility claim reproducible.
