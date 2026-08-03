# Phase 5 Proposal: Declarative Composition

## Decision requested

Approve local syntax bindings, generated macros, recursive definitions, and
custom operators as declarative language features. These capabilities complete
the playground expressiveness contract.

## Outcome

Macro libraries can build cooperating syntactic layers such as ADTs plus pattern
matching, protocols plus implementations, or multi-part method declarations plus
their invocation syntax. Authors remain inside the pattern/template language.

## Feature set

### Recursive macros

`rec syntax` makes a macro visible in its own templates. The expander tracks input
progress and expansion ancestry. It rejects a recurrence that reaches the same
macro, cursor state, and structural input hash without consuming or changing
syntax.

### Local macros

A macro definition can appear within a block or generated definition context.
Its binding starts according to explicit declaration semantics and ends with the
lexical region. The compiler removes the definition from runtime output.

### Generated macros

A template can emit a declarative syntax definition whose name comes from a
capture. The expander processes generated definitions before subsequent forms in
the same definition context. This supports `method checkif(...) ...` producing a
`checkif` invocation macro.

Generated macros cannot splice arbitrary matcher IR. Their template must contain
a valid macro definition that passes the same definition-time checks as source
macros.

### Operators

An operator declaration binds punctuation or an identifier with category,
fixity, precedence, and associativity. Its rules use the declarative matcher.

```ts
operator (<-):stmt infix precedence 20 associativity none {
  rule { $name:binding <- $source:expr; } binds $name in following => { ... }
}
```

Precedence belongs to a lexical binding. Import conflicts require qualification
or an explicit selection.

### Mixfix forms

Ordinary macro patterns describe later literal segments:

```ts
syntax checkif:expr {
  rule {
    ($value:expr) isbetween($low:expr) and($high:expr)
  } => {
    $value > $low && $value < $high
  }
}
```

The macro system needs no separate registry of segment names. Pattern literals
and syntax-class extent determine the form.

### Declarative folds

ADT matching may need to fold constructor fields into nested tests or bindings.
Add constrained template folds:

```ts
#fold($fields, init: $body) { ($acc, $field, $index) => ... }
```

The fold body remains a syntax template. It can access captures, the accumulator,
and an integer index. It cannot execute user JavaScript.

## Step-by-step work

1. Add recursive macro bindings and progress detection.
2. Implement sequential definition contexts and local macro visibility.
3. Allow templates to generate checked declarative macro definitions.
4. Add fixity, precedence, and associativity to syntax bindings.
5. Implement punctuation-head resolution and import conflict diagnostics.
6. Validate mixfix patterns across newlines and nested calls.
7. Add declarative template folds and repetition indices.
8. Port `data` and `match` together.
9. Port `protocol` and `implements` together.
10. Port multi-part `method`, custom operators, and the combined `newlang`
    examples.
11. Build negative tests for recursive cycles, operator conflicts, generated
    definition errors, and scope leaks.

## Exit gate

Each accepted playground syntactic change has a declarative definition. None
imports compiler helpers or runs expansion-time JavaScript. Generated macros obey
lexical scope and phase rules. Operator precedence tests cover composition with
TypeScript operators and other macro operators.

## Review questions

1. Should generated macros ship in the first release or remain behind an
   experimental flag after the core examples prove the semantics?
2. Should precedence use numbers, named bands, or relations such as `tighterThan`?
3. Does a declarative fold provide enough compile-time computation for the ADT
   examples, or should the language add a broader pure expression sublanguage?
