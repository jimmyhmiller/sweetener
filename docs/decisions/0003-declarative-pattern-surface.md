# ADR-0003: Declarative Pattern Surface

Status: accepted  
Date: 2026-08-02  
Owners: Jimmy Miller

## Decision

Adopt grouped repetition with `$()` and the suffixes `*`, `+`, and `?`.
Separators appear between the group and suffix, as in `$($item:expr),*`.

Use dot notation for fields exported by user syntax classes, such as
`$clause.name` and `$clause.source`.

Require authors to mark an ordered catch-all rule with `fallback rule`. Require
identifier literals that compare by binding identity to appear in a `literal`
declaration. Use explicit refinements or binder markers for case-sensitive ADT
patterns; identifier capitalization alone cannot introduce a binding.

## Context

Threading requires separated repetition. Do notation and protocols require
fields from reusable syntax classes. The core-rewrite case distinguishes the
global `NaN` binding from a local identifier with the same spelling. ADT patterns
must distinguish constructor references from new binders.

Sweet.js ellipses make nested dimensions hard to see in templates. An implicit
fallback policy also hides rule-order changes during maintenance.

## Options measured

### Grouped repetition

The twelve contracts use one notation for separators and nested dimensions.
The pattern compiler can assign one cardinality group per syntactic repetition.

### Sweet.js postfix ellipses

This spelling shortens flat cases. Nested constructor fields and mixfix method
segments require more context to show which variables share a dimension.

### Field concatenation

Legacy Sweet.js accesses fields with forms such as `$step$name`. Dot notation
matches the structured capture model and gives the definition parser one
unambiguous field boundary.

### Implicit final fallback

Source-order matching already controls ordinary rules. A marker documents the
author's intent when one rule accepts the residual shape of earlier rules.

## Consequences

- Pattern and template parsers share one repetition grammar.
- The compiler rejects a fallback-shaped rule without the marker and rejects a
  marked rule that cannot act as a fallback.
- Syntax-class fields become named capture paths in IR and diagnostics.
- Binding-identity literals resolve during definition compilation.
- ADT libraries must choose an explicit binder marker or a declared lowercase
  refinement before the public syntax freezes.

## Reversal condition

Revisit a spelling if parser prototypes for all twelve contracts expose an
ambiguity or if user testing shows that authors misread nested capture depth.
