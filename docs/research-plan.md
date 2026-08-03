# Research Plan

## Purpose

The research should answer one engineering question: what is the smallest
architecture that can add hygienic, declarative, arbitrary syntactic forms to
TypeScript without maintaining a fork of TypeScript?

## Completed baseline research

This pass examined:

- Sweet.js 0.7.8 source and documentation, representing the implementation
  before the redesign.
- Sweet.js 1.x through 3.0.13 source and documentation, representing the
  redesigned system.
- Sweet.js repository history around scope sets, the new reader, Shift AST,
  modules, token expansion, and term expansion.
- Honu's macro model and its enforestation algorithm.
- Rhombus shrubbery notation, syntax objects, spaces, enforestation, and static
  information.
- The public TypeScript compiler pipeline, compiler API, incremental program
  model, and transformer boundary.

The detailed findings live in the three files under `docs/research/`.

## Next research experiments

Each experiment must end in runnable code, recorded timings, and a short decision
note. Reading more systems without testing the host-language boundary will not
resolve the main risks.

### R1: Reader feasibility

Implement a throwaway scanner that groups `()`, `[]`, `{}`, template literals,
JSX, comments, and TypeScript lexical tokens. Run it over the TypeScript compiler
test corpus. Compare token spans against TypeScript's scanner.

Exit criteria:

- No delimiter corruption in valid `.ts` and `.tsx` fixtures.
- Exact source spans and trivia survive a read/print round trip.
- The prototype documents ambiguous slash, angle-bracket, template, and JSX
  cases.

### R2: Syntax-class boundary

Prototype `expr`, `stmt`, `type`, `binding`, and `item` consumers. Test two
strategies: a small context parser and bounded calls into TypeScript using a
synthetic wrapper. Measure correctness, allocation, and error quality.

Exit criteria:

- `do` notation can consume complete expressions without extra parentheses.
- Generic type arguments and JSX do not make the consumer nondeterministic.
- Failed matches can backtrack without reparsing the whole file.

### R3: Hygiene kernel

Implement scope sets, binding allocation, identifier resolution, template
introduction, and deliberate capture. Test nested scopes, shadowing, recursive
macros, generated bindings, and macro-generating macros.

Exit criteria:

- Generated temporaries cannot capture user bindings.
- Input identifiers retain call-site bindings after template substitution.
- The expansion trace can explain each renamed binding.

### R4: TypeScript handoff

Expand a small `.sts` project to virtual `.ts` files and compile it through a
custom `CompilerHost`. Remap diagnostics to the original source and produce
`.js`, `.d.ts`, and source maps.

Exit criteria:

- `tsc`-quality semantic diagnostics point into macro input when possible.
- declaration emit contains no macro syntax or generated private names that leak
  unintentionally.
- watch mode recompiles only affected files and macro dependents.

### R5: Declarative matcher

Implement literals, variables, syntax classes, nested token-tree patterns,
repetition, separators, alternatives, and templates. Use the playground corpus
as the acceptance suite.

Exit criteria:

- A user can implement `do` notation without procedural token traversal.
- Nested repetition has specified depth and cardinality rules.
- Ambiguous rules produce deterministic selection or a useful definition-time
  error.

### R6: Tooling spike

Build a command that returns expanded virtual TypeScript plus bidirectional span
mappings. Test whether a TypeScript language-service host can consume those
files and map diagnostics, hover, go-to-definition, and rename.

Exit criteria:

- The design identifies which operations can ship in version 1.
- Generated-only spans have an explicit navigation and diagnostic policy.

## Comparative implementation study

Before milestone 2, add small case studies for Rust `macro_rules!`, Racket
`syntax-parse`, Scala 3 quotes, and Lean 4 macros. Focus on diagnostics,
repetition, hygiene escape hatches, phases, and tooling. Do not broaden the core
architecture unless a case study exposes a failed requirement.

## Artifacts still needed from the project owner

- Approval of the intended behavior and TypeScript-targeted expansion for each
  reviewed playground example.
- Approval to copy the external playground examples into this repository as
  acceptance fixtures.
- A representative large TypeScript project for cold and incremental benchmarks.
- A decision on trusted local macro code versus sandboxed/pure macros.

## Research log format

Record each experiment in `docs/decisions/NNNN-title.md` with:

- question and competing designs;
- fixture or benchmark corpus;
- measured result;
- failure cases;
- decision and conditions that would reverse it.

## Primary sources

- [Sweet.js source archive](https://github.com/sweet-js/sweet-core)
- [Sweet.js 0.7 documentation](https://www.sweetjs.org/doc/main/sweet.html)
- [Sweet.js redesigned reference](https://www.sweetjs.org/doc/reference)
- [Hygienic Macros for JavaScript dissertation](https://escholarship.org/uc/item/3392k305)
- [Honu dissertation chapter](https://www-old.cs.utah.edu/plt/publications/rafkind-phd.pdf)
- [Rhombus OOPSLA paper](https://jeapostrophe.github.io/home/static/rhombus-2023.pdf)
- [Rhombus metaprogramming tutorial](https://docs.racket-lang.org/rhombus-meta-tutorial/)
- [TypeScript compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
- [TypeScript compiler notes](https://github.com/microsoft/TypeScript-Compiler-Notes)
