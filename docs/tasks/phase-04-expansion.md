# Phase 4 Tasks: Contextual Expansion

## Goal

Combine environments, matching, templates, and syntax consumers into a working
macro expander. Finish with declarative `do` notation as the vertical slice.

### EXP-001 Implement expansion environments

Prerequisites: HYG-002

Implement phase/category bindings, persistent operator tables, lexical child
environments, epochs, and definition-context IDs.

### EXP-002 Implement definition contexts

Prerequisites: EXP-001, MCL-001

Process macro declarations and runtime binding skeletons in source order. Remove
compile-time definitions from output. Delay generated definitions until Phase 5.

### ENF-001 Define syntax-consumer infrastructure

Prerequisites: EXP-001, PAT-006

Implement consumer registry, consume context, stop sets, protected syntax,
failure types, cancellation, and budget charging.

### ENF-002 Implement primary and call expressions

Prerequisites: ENF-001, RDR-004

Consume identifiers, literals, groups, arrays, objects, member access, calls,
optional chains, and templates. Return precedence metadata.

### ENF-003 Implement Pratt expression parsing

Prerequisites: ENF-002

Add TypeScript prefix/postfix/infix tables, binding powers, associativity,
conditional and assignment expressions, macro-operator hooks, and parenthesis
requirements.

### EXP-003 Implement macro invocation

Prerequisites: PAT-005, TPL-004, EXP-002, ENF-001

Implement rule attempts, cursor restoration, capture contexts, template
instantiation, recursive result expansion, diagnostics, and trace records.

### EXP-004 Add progress and resource checks

Prerequisites: EXP-003

Implement expansion fingerprints, invocation-stack detection, output-token
limits, depth limits, cancellation, and partial-result rejection for caches.

### ENF-004 Implement statements and items

Prerequisites: ENF-003, EXP-003

Consume blocks, declarations, control flow, expression statements, terminators,
macro items, and sequential definition contexts.

### ENF-005 Implement bindings and parameters

Prerequisites: ENF-004

Consume identifier and destructuring bindings. Return binding skeletons for
hygiene registration.

### ENF-006 Implement type and class-element consumers

Prerequisites: ENF-004

Implement TypeScript type extent, class members, decorators, generics, and macro
heads. Start `OPEN-EXP-001` experiments for validation strategy.

### ENF-007 Implement statement-prefix/final-expression class

Prerequisites: ENF-004

Provide the declarative composition required by implicit-return functions.
Respect explicit return statements and semicolon boundaries.

### EXP-005 Add core shadowing

Prerequisites: EXP-003, ENF-004

Implement explicit `shadows core`, configuration checks, lexical visibility, and
trace entries for intercepted forms.

### EXP-006 Complete the `do` vertical slice

Prerequisites: HYG-005, ENF-005, EXP-004

Implement `Bind`/`BindAll`, recursive `do`, destructuring, sequential bindings,
final expressions, malformed clauses, TypeScript output, binding graph, trace,
runtime tests, and inferred-type tests.

## Phase exit

- `do`, threading, implicit return, and basic operators use public declarative
  definitions.
- Syntax consumers agree with selected TypeScript differential fixtures.
- Recursive expansion terminates or produces a structured limit/cycle error.
- Generated TypeScript parses under the supported compiler.
