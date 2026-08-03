# Phase 3 Proposal: Templates and Hygiene

## Decision requested

Approve declarative binding annotations as part of macro definitions. Scope-set
hygiene protects generated TypeScript, while binding annotations tell the
expander how new surface forms bind captured names before TypeScript sees them.

## Outcome

Templates can copy captures, repeat structures, generate identifiers, invoke
macros, and introduce TypeScript bindings. The expander preserves call-site and
definition-site references without relying on printed-name guesses.

## Playground requirements

- `do` turns the left side of `<-` into a callback parameter whose scope covers
  the remaining clauses.
- `match` turns lowercase pattern identifiers into bindings scoped over a branch
  body.
- `data` introduces constructor declarations visible after the declaration.
- `protocol` introduces a protocol value and method implementation parameters.
- `method` generates a syntax binding from a captured method name.
- `curry` constructs an identifier from input spelling and expects it to refer to
  the intended parameter.

Text templates alone cannot describe the scope of `do` or `match` input. The
macro definition needs a binding contract.

## Proposed binding clauses

```ts
syntax class Bind {
  fields { name: binding; value: expr; }
  rule { $name:binding <- $value:expr; }
}

syntax do:expr {
  rule {
    { $step:Bind $($rest:tt)* }
  }
  binds $step.name in $rest
  => {
    $step.value.then(($step.name) => do { $($rest)* })
  }
}
```

The exact placement remains open. The semantics must state:

- which capture supplies the binding;
- which captured or generated region receives the binding scope;
- the binding space and phase;
- whether the form permits recursion or temporal use before declaration.

Built-in TypeScript templates such as arrow parameters also carry known binding
semantics. A template binding introduced through ordinary TypeScript syntax can
use those semantics without a redundant clause. Binding clauses cover
relationships among input captures before template expansion.

## Hygiene model

1. Each identifier syntax object carries spelling and an interned scope set.
2. Each binding receives a fresh binding identity.
3. The expander adds a fresh introduction scope to template syntax.
4. Captures retain call-site scopes during substitution.
5. Binding clauses add lexical scopes to their declared regions.
6. Resolution uses spelling, scope set, phase, and syntax category.
7. The printer assigns readable collision-free names after expansion.

The trace records scope introduction, binding creation, identifier resolution,
deliberate capture, and printed renaming.

## Declarative template operations

The playground needs a finite set:

- capture substitution and nested repetition;
- conditional template branches based on matched alternatives;
- stable syntax-to-text conversion;
- repeated-capture cardinality as generated numeric syntax with
  `#count($capture)`;
- fresh identifiers with a spelling hint;
- repetition index or fold support for positional access;
- call-site and definition-site identifier construction;
- deliberate capture with a warning and trace entry.
- explicit `#trim($capture)` normalization to one inline leading space for
  ASI-sensitive splices, while ordinary capture substitution remains lossless.

Template folds should operate on capture sequences through declarative clauses.
They must not expose arrays of compiler syntax objects.

## Step-by-step work

1. Specify scope sets, bindings, resolution, and phases with executable examples.
2. Implement template parsing and capture substitution.
3. Add template repetition with depth and cardinality checks.
4. Implement introduction scopes and definition-site resolution.
5. Model TypeScript binding forms needed by emitted templates.
6. Add macro binding clauses for captured regions.
7. Implement fresh, text, call-site, and capture operations.
8. Add deterministic generated-name printing.
9. Produce expansion traces with origin and hygiene events.
10. Port `do`, `data`, `match`, `protocol`, and `method` hygiene scenarios into
    focused tests.

## Exit gate

The hygiene test suite proves binding identity before printing. Alpha-renaming
input programs preserves expansion behavior. The declarative versions of `do`,
`match`, and `method` can state their binding behavior without procedural code.

## Review questions

1. Should binding clauses sit beside each rule or live in reusable syntax-class
   declarations?
2. Should deliberate capture require a compiler option in addition to visible
   template syntax?
3. Which stable syntax-to-text conversions belong in the safe declarative core?
