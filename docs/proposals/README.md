# Phase Proposals

The [implementation specifications](../specifications/README.md) define compiler
semantics. The [task index](../tasks/README.md) defines executable work. Use these
proposals to review phase scope and gates.

## Review order

Review these documents in sequence. Each phase ends with a gate that blocks the
next phase. A gate requires code, tests, and measured results.

| Phase | Proposal                                                               | Review decision                                                                     |
| ----- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 0     | [Expressiveness contract](00-expressiveness-contract.md)               | Does the playground define the right mandatory language surface?                    |
| 1     | [Syntax data and reader](01-syntax-data-reader.md)                     | Does the lossless token-tree model support matching, hygiene, and tooling?          |
| 2     | [Declarative pattern language](02-declarative-pattern-language.md)     | Can patterns describe the playground forms without procedural parsing?              |
| 3     | [Templates and hygiene](03-templates-hygiene.md)                       | Do templates introduce and reference bindings with predictable scope?               |
| 4     | [Contextual parsing and expansion](04-contextual-expansion.md)         | Can syntax classes consume TypeScript fragments and compose with macros?            |
| 5     | [Declarative composition](05-declarative-composition.md)               | Can users define syntax classes, recursive macros, operators, and generated macros? |
| 6     | [TypeScript project integration](06-typescript-integration.md)         | Does a full project type-check and emit through the official compiler?              |
| 7     | [Tooling, performance, and release](07-tooling-performance-release.md) | Does the system meet the diagnostic, editor, cache, and performance bar?            |

## Governing constraint

The public declarative layer must express the syntactic changes in
`/Users/jimmyhmiller/Documents/Code/PlayGround/sweetjs`.

Procedural code may implement the compiler and built-in syntax consumers. A
playground feature fails the acceptance gate if a macro author must call a token
cursor, construct syntax objects through compiler APIs, or run arbitrary code at
expansion time.

## Development rule

Build one vertical example at a time. Add the smallest semantic feature that
supports the next example, then test its general behavior apart from that
example. This order prevents special cases from becoming the macro language.

Recommended example order:

1. threading;
2. `do` notation;
3. implicit return;
4. ADT declarations and matching;
5. protocols and implementations;
6. multi-part methods and generated macros;
7. keyword replacement and custom operators;
8. the combined language examples.

## Required output from each phase

- a versioned specification section;
- implementation with no undocumented semantics;
- positive, negative, hygiene, and malformed-input tests;
- expansion goldens and TypeScript validation where applicable;
- benchmark delta;
- decision record for each unresolved choice that affects later phases.
