# Framework integration examples

Every app imports the same deliberately elaborate TypeScript module at
`macro-suite/showcase.sts`. The macros cover expression, statement, item, type,
repetition, renamed import, custom operator, and hygiene-sensitive expansion.

Run every production build from the repository root:

```sh
pnpm examples:build
```

| Example          | Framework/build path               |
| ---------------- | ---------------------------------- |
| `language-tour`  | 42 runnable language examples      |
| `next`           | Next App Router + Turbopack loader |
| `tanstack-start` | TanStack Start + Vite plugin       |
| `astro`          | Astro + Vite plugin                |
| `nuxt`           | Nuxt + Vite plugin                 |
| `sveltekit`      | SvelteKit + Vite plugin            |
| `solid-start`    | SolidStart + Vite plugin           |
| `vite-react`     | React hook macros + Vite plugin    |
| `vite-vue`       | Vue + Vite plugin                  |
| `vite-svelte`    | Svelte + Vite plugin               |
| `vite-solid`     | Solid + Vite plugin                |
| `vite-preact`    | Preact + Vite plugin               |
| `vite-vanilla`   | browser TypeScript + Vite plugin   |
| `bun`            | Bun runtime preload + `Bun.build`  |
| `deno`           | Deno tasks + generated TS boundary |

Lower-level integrations for webpack, Rspack, Rsbuild, Rollup, Rolldown,
esbuild, Farm, Parcel, Babel, Jest, and Node are exercised against their
real host APIs in the package test suite. They are integration hosts rather
than additional UI frameworks, so duplicating the same page for each would not
add framework coverage.

## Known integration boundaries

- The React example type-checks the macro source, lints expanded TSX with the
  official Rules of Hooks, verifies Fast Refresh in Vite development, and runs
  a production build. Its hook declarations keep setters and dependency arrays
  explicit.

- Deno has no custom module-loader hook. The Deno example wraps pre-expansion,
  checking, serving, testing, and macro-aware watch restarts in native tasks.
- SWC and Oxc cannot directly parse arbitrary Sweetener syntax. Sweetener must
  run before them. The Vite adapter now performs Vite's official Oxc transform
  after expansion so typed `.sts` output continues through Vite as JavaScript.
- Frameworks that merely orchestrate a supported host should use that host's
  adapter. Examples include Storybook (Vite/webpack), Electron (Vite/webpack),
  and monorepo runners such as Nx and Turborepo.
