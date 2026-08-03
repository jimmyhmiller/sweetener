# Phase 0 Proposal: Expressiveness Contract

## Decision requested

Approve the playground as a mandatory capability suite for the public
declarative macro language. The project may revise concrete punctuation, but it
must preserve each form's expressive power.

## Findings from the playground

### Reusable syntax classes

`do-notation.sweet.js` defines `bind` and `bindAll`. `protocol.sweet.js` defines
a `method` class. Each class has multiple patterns and exposes named fields to
the enclosing macro. The `do` macro refers to fields such as `$b$x` and `$b$y`.

Required feature: users can define a named pattern abstraction with alternatives,
typed fields, and exported captures. A syntax class can consume a multi-token
form and return a structured record.

### Context-sensitive extent

The examples match `$y:expr` in `x <- pure(2);`, the final expression of a `do`
block, function bodies with an implicit final expression, and infix operands.
The matcher must find an expression boundary without requiring parentheses.

Required feature: syntax classes consume one host-language form in a named
context and preserve its grouping when templates move it.

### Recursive declarative rewriting

`do`, `thread`, `->`, and `->>` peel one clause from a sequence and invoke
themselves on the remainder. Their base rules terminate expansion.

Required feature: declarative macros can invoke themselves or another macro in a
template. The expander detects cycles that make no progress and reports the
invocation chain.

### Correlated and nested repetition

`data` correlates constructor names with each constructor's argument list.
`protocol` repeats method names and argument lists. `methods.sweet.js` nests
repeated method segments and their repeated arguments.

Required feature: repetition preserves nesting depth and zips captures at the
same depth. Templates can address fields within a repeated syntax-class result.

### New binding forms

`do` binds names from `<-`. `data` introduces constructors. `match` binds pattern
variables. `protocol`, `module`, `class`, and `method` introduce declarations or
methods.

Required feature: a declarative macro can state which captures introduce
bindings, which region contains their scope, and which template references use
those bindings. Hygiene cannot infer all of this from emitted TypeScript text
after expansion.

### Macro-generated macros

`methods.sweet.js` expands a `method` declaration into a macro named after the
first method segment. That generated macro recognizes the remaining segments.

Required feature: templates can generate syntax bindings. Expansion registers
them at the correct phase, category, and lexical scope before subsequent uses.

### Core-form and keyword replacement

The playground binds macros named `function`, `var`, `typeof`, `if`, `class`,
and arithmetic or equality operators. These forms change built-in behavior or
reinterpret existing spelling in a lexical scope.

Required feature: macro lookup can take precedence over a built-in parser form
when a lexical syntax binding exists. Users must opt into such shadowing, and
the expansion trace must identify it.

### Punctuation and operator forms

The examples define `->`, `<-`, `::`, `:::`, `|>`, `|>>`, `==`, `+`, `-`, `#`,
`:`, and `@`. Some act as prefix forms, while others consume a left operand.

Required feature: macro heads can use identifier or punctuation spellings.
Operators declare fixity, precedence, and associativity. Pattern rules still
describe their full syntax.

### Multi-part names and mixfix syntax

`checkif(val) isbetween(low) and(high)` and
`iff(pred) then(trueCase) elses(falseCase)` use several named segments. The first
segment determines the macro binding; later segments remain literals in its
pattern.

Required feature: patterns can describe mixfix forms and consume newline-spanning
segments. The system does not need a separate hard-coded mixfix feature if
ordinary declarative patterns handle this case.

### Compile-time token computation

`to_str` converts syntax into a string, and the ADT matcher inspects identifier
case to distinguish a binding from a constructor. These examples use procedural
Sweet.js APIs because the old declarative layer lacked the required operations.

Required declarative replacements:

- `#text($syntax)` or a constrained template conversion for stable token text;
- identifier predicates or syntax-class refinements;
- syntax-class alternatives that distinguish constructor and binding patterns;
- numeric indices supplied by repetition metadata when a template needs them.

The public system should add finite declarative operations instead of exposing
arbitrary expansion-time JavaScript.

## Capability matrix

| Example        | Mandatory declarative capabilities                                                  |
| -------------- | ----------------------------------------------------------------------------------- |
| `threading`    | recursion, expression captures, separated repetition                                |
| `do-notation`  | user syntax classes, exported fields, binding declarations, recursion               |
| `implicit`     | statement sequence plus final-expression recognition, core-form shadowing           |
| `adt`          | declaration macros, nested repetition, generated names, pattern bindings, recursion |
| `protocol`     | reusable method syntax, correlated repetition, infix declaration form               |
| `methods`      | mixfix patterns, nested captures, generated local macro                             |
| `csp`          | infix/postfix-like forms, binding introduction, contextual `yield` output           |
| `ideas`        | punctuation heads, custom operators, keyword shadowing, decorator-like prefix form  |
| `newlang`      | cooperating macros, core-form replacement, member dispatch syntax                   |
| rewritten `if` | grammar interception and block inspection through declarative patterns              |

## Phase 0 tasks

1. Copy each example into a read-only `fixtures/legacy/` corpus with provenance.
2. Write a normalized intent file for each example: accepted input, expected
   TypeScript output, runtime behavior, inferred types, and expected failures.
3. Separate accidental Sweet.js limitations from intended syntax. For example,
   record whether semicolons belong to the `do` grammar or served as parser aids.
4. Rewrite each macro in the proposed declarative notation on paper. Mark every
   place where the notation lacks a feature.
5. Build a capability ledger that maps each pattern construct to its consumers.
6. Rank examples by implementation dependency and select one acceptance example
   for each later phase.
7. Freeze the phase gates in the proposal index after review.

## Deliverables

- `fixtures/legacy/` with the original sources;
- `fixtures/acceptance/` with TypeScript-targeted forms;
- one intent and expected-expansion file per example;
- declarative rewrites that contain no procedural escape;
- capability ledger and syntax questions requiring review.

## Exit gate

Phase 0 ends after you approve the intended syntax and expansion of each example.
Each example must have a plausible declarative definition. Any missing construct
becomes an explicit requirement in phases 2 through 5.

## Review questions

1. Should core forms such as `function`, `if`, and `class` support lexical
   replacement, or should users choose new names in TypeScript projects?
2. Should the new system preserve Sweet.js ellipsis notation, adopt grouped
   repetition such as `$($x),*`, or support a cleaner third form?
3. Do you want custom punctuation such as `#` and `@` in ordinary TypeScript
   lexical space, despite conflicts with future TypeScript syntax?
4. Which examples express current goals, and which record experiments that the
   new system can postpone?
