# Phase 4 Proposal: Contextual Parsing and Expansion

## Decision requested

Approve a fixed set of TypeScript syntax classes backed by context consumers and
enforestation. Macro authors invoke these classes through patterns; compiler code
implements their parsers.

## Outcome

Patterns can consume complete expressions, statements, types, bindings, items,
class elements, parameter lists, and JSX children. Macros and operators can
participate while a consumer determines the extent of one form.

## Mandatory classes

| Class             | Playground use                                                   |
| ----------------- | ---------------------------------------------------------------- |
| `expr`            | operands, final `do` result, guards, initializers, branch bodies |
| `stmt`            | implicit-return body prefixes and generated control flow         |
| `stmt* then expr` | function bodies whose final form becomes a return value          |
| `binding`         | `do`, parameters, match patterns, destructuring                  |
| `item`            | `data`, `protocol`, `module`, generated declarations             |
| `classElement`    | class/member extensions                                          |
| `call`            | threading steps and multi-part method segments                   |
| `type`            | new TypeScript-targeted macro examples                           |
| `jsxChild`        | TypeScript completeness, even though the legacy corpus lacks JSX |

User-defined syntax classes compose these built-ins. Users cannot replace their
implementation in version 1.

## Extent protocol

Each consumer receives a cursor, stop set, precedence floor, expansion
environment, category, and resource budget. It returns protected syntax plus the
remaining cursor. Protected syntax retains token children and grouping metadata.

The expression consumer uses a Pratt/enforestation core:

1. resolve a prefix macro or built-in prefix form;
2. consume its left term;
3. inspect postfix and infix candidates in the current environment;
4. compare precedence and associativity;
5. expand a macro when expansion affects the next parse decision;
6. stop at the caller's boundary.

Consumers for statements, types, and bindings need their own stopping rules.
They may validate bounded fragments through the TypeScript parser behind the
common interface.

## Core-form shadowing

Lexical syntax bindings can intercept a built-in form such as `function`, `if`,
`var`, or `typeof`. The environment lookup runs before built-in dispatch for an
explicitly shadowing macro binding. A normal macro declaration cannot shadow a
core form by accident.

Suggested declaration:

```ts
syntax function:expr shadows core { ... }
```

The compiler reports the shadowing declaration, its scope, and each intercepted
use in the expansion trace.

## Step-by-step work

1. Define `SyntaxConsumer` and protected-syntax contracts.
2. Implement identifiers, literals, delimiters, calls, and member access.
3. Implement prefix and infix expression enforestation with TypeScript's operator
   table.
4. Add macro lookup and expansion during expression consumption.
5. Implement statement and source-item consumers.
6. Add binding and parameter consumers with destructuring.
7. Add type and class-element consumers.
8. Add `stmt* then expr` composition for implicit return.
9. Implement core-form shadowing with explicit declarations.
10. Add bounded TypeScript validation and compare accepted fragments against the
    supported compiler version.
11. Expand `threading`, `do`, `implicit`, `csp`, and operator fixtures.
12. Fuzz stopping rules, precedence, nested macros, TSX, and malformed input.

## Exit gate

Declarative `threading`, `do`, and implicit-return macros expand without extra
parentheses or procedural parsing. Built-in and macro operators preserve expected
grouping. The TypeScript parser accepts successful output. Failed matches point
to the macro rule and expected syntax class instead of a later generated-file
error.

## Risks under review

- TypeScript type and TSX grammar can pull consumers toward a parser fork.
- Macro expansion can change the token sequence that determines extent.
- Core shadowing can confuse editors before expansion.

Phase 4 must publish parser-coverage measurements and list grammar areas handled
through TypeScript validation instead of custom parsing.
