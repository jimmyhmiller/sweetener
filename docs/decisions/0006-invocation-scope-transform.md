# ADR-0006: Macro Invocation Scope Transform

Status: accepted  
Date: 2026-08-02  
Owners: Jimmy Miller

## Decision

Allocate one introduction scope `I` and one use-site scope `U` for each macro
invocation.

Before a transformer runs, add `U` and `I` to invocation input. Flip `I` on the
transformer result. Syntax copied from the input loses `I` and retains `U`.
Syntax created by the transformer gains `I` and carries its definition scopes;
it does not gain `U`.

The declarative template engine applies the equivalent direct operations:

- captured syntax receives `U` and keeps its call-site scopes;
- template syntax receives `I` and keeps its definition-site scopes.

Generated declarations and generated references receive the same introduction
scope. The binding walker adds their lexical binding scope to the declaration
and its region. Captured call-site syntax lacks those scopes and cannot resolve
to the generated binding.

## Context

`OPEN-HYG-001` left local and generated macro definitions without an exact
use-site rule. HYG-003 needs one rule that supports declarative templates and a
future internal transformer interface while preserving scope-set resolution.

The executable model lives in
`packages/hygiene/test/invocation-scopes.test.ts`. It checks copied captures,
definition-site references, captured local macros, generated declarations, and
nested invocations.

## Options measured

### Introduction flip plus use-site scope

The model adds `U` and `I` before transformation and flips `I` afterward.
Copied input retains call-site identity through `U`. Introduced declarations
and references share `I`, while captured input cannot acquire their binding.
Nested invocations allocate distinct pairs and preserve outer use-site scopes.

### Direct tagging without a transformer boundary

Adding `U` to captures and `I` to template syntax produces the same result for
declarative macros. It does not define how a future internal transformer can
return a mixture of copied and constructed syntax. The implementation uses
direct tagging inside declarative template instantiation and treats the flip
model as its semantic definition.

### Introduction scope without use-site scope

This option distinguishes introduced syntax from input syntax. It cannot mark
the invocation region shared by a captured local macro declaration and its
captured uses. The executable local-macro case requires `U`.

## Consequences

- The expander allocates two scopes per invocation.
- Matcher-visible input carries `U` and `I`; final captures carry `U`.
- Template literals use definition scopes plus `I`.
- Binding contracts add lexical scopes after the invocation transform.
- Explicit call-site and definition-site operations must state which of `U` and
  `I` they retain or remove.
- Trace records can show the prepare and flip steps as separate events.

## Reversal condition

Revisit this rule if a local or generated macro fixture requires a binding that
the model cannot express, or if compatibility tests against Racket-style scope
sets show a different resolution result for the same scope graph.
