# Civet-inspired Sweetener macros

This example implements a broad, executable slice of [Civet](https://civet.dev/)
as hygienic, declarative Sweetener macros for TypeScript. It covers:

- `:=`-style constant declarations;
- left-to-right pipelines and mathematical modulo;
- `unless` and `until` control flow;
- expression-valued blocks and filtered comprehensions;
- single-argument function shorthand and thick-pipe-style tapping;
- inclusive ranges, slicing, and negative indexing;
- object selection and boolean flag objects;
- chained comparisons, expression conditionals, and type tests;
- an `await.all`-style promise combinator;
- structural pattern matching with nested destructuring, guards, and a wildcard.

The syntax keeps braces and semicolons because Sweetener extends TypeScript's
token grammar; it does not replace the reader with Civet's indentation-sensitive
one. The generated program is ordinary TypeScript and has no runtime macro
dependency.

From the Sweetener repository root:

```sh
node packages/cli/bin/sweetener.mjs expand \
  examples/language-tour/new/civet-inspired/main.sts
pnpm --dir examples/language-tour build
```
