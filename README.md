# Sweetener

**Hygienic, declarative macros for TypeScript.**

Sweetener lets a project extend TypeScript syntax while leaving type checking,
declaration generation, JavaScript emission, and editor semantics to the
official TypeScript compiler. Macro-enabled files expand from `.sts` or `.stsx`
into ordinary TypeScript, with source maps and expansion traces connecting the
result back to the source.

[Try the playground](https://jimmyhmiller.github.io/sweetener/) — it runs the
real expansion pipeline locally in a Web Worker, with no server-side compiler.

> Sweetener is currently an alpha-stage project. The implementation and local
> release artifacts are complete, but the packages have not yet been published
> to npm.

## See it transform

Sweetener macros are syntax-aware transformations rather than text
substitutions. They can match typed grammatical forms, introduce bindings,
define operators, and safely rewrite core forms.

### Implicit returns

```ts
const calculate = function (value: number) {
  const doubled = value * 2;
  doubled + 1;
};
```

expands to:

```ts
const calculate = function (value: number) {
  const doubled = value * 2;
  return doubled + 1;
};
```

### Custom operators

```ts
const result = #[1, 2, 3] |> sum == 6;
```

expands to ordinary, type-checkable TypeScript:

```ts
const result = globalThis.Object.is(sum(vector(1, 2, 3)), 6);
```

Here `#` constructs a vector, `|>` pipes it into `sum`, and `==` is deliberately
redefined as `Object.is`. Precedence and associativity are part of each operator
declaration.

### Algebraic data types and matching

```ts
data Option<T> = None() | Some(value: T);

const result = match (Some(3)) {
  Some(value) => value + 1;
  None() => 0;
};
```

expands into a discriminated union, typed constructors, and tag-based matching:

```ts
type Option<T> = { readonly tag: "None" } | { readonly tag: "Some"; value: T };

const None = <T>(): Option<T> => ({ tag: "None" });
const Some = <T>(value: T): Option<T> => ({ tag: "Some", value });

// The generated match tests `value.tag`, binds the payload, and preserves
// TypeScript's narrowing in each branch.
```

The playground also includes threading, do notation, currying, protocols, CSP
operators, rewritten core forms, generated multi-part methods, and a combined
mini-language. Every example comes from the executable acceptance suite.

## A modern relative of Sweet.js

Sweetener draws directly from [Sweet.js](https://www.sweetjs.org/), the hygienic
macro system for JavaScript. It keeps Sweet.js's strongest ideas—concrete
patterns and templates, syntax classes, lexical macros, explicit compile-time
imports, and scope-set hygiene—while targeting TypeScript and making the public
macro language declarative.

Unlike Sweet.js, Sweetener does not emit JavaScript through its own full parser
or allow arbitrary JavaScript to execute during expansion. It emits TypeScript
for the official compiler, and its finite declarative macro language has no
filesystem, network, environment, process, clock, randomness, or evaluator
access. See the [Sweet.js design research](docs/research/sweetjs.md) and
[migration notes](docs/specifications/06-public-release-surface.md#8-migration-from-sweetjs)
for the detailed lineage.

## How it works

```text
.sts / .stsx
    ↓ lossless TypeScript-aware reader
delimiter trees
    ↓ hygienic, context-directed macro expansion
ordinary TypeScript + origin map + expansion trace
    ↓ official TypeScript compiler
.js + .d.ts + source maps + TypeScript diagnostics
```

Macro imports are explicitly compile-time-only:

```ts
import { (|>) } from "./operators.sts" for syntax;
```

Introduced identifiers receive definition and introduction scopes, while
captured identifiers retain their call-site identity. That keeps generated
bindings from accidentally capturing—or being captured by—user code.

## Run it from source

Sweetener currently requires Node.js 24 and pnpm 11.18.0.

```bash
pnpm install
pnpm build
pnpm test
```

Run the browser playground locally:

```bash
pnpm playground
```

The CLI supports project checking, building, watching, expansion inspection,
and explanations:

```bash
sweetener check -p tsconfig.json
sweetener build -p tsconfig.json
sweetener watch -p tsconfig.json
sweetener expand src/main.sts
sweetener explain src/main.sts:12:8
```

## Documentation

- [Language and release surface](docs/specifications/06-public-release-surface.md)
- [Patterns and templates](docs/specifications/03-patterns-templates.md)
- [Syntax objects and hygiene](docs/specifications/02-syntax-objects-hygiene.md)
- [Compiler architecture](docs/specifications/01-compiler-architecture.md)
- [Build-tool integrations](docs/integrations.md)
- [Project status](STATUS.md)

## Project status

The compiler, CLI, browser playground, TypeScript host, language-service
mapping, integrations, compatibility checks, and alpha release artifacts are
implemented and tested locally. npm publication and a release tag remain
intentionally blocked until explicitly authorized. See [STATUS.md](STATUS.md)
for the generated capability dashboard and current validation evidence.
