# External sample validation

Date: 2026-08-03

All three samples live below `samples/external` but are excluded from
`pnpm-workspace.yaml`. Setup uses `pnpm --ignore-workspace` and public
`@sweetener/*` export roots. No sample imports a package-internal source or
`dist` path.

## Project graph

The first sample models a library and downstream application. It validates:

- strict TypeScript check without emit;
- JavaScript and declaration build;
- dependency ordering;
- macro-dependency watch invalidation;
- downstream invalidation without touching an unrelated project.

A warm local run measured check at 998.39 ms, build at 743.52 ms, and the watch
invalidation/rebuild at 711.33 ms. Timings include official TypeScript program
construction and are development evidence, not release budgets.

## Declarative macro and editor

The second sample consumes package roots to parse and compile a declarative
`duplicate` expression macro, hygienically expand `duplicate(answer)`, print its
origin map and trace, parse the generated TypeScript, and execute the CommonJS
output. Runtime result is `[21, 21]`.

The same project validates mapped diagnostics, hover, definition, references,
completions, and safe rename. A warm local run measured definition compilation
plus expansion at 14.45 ms and all editor reads at 186.86 ms.

## Default installed CLI project

The third sample invokes the `sweetener` executable with no injected
provider. A normal `.sts` application imports aliased expression, statement,
item, type, and symbolic operator macros from a declarative module. The workflow
checks generated source,
builds JavaScript and declarations with the official TypeScript emitter, and
executes the result, exercises `expand` and structured `explain`, and drives
call-site plus macro-definition edits through default watch mode. The release
verifier runs the same workflow against clean-installed package tarballs.

## Setup and reproducibility

```sh
pnpm samples:check
```

The command builds package artifacts, installs each sample independently with
link dependencies, then runs all three workflows. A warm complete command took 6.18
seconds on the project development machine; this includes workspace build and
dependency setup.

## Defects found

1. Running `pnpm --dir` below the repository initially rejoined the parent
   workspace and skipped sample dependencies. The documented command now uses
   `--ignore-workspace`.
2. Initial sample imports used relative `dist/src` paths and therefore did not
   prove export maps. All imports now use public package roots.
3. Package manifests remain private `0.0.0` workspaces with `workspace:*`
   dependencies. Release staging now rewrites publish manifests and verifies all
   three samples against clean-installed tarballs.
4. Low-level samples did not prove that an application could invoke one default
   compiler path. TSH-009 added the executable default-project workflow.

All four defects are fixed in local release staging.
