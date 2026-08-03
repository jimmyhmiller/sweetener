# Phase 2 Proposal: Declarative Pattern Language

## Decision requested

Approve a compiled pattern language with literals, typed captures, alternatives,
sequences, separators, repetition, and user-defined syntax classes. Reject a
public token-iterator API as the mechanism for expressing the playground.

## Outcome

Macro authors can describe the shapes in `threading`, `do`, `data`, `protocol`,
and `methods`. Phase 2 matches token-tree classes. Phase 4 adds TypeScript grammar
classes such as `expr` and `type` through the same interface.

## Proposed concepts

### Rules

```ts
syntax thread:expr {
  rule { ($value:expr, $first:call, $($rest:call),*) } => { ... }
  rule { ($value:expr) } => { $value }
}
```

The first complete rule wins. The compiler diagnoses duplicate rules and
alternatives that a prior rule subsumes when it can prove that relation.

### Pattern variables

`$name:Class` invokes a syntax class and binds its result. A class returns named
fields, so a surrounding rule uses `$binding.name` and `$binding.value`. This
replaces Sweet.js forms such as `$b$x` with field access that remains readable at
nested repetition depths.

### User-defined syntax classes

```ts
syntax class Bind {
  fields { name: binding; value: expr; }
  rule { $name:binding <- $value:expr; }
  rule { $name:binding <- $value:expr }
}
```

A syntax class contains ordered declarative rules. It may call other syntax
classes. It returns captures declared in `fields`; all alternatives must populate
the same required fields.

### Repetition

The pattern language needs zero-or-more, one-or-more, optional, and separated
forms. Each capture retains its repetition dimensions. A template that repeats
two captures at one depth requires equal lengths unless the author asks for a
cartesian product through a named combinator.

### Refinements

Finite declarative refinements replace common procedural checks:

```ts
$name:ident(where spelling startsUpper)
$token:token(where kind in [PlusToken, MinusToken])
$form:expr(where followedBy SemicolonToken)
```

The first release should expose a fixed predicate vocabulary. Macro modules
cannot run JavaScript predicates.

## Matcher architecture

Compile source patterns into an automaton or bytecode. The runtime matcher
receives a syntax cursor, category, environment epoch, and limit budget. It
returns a structured capture tree or a ranked failure.

Memoize failed `(instruction, cursor, environment)` states. Require repetition
bodies to consume input. Reject left-recursive syntax classes at definition time
unless a later parser-specific protocol handles them.

## Step-by-step work

1. Specify pattern literals, variables, grouping, and rule ordering.
2. Implement token and token-tree built-in classes.
3. Add alternatives and optional patterns.
4. Add repetition with explicit separators and progress checks.
5. Define the nested capture data model and field access.
6. Add user-defined syntax classes with declared result fields.
7. Compile patterns into matcher IR and validate them at definition time.
8. Add checkpoints, failure memoization, and ranked expectations.
9. Implement fixed identifier and token refinements needed by `adt` and `ideas`.
10. Translate the structural portions of each playground macro into the proposed
    notation and record gaps for phase 4.

## Tests

- `bind`, `bindAll`, and `method` syntax classes;
- nested constructor/argument repetition from `data`;
- multi-part method repetition with several argument-list sizes;
- optional semicolon alternatives;
- empty, singleton, and nested repetitions;
- mismatched repetition cardinality at definition time;
- zero-width repetition rejection;
- ambiguous and farthest-failure diagnostics;
- adversarial patterns under time and step limits.

## Exit gate

The declarative matcher recognizes the token-tree structure of each playground
form. Test macros contain no procedural matcher. Phase 2 may use placeholder
consumers for `expr`, `stmt`, `binding`, and other TypeScript classes, but every
placeholder has a named phase 4 requirement.

## Review questions

1. Do you prefer `$binding.name` over the Sweet.js `$binding$name` spelling?
2. Should rule order settle all overlap, or should the compiler reject overlaps
   unless the author marks one rule as a fallback?
3. Should the language expose fixed refinements, declarative parser combinators,
   or both?
